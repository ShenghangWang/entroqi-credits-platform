// Reused from the owner's original full Credits console API client.
import { normalizeApiErrorMessage, request } from '@/api/http'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  requestId: string
}

function unwrapApiResponse<T>(response: ApiResponse<T>) {
  if (response.code !== 0) {
    throw new Error(normalizeApiErrorMessage(response.message || 'request failed'))
  }

  return response.data
}

// ===================== Reusable Credits Platform 代理接口 =====================
// 详见 文档/积分文档.md 第 2/8 节。
// 当前用户的积分账户身份由服务端根据登录凭证解析，前端不发送计费身份头。

export type CreditsAccountStatus = 'active' | 'frozen' | 'closed' | string

export interface CreditsAccount {
  id: number | string
  userId: number | string
  tenantId: number | string | null
  accountScope: 'personal' | 'tenant' | string
  totalBalance: number
  lockedBalance: number
  availableBalance: number
  status: CreditsAccountStatus
}

function parseCreditsNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeCreditsAccount(
  account: CreditsAccount & Record<string, unknown>,
): CreditsAccount {
  return {
    ...account,
    totalBalance: parseCreditsNumber(account.totalBalance),
    lockedBalance: parseCreditsNumber(account.lockedBalance),
    availableBalance: parseCreditsNumber(account.availableBalance),
  }
}

function normalizeCreditsTransaction(
  transaction: CreditsTransaction & Record<string, unknown>,
): CreditsTransaction {
  return {
    ...transaction,
    points: parseCreditsNumber(transaction.points),
    balanceBefore:
      transaction.balanceBefore === undefined
        ? undefined
        : parseCreditsNumber(transaction.balanceBefore),
    balanceAfter:
      transaction.balanceAfter === undefined
        ? undefined
        : parseCreditsNumber(transaction.balanceAfter),
    createdAt:
      typeof transaction.createdAt === 'string'
        ? transaction.createdAt
        : new Date(String(transaction.createdAt)).toISOString(),
  }
}

export interface RechargeProduct {
  id: number | string
  code: string
  name: string
  description?: string | null
  priceCents?: number
  priceText?: string
  giftPoints: number
  totalPoints?: number
  status?: string
  badge?: string | null
  highlights?: string[]
}

export type CreditsTransactionType =
  | 'estimate'
  | 'freeze'
  | 'settle'
  | 'refund'
  | 'recharge'
  | 'adjust'
  | 'adjustment'
  | string

export interface CreditsTransaction {
  id: number | string
  applicationId?: number | string | null
  applicationCode?: string | null
  applicationName?: string | null
  functionId?: number | string | null
  functionCode?: string | null
  functionName?: string | null
  txnType: CreditsTransactionType
  points: number
  balanceBefore?: number
  balanceAfter?: number
  billingTaskId?: string | null
  paymentOrderId?: string | null
  bizType?: string | null
  bizId?: string | null
  remark?: string | null
  createdAt: string
}

export interface CreditsApplication {
  id: number | string
  code: string
  name: string
  description?: string | null
  status: string
}

export interface CreditsApplicationFunction {
  id?: number | string
  applicationId?: number | string
  applicationCode?: string
  applicationName?: string
  code: string
  name: string
  chargeMode?: 'fixed' | 'dynamic' | 'estimate_required' | string
  description?: string | null
  defaultPoints: number
  status: string
}

export interface CreditsCustomerProfile {
  id: string
  applicationCode: string
  applicationCodes?: string[]
  userId: string
  username: string
  displayName: string
  phone?: string | null
  role: string
  agents?: Array<{
    userId: string
    username: string
    displayName: string
  }>
  creditsUserId: number | string
  creditsTotalBalance?: string | number | null
  creditsAvailableBalance?: string | number | null
  creditsCurrency?: string | null
  depositBalance?: number | string | null
  depositCurrency?: string | null
  accountScope: 'personal' | 'tenant' | string
  creditsTenantId?: number | string | null
  enterpriseTenantId?: string | null
  enterpriseTenantName?: string | null
  enterpriseMemberRole?: 'owner' | 'admin' | 'member' | string | null
  enterpriseOwnerUserId?: string | null
  enterpriseOwnerUsername?: string | null
  enterpriseOwnerDisplayName?: string | null
  enterpriseAccountRole?: 'standalone' | 'mother' | 'child' | string | null
  totalTopUpCredits?: number | string
  totalConsumedCredits?: number | string
  consumptionTransactionCount?: number | string
  lastConsumedAt?: string | null
  lastTopUpAt?: string | null
  userType?: {
    code: 'active' | 'potential' | 'low_frequency' | string
    label: string
  }
  createdByUserId: string
  createdByUsername?: string | null
  createdByDisplayName?: string | null
  createdByRole: string
  status: string
  createdAt: string
}

