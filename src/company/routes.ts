import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '../db/pool.js';
import type { ServiceCredential } from '../private-api.js';
import { DomainError } from '../domain/errors.js';
import { PricingCatalog } from '../pricing/catalog.js';
import { CompanyRegistry, companyApplications, COMPANY_ISSUER } from './registry.js';
import { platformHtml, platformScript } from './console.js';

export interface PlatformOperator { id: string; token: string; applications: string[] }
export function parsePlatformOperators(raw: string): PlatformOperator[] {
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error('Invalid platform operators JSON'); }
  if (!Array.isArray(input) || input.length > 16) throw new Error('Invalid platform operators');
  const ids = new Set<string>(), tokens = new Set<string>();
  for (const row of input as PlatformOperator[]) {
    if (!row || Object.keys(row).sort().join(',') !== 'applications,id,token' ||
      typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(row.id) || ids.has(row.id) ||
      typeof row.token !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(row.token) || tokens.has(row.token) ||
      !Array.isArray(row.applications) || !row.applications.length || new Set(row.applications).size !== row.applications.length ||
      row.applications.some(code => !companyApplications.some(app => app.application === code))) throw new Error('Invalid platform operator');
    ids.add(row.id); tokens.add(row.token);
  }
  return input as PlatformOperator[];
}
const digest = (text: string) => createHash('sha256').update(text).digest();
function bearer<T extends { token: string }>(request: FastifyRequest, entries: T[]) {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header)) return undefined;
  return entries.find(entry => timingSafeEqual(digest(entry.token), digest(header.slice(7))));
}
export function registerCompanyRoutes(app: FastifyInstance, db: Database, credentials: ServiceCredential[], supplied: PlatformOperator[]) {
  const operators = parsePlatformOperators(JSON.stringify(supplied));
  if (operators.some(operator => credentials.some(credential => credential.token === operator.token))) throw new Error('Platform operator credentials must be separate from application credentials');
  const registry = new CompanyRegistry(db), catalog = new PricingCatalog(db);
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
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
  app.get('/', (_request, reply) => reply.redirect('/v1/platform'));
  app.get('/back-office', (_request, reply) => reply.redirect('/v1/platform'));
  app.get('/v1/platform', (_request, reply) => reply.headers(headers).type('text/html; charset=utf-8').send(platformHtml));
  app.get('/v1/platform/console.js', (_request, reply) => reply.headers(headers).type('application/javascript; charset=utf-8').send(platformScript));
  app.get<{ Querystring: { section?: string; cursor?: string } }>('/v1/platform/data', { onRequest: async (request, reply) => {
    if (!bearer(request, operators)) return reply.code(401).send({ error: 'unauthorized' });
    if (Object.keys(request.query).some(key => !['section', 'cursor'].includes(key)) ||
      !['overview', 'customers', 'transactions', 'prices'].includes(request.query.section ?? 'overview') ||
      request.query.cursor !== undefined && (!/^\d{1,16}$/.test(request.query.cursor) || !Number.isSafeInteger(Number(request.query.cursor)))) return reply.code(400).send({ error: 'bad_request' });
  } }, (request, reply) => execute(async () => {
    const caller = bearer(request, operators)!, section = request.query.section ?? 'overview';
    const applications = await registry.applications(caller.applications);
    const scopes = applications.map(item => item.application);
    if (!scopes.length) return { section, applications: [], customers: [], transactions: [], nextAfter: null, nextBefore: null, commerceEnabled: false };
    if (section === 'customers') return { section, ...(await registry.customers(scopes, Number(request.query.cursor ?? 0))), commerceEnabled: false };
    if (section === 'transactions') return { section, ...(await registry.transactions(scopes, Number(request.query.cursor ?? Number.MAX_SAFE_INTEGER))), commerceEnabled: false };
    const products = await Promise.all(applications.map(async row => {
      const history = await catalog.history(row.priceProductCode);
      const current = history.versions.find(version => version.priceVersionId === history.publishedPriceId);
      return { ...row, serviceConfigured: credentials.some(credential => credential.application === row.application && credential.issuer === row.issuer && credential.identityMode === 'company' && credential.permissions.includes('provision') && credential.permissions.includes('balance')),
        priceStatus: current ? 'reference_only' : history.versions.length ? 'draft_only' : 'unpriced', referencePrice: current?.price ?? null,
        priceRevisions: history.revision, commerceEnabled: false, paidAccessEnabled: false };
    }));
    return { schemaVersion: 1, section, issuer: COMPANY_ISSUER, applications: products, commerceEnabled: false, paidAccessEnabled: false };
  }, reply));
}
