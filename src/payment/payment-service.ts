import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import type { AppEnv } from "../config/env.js";
import type { Database, DatabaseClient } from "../db/pool.js";
import {
  AccountResolver,
  BadRequestError,
  BalanceService,
  ConflictError,
  CreditLedgerService,
  IdempotencyService,
  NotFoundError
} from "../domain/index.js";
import { requestHash } from "../http/request-hash.js";
import { verifyPaymentSignature } from "./payment-signature.js";
import {
  AlipayProvider,
  type ProviderQuery,
  WechatPayProvider
} from "./payment-providers.js";

type AccountScope = "personal" | "tenant";
type PaymentChannel = "alipay" | "wechat" | "card";
type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
type ProviderStatus = "paid" | "failed";
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const disabledPaymentEnv: NonNullable<AppEnv["payment"]> = {
  publicBaseUrl: "",
  alipay: {
    environment: "sandbox",
    appId: "",
    sellerId: "",
    privateKeyPath: "",
    publicKeyPath: ""
  },
  wechat: {
    appId: "",
    mchId: "",
    merchantSerialNo: "",
    apiV3Key: "",
    apiV3KeyPath: "",
    privateKeyPath: "",
    platformPublicKeyPath: "",
    notifyUrl: "",
    apiBaseUrl: "https://api.mch.weixin.qq.com"
  }
};

