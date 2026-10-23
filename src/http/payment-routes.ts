import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../config/env.js";
import type { Database } from "../db/pool.js";
import { BadRequestError } from "../domain/index.js";
import { PaymentService } from "../payment/payment-service.js";
import { requestHash } from "./request-hash.js";

type RegisterPaymentRoutesOptions = {
  db: Database;
  env: AppEnv;
};

type CreatePaymentOrderBody = {
  userId: number;
  accountScope: "personal" | "tenant";
  tenantId?: number;
  productId: number;
  payChannel: "alipay" | "wechat" | "card";
  idempotencyKey: string;
};

type PaymentCallbackBody = {
  orderNo: string;
  notifyId?: string;
  providerStatus: "paid" | "failed";
  rawData: { [key: string]: string | number | boolean | null };
  sign: string;
  idempotencyKey?: string;
};

type IdParam = {
  id: string;
};

type ChannelParam = {
  channel: "alipay" | "wechat" | "card";
};

type UserQuery = {
  userId?: string;
};

const paymentOrderResponseSchema = {
  type: "object",
  required: [
    "paymentOrderId",
    "tenantId",
    "userId",
    "accountId",
    "productId",
    "orderNo",
    "amount",
    "points",
    "bonusPoints",
    "payChannel",
    "status",
    "paidAt",
    "notifyId",
    "idempotentReplay"
  ],
  properties: {
    paymentOrderId: { type: "number" },
    tenantId: { type: ["number", "null"] },
    userId: { type: "number" },
    accountId: { type: "number" },
    productId: { type: "number" },
    orderNo: { type: "string" },
    amount: { type: "string" },
    points: { type: "string" },
    bonusPoints: { type: "string" },
    payChannel: { type: "string", enum: ["alipay", "wechat", "card"] },
    status: { type: "string", enum: ["pending", "paid", "failed", "refunded"] },
    paidAt: { type: ["string", "null"] },
    notifyId: { type: ["string", "null"] },
    payUrl: { type: ["string", "null"] },
    qrCodeUrl: { type: ["string", "null"] },
    idempotentReplay: { type: "boolean" }
  }
};

function parseRequiredNumber(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError(`${name} must be a positive integer`);
  }

  return parsed;
}

