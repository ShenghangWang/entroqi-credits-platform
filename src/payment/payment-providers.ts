import {
  createDecipheriv,
  createSign,
  createVerify,
  randomBytes
} from "node:crypto";
import { readFileSync } from "node:fs";
import type { AppEnv } from "../config/env.js";
import { BadRequestError } from "../domain/index.js";

type ProviderOrder = {
  orderNo: string;
  amount: string;
  subject: string;
};

export type ProviderPayment = {
  payUrl: string;
  providerTradeNo?: string | undefined;
};

export type ProviderQuery = {
  state: "pending" | "paid" | "failed";
  notifyId?: string | undefined;
  rawData: Record<string, string | number | boolean | null>;
};

function readSecret(pathname: string): string {
  if (!pathname) throw new BadRequestError("Payment secret path is not configured");
  return readFileSync(pathname, "utf8").trim();
}

function pem(value: string, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  if (value.includes("BEGIN ")) return value;
  const lines = value.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? value;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function amountCents(amount: string): number {
  return Math.round(Number(amount) * 100);
}

function alipaySignContent(input: Record<string, string>): string {
  return Object.keys(input)
    .filter((key) => input[key] !== "")
    .sort()
    .map((key) => `${key}=${input[key]}`)
    .join("&");
}

function signRsaSha256(content: string, privateKey: string): string {
  return createSign("RSA-SHA256").update(content, "utf8").sign(privateKey, "base64");
}

function verifyRsaSha256(content: string, signature: string, publicKey: string): boolean {
  return createVerify("RSA-SHA256")
    .update(content, "utf8")
    .verify(publicKey, signature, "base64");
}

export class AlipayProvider {
  constructor(private readonly env: NonNullable<AppEnv["payment"]>) {}

  isConfigured(): boolean {
    const config = this.env.alipay;
    return Boolean(config.appId && this.env.publicBaseUrl && config.privateKeyPath && config.publicKeyPath);
  }

  private gateway(): string {
    return this.env.alipay.environment === "production"
      ? "https://openapi.alipay.com/gateway.do"
      : "https://openapi-sandbox.dl.alipaydev.com/gateway.do";
  }

  private async request(method: string, bizContent: Record<string, unknown>) {
    if (!this.isConfigured()) throw new BadRequestError("Alipay is not configured");
    const params: Record<string, string> = {
      app_id: this.env.alipay.appId,
      method,
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }),
      version: "1.0",
      notify_url: `${this.env.publicBaseUrl}/api/v1/alipay/notify`,
      biz_content: JSON.stringify(bizContent)
    };
    params.sign = signRsaSha256(
      alipaySignContent(params),
      pem(readSecret(this.env.alipay.privateKeyPath), "PRIVATE KEY")
    );
    const response = await fetch(this.gateway(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(params)
    });
    const text = await response.text();
    if (!response.ok) throw new BadRequestError(`Alipay request failed: ${response.status} ${text}`);
    const body = JSON.parse(text) as Record<string, unknown>;
    const responseKey = `${method.replace(/\./g, "_")}_response`;
    const data = body[responseKey] as Record<string, unknown> | undefined;
    if (
      method === "alipay.trade.query" &&
      data?.sub_code === "ACQ.TRADE_NOT_EXIST"
    ) {
      return data;
    }
    if (!data || data.code !== "10000") {
      throw new BadRequestError(`Alipay rejected request: ${String(data?.sub_msg ?? data?.msg ?? text)}`);
    }
    return data;
  }

  async create(order: ProviderOrder): Promise<ProviderPayment> {
    const data = await this.request("alipay.trade.precreate", {
      out_trade_no: order.orderNo,
      total_amount: Number(order.amount).toFixed(2),
      subject: order.subject,
      timeout_express: "3m"
    });
    return {
      payUrl: String(data.qr_code ?? ""),
      providerTradeNo: data.trade_no ? String(data.trade_no) : undefined
    };
  }

  async query(order: ProviderOrder): Promise<ProviderQuery> {
    const data = await this.request("alipay.trade.query", { out_trade_no: order.orderNo });
    if (data.sub_code === "ACQ.TRADE_NOT_EXIST") {
      return {
        state: "pending",
        rawData: {
          code: String(data.code ?? ""),
          sub_code: String(data.sub_code),
          sub_msg: String(data.sub_msg ?? "")
        }
      };
    }
    const status = String(data.trade_status ?? "");
    return {
      state:
        status === "TRADE_SUCCESS" || status === "TRADE_FINISHED"
          ? "paid"
          : status === "TRADE_CLOSED"
            ? "failed"
            : "pending",
      notifyId: data.trade_no ? String(data.trade_no) : undefined,
      rawData: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value === null ? null : String(value)])
      )
    };
  }

  verifyNotification(params: Record<string, string>): boolean {
    const signature = params.sign ?? "";
    const content = alipaySignContent(
      Object.fromEntries(Object.entries(params).filter(([key]) => key !== "sign" && key !== "sign_type"))
    );
    return verifyRsaSha256(
      content,
      signature,
      pem(readSecret(this.env.alipay.publicKeyPath), "PUBLIC KEY")
    );
  }
}