export interface CreditsAdminOverview {
  application: CreditsApplication | null
  applications: CreditsApplication[]
  applicationFunctions: CreditsApplicationFunction[]
  creditAccounts: CreditsAccount[]
  rechargeProducts: RechargeProduct[]
  recentTransactions: CreditsTransaction[]
  customerProfiles: CreditsCustomerProfile[]
}

export interface AgentOperationsCustomer {
  id: string
  applicationCode: string
  relationType: string
  status: string
  createdAt: string
  customerUserId: string
  customerUsername: string
  customerDisplayName: string
  customerPhone?: string | null
  customerCreditsUserId: number | string
  createdByUserId?: string | null
  createdByUsername?: string | null
  createdByDisplayName?: string | null
  createdByRole?: string | null
  creditsAvailableBalance?: number | string | null
  creditsTotalBalance?: number | string | null
  creditsCurrency?: string | null
  totalTopUpCredits?: number | string
  totalConsumedCredits?: number | string
  consumptionTransactionCount?: number | string
  lastConsumedAt?: string | null
  lastTopUpAt?: string | null
  userType?: {
    code: 'active' | 'potential' | 'low_frequency' | string
    label: string
  }
}

export interface UpdateAgentCustomerProfilePayload {
  displayName: string
  phone?: string | null
  agentUserId?: string
}

export interface UpdateAgentCustomerProfileResult {
  relationId: string
  customerUserId: string
  customerUsername: string
  customerDisplayName: string
  customerPhone: string | null
  applicationCode: string
}

export interface AgentCustomerLedgerTransaction {
  id: number | string
  relationId?: string
  customerUserId?: string
  customerUsername?: string
  customerDisplayName?: string
  customerPhone?: string | null
  accountScope?: string | null
  tenantId?: number | string | null
  userId: number | string
  accountId: number | string
  billingTaskId?: number | string | null
  paymentOrderId?: number | string | null
  applicationId?: number | string | null
  applicationCode?: string | null
  applicationName?: string | null
  functionId?: number | string | null
  functionCode?: string | null
  functionName?: string | null
  txnType: CreditsTransactionType
  points: number
  balanceBefore: number
  balanceAfter: number
  bizType?: string | null
  bizId?: string | null
  remark?: string | null
  actorUsername?: string | null
  actorDisplayName?: string | null
  actorIdentityLabel?: string | null
  createdAt: string
}

export interface AgentCustomerLedger {
  customer: AgentOperationsCustomer & {
    accountScope?: 'personal' | 'tenant' | string
    creditsTenantId?: number | string | null
    enterpriseTenantId?: string | null
    enterpriseTenantName?: string | null
    enterpriseOwnerUserId?: string | null
    enterpriseAccountRole?: 'personal' | 'team' | string
  }
  account: CreditsAccount | null
  transactions: AgentCustomerLedgerTransaction[]
}

export interface AgentTransactionsLedger {
  agent: {
    userId: string
    username: string
    displayName: string
  }
  transactions: AgentCustomerLedgerTransaction[]
  page?: number
  pageSize?: number
  total?: number
  transactionInsights?: {
    topCreditConsumers: Array<{
      relationId?: string
      customerUserId: string
      customerUsername?: string | null
      customerDisplayName?: string | null
      customerPhone?: string | null
      consumedCredits: number | string
      transactionCount: number | string
      lastConsumedAt?: string | null
    }>
    functionUsageDistribution: Array<{
      functionCode?: string | null
      functionName: string
      usageCount: number | string
      consumedCredits: number | string
    }>
    generatedAt: string
  }
}

export interface PlatformTransactionsLedger {
  scope: 'global'
  transactions: AgentCustomerLedgerTransaction[]
  page?: number
  pageSize?: number
  total?: number
  transactionInsights?: AgentTransactionsLedger['transactionInsights']
}