export function registerPaymentRoutes(
  app: FastifyInstance,
  options: RegisterPaymentRoutesOptions
): void {
  const payment = new PaymentService(options.db, options.env.paymentCallbackSecret, options.env);

  app.get(
    "/recharge-products",
    {
      schema: {
        tags: ["payments"],
        response: {
          200: {
            type: "object",
            required: ["products"],
            properties: {
              products: {
                type: "array",
                items: {
                  type: "object",
                  required: [
                    "id",
                    "name",
                    "amount",
                    "points",
                    "bonusPoints",
                    "currency",
                    "sort",
                    "enabled"
                  ],
                  properties: {
                    id: { type: "number" },
                    name: { type: "string" },
                    amount: { type: "string" },
                    points: { type: "string" },
                    bonusPoints: { type: "string" },
                    currency: { type: "string" },
                    sort: { type: "number" },
                    enabled: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    async () => payment.listRechargeProducts()
  );

  app.post<{ Body: CreatePaymentOrderBody }>(
    "/payment-orders",
    {
      schema: {
        tags: ["payments"],
        body: {
          type: "object",
          required: ["userId", "accountScope", "productId", "payChannel", "idempotencyKey"],
          additionalProperties: false,
          properties: {
            userId: { type: "number" },
            accountScope: { type: "string", enum: ["personal", "tenant"] },
            tenantId: { type: "number" },
            productId: { type: "number" },
            payChannel: { type: "string", enum: ["alipay", "wechat", "card"] },
            idempotencyKey: { type: "string", minLength: 1 }
          }
        },
        response: {
          200: paymentOrderResponseSchema
        }
      }
    },
    async (request) =>
      payment.createPaymentOrder({
        ...request.body,
        requestHash: requestHash(request.body)
      })
  );

  app.post<{ Params: ChannelParam; Body: PaymentCallbackBody }>(
    "/payment-callbacks/:channel",
    {
      schema: {
        tags: ["payments"],
        params: {
          type: "object",
          required: ["channel"],
          properties: {
            channel: { type: "string", enum: ["alipay", "wechat", "card"] }
          }
        },
        body: {
          type: "object",
          required: ["orderNo", "providerStatus", "rawData", "sign"],
          additionalProperties: false,
          properties: {
            orderNo: { type: "string", minLength: 1 },
            notifyId: { type: "string" },
            providerStatus: { type: "string", enum: ["paid", "failed"] },
            rawData: {
              type: "object",
              additionalProperties: {
                anyOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "boolean" },
                  { type: "null" }
                ]
              }
            },
            sign: { type: "string", minLength: 1 },
            idempotencyKey: { type: "string" }
          }
        },
        response: {
          200: {
            allOf: [
              paymentOrderResponseSchema,
              {
                type: "object",
                required: ["callbackRecorded", "credited"],
                properties: {
                  callbackRecorded: { type: "boolean" },
                  credited: { type: "boolean" }
                }
              }
            ]
          }
        }
      }
    },
    async (request) =>
      payment.processCallback({
        channel: request.params.channel,
        ...request.body,
        requestHash: payment.callbackRequestHash({
          channel: request.params.channel,
          ...request.body
        })
      })
  );

  app.get<{ Params: IdParam; Querystring: UserQuery }>(
    "/payment-orders/:id",
    {
      schema: {
        tags: ["payments"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" }
          }
        },
        querystring: {
          type: "object",
          required: ["userId"],
          properties: {
            userId: { type: "string" }
          }
        },
        response: {
          200: paymentOrderResponseSchema
        }
      }
    },
    async (request) =>
      payment.getPaymentOrder(
        parseRequiredNumber(request.params.id, "id"),
        parseRequiredNumber(request.query.userId, "userId")
      )
  );

  app.get<{ Params: IdParam; Querystring: UserQuery }>(
    "/payment-orders/:id/sync",
    {
      schema: {
        tags: ["payments"],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } }
        },
        querystring: {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "string" } }
        },
        response: { 200: paymentOrderResponseSchema }
      }
    },
    async (request) =>
      payment.syncPaymentOrder(
        parseRequiredNumber(request.params.id, "id"),
        parseRequiredNumber(request.query.userId, "userId")
      )
  );

  app.post<{ Body: Record<string, string> }>(
    "/api/v1/alipay/notify",
    { schema: { hide: true } },
    async (request, reply) => {
      try {
        await payment.handleAlipayNotification(request.body);
        return reply.type("text/plain").send("success");
      } catch (error) {
        request.log.error({ error }, "Alipay notification failed");
        return reply.code(400).type("text/plain").send("failure");
      }
    }
  );

  app.post<{ Body: Record<string, unknown> }>(
    "/api/v1/wechatpay/notify",
    { schema: { hide: true } },
    async (request, reply) => {
      try {
        await payment.handleWechatNotification(
          {
            "wechatpay-timestamp": request.headers["wechatpay-timestamp"] as string | undefined,
            "wechatpay-nonce": request.headers["wechatpay-nonce"] as string | undefined,
            "wechatpay-signature": request.headers["wechatpay-signature"] as string | undefined,
            "wechatpay-serial": request.headers["wechatpay-serial"] as string | undefined
          },
          request.rawBody ?? JSON.stringify(request.body)
        );
        return reply.send({ code: "SUCCESS", message: "成功" });
      } catch (error) {
        request.log.error({ error }, "Wechat Pay notification failed");
        return reply.code(400).send({ code: "FAIL", message: "失败" });
      }
    }
  );
}
