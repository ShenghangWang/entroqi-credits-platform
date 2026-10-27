import { randomUUID } from "node:crypto";
import type { Database, DatabaseClient } from "../db/pool.js";
import { BadRequestError, ConflictError, NotFoundError } from "../domain/errors.js";
import { requestHash } from "../http/request-hash.js";
import { moneyMinorUnits } from "../payment/money.js";
import { calculateCostScenario, reviewCostScenario, type CostScenario } from "./cost-calculator.js";

export interface DraftPrice {
  productCode: string; label: string; billingType: "one_time" | "monthly" | "usage"; unit: string;
  price: string; expectedRevision: number; scenario: CostScenario; validUntil: number; evidenceNote: string;
}
interface ProductRow extends Record<string, unknown> { revision: number; published_price_id: string | null; billing_type: string }
interface VersionRow extends Record<string, unknown> { id: string; product_code: string; revision: number; payload: string | DraftPrice }
const json = <T>(value: string | T): T => typeof value === "string" ? JSON.parse(value) as T : value;
const code = (value: string) => /^[a-z0-9-]{1,48}:[a-z0-9-]{1,80}$/.test(value);
export const pricingApplication = (productCode: string) => productCode.split(":")[0]!;
export class PricingCatalog {
  constructor(private db: Database, private now: () => number = Date.now) {}
  private async replay(client: DatabaseClient, actor: string, key: string, hash: string) {
    await client.query("insert into pricing_actions (actor_id,idempotency_key,request_hash,response) values ($1,$2,$3,NULL) on duplicate key update actor_id=actor_id", [actor, key, hash]);
    const result = await client.query<{ request_hash: string; response: string | Record<string, unknown> | null }>("select request_hash,response from pricing_actions where actor_id=$1 and idempotency_key=$2 for update", [actor, key]);
    if (!result.rows[0]) throw new Error("Missing pricing action lock");
    if (result.rows[0].request_hash !== hash) throw new ConflictError("Idempotency key belongs to a different pricing action");
    return result.rows[0].response === null ? null : json(result.rows[0].response);
  }
  private identity(actor: string, key: string) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(actor) || !/^[a-f0-9-]{36}$/.test(key)) throw new BadRequestError("Invalid operator/action identity");
  }
  async createDraft(actor: string, key: string, input: DraftPrice) {
    this.identity(actor, key);
    if (!input || Object.keys(input).some(k => !["productCode", "label", "billingType", "unit", "price", "expectedRevision", "scenario", "validUntil", "evidenceNote"].includes(k)) ||
        !code(input.productCode) || !["one_time", "monthly", "usage"].includes(input.billingType) || typeof input.label !== "string" || !input.label.trim() || input.label.length > 160 ||
        typeof input.unit !== "string" || !input.unit.trim() || input.unit.length > 80 || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
        !Number.isSafeInteger(input.validUntil) || input.validUntil < 0 || input.validUntil > this.now() + 366 * 86400000 ||
        typeof input.evidenceNote !== "string" || input.evidenceNote.trim().length < 10 || input.evidenceNote.length > 2000) throw new BadRequestError("Invalid price revision or cost evidence");
    const amount = moneyMinorUnits(input.price);
    if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestError("Price is outside the supported exact-money range");
    calculateCostScenario(input.scenario);
    if (moneyMinorUnits(input.scenario.retailPrice) !== amount) throw new BadRequestError("Calculator retail price must match the saved price");
    const hash = requestHash({ action: "draft", input });
    return this.db.withTransaction(async client => {
      const previous = await this.replay(client, actor, key, hash); if (previous) return previous;
      if (input.validUntil <= this.now()) throw new BadRequestError("Cost evidence has expired");
      // Product row serialization protects both first-create and later revisions.
      await client.query("insert into pricing_products (product_code,billing_type) values ($1,$2) on duplicate key update product_code=product_code", [input.productCode, input.billingType]);
      const product = (await client.query<ProductRow>("select revision,published_price_id,billing_type from pricing_products where product_code=$1 for update", [input.productCode])).rows[0]!;
      if (Number(product.revision) !== input.expectedRevision) throw new ConflictError("Price history changed; refresh before saving");
      if (product.billing_type !== input.billingType) throw new ConflictError("Create a separate product to change its billing type");
      const revision = Number(product.revision) + 1, id = randomUUID();
      await client.query("insert into pricing_versions (id,product_code,revision,payload,created_by) values ($1,$2,$3,$4,$5)", [id, input.productCode, revision, input, actor]);
      await client.query("update pricing_products set revision=$1 where product_code=$2", [revision, input.productCode]);
      const response = { productCode: input.productCode, priceVersionId: id, revision, published: false };
      await client.query("update pricing_actions set response=$1 where actor_id=$2 and idempotency_key=$3", [response, actor, key]);
      return response;
    });
  }
  async publish(actor: string, key: string, productCode: string, priceVersionId: string, expectedPublishedId: string | null, note: string) {
    this.identity(actor, key);
    if (!code(productCode) || !/^[a-f0-9-]{36}$/.test(priceVersionId) || expectedPublishedId !== null && !/^[a-f0-9-]{36}$/.test(expectedPublishedId) || typeof note !== "string" || note.trim().length < 5 || note.length > 1000) throw new BadRequestError("Invalid publication confirmation");
    const hash = requestHash({ action: "publish", productCode, priceVersionId, expectedPublishedId, note });
    return this.db.withTransaction(async client => {
      const previous = await this.replay(client, actor, key, hash); if (previous) return previous;
      const product = (await client.query<ProductRow>("select revision,published_price_id,billing_type from pricing_products where product_code=$1 for update", [productCode])).rows[0];
      if (!product) throw new NotFoundError("Product not found");
      if (product.published_price_id !== expectedPublishedId) throw new ConflictError("Published price changed; review the current price first");
      const version = (await client.query<VersionRow>("select id,product_code,revision,payload from pricing_versions where id=$1 and product_code=$2", [priceVersionId, productCode])).rows[0];
      if (!version) throw new NotFoundError("Price revision not found");
      const payload = json(version.payload), review = reviewCostScenario(payload.scenario, version.id, payload.validUntil, this.now());
      // A reference price can be published while sales remain closed. An actual
      // quote/order must also enforce current cost eligibility and paid gates.
      await client.query("update pricing_products set published_price_id=$1 where product_code=$2", [priceVersionId, productCode]);
      await client.query("insert into pricing_publications (product_code,price_version_id,previous_price_id,actor_id,note) values ($1,$2,$3,$4,$5)", [productCode, priceVersionId, expectedPublishedId, actor, note]);
      const response = { productCode, priceVersionId, revision: Number(version.revision), published: true, eligibleForSale: review.eligibleForSale, reviewRequired: review.reviewRequired, commerceEnabled: false };
      await client.query("update pricing_actions set response=$1 where actor_id=$2 and idempotency_key=$3", [response, actor, key]);
      return response;
    });
  }
  async history(productCode: string) {
    if (!code(productCode)) throw new BadRequestError("Invalid product code");
    const product = (await this.db.query<ProductRow>("select revision,published_price_id,billing_type from pricing_products where product_code=$1", [productCode])).rows[0];
    const versions = await this.db.query<VersionRow>("select id,product_code,revision,payload from pricing_versions where product_code=$1 order by revision desc limit 50", [productCode]);
    return { productCode, revision: Number(product?.revision ?? 0), publishedPriceId: product?.published_price_id ?? null,
      versions: versions.rows.map(row => { const payload = json(row.payload); return { priceVersionId: row.id, revision: Number(row.revision), ...payload,
        assessment: reviewCostScenario(payload.scenario, row.id, payload.validUntil, this.now()) }; }) };
  }
  async published(productCode: string) {
    if (!code(productCode)) throw new BadRequestError("Invalid product code");
    const result = await this.db.query<VersionRow>("select v.id,v.product_code,v.revision,v.payload from pricing_products p join pricing_versions v on v.id=p.published_price_id and v.product_code=p.product_code where p.product_code=$1", [productCode]);
    const row = result.rows[0]; if (!row) throw new NotFoundError("Published price unavailable");
    const payload = json(row.payload), assessment = reviewCostScenario(payload.scenario, row.id, payload.validUntil, this.now());
    return { schemaVersion: 1, productCode, priceVersionId: row.id, revision: Number(row.revision), label: payload.label, billingType: payload.billingType, unit: payload.unit,
      currency: "CNY", amountMinor: moneyMinorUnits(payload.price).toString(), eligibleForSale: assessment.eligibleForSale, commerceEnabled: false, validUntil: payload.validUntil };
  }
}
