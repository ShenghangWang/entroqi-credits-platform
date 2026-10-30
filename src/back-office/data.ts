import type { Database } from '../db/pool.js';
import { CompanyRegistry, COMPANY_ISSUER } from '../company/registry.js';
import type { PlatformOperator } from '../company/routes.js';
import { defaultBackOfficeRolePermissions } from './account-creation-policy.js';

export const roleOf = (operator: PlatformOperator) => operator.role ?? 'developer';
export function operatorUser(operator: PlatformOperator) {
  const role = roleOf(operator);
  return { id: operator.id, username: operator.id, displayName: role === 'developer' ? (operator.id === 'company-owner' ? '公司所有者' : '开发者') : role === 'admin' ? '公司管理员' : '代理商', role, permissions: [...defaultBackOfficeRolePermissions[role],...(operator.pricingPermissions ?? []).map(permission=>'pricing:'+permission)], accountScope: 'personal' };
}
// Adapter to the owner's existing full console DTOs. Financial calculations and
// ledger/agent implementations remain the existing Credits core.
export class BackOfficeData {
  constructor(private db: Database) {}
  private scope(operator: PlatformOperator) {
    const values: unknown[] = [COMPANY_ISSUER, ...operator.applications];
    const slots = operator.applications.map((_, i) => '$' + (i + 2)).join(',');
    let sql = `e.issuer=$1 and exists (select 1 from customer_application_memberships m where m.issuer=e.issuer and m.subject=e.subject and m.application in (${slots}))`;
    if (roleOf(operator) === 'agent') {
      values.push(operator.subject ?? '__unassigned_agent__');
      sql += ` and exists (select 1 from agent_relations ar join customer_external_identities ae on ae.user_id=ar.agent_user_id join agent_profiles ap on ap.user_id=ar.agent_user_id where ae.issuer=$1 and ae.subject=$${values.length} and ap.status='approved' and ar.referred_user_id=e.user_id and ar.status='active')`;
    }
    return { sql, values };
  }
  async applications(operator: PlatformOperator) {
    return (await new CompanyRegistry(this.db).applications(operator.applications)).map(row => ({ id: row.application, code: row.application, name: row.name, status: row.status, description: 'Entroqi company product' }));
  }
  async customers(operator: PlatformOperator) {
    const scope = this.scope(operator);
    return (await this.db.query(`select concat(m.application,':',e.user_id) id,m.application applicationCode,cast(e.user_id as char) userId,
      coalesce(u.username,concat('customer-',e.user_id)) username,coalesce(u.username,concat('客户 #',e.user_id)) displayName,
      case when ap.status='approved' then 'agent' else 'user' end role,e.user_id creditsUserId,w.total_balance creditsTotalBalance,w.available_balance creditsAvailableBalance,w.currency creditsCurrency,
      'personal' accountScope,m.status,u.created_at createdAt,
      coalesce((select sum(abs(ct.points)) from credit_transactions ct join applications ca on ca.id=ct.application_id where ct.user_id=e.user_id and ca.code=m.application and ct.txn_type='recharge'),0) totalTopUpCredits,
      coalesce((select sum(abs(ct.points)) from credit_transactions ct join applications ca on ca.id=ct.application_id where ct.user_id=e.user_id and ca.code=m.application and ct.txn_type='settle'),0) totalConsumedCredits,
      (select count(*) from credit_transactions ct join applications ca on ca.id=ct.application_id where ct.user_id=e.user_id and ca.code=m.application and ct.txn_type='settle') consumptionTransactionCount,
      (select max(ct.created_at) from credit_transactions ct join applications ca on ca.id=ct.application_id where ct.user_id=e.user_id and ca.code=m.application and ct.txn_type='settle') lastConsumedAt,
      (select max(ct.created_at) from credit_transactions ct join applications ca on ca.id=ct.application_id where ct.user_id=e.user_id and ca.code=m.application and ct.txn_type='recharge') lastTopUpAt
      from customer_external_identities e join users u on u.id=e.user_id join credit_accounts w on w.id=e.account_id
      join customer_application_memberships m on m.issuer=e.issuer and m.subject=e.subject left join agent_profiles ap on ap.user_id=e.user_id
      where ${scope.sql} and m.application in (${operator.applications.map((_, i) => '$' + (i + 2)).join(',')}) order by e.user_id,m.application limit 1000`, scope.values)).rows;
  }
  async overview(operator: PlatformOperator) {
    const scope = this.scope(operator);
    const [applications, customers, accounts, functions] = await Promise.all([
      this.applications(operator), this.customers(operator),
      this.db.query(`select distinct w.id,w.user_id userId,w.account_scope accountScope,w.total_balance totalBalance,w.locked_balance lockedBalance,w.available_balance availableBalance,w.currency,w.status from customer_external_identities e join credit_accounts w on w.id=e.account_id where ${scope.sql} order by w.id limit 1000`, scope.values),
      this.db.query(`select f.id,a.code applicationCode,a.name applicationName,f.code,f.name,f.charge_mode chargeMode,f.default_points defaultPoints,f.status from application_functions f join applications a on a.id=f.application_id where a.code in (${operator.applications.map((_, i) => '$' + (i + 1)).join(',')}) order by a.code,f.code`, operator.applications),
    ]);
    const ledger = await this.ledger(operator, 1, 50);
    return { application: applications[0] ?? null, applications, applicationFunctions: functions.rows, creditAccounts: accounts.rows, rechargeProducts: [], recentTransactions: ledger.transactions, customerProfiles: customers };
  }
  async ledger(operator: PlatformOperator, page = 1, pageSize = 20, application?: string) {
    const scope = this.scope(operator);
    const filters = [...scope.values];
    let sql = scope.sql + ` and a.code in (${operator.applications.map((_, i) => '$' + (i + 2)).join(',')})`;
    if (application) { filters.push(application); sql += ` and a.code=$${filters.length}`; }
    const from = `from credit_transactions t join applications a on a.id=t.application_id join customer_external_identities e on e.user_id=t.user_id join users u on u.id=e.user_id where ${sql}`;
    const [rows, total, consumers, functions] = await Promise.all([
      this.db.query(`select cast(t.id as char) id,cast(t.user_id as char) customerUserId,t.user_id userId,t.account_id accountId,t.application_id applicationId,t.function_id functionId,t.billing_task_id billingTaskId,t.payment_order_id paymentOrderId,coalesce(u.username,concat('客户 #',u.id)) customerDisplayName,a.code applicationCode,t.txn_type txnType,t.points,t.balance_before balanceBefore,t.balance_after balanceAfter,t.created_at createdAt,t.biz_type bizType,t.biz_id bizId,t.remark,a.name applicationName ${from} order by t.id desc limit ${pageSize} offset ${(page - 1) * pageSize}`, filters),
      this.db.query<{ total: number }>(`select count(*) total ${from}`, filters),
      this.db.query(`select cast(t.user_id as char) customerUserId,u.username customerUsername,coalesce(u.username,concat('客户 #',u.id)) customerDisplayName,sum(abs(t.points)) consumedCredits,count(*) transactionCount,max(t.created_at) lastConsumedAt ${from} and t.txn_type='settle' group by t.user_id,u.username,u.id order by consumedCredits desc,t.user_id limit 10`, filters),
      this.db.query(`select coalesce(f.code,t.biz_type,'unclassified') functionCode,coalesce(f.name,t.biz_type,'未分类') functionName,count(*) usageCount,sum(abs(t.points)) consumedCredits ${from.replace('where ', 'left join application_functions f on f.id=t.function_id where ')} and t.txn_type='settle' group by f.code,f.name,t.biz_type order by consumedCredits desc,functionCode limit 100`, filters),
    ]);
    return { scope: 'global', transactions: rows.rows, page, pageSize, total: Number(total.rows[0]?.total ?? 0), transactionInsights: { topCreditConsumers: consumers.rows, functionUsageDistribution: functions.rows, generatedAt: new Date().toISOString() } };
  }
  async dashboard(operator: PlatformOperator) {
    const applications = await this.applications(operator);
    const scope = this.scope(operator);
    const counts = await this.db.query(`select count(distinct e.user_id) customers,count(distinct case when ap.status='approved' then e.user_id end) agents from customer_external_identities e left join agent_profiles ap on ap.user_id=e.user_id where ${scope.sql}`, scope.values);
    const sums = await this.db.query(`select coalesce(sum(case when t.txn_type='recharge' then abs(t.points) else 0 end),0) recharged,coalesce(sum(case when t.txn_type='settle' then abs(t.points) else 0 end),0) consumed from credit_transactions t join applications a on a.id=t.application_id join customer_external_identities e on e.user_id=t.user_id where ${scope.sql} and a.code in (${operator.applications.map((_, i) => '$' + (i + 2)).join(',')}) and t.created_at>=current_date() and t.created_at<date_add(current_date(),interval 1 day)`, scope.values);
    const trends = await this.db.query(`select a.code applicationCode,date_format(t.created_at,'%Y-%m-%dT%H:00:00+08:00') occurredAt,case when t.txn_type='recharge' then 'recharge' else 'consume' end metric,sum(abs(t.points)) value
      from credit_transactions t join applications a on a.id=t.application_id join customer_external_identities e on e.user_id=t.user_id
      where ${scope.sql} and a.code in (${operator.applications.map((_, i) => '$' + (i + 2)).join(',')}) and t.txn_type in ('recharge','settle') and t.created_at>=date_sub(now(),interval 31 day)
      group by a.code,occurredAt,metric order by occurredAt limit 5000`, scope.values);
    const applicationsSql=operator.applications.map((_,i)=>'$'+(i+2)).join(',');
    const commercialFrom=`from commercial_grants g join commercial_quotes q on q.id=g.quote_id join customer_external_identities e on e.issuer=q.issuer and e.subject=q.subject where ${scope.sql} and q.application in (${applicationsSql}) and g.status='active'`;
    const plans=await this.db.query(`select q.application applicationCode,concat(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.label')),' · ',case when JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.model'))='subscription' then case cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.intervalMonths')) as unsigned) when 1 then '月付' when 3 then '季付' when 12 then '年付' else '两年付' end when JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.model'))='monthly' then '历史月付' else '历史授权' end) planName,count(distinct q.subject) count ${commercialFrom} and (JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.model'))='version_license' or (cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.periodStart')) as unsigned)<=${Date.now()} and cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.periodEnd')) as unsigned)>${Date.now()})) group by q.application,planName order by q.application,planName`,scope.values);
    // Reporting day matches the original console's +08:00 hourly charts.
    const dayStart=Math.floor((Date.now()+8*3600000)/86400000)*86400000-8*3600000;
    const receipts=await this.db.query<{paidMinor:string}>(`select cast(coalesce(sum(cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.amountMinor')) as decimal(38,0))),0) as char) paidMinor ${commercialFrom} and cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.paidAt')) as unsigned)>=${dayStart} and cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.paidAt')) as unsigned)<${dayStart+86400000}`,scope.values);
    const paidMinor=receipts.rows[0]?.paidMinor ?? '0';
    return { role: roleOf(operator), scope: roleOf(operator) === 'agent' ? 'own_agent_scope' : 'global_back_office_scope', generatedAt: new Date().toISOString(),
      metrics: { linkedCustomerCount: Number(counts.rows[0]?.customers ?? 0), customerAccountCount: Number(counts.rows[0]?.customers ?? 0), activeAgentCount: Number(counts.rows[0]?.agents ?? 0), activeLeadCount: 0, openTicketCount: 0, draftSettlementCount: 0, pendingSettlementCount: 0, applicationCount: applications.length, platformApplicationCount: applications.length, todayRechargedCredits: Number(sums.rows[0]?.recharged ?? 0), todayOrderAmount: Number(paidMinor)/100, todayConfirmedProductSalesMinor: paidMinor, todayConsumedCredits: Number(sums.rows[0]?.consumed ?? 0), applications: applications.map(row => row.code) },
      trends: trends.rows, planDistribution: plans.rows, sections: [], sourceOfTruth: { reusableCreditsPlatform: ['company registry', 'company identities', 'wallets', 'ledger', 'agent profiles/relations', 'verified product receipts and active paid plans'], companyBackOffice: ['configured staff roles'] }, notes: ['Self-registration is independent of optional agent referral.', 'No paid orders or purchased plans are fabricated.'] };
  }
  async agents(operator: PlatformOperator) {
    const scope = this.scope(operator);
    return (await this.db.query(`select distinct cast(e.user_id as char) userId,coalesce(u.username,concat('agent-',e.user_id)) username,coalesce(u.username,concat('代理商 #',e.user_id)) displayName,e.user_id creditsUserId,w.available_balance creditsAvailableBalance,w.total_balance creditsTotalBalance,w.currency creditsCurrency,ap.status,'active' assignmentStatus,ap.created_at createdAt,ap.created_at updatedAt
      from customer_external_identities e join users u on u.id=e.user_id join agent_profiles ap on ap.user_id=e.user_id join credit_accounts w on w.id=e.account_id where ${scope.sql} and ap.status='approved' limit 1000`, scope.values)).rows.map(row => ({ ...row, customerCount: 0, leadCount: 0, openTicketCount: 0, applications: [] }));
  }
}