export interface AgentOperationsLead {
  id: string
  applicationCode: string
  customerName: string
  phone?: string | null
  source?: string | null
  stage: string
  expectedPoints: number
  note?: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface AgentOperationsCommissionPreview {
  id: string
  applicationCode: string
  period: string
  consumedPoints: number
  topUpCredits?: number
  commissionRate: number
  commissionPoints: number
  status: string
  settlementId?: string | null
  customerUserId?: string | null
  customerUsername?: string | null
  customerDisplayName?: string | null
  topUpTransactions?: AgentOperationsTopUpTransaction[]
  createdAt: string
}

export interface AgentOperationsTopUpTransaction {
  id: number | string
  createdAt: string
  txnType: string
  points: number
  paymentOrderId?: number | null
  bizType?: string | null
  bizId?: string | null
  remark?: string | null
}

export interface AgentOperationsSettlementBill {
  id: string
  period: string
  totalCommissionPoints: number
  status: string
  requestedAt?: string | null
  confirmedAt?: string | null
  paidAt?: string | null
  createdAt: string
}

export interface AgentOperationsMaterial {
  id: string
  title: string
  category: string
  applicationCode?: string | null
  url: string
  status: string
  sortOrder: number
}

export interface AgentOperationsTicket {
  id: string
  subject: string
  category: string
  priority: string
  status: string
  lastMessage?: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentOperationsOverview {
  agent: {
    userId: string
    username: string
    displayName: string
    depositBalance?: number | string | null
    depositCurrency?: string | null
    applications?: string[]
  }
  metrics: {
    customerCount: number
    activeLeadCount: number
    previewCommissionPoints: number
    draftSettlementCount: number
    openTicketCount: number
  }
  customers: AgentOperationsCustomer[]
  customerInsights?: {
    topTopUpCustomers: Array<{
      relationId: string
      customerUserId: string
      customerUsername: string
      customerDisplayName: string
      customerPhone?: string | null
      applicationCode: string
      totalTopUpCredits: number | string
    }>
    userTypeDistribution: Array<{
      code: 'active' | 'potential' | 'low_frequency' | string
      label: string
      description: string
      count: number
    }>
    generatedAt: string
  }
  leads: AgentOperationsLead[]
  commissionPreviews: AgentOperationsCommissionPreview[]
  settlementBills: AgentOperationsSettlementBill[]
  materials: AgentOperationsMaterial[]
  tickets: AgentOperationsTicket[]
}

export interface PlatformSettlementApplication {
  id: string
  agentUserId: string
  agentUsername: string
  agentDisplayName: string
  period: string
  totalCommissionPoints: number
  status: string
  requestedAt?: string | null
  approvedByUserId?: string | null
  approvedByUsername?: string | null
  approvedByDisplayName?: string | null
  approvedByRole?: string | null
  confirmedAt?: string | null
  paidAt?: string | null
}

export interface PlatformSettlementApplicationList {
  items: PlatformSettlementApplication[]
}

export interface PlatformDashboardMetricSet {
  linkedCustomerCount: number
  customerAccountCount: number
  activeAgentCount: number
  activeLeadCount: number
  openTicketCount: number
  draftSettlementCount: number
  pendingSettlementCount: number
  applicationCount: number
  platformApplicationCount: number
  todayRechargedCredits?: number
  todayOrderAmount: number
  todayConsumedCredits: number
  applications: string[]
}

export interface PlatformDashboardSection {
  code: string
  label: string
  source: 'reusableCreditsPlatform' | 'usedCarPlatformMvpBackend' | string
  access: string
}

export interface PlatformDashboardTrendEvent {
  metric: 'recharge' | 'consume'
  applicationCode?: string | null
  occurredAt: string
  value: number
}

export interface PlatformDashboardPlanDistributionItem {
  applicationCode: string
  planCode: string
  planName: string
  count: number
}

export interface PlatformDashboard {
  role: 'developer' | 'admin' | 'agent' | string
  scope: 'global_back_office_scope' | 'own_agent_scope' | string
  generatedAt: string
  metrics: PlatformDashboardMetricSet
  trends: PlatformDashboardTrendEvent[]
  planDistribution: PlatformDashboardPlanDistributionItem[]
  sections: PlatformDashboardSection[]
  sourceOfTruth: {
    reusableCreditsPlatform: string[]
    usedCarPlatformMvpBackend: string[]
  }
  notes: string[]
}

export interface PlatformAgentProfile {
  userId: string
  username: string
  displayName: string
  phone?: string | null
  creditsUserId?: number | string | null
  creditsAvailableBalance?: number | string | null
  creditsTotalBalance?: number | string | null
  creditsCurrency?: string | null
  depositBalance?: number | string | null
  depositCurrency?: string | null
  status: string
  assignmentStatus: string
  assignedByUserId?: string | null
  assignedByUsername?: string | null
  assignedByDisplayName?: string | null
  customerCount: number
  leadCount: number
  openTicketCount: number
  applications: string[]
  createdAt: string
  updatedAt: string
}

export interface PlatformAgentList {
  items: PlatformAgentProfile[]
}

export interface PlatformAdminPolicyOverride {
  userId: string
  username: string
  displayName: string
  phone?: string | null
  creditsAvailableBalance?: number | string | null
  creditsTotalBalance?: number | string | null
  creditsCurrency?: string | null
  developerAllowsCreateUsers: boolean
  developerAllowsCreateAgents: boolean
  effectiveCanCreateUsers: boolean
  effectiveCanCreateAgents: boolean
  updatedByUserId?: string | null
  updatedAt?: string | null
}

export interface PlatformAdminPolicyOverrideList {
  items: PlatformAdminPolicyOverride[]
}

export interface PlatformAgentPolicyOverride {
  userId: string
  username: string
  displayName: string
  phone?: string | null
  creditsAvailableBalance?: number | string | null
  creditsTotalBalance?: number | string | null
  creditsCurrency?: string | null
  depositBalance?: number | string | null
  depositCurrency?: string | null
  applications: string[]
  assignedByUserId?: string | null
  assignedByUsername?: string | null
  assignedByDisplayName?: string | null
  commissionRate: number
  developerAllowsCreateUsers: boolean
  developerDisabledCreateUsers: boolean
  effectiveCanCreateUsers: boolean
  updatedByUserId?: string | null
  updatedAt?: string | null
}

export interface PlatformAgentPolicyOverrideList {
  items: PlatformAgentPolicyOverride[]
}

export interface AgentDepositAdjustmentResult {
  agentUserId: string
  direction: 'increase' | 'decrease'
  amount: number
  balanceBefore: number
  balanceAfter: number
  currency: string
  transactionId: string
}

export interface AgentOperationMutationResult {
  id: string
  agentUserId: string
  status?: string
}

export interface CommissionPolicy {
  currency: string
  creditsPerRmb: number
  commissionRate: number
  commissionBase: string
  settlementDayOfMonth: number
  settlementPeriod: string
  settlementStatusFlow: string[]
  refundHandling: string
  sourceOfTruth: {
    rechargeOrders: string
    paymentOrders: string
    creditTransactions: string
    commissionPreview: string
    settlementWorkflow: string
  }
  notes: string[]
}

export type PlatformUserTargetRole = 'admin' | 'agent' | 'user'

export type PlatformUserPlanCode = string

export interface PlatformSubscriptionPlan {
  code: string
  applicationCode: string
  name: string
  price: number
  accountLimit: number
  concurrentTaskLimit: number
  visualConcurrentTaskLimit: number
  batchConcurrentTaskLimit: number
  giftPoints: number
  status: string
  metadata?: Record<string, unknown>
}

export interface CreatePlatformUserPayload {
  idempotencyKey: string
  targetRole: PlatformUserTargetRole
  username: string
  password: string
  displayName?: string
  phone?: string
  email?: string
  applicationCode?: string
  accountScope?: 'personal'
  planCode?: PlatformUserPlanCode
  initialPoints?: number
}

export interface PlatformUserCreationResult {
  idempotentReplay?: boolean
  user: {
    id: string
    username: string
    displayName: string
    phone: string | null
    role: string
    creditsUserId: number | string
    accountScope: string
  }
  creditsAccount: {
    userId: number | string
    tenantId?: number | string | null
    accountId: number | string
    totalBalance: string
    availableBalance: string
  }
  childAccounts?: Array<{
    id: string
    username: string
    displayName: string
    creditsUserId: number | string
    accountScope: 'tenant'
  }>
  applicationLink: {
    id: string
    applicationCode: string
    userId: string
  }
  agentRelation: {
    id: string
    agentUserId: string
    customerUserId: string
  } | null
  policyDecision: {
    allowed: boolean
    reason: string
  }
}

export interface PlatformUserPasswordResetResult {
  updated: boolean
  user: {
    id: string
    username: string
    displayName: string
    role: string
    status: string
  }
}

export interface PlatformUserProfileUpdateResult {
  updated: boolean
  user: {
    id: string
    username: string
    displayName: string
    phone: string | null
    role: string
    status: string
  }
}

export interface PlatformUserApplicationConnectResult {
  updated: boolean
  applicationCode: string
  planCode: string
  applications: string[]
  user: {
    id: string
    username: string
    displayName: string
    role: string
    status: string
  }
}

export interface PlatformUserPromotionResult {
  user: {
    id: string
    username: string
    displayName: string
    phone: string | null
    role: 'agent'
    creditsUserId: number | string | null
    accountScope: string
  }
  backOfficeRoleAssignment: {
    id: string
    userId: string
    roleCode: 'agent'
    status: 'active'
  }
  policyDecision: {
    allowed: boolean
    reason: string
  }
}

export interface PlatformAgentDisableResult {
  disabled: boolean
  user: {
    id: string
    username: string
    displayName: string
    role: 'user'
    creditsUserId: number | string | null
    status: string
    applications?: string[]
  }
}

export interface AdjustPlatformCreditsPayload {
  idempotencyKey: string
  targetUserId: string
  points: number
  reason?: string
  classifyAsRecharge?: boolean
}

export interface PlatformCreditsAdjustmentResult {
  targetUser: {
    id: string
    username: string
    displayName: string
    role: string
    creditsUserId: number | string
  }
  adjustment: {
    transactionId: number | string
    points: number
    txnType?: string
    balanceBefore: string
    balanceAfter: string
    reason: string
  }
}

export interface DeletePlatformUserResult {
  deleted: boolean
  user: {
    id: string
    username: string
    displayName: string
    role: string
  }
}

export interface UpdateApplicationFunctionDefaultPointsResult {
  id: number | string
  applicationId: number | string
  applicationCode?: string
  code: string
  name: string
  chargeMode: string
  defaultPoints: string | number
  status: string
}

function extractCreditsList<T>(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return payload as T[]
  if (!payload || typeof payload !== 'object') return []

  const record = payload as Record<string, unknown>
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as T[]
  }

