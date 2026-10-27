import { describe, expect, it } from "vitest";
import { paymentSignature, verifyPaymentSignature } from "../../src/payment/payment-signature.js";

describe("payment callback signatures", () => {
  it("creates stable HMAC signatures regardless of object key order", () => {
    const secret = "secret";
    const left = paymentSignature({ orderNo: "pay_1", amount: 20, paid: true }, secret);
    const right = paymentSignature({ paid: true, amount: 20, orderNo: "pay_1" }, secret);

    expect(left).toBe(right);
    expect(verifyPaymentSignature({ payload: { orderNo: "pay_1", amount: 20, paid: true }, signature: left, secret })).toBe(true);
  });

  it("rejects invalid signatures", () => {
    expect(
      verifyPaymentSignature({
        payload: { orderNo: "pay_1" },
        signature: "0".repeat(64),
        secret: "secret"
      })
    ).toBe(false);
  });

  it("rejects noncanonical hex instead of silently truncating it", () => {
    const payload = { orderNo: "pay_1" }, secret = "secret";
    const signature = paymentSignature(payload, secret);
    for (const bad of [signature + "garbage", signature + "00", signature.slice(0, -1), " " + signature]) {
      expect(verifyPaymentSignature({ payload, signature: bad, secret })).toBe(false);
    }
  });

  it("includes own prototype-named JSON keys in signed data", () => {
    expect(paymentSignature(JSON.parse('{"__proto__":{"paid":true}}'), "secret"))
      .not.toBe(paymentSignature({}, "secret"));
  });
});
