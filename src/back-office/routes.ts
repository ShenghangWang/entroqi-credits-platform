import {backOfficeFeatures} from './capabilities.js';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import {loadConsoleAssets,type ConsoleAssets} from './console-assets.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db/pool.js';
import type { PlatformOperator } from '../company/routes.js';
import { BackOfficeData, operatorUser, roleOf } from './data.js';
import { registerOwnerRecoveryRoutes } from './owner-recovery-routes.js';
import { registerBackOfficePricing } from './pricing-routes.js';
import { registerAdministrationRoutes } from './administration-routes.js';
import { getCommissionPolicy } from './commission-policy.js';
import { operatorFingerprint, StaffLoginThrottle, type OperatorSource } from './operator-source.js';

const hash = (text: string) => createHash('sha256').update(text).digest();
export function registerBackOfficeRoutes(app: FastifyInstance, db: Database, source: OperatorSource) {
  const data = new BackOfficeData(db);
  const verified = new WeakMap<FastifyRequest, PlatformOperator>();
  const snapshots = new WeakMap<FastifyRequest, PlatformOperator[]>();
  const throttle = new StaffLoginThrottle();
  const caller = (request: FastifyRequest) => verified.get(request);
  const sessions = new Map<string, { operator: PlatformOperator; expiresAt: number }>();
  const sessionDuration = 30 * 60 * 1000;
  const agentsEnabled = process.env.CREDITS_AGENT_WORKFLOWS_ENABLED === 'true';
  const directory = process.env.CREDITS_CONSOLE_DIRECTORY ? resolve(process.env.CREDITS_CONSOLE_DIRECTORY) : '';
  let consoleAssets:ConsoleAssets|undefined;
  app.addHook('onReady',async()=>{if(directory)try{consoleAssets=await loadConsoleAssets(directory);}catch{consoleAssets=undefined;}});
  const common = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
  const wrap = (value: unknown) => ({ code: 0, message: 'ok', data: value, requestId: randomBytes(8).toString('hex') });
  const authenticate = async (request: FastifyRequest) => {
    const cookie = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('entroqi_credits_staff='))?.slice('entroqi_credits_staff='.length);
    if (!cookie || !/^[A-Za-z0-9_-]{43}$/.test(cookie)) return undefined;
    const key = hash(cookie).toString('hex'), session = sessions.get(key);
    if (!session || session.expiresAt <= Date.now()) { sessions.delete(key); return undefined; }
    const current = await source.read();
    snapshots.set(request, current);
    const operator = current.find(item => item.id === session.operator.id && operatorFingerprint(item) === operatorFingerprint(session.operator));
    if (!operator || roleOf(operator) === 'agent' && !agentsEnabled) { sessions.delete(key); return undefined; }
    verified.set(request, operator); return operator;
  };
  const trustedOrigins = new Set((process.env.CREDITS_CONSOLE_ORIGINS ?? 'http://127.0.0.1:3100,http://localhost:3100').split(',').map(value => value.trim()));
  const sameOrigin = (request: FastifyRequest) => typeof request.headers.origin === 'string' && trustedOrigins.has(request.headers.origin);
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.headers(common);
    try { if (!await authenticate(request)) return reply.code(401).send({ code: 'LOGIN_REQUIRED', message: '请先登录积分后台。' }); }
    catch { sessions.clear(); return reply.code(503).send({ code: 'STAFF_CREDENTIALS_UNAVAILABLE', message: '后台凭证暂不可用，请联系授权运维。' }); }
  };
  const execute = async (operation: () => unknown, reply: FastifyReply) => {
    try { return wrap(await operation()); }
    catch { return reply.code(503).send({ code: 'BACK_OFFICE_UNAVAILABLE', message: '公司后台数据暂不可用，请重试。' }); }
  };
  const shell = async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.headers(common);
    if (!consoleAssets) return reply.code(503).send({ error: 'Build and configure the reused full Credits console' });
    return reply.type('text/html; charset=utf-8').send(consoleAssets.html);
  };
  app.get('/', (_request, reply) => reply.redirect('/back-office'));
  app.get('/v1/platform', (_request, reply) => reply.redirect('/back-office'));
  app.get('/back-office/owners',shell); app.get('/back-office', shell); app.get('/back-office/pricing', shell);
  app.get('/v1/pricing',(_request,reply)=>reply.redirect('/back-office/pricing'));  app.get('/back-office/login', shell); app.get('/back-office/recovery', shell);
  app.get<{ Params: { file: string } }>('/console/assets/:file', async (request, reply) => {
    const content=consoleAssets?.files.get(request.params.file);if(!content)return reply.code(404).send();
    return reply.headers(common).type(request.params.file.endsWith('.js') ? 'application/javascript' : request.params.file.endsWith('.css') ? 'text/css' : 'application/octet-stream').send(content);
  });
  app.post<{ Body: { username?: string; password?: string } }>('/api/v1/auth/login', { bodyLimit: 2048 }, async (request, reply) => {
    reply.headers(common);
    if (!sameOrigin(request)) return reply.code(403).send({ code: 'ORIGIN_REQUIRED', message: '请从公司后台页面登录。' });
    if (!throttle.take(request.ip)) return reply.header('Retry-After', '60').code(429).send({ code: 'TOO_MANY_ATTEMPTS', message: '尝试过于频繁，请稍后重试。' });
    const { username, password } = request.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(password)) return reply.code(401).send({ message: '操作员账号或凭证无效。' });
    let operators: PlatformOperator[];
    try { operators = await source.read(); } catch { sessions.clear(); return reply.code(503).send({ code: 'STAFF_CREDENTIALS_UNAVAILABLE', message: '后台凭证暂不可用，请联系授权运维。' }); }
    const submittedHash = hash(password);
    const operator = operators.find(item => timingSafeEqual(hash(item.token), submittedHash) && item.id === username);
    if (!operator || roleOf(operator) === 'agent' && !agentsEnabled) return reply.code(401).send({ message: '操作员账号或凭证无效。' });
    for (const [key, session] of sessions) if (session.expiresAt <= Date.now()) sessions.delete(key);
    if (sessions.size >= 100) return reply.code(429).send({ message: '后台会话已达上限，请稍后重试。' });
    const token = randomBytes(32).toString('base64url'); sessions.set(hash(token).toString('hex'), { operator, expiresAt: Date.now() + sessionDuration });
    reply.header('Set-Cookie', 'entroqi_credits_staff=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800' + (request.protocol === 'https' || request.headers.origin?.startsWith('https://') ? '; Secure' : ''));
    return wrap({ userInfo: operatorUser(operator), features: backOfficeFeatures(agentsEnabled) });
  });
  const recoveryUrl = process.env.CREDITS_COMPANY_ACCOUNT_RECOVERY_URL;
  if (recoveryUrl) {
    const url = new URL(recoveryUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)) || url.username || url.password || url.hash ||
        [...url.searchParams].some(([key, value]) => key !== 'account' || value !== 'recover')) throw new Error('Invalid company account recovery URL');
  }
  const ownerEmailRecovery=registerOwnerRecoveryRoutes(app,source.file,{guard,caller,sameOrigin,headers:common});
  app.get('/api/v1/auth/recovery-options', (_request, reply) => reply.headers(common).send(wrap({
    developerRecovery: 'authorized_server_administrator', managedCredentialFile: source.managed,
    companyAccountRecoveryUrl: recoveryUrl ?? null, ownerEmailRecovery,
  })));
  app.get('/api/v1/auth/me', { preHandler: guard }, request => wrap({ userInfo: operatorUser(caller(request)!), features: backOfficeFeatures(agentsEnabled) }));
  app.post('/api/v1/auth/logout', { preHandler: guard }, (request, reply) => {
    if (!sameOrigin(request)) return reply.code(403).send({ message: '来源校验失败。' });
    const cookie = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('entroqi_credits_staff='))?.slice('entroqi_credits_staff='.length);
    if (cookie) sessions.delete(hash(cookie).toString('hex'));
    reply.header('Set-Cookie', 'entroqi_credits_staff=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); return wrap({ success: true });
  });
  app.get('/api/v1/credits/admin/overview', { preHandler: guard }, (request, reply) => execute(() => data.overview(caller(request)!), reply));
  app.get('/api/v1/platform/dashboard', { preHandler: guard }, (request, reply) => execute(() => data.dashboard(caller(request)!), reply));
  app.get('/api/v1/platform/agents', { preHandler: guard }, (request, reply) => execute(async () => ({ items: await data.agents(caller(request)!) }), reply));
  app.get('/api/v1/platform/admin-policy-overrides', { preHandler: guard }, request => wrap({ items: roleOf(caller(request)!) === 'agent' ? [] : snapshots.get(request)!.filter(item => item.role === 'admin').map(item => ({ ...operatorUser(item), userId: item.id, developerAllowsCreateUsers: false, developerAllowsCreateAgents: agentsEnabled, effectiveCanCreateUsers: false, effectiveCanCreateAgents: false })) }));
  app.get('/api/v1/platform/agent-policy-overrides', { preHandler: guard }, request => wrap({ items: snapshots.get(request)!.filter(item => item.role === 'agent' && (roleOf(caller(request)!) !== 'agent' || item.id === caller(request)!.id)).map(item => ({ ...operatorUser(item), userId: item.id, applications: item.applications, commissionRate: 0, developerAllowsCreateUsers: false, developerDisabledCreateUsers: !agentsEnabled, effectiveCanCreateUsers: false })) }));
  app.get('/api/v1/platform/developer-accounts', { preHandler: guard }, request => wrap({ items: roleOf(caller(request)!) === 'developer' ? snapshots.get(request)!.filter(item => roleOf(item) === 'developer').map(item => ({ ...operatorUser(item), userId: item.id, status: 'active' })) : [] }));
  app.get('/api/v1/platform/commission-policy', { preHandler: guard }, () => wrap({ ...getCommissionPolicy(), enabled: agentsEnabled, notes: [...getCommissionPolicy().notes, '代理商机制为可选功能；公司用户可自行注册。旧费率是保留的模板，不代表已启用的公司收费政策。'] }));
  app.get('/api/v1/platform/settlement-applications', { preHandler: guard }, () => wrap({ items: [], enabled: agentsEnabled }));
  app.get('/api/v1/platform/subscription-plans', { preHandler: guard }, () => wrap({ items: [] }));
  app.get('/api/v1/platform/agent/overview', { preHandler: guard }, request => wrap({ agent: { ...operatorUser(caller(request)!), userId: caller(request)!.id, applications: caller(request)!.applications }, metrics: { customerCount: 0, activeLeadCount: 0, previewCommissionPoints: 0, draftSettlementCount: 0, openTicketCount: 0 }, customers: [], leads: [], commissionPreviews: [], settlementBills: [], materials: [], tickets: [], enabled: agentsEnabled }));
  app.get<{ Querystring: { page?: string; pageSize?: string; applicationCode?: string } }>('/api/v1/platform/transactions', { preHandler: guard }, (request, reply) => {
    const { page = '1', pageSize = '20', applicationCode } = request.query;
    if (!/^\d{1,5}$/.test(page) || Number(page) < 1 || !/^\d{1,3}$/.test(pageSize) || Number(pageSize) < 1 || Number(pageSize) > 100 || applicationCode && !caller(request)!.applications.includes(applicationCode)) return reply.code(400).send({ message: '无效的分页或应用范围。' });
    return execute(() => data.ledger(caller(request)!, Number(page), Number(pageSize), applicationCode), reply);
  });
  app.get('/api/v1/platform/agent/transactions', { preHandler: guard }, (request, reply) => execute(async () => ({ ...(await data.ledger(caller(request)!)), agent: { ...operatorUser(caller(request)!), userId: caller(request)!.id } }), reply));
  registerAdministrationRoutes(app,db,source,{guard,caller,sameOrigin,headers:common});
  registerBackOfficePricing(app,db,{guard,caller,sameOrigin,headers:common});
  app.post<{Body:Record<string,unknown>}>('/api/v1/platform/users',{preHandler:guard,bodyLimit:4096},(request,reply)=>{
    if(!sameOrigin(request))return reply.code(403).send({message:'来源校验失败。'});
    if(request.body?.targetRole==='user' && ['applicationCode','planCode','initialPoints'].some(k=>k in request.body))return reply.code(400).send({message:'公司账号创建不绑定应用、套餐或初始积分；付费权益须独立处理。'});
    return reply.code(409).send({code:'INTEGRATION_NOT_ACTIVATED',message:'后台代建需接通现有公司统一账号服务。当前未创建账号或发放权益；普通用户可通过公司账号自行注册。'});
  });
  app.all('/api/v1/platform/*', { preHandler: guard }, (request, reply) => {
    if (request.method !== 'GET' && !sameOrigin(request)) return reply.code(403).send({ message: '来源校验失败。' });
    return reply.code(409).send({ code: 'INTEGRATION_NOT_ACTIVATED', message: '保留的后台操作需先接通公司统一账号、授权及相应支付/结算流程；当前未创建账号、扣款或发放权益。普通用户可通过公司账号自行注册。' });
  });
}