type RechargeProductRow = {
  id: string;
  name: string;
  amount: string;
  points: string;
  bonus_points: string;
  currency: string;
  sort: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

type PaymentOrderRow = {
  id: string;
  tenant_id: string | null;
  user_id: string;
  account_id: string;
  product_id: string;
  order_no: string;
  amount: string;
  points: string;
  bonus_points: string;
  pay_channel: PaymentChannel;
  status: PaymentStatus;
  paid_at: Date | null;
  notify_id: string | null;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CreatePaymentOrderInput = {
  userId: number;
  accountScope: AccountScope;
  tenantId?: number;
  productId: number;
  payChannel: PaymentChannel;
  idempotencyKey: string;
  requestHash: string;
};

export type PaymentCallbackInput = {
  channel: PaymentChannel;
  orderNo: string;
  notifyId?: string | undefined;
  providerStatus: ProviderStatus;
  rawData: JsonObject;
  sign: string;
  idempotencyKey?: string | undefined;
  requestHash: string;
};

export type RechargeProductResponse = JsonObject & {
  id: number;
  name: string;
  amount: string;
  points: string;
  bonusPoints: string;
  currency: string;
  sort: number;
  enabled: boolean;
};

export type PaymentOrderResponse = JsonObject & {
  paymentOrderId: number;
  tenantId: number | null;
  userId: number;
  accountId: number;
  productId: number;
  orderNo: string;
  amount: string;
  points: string;
  bonusPoints: string;
  payChannel: PaymentChannel;
  status: PaymentStatus;
  paidAt: string | null;
  notifyId: string | null;
  payUrl?: string | null;
  qrCodeUrl?: string | null;
  idempotentReplay: boolean;
};

export type PaymentCallbackResponse = PaymentOrderResponse & {
  callbackRecorded: boolean;
  credited: boolean;
};

function optionalNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function mapProduct(row: RechargeProductRow): RechargeProductResponse {
  return {
    id: Number(row.id),
    name: row.name,
    amount: row.amount,
    points: row.points,
    bonusPoints: row.bonus_points,
    currency: row.currency,
    sort: row.sort,
    enabled: row.enabled
  };
}

function mapOrder(row: PaymentOrderRow, idempotentReplay = false): PaymentOrderResponse {
  return {
    paymentOrderId: Number(row.id),
    tenantId: optionalNumber(row.tenant_id),
    userId: Number(row.user_id),
    accountId: Number(row.account_id),
    productId: Number(row.product_id),
    orderNo: row.order_no,
    amount: row.amount,
    points: row.points,
    bonusPoints: row.bonus_points,
    payChannel: row.pay_channel,
    status: row.status,
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
    notifyId: row.notify_id,
    idempotentReplay
  };
}

function replayResponse(responseBody: unknown): JsonObject {
  if (responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)) {
    return {
      ...(responseBody as JsonObject),
      idempotentReplay: true
    };
  }

  return {
    idempotentReplay: true
  };
}

export class PaymentService {
  private readonly balanceService: BalanceService;
  private readonly alipay: AlipayProvider;
  private readonly wechat: WechatPayProvider;
  private readonly paymentEnv: NonNullable<AppEnv["payment"]>;

  constructor(
    private readonly db: Database,
    private readonly paymentCallbackSecret: string,
    private readonly env: AppEnv = {
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 3000,
      logLevel: "silent",
      mysql: {
        host: "127.0.0.1",
        port: 3306,
        database: "test",
        user: "test",
        password: "test",
        connectionLimit: 1
      },
      paymentCallbackSecret: "test",
      payment: {
        publicBaseUrl: "",
        alipay: {
          environment: "sandbox",
          appId: "",
          sellerId: "",
          privateKeyPath: "",
          publicKeyPath: ""
        },
        wechat: {
          appId: "",
          mchId: "",
          merchantSerialNo: "",
          apiV3Key: "",
          apiV3KeyPath: "",
          privateKeyPath: "",
          platformPublicKeyPath: "",
          notifyUrl: "",
          apiBaseUrl: "https://api.mch.weixin.qq.com"
        }
      }
    }
  ) {
    this.balanceService = new BalanceService(db);
    this.paymentEnv = env.payment ?? disabledPaymentEnv;
    this.alipay = new AlipayProvider(this.paymentEnv);
    this.wechat = new WechatPayProvider(this.paymentEnv);
  }

  async listRechargeProducts(): Promise<{ products: RechargeProductResponse[] }> {
    const result = await this.db.query<RechargeProductRow>(
      `
        select id, name, amount, points, bonus_points, currency, sort, enabled,
               created_at, updated_at
        from recharge_products
        where enabled = true
        order by sort asc, id asc
      `
    );

    return {
      products: result.rows.map((row) => mapProduct(row))
    };
  }

  async createPaymentOrder(input: CreatePaymentOrderInput): Promise<JsonObject> {
    return this.executeIdempotent(
      {
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash
      },
      async (client) => {
        const accountResolver = new AccountResolver(client);
        const account =
          input.accountScope === "tenant"
            ? await accountResolver.resolveTenantAccount(input.userId, requiredTenantId(input.tenantId))
            : await accountResolver.resolvePersonalAccount(input.userId);
        const product = await this.getEnabledProduct(client, input.productId);
        const order = await this.insertPaymentOrder(client, {
          tenantId: account.tenantId,
          userId: input.userId,
          accountId: account.id,
          productId: product.id,
          orderNo: `pay_${randomUUID().replace(/-/g, "").slice(0, 28)}`,
          amount: product.amount,
          points: product.points,
          bonusPoints: product.bonusPoints,
          payChannel: input.payChannel,
          idempotencyKey: input.idempotencyKey
        });

        if (input.payChannel === "card") return mapOrder(order);
        const provider =
          input.payChannel === "alipay" ? this.alipay : this.wechat;
        const payment = await provider.create({
          orderNo: order.order_no,
          amount: order.amount,
          subject: `${product.name}积分充值`
        });
        if (!payment.payUrl) {
          throw new BadRequestError(`${input.payChannel} did not return a payment URL`);
        }
        return {
          ...mapOrder(order),
          payUrl: payment.payUrl,
          qrCodeUrl: await QRCode.toDataURL(payment.payUrl, {
            width: 320,
            margin: 1,
            errorCorrectionLevel: "M"
          })
        };
      }
    );
  }

  async getPaymentOrder(orderId: number, userId: number): Promise<PaymentOrderResponse> {
    const result = await this.db.query<PaymentOrderRow>(
      `
        select id, tenant_id, user_id, account_id, product_id, order_no, amount,
               points, bonus_points, pay_channel, status, paid_at, notify_id,
               idempotency_key, created_at, updated_at
        from payment_orders
        where id = $1
          and user_id = $2
        limit 1
      `,
      [orderId, userId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Payment order not found: ${orderId}`);
    }

    return mapOrder(row);
  }

  async processCallback(input: PaymentCallbackInput): Promise<JsonObject> {
    if (
      !verifyPaymentSignature({
        payload: input.rawData,
        signature: input.sign,
        secret: this.paymentCallbackSecret
      })
    ) {
      throw new BadRequestError("Invalid payment callback signature");
    }
    return this.processVerifiedCallback(input);
  }

  async processProviderResult(input: Omit<PaymentCallbackInput, "sign" | "requestHash">) {
    return this.processVerifiedCallback({
      ...input,
      sign: "provider-verified",
      requestHash: requestHash({
        channel: input.channel,
        orderNo: input.orderNo,
        notifyId: input.notifyId ?? null,
        providerStatus: input.providerStatus,
        rawData: input.rawData
      })
    });
  }

  async syncPaymentOrder(orderId: number, userId: number): Promise<PaymentOrderResponse> {
    const order = await this.getPaymentOrderRow(orderId, userId);
    if (order.status !== "pending" || order.pay_channel === "card") return mapOrder(order);
    const provider = order.pay_channel === "alipay" ? this.alipay : this.wechat;
    const result = await provider.query({
      orderNo: order.order_no,
      amount: order.amount,
      subject: "积分充值"
    });
    if (result.state === "pending") return mapOrder(order);
    return (await this.processProviderQuery(order, result)) as PaymentOrderResponse;
  }

  async handleAlipayNotification(params: Record<string, string>) {
    if (!this.alipay.verifyNotification(params)) {
      throw new BadRequestError("Invalid Alipay notification signature");
    }
    if (params.app_id !== this.paymentEnv.alipay.appId) {
      throw new BadRequestError("Alipay app_id mismatch");
    }
    if (
      this.paymentEnv.alipay.sellerId &&
      params.seller_id !== this.paymentEnv.alipay.sellerId
    ) {
      throw new BadRequestError("Alipay seller_id mismatch");
    }
    const order = await this.getOrderByOrderNo(params.out_trade_no ?? "");
    if (Number(params.total_amount) !== Number(order.amount)) {
      throw new BadRequestError("Alipay amount mismatch");
    }
    const tradeStatus = params.trade_status ?? "";
    if (!["TRADE_SUCCESS", "TRADE_FINISHED", "TRADE_CLOSED"].includes(tradeStatus)) {
      return mapOrder(order);
    }
    return this.processProviderResult({
      channel: "alipay",
      orderNo: order.order_no,
      notifyId: params.notify_id || params.trade_no,
      providerStatus:
        tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED"
          ? "paid"
          : "failed",
      rawData: params,
      idempotencyKey: `alipay_notify:${params.notify_id || params.trade_no || order.order_no}`
    });
  }

  async handleWechatNotification(
    headers: Record<string, string | undefined>,
    rawBody: string
  ) {
    if (!this.wechat.verifyNotification(headers, rawBody)) {
      throw new BadRequestError("Invalid Wechat Pay notification signature");
    }
    const body = JSON.parse(rawBody) as {
      id?: string;
      resource?: { ciphertext: string; nonce: string; associated_data?: string };
    };
    if (!body.resource) throw new BadRequestError("Wechat Pay notification resource is missing");
    const transaction = this.wechat.decryptNotification(body.resource);
    if (
      transaction.appid !== this.paymentEnv.wechat.appId ||
      transaction.mchid !== this.paymentEnv.wechat.mchId
    ) {
      throw new BadRequestError("Wechat Pay merchant identity mismatch");
    }
    const order = await this.getOrderByOrderNo(String(transaction.out_trade_no ?? ""));
    const amount = transaction.amount as { total?: number; currency?: string } | undefined;
    if (
      amount?.total !== Math.round(Number(order.amount) * 100) ||
      (amount.currency && amount.currency !== "CNY")
    ) {
      throw new BadRequestError("Wechat Pay amount mismatch");
    }
    const tradeState = String(transaction.trade_state ?? "");
    if (!["SUCCESS", "CLOSED", "REVOKED", "PAYERROR"].includes(tradeState)) {
      return mapOrder(order);
    }
    return this.processProviderResult({
      channel: "wechat",
      orderNo: order.order_no,
      notifyId: String(transaction.transaction_id ?? body.id ?? ""),
      providerStatus: tradeState === "SUCCESS" ? "paid" : "failed",
      rawData: Object.fromEntries(
        Object.entries(transaction).map(([key, value]) => [
          key,
          value === null ? null : typeof value === "object" ? JSON.stringify(value) : String(value)
        ])
      ),
      idempotencyKey: `wechat_notify:${body.id || transaction.transaction_id || order.order_no}`
    });
  }

  private async processProviderQuery(order: PaymentOrderRow, result: ProviderQuery) {
    return this.processProviderResult({
      channel: order.pay_channel,
      orderNo: order.order_no,
      notifyId: result.notifyId,
      providerStatus: result.state === "paid" ? "paid" : "failed",
      rawData: result.rawData,
      idempotencyKey: `payment_query:${order.pay_channel}:${order.order_no}:${result.state}`
    });
  }

  private async processVerifiedCallback(input: PaymentCallbackInput): Promise<JsonObject> {
    return this.db.withTransaction(async (client) => {
      const order = await this.getOrderByOrderNoForUpdate(client, input.orderNo);
      const idempotencyKey = `payment_callback:${input.channel}:${
        input.idempotencyKey ?? input.notifyId ?? input.orderNo
      }`;
      const idempotency = new IdempotencyService(client);
      const reservation = await idempotency.reserve({
        userId: Number(order.user_id),
        idempotencyKey,
        requestHash: input.requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      if (reservation.kind === "replay") {
        return replayResponse(reservation.responseBody);
      }

      if (reservation.kind === "in_progress") {
        throw new ConflictError("Payment callback is already processing");
      }

      await this.insertPaymentCallback(client, {
        paymentOrderId: Number(order.id),
        callbackType: input.channel,
        notifyId: input.notifyId ?? null,
        rawData: input.rawData,
        sign: input.sign,
        status: input.providerStatus
      });

      const response =
        input.providerStatus === "paid"
          ? await this.markOrderPaid(client, order, input.notifyId ?? null)
          : await this.markOrderFailed(client, order, input.notifyId ?? null);

      await idempotency.complete(reservation.id, response);
      return response;
    });
  }

  private async getPaymentOrderRow(orderId: number, userId: number): Promise<PaymentOrderRow> {
    const result = await this.db.query<PaymentOrderRow>(
      `
        select id, tenant_id, user_id, account_id, product_id, order_no, amount,
               points, bonus_points, pay_channel, status, paid_at, notify_id,
               idempotency_key, created_at, updated_at
        from payment_orders
        where id = $1 and user_id = $2
        limit 1
      `,
      [orderId, userId]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError(`Payment order not found: ${orderId}`);
    return row;
  }

  private async getOrderByOrderNo(orderNo: string): Promise<PaymentOrderRow> {
    const result = await this.db.query<PaymentOrderRow>(
      `
        select id, tenant_id, user_id, account_id, product_id, order_no, amount,
               points, bonus_points, pay_channel, status, paid_at, notify_id,
               idempotency_key, created_at, updated_at
        from payment_orders
        where order_no = $1
        limit 1
      `,
      [orderNo]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError(`Payment order not found: ${orderNo}`);
    return row;
  }

  callbackRequestHash(input: Omit<PaymentCallbackInput, "requestHash">): string {
    return requestHash({
      channel: input.channel,
      orderNo: input.orderNo,
      notifyId: input.notifyId ?? null,
      providerStatus: input.providerStatus,
      rawData: input.rawData
    });
  }

  private async executeIdempotent(
    input: { userId: number; idempotencyKey: string; requestHash: string },
    operation: (client: DatabaseClient) => Promise<JsonObject>
  ): Promise<JsonObject> {
    return this.db.withTransaction(async (client) => {
      const idempotency = new IdempotencyService(client);
      const reservation = await idempotency.reserve({
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      if (reservation.kind === "replay") {
        return replayResponse(reservation.responseBody);
      }

      if (reservation.kind === "in_progress") {
        throw new ConflictError("Idempotent operation is already processing");
      }

      const response = await operation(client);
      await idempotency.complete(reservation.id, response);
      return response;
    });
  }

  private async getEnabledProduct(
    client: DatabaseClient,
    productId: number
  ): Promise<RechargeProductResponse> {
    const result = await client.query<RechargeProductRow>(
      `
        select id, name, amount, points, bonus_points, currency, sort, enabled,
               created_at, updated_at
        from recharge_products
        where id = $1
          and enabled = true
        limit 1
      `,
      [productId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Enabled recharge product not found: ${productId}`);
    }

    return mapProduct(row);
  }

  private async insertPaymentOrder(
    client: DatabaseClient,
    input: {
      tenantId: number | null;
      userId: number;
      accountId: number;
      productId: number;
      orderNo: string;
      amount: string;
      points: string;
      bonusPoints: string;
      payChannel: PaymentChannel;
      idempotencyKey: string;
    }
  ): Promise<PaymentOrderRow> {
    const result = await client.query<PaymentOrderRow>(
      `
        insert into payment_orders (
          tenant_id, user_id, account_id, product_id, order_no, amount,
          points, bonus_points, pay_channel, status, idempotency_key
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
        returning id, tenant_id, user_id, account_id, product_id, order_no, amount,
                  points, bonus_points, pay_channel, status, paid_at, notify_id,
                  idempotency_key, created_at, updated_at
      `,
      [
        input.tenantId,
        input.userId,
        input.accountId,
        input.productId,
        input.orderNo,
        input.amount,
        input.points,
        input.bonusPoints,
        input.payChannel,
        input.idempotencyKey
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Payment order insert did not return a row");
    }

    return row;
  }

  private async getOrderByOrderNoForUpdate(
    client: DatabaseClient,
    orderNo: string
  ): Promise<PaymentOrderRow> {
    const result = await client.query<PaymentOrderRow>(
      `
        select id, tenant_id, user_id, account_id, product_id, order_no, amount,
               points, bonus_points, pay_channel, status, paid_at, notify_id,
               idempotency_key, created_at, updated_at
        from payment_orders
        where order_no = $1
        for update
      `,
      [orderNo]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Payment order not found: ${orderNo}`);
    }

    return row;
  }

  private async insertPaymentCallback(
    client: DatabaseClient,
    input: {
      paymentOrderId: number;
      callbackType: string;
      notifyId: string | null;
      rawData: JsonObject;
      sign: string;
      status: string;
    }
  ): Promise<void> {
    await client.query(
      `
        insert into payment_callbacks (
          payment_order_id, callback_type, notify_id, raw_data, sign, status
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        input.paymentOrderId,
        input.callbackType,
        input.notifyId,
        input.rawData,
        input.sign,
        input.status
      ]
    );
  }

  private async markOrderPaid(
    client: DatabaseClient,
    order: PaymentOrderRow,
    notifyId: string | null
  ): Promise<PaymentCallbackResponse> {
    if (order.status === "paid") {
      return {
        ...mapOrder(order),
        callbackRecorded: true,
        credited: false
      };
    }

    if (order.status !== "pending") {
      throw new ConflictError(`Payment order ${order.order_no} cannot transition to paid`);
    }

    const account = await this.balanceService.lockAccountForUpdate(Number(order.account_id), client);
    const rechargedAccount = await this.balanceService.increaseTotalBalance({
      account,
      points: order.points,
      client
    });

    const paidOrder = await this.updatePaymentOrderStatus(client, Number(order.id), {
      status: "paid",
      notifyId,
      setPaidAt: true
    });
    await new CreditLedgerService(client).createTransaction({
      tenantId: optionalNumber(order.tenant_id),
      userId: Number(order.user_id),
      accountId: Number(order.account_id),
      paymentOrderId: Number(order.id),
      txnType: "recharge",
      points: order.points,
      balanceBefore: account.totalBalance,
      balanceAfter: rechargedAccount.totalBalance,
      bizType: "payment_order",
      bizId: order.order_no,
      remark: "payment recharge"
    });

    if (Number(order.bonus_points) > 0) {
      const bonusAccount = await this.balanceService.increaseTotalBalance({
        account: rechargedAccount,
        points: order.bonus_points,
        client
      });
      await new CreditLedgerService(client).createTransaction({
        tenantId: optionalNumber(order.tenant_id),
        userId: Number(order.user_id),
        accountId: Number(order.account_id),
        paymentOrderId: Number(order.id),
        txnType: "bonus",
        points: order.bonus_points,
        balanceBefore: rechargedAccount.totalBalance,
        balanceAfter: bonusAccount.totalBalance,
        bizType: "payment_order",
        bizId: order.order_no,
        remark: "payment bonus"
      });
    }

    return {
      ...mapOrder(paidOrder),
      callbackRecorded: true,
      credited: true
    };
  }

  private async markOrderFailed(
    client: DatabaseClient,
    order: PaymentOrderRow,
    notifyId: string | null
  ): Promise<PaymentCallbackResponse> {
    if (order.status !== "pending") {
      return {
        ...mapOrder(order),
        callbackRecorded: true,
        credited: false
      };
    }

    const failedOrder = await this.updatePaymentOrderStatus(client, Number(order.id), {
      status: "failed",
      notifyId,
      setPaidAt: false
    });

    return {
      ...mapOrder(failedOrder),
      callbackRecorded: true,
      credited: false
    };
  }

  private async updatePaymentOrderStatus(
    client: DatabaseClient,
    orderId: number,
    input: {
      status: PaymentStatus;
      notifyId: string | null;
      setPaidAt: boolean;
    }
  ): Promise<PaymentOrderRow> {
    const result = await client.query<PaymentOrderRow>(
      `
        update payment_orders
        set status = $2,
            notify_id = coalesce($3, notify_id),
            paid_at = case when $4 then now() else paid_at end,
            updated_at = now()
        where id = $1
        returning id, tenant_id, user_id, account_id, product_id, order_no, amount,
                  points, bonus_points, pay_channel, status, paid_at, notify_id,
                  idempotency_key, created_at, updated_at
      `,
      [orderId, input.status, input.notifyId, input.setPaidAt]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Payment order not found while updating status: ${orderId}`);
    }

    return row;
  }
}

function requiredTenantId(tenantId: number | undefined): number {
  if (tenantId === undefined) {
    throw new BadRequestError("tenantId is required for tenant recharge");
  }

  return tenantId;
}
