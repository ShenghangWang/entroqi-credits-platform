import { describe, expect, it } from "vitest";
import { requestHash } from "../../src/http/request-hash.js";

describe("requestHash", () => {
  it("is stable across key order and excludes the idempotency key", () => {
    const first = requestHash({
      userId: 1,
      idempotencyKey: "key-a",
      billingTaskId: 2
    });
    const second = requestHash({
      billingTaskId: 2,
      idempotencyKey: "key-b",
      userId: 1
    });

    expect(first).toBe(second);
  });

  it("changes when the operation payload changes", () => {
    expect(requestHash({ userId: 1, billingTaskId: 2 })).not.toBe(
      requestHash({ userId: 1, billingTaskId: 3 })
    );
  });

  it("preserves prototype-named JSON fields and nested business idempotency keys", () => {
    expect(requestHash(JSON.parse('{"__proto__":{"amount":1}}'))).not.toBe(requestHash({}));
    expect(requestHash({ payload: { idempotencyKey: "one" } })).not.toBe(
      requestHash({ payload: { idempotencyKey: "two" } })
    );
    expect(requestHash(JSON.parse('{"constructor":1,"__proto__":2}'))).toBe(
      requestHash(JSON.parse('{"__proto__":2,"constructor":1}'))
    );
    expect(Object.prototype).not.toHaveProperty("amount");
  });
});
