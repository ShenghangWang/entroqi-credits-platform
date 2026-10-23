import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(moduleDir, "../..");
const repositoryRoot = path.resolve(serviceRoot, "../..");

dotenv.config({ path: path.join(repositoryRoot, "backend", ".env") });
dotenv.config({ path: path.join(serviceRoot, ".env"), override: true });

function resolveSecretPath(value: string | undefined): string {
  if (!value) return "";
  const normalized = value.replace(/^[/\\]+/, "");
  return path.resolve(repositoryRoot, normalized);
}

function paymentPublicBaseUrl(): string {
  const explicit = process.env.PAYMENT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
  try {
    if (publicBase && !["localhost", "127.0.0.1"].includes(new URL(publicBase).hostname)) {
      return publicBase;
    }
    if (process.env.WECHAT_PAY_NOTIFY_URL) {
      return new URL(process.env.WECHAT_PAY_NOTIFY_URL).origin;
    }
  } catch {
    return publicBase;
  }
  return publicBase;
}

export type AppEnv = {
  nodeEnv: string;
  host: string;
  port: number;
  logLevel: string;
  mysql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionLimit: number;
  };
  paymentCallbackSecret: string;
  payment?: {
    publicBaseUrl: string;
    alipay: {
      environment: "sandbox" | "production";
      appId: string;
      sellerId: string;
      privateKeyPath: string;
      publicKeyPath: string;
    };
    wechat: {
      appId: string;
      mchId: string;
      merchantSerialNo: string;
      apiV3Key: string;
      apiV3KeyPath: string;
      privateKeyPath: string;
      platformPublicKeyPath: string;
      notifyUrl: string;
      apiBaseUrl: string;
    };
  };
};

function readPort(value: string | undefined): number {
  if (!value) return 3000;

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric env value: ${value}`);
  }
  return parsed;
}

export function loadEnv(): AppEnv {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    host: process.env.HOST ?? "0.0.0.0",
    port: readPort(process.env.PORT),
    logLevel: process.env.LOG_LEVEL ?? "info",
    mysql: {
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port: readNumber(process.env.MYSQL_PORT, 3306),
      database: process.env.MYSQL_DATABASE ?? "credits_platform",
      user: process.env.MYSQL_USER ?? "credits",
      password: process.env.MYSQL_PASSWORD ?? "credits",
      connectionLimit: readNumber(process.env.MYSQL_CONNECTION_LIMIT, 10)
    },
    paymentCallbackSecret: process.env.PAYMENT_CALLBACK_SECRET ?? "local_dev_payment_secret",
    payment: {
      publicBaseUrl: paymentPublicBaseUrl(),
      alipay: {
        environment: process.env.ALIPAY_ENV === "production" ? "production" : "sandbox",
        appId: process.env.ALIPAY_APP_ID ?? "",
        sellerId: process.env.ALIPAY_SELLER_ID ?? "",
        privateKeyPath: resolveSecretPath(process.env.ALIPAY_PRIVATE_KEY_PATH),
        publicKeyPath: resolveSecretPath(process.env.ALIPAY_PUBLIC_KEY_PATH)
      },
      wechat: {
        appId: process.env.WECHAT_PAY_APP_ID ?? "",
        mchId: process.env.WECHAT_PAY_MCH_ID ?? "",
        merchantSerialNo: process.env.WECHAT_PAY_MERCHANT_SERIAL_NO ?? "",
        apiV3Key: process.env.WECHAT_PAY_API_V3_KEY ?? "",
        apiV3KeyPath: resolveSecretPath(process.env.WECHAT_PAY_API_V3_KEY_PATH),
        privateKeyPath: resolveSecretPath(process.env.WECHAT_PAY_PRIVATE_KEY_PATH),
        platformPublicKeyPath: resolveSecretPath(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH),
        notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL ?? "",
        apiBaseUrl: (process.env.WECHAT_PAY_API_BASE_URL ?? "https://api.mch.weixin.qq.com").replace(/\/$/, "")
      }
    }
  };
}
