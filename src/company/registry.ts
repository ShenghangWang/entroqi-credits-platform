import definitions from './applications.json' with { type: 'json' };
import type { Database } from '../db/pool.js';
import type { ServiceCredential } from '../private-api.js';
import { ConflictError, NotFoundError } from '../domain/errors.js';

export const COMPANY_ISSUER = 'entroqi-company-v1';
export const companyApplications = definitions;
export interface CompanyApplication extends Record<string, unknown> {
  application: string; name: string; issuer: string; productKey: string; catalogId: string | null;
  accessKey: string; basePath: string; priceProductCode: string; status: string;
}
export class CompanyRegistry {
  constructor(private readonly db: Database) {}
  async applications(scopes: readonly string[]) {
    if (!scopes.length) return [];
    const placeholders = scopes.map((_, index) => '$' + (index + 1)).join(',');
    const result = await this.db.query<CompanyApplication>(`select p.application_code application,a.name,p.issuer,p.product_key productKey,p.catalog_id catalogId,p.access_key accessKey,p.base_path basePath,p.price_product_code priceProductCode,a.status
      from company_application_products p join applications a on a.code=p.application_code
      where p.application_code in (${placeholders}) order by p.application_code`, [...scopes]);
    for (const row of result.rows) {
      const expected = definitions.find(item => item.application === row.application);
      if (!expected || row.issuer !== COMPANY_ISSUER || Object.keys(expected).some(key => key !== 'name' && row[key] !== expected[key as keyof typeof expected])) throw new ConflictError('Company product registry requires a reviewed migration');
    }
    return result.rows;
  }
  async application(application: string) {
    const row = (await this.applications([application]))[0];
    if (!row || row.status !== 'active') throw new NotFoundError('Company application is not registered');
    return { schemaVersion: 1, ...row, commerceEnabled: false, paidAccessEnabled: false };
  }
  async validateCredentials(credentials: ServiceCredential[]) {
    const company = credentials.filter(item => item.identityMode === 'company' && item.issuer === COMPANY_ISSUER && item.application !== 'company-identity');
    for (const credential of company) await this.application(credential.application);
  }
  async customers(scopes: readonly string[], after = 0) {
    const placeholders = scopes.map((_, index) => '$' + (index + 3)).join(',');
    const result = await this.db.query<{ customerId: number; accountId: number; total: string; reserved: string; available: string; currency: string; status: string }>(`select distinct e.user_id customerId,e.account_id accountId,w.total_balance total,w.locked_balance reserved,w.available_balance available,w.currency,u.status
      from customer_external_identities e join credit_accounts w on w.id=e.account_id join users u on u.id=e.user_id
      where e.issuer=$1 and e.user_id>$2 and exists (select 1 from customer_application_memberships m where m.issuer=e.issuer and m.subject=e.subject and m.application in (${placeholders}))
      order by e.user_id limit 51`, [COMPANY_ISSUER, after, ...scopes]);
    const page = result.rows.slice(0, 50);
    const customers = await Promise.all(page.map(async row => {
      const memberships = await this.db.query<{ application: string; status: string }>(`select m.application,m.status from customer_application_memberships m join customer_external_identities e on e.issuer=m.issuer and e.subject=m.subject
        where e.issuer=$1 and e.user_id=$2 and m.application in (${placeholders}) order by m.application`, [COMPANY_ISSUER, row.customerId, ...scopes]);
      return { ...row, memberships: memberships.rows };
    }));
    return { customers, nextAfter: result.rows.length > 50 ? Number(page.at(-1)!.customerId) : null };
  }
  async transactions(scopes: readonly string[], before = Number.MAX_SAFE_INTEGER) {
    const placeholders = scopes.map((_, index) => '$' + (index + 3)).join(',');
    const result = await this.db.query<{ id: number; application: string; customerId: number; type: string; points: string; balanceAfter: string; createdAt: Date }>(`select t.id,a.code application,t.user_id customerId,t.txn_type type,t.points,t.balance_after balanceAfter,t.created_at createdAt
      from credit_transactions t join applications a on a.id=t.application_id
      join customer_external_identities e on e.user_id=t.user_id
      where e.issuer=$1 and t.id<$2 and a.code in (${placeholders}) order by t.id desc limit 51`, [COMPANY_ISSUER, before, ...scopes]);
    const page = result.rows.slice(0, 50);
    return { transactions: page, nextBefore: result.rows.length > 50 ? Number(page.at(-1)!.id) : null };
  }
}