function wechatAuthorization(
  method: string,
  pathWithQuery: string,
  body: string,
  config: NonNullable<AppEnv["payment"]>["wechat"]
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const message = `${method}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = signRsaSha256(message, pem(readSecret(config.privateKeyPath), "PRIVATE KEY"));
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.merchantSerialNo}"`;
}

export class WechatPayProvider {
  constructor(private readonly env: NonNullable<AppEnv["payment"]>) {}

  private apiV3Key(): string {
    const key = this.env.wechat.apiV3Key || readSecret(this.env.wechat.apiV3KeyPath);
    if (Buffer.byteLength(key, "utf8") !== 32) {
      throw new BadRequestError("WECHAT_PAY_API_V3_KEY must be exactly 32 bytes");
    }
    return key;
  }

  isConfigured(): boolean {
    const config = this.env.wechat;
    return Boolean(
      config.appId &&
        config.mchId &&
        config.merchantSerialNo &&
        config.privateKeyPath &&
        config.platformPublicKeyPath &&
        (config.apiV3Key || config.apiV3KeyPath) &&
        (config.notifyUrl || this.env.publicBaseUrl)
    );
  }

  private async request(method: "GET" | "POST", pathWithQuery: string, payload?: object) {
    if (!this.isConfigured()) throw new BadRequestError("Wechat Pay is not configured");
    const body = payload ? JSON.stringify(payload) : "";
    const init: RequestInit = {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: wechatAuthorization(method, pathWithQuery, body, this.env.wechat),
        "User-Agent": "used-car-platform-payments/1.0"
      }
    };
    if (body) init.body = body;
    const response = await fetch(`${this.env.wechat.apiBaseUrl}${pathWithQuery}`, init);
    const text = await response.text();
    if (!response.ok) throw new BadRequestError(`Wechat Pay request failed: ${response.status} ${text}`);
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  async create(order: ProviderOrder): Promise<ProviderPayment> {
    const now = Date.now();
    const data = await this.request("POST", "/v3/pay/transactions/native", {
      appid: this.env.wechat.appId,
      mchid: this.env.wechat.mchId,
      description: order.subject,
      out_trade_no: order.orderNo,
      notify_url:
        this.env.wechat.notifyUrl || `${this.env.publicBaseUrl}/api/v1/wechatpay/notify`,
      time_expire: new Date(now + 3 * 60 * 1000).toISOString(),
      amount: {
        total: amountCents(order.amount),
        currency: "CNY"
      }
    });
    return { payUrl: String(data.code_url ?? "") };
  }

  async query(order: ProviderOrder): Promise<ProviderQuery> {
    const pathWithQuery = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.orderNo)}?mchid=${encodeURIComponent(this.env.wechat.mchId)}`;
    const data = await this.request("GET", pathWithQuery);
    const state = String(data.trade_state ?? "");
    return {
      state:
        state === "SUCCESS"
          ? "paid"
          : ["CLOSED", "REVOKED", "PAYERROR"].includes(state)
            ? "failed"
            : "pending",
      notifyId: data.transaction_id ? String(data.transaction_id) : undefined,
      rawData: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          value === null ? null : typeof value === "object" ? JSON.stringify(value) : String(value)
        ])
      )
    };
  }

  verifyNotification(headers: Record<string, string | undefined>, rawBody: string): boolean {
    const timestamp = headers["wechatpay-timestamp"] ?? "";
    const nonce = headers["wechatpay-nonce"] ?? "";
    const signature = headers["wechatpay-signature"] ?? "";
    const serial = headers["wechatpay-serial"] ?? "";
    if (!timestamp || !nonce || !signature || !serial) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    return verifyRsaSha256(
      message,
      signature,
      pem(readSecret(this.env.wechat.platformPublicKeyPath), "PUBLIC KEY")
    );
  }

  decryptNotification(resource: {
    ciphertext: string;
    nonce: string;
    associated_data?: string;
  }): Record<string, unknown> {
    const encrypted = Buffer.from(resource.ciphertext, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(this.apiV3Key(), "utf8"),
      Buffer.from(resource.nonce, "utf8")
    );
    decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
    decipher.setAAD(Buffer.from(resource.associated_data ?? "", "utf8"));
    const plaintext = Buffer.concat([
      decipher.update(encrypted.subarray(0, encrypted.length - 16)),
      decipher.final()
    ]).toString("utf8");
    return JSON.parse(plaintext) as Record<string, unknown>;
  }
}
