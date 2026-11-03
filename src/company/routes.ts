import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '../db/pool.js';
import type { ServiceCredential } from '../private-api.js';
import { DomainError } from '../domain/errors.js';
import { SubscriptionCatalog } from '../pricing/subscription-catalog.js';
import { CompanyRegistry, COMPANY_ISSUER } from './registry.js';
import { registerBackOfficeRoutes } from '../back-office/routes.js';

import { parsePlatformOperators, type PlatformOperator } from '../back-office/operators.js';
import { createOperatorSource } from '../back-office/operator-source.js';
export { parsePlatformOperators, type PlatformOperator } from '../back-office/operators.js';
const digest = (text: string) => createHash('sha256').update(text).digest();
function bearer<T extends { token: string }>(request: FastifyRequest, entries: T[]) {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header)) return undefined;
  return entries.find(entry => timingSafeEqual(digest(entry.token), digest(header.slice(7))));
}
export async function registerCompanyRoutes(app: FastifyInstance, db: Database, credentials: ServiceCredential[], supplied: PlatformOperator[], operatorFile?: string, reservedTokens: string[] = []) {
  const source = createOperatorSource(parsePlatformOperators(JSON.stringify(supplied)), operatorFile, [...credentials.map(item => item.token), ...reservedTokens]);
  const operators = await source.read();
  const registry = new CompanyRegistry(db), catalog = new SubscriptionCatalog(db);
  const execute = async (operation: () => unknown, reply: import('fastify').FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    try { return await operation(); }
    catch (error) {
      if (error instanceof DomainError) return reply.code(error.code === 'not_found' ? 404 : 409).send({ error: error.code });
      return reply.code(503).send({ error: 'company_registry_unavailable' });
    }
  };
  app.get('/v1/application', { onRequest: async (request, reply) => {
    const caller = bearer(request, credentials);
    if (!caller) return reply.code(401).send({ error: 'unauthorized' });
    if (!caller.permissions.includes('catalog') || caller.identityMode !== 'company' || caller.issuer !== COMPANY_ISSUER) return reply.code(403).send({ error: 'forbidden' });
    if (Object.keys(request.query as object).length) return reply.code(400).send({ error: 'bad_request' });
  } }, (request, reply) => execute(() => registry.application(bearer(request, credentials)!.application), reply));
  if (!operators.length) return;
  await registerBackOfficeRoutes(app, db, source);
  const verified = new WeakMap<FastifyRequest, PlatformOperator>();
  app.get<{ Querystring: { section?: string; cursor?: string } }>('/v1/platform/data', { onRequest: async (request, reply) => {
    let current: PlatformOperator[];
    try { current = await source.read(); } catch { return reply.code(503).send({ error: 'staff_credentials_unavailable' }); }
    const operator = bearer(request, current);
    if (!operator) return reply.code(401).send({ error: 'unauthorized' });
    verified.set(request, operator);
    if (operator.role === 'agent') return reply.code(403).send({ error: 'Use the scoped agent back-office session' });
    if (Object.keys(request.query).some(key => !['section', 'cursor'].includes(key)) ||
      !['overview', 'customers', 'transactions', 'prices'].includes(request.query.section ?? 'overview') ||
      request.query.cursor !== undefined && (!/^\d{1,16}$/.test(request.query.cursor) || !Number.isSafeInteger(Number(request.query.cursor)))) return reply.code(400).send({ error: 'bad_request' });
  } }, (request, reply) => execute(async () => {
    const caller = verified.get(request)!, section = request.query.section ?? 'overview';
    const applications = await registry.applications(caller.applications);
    const scopes = applications.map(item => item.application);
    if (!scopes.length) return { section, applications: [], customers: [], transactions: [], nextAfter: null, nextBefore: null, commerceEnabled: false };
    if (section === 'customers') return { section, ...(await registry.customers(scopes, Number(request.query.cursor ?? 0))), commerceEnabled: false };
    if (section === 'transactions') return { section, ...(await registry.transactions(scopes, Number(request.query.cursor ?? Number.MAX_SAFE_INTEGER))), commerceEnabled: false };
    const products = await Promise.all(applications.map(async row => {
      const history = await catalog.history(row.priceProductCode);
      const offers=await catalog.offers(row.priceProductCode);
      return { ...row, serviceConfigured: credentials.some(credential => credential.application === row.application && credential.issuer === row.issuer && credential.identityMode === 'company' && credential.permissions.includes('provision') && credential.permissions.includes('balance')),
        priceStatus: offers.plans.length ? 'reference_only' : history.plans.some(plan=>plan.history.versions.length) ? 'draft_only' : 'unpriced', referencePrice: null,plans:offers.plans,
        priceRevisions: history.plans.reduce((sum,plan)=>sum+plan.history.revision,0), commerceEnabled: false, paidAccessEnabled: false };
    }));
    return { schemaVersion: 1, section, issuer: COMPANY_ISSUER, applications: products, commerceEnabled: false, paidAccessEnabled: false };
  }, reply));
}