  return []
}

function resolveRechargeAmountYuan(product: RechargeProduct & Record<string, unknown>) {
  if (typeof product.amount === 'string' || typeof product.amount === 'number') {
    const parsed = Number(product.amount)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  if (typeof product.priceCents === 'number' && product.priceCents > 0) {
    return product.priceCents / 100
  }
  return 0
}

function normalizeRechargeProduct(
  product: RechargeProduct & Record<string, unknown>,
): RechargeProduct {
  const amountYuan = resolveRechargeAmountYuan(product)
  const points = Number(product.points ?? product.giftPoints ?? 0)
  const bonusPoints = Number(product.bonusPoints ?? 0)

  return {
    ...product,
    code: product.code ?? String(product.id),
    priceCents:
      typeof product.priceCents === 'number' && product.priceCents > 0
        ? product.priceCents
        : amountYuan > 0
          ? Math.round(amountYuan * 100)
          : undefined,
    priceText:
      product.priceText ??
      (amountYuan > 0 ? `¥${amountYuan.toLocaleString('zh-CN')}` : undefined),
    giftPoints: product.giftPoints ?? points,
    totalPoints: product.totalPoints ?? points + bonusPoints,
    status: product.status ?? (product.enabled === false ? 'disabled' : 'active'),
  }
}

function normalizeCreditsApplicationFunction(
  item: CreditsApplicationFunction & Record<string, unknown>,
): CreditsApplicationFunction {
  return {
    ...item,
    defaultPoints: parseCreditsNumber(item.defaultPoints),
  }
}

export async function getCreditsAdminOverview(): Promise<CreditsAdminOverview> {
  const response = await request.get<ApiResponse<CreditsAdminOverview & Record<string, unknown>>>(
    '/credits/admin/overview',
  )
  const payload = unwrapApiResponse(response)
  const applications = extractCreditsList<CreditsApplication>(payload, ['applications'])
  const applicationFunctions = extractCreditsList<
    CreditsApplicationFunction & Record<string, unknown>
  >(payload, ['applicationFunctions', 'functions']).map(normalizeCreditsApplicationFunction)
  const creditAccounts = extractCreditsList<CreditsAccount & Record<string, unknown>>(
    payload,
    ['creditAccounts', 'accounts'],
  ).map(normalizeCreditsAccount)
  const rechargeProducts = extractCreditsList<RechargeProduct & Record<string, unknown>>(
    payload,
    ['rechargeProducts', 'products'],
  ).map(normalizeRechargeProduct)
  const recentTransactions = extractCreditsList<CreditsTransaction & Record<string, unknown>>(
    payload,
    ['recentTransactions', 'transactions'],
  ).map(normalizeCreditsTransaction)
  const customerProfiles = extractCreditsList<CreditsCustomerProfile>(
    payload,
    ['customerProfiles', 'customers'],
  ).map((item) => ({
    ...item,
    totalTopUpCredits: parseCreditsNumber(item.totalTopUpCredits ?? 0),
    totalConsumedCredits: parseCreditsNumber(item.totalConsumedCredits ?? 0),
    consumptionTransactionCount: parseCreditsNumber(item.consumptionTransactionCount ?? 0),
  }))

  return {
    application: payload.application ?? applications[0] ?? null,
    applications,
    applicationFunctions,
    creditAccounts,
    rechargeProducts,
    recentTransactions,
    customerProfiles,
  }
}

export async function getAgentOperationsOverview(params?: {
  agentUserId?: string
}): Promise<AgentOperationsOverview> {
  const response = await request.get<ApiResponse<AgentOperationsOverview>>(
    '/platform/agent/overview',
    { params },
  )
  const payload = unwrapApiResponse(response)
  return {
    ...payload,
    customers: (payload.customers ?? []).map((item) => ({
      ...item,
      totalTopUpCredits: parseCreditsNumber(item.totalTopUpCredits ?? 0),
      totalConsumedCredits: parseCreditsNumber(item.totalConsumedCredits ?? 0),
      consumptionTransactionCount: parseCreditsNumber(item.consumptionTransactionCount ?? 0),
    })),
    customerInsights: payload.customerInsights
        ? {
          ...payload.customerInsights,
          topTopUpCustomers: (payload.customerInsights.topTopUpCustomers ?? []).map((item) => ({
            ...item,
            totalTopUpCredits: parseCreditsNumber(item.totalTopUpCredits),
          })),
        }
      : undefined,
    commissionPreviews: (payload.commissionPreviews ?? []).map((item) => ({
      ...item,
      consumedPoints: parseCreditsNumber(item.consumedPoints),
      topUpCredits: parseCreditsNumber(item.topUpCredits ?? item.consumedPoints),
      commissionRate: Number(item.commissionRate ?? 0),
      commissionPoints: parseCreditsNumber(item.commissionPoints),
      topUpTransactions: (item.topUpTransactions ?? []).map((transaction) => ({
        ...transaction,
        points: parseCreditsNumber(transaction.points),
      })),
    })),
    settlementBills: (payload.settlementBills ?? []).map((item) => ({
      ...item,
      totalCommissionPoints: parseCreditsNumber(item.totalCommissionPoints),
    })),
  }
}

export async function getAgentCustomerLedger(
  relationId: string,
  params?: { agentUserId?: string },
): Promise<AgentCustomerLedger> {
  const response = await request.get<ApiResponse<AgentCustomerLedger>>(
    `/platform/agent/customers/${encodeURIComponent(relationId)}/ledger`,
    { params },
  )
  const payload = unwrapApiResponse(response)
  return {
    ...payload,
    transactions: (payload.transactions ?? []).map((item) => ({
      ...item,
      points: parseCreditsNumber(item.points),
      balanceBefore: parseCreditsNumber(item.balanceBefore),
      balanceAfter: parseCreditsNumber(item.balanceAfter),
    })),
    account: payload.account
      ? normalizeCreditsAccount(payload.account as CreditsAccount & Record<string, unknown>)
      : null,
  }
}

export async function updateAgentCustomerProfile(
  relationId: string,
  payload: UpdateAgentCustomerProfilePayload,
): Promise<UpdateAgentCustomerProfileResult> {
  const response = await request.patch<ApiResponse<UpdateAgentCustomerProfileResult>>(
    `/platform/agent/customers/${encodeURIComponent(relationId)}/profile`,
    payload,
  )
  return unwrapApiResponse(response)
}

export async function getAgentTransactionsLedger(params?: {
  agentUserId?: string
  page?: number
  pageSize?: number
  applicationCode?: string
}): Promise<AgentTransactionsLedger> {
  const response = await request.get<ApiResponse<AgentTransactionsLedger>>(
    '/platform/agent/transactions',
    { params },
  )
  const payload = unwrapApiResponse(response)
  return {
    ...payload,
    transactionInsights: payload.transactionInsights
      ? {
          ...payload.transactionInsights,
          topCreditConsumers: (payload.transactionInsights.topCreditConsumers ?? []).map((item) => ({
            ...item,
            consumedCredits: parseCreditsNumber(item.consumedCredits),
            transactionCount: parseCreditsNumber(item.transactionCount),
          })),
          functionUsageDistribution: (
            payload.transactionInsights.functionUsageDistribution ?? []
          ).map((item) => ({
            ...item,
            usageCount: parseCreditsNumber(item.usageCount),
            consumedCredits: parseCreditsNumber(item.consumedCredits),
          })),
        }
      : undefined,
    transactions: (payload.transactions ?? []).map((item) => ({
      ...item,
      points: parseCreditsNumber(item.points),
      balanceBefore: parseCreditsNumber(item.balanceBefore),
      balanceAfter: parseCreditsNumber(item.balanceAfter),
    })),
  }
}

function normalizeTransactionsLedgerPayload<T extends { transactions?: AgentCustomerLedgerTransaction[]; transactionInsights?: AgentTransactionsLedger['transactionInsights'] }>(
  payload: T,
): T {
  return {
    ...payload,
    transactionInsights: payload.transactionInsights
      ? {
          ...payload.transactionInsights,
          topCreditConsumers: (payload.transactionInsights.topCreditConsumers ?? []).map((item) => ({
            ...item,
            consumedCredits: parseCreditsNumber(item.consumedCredits),
            transactionCount: parseCreditsNumber(item.transactionCount),
          })),
          functionUsageDistribution: (
            payload.transactionInsights.functionUsageDistribution ?? []
          ).map((item) => ({
            ...item,
            usageCount: parseCreditsNumber(item.usageCount),
            consumedCredits: parseCreditsNumber(item.consumedCredits),
          })),
        }
      : undefined,
    transactions: (payload.transactions ?? []).map((item) => ({
      ...item,
      points: parseCreditsNumber(item.points),
      balanceBefore: parseCreditsNumber(item.balanceBefore),
      balanceAfter: parseCreditsNumber(item.balanceAfter),
    })),
  }
}

export async function getPlatformTransactionsLedger(params?: {
  page?: number
  pageSize?: number
  applicationCode?: string
}): Promise<PlatformTransactionsLedger> {
  const response = await request.get<ApiResponse<PlatformTransactionsLedger>>('/platform/transactions', { params })
  return normalizeTransactionsLedgerPayload(unwrapApiResponse(response))
}

export async function getPlatformCustomerLedger(
  customerProfileId: string,
): Promise<AgentCustomerLedger> {
  const response = await request.get<ApiResponse<AgentCustomerLedger>>(
    `/platform/customers/${encodeURIComponent(customerProfileId)}/ledger`,
  )
  const payload = unwrapApiResponse(response)
  return {
    ...payload,
    transactions: (payload.transactions ?? []).map((item) => ({
      ...item,
      points: parseCreditsNumber(item.points),
      balanceBefore: parseCreditsNumber(item.balanceBefore),
      balanceAfter: parseCreditsNumber(item.balanceAfter),
    })),
    account: payload.account
      ? normalizeCreditsAccount(payload.account as CreditsAccount & Record<string, unknown>)
      : null,
  }
}

export async function getPlatformDashboard(): Promise<PlatformDashboard> {
  const response = await request.get<ApiResponse<PlatformDashboard>>('/platform/dashboard')
  const payload = unwrapApiResponse(response)
  return {
    ...payload,
    trends: (payload.trends ?? []).map((item) => ({
      ...item,
      value: parseCreditsNumber(item.value),
    })),
    planDistribution: (payload.planDistribution ?? []).map((item) => ({
      ...item,
      count: Number(item.count ?? 0),
    })),
  }
}

export async function getPlatformAgents(): Promise<PlatformAgentList> {
  const response = await request.get<ApiResponse<PlatformAgentList>>('/platform/agents')
  return unwrapApiResponse(response)
}

export async function getPlatformAdminPolicyOverrides(): Promise<PlatformAdminPolicyOverrideList> {
  const response = await request.get<ApiResponse<PlatformAdminPolicyOverrideList>>(
    '/platform/admin-policy-overrides',
  )
  return unwrapApiResponse(response)
}

export async function updatePlatformAdminPolicyOverride(
  adminUserId: string,
  payload: {
    developerAllowsCreateUsers?: boolean
    developerAllowsCreateAgents?: boolean
  },
): Promise<PlatformAdminPolicyOverrideList> {
  const response = await request.patch<ApiResponse<PlatformAdminPolicyOverrideList>>(
    `/platform/admin-policy-overrides/${encodeURIComponent(adminUserId)}`,
    payload,
  )
  return unwrapApiResponse(response)
}

export async function getPlatformAgentPolicyOverrides(): Promise<PlatformAgentPolicyOverrideList> {
  const response = await request.get<ApiResponse<PlatformAgentPolicyOverrideList>>(
    '/platform/agent-policy-overrides',
  )
  return unwrapApiResponse(response)
}

export async function updatePlatformAgentPolicyOverride(
  agentUserId: string,
  payload: { developerAllowsCreateUsers?: boolean; commissionRate?: number },
): Promise<PlatformAgentPolicyOverrideList> {
  const response = await request.patch<ApiResponse<PlatformAgentPolicyOverrideList>>(
    `/platform/agent-policy-overrides/${encodeURIComponent(agentUserId)}`,
    payload,
  )
  return unwrapApiResponse(response)
}

export async function adjustPlatformAgentDeposit(
  agentUserId: string,
  payload: { amount: number; direction: 'increase' | 'decrease'; remark?: string },
): Promise<AgentDepositAdjustmentResult> {
  const response = await request.post<ApiResponse<AgentDepositAdjustmentResult>>(
    `/platform/agent-deposits/${encodeURIComponent(agentUserId)}/adjustments`,
    payload,
  )
  return unwrapApiResponse(response)
}

export async function updateApplicationFunctionDefaultPoints(
  applicationCode: string,
  functionCode: string,
  defaultPoints: number,
): Promise<UpdateApplicationFunctionDefaultPointsResult> {
  const response = await request.patch<ApiResponse<UpdateApplicationFunctionDefaultPointsResult>>(
    `/platform/application-functions/${encodeURIComponent(applicationCode)}/${encodeURIComponent(functionCode)}/default-points`,
    { defaultPoints },
  )
  return unwrapApiResponse(response)
}

export async function getCommissionPolicy(): Promise<CommissionPolicy> {
  const response = await request.get<ApiResponse<CommissionPolicy>>('/platform/commission-policy')
  return unwrapApiResponse(response)
}

export async function applyAgentSettlement(
  settlementId: string,
  params?: { agentUserId?: string },
): Promise<AgentOperationMutationResult> {
  const response = await request.post<ApiResponse<AgentOperationMutationResult>>(
    `/platform/agent/settlements/${encodeURIComponent(settlementId)}/apply`,
    {},
    { params },
  )
  return unwrapApiResponse(response)
}

export async function approvePlatformSettlementPayment(
  settlementId: string,
): Promise<AgentOperationMutationResult> {
  const response = await request.post<ApiResponse<AgentOperationMutationResult>>(
    `/platform/settlement-applications/${encodeURIComponent(settlementId)}/approve-payment`,
    {},
  )
  return unwrapApiResponse(response)
}

export async function getPlatformSettlementApplications(): Promise<PlatformSettlementApplicationList> {
  const response = await request.get<ApiResponse<PlatformSettlementApplicationList>>(
    '/platform/settlement-applications',
  )
  const payload = unwrapApiResponse(response)
  return {
    items: (payload.items ?? []).map((item) => ({
      ...item,
      totalCommissionPoints: parseCreditsNumber(item.totalCommissionPoints),
    })),
  }
}

export async function createPlatformUser(
  payload: CreatePlatformUserPayload,
): Promise<PlatformUserCreationResult> {
  const response = await request.post<ApiResponse<PlatformUserCreationResult>>(
    '/platform/users',
    payload,
  )
  return unwrapApiResponse(response)
}

export async function connectPlatformUserApplication(
  userId: string,
  payload: { applicationCode: string; planCode: string; reason?: string },
): Promise<PlatformUserApplicationConnectResult> {
  const response = await request.post<ApiResponse<PlatformUserApplicationConnectResult>>(
    `/platform/users/${encodeURIComponent(userId)}/applications`,
    payload,
  )
  return unwrapApiResponse(response)
}

export async function getPlatformSubscriptionPlans(params: {
  applicationCode: string
}): Promise<{ applicationCode: string; items: PlatformSubscriptionPlan[] }> {
  const response = await request.get<ApiResponse<{ applicationCode: string; items: PlatformSubscriptionPlan[] }>>(
    '/platform/subscription-plans',
    { params },
  )
  return unwrapApiResponse(response)
}

export async function promotePlatformUserToAgent(
  userId: string,
  payload: { applicationCode?: string } = {},
): Promise<PlatformUserPromotionResult> {
  const response = await request.post<ApiResponse<PlatformUserPromotionResult>>(
    `/platform/users/${encodeURIComponent(userId)}/promote-agent`,
    payload,
  )
  return unwrapApiResponse(response)
}

export async function disablePlatformAgent(
  userId: string,
  payload: { reason?: string } = {},
): Promise<PlatformAgentDisableResult> {
  const response = await request.post<ApiResponse<PlatformAgentDisableResult>>(
    `/platform/users/${encodeURIComponent(userId)}/disable-agent`,
    payload,
  )
  return unwrapApiResponse(response)
}

export async function adjustPlatformCredits(
  payload: AdjustPlatformCreditsPayload,
): Promise<PlatformCreditsAdjustmentResult> {
  const response = await request.post<ApiResponse<PlatformCreditsAdjustmentResult>>(
    '/platform/credits/adjustments',
    payload,
  )
  return unwrapApiResponse(response)
}

export async function resetPlatformUserPassword(
  userId: string,
  payload: { password: string; reason?: string },
): Promise<PlatformUserPasswordResetResult> {
  const response = await request.patch<ApiResponse<PlatformUserPasswordResetResult>>(
    `/platform/users/${encodeURIComponent(userId)}/password`,
    payload,
  )
  return unwrapApiResponse(response)
}

export async function updatePlatformUserProfile(
  userId: string,
  payload: { displayName: string; phone?: string | null; reason?: string },
): Promise<PlatformUserProfileUpdateResult> {
  const response = await request.patch<ApiResponse<PlatformUserProfileUpdateResult>>(
    `/platform/users/${encodeURIComponent(userId)}/profile`,
    payload,
  )
  return unwrapApiResponse(response)
}

export async function deletePlatformUser(
  userId: string,
  payload: { reason?: string },
): Promise<DeletePlatformUserResult> {
  const response = await request.delete<ApiResponse<DeletePlatformUserResult>>(
    `/platform/users/${encodeURIComponent(userId)}`,
    { data: payload },
  )
  return unwrapApiResponse(response)
}
