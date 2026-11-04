<script setup lang="ts">
import { useRouter } from 'vue-router'
const ownerRouter=useRouter()
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import type { VNodeChild } from 'vue'
import * as echarts from 'echarts'
import { Icon } from '@iconify/vue'
import {
  NButton,
  NCheckbox,
  NDataTable,
  NDropdown,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns, DropdownOption } from 'naive-ui'

import {
  adjustPlatformAgentDeposit,
  adjustPlatformCredits,
  applyAgentSettlement,
  approvePlatformSettlementPayment,
  connectPlatformUserApplication,
  createPlatformUser,
  deletePlatformUser,
  disablePlatformAgent,
  getAgentCustomerLedger,
  getAgentTransactionsLedger,
  getCommissionPolicy,
  getAgentOperationsOverview,
  getCreditsAdminOverview,
  getPlatformCustomerLedger,
  getPlatformAdminPolicyOverrides,
  getPlatformAgentPolicyOverrides,
  getPlatformAgents,
  getPlatformDashboard,
  getPlatformTransactionsLedger,
  getPlatformSettlementApplications,
  getPlatformSubscriptionPlans,
  promotePlatformUserToAgent,
  resetPlatformUserPassword,
  updateAgentCustomerProfile,
  updatePlatformAdminPolicyOverride,
  updatePlatformAgentPolicyOverride,
  updatePlatformUserProfile,
  updateApplicationFunctionDefaultPoints,
  type AgentCustomerLedger,
  type AgentCustomerLedgerTransaction,
  type AgentTransactionsLedger,
  type AgentOperationsCommissionPreview,
  type AgentOperationsTopUpTransaction,
  type AgentOperationsCustomer,
  type AgentOperationsOverview,
  type AgentOperationsSettlementBill,
  type CreditsAdminOverview,
  type CreditsCustomerProfile,
  type CommissionPolicy,
  type PlatformTransactionsLedger,
  type PlatformUserPlanCode,
  type PlatformSubscriptionPlan,
  type PlatformUserTargetRole,
  type PlatformAdminPolicyOverride,
  type PlatformAgentPolicyOverride,
  type PlatformAgentProfile,
  type PlatformDashboard,
  type PlatformSettlementApplication,
} from '@/api/visual-workbench'
import {
  defaultAccountCreationPolicyState,
  formatReusableCreditsApplicationName,
  resolveAccountCreationPolicy,
  reusableCreditsApplicationCatalog,
  type BackOfficeRole,
} from '@/policies/accountProvisioning'
import { useAuthStore } from '@/stores/auth'

type RoleTab = BackOfficeRole
type DetailRecord = Record<string, unknown>
type PasswordResetTableRow = {
  userId: string
  username: string
  displayName: string
}
type CustomerEditActionKey =
  | 'editProfile'
  | 'connectApplication'
  | 'promoteToAgent'
  | 'resetPassword'
  | 'deleteAccount'
type CustomerAgentFilterOption = {
  userId: string
  username?: string | null
  displayName?: string | null
  customerCount: number
}
type AdminDropdownMixedOption =
  | DropdownOption
  | { type: 'divider'; key: string }
  | { type: 'render'; key: string; render: () => VNodeChild }
type DeveloperAgentEditActionKey =
  | 'editProfile'
  | 'connectApplication'
  | 'resetPassword'
  | 'disableAgent'
type PlatformEditableProfileRole = PlatformUserTargetRole | 'developer'
type PlatformEditableProfileRow = PasswordResetTableRow & {
  phone?: string | null
  status?: string | null
}
type PlatformCreditsAdjustmentTarget = PasswordResetTableRow & {
  role?: PlatformUserTargetRole | 'developer' | string | null
}
type TrendPeriod = 'today' | '7d' | '30d'
type TrendMetric = 'consume' | 'recharge'
type AgentConsolePage =
  | 'agent-dashboard'
  | 'agent-customers'
  | 'agent-consumption'
  | 'agent-settlements'
type AdminConsolePage =
  | 'admin-dashboard'
  | 'admin-agents'
  | 'admin-users'
  | 'admin-transactions'
  | 'admin-settlements'
type DeveloperConsolePage =
  | 'developer-dashboard'
  | 'developer-admins'
  | 'developer-agents'
  | 'developer-customers'
  | 'developer-transactions'
  | 'developer-settlements'
  | 'developer-billing'

type ApplicationFilterOption = {
  code: string
  name: string
  statusText: string
}

const CUSTOMER_AGENT_FILTER_ALL_KEY = '__all_customer_agents__'
const CUSTOMER_AGENT_FILTER_EMPTY_KEY = '__empty_customer_agents__'
const CUSTOMER_AGENT_FILTER_PLATFORM_OWNED_KEY = '__platform_owned_customers__'

const props = defineProps<{
  activeConsolePage?: string
  activeAgentPage?: AgentConsolePage | string
  passwordResetRequestKey?: number
  selectedApplicationCode?: string
}>()

const emit = defineEmits<{
  'update:selectedApplicationCode': [code: string]
  'application-context-change': [context: {
    selectedCode: string
    selectedLabel: string
    options: ApplicationFilterOption[]
  }]
}>()

const authStore = useAuthStore()
const message = useMessage()

const overview = ref<CreditsAdminOverview | null>(null)
const agentOverview = ref<AgentOperationsOverview | null>(null)
const platformAgents = ref<PlatformAgentProfile[]>([])
const adminPolicyOverrides = ref<PlatformAdminPolicyOverride[]>([])
const agentPolicyOverrides = ref<PlatformAgentPolicyOverride[]>([])
const settlementApplications = ref<PlatformSettlementApplication[]>([])
const platformDashboard = ref<PlatformDashboard | null>(null)
const commissionPolicy = ref<CommissionPolicy | null>(null)
const platformLedgerPage = ref(1)
const platformLedgerPageSize = ref(20)
const isLoading = ref(false)
const lastError = ref<string | null>(null)
const activeRole = ref<RoleTab>('developer')
const selectedApplicationCode = computed({
  get: () => props.selectedApplicationCode || 'all',
  set: (code: string) => emit('update:selectedApplicationCode', code),
})
const dashboardTrendPeriod = ref<TrendPeriod>('today')
const dashboardTrendMetric = ref<TrendMetric>('recharge')
const dashboardTrendChartRef = ref<HTMLElement | null>(null)
const dashboardPlanPieChartRef = ref<HTMLElement | null>(null)
const globalCustomerBarChartRef = ref<HTMLElement | null>(null)
const globalCustomerPieChartRef = ref<HTMLElement | null>(null)
const globalLedgerConsumerBarChartRef = ref<HTMLElement | null>(null)
const globalFunctionUsagePieChartRef = ref<HTMLElement | null>(null)
const agentConsumerBarChartRef = ref<HTMLElement | null>(null)
const agentUserTypePieChartRef = ref<HTMLElement | null>(null)
const agentLedgerConsumerBarChartRef = ref<HTMLElement | null>(null)
const agentFunctionUsagePieChartRef = ref<HTMLElement | null>(null)
const accountCreationPolicyState = reactive({ ...defaultAccountCreationPolicyState })
if (!authStore.agentWorkflowsEnabled) { accountCreationPolicyState.developerAllowsAdminCreateAgentsAndUsers=false; accountCreationPolicyState.developerAllowsAgentCreateUsers=false; accountCreationPolicyState.adminAllowsAgentCreateUsers=false; accountCreationPolicyState.adminAllowsUserBecomeAgent=false; }
const isCreateAccountModalOpen = ref(false)
const isCreatingAccount = ref(false)
const isAdjustCreditsModalOpen = ref(false)
const isAdjustingCredits = ref(false)
const isDeleteAccountModalOpen = ref(false)
const isDeletingAccount = ref(false)
const isAgentDepositAdjustmentModalOpen = ref(false)
const isPasswordResetModalOpen = ref(false)
const isResettingPassword = ref(false)
const isConnectApplicationModalOpen = ref(false)
const isConnectingApplication = ref(false)
const promotingUserId = ref<string | null>(null)
const disablingAgentUserId = ref<string | null>(null)
const confirmingSettlementId = ref<string | null>(null)
const approvingSettlementId = ref<string | null>(null)
const updatingAdminPolicyUserId = ref<string | null>(null)
const updatingAgentPolicyUserId = ref<string | null>(null)
const updatingAgentCommissionUserId = ref<string | null>(null)
const updatingAgentDepositUserId = ref<string | null>(null)
const updatingFunctionKey = ref<string | null>(null)
const adminAgentSearchQuery = ref('')
const adminCustomerSearchQuery = ref('')
const selectedCustomerAgentUserId = ref<string | null>(null)
const customerAgentDropdownSearchQuery = ref('')
const agentCustomerSearchQuery = ref('')
const selectedCapabilityUser = ref<CreditsCustomerProfile | null>(null)
const selectedAdjustCreditsUser = ref<PlatformCreditsAdjustmentTarget | null>(null)
const selectedAgentDepositUser = ref<PlatformAgentPolicyOverride | null>(null)
const selectedCommissionDetail = ref<AgentOperationsCommissionPreview | null>(null)
const selectedAgentCustomer = ref<AgentOperationsCustomer | null>(null)
const agentCustomerLedger = ref<AgentCustomerLedger | null>(null)
const agentTransactionsLedger = ref<AgentTransactionsLedger | null>(null)
const platformTransactionsLedger = ref<PlatformTransactionsLedger | null>(null)
const isAgentCustomerLedgerOpen = ref(false)
const isLoadingAgentCustomerLedger = ref(false)
const isLoadingAgentTransactionsLedger = ref(false)
const isLoadingPlatformTransactionsLedger = ref(false)
const isEditAgentCustomerOpen = ref(false)
const isUpdatingAgentCustomer = ref(false)
const isEditPlatformUserProfileOpen = ref(false)
const isUpdatingPlatformUserProfile = ref(false)
const subscriptionPlans = ref<PlatformSubscriptionPlan[]>([])
const isLoadingPlanOptions = ref(false)
const loadedPlanApplicationCode = ref('')
const connectSubscriptionPlans = ref<PlatformSubscriptionPlan[]>([])
const isLoadingConnectPlanOptions = ref(false)
const loadedConnectPlanApplicationCode = ref('')
const interactionFeedback = ref('')
const createAccountForm = reactive({
  targetRole: 'user' as PlatformUserTargetRole,
  username: '',
  password: '',
  displayName: '',
  phone: '',
  email: '',
  applicationCode: 'simulation',
  planCode: '' as PlatformUserPlanCode,
  initialPoints: 0 as number | null,
})
const editAgentCustomerForm = reactive({
  relationId: '',
  displayName: '',
  phone: '',
})
const editPlatformUserProfileForm = reactive({
  userId: '',
  username: '',
  targetRole: 'user' as PlatformEditableProfileRole,
  displayName: '',
  phone: '',
})
const adjustCreditsForm = reactive({
  points: 0 as number | null,
  reason: '',
  classifyAsRecharge: true,
})
const deleteAccountForm = reactive({
  reason: '',
})
const passwordResetForm = reactive({
  userId: '',
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',
})
const connectApplicationForm = reactive({
  userId: '',
  username: '',
  displayName: '',
  targetRole: 'user' as 'agent' | 'user',
  applicationCode: '',
  planCode: '',
  existingApplications: [] as string[],
  availableApplications: [] as string[],
})
const agentCommissionRateDrafts = reactive<Record<string, number | null>>({})
const agentDepositAdjustmentDrafts = reactive<Record<string, number | null>>({})

let dashboardTrendChartInstance: echarts.ECharts | null = null
let dashboardPlanPieChartInstance: echarts.ECharts | null = null
let globalCustomerBarChartInstance: echarts.ECharts | null = null
let globalCustomerPieChartInstance: echarts.ECharts | null = null
let globalLedgerConsumerBarChartInstance: echarts.ECharts | null = null
let globalFunctionUsagePieChartInstance: echarts.ECharts | null = null
let agentConsumerBarChartInstance: echarts.ECharts | null = null
let agentUserTypePieChartInstance: echarts.ECharts | null = null
let agentLedgerConsumerBarChartInstance: echarts.ECharts | null = null
let agentFunctionUsagePieChartInstance: echarts.ECharts | null = null

const tablePagination = {
  pageSize: 20,
  pageSizes: [10, 20, 50, 100],
  showSizePicker: true,
  showQuickJumper: true,
}

const compactTablePagination = {
  pageSize: 10,
  pageSizes: [10, 20, 50],
  showSizePicker: true,
  showQuickJumper: true,
}

const ledgerTablePagination = {
  pageSize: 20,
  pageSizes: [20, 50, 100],
  showSizePicker: true,
  showQuickJumper: true,
}

const platformLedgerPagination = computed(() => ({
  page: platformTransactionsLedger.value?.page ?? platformLedgerPage.value,
  pageSize: platformTransactionsLedger.value?.pageSize ?? platformLedgerPageSize.value,
  itemCount: platformTransactionsLedger.value?.total ?? globalLedgerTransactions.value.length,
  pageSizes: [20, 50, 100],
  showSizePicker: true,
  showQuickJumper: true,
  remote: true,
  onUpdatePage(page: number) {
    platformLedgerPage.value = page
    void loadPlatformTransactionsLedger()
  },
  onUpdatePageSize(pageSize: number) {
    platformLedgerPageSize.value = pageSize
    platformLedgerPage.value = 1
    void loadPlatformTransactionsLedger()
  },
}))

const functionNameZhByCode: Record<string, string> = {
  'showroom-light': '展厅棚拍',
  'outdoor-scene': '户外实景',
  'road-motion': '行驶动效',
  'sky-studio': '天空影棚',
  'paint-refresh': '烤漆翻新',
  'light-consistency': '光污美化',
  'interior-clean': '内饰清洁',
  'interior-collage': '内饰拼接',
  'watermark-remove': '去水印',
  'creative-image': '创意生图',
  'short-video': '短视频生成',
  'video-generation': '视频生成',
  'language-conversion': '语言转换',
  'batch-new-exterior': '批量上新',
  'batch-new-wall-logo-scene': '批量墙标场景',
  'batch-new-interior': '批量内饰',
  single_image_generate: '单图生成',
  batch_item_generate: '批量单项生成',
  model_generate: '模特图生成',
  try_on_generate: '试穿图生成',
  lifestyle_photo: '生活方式图生成',
}
watch(
  () => createAccountForm.applicationCode,
  (applicationCode) => {
    if (isCreateAccountModalOpen.value && createAccountForm.targetRole!=='user') {
      void loadCreatePlanOptions(applicationCode)
    }
  },
)
watch(
  () => connectApplicationForm.applicationCode,
  (applicationCode) => {
    if (isConnectApplicationModalOpen.value) {
      void loadConnectPlanOptions(applicationCode)
    }
  },
)
const functionPointDrafts = reactive<Record<string, number | null>>({})

const roleTabs: Array<{ value: RoleTab; label: string; description: string; icon: string }> = [
  {
    value: 'developer',
    label: '开发者',
    description: '全局 CRUD、全部流水余额、积分增减',
    icon: 'mdi:code-tags',
  },
  {
    value: 'admin',
    label: '公司管理员',
    description: '销售运营、代理商表、全平台只读',
    icon: 'mdi:shield-account-outline',
  },
  {
    value: 'agent',
    label: '代理商',
    description: '创建 User，读取自建 User 流水余额',
    icon: 'mdi:handshake-outline',
  },
]

const visibleRoleTabs = computed(() => {
  const role = authStore.role
  if (role === 'developer' || role === 'admin' || role === 'agent') {
    return roleTabs.filter((tab) => tab.value === role)
  }
  return []
})

watchEffect(() => {
  if (!visibleRoleTabs.value.some((tab) => tab.value === activeRole.value)) {
    activeRole.value = visibleRoleTabs.value[0]?.value ?? 'agent'
  }
})

watch(
  () => props.passwordResetRequestKey,
  (requestKey, previousRequestKey) => {
    if (!requestKey || requestKey === previousRequestKey) return
    openCurrentBackOfficePasswordResetModal()
  },
)

async function refreshOverview() {
  isLoading.value = true
  try {
    const [
      creditsResult,
      operationsResult,
      dashboardResult,
      agentsResult,
      adminPolicyResult,
      agentPolicyResult,
      commissionPolicyResult,
      settlementApplicationsResult,
    ] =
      await Promise.allSettled([
        getCreditsAdminOverview(),
        getAgentOperationsOverview(),
        getPlatformDashboard(),
        authStore.role === 'developer' || authStore.role === 'admin'
          ? getPlatformAgents()
          : Promise.resolve({ items: [] }),
        authStore.role === 'developer' || authStore.role === 'admin'
          ? getPlatformAdminPolicyOverrides()
          : Promise.resolve({ items: [] }),
        authStore.role === 'developer' || authStore.role === 'admin' || authStore.role === 'agent'
          ? getPlatformAgentPolicyOverrides()
          : Promise.resolve({ items: [] }),
        getCommissionPolicy(),
        authStore.role === 'developer' || authStore.role === 'admin'
          ? getPlatformSettlementApplications()
          : Promise.resolve({ items: [] }),
      ])

    if (creditsResult.status === 'fulfilled') {
      overview.value = creditsResult.value
    }
    if (operationsResult.status === 'fulfilled') {
      agentOverview.value = operationsResult.value
    }
    if (dashboardResult.status === 'fulfilled') {
      platformDashboard.value = dashboardResult.value
    }
    if (agentsResult.status === 'fulfilled') {
      platformAgents.value = agentsResult.value.items
    }
    if (adminPolicyResult.status === 'fulfilled') {
      adminPolicyOverrides.value = adminPolicyResult.value.items
    }
    if (agentPolicyResult.status === 'fulfilled') {
      agentPolicyOverrides.value = agentPolicyResult.value.items
    }
    if (commissionPolicyResult.status === 'fulfilled') {
      commissionPolicy.value = commissionPolicyResult.value
    }
    if (settlementApplicationsResult.status === 'fulfilled') {
      settlementApplications.value = settlementApplicationsResult.value.items
    }

    const primaryError = [creditsResult, dashboardResult].find((item) => item.status === 'rejected')
    if (primaryError?.status === 'rejected') {
      const text = primaryError.reason instanceof Error
        ? primaryError.reason.message
        : '加载积分平台控制台概览失败'
      lastError.value = text
      message.error(text)
    } else {
      lastError.value = null
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : '加载积分平台控制台概览失败'
    lastError.value = text
    message.error(text)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void refreshOverview()
  window.addEventListener('resize', resizeConsoleCharts)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeConsoleCharts)
  dashboardTrendChartInstance?.dispose()
  dashboardTrendChartInstance = null
  dashboardPlanPieChartInstance?.dispose()
  dashboardPlanPieChartInstance = null
  globalCustomerBarChartInstance?.dispose()
  globalCustomerBarChartInstance = null
  globalCustomerPieChartInstance?.dispose()
  globalCustomerPieChartInstance = null
  globalLedgerConsumerBarChartInstance?.dispose()
  globalLedgerConsumerBarChartInstance = null
  globalFunctionUsagePieChartInstance?.dispose()
  globalFunctionUsagePieChartInstance = null
  agentConsumerBarChartInstance?.dispose()
  agentConsumerBarChartInstance = null
  agentUserTypePieChartInstance?.dispose()
  agentUserTypePieChartInstance = null
  agentLedgerConsumerBarChartInstance?.dispose()
  agentLedgerConsumerBarChartInstance = null
  agentFunctionUsagePieChartInstance?.dispose()
  agentFunctionUsagePieChartInstance = null
})

const applications = computed(() => overview.value?.applications ?? [])
const applicationFunctions = computed(() => overview.value?.applicationFunctions ?? [])
const customerProfiles = computed(() => overview.value?.customerProfiles ?? [])
const agentCustomers = computed(() => agentOverview.value?.customers ?? [])
const agentCommissions = computed(() => agentOverview.value?.commissionPreviews ?? [])
const agentSettlements = computed(() =>
  (agentOverview.value?.settlementBills ?? []).filter((item) => item.status !== 'draft'),
)
const dashboardMetrics = computed(() => platformDashboard.value?.metrics ?? null)
const activeDeveloperConsolePage = computed<DeveloperConsolePage>(() => {
  const value = props.activeConsolePage
  if (
    value === 'developer-dashboard' ||
    value === 'developer-admins' ||
    value === 'developer-agents' ||
    value === 'developer-customers' ||
    value === 'developer-transactions' ||
    value === 'developer-settlements' ||
    value === 'developer-billing'
  ) {
    return value
  }
  return 'developer-dashboard'
})

const activeAdminConsolePage = computed<AdminConsolePage>(() => {
  const value = props.activeConsolePage
  if (
    value === 'admin-dashboard' ||
    value === 'admin-agents' ||
    value === 'admin-users' ||
    value === 'admin-transactions' ||
    value === 'admin-settlements'
  ) {
    return value
  }
  return 'admin-dashboard'
})

const activeAgentConsolePage = computed<AgentConsolePage>(() => {
  const value = props.activeConsolePage ?? props.activeAgentPage
  if (
    value === 'agent-dashboard' ||
    value === 'agent-customers' ||
    value === 'agent-consumption' ||
    value === 'agent-settlements'
  ) {
    return value
  }
  return 'agent-dashboard'
})

const activeRoleDashboardPage = computed(() => {
  if (activeRole.value === 'developer') return activeDeveloperConsolePage.value === 'developer-dashboard'
  if (activeRole.value === 'admin') return activeAdminConsolePage.value === 'admin-dashboard'
  return activeAgentConsolePage.value === 'agent-dashboard'
})

const registeredApplicationsByCode = computed(
  () => new Map(applications.value.map((item) => [item.code, item])),
)

const applicationCatalog = computed(() =>
  reusableCreditsApplicationCatalog.map((item) => {
    const registered = registeredApplicationsByCode.value.get(item.code)
    return {
      ...item,
      name: formatReusableCreditsApplicationName(item.code) || item.name,
      statusText: registered && registered.status !== 'planned'
        ? '已注册'
        : item.status === 'planned' || registered?.status === 'planned'
          ? '规划中'
          : item.status,
    }
  }),
)

const applicationFilterOptions = computed(() => [
  { code: 'all', name: '全部应用', statusText: '平台视图' },
  ...applicationCatalog.value.map((item) => ({
    code: item.code,
    name: item.name,
    statusText: item.statusText,
  })),
])

const applicationSelectOptions = computed(() =>
  applicationCatalog.value.map((item) => ({
    label: `${item.name} (${item.code})`,
    value: item.code,
  })),
)

const connectApplicationSelectOptions = computed(() => {
  const available = new Set(connectApplicationForm.availableApplications)
  return applicationCatalog.value
    .filter((item) => available.size === 0 || available.has(item.code))
    .map((item) => ({
      label: `${item.name} (${item.code})`,
      value: item.code,
    }))
})

const trendPeriodOptions: Array<{ value: TrendPeriod; label: string }> = [
  { value: 'today', label: '今日' },
  { value: '7d', label: '7天' },
  { value: '30d', label: '30天' },
]

const trendMetricOptions: Array<{ value: TrendMetric; label: string }> = [
  { value: 'consume', label: '积分消费' },
  { value: 'recharge', label: '积分充值' },
]

const planOptions = computed(() =>
  subscriptionPlans.value.map((plan) => ({
    label: `${plan.name} / ${formatCurrencyAmount(plan.price)} / ${Number(plan.giftPoints).toLocaleString('zh-CN')} 积分`,
    value: plan.code,
  })),
)

const connectPlanOptions = computed(() =>
  connectSubscriptionPlans.value.map((plan) => ({
    label: `${plan.name} / ${formatCurrencyAmount(plan.price)} / ${Number(plan.giftPoints).toLocaleString('zh-CN')} 积分`,
    value: plan.code,
  })),
)

const dashboardTrendTitle = computed(() => '积分充值&消费')

const dashboardTrendEvents = computed(() => platformDashboard.value?.trends ?? [])

const scopedDashboardTrendEvents = computed(() =>
  dashboardTrendEvents.value.filter((item) => matchesSelectedApplication(item.applicationCode)),
)

const adminSystemOverviewList = computed(() => {
  const metrics = dashboardMetrics.value
  const platformApplications = applications.value.filter((item) => item.status !== 'planned').length
  const appScoped = selectedApplicationCode.value !== 'all'
  const dashboardTime = new Date(platformDashboard.value?.generatedAt ?? '')
  const todayEnd = Number.isNaN(dashboardTime.getTime()) ? new Date() : dashboardTime
  todayEnd.setHours(23, 59, 59, 999)
  const todayStart = new Date(todayEnd)
  todayStart.setHours(0, 0, 0, 0)
  const scopedTodayEvents = scopedDashboardTrendEvents.value.filter((item) => {
    const time = new Date(item.occurredAt).getTime()
    return time >= todayStart.getTime() && time <= todayEnd.getTime()
  })
  const scopedTodayRecharge = scopedTodayEvents
    .filter((item) => item.metric === 'recharge')
    .reduce((sum, item) => sum + Math.abs(Number(item.value ?? 0)), 0)
  const scopedTodayConsume = scopedTodayEvents
    .filter((item) => item.metric === 'consume')
    .reduce((sum, item) => sum + Math.abs(Number(item.value ?? 0)), 0)
  const uniqueRegularUserCount = new Set(filteredRegularUserProfiles.value.map((item) => item.userId)).size
  const uniqueAgentCount = new Set(filteredAgentProfiles.value.map((item) => item.userId)).size
  const scopedCustomerCount = activeRole.value === 'agent'
    ? filteredAgentCustomers.value.length
    : uniqueRegularUserCount + uniqueAgentCount
  return [
    {
      key: 'platform-applications',
      label: '平台应用',
      value: String(appScoped ? 1 : metrics?.platformApplicationCount ?? platformApplications),
    },
    {
      key: 'customer-accounts',
      label: activeRole.value === 'agent' ? '客户数量' : '客户数量(含代理)',
      value: String(
        activeRole.value === 'agent'
          ? (appScoped ? scopedCustomerCount : metrics?.customerAccountCount ?? scopedCustomerCount)
          : scopedCustomerCount,
      ),
    },
    {
      key: 'pending-settlement',
      label: '待结算',
      value: String(
        appScoped && activeRole.value === 'agent'
          ? filteredAgentDraftSettlementCount.value
          : metrics?.pendingSettlementCount ?? metrics?.draftSettlementCount ?? 0,
      ),
    },
    {
      key: 'today-orders',
      label: '今日充值积分',
      value: Number(appScoped ? scopedTodayRecharge : metrics?.todayRechargedCredits ?? metrics?.todayOrderAmount ?? 0).toLocaleString('zh-CN'),
    },
    {
      key: 'today-consume',
      label: '今日消耗积分',
      value: Number(appScoped ? scopedTodayConsume : metrics?.todayConsumedCredits ?? 0).toLocaleString('zh-CN'),
    },
  ]
})

function formatApplicationDisplayName(value?: string | null) {
  return formatReusableCreditsApplicationName(value) || '-'
}

function formatApplicationList(values?: readonly string[] | null) {
  return values?.map((item) => formatApplicationDisplayName(item)).join(' / ') || '-'
}

function formatFunctionDisplayName(functionCode?: string | null, functionName?: string | null) {
  const normalizedCode = functionCode?.trim()
  if (normalizedCode && functionNameZhByCode[normalizedCode]) {
    return functionNameZhByCode[normalizedCode]
  }

  const catalogFunction = applicationFunctions.value.find((item) => item.code === normalizedCode)
  if (catalogFunction?.name && functionNameZhByCode[catalogFunction.code]) {
    return functionNameZhByCode[catalogFunction.code]
  }

  return functionName || normalizedCode || '未标记功能'
}

function getTrendPeriodRange(period: TrendPeriod) {
  const dashboardTime = new Date(platformDashboard.value?.generatedAt ?? '')
  const end = Number.isNaN(dashboardTime.getTime()) ? new Date() : dashboardTime
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)

  if (period === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (period === '7d') {
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)
  } else {
    start.setDate(start.getDate() - 29)
    start.setHours(0, 0, 0, 0)
  }

  return { start, end }
}

function buildDashboardTrendSeries() {
  const { start, end } = getTrendPeriodRange(dashboardTrendPeriod.value)
  const filtered = scopedDashboardTrendEvents.value.filter((item) => {
    const time = new Date(item.occurredAt).getTime()
    return (
      item.metric === dashboardTrendMetric.value &&
      time >= start.getTime() &&
      time <= end.getTime()
    )
  })
  const labels: string[] = []
  const values: number[] = []

  if (dashboardTrendPeriod.value === 'today') {
    for (let hour = 0; hour < 24; hour += 1) {
      labels.push(`${String(hour).padStart(2, '0')}:00`)
      const hourStart = new Date(start)
      hourStart.setHours(hour, 0, 0, 0)
      const hourEnd = new Date(start)
      hourEnd.setHours(hour, 59, 59, 999)
      const total = filtered
        .filter((item) => {
          const time = new Date(item.occurredAt).getTime()
          return time >= hourStart.getTime() && time <= hourEnd.getTime()
        })
        .reduce((sum, item) => sum + Math.abs(Number(item.value ?? 0)), 0)
      values.push(total)
    }
    return { labels, values }
  }

  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    const dayStart = new Date(cursor)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(cursor)
    dayEnd.setHours(23, 59, 59, 999)
    labels.push(new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(cursor))
    const total = filtered
      .filter((item) => {
        const time = new Date(item.occurredAt).getTime()
        return time >= dayStart.getTime() && time <= dayEnd.getTime()
      })
      .reduce((sum, item) => sum + Math.abs(Number(item.value ?? 0)), 0)
    values.push(total)
    cursor.setDate(cursor.getDate() + 1)
  }

  return { labels, values }
}

const dashboardPlanPieData = computed(() => {
  const rows = platformDashboard.value?.planDistribution ?? []
  return rows
    .filter((item) => selectedApplicationCode.value === 'all' || item.applicationCode === selectedApplicationCode.value)
    .filter((item) => Number(item.count ?? 0) > 0)
    .map((item) => ({
      name: selectedApplicationCode.value === 'all'
        ? `${formatApplicationDisplayName(item.applicationCode)} · ${item.planName}`
        : item.planName,
      value: Number(item.count ?? 0),
    }))
})

function renderDashboardPlanPieChart() {
  if (!activeRoleDashboardPage.value || !dashboardPlanPieChartRef.value) {
    if (!dashboardPlanPieChartRef.value && dashboardPlanPieChartInstance) {
      dashboardPlanPieChartInstance.dispose()
      dashboardPlanPieChartInstance = null
    }
    return
  }

  if (
    dashboardPlanPieChartInstance &&
    dashboardPlanPieChartInstance.getDom() !== dashboardPlanPieChartRef.value
  ) {
    dashboardPlanPieChartInstance.dispose()
    dashboardPlanPieChartInstance = null
  }

  if (!dashboardPlanPieChartInstance) {
    dashboardPlanPieChartInstance = echarts.init(dashboardPlanPieChartRef.value)
  }

  const data = dashboardPlanPieData.value
  dashboardPlanPieChartInstance.resize()
  dashboardPlanPieChartInstance.setOption({
    animationDuration: 480,
    color: ['#2f6bff', '#28c7b7', '#f6c343', '#ef7d00', '#7c3aed', '#14b8a6'],
    graphic: { elements: [{ type: 'text', left: 'center', top: 'middle', invisible: data.length > 0, style: { text: '暂无套餐数据', fill: '#94a3b8', fontSize: 13 } }] },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: { name: string; value: number; percent: number }) =>
        `${params.name}<br/>账号数：${Number(params.value).toLocaleString('zh-CN')}<br/>占比：${params.percent}%`,
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      left: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#64748b', fontSize: 12, fontWeight: 800 },
    },
    series: [
      {
        name: '套餐占比',
        type: 'pie',
        radius: data.length ? ['42%', '86%'] : ['0%', '0%'],
        center: ['50%', '47%'],
        avoidLabelOverlap: true,
        label: {
          show: data.length > 0,
          formatter: '{d}%',
          color: '#334155',
          fontSize: 13,
          fontWeight: 800,
        },
        labelLine: { show: data.length > 0, length: 8, length2: 6 },
        data,
      },
    ],
  })
  requestAnimationFrame(() => {
    dashboardPlanPieChartInstance?.resize()
  })
}

function renderDashboardTrendChart() {
  if (!activeRoleDashboardPage.value || !dashboardTrendChartRef.value) {
    if (!dashboardTrendChartRef.value && dashboardTrendChartInstance) {
      dashboardTrendChartInstance.dispose()
      dashboardTrendChartInstance = null
    }
    return
  }

  if (
    dashboardTrendChartInstance &&
    dashboardTrendChartInstance.getDom() !== dashboardTrendChartRef.value
  ) {
    dashboardTrendChartInstance.dispose()
    dashboardTrendChartInstance = null
  }

  if (!dashboardTrendChartInstance) {
    dashboardTrendChartInstance = echarts.init(dashboardTrendChartRef.value)
  }

  const { labels, values } = buildDashboardTrendSeries()
  const accent = dashboardTrendMetric.value === 'consume' ? '#2f6bff' : '#18b77d'
  const valueLabel = dashboardTrendMetric.value === 'consume' ? '消费积分' : '充值积分'

  dashboardTrendChartInstance.resize()
  dashboardTrendChartInstance.setOption({
    animationDuration: 480,
    grid: { left: 12, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: Array<{ axisValue: string; data: number }>) => {
        const point = params[0]
        if (!point) return ''
        return `${point.axisValue}<br/>${valueLabel}：${Number(point.data).toLocaleString('zh-CN')}`
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        formatter: (value: number) => (value >= 10000 ? `${value / 10000}万` : String(value)),
      },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { width: 2.5, color: accent },
        itemStyle: { color: accent },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${accent}33` },
            { offset: 1, color: `${accent}05` },
          ]),
        },
        data: values,
      },
    ],
  })
  requestAnimationFrame(() => {
    dashboardTrendChartInstance?.resize()
  })
}

function renderAgentConsumerBarChart() {
  if (
    activeRole.value !== 'agent' ||
    activeAgentConsolePage.value !== 'agent-customers' ||
    !agentConsumerBarChartRef.value
  ) {
    if (!agentConsumerBarChartRef.value && agentConsumerBarChartInstance) {
      agentConsumerBarChartInstance.dispose()
      agentConsumerBarChartInstance = null
    }
    return
  }

  if (
    agentConsumerBarChartInstance &&
    agentConsumerBarChartInstance.getDom() !== agentConsumerBarChartRef.value
  ) {
    agentConsumerBarChartInstance.dispose()
    agentConsumerBarChartInstance = null
  }

  if (!agentConsumerBarChartInstance) {
    agentConsumerBarChartInstance = echarts.init(agentConsumerBarChartRef.value)
  }

  const rows = agentTopTopUpCustomers.value
  const labels = rows.map((item) => item.customerDisplayName || item.customerUsername).reverse()
  const values = rows.map((item) => Number(item.totalTopUpCredits ?? 0)).reverse()

  agentConsumerBarChartInstance.resize()
  agentConsumerBarChartInstance.setOption({
    animationDuration: 480,
    color: ['#2f6bff'],
    grid: { left: 16, right: 20, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: Array<{ axisValue: string; data: number; dataIndex: number }>) => {
        const point = params[0]
        if (!point) return ''
        const row = [...rows].reverse()[point.dataIndex]
        return [
          point.axisValue,
          `累计充值积分：${Number(point.data).toLocaleString('zh-CN')} 积分`,
          `当前余额：${formatCreditsBalance(row)}`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.14)' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        formatter: (value: number) => (value >= 10000 ? `${Number(value / 10000).toFixed(1)}万` : String(value)),
      },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#475569',
        fontSize: 12,
        fontWeight: 800,
        width: 96,
        overflow: 'truncate',
      },
    },
    series: [
      {
        name: '累计充值积分',
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 6, 6, 0] },
        label: {
          show: true,
          position: 'right',
          color: '#334155',
          fontSize: 12,
          fontWeight: 800,
          formatter: (params: { value: number }) =>
            Number(params.value).toLocaleString('zh-CN'),
        },
        data: values,
      },
    ],
  })
  requestAnimationFrame(() => {
    agentConsumerBarChartInstance?.resize()
  })
}

function isGlobalCustomerChartsVisible() {
  return (
    (activeRole.value === 'developer' && activeDeveloperConsolePage.value === 'developer-customers') ||
    (activeRole.value === 'admin' && activeAdminConsolePage.value === 'admin-users')
  )
}

function isGlobalLedgerChartsVisible() {
  return (
    (activeRole.value === 'developer' && activeDeveloperConsolePage.value === 'developer-transactions') ||
    (activeRole.value === 'admin' && activeAdminConsolePage.value === 'admin-transactions')
  )
}

function renderGlobalCustomerBarChart() {
  if (!isGlobalCustomerChartsVisible() || !globalCustomerBarChartRef.value) {
    if (!globalCustomerBarChartRef.value && globalCustomerBarChartInstance) {
      globalCustomerBarChartInstance.dispose()
      globalCustomerBarChartInstance = null
    }
    return
  }

  if (
    globalCustomerBarChartInstance &&
    globalCustomerBarChartInstance.getDom() !== globalCustomerBarChartRef.value
  ) {
    globalCustomerBarChartInstance.dispose()
    globalCustomerBarChartInstance = null
  }

  if (!globalCustomerBarChartInstance) {
    globalCustomerBarChartInstance = echarts.init(globalCustomerBarChartRef.value)
  }

  const rows = globalTopTopUpCustomers.value
  const labels = rows.map((item) => item.displayName || item.username).reverse()
  const values = rows.map((item) => Number(item.totalTopUpCredits ?? 0)).reverse()

  globalCustomerBarChartInstance.resize()
  globalCustomerBarChartInstance.setOption({
    animationDuration: 480,
    color: ['#2f6bff'],
    grid: { left: 16, right: 20, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: Array<{ axisValue: string; data: number }>) => {
        const point = params[0]
        return point ? `${point.axisValue}<br/>累计充值积分：${Number(point.data).toLocaleString('zh-CN')} 积分` : ''
      },
    },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.14)' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        formatter: (value: number) => (value >= 10000 ? `${Number(value / 10000).toFixed(1)}万` : String(value)),
      },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 12, fontWeight: 800, width: 96, overflow: 'truncate' },
    },
    series: [
      {
        name: '累计充值积分',
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 6, 6, 0] },
        label: {
          show: true,
          position: 'right',
          color: '#334155',
          fontSize: 12,
          fontWeight: 800,
          formatter: (params: { value: number }) => Number(params.value).toLocaleString('zh-CN'),
        },
        data: values,
      },
    ],
  })
  requestAnimationFrame(() => globalCustomerBarChartInstance?.resize())
}

function renderGlobalCustomerPieChart() {
  if (!isGlobalCustomerChartsVisible() || !globalCustomerPieChartRef.value) {
    if (!globalCustomerPieChartRef.value && globalCustomerPieChartInstance) {
      globalCustomerPieChartInstance.dispose()
      globalCustomerPieChartInstance = null
    }
    return
  }

  if (
    globalCustomerPieChartInstance &&
    globalCustomerPieChartInstance.getDom() !== globalCustomerPieChartRef.value
  ) {
    globalCustomerPieChartInstance.dispose()
    globalCustomerPieChartInstance = null
  }

  if (!globalCustomerPieChartInstance) {
    globalCustomerPieChartInstance = echarts.init(globalCustomerPieChartRef.value)
  }

  const data = globalCustomerUserTypePieData.value
  const hasData = data.some((item) => item.value > 0)

  globalCustomerPieChartInstance.resize()
  globalCustomerPieChartInstance.setOption({
    animationDuration: 480,
    color: ['#18b77d', '#f59e0b', '#94a3b8'],
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: { name: string; value: number; percent: number }) =>
        `${params.name}<br/>客户数：${Number(params.value).toLocaleString('zh-CN')}<br/>占比：${params.percent}%`,
    },
    legend: {
      bottom: 0,
      left: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#64748b', fontSize: 12, fontWeight: 800 },
    },
    series: [
      {
        name: '用户类型',
        type: 'pie',
        radius: hasData ? ['44%', '76%'] : ['0%', '0%'],
        center: ['50%', '43%'],
        label: { formatter: '{d}%', color: '#334155', fontSize: 13, fontWeight: 800 },
        labelLine: { length: 8, length2: 6 },
        data: hasData ? data : [{ name: '暂无客户', value: 1, itemStyle: { color: '#e2e8f0' } }],
      },
    ],
  })
  requestAnimationFrame(() => globalCustomerPieChartInstance?.resize())
}

function renderGlobalLedgerConsumerBarChart() {
  if (!isGlobalLedgerChartsVisible() || !globalLedgerConsumerBarChartRef.value) {
    if (!globalLedgerConsumerBarChartRef.value && globalLedgerConsumerBarChartInstance) {
      globalLedgerConsumerBarChartInstance.dispose()
      globalLedgerConsumerBarChartInstance = null
    }
    return
  }

  if (
    globalLedgerConsumerBarChartInstance &&
    globalLedgerConsumerBarChartInstance.getDom() !== globalLedgerConsumerBarChartRef.value
  ) {
    globalLedgerConsumerBarChartInstance.dispose()
    globalLedgerConsumerBarChartInstance = null
  }

  if (!globalLedgerConsumerBarChartInstance) {
    globalLedgerConsumerBarChartInstance = echarts.init(globalLedgerConsumerBarChartRef.value)
  }

  const rows = globalLedgerTopCreditConsumers.value
  const labels = rows.map((item) => item.customerDisplayName || item.customerUsername || '客户').reverse()
  const values = rows.map((item) => item.consumedCredits).reverse()

  globalLedgerConsumerBarChartInstance.resize()
  globalLedgerConsumerBarChartInstance.setOption({
    animationDuration: 480,
    color: ['#2f6bff'],
    grid: { left: 16, right: 20, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: Array<{ axisValue: string; data: number; dataIndex: number }>) => {
        const point = params[0]
        if (!point) return ''
        const row = [...rows].reverse()[point.dataIndex]
        return [
          point.axisValue,
          `累计消费：${Number(point.data).toLocaleString('zh-CN')} 积分`,
          `消费次数：${Number(row?.transactionCount ?? 0).toLocaleString('zh-CN')}`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.14)' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        formatter: (value: number) => (value >= 10000 ? `${value / 10000}万` : String(value)),
      },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 12, fontWeight: 800, width: 96, overflow: 'truncate' },
    },
    series: [
      {
        name: '累计消费',
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 6, 6, 0] },
        label: {
          show: true,
          position: 'right',
          color: '#334155',
          fontSize: 12,
          fontWeight: 800,
          formatter: (params: { value: number }) => Number(params.value).toLocaleString('zh-CN'),
        },
        data: values,
      },
    ],
  })
  requestAnimationFrame(() => globalLedgerConsumerBarChartInstance?.resize())
}

function renderGlobalFunctionUsagePieChart() {
  if (!isGlobalLedgerChartsVisible() || !globalFunctionUsagePieChartRef.value) {
    if (!globalFunctionUsagePieChartRef.value && globalFunctionUsagePieChartInstance) {
      globalFunctionUsagePieChartInstance.dispose()
      globalFunctionUsagePieChartInstance = null
    }
    return
  }

  if (
    globalFunctionUsagePieChartInstance &&
    globalFunctionUsagePieChartInstance.getDom() !== globalFunctionUsagePieChartRef.value
  ) {
    globalFunctionUsagePieChartInstance.dispose()
    globalFunctionUsagePieChartInstance = null
  }

  if (!globalFunctionUsagePieChartInstance) {
    globalFunctionUsagePieChartInstance = echarts.init(globalFunctionUsagePieChartRef.value)
  }

  const data = globalFunctionUsagePieData.value.map((item) => ({
    name: item.name,
    value: item.value,
    consumedCredits: item.consumedCredits,
  }))
  const hasData = data.some((item) => item.value > 0)

  globalFunctionUsagePieChartInstance.resize()
  globalFunctionUsagePieChartInstance.setOption({
    animationDuration: 480,
    color: ['#2f6bff', '#27c4b9', '#f7c948', '#f97316', '#8b5cf6'],
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: { name: string; value: number; percent: number; data?: { consumedCredits?: number } }) =>
        `${params.name}<br/>次数：${Number(params.value).toLocaleString('zh-CN')}<br/>消费：${Number(params.data?.consumedCredits ?? 0).toLocaleString('zh-CN')} 积分<br/>占比：${params.percent}%`,
    },
    legend: {
      bottom: 0,
      left: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#64748b', fontSize: 12, fontWeight: 800 },
    },
    series: [
      {
        name: '功能使用',
        type: 'pie',
        radius: hasData ? ['44%', '76%'] : ['0%', '0%'],
        center: ['50%', '43%'],
        label: { formatter: '{d}%', color: '#334155', fontSize: 13, fontWeight: 800 },
        labelLine: { length: 8, length2: 6 },
        data: hasData ? data : [{ name: '暂无功能使用', value: 1, itemStyle: { color: '#e2e8f0' } }],
      },
    ],
  })
  requestAnimationFrame(() => globalFunctionUsagePieChartInstance?.resize())
}

function renderAgentUserTypePieChart() {
  if (
    activeRole.value !== 'agent' ||
    activeAgentConsolePage.value !== 'agent-customers' ||
    !agentUserTypePieChartRef.value
  ) {
    if (!agentUserTypePieChartRef.value && agentUserTypePieChartInstance) {
      agentUserTypePieChartInstance.dispose()
      agentUserTypePieChartInstance = null
    }
    return
  }

  if (
    agentUserTypePieChartInstance &&
    agentUserTypePieChartInstance.getDom() !== agentUserTypePieChartRef.value
  ) {
    agentUserTypePieChartInstance.dispose()
    agentUserTypePieChartInstance = null
  }

  if (!agentUserTypePieChartInstance) {
    agentUserTypePieChartInstance = echarts.init(agentUserTypePieChartRef.value)
  }

  const data = agentUserTypePieData.value
  const hasData = data.some((item) => item.value > 0)

  agentUserTypePieChartInstance.resize()
  agentUserTypePieChartInstance.setOption({
    animationDuration: 480,
    color: ['#18b77d', '#f6c343', '#64748b'],
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: { name: string; value: number; percent: number }) =>
        `${params.name}<br/>人数：${Number(params.value).toLocaleString('zh-CN')}<br/>占比：${params.percent}%`,
    },
    legend: {
      bottom: 0,
      left: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#64748b', fontSize: 12, fontWeight: 800 },
    },
    series: [
      {
        name: '用户类型',
        type: 'pie',
        radius: hasData ? ['44%', '76%'] : ['0%', '0%'],
        center: ['50%', '43%'],
        avoidLabelOverlap: true,
        label: {
          formatter: '{d}%',
          color: '#334155',
          fontSize: 13,
          fontWeight: 800,
        },
        labelLine: { length: 8, length2: 6 },
        data: hasData ? data : [{ name: '暂无客户', value: 1, itemStyle: { color: '#e2e8f0' } }],
      },
    ],
  })
  requestAnimationFrame(() => {
    agentUserTypePieChartInstance?.resize()
  })
}

function renderAgentLedgerConsumerBarChart() {
  if (
    activeRole.value !== 'agent' ||
    activeAgentConsolePage.value !== 'agent-consumption' ||
    !agentLedgerConsumerBarChartRef.value
  ) {
    if (!agentLedgerConsumerBarChartRef.value && agentLedgerConsumerBarChartInstance) {
      agentLedgerConsumerBarChartInstance.dispose()
      agentLedgerConsumerBarChartInstance = null
    }
    return
  }

  if (
    agentLedgerConsumerBarChartInstance &&
    agentLedgerConsumerBarChartInstance.getDom() !== agentLedgerConsumerBarChartRef.value
  ) {
    agentLedgerConsumerBarChartInstance.dispose()
    agentLedgerConsumerBarChartInstance = null
  }

  if (!agentLedgerConsumerBarChartInstance) {
    agentLedgerConsumerBarChartInstance = echarts.init(agentLedgerConsumerBarChartRef.value)
  }

  const rows = agentLedgerTopCreditConsumers.value
  const labels = rows.map((item) => item.customerDisplayName || item.customerUsername || '客户').reverse()
  const values = rows.map((item) => item.consumedCredits).reverse()

  agentLedgerConsumerBarChartInstance.resize()
  agentLedgerConsumerBarChartInstance.setOption({
    animationDuration: 480,
    color: ['#2f6bff'],
    grid: { left: 16, right: 20, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: Array<{ axisValue: string; data: number; dataIndex: number }>) => {
        const point = params[0]
        if (!point) return ''
        const row = [...rows].reverse()[point.dataIndex]
        return [
          point.axisValue,
          `累计消费：${Number(point.data).toLocaleString('zh-CN')} 积分`,
          `消费次数：${Number(row?.transactionCount ?? 0).toLocaleString('zh-CN')}`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.14)' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        formatter: (value: number) => (value >= 10000 ? `${value / 10000}万` : String(value)),
      },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#475569',
        fontSize: 12,
        fontWeight: 800,
        width: 96,
        overflow: 'truncate',
      },
    },
    series: [
      {
        name: '累计消费',
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 6, 6, 0] },
        label: {
          show: true,
          position: 'right',
          color: '#334155',
          fontSize: 12,
          fontWeight: 800,
          formatter: (params: { value: number }) =>
            Number(params.value).toLocaleString('zh-CN'),
        },
        data: values,
      },
    ],
  })
  requestAnimationFrame(() => {
    agentLedgerConsumerBarChartInstance?.resize()
  })
}

function renderAgentFunctionUsagePieChart() {
  if (
    activeRole.value !== 'agent' ||
    activeAgentConsolePage.value !== 'agent-consumption' ||
    !agentFunctionUsagePieChartRef.value
  ) {
    if (!agentFunctionUsagePieChartRef.value && agentFunctionUsagePieChartInstance) {
      agentFunctionUsagePieChartInstance.dispose()
      agentFunctionUsagePieChartInstance = null
    }
    return
  }

  if (
    agentFunctionUsagePieChartInstance &&
    agentFunctionUsagePieChartInstance.getDom() !== agentFunctionUsagePieChartRef.value
  ) {
    agentFunctionUsagePieChartInstance.dispose()
    agentFunctionUsagePieChartInstance = null
  }

  if (!agentFunctionUsagePieChartInstance) {
    agentFunctionUsagePieChartInstance = echarts.init(agentFunctionUsagePieChartRef.value)
  }

  const data = agentFunctionUsagePieData.value
  const hasData = data.some((item) => item.value > 0)

  agentFunctionUsagePieChartInstance.resize()
  agentFunctionUsagePieChartInstance.setOption({
    animationDuration: 480,
    color: ['#2f6bff', '#18b77d', '#f6c343', '#ef7d00', '#7c3aed', '#14b8a6'],
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#f8fafc', fontSize: 12 },
      formatter: (params: { name: string; value: number; percent: number }) =>
        `${params.name}<br/>使用次数：${Number(params.value).toLocaleString('zh-CN')}<br/>占比：${params.percent}%`,
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      left: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#64748b', fontSize: 12, fontWeight: 800 },
    },
    series: [
      {
        name: '功能使用',
        type: 'pie',
        radius: hasData ? ['44%', '76%'] : ['0%', '0%'],
        center: ['50%', '43%'],
        avoidLabelOverlap: true,
        label: {
          formatter: '{d}%',
          color: '#334155',
          fontSize: 13,
          fontWeight: 800,
        },
        labelLine: { length: 8, length2: 6 },
        data: hasData ? data : [{ name: '暂无功能使用', value: 1, itemStyle: { color: '#e2e8f0' } }],
      },
    ],
  })
  requestAnimationFrame(() => {
    agentFunctionUsagePieChartInstance?.resize()
  })
}

function resizeConsoleCharts() {
  dashboardTrendChartInstance?.resize()
  dashboardPlanPieChartInstance?.resize()
  globalCustomerBarChartInstance?.resize()
  globalCustomerPieChartInstance?.resize()
  globalLedgerConsumerBarChartInstance?.resize()
  globalFunctionUsagePieChartInstance?.resize()
  agentConsumerBarChartInstance?.resize()
  agentUserTypePieChartInstance?.resize()
  agentLedgerConsumerBarChartInstance?.resize()
  agentFunctionUsagePieChartInstance?.resize()
}

watch(
  [
    dashboardTrendPeriod,
    dashboardTrendMetric,
    dashboardTrendEvents,
    dashboardPlanPieData,
    selectedApplicationCode,
    activeRole,
    activeDeveloperConsolePage,
    activeAdminConsolePage,
    activeAgentConsolePage,
  ],
  async () => {
    await nextTick()
    renderDashboardTrendChart()
    renderDashboardPlanPieChart()
    renderGlobalCustomerBarChart()
    renderGlobalCustomerPieChart()
    renderGlobalLedgerConsumerBarChart()
    renderGlobalFunctionUsagePieChart()
    renderAgentConsumerBarChart()
    renderAgentUserTypePieChart()
    renderAgentLedgerConsumerBarChart()
    renderAgentFunctionUsagePieChart()
  },
  { deep: true },
)

watch(
  [activeRole, activeAgentConsolePage],
  ([role, page]) => {
    if (role === 'agent' && page === 'agent-consumption') {
      void loadAgentTransactionsLedger()
    }
  },
  { immediate: true },
)

watch(
  [activeRole, activeDeveloperConsolePage, activeAdminConsolePage],
  ([role, developerPage, adminPage]) => {
    if (
      (role === 'developer' && developerPage === 'developer-transactions') ||
      (role === 'admin' && adminPage === 'admin-transactions')
    ) {
      void loadPlatformTransactionsLedger()
    }
  },
  { immediate: true },
)

watch(
  selectedApplicationCode,
  () => {
    platformLedgerPage.value = 1
    if (
      (activeRole.value === 'developer' && activeDeveloperConsolePage.value === 'developer-transactions') ||
      (activeRole.value === 'admin' && activeAdminConsolePage.value === 'admin-transactions')
    ) {
      void loadPlatformTransactionsLedger()
    }
  },
)

const createTargetOptions = computed(() => {
  if (activeRole.value === 'developer') {
    return [
      { label: 'Admin / 公司管理员', value: 'admin' },
      { label: 'Agent / 代理商', value: 'agent' },
      { label: 'User / 普通用户', value: 'user' },
    ]
  }

  if (activeRole.value === 'admin') {
    return [
      {
        label: 'User / 普通用户',
        value: 'user',
        disabled: !effectiveAccountCreationPolicy.value.adminCanCreateUsers,
      },
      {
        label: 'Agent / 代理商',
        value: 'agent',
        disabled: !effectiveAccountCreationPolicy.value.adminCanCreateAgents,
      },
    ]
  }

  return [
    {
      label: 'User / 普通用户',
      value: 'user',
      disabled: !effectiveAccountCreationPolicy.value.agentCanCreateUsers,
    },
  ]
})

const selectedApplicationLabel = computed(() =>
  applicationFilterOptions.value.find((item) => item.code === selectedApplicationCode.value)?.name ??
  '全部应用',
)

watch(
  [selectedApplicationCode, selectedApplicationLabel, applicationFilterOptions],
  ([selectedCode, selectedLabel, options]) => {
    if (!options.some((item) => item.code === selectedCode)) {
      emit('update:selectedApplicationCode', 'all')
      return
    }

    emit('application-context-change', {
      selectedCode,
      selectedLabel,
      options: options.map((item) => ({ ...item })),
    })
  },
  { immediate: true, deep: true },
)

function matchesSelectedApplication(applicationCode?: string | null) {
  return selectedApplicationCode.value === 'all' || applicationCode === selectedApplicationCode.value
}

function normalizeSearchText(value?: string | number | null) {
  return String(value ?? '').trim().toLowerCase()
}

function matchesUsernameOrPhone(
  query: string,
  username?: string | null,
  phone?: string | null,
) {
  const keyword = normalizeSearchText(query)
  if (!keyword) return true
  return [username, phone].some((value) => normalizeSearchText(value).includes(keyword))
}

function formatDetailValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (Array.isArray(value)) return value.length ? value.join(' / ') : '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function exportRows(filename: string, rows: unknown[]) {
  if (!rows.length) {
    interactionFeedback.value = '当前没有可导出的数据'
    message.warning('当前没有可导出的数据')
    return
  }

  const records = rows.map((row) => ({ ...(row as DetailRecord) }))
  const headers = Array.from(new Set(records.flatMap((row) => Object.keys(row))))
  const escapeCsv = (value: unknown) => {
    const text = formatDetailValue(value).replaceAll('"', '""')
    return `"${text}"`
  }
  const csv = [
    headers.map(escapeCsv).join(','),
    ...records.map((row) => headers.map((key) => escapeCsv(row[key])).join(',')),
  ].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  interactionFeedback.value = `已导出 ${records.length} 条记录`
  message.success(`已导出 ${records.length} 条记录`)
}

const selectedApplicationFunctions = computed(() => {
  if (selectedApplicationCode.value === 'all') return []
  return applicationFunctions.value.filter((item) => item.applicationCode === selectedApplicationCode.value)
})

const groupedCustomerProfiles = computed<CreditsCustomerProfile[]>(() => {
  const grouped = new Map<string, CreditsCustomerProfile & { applicationCodes: string[] }>()
  for (const row of customerProfiles.value) {
    const existing = grouped.get(row.userId)
    if (!existing) {
      grouped.set(row.userId, {
        ...row,
        applicationCodes: row.applicationCode ? [row.applicationCode] : [],
      })
      continue
    }

    if (row.applicationCode && !existing.applicationCodes.includes(row.applicationCode)) {
      existing.applicationCodes.push(row.applicationCode)
      existing.applicationCodes.sort()
    }
    const agentsByUserId = new Map(
      [...(existing.agents ?? []), ...(row.agents ?? [])].map((agent) => [agent.userId, agent]),
    )
    existing.agents = [...agentsByUserId.values()].sort((left, right) =>
      (left.displayName || left.username || left.userId).localeCompare(
        right.displayName || right.username || right.userId,
        'zh-CN',
      ),
    )
    existing.totalTopUpCredits = Math.max(
      Number(existing.totalTopUpCredits ?? 0),
      Number(row.totalTopUpCredits ?? 0),
    )
    existing.totalConsumedCredits = Math.max(
      Number(existing.totalConsumedCredits ?? 0),
      Number(row.totalConsumedCredits ?? 0),
    )
    existing.consumptionTransactionCount = Math.max(
      Number(existing.consumptionTransactionCount ?? 0),
      Number(row.consumptionTransactionCount ?? 0),
    )
    existing.lastTopUpAt =
      (row.lastTopUpAt ?? '') > (existing.lastTopUpAt ?? '') ? row.lastTopUpAt : existing.lastTopUpAt
    existing.lastConsumedAt =
      (row.lastConsumedAt ?? '') > (existing.lastConsumedAt ?? '') ? row.lastConsumedAt : existing.lastConsumedAt
    existing.createdAt = (row.createdAt ?? '') > (existing.createdAt ?? '') ? row.createdAt : existing.createdAt
  }

  return [...grouped.values()]
})

const filteredCustomerProfiles = computed(() =>
  groupedCustomerProfiles.value.filter((item) =>
    selectedApplicationCode.value === 'all' ||
    item.applicationCodes?.includes(selectedApplicationCode.value) ||
    item.applicationCode === selectedApplicationCode.value,
  ),
)

const globalLedgerTransactions = computed(() =>
  (platformTransactionsLedger.value?.transactions ?? []).filter((item) =>
    matchesSelectedApplication(item.applicationCode),
  ),
)

const globalLedgerTransactionTotal = computed(() =>
  platformTransactionsLedger.value?.total ?? globalLedgerTransactions.value.length,
)

const filteredAgentProfiles = computed(() =>
  platformAgents.value.filter((item) =>
    selectedApplicationCode.value === 'all' || item.applications.includes(selectedApplicationCode.value),
  ),
)

const searchedAdminAgentProfiles = computed(() =>
  filteredAgentProfiles.value.filter((item) =>
    matchesUsernameOrPhone(adminAgentSearchQuery.value, item.username, item.phone),
  ),
)

const searchedAgentPolicyOverrides = computed(() =>
  agentPolicyOverrides.value.filter((item) =>
    matchesUsernameOrPhone(adminAgentSearchQuery.value, item.username, item.phone),
  ),
)

const customerAgentFilterOptions = computed<CustomerAgentFilterOption[]>(() => {
  const agentsByIdentity = new Map<string, CustomerAgentFilterOption>()
  const agentIdentityKey = (agent: {
    userId: string
    username?: string | null
    displayName?: string | null
  }) => normalizeSearchText(agent.username || agent.displayName || agent.userId)

  for (const agent of filteredAgentProfiles.value) {
    agentsByIdentity.set(agentIdentityKey(agent), {
      userId: agent.userId,
      username: agent.username,
      displayName: agent.displayName,
      customerCount: 0,
    })
  }

  for (const customer of filteredCustomerProfiles.value) {
    if (matrixTargetRole(customer.role) !== 'user') continue
    for (const agent of customer.agents ?? []) {
      const identityKey = agentIdentityKey(agent)
      const existing = agentsByIdentity.get(identityKey)
      if (existing) {
        existing.username ||= agent.username
        existing.displayName ||= agent.displayName
        existing.userId = agent.userId
        existing.customerCount += 1
        continue
      }

      agentsByIdentity.set(identityKey, {
        userId: agent.userId,
        username: agent.username,
        displayName: agent.displayName,
        customerCount: 1,
      })
    }
  }

  return [...agentsByIdentity.values()].sort((left, right) => {
    const leftName = left.displayName || left.username || left.userId
    const rightName = right.displayName || right.username || right.userId
    return leftName.localeCompare(rightName, 'zh-CN')
  })
})

const selectedCustomerAgentFilter = computed(() => {
  if (!selectedCustomerAgentUserId.value) return null
  if (selectedCustomerAgentUserId.value === CUSTOMER_AGENT_FILTER_PLATFORM_OWNED_KEY) {
    return {
      userId: CUSTOMER_AGENT_FILTER_PLATFORM_OWNED_KEY,
      displayName: '平台自有',
      username: null,
      customerCount: platformOwnedCustomerCount.value,
    }
  }
  return (
    customerAgentFilterOptions.value.find(
      (agent) => agent.userId === selectedCustomerAgentUserId.value,
    ) ?? null
  )
})

const platformOwnedCustomerCount = computed(() =>
  filteredCustomerProfiles.value.filter((item) =>
    matrixTargetRole(item.role) === 'user' && !(item.agents?.length),
  ).length,
)

const customerAgentDropdownOptions = computed<AdminDropdownMixedOption[]>(() => {
  const keyword = normalizeSearchText(customerAgentDropdownSearchQuery.value)
  const platformOwnedKeywords = ['平台自有', '平台', '自有', 'platform', 'owned']
  const shouldShowPlatformOwned =
    !keyword || platformOwnedKeywords.some((value) => normalizeSearchText(value).includes(keyword))
  const filteredAgents = customerAgentFilterOptions.value.filter((agent) => {
    if (!keyword) return true
    return [agent.displayName, agent.username, agent.userId]
      .some((value) => normalizeSearchText(value).includes(keyword))
  })
  const platformOwnedOption = {
    label: `平台自有·${platformOwnedCustomerCount.value}客户`,
    key: CUSTOMER_AGENT_FILTER_PLATFORM_OWNED_KEY,
    icon: renderDropdownIcon('mdi:storefront-outline'),
  }
  const agentOptions = filteredAgents.map((agent) => ({
    label: `${formatAgentFilterName(agent)}·${agent.customerCount}客户`,
    key: agent.userId,
    icon: renderDropdownIcon('mdi:account-tie-outline'),
  }))

  return [
    {
      type: 'render',
      key: 'customer-agent-search',
      render: renderCustomerAgentDropdownSearch,
    },
    {
      label: '全部代理',
      key: CUSTOMER_AGENT_FILTER_ALL_KEY,
      icon: renderDropdownIcon('mdi:filter-off-outline'),
    },
    ...(shouldShowPlatformOwned || agentOptions.length
      ? [
          { type: 'divider' as const, key: 'customer-agent-divider' },
          ...(shouldShowPlatformOwned ? [platformOwnedOption] : []),
          ...agentOptions,
        ]
      : [
          {
            label: keyword ? '没有匹配的代理或平台自有客户' : '暂无代理或平台自有客户',
            key: CUSTOMER_AGENT_FILTER_EMPTY_KEY,
            disabled: true,
          },
        ]),
  ]
})

watch(customerAgentFilterOptions, (options) => {
  if (
    selectedCustomerAgentUserId.value &&
    selectedCustomerAgentUserId.value !== CUSTOMER_AGENT_FILTER_PLATFORM_OWNED_KEY &&
    !options.some((agent) => agent.userId === selectedCustomerAgentUserId.value)
  ) {
    selectedCustomerAgentUserId.value = null
  }
})

const filteredRegularUserProfiles = computed(() =>
  filteredCustomerProfiles.value.filter((item) => {
    if (matrixTargetRole(item.role) !== 'user') return false
    if (!selectedCustomerAgentUserId.value) return true
    if (selectedCustomerAgentUserId.value === CUSTOMER_AGENT_FILTER_PLATFORM_OWNED_KEY) {
      return !(item.agents?.length)
    }
    return item.agents?.some((agent) => agent.userId === selectedCustomerAgentUserId.value) ?? false
  }),
)

const searchedRegularUserProfiles = computed(() =>
  filteredRegularUserProfiles.value.filter((item) =>
    matchesUsernameOrPhone(adminCustomerSearchQuery.value, item.username, item.phone),
  ),
)

const globalTopTopUpCustomers = computed(() =>
  [...filteredRegularUserProfiles.value]
    .filter((item) => Number(item.totalTopUpCredits ?? 0) > 0)
    .sort((a, b) => {
      const topUpDiff = Number(b.totalTopUpCredits ?? 0) - Number(a.totalTopUpCredits ?? 0)
      if (topUpDiff !== 0) return topUpDiff
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    })
    .slice(0, 5),
)

const agentUserTypeDefinitions = [
  {
    code: 'active',
    label: '活跃用户',
    description: '1月内有充值且有积分消费的平台使用记录',
  },
  {
    code: 'potential',
    label: '潜力用户',
    description: '1-3月内有充值，但近期消费/使用频率未达到活跃标准',
  },
  {
    code: 'low_frequency',
    label: '低频用户',
    description: '6月内或更早曾充值/消费，但近期使用较少',
  },
] as const

function normalizeAgentUserTypeCode(value?: string | null) {
  if (value === 'active' || value === 'potential' || value === 'low_frequency') return value
  return 'low_frequency'
}

const globalCustomerUserTypePieData = computed(() =>
  agentUserTypeDefinitions.map((definition) => ({
    name: definition.label,
    value: filteredRegularUserProfiles.value.filter(
      (item) => normalizeAgentUserTypeCode(item.userType?.code) === definition.code,
    ).length,
    description: definition.description,
  })),
)

const globalLedgerTopCreditConsumers = computed(() => {
  const grouped = new Map<string, {
    customerUserId: string
    customerUsername: string | null
    customerDisplayName: string | null
    customerPhone: string | null
    consumedCredits: number
    transactionCount: number
    lastConsumedAt: string | null
  }>()

  for (const item of globalLedgerTransactions.value) {
    if (item.txnType !== 'settle') continue
    const consumedCredits = Math.abs(Number(item.points ?? 0))
    if (consumedCredits <= 0) continue
    const customerUserId = String(item.customerUserId ?? item.userId)
    const existing = grouped.get(customerUserId) ?? {
      customerUserId,
      customerUsername: item.customerUsername ?? null,
      customerDisplayName: item.customerDisplayName ?? null,
      customerPhone: item.customerPhone ?? null,
      consumedCredits: 0,
      transactionCount: 0,
      lastConsumedAt: null,
    }
    existing.consumedCredits += consumedCredits
    existing.transactionCount += 1
    if (!existing.lastConsumedAt || item.createdAt > existing.lastConsumedAt) {
      existing.lastConsumedAt = item.createdAt
    }
    grouped.set(customerUserId, existing)
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      const consumedDiff = b.consumedCredits - a.consumedCredits
      if (consumedDiff !== 0) return consumedDiff
      return (b.lastConsumedAt ?? '').localeCompare(a.lastConsumedAt ?? '')
    })
    .slice(0, 5)
    .map((item) => ({
      ...item,
      consumedCredits: Number(item.consumedCredits.toFixed(4)),
    }))
})

const globalFunctionUsagePieData = computed(() => {
  const grouped = new Map<string, {
    name: string
    value: number
    consumedCredits: number
  }>()

  for (const item of globalLedgerTransactions.value) {
    if (item.txnType !== 'settle') continue
    const name = formatFunctionDisplayName(item.functionCode, item.functionName)
    const existing = grouped.get(name) ?? {
      name,
      value: 0,
      consumedCredits: 0,
    }
    existing.value += 1
    existing.consumedCredits += Math.abs(Number(item.points ?? 0))
    grouped.set(name, existing)
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const countDiff = b.value - a.value
    if (countDiff !== 0) return countDiff
    return b.consumedCredits - a.consumedCredits
  })
})

watch(
  [
    globalTopTopUpCustomers,
    globalCustomerUserTypePieData,
    globalLedgerTopCreditConsumers,
    globalFunctionUsagePieData,
  ],
  async () => {
    await nextTick()
    renderGlobalCustomerBarChart()
    renderGlobalCustomerPieChart()
    renderGlobalLedgerConsumerBarChart()
    renderGlobalFunctionUsagePieChart()
  },
  { deep: true },
)

const agentCustomerCountByUserId = computed(
  () => new Map(platformAgents.value.map((item) => [item.userId, item.customerCount])),
)

const adminPolicyByUserId = computed(
  () => new Map(adminPolicyOverrides.value.map((item) => [item.userId, item])),
)

const agentPolicyByUserId = computed(
  () => new Map(agentPolicyOverrides.value.map((item) => [item.userId, item])),
)

const currentAdminDeveloperGate = computed(() => {
  if (authStore.role !== 'admin') return true
  const currentUserId = authStore.userInfo?.id
  if (!currentUserId) return true
  return adminPolicyByUserId.value.get(currentUserId)?.developerAllowsCreateAgents ?? true
})

const currentAgentDeveloperGate = computed(() => {
  if (authStore.role !== 'agent') return true
  const currentUserId = authStore.userInfo?.id
  if (!currentUserId) return true
  return agentPolicyByUserId.value.get(currentUserId)?.developerAllowsCreateUsers ?? true
})

const filteredAgentCustomers = computed(() =>
  agentCustomers.value.filter((item) => matchesSelectedApplication(item.applicationCode)),
)

const agentLedgerTransactions = computed(() =>
  (agentTransactionsLedger.value?.transactions ?? []).filter((item) =>
    matchesSelectedApplication(item.applicationCode),
  ),
)

const agentLedgerTopCreditConsumers = computed(() => {
  const grouped = new Map<string, {
    customerUserId: string
    customerUsername: string | null
    customerDisplayName: string | null
    customerPhone: string | null
    consumedCredits: number
    transactionCount: number
    lastConsumedAt: string | null
  }>()

  for (const item of agentLedgerTransactions.value) {
    if (item.txnType !== 'settle') continue
    const consumedCredits = Math.abs(Number(item.points ?? 0))
    if (consumedCredits <= 0) continue
    const customerUserId = String(item.customerUserId ?? item.userId)
    const existing = grouped.get(customerUserId) ?? {
      customerUserId,
      customerUsername: item.customerUsername ?? null,
      customerDisplayName: item.customerDisplayName ?? null,
      customerPhone: item.customerPhone ?? null,
      consumedCredits: 0,
      transactionCount: 0,
      lastConsumedAt: null,
    }
    existing.consumedCredits += consumedCredits
    existing.transactionCount += 1
    if (!existing.lastConsumedAt || item.createdAt > existing.lastConsumedAt) {
      existing.lastConsumedAt = item.createdAt
    }
    grouped.set(customerUserId, existing)
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      const consumedDiff = b.consumedCredits - a.consumedCredits
      if (consumedDiff !== 0) return consumedDiff
      return (b.lastConsumedAt ?? '').localeCompare(a.lastConsumedAt ?? '')
    })
    .slice(0, 5)
    .map((item) => ({
      ...item,
      consumedCredits: Number(item.consumedCredits.toFixed(4)),
    }))
})

const agentFunctionUsagePieData = computed(() => {
  const grouped = new Map<string, {
    name: string
    value: number
    consumedCredits: number
  }>()

  for (const item of agentLedgerTransactions.value) {
    if (item.txnType !== 'settle') continue
    const name = formatFunctionDisplayName(item.functionCode, item.functionName)
    const existing = grouped.get(name) ?? {
      name,
      value: 0,
      consumedCredits: 0,
    }
    existing.value += 1
    existing.consumedCredits += Math.abs(Number(item.points ?? 0))
    grouped.set(name, existing)
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const countDiff = b.value - a.value
    if (countDiff !== 0) return countDiff
    return b.consumedCredits - a.consumedCredits
  })
})

const searchedAgentCustomers = computed(() =>
  filteredAgentCustomers.value.filter((item) =>
    matchesUsernameOrPhone(agentCustomerSearchQuery.value, item.customerUsername, item.customerPhone),
  ),
)

const agentTopTopUpCustomers = computed(() =>
  [...filteredAgentCustomers.value]
    .filter((item) => Number(item.totalTopUpCredits ?? 0) > 0)
    .sort((a, b) => {
      const topUpDiff = Number(b.totalTopUpCredits ?? 0) - Number(a.totalTopUpCredits ?? 0)
      if (topUpDiff !== 0) return topUpDiff
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    })
    .slice(0, 5),
)

const agentUserTypePieData = computed(() =>
  agentUserTypeDefinitions.map((definition) => ({
    name: definition.label,
    value: filteredAgentCustomers.value.filter(
      (item) => normalizeAgentUserTypeCode(item.userType?.code) === definition.code,
    ).length,
    description: definition.description,
  })),
)

watch(
  [agentTopTopUpCustomers, agentUserTypePieData],
  async () => {
    await nextTick()
    renderAgentConsumerBarChart()
    renderAgentUserTypePieChart()
  },
  { deep: true },
)

watch(
  [agentLedgerTopCreditConsumers, agentFunctionUsagePieData],
  async () => {
    await nextTick()
    renderAgentLedgerConsumerBarChart()
    renderAgentFunctionUsagePieChart()
  },
  { deep: true },
)

const filteredAgentCommissions = computed(() =>
  agentCommissions.value.filter((item) => matchesSelectedApplication(item.applicationCode)),
)

const filteredAgentPreviewCommissionPoints = computed(() =>
  filteredAgentCommissions.value.reduce((sum, item) => sum + Number(item.commissionPoints ?? 0), 0),
)

const filteredAgentDraftSettlementCount = computed(
  () => filteredAgentCommissions.value.filter((item) => item.status === 'preview' || item.status === 'draft').length,
)

const effectiveAccountCreationPolicy = computed(() => {
  const state = {
    ...accountCreationPolicyState,
    developerAllowsAdminCreateAgentsAndUsers:
      accountCreationPolicyState.developerAllowsAdminCreateAgentsAndUsers &&
      currentAdminDeveloperGate.value,
    developerAllowsAdminCreateUsers:
      accountCreationPolicyState.developerAllowsAdminCreateUsers,
    developerAllowsAgentCreateUsers:
      accountCreationPolicyState.developerAllowsAgentCreateUsers &&
      currentAgentDeveloperGate.value,
  }
  return resolveAccountCreationPolicy(state)
})

const agentCreationGateText = computed(() => {
  if (!accountCreationPolicyState.developerAllowsAgentCreateUsers) {
    return '开发者已禁用代理商创建 User'
  }
  if (!accountCreationPolicyState.adminAllowsAgentCreateUsers) {
    return '公司管理员未允许代理商创建 User'
  }
  return '公司管理员已允许，开发者未禁用'
})

function syncPlanInitialPoints(planCode: PlatformUserPlanCode) {
  const plan = subscriptionPlans.value.find((item) => item.code === planCode)
  createAccountForm.initialPoints = plan ? Number(plan.giftPoints) : 0
}

function syncSelectedPlanFromCatalog() {
  if (!subscriptionPlans.value.length) {
    createAccountForm.planCode = ''
    createAccountForm.initialPoints = 0
    return
  }

  const selectedPlanExists = subscriptionPlans.value.some((plan) => plan.code === createAccountForm.planCode)
  if (!selectedPlanExists) {
    createAccountForm.planCode = subscriptionPlans.value[0].code
  }
  syncPlanInitialPoints(createAccountForm.planCode)
}

function syncSelectedConnectPlanFromCatalog() {
  if (!connectSubscriptionPlans.value.length) {
    connectApplicationForm.planCode = ''
    return
  }

  const selectedPlanExists = connectSubscriptionPlans.value.some((plan) => plan.code === connectApplicationForm.planCode)
  if (!selectedPlanExists) {
    connectApplicationForm.planCode = connectSubscriptionPlans.value[0].code
  }
}

async function loadCreatePlanOptions(applicationCode: string) {
  if (!applicationCode || loadedPlanApplicationCode.value === applicationCode) {
    syncSelectedPlanFromCatalog()
    return
  }

  isLoadingPlanOptions.value = true
  try {
    const result = await getPlatformSubscriptionPlans({ applicationCode })
    subscriptionPlans.value = result.items
    loadedPlanApplicationCode.value = applicationCode
    syncSelectedPlanFromCatalog()
  } catch (error) {
    subscriptionPlans.value = []
    loadedPlanApplicationCode.value = ''
    syncSelectedPlanFromCatalog()
    message.error(error instanceof Error ? error.message : '订阅计划加载失败')
  } finally {
    isLoadingPlanOptions.value = false
  }
}

async function loadConnectPlanOptions(applicationCode: string) {
  if (!applicationCode || loadedConnectPlanApplicationCode.value === applicationCode) {
    syncSelectedConnectPlanFromCatalog()
    return
  }

  isLoadingConnectPlanOptions.value = true
  try {
    const result = await getPlatformSubscriptionPlans({ applicationCode })
    connectSubscriptionPlans.value = result.items
    loadedConnectPlanApplicationCode.value = applicationCode
    syncSelectedConnectPlanFromCatalog()
  } catch (error) {
    connectSubscriptionPlans.value = []
    loadedConnectPlanApplicationCode.value = ''
    syncSelectedConnectPlanFromCatalog()
    message.error(error instanceof Error ? error.message : '订阅计划加载失败')
  } finally {
    isLoadingConnectPlanOptions.value = false
  }
}

function handleCreateTargetRoleChange(value: string | number | null) {
  const role = value as PlatformUserTargetRole
  if (role && role!=='user') syncSelectedPlanFromCatalog()
}

function handleCreatePlanChange(value: string | number | null) {
  if (value) syncPlanInitialPoints(value as PlatformUserPlanCode)
}

function targetRoleLabel(role: PlatformUserTargetRole) {
  if (role === 'admin') return 'Admin'
  if (role === 'agent') return 'Agent'
  return 'User'
}

function backOfficeRoleLabel(role?: string | null) {
  if (role === 'developer') return '开发者'
  if (role === 'admin') return '公司管理员'
  if (role === 'agent') return '代理商'
  return role ?? '-'
}

function settlementApproverText(row: PlatformSettlementApplication) {
  if (!row.approvedByUsername) return '-'
  return `${row.approvedByUsername} · ${backOfficeRoleLabel(row.approvedByRole)}`
}

function matrixTargetRole(role?: string | null): PlatformUserTargetRole | 'developer' | null {
  if (role === 'developer' || role === 'admin' || role === 'agent') return role
  if (role === 'enterprise' || role === 'user') return 'user'
  return null
}

function canMutateCustomer(row: CreditsCustomerProfile) {
  const targetRole = matrixTargetRole(row.role)
  if (!targetRole || targetRole === 'developer' || authStore.userInfo?.id === row.userId) {
    return false
  }

  if (activeRole.value === 'developer') {
    return targetRole === 'admin' || targetRole === 'agent' || targetRole === 'user'
  }

  if (activeRole.value === 'admin') {
    return targetRole === 'agent' || targetRole === 'user'
  }

  return false
}

function canEditPlatformProfile(
  targetRole: PlatformEditableProfileRole | null,
  userId?: string,
  status?: string | null,
) {
  if (!targetRole || targetRole === 'developer') return false
  if (userId && authStore.userInfo?.id === userId) return false
  if (status && status !== 'active') return false

  if (activeRole.value === 'developer' && authStore.role === 'developer') {
    return targetRole === 'admin' || targetRole === 'agent' || targetRole === 'user'
  }

  if (activeRole.value === 'admin' && authStore.role === 'admin') {
    return targetRole === 'agent' || targetRole === 'user'
  }

  return false
}

function platformProfileRoleLabel(role: PlatformEditableProfileRole) {
  if (role === 'developer') return '开发者'
  return targetRoleLabel(role)
}

function canAdjustCustomer(row: CreditsCustomerProfile) {
  return (
    activeRole.value === 'developer' &&
    canMutateCustomer(row) &&
    authStore.permissions.includes('credits:points:adjust')
  )
}

function canAdjustAgent(row: PlatformAgentPolicyOverride) {
  return (
    activeRole.value === 'developer' &&
    authStore.role === 'developer' &&
    authStore.userInfo?.id !== row.userId &&
    authStore.permissions.includes('credits:points:adjust')
  )
}

function canDeleteCustomer(row: CreditsCustomerProfile) {
  const targetRole = matrixTargetRole(row.role)
  if (activeRole.value === 'admin' && targetRole !== 'agent') return false
  return (
    canMutateCustomer(row) &&
    !!targetRole &&
    targetRole !== 'developer' &&
    authStore.permissions.includes(`account:delete:${targetRole}`)
  )
}

function canResetPlatformPassword(targetUserId?: string) {
  const isSelfReset = !!targetUserId && targetUserId === authStore.userInfo?.id
  if (
    isSelfReset &&
    (authStore.role === 'developer' || authStore.role === 'admin' || authStore.role === 'agent')
  ) {
    return true
  }
  return activeRole.value === 'developer' && authStore.role === 'developer'
}

function openPasswordResetModal(row: PasswordResetTableRow) {
  if (!canResetPlatformPassword(row.userId)) {
    message.warning('只能修改自己的登录密码；Developer 可重置其他后台账号')
    return
  }
  passwordResetForm.userId = row.userId
  passwordResetForm.username = row.username
  passwordResetForm.displayName = row.displayName
  passwordResetForm.password = ''
  passwordResetForm.confirmPassword = ''
  isPasswordResetModalOpen.value = true
}

function openCurrentBackOfficePasswordResetModal() {
  const user = authStore.userInfo
  if (!user || (authStore.role !== 'developer' && authStore.role !== 'admin' && authStore.role !== 'agent')) {
    message.warning('只有后台账号可以修改登录密码')
    return
  }
  openPasswordResetModal({
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
  })
}

function renderPasswordManagementCell(row: PasswordResetTableRow) {
  return h(
    'div',
    { class: 'admin-password-cell' },
    [
      h(
        NTag,
        {
          round: true,
          bordered: false,
          type: 'default',
        },
        { default: () => '已加密' },
      ),
      h(
        NButton,
        {
          size: 'small',
          secondary: true,
          disabled: !canResetPlatformPassword(row.userId),
          onClick: () => openPasswordResetModal(row),
        },
        {
          icon: () => h(Icon, { icon: 'mdi:lock-reset' }),
          default: () => '重置',
        },
      ),
    ],
  )
}

function passwordManagementColumn<T extends PasswordResetTableRow>(): DataTableColumns<T>[number] {
  return {
    title: '登陆密码',
    key: 'loginPassword',
    width: 170,
    render(row) {
      return renderPasswordManagementCell(row)
    },
  }
}

function withPasswordManagementColumn<T extends PasswordResetTableRow>(
  columns: DataTableColumns<T>,
): DataTableColumns<T> {
  const column = passwordManagementColumn<T>()
  const actionIndex = columns.findIndex((item) => 'key' in item && item.key === 'actions')
  if (actionIndex < 0) return [...columns, column]
  return [
    ...columns.slice(0, actionIndex),
    column,
    ...columns.slice(actionIndex),
  ]
}

function canPromoteCustomer(row: CreditsCustomerProfile) {
  const targetRole = matrixTargetRole(row.role)
  if (targetRole !== 'user' || row.status !== 'active' || authStore.userInfo?.id === row.userId) {
    return false
  }

  if (activeRole.value === 'developer') return true
  return activeRole.value === 'admin' && effectiveAccountCreationPolicy.value.adminCanPromoteUserToAgent
}

function canViewCustomerLedger() {
  return activeRole.value === 'developer' || activeRole.value === 'admin'
}

function formatAgentFilterName(agent: {
  userId: string
  username?: string | null
  displayName?: string | null
}) {
  if (agent.userId === CUSTOMER_AGENT_FILTER_PLATFORM_OWNED_KEY) return '平台自有'
  const displayName = agent.displayName || agent.username || agent.userId
  const username = agent.username || agent.userId
  return `${displayName}(${username})`
}

function renderCustomerAgentDropdownSearch() {
  return h(
    'div',
    {
      class: 'admin-dropdown-search',
      onClick: (event: MouseEvent) => event.stopPropagation(),
      onMousedown: (event: MouseEvent) => event.stopPropagation(),
    },
    [
      h(NInput, {
        value: customerAgentDropdownSearchQuery.value,
        size: 'small',
        clearable: true,
        placeholder: '搜索代理用户名 / 显示名称',
        'onUpdate:value': (value: string) => {
          customerAgentDropdownSearchQuery.value = value
        },
      }),
    ],
  )
}

function customerAgentFilterButtonText() {
  return selectedCustomerAgentFilter.value
    ? formatAgentFilterName(selectedCustomerAgentFilter.value)
    : '筛选代理'
}

function handleCustomerAgentFilterSelect(key: string | number) {
  if (key === CUSTOMER_AGENT_FILTER_ALL_KEY) {
    selectedCustomerAgentUserId.value = null
    customerAgentDropdownSearchQuery.value = ''
    return
  }
  if (key === CUSTOMER_AGENT_FILTER_EMPTY_KEY) return
  selectedCustomerAgentUserId.value = String(key)
  customerAgentDropdownSearchQuery.value = ''
}

function renderCustomerAgentOwnershipTitle() {
  const hasSelectedAgent = !!selectedCustomerAgentFilter.value

  return h(
    'div',
    { class: 'admin-column-filter-head' },
    [
      h('span', '所属代理'),
      h(
        NDropdown,
        {
          trigger: 'click',
          options: customerAgentDropdownOptions.value,
          onSelect: handleCustomerAgentFilterSelect,
        },
        {
          default: () =>
            h(
              NButton,
              {
                size: 'tiny',
                type: hasSelectedAgent ? 'primary' : 'default',
                secondary: hasSelectedAgent,
                quaternary: !hasSelectedAgent,
                onClick: () => {
                  customerAgentDropdownSearchQuery.value = ''
                },
              },
              {
                icon: () =>
                  h(Icon, {
                    icon: hasSelectedAgent ? 'mdi:filter-check-outline' : 'mdi:filter-variant',
                  }),
                default: customerAgentFilterButtonText,
              },
            ),
        },
      ),
    ],
  )
}

function renderDropdownIcon(icon: string) {
  return () => h(Icon, { icon })
}

function isCustomerEditActionKey(key: string | number): key is CustomerEditActionKey {
  return (
    key === 'editProfile' ||
    key === 'connectApplication' ||
    key === 'promoteToAgent' ||
    key === 'resetPassword' ||
    key === 'deleteAccount'
  )
}

function customerEditDropdownOptions(
  row: CreditsCustomerProfile,
  options: { includePasswordReset?: boolean } = {},
): DropdownOption[] {
  const targetRole = matrixTargetRole(row.role)
  const isUser = targetRole === 'user'
  const canEditProfile = isUser && canEditPlatformProfile(targetRole, row.userId, row.status)
  const canConnectApplication =
    isUser && canConnectApplicationToTarget('user', row.userId, row.status)

  const menuOptions: DropdownOption[] = [
    {
      label: '编辑资料',
      key: 'editProfile',
      disabled: !canEditProfile,
      icon: renderDropdownIcon('mdi:pencil-outline'),
    },
    {
      label: '接入应用',
      key: 'connectApplication',
      disabled: !canConnectApplication,
      icon: renderDropdownIcon('mdi:apps'),
    },
    {
      label: '升级为代理',
      key: 'promoteToAgent',
      disabled: !isUser || !canPromoteCustomer(row) || promotingUserId.value === row.userId,
      icon: renderDropdownIcon('mdi:account-arrow-up-outline'),
    },
  ]

  if (options.includePasswordReset) {
    menuOptions.push({
      label: '重置密码',
      key: 'resetPassword',
      disabled: !canResetPlatformPassword(row.userId),
      icon: renderDropdownIcon('mdi:lock-reset'),
    })
  }

  if (activeRole.value !== 'admin') {
    menuOptions.push({
      label: '删除账号',
      key: 'deleteAccount',
      disabled: !canDeleteCustomer(row),
      icon: renderDropdownIcon('mdi:trash-can-outline'),
      props: { class: 'admin-dropdown-option-danger' },
    })
  }

  return menuOptions
}

function handleCustomerEditActionSelect(key: string | number, row: CreditsCustomerProfile) {
  if (!isCustomerEditActionKey(key)) return

  if (key === 'editProfile') {
    const targetRole = matrixTargetRole(row.role)
    if (targetRole !== 'user' || !canEditPlatformProfile(targetRole, row.userId, row.status)) {
      message.warning('当前账号无权编辑该客户资料')
      return
    }
    openEditPlatformUserProfile(row, 'user')
    return
  }

  if (key === 'connectApplication') {
    void openConnectApplicationModal({
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      targetRole: 'user',
      existingApplications: customerApplicationsForUser(row.userId),
      status: row.status,
    })
    return
  }

  if (key === 'promoteToAgent') {
    void handlePromoteUserToAgent(row)
    return
  }

  if (key === 'resetPassword') {
    openPasswordResetModal(row)
    return
  }

  openDeleteAccountModal(row)
}

function renderCustomerCreditsAdjustmentCell(row: CreditsCustomerProfile) {
  const canAdjust = canAdjustCustomer(row)

  return h(
    NButton,
    {
      size: 'small',
      secondary: true,
      disabled: !canAdjust,
      onClick: () => openAdjustCreditsModal(row),
    },
    {
      icon: () => h(Icon, { icon: 'mdi:plus-minus-variant' }),
      default: () => '增减积分',
    },
  )
}

function renderAgentCreditsAdjustmentCell(row: PlatformAgentPolicyOverride) {
  const canAdjust = canAdjustAgent(row)

  return h(
    NButton,
    {
      size: 'small',
      secondary: true,
      disabled: !canAdjust,
      onClick: () => openAdjustAgentCreditsModal(row),
    },
    {
      icon: () => h(Icon, { icon: 'mdi:plus-minus-variant' }),
      default: () => '增减积分',
    },
  )
}

function agentCreditsAdjustmentColumn(): DataTableColumns<PlatformAgentPolicyOverride>[number] {
  return {
    title: '增减积分',
    key: 'creditsAdjustment',
    width: 120,
    render(row) {
      return renderAgentCreditsAdjustmentCell(row)
    },
  }
}

function customerCreditsAdjustmentColumn(): DataTableColumns<CreditsCustomerProfile>[number] {
  return {
    title: '增减积分',
    key: 'creditsAdjustment',
    width: 120,
    render(row) {
      return renderCustomerCreditsAdjustmentCell(row)
    },
  }
}

function renderCustomerActionsCell(
  row: CreditsCustomerProfile,
  options: { includePasswordReset?: boolean } = {},
) {
  const canViewLedger = canViewCustomerLedger()
  const menuOptions = customerEditDropdownOptions(row, options)
  const canUseEditDropdown = menuOptions.some((item) => !item.disabled)

  if (!canViewLedger && !canUseEditDropdown) return '-'

  const actions = []
  if (canViewLedger) {
    actions.push(
      h(
        NButton,
        {
          size: 'small',
          secondary: true,
          onClick: () => void openCustomerProfileLedger(row),
        },
        {
          icon: () => h(Icon, { icon: 'mdi:eye-outline' }),
          default: () => '查看流水',
        },
      ),
    )
  }

  actions.push(
    h(
      NDropdown,
      {
        trigger: 'click',
        options: menuOptions,
        onSelect: (key: string | number) => handleCustomerEditActionSelect(key, row),
      },
      {
        default: () =>
          h(
            NButton,
            {
              size: 'small',
              type: 'primary',
              secondary: true,
              disabled: !canUseEditDropdown,
            },
            {
              icon: () => h(Icon, { icon: 'mdi:pencil-outline' }),
              default: () => '编辑',
            },
          ),
      },
    ),
  )

  return h(
    'div',
    { class: 'admin-table-actions' },
    actions,
  )
}

function customerActionsColumn(
  options: { includePasswordReset?: boolean } = {},
): DataTableColumns<CreditsCustomerProfile>[number] {
  return {
    title: '能力操作',
    key: 'actions',
    width: 190,
    render(row) {
      return renderCustomerActionsCell(row, options)
    },
  }
}

function withDeveloperCustomerColumns(
  columns: DataTableColumns<CreditsCustomerProfile>,
): DataTableColumns<CreditsCustomerProfile> {
  const actionIndex = columns.findIndex((item) => 'key' in item && item.key === 'actions')
  if (actionIndex < 0) {
    return [
      ...columns,
      customerCreditsAdjustmentColumn(),
      customerActionsColumn({ includePasswordReset: true }),
    ]
  }

  return [
    ...columns.slice(0, actionIndex),
    customerCreditsAdjustmentColumn(),
    customerActionsColumn({ includePasswordReset: true }),
    ...columns.slice(actionIndex + 1),
  ]
}

function canDisableAgent(row: PlatformAgentProfile) {
  if (row.status !== 'active' || authStore.userInfo?.id === row.userId) return false
  if (!authStore.permissions.includes('account:delete:agent')) return false
  return activeRole.value === 'developer' || activeRole.value === 'admin'
}

function canDisableAgentPolicy(row: PlatformAgentPolicyOverride) {
  if (authStore.userInfo?.id === row.userId) return false
  if (!authStore.permissions.includes('account:delete:agent')) return false
  return activeRole.value === 'developer' || activeRole.value === 'admin'
}

function isDeveloperAgentEditActionKey(key: string | number): key is DeveloperAgentEditActionKey {
  return (
    key === 'editProfile' ||
    key === 'connectApplication' ||
    key === 'resetPassword' ||
    key === 'disableAgent'
  )
}

function renderDropdownControl(
  title: string,
  icon: string,
  children: VNodeChild[],
) {
  return h(
    'div',
    {
      class: 'admin-dropdown-control',
      onClick: (event: MouseEvent) => event.stopPropagation(),
      onMousedown: (event: MouseEvent) => event.stopPropagation(),
    },
    [
      h(
        'div',
        { class: 'admin-dropdown-control-title' },
        [
          h(Icon, { icon }),
          h('span', title),
        ],
      ),
      h('div', { class: 'admin-dropdown-control-row' }, children),
    ],
  )
}

function renderDeveloperAgentCreateUserControl(row: PlatformAgentPolicyOverride) {
  const rowEnabled = !row.developerDisabledCreateUsers
  const effectiveEnabled =
    accountCreationPolicyState.developerAllowsAgentCreateUsers &&
    accountCreationPolicyState.adminAllowsAgentCreateUsers &&
    rowEnabled

  return renderDropdownControl('创建 User', 'mdi:account-plus-outline', [
    h(NSwitch, {
      value: rowEnabled,
      loading: updatingAgentPolicyUserId.value === row.userId,
      disabled: !authStore.policyEditingEnabled || !accountCreationPolicyState.developerAllowsAgentCreateUsers,
      'aria-disabled': !authStore.policyEditingEnabled || !accountCreationPolicyState.developerAllowsAgentCreateUsers,
      'onUpdate:value': (value: boolean) =>
        handleAgentCreateUserDisableChange(row.userId, !value),
    }),
    h(
      'span',
      { class: effectiveEnabled ? 'is-enabled' : 'is-disabled' },
      effectiveEnabled ? '可创建 User' : '已禁用',
    ),
  ])
}

function renderDeveloperAgentCommissionControl(row: PlatformAgentPolicyOverride) {
  const isBusy = updatingAgentCommissionUserId.value === row.userId

  return renderDropdownControl('返佣比例', 'mdi:percent-outline', [
    h(NInputNumber, {
      value: agentCommissionRatePercent(row),
      min: 0,
      max: 100,
      precision: 2,
      step: 0.5,
      size: 'small',
      disabled: isBusy,
      'onUpdate:value': (value: number | null) => {
        agentCommissionRateDrafts[row.userId] = value
      },
    }),
    h(
      'span',
      { class: 'admin-percent-suffix' },
      '%',
    ),
    h(
      NButton,
      {
        size: 'small',
        type: 'primary',
        secondary: true,
        loading: isBusy,
        disabled: isBusy,
        onClick: () => void handleAgentCommissionRateSave(row),
      },
      { default: () => '保存' },
    ),
  ])
}

function developerAgentEditDropdownOptions(row: PlatformAgentPolicyOverride): AdminDropdownMixedOption[] {
  return [
    {
      label: '编辑资料',
      key: 'editProfile',
      disabled: !canEditPlatformProfile('agent', row.userId),
      icon: renderDropdownIcon('mdi:pencil-outline'),
    },
    {
      label: '接入应用',
      key: 'connectApplication',
      disabled: !canConnectApplicationToTarget('agent', row.userId),
      icon: renderDropdownIcon('mdi:apps'),
    },
    {
      label: '重置密码',
      key: 'resetPassword',
      disabled: !canResetPlatformPassword(row.userId),
      icon: renderDropdownIcon('mdi:lock-reset'),
    },
    { type: 'divider', key: 'developer-agent-edit-divider-controls' },
    {
      type: 'render',
      key: 'developer-agent-create-user',
      render: () => renderDeveloperAgentCreateUserControl(row),
    },
    {
      type: 'render',
      key: 'developer-agent-commission-rate',
      render: () => renderDeveloperAgentCommissionControl(row),
    },
    { type: 'divider', key: 'developer-agent-edit-divider-danger' },
    {
      label: '禁用代理商',
      key: 'disableAgent',
      disabled: disablingAgentUserId.value === row.userId || !canDisableAgentPolicy(row),
      icon: renderDropdownIcon('mdi:account-cancel-outline'),
      props: { class: 'admin-dropdown-option-danger' },
    },
  ]
}

function handleDeveloperAgentEditActionSelect(
  key: string | number,
  row: PlatformAgentPolicyOverride,
) {
  if (!isDeveloperAgentEditActionKey(key)) return

  if (key === 'editProfile') {
    openEditPlatformUserProfile(row, 'agent')
    return
  }

  if (key === 'connectApplication') {
    void openConnectApplicationModal({
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      targetRole: 'agent',
      existingApplications: agentApplicationsForUser(row.userId),
    })
    return
  }

  if (key === 'resetPassword') {
    openPasswordResetModal(row)
    return
  }

  void handleDisableAgentPolicy(row)
}

function renderDeveloperAgentEditCell(row: PlatformAgentPolicyOverride) {
  return h(
    NDropdown,
    {
      trigger: 'click',
      options: developerAgentEditDropdownOptions(row),
      onSelect: (key: string | number) => handleDeveloperAgentEditActionSelect(key, row),
    },
    {
      default: () =>
        h(
          NButton,
          {
            size: 'small',
            type: 'primary',
            secondary: true,
          },
          {
            icon: () => h(Icon, { icon: 'mdi:pencil-outline' }),
            default: () => '编辑',
          },
        ),
    },
  )
}

function developerAgentEditColumn(): DataTableColumns<PlatformAgentPolicyOverride>[number] {
  return {
    title: '管理动作',
    key: 'actions',
    width: 110,
    render(row) {
      return h(
        'div',
        { class: 'admin-table-actions' },
        [renderDeveloperAgentEditCell(row)],
      )
    },
  }
}

function withDeveloperAgentColumns(
  columns: DataTableColumns<PlatformAgentPolicyOverride>,
): DataTableColumns<PlatformAgentPolicyOverride> {
  const hiddenColumnKeys = new Set(['developerDisabledCreateUsers', 'commissionRate', 'actions'])
  const visibleColumns = columns.filter((item) => !('key' in item) || !hiddenColumnKeys.has(String(item.key)))
  const creditsBalanceIndex = visibleColumns.findIndex(
    (item) => 'key' in item && item.key === 'creditsAvailableBalance',
  )
  const creditsAdjustmentColumn = agentCreditsAdjustmentColumn()
  const columnsWithCreditsAdjustment =
    creditsBalanceIndex < 0
      ? [...visibleColumns, creditsAdjustmentColumn]
      : [
          ...visibleColumns.slice(0, creditsBalanceIndex + 1),
          creditsAdjustmentColumn,
          ...visibleColumns.slice(creditsBalanceIndex + 1),
        ]

  return [
    ...columnsWithCreditsAdjustment,
    developerAgentEditColumn(),
  ]
}

function deleteActionText(row: CreditsCustomerProfile) {
  const targetRole = matrixTargetRole(row.role)
  if (activeRole.value === 'admin' && targetRole === 'agent') return '禁用代理商'
  return '删除'
}

type CreditsBalanceLike = {
  creditsAvailableBalance?: string | number | null
  creditsTotalBalance?: string | number | null
}

type DepositBalanceLike = {
  depositBalance?: string | number | null
  depositCurrency?: string | null
}

function formatCreditsBalance(row: CreditsBalanceLike) {
  const value = row.creditsAvailableBalance ?? row.creditsTotalBalance
  if (value === null || value === undefined || value === '') return '-'

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return numeric.toLocaleString('zh-CN', {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 4,
  })
}

function formatDepositBalance(row: DepositBalanceLike) {
  const numeric = Number(row.depositBalance ?? 0)
  if (!Number.isFinite(numeric)) return '-'
  const currency = row.depositCurrency ?? 'CNY'
  return `${currency} ${numeric.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatCurrencyAmount(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '-'
  return `¥${numeric.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDateTime(value: string) {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`
}

function settlementStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    draft: '草稿',
    requested: '已提交',
    confirmed: '已确认',
    paid: '已批准',
  }
  return labels[status ?? ''] ?? formatDetailValue(status)
}

function transactionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    recharge: '积分充值',
    bonus: '赠送',
    settle: '消费',
    freeze: '冻结',
    refund: '退款',
    estimate: '预估',
    grant: '发放',
    adjustment: '调整',
    adjust: '调整',
    commission_grant: '返佣',
  }
  return labels[type] ?? type
}

function transactionTagType(type: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  if (type === 'recharge' || type === 'bonus' || type === 'refund' || type === 'grant') return 'success'
  if (type === 'settle') return 'error'
  if (type === 'freeze' || type === 'adjustment' || type === 'adjust') return 'warning'
  return 'default'
}

function formatSignedPoints(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '-'
  const sign = numeric > 0 ? '+' : ''
  return `${sign}${numeric.toLocaleString('zh-CN')}`
}

function displayPointsForLedgerTransaction(row: AgentCustomerLedgerTransaction) {
  const points = Number(row.points ?? 0)
  if (!Number.isFinite(points)) return 0
  if (row.txnType === 'estimate' || row.txnType === 'freeze' || row.txnType === 'settle') {
    return -Math.abs(points)
  }
  if (row.txnType === 'refund' || row.txnType === 'recharge' || row.txnType === 'bonus' || row.txnType === 'grant') {
    return Math.abs(points)
  }
  return points
}

function ledgerPointsClass(row: AgentCustomerLedgerTransaction) {
  return displayPointsForLedgerTransaction(row) >= 0 ? 'admin-delta is-up' : 'admin-delta is-down'
}

function formatLedgerSignedPoints(row: AgentCustomerLedgerTransaction) {
  return formatSignedPoints(displayPointsForLedgerTransaction(row))
}

function ledgerSourceText(row: AgentCustomerLedgerTransaction) {
  return row.functionCode || row.functionName
    ? formatFunctionDisplayName(row.functionCode, row.functionName)
    : row.remark ?? row.bizType ?? row.txnType
}

function ledgerActorText(row: AgentCustomerLedgerTransaction) {
  const actorName = row.actorDisplayName || row.actorUsername || `Credits User ${row.userId}`
  return row.actorIdentityLabel ? `${actorName} · ${row.actorIdentityLabel}` : actorName
}

function ledgerModalTitle() {
  return agentCustomerLedger.value?.customer.accountScope === 'tenant'
    ? '(团队)积分流水'
    : '积分流水'
}

function formatEnterpriseAccountRelation(row: CreditsCustomerProfile) {
  if (row.enterpriseAccountRole === 'mother') {
    return row.enterpriseTenantName ? `母账号 · ${row.enterpriseTenantName}` : '母账号'
  }
  if (row.enterpriseAccountRole === 'child') {
    const owner = row.enterpriseOwnerDisplayName || row.enterpriseOwnerUsername || row.enterpriseOwnerUserId
    return owner ? `子账号 · 母账号 ${owner}` : '子账号'
  }
  return '-'
}

function formatCustomerAgentOwnership(row: CreditsCustomerProfile) {
  if (!row.agents?.length) return '平台自有'
  return row.agents.map(formatAgentFilterName).join('、')
}

function formatDisplayUsername(input: {
  userId?: string | null
  username?: string | null
  displayName?: string | null
}) {
  const displayName = input.displayName || input.username || input.userId
  const username = input.username || input.userId
  if (!displayName) return '-'
  if (!username) return displayName
  return `${displayName}(${username})`
}

function formatCreatorName(input: {
  createdByUserId?: string | null
  createdByUsername?: string | null
  createdByDisplayName?: string | null
  createdByRole?: string | null
}) {
  return formatDisplayUsername({
    userId: input.createdByUserId,
    username: input.createdByUsername,
    displayName: input.createdByDisplayName,
  })
}

function formatAssignerName(input: {
  assignedByUserId?: string | null
  assignedByUsername?: string | null
  assignedByDisplayName?: string | null
}) {
  return formatDisplayUsername({
    userId: input.assignedByUserId,
    username: input.assignedByUsername,
    displayName: input.assignedByDisplayName,
  })
}

function canCreateTargetRole(role: PlatformUserTargetRole) {
  if (activeRole.value === 'developer') {
    return true
  }

  if (activeRole.value === 'admin') {
    return role === 'agent'
      ? effectiveAccountCreationPolicy.value.adminCanCreateAgents
      : role === 'user' && effectiveAccountCreationPolicy.value.adminCanCreateUsers
  }

  return role === 'user' && effectiveAccountCreationPolicy.value.agentCanCreateUsers
}

function defaultApplicationCode() {
  if (selectedApplicationCode.value !== 'all') return selectedApplicationCode.value
  return applicationCatalog.value[0]?.code ?? 'simulation'
}

const agentGrantedApplications = computed(() => agentOverview.value?.agent.applications ?? [])

function targetConnectableApplication(
  existingApplications: readonly string[],
  availableApplications: readonly string[] = [],
) {
  const existing = new Set(existingApplications)
  const available = new Set(availableApplications)
  const candidates = applicationCatalog.value.filter((item) => available.size === 0 || available.has(item.code))
  const selected = selectedApplicationCode.value !== 'all' ? selectedApplicationCode.value : ''
  if (selected && !existing.has(selected) && (available.size === 0 || available.has(selected))) return selected
  return candidates.find((item) => !existing.has(item.code))?.code ?? candidates[0]?.code ?? 'simulation'
}

function customerApplicationsForUser(userId: string) {
  const applications = new Set<string>()
  for (const row of overview.value?.customerProfiles ?? []) {
    if (row.userId === userId && row.status === 'active') {
      applications.add(row.applicationCode)
    }
  }
  return [...applications].sort()
}

function agentApplicationsForUser(userId: string) {
  return platformAgents.value.find((row) => row.userId === userId)?.applications ?? []
}

function agentCustomerApplicationsForUser(userId: string) {
  const applications = new Set<string>()
  for (const row of agentOverview.value?.customers ?? []) {
    if (row.customerUserId === userId && row.status === 'active') {
      applications.add(row.applicationCode)
    }
  }
  return [...applications].sort()
}

function canConnectApplicationToTarget(targetRole: 'agent' | 'user', userId: string, status?: string | null) {
  if (authStore.userInfo?.id === userId) return false
  if (status && status !== 'active') return false
  if (activeRole.value === 'agent') {
    return targetRole === 'user' && agentGrantedApplications.value.length > 0
  }
  if (activeRole.value !== 'developer' && activeRole.value !== 'admin') return false
  return targetRole === 'agent' || targetRole === 'user'
}

async function openConnectApplicationModal(params: {
  userId: string
  username: string
  displayName: string
  targetRole: 'agent' | 'user'
  existingApplications: readonly string[]
  availableApplications?: readonly string[]
  status?: string | null
}) {
  if (!canConnectApplicationToTarget(params.targetRole, params.userId, params.status)) {
    message.warning('当前账号无权为该对象接入应用')
    return
  }

  connectApplicationForm.userId = params.userId
  connectApplicationForm.username = params.username
  connectApplicationForm.displayName = params.displayName
  connectApplicationForm.targetRole = params.targetRole
  connectApplicationForm.existingApplications = [...params.existingApplications]
  connectApplicationForm.availableApplications = [...(params.availableApplications ?? [])]
  connectApplicationForm.applicationCode = targetConnectableApplication(
    params.existingApplications,
    params.availableApplications,
  )
  connectApplicationForm.planCode = ''
  connectSubscriptionPlans.value = []
  loadedConnectPlanApplicationCode.value = ''
  isConnectApplicationModalOpen.value = true
  await loadConnectPlanOptions(connectApplicationForm.applicationCode)
}

async function handleConnectApplication() {
  if (!connectApplicationForm.userId) {
    message.error('请选择需要接入应用的账号')
    return
  }
  if (!connectApplicationForm.applicationCode) {
    message.error('请选择接入应用')
    return
  }
  if (
    connectApplicationForm.availableApplications.length > 0 &&
    !connectApplicationForm.availableApplications.includes(connectApplicationForm.applicationCode)
  ) {
    message.error('只能选择当前账号被授权接入的应用')
    return
  }
  if (
    !connectApplicationForm.planCode ||
    !connectSubscriptionPlans.value.some((plan) => plan.code === connectApplicationForm.planCode)
  ) {
    message.error('请选择当前应用可用的订阅计划')
    return
  }

  isConnectingApplication.value = true
  try {
    const result = await connectPlatformUserApplication(connectApplicationForm.userId, {
      applicationCode: connectApplicationForm.applicationCode,
      planCode: connectApplicationForm.planCode,
      reason: `${activeRole.value} 接入应用`,
    })
    message.success(
      `已为 ${result.user.displayName} 接入 ${formatApplicationDisplayName(result.applicationCode)}`,
    )
    isConnectApplicationModalOpen.value = false
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '接入应用失败')
  } finally {
    isConnectingApplication.value = false
  }
}

function resetCreateAccountForm(role: PlatformUserTargetRole) {
  createAccountForm.targetRole = role
  createAccountForm.username = ''
  createAccountForm.password = ''
  createAccountForm.displayName = ''
  createAccountForm.phone = ''
  createAccountForm.email = ''
  createAccountForm.applicationCode = defaultApplicationCode()
  createAccountForm.planCode = ''
  createAccountForm.initialPoints = 0
}

async function openCreateAccountModal(role: PlatformUserTargetRole) {
  if(role==='agent' && !authStore.agentWorkflowsEnabled){ message.info('代理商机制已保留，当前未启用；普通用户可自行注册公司账号。'); return; }
  if (!canCreateTargetRole(role)) {
    message.warning('当前账号创建权限已被上级开关关闭')
    return
  }

  resetCreateAccountForm(role)
  isCreateAccountModalOpen.value = true
  if(role!=='user')await loadCreatePlanOptions(createAccountForm.applicationCode)
}

async function handleAdminGateChange(
  adminUserId: string,
  gate: 'createUsers' | 'createAgents',
  enabled: boolean,
) {
  const previous = [...adminPolicyOverrides.value]
  adminPolicyOverrides.value = adminPolicyOverrides.value.map((item) =>
    item.userId === adminUserId
      ? {
          ...item,
          ...(gate === 'createUsers'
            ? {
                developerAllowsCreateUsers: enabled,
                effectiveCanCreateUsers:
                  accountCreationPolicyState.developerAllowsAdminCreateUsers && enabled,
              }
            : {
                developerAllowsCreateAgents: enabled,
                effectiveCanCreateAgents:
                  accountCreationPolicyState.developerAllowsAdminCreateAgentsAndUsers && enabled,
              }),
        }
      : item,
  )
  updatingAdminPolicyUserId.value = adminUserId

  try {
    const result = await updatePlatformAdminPolicyOverride(adminUserId, {
      ...(gate === 'createUsers'
        ? { developerAllowsCreateUsers: enabled }
        : { developerAllowsCreateAgents: enabled }),
    })
    adminPolicyOverrides.value = result.items
    message.success(
      gate === 'createUsers'
        ? enabled
          ? '已允许该 Admin 创建 User'
          : '已关闭该 Admin 创建 User'
        : enabled
          ? '已允许该 Admin 创建 Agent'
          : '已关闭该 Admin 创建 Agent',
    )
  } catch (error) {
    adminPolicyOverrides.value = previous
    const text = error instanceof Error ? error.message : '更新公司管理员授权失败'
    message.error(text)
  } finally {
    updatingAdminPolicyUserId.value = null
  }
}

async function handleAgentCreateUserDisableChange(agentUserId: string, disabled: boolean) {
  const previous = [...agentPolicyOverrides.value]
  const enabled = !disabled
  agentPolicyOverrides.value = agentPolicyOverrides.value.map((item) =>
    item.userId === agentUserId
      ? {
          ...item,
          developerAllowsCreateUsers: enabled,
          developerDisabledCreateUsers: disabled,
          effectiveCanCreateUsers:
            accountCreationPolicyState.developerAllowsAgentCreateUsers &&
            accountCreationPolicyState.adminAllowsAgentCreateUsers &&
            enabled,
        }
      : item,
  )
  updatingAgentPolicyUserId.value = agentUserId

  try {
    const result = await updatePlatformAgentPolicyOverride(agentUserId, {
      developerAllowsCreateUsers: enabled,
    })
    agentPolicyOverrides.value = result.items
    message.success(disabled ? '已禁用该 Agent 创建 User' : '已允许该 Agent 创建 User')
  } catch (error) {
    agentPolicyOverrides.value = previous
    const text = error instanceof Error ? error.message : '更新代理商授权失败'
    message.error(text)
  } finally {
    updatingAgentPolicyUserId.value = null
  }
}

function agentCommissionRatePercent(row: PlatformAgentPolicyOverride) {
  return agentCommissionRateDrafts[row.userId] ?? Number((Number(row.commissionRate ?? 0) * 100).toFixed(2))
}

async function handleAgentCommissionRateSave(row: PlatformAgentPolicyOverride) {
  const percent = Number(agentCommissionRatePercent(row))
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    message.warning('返佣比例必须在 0% 到 100% 之间')
    return
  }

  updatingAgentCommissionUserId.value = row.userId
  try {
    const result = await updatePlatformAgentPolicyOverride(row.userId, {
      commissionRate: Number((percent / 100).toFixed(4)),
    })
    agentPolicyOverrides.value = result.items
    delete agentCommissionRateDrafts[row.userId]
    message.success(`已更新 ${row.displayName} 的返佣比例`)
    await refreshOverview()
  } catch (error) {
    const text = error instanceof Error ? error.message : '更新返佣比例失败'
    message.error(text)
  } finally {
    updatingAgentCommissionUserId.value = null
  }
}

function agentDepositAdjustmentAmount(row: PlatformAgentPolicyOverride) {
  return agentDepositAdjustmentDrafts[row.userId] ?? null
}

function openAgentDepositAdjustmentModal(row: PlatformAgentPolicyOverride) {
  selectedAgentDepositUser.value = row
  agentDepositAdjustmentDrafts[row.userId] = agentDepositAdjustmentAmount(row)
  isAgentDepositAdjustmentModalOpen.value = true
}

async function handleAgentDepositAdjustment(
  row: PlatformAgentPolicyOverride,
  direction: 'increase' | 'decrease',
) {
  const amount = Number(agentDepositAdjustmentAmount(row))
  if (!Number.isFinite(amount) || amount <= 0) {
    message.warning('请输入大于 0 的押金金额')
    return
  }

  if (direction === 'decrease' && amount > Number(row.depositBalance ?? 0)) {
    message.warning('扣减金额不能超过当前押金余额')
    return
  }

  updatingAgentDepositUserId.value = row.userId
  try {
    const result = await adjustPlatformAgentDeposit(row.userId, {
      amount,
      direction,
      remark: direction === 'increase' ? 'Developer 增加 Agent 押金' : 'Developer 扣减 Agent 押金',
    })
    agentPolicyOverrides.value = agentPolicyOverrides.value.map((item) =>
      item.userId === row.userId
        ? {
            ...item,
            depositBalance: result.balanceAfter,
            depositCurrency: result.currency,
          }
        : item,
    )
    delete agentDepositAdjustmentDrafts[row.userId]
    message.success(
      direction === 'increase'
        ? `已增加 ${row.displayName} 的押金`
        : `已扣减 ${row.displayName} 的押金`,
    )
    await refreshOverview()
    isAgentDepositAdjustmentModalOpen.value = false
    selectedAgentDepositUser.value = null
  } catch (error) {
    const text = error instanceof Error ? error.message : '调整押金失败'
    message.error(text)
  } finally {
    updatingAgentDepositUserId.value = null
  }
}

async function handleCreateAccount() {
  const username = createAccountForm.username.trim().toLowerCase()
  const password = createAccountForm.password

  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    message.error('用户名需为 3-32 位小写字母、数字或下划线')
    return
  }

  if (password.length < 6) {
    message.error('初始密码至少 6 位')
    return
  }

  if (!canCreateTargetRole(createAccountForm.targetRole)) {
    message.error('当前账号创建权限已被上级开关关闭')
    return
  }

  if (createAccountForm.targetRole!=='user' && (!createAccountForm.planCode || !subscriptionPlans.value.some((plan) => plan.code === createAccountForm.planCode))) {
    message.error('请选择当前应用可用的订阅计划')
    return
  }

  isCreatingAccount.value = true
  try {
    const idempotencyKey = [
      'reusable-credits-console',
      authStore.userInfo?.id ?? 'operator',
      createAccountForm.targetRole,
      Date.now(),
      Math.random().toString(36).slice(2, 10),
    ].join(':')

    const result = await createPlatformUser({
      idempotencyKey,
      targetRole: createAccountForm.targetRole,
      username,
      password,
      displayName: createAccountForm.displayName.trim() || username,
      phone: createAccountForm.phone.trim() || undefined,
      email: createAccountForm.email.trim() || undefined,
      ...(createAccountForm.targetRole!=='user'?{applicationCode:createAccountForm.applicationCode,planCode:createAccountForm.planCode,initialPoints:Number(createAccountForm.initialPoints??0)}:{}),
      accountScope: 'personal',
    })

    message.success(
      result.childAccounts?.length
        ? `已创建 ${targetRoleLabel(createAccountForm.targetRole)}：${result.user.username}，并创建 ${result.childAccounts.length} 个子账号`
        : `已创建 ${targetRoleLabel(createAccountForm.targetRole)}：${result.user.username}`,
    )
    isCreateAccountModalOpen.value = false
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '创建账号失败')
  } finally {
    isCreatingAccount.value = false
  }
}

async function handlePromoteUserToAgent(row: CreditsCustomerProfile) {
  if (!canPromoteCustomer(row)) {
    message.warning('当前 User 升级为 Agent 的权限已关闭')
    return
  }

  promotingUserId.value = row.userId
  try {
    const result = await promotePlatformUserToAgent(row.userId, {
      applicationCode: row.applicationCode,
    })
    message.success(`已将 ${result.user.displayName} 升级为代理`)
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '升级为代理失败')
  } finally {
    promotingUserId.value = null
  }
}

async function handleDisableAgent(row: PlatformAgentProfile) {
  if (!canDisableAgent(row)) {
    message.warning('当前角色不能禁用该代理商')
    return
  }

  disablingAgentUserId.value = row.userId
  try {
    const result = await disablePlatformAgent(row.userId, {
      reason: 'back-office disabled Agent role',
    })
    message.success(`已禁用代理商：${result.user.displayName}，账号已回到客户表`)
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '禁用代理商失败')
  } finally {
    disablingAgentUserId.value = null
  }
}

async function handleDisableAgentPolicy(row: PlatformAgentPolicyOverride) {
  if (!canDisableAgentPolicy(row)) {
    message.warning('当前角色不能禁用该代理商')
    return
  }

  disablingAgentUserId.value = row.userId
  try {
    const result = await disablePlatformAgent(row.userId, {
      reason: 'back-office disabled Agent role',
    })
    message.success(`已禁用代理商：${result.user.displayName}，账号已回到客户表`)
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '禁用代理商失败')
  } finally {
    disablingAgentUserId.value = null
  }
}

async function handleApplySettlement(settlementId: string | null | undefined, period: string, status: string) {
  if (!settlementId) {
    message.warning('当前返佣结算还没有生成账单')
    return
  }
  if (status !== 'draft') {
    message.warning('只有草稿账单可以申请结算')
    return
  }

  confirmingSettlementId.value = settlementId
  try {
    await applyAgentSettlement(settlementId)
    message.success(`已提交结算申请：${period}`)
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '申请结算失败')
  } finally {
    confirmingSettlementId.value = null
  }
}

async function handleApproveSettlementPayment(row: PlatformSettlementApplication) {
  if (row.status !== 'requested') {
    message.warning('只有已提交的结算申请可以批准支付')
    return
  }

  approvingSettlementId.value = row.id
  try {
    await approvePlatformSettlementPayment(row.id)
    message.success(`已批准支付：${row.period}`)
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '批准支付失败')
  } finally {
    approvingSettlementId.value = null
  }
}

function openAdjustCreditsModal(row: CreditsCustomerProfile) {
  if (!canAdjustCustomer(row)) {
    message.warning('当前角色不能为该账号增减积分')
    return
  }
  selectedAdjustCreditsUser.value = row
  adjustCreditsForm.points = 0
  adjustCreditsForm.reason = ''
  adjustCreditsForm.classifyAsRecharge = true
  isAdjustCreditsModalOpen.value = true
}

function openAdjustAgentCreditsModal(row: PlatformAgentPolicyOverride) {
  if (!canAdjustAgent(row)) {
    message.warning('当前角色不能为该代理商增减积分')
    return
  }
  selectedAdjustCreditsUser.value = {
    userId: row.userId,
    username: row.username,
    displayName: row.displayName,
    role: 'agent',
  }
  adjustCreditsForm.points = 0
  adjustCreditsForm.reason = ''
  adjustCreditsForm.classifyAsRecharge = true
  isAdjustCreditsModalOpen.value = true
}

async function handleAdjustCredits() {
  const target = selectedAdjustCreditsUser.value
  const points = Number(adjustCreditsForm.points ?? 0)
  if (!target) return
  if (!Number.isFinite(points) || points === 0) {
    message.error('积分变动必须是非 0 数字')
    return
  }
  if (
    activeRole.value !== 'developer' ||
    authStore.userInfo?.id === target.userId ||
    !authStore.permissions.includes('credits:points:adjust')
  ) {
    message.error('当前角色不能为该账号增减积分')
    return
  }

  isAdjustingCredits.value = true
  try {
    const result = await adjustPlatformCredits({
      idempotencyKey: [
        'reusable-credits-console-adjust',
        authStore.userInfo?.id ?? 'operator',
        target.userId,
        Date.now(),
        Math.random().toString(36).slice(2, 10),
      ].join(':'),
      targetUserId: target.userId,
      points,
      reason: adjustCreditsForm.reason.trim() || undefined,
      classifyAsRecharge: adjustCreditsForm.classifyAsRecharge,
    })

    message.success(
      `已调整 ${target.username}：${points > 0 ? '+' : ''}${points.toLocaleString('zh-CN')}，余额 ${result.adjustment.balanceAfter}`,
    )
    isAdjustCreditsModalOpen.value = false
    selectedAdjustCreditsUser.value = null
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '积分调整失败')
  } finally {
    isAdjustingCredits.value = false
  }
}

function openDeleteAccountModal(row: CreditsCustomerProfile) {
  if (!canDeleteCustomer(row)) {
    message.warning('当前角色不能删除该账号')
    return
  }
  selectedCapabilityUser.value = row
  deleteAccountForm.reason = ''
  isDeleteAccountModalOpen.value = true
}

async function handleDeleteAccount() {
  const target = selectedCapabilityUser.value
  if (!target) return
  if (!canDeleteCustomer(target)) {
    message.error('当前角色不能删除该账号')
    return
  }

  isDeletingAccount.value = true
  try {
    await deletePlatformUser(target.userId, {
      reason: deleteAccountForm.reason.trim() || undefined,
    })
    message.success(`${deleteActionText(target)}成功：${target.username}`)
    isDeleteAccountModalOpen.value = false
    selectedCapabilityUser.value = null
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除账号失败')
  } finally {
    isDeletingAccount.value = false
  }
}

async function handleResetPlatformPassword() {
  if (!canResetPlatformPassword(passwordResetForm.userId)) {
    message.error('只能修改自己的登录密码；Developer 可重置其他后台账号')
    return
  }
  const password = passwordResetForm.password
  const confirmPassword = passwordResetForm.confirmPassword
  if (!passwordResetForm.userId) {
    message.error('请选择要重置密码的账号')
    return
  }
  if (password.length < 6) {
    message.error('新密码至少 6 位')
    return
  }
  if (password !== confirmPassword) {
    message.error('两次输入的密码不一致')
    return
  }

  isResettingPassword.value = true
  try {
    const result = await resetPlatformUserPassword(passwordResetForm.userId, {
      password,
      reason: passwordResetForm.userId === authStore.userInfo?.id
        ? 'Back-office user reset own login password from console'
        : 'Developer reset login password from console',
    })
    message.success(`已重置 ${result.user.displayName} 的登录密码`)
    isPasswordResetModalOpen.value = false
    passwordResetForm.password = ''
    passwordResetForm.confirmPassword = ''
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '重置登录密码失败')
  } finally {
    isResettingPassword.value = false
  }
}

async function openAgentCustomerLedger(row: AgentOperationsCustomer) {
  selectedAgentCustomer.value = row
  agentCustomerLedger.value = null
  isAgentCustomerLedgerOpen.value = true
  isLoadingAgentCustomerLedger.value = true
  try {
    agentCustomerLedger.value = await getAgentCustomerLedger(row.id)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载积分流水失败')
  } finally {
    isLoadingAgentCustomerLedger.value = false
  }
}

function openEditAgentCustomer(row: AgentOperationsCustomer) {
  selectedAgentCustomer.value = row
  editAgentCustomerForm.relationId = row.id
  editAgentCustomerForm.displayName = row.customerDisplayName || row.customerUsername
  editAgentCustomerForm.phone = row.customerPhone ?? ''
  isEditAgentCustomerOpen.value = true
}

async function handleUpdateAgentCustomerProfile() {
  const relationId = editAgentCustomerForm.relationId
  const displayName = editAgentCustomerForm.displayName.trim()
  const phone = editAgentCustomerForm.phone.trim()
  if (!relationId || !selectedAgentCustomer.value) {
    message.error('请选择要编辑的客户')
    return
  }
  if (!displayName) {
    message.error('显示名称不能为空')
    return
  }

  isUpdatingAgentCustomer.value = true
  try {
    const result = await updateAgentCustomerProfile(relationId, {
      displayName,
      phone: phone || null,
    })
    message.success(`已更新 ${result.customerDisplayName} 的客户资料`)
    isEditAgentCustomerOpen.value = false
    await refreshOverview()
    if (isAgentCustomerLedgerOpen.value && agentCustomerLedger.value?.customer.id === relationId) {
      agentCustomerLedger.value = await getAgentCustomerLedger(relationId)
    }
    await loadAgentTransactionsLedger()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '更新客户资料失败')
  } finally {
    isUpdatingAgentCustomer.value = false
  }
}

function openEditPlatformUserProfile(row: PlatformEditableProfileRow, targetRole: PlatformEditableProfileRole) {
  if (!canEditPlatformProfile(targetRole, row.userId, row.status)) {
    message.warning('当前角色不能编辑该账号资料')
    return
  }

  editPlatformUserProfileForm.userId = row.userId
  editPlatformUserProfileForm.username = row.username
  editPlatformUserProfileForm.targetRole = targetRole
  editPlatformUserProfileForm.displayName = row.displayName || row.username
  editPlatformUserProfileForm.phone = row.phone ?? ''
  isEditPlatformUserProfileOpen.value = true
}

async function handleUpdatePlatformUserProfile() {
  const userId = editPlatformUserProfileForm.userId
  const targetRole = editPlatformUserProfileForm.targetRole
  const displayName = editPlatformUserProfileForm.displayName.trim()
  const phone = editPlatformUserProfileForm.phone.trim()
  if (!userId) {
    message.error('请选择要编辑的账号')
    return
  }
  if (!displayName) {
    message.error('显示名称不能为空')
    return
  }
  if (!canEditPlatformProfile(targetRole, userId)) {
    message.error('当前角色不能编辑该账号资料')
    return
  }

  isUpdatingPlatformUserProfile.value = true
  try {
    const result = await updatePlatformUserProfile(userId, {
      displayName,
      phone: phone || null,
      reason: 'Back-office updated platform user profile from console',
    })
    message.success(`已更新 ${result.user.displayName} 的账号资料`)
    isEditPlatformUserProfileOpen.value = false
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '更新账号资料失败')
  } finally {
    isUpdatingPlatformUserProfile.value = false
  }
}

async function loadAgentTransactionsLedger() {
  if (activeRole.value !== 'agent') return
  isLoadingAgentTransactionsLedger.value = true
  try {
    agentTransactionsLedger.value = await getAgentTransactionsLedger()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载流水表失败')
  } finally {
    isLoadingAgentTransactionsLedger.value = false
  }
}

async function loadPlatformTransactionsLedger() {
  if (activeRole.value !== 'developer' && activeRole.value !== 'admin') return
  isLoadingPlatformTransactionsLedger.value = true
  try {
    platformTransactionsLedger.value = await getPlatformTransactionsLedger({
      page: platformLedgerPage.value,
      pageSize: platformLedgerPageSize.value,
      applicationCode: selectedApplicationCode.value === 'all' ? undefined : selectedApplicationCode.value,
    })
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载全平台流水表失败')
  } finally {
    isLoadingPlatformTransactionsLedger.value = false
  }
}

async function openCustomerProfileLedger(row: CreditsCustomerProfile) {
  selectedAgentCustomer.value = null
  agentCustomerLedger.value = null
  isAgentCustomerLedgerOpen.value = true
  isLoadingAgentCustomerLedger.value = true
  try {
    agentCustomerLedger.value = await getPlatformCustomerLedger(row.id)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载积分流水失败')
    isAgentCustomerLedgerOpen.value = false
  } finally {
    isLoadingAgentCustomerLedger.value = false
  }
}

function functionDraftKey(row: CreditsAdminOverview['applicationFunctions'][number]) {
  return `${row.applicationCode ?? 'unknown'}:${row.code}`
}

function functionDraftValue(row: CreditsAdminOverview['applicationFunctions'][number]) {
  const key = functionDraftKey(row)
  return functionPointDrafts[key] ?? Number(row.defaultPoints ?? 0)
}

function canEditFunctionDefaultPoints(row: CreditsAdminOverview['applicationFunctions'][number]) {
  return (
    activeRole.value === 'developer' &&
    selectedApplicationCode.value !== 'all' &&
    !!row.applicationCode &&
    row.status !== 'planned'
  )
}

async function handleSaveFunctionDefaultPoints(
  row: CreditsAdminOverview['applicationFunctions'][number],
) {
  if (!canEditFunctionDefaultPoints(row) || !row.applicationCode) {
    message.warning('请选择已接入应用后再编辑默认积分')
    return
  }

  const value = Number(functionDraftValue(row))
  if (!Number.isFinite(value) || value < 0) {
    message.error('默认积分必须为非负数字')
    return
  }

  const key = functionDraftKey(row)
  updatingFunctionKey.value = key
  try {
    await updateApplicationFunctionDefaultPoints(row.applicationCode, row.code, value)
    message.success(`已更新 ${row.name} 默认积分`)
    await refreshOverview()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '更新默认积分失败')
  } finally {
    updatingFunctionKey.value = null
  }
}

const functionColumns: DataTableColumns<CreditsAdminOverview['applicationFunctions'][number]> = [
  { title: '功能编码', key: 'code', width: 220 },
  {
    title: '功能名称',
    key: 'name',
    width: 200,
    render(row) {
      return formatFunctionDisplayName(row.code, row.name)
    },
  },
  { title: '计费模式', key: 'chargeMode', width: 140, render(row) { return row.chargeMode ?? '-' } },
  {
    title: '默认积分',
    key: 'defaultPoints',
    width: 230,
    render(row) {
      return h(
        'div',
        { class: 'admin-function-points-cell' },
        [
          h(NInputNumber, {
            value: functionDraftValue(row),
            min: 0,
            precision: 4,
            size: 'small',
            disabled: !canEditFunctionDefaultPoints(row),
            'onUpdate:value': (value: number | null) => {
              functionPointDrafts[functionDraftKey(row)] = value
            },
          }),
          h(
            NButton,
            {
              size: 'small',
              type: 'primary',
              secondary: true,
              disabled: !canEditFunctionDefaultPoints(row),
              loading: updatingFunctionKey.value === functionDraftKey(row),
              onClick: () => handleSaveFunctionDefaultPoints(row),
            },
            { default: () => '保存' },
          ),
        ],
      )
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      return h(
        NTag,
        {
          round: true,
          bordered: false,
          type: row.status === 'active' ? 'success' : 'default',
        },
        { default: () => row.status },
      )
    },
  },
]

const customerColumns: DataTableColumns<CreditsCustomerProfile> = [
  {
    title: '接入应用',
    key: 'applicationCode',
    width: 150,
    render(row) {
      if (row.applicationCodes?.length) {
        return formatApplicationList(row.applicationCodes)
      }
      return formatApplicationDisplayName(row.applicationCode)
    },
  },
  {
    title: '客户',
    key: 'displayName',
    minWidth: 180,
    render(row) {
      return `${row.displayName} (${row.username})`
    },
  },
  {
    title: '账号关系',
    key: 'enterpriseAccountRole',
    width: 190,
    render(row) {
      return formatEnterpriseAccountRelation(row)
    },
  },
  {
    title: renderCustomerAgentOwnershipTitle,
    key: 'agents',
    width: 210,
    render(row) {
      return formatCustomerAgentOwnership(row)
    },
  },
  { title: '手机号', key: 'phone', width: 140, render(row) { return row.phone ?? '-' } },
  {
    title: '经办人',
    key: 'createdByUserId',
    width: 150,
    render(row) {
      return formatCreatorName(row)
    },
  },
  {
    title: '积分余额',
    key: 'creditsAvailableBalance',
    width: 130,
    render(row) {
      return formatCreditsBalance(row)
    },
  },
  {
    title: '押金余额',
    key: 'depositBalance',
    width: 140,
    render(row) {
      return formatDepositBalance(row)
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      return h(
        NTag,
        {
          round: true,
          bordered: false,
          type: row.status === 'active' ? 'success' : 'default',
        },
        { default: () => row.status },
      )
    },
  },
  customerActionsColumn(),
]

const adminAuthorizationColumns: DataTableColumns<PlatformAdminPolicyOverride> = [
  {
    title: '公司管理员',
    key: 'displayName',
    minWidth: 220,
    render(row) {
      return `${row.displayName} (${row.username})`
    },
  },
  { title: '手机号', key: 'phone', width: 140, render(row) { return row.phone ?? '-' } },
  {
    title: '积分余额',
    key: 'creditsAvailableBalance',
    width: 130,
    render(row) {
      return formatCreditsBalance(row)
    },
  },
  {
    title: '允许创建 User',
    key: 'developerAllowsCreateUsers',
    minWidth: 220,
    render(row) {
      const rowEnabled = row.developerAllowsCreateUsers
      const effectiveEnabled =
        accountCreationPolicyState.developerAllowsAdminCreateUsers && rowEnabled

      return h(
        'div',
        { class: 'admin-auth-switch-cell' },
        [
          h(NSwitch, {
            value: rowEnabled,
            loading: updatingAdminPolicyUserId.value === row.userId,
            disabled: !authStore.policyEditingEnabled || !accountCreationPolicyState.developerAllowsAdminCreateUsers,
            'aria-disabled': !authStore.policyEditingEnabled || !accountCreationPolicyState.developerAllowsAdminCreateUsers,
            'onUpdate:value': (value: boolean) =>
              handleAdminGateChange(row.userId, 'createUsers', value),
          }),
          h(
            'span',
            { class: effectiveEnabled ? 'is-enabled' : 'is-disabled' },
            effectiveEnabled ? '已允许' : '已关闭',
          ),
        ],
      )
    },
  },
  {
    title: '允许创建 Agent / User 成为 Agent',
    key: 'developerAllowsCreateAgents',
    minWidth: 260,
    render(row) {
      const rowEnabled = row.developerAllowsCreateAgents
      const effectiveEnabled =
        accountCreationPolicyState.developerAllowsAdminCreateAgentsAndUsers && rowEnabled

      return h(
        'div',
        { class: 'admin-auth-switch-cell' },
        [
          h(NSwitch, {
            value: rowEnabled,
            loading: updatingAdminPolicyUserId.value === row.userId,
            disabled: !authStore.policyEditingEnabled || !accountCreationPolicyState.developerAllowsAdminCreateAgentsAndUsers,
            'aria-disabled': !authStore.policyEditingEnabled || !accountCreationPolicyState.developerAllowsAdminCreateAgentsAndUsers,
            'onUpdate:value': (value: boolean) =>
              handleAdminGateChange(row.userId, 'createAgents', value),
          }),
          h(
            'span',
            { class: effectiveEnabled ? 'is-enabled' : 'is-disabled' },
            effectiveEnabled ? '已允许' : '已关闭',
          ),
        ],
      )
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    render(row) {
      return h(
        'div',
        { class: 'admin-table-actions' },
        [
          h(
            NButton,
            {
              size: 'small',
              secondary: true,
              disabled: !canEditPlatformProfile('admin', row.userId),
              onClick: () => openEditPlatformUserProfile(row, 'admin'),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:pencil-outline' }),
              default: () => '编辑资料',
            },
          ),
        ],
      )
    },
  },
]

const developerAdminAuthorizationColumns = computed<DataTableColumns<PlatformAdminPolicyOverride>>(() =>
  withPasswordManagementColumn(adminAuthorizationColumns),
)

const agentAuthorizationColumns: DataTableColumns<PlatformAgentPolicyOverride> = [
  {
    title: '代理商',
    key: 'displayName',
    minWidth: 220,
    render(row) {
      return `${row.displayName} (${row.username})`
    },
  },
  {
    title: '接入应用',
    key: 'applications',
    minWidth: 170,
    render(row) {
      return formatApplicationList(row.applications)
    },
  },
  { title: '手机号', key: 'phone', width: 140, render(row) { return row.phone ?? '-' } },
  {
    title: '积分余额',
    key: 'creditsAvailableBalance',
    width: 130,
    render(row) {
      return formatCreditsBalance(row)
    },
  },
  {
    title: '押金余额',
    key: 'depositBalance',
    width: 140,
    render(row) {
      return formatDepositBalance(row)
    },
  },
  {
    title: '增减押金',
    key: 'depositAdjustment',
    width: 120,
    render(row) {
      const isBusy = updatingAgentDepositUserId.value === row.userId
      return h(
        NButton,
        {
          size: 'small',
          secondary: true,
          loading: isBusy,
          disabled: isBusy,
          onClick: () => openAgentDepositAdjustmentModal(row),
        },
        {
          icon: () => h(Icon, { icon: 'mdi:plus-minus-variant' }),
          default: () => '增减押金',
        },
      )
    },
  },
  {
    title: '经办人',
    key: 'assignedByUserId',
    width: 150,
    render(row) {
      return formatAssignerName(row)
    },
  },
  {
    title: '名下客户数',
    key: 'agentCustomerCount',
    width: 120,
    render(row) {
      return String(agentCustomerCountByUserId.value.get(row.userId) ?? 0)
    },
  },
  {
    title: '创建 User',
    key: 'developerDisabledCreateUsers',
    minWidth: 240,
    render(row) {
      const effectiveEnabled =
        accountCreationPolicyState.developerAllowsAgentCreateUsers &&
        accountCreationPolicyState.adminAllowsAgentCreateUsers &&
        !row.developerDisabledCreateUsers

      return h(
        'div',
        { class: 'admin-auth-switch-cell' },
        [
          h(NSwitch, {
            value: !row.developerDisabledCreateUsers,
            loading: updatingAgentPolicyUserId.value === row.userId,
            disabled: !authStore.policyEditingEnabled || !accountCreationPolicyState.developerAllowsAgentCreateUsers,
            'aria-disabled': !authStore.policyEditingEnabled || !accountCreationPolicyState.developerAllowsAgentCreateUsers,
            'onUpdate:value': (value: boolean) =>
              handleAgentCreateUserDisableChange(row.userId, !value),
          }),
          h(
            'span',
            { class: effectiveEnabled ? 'is-enabled' : 'is-disabled' },
            effectiveEnabled ? '可创建 User' : '已禁用',
          ),
        ],
      )
    },
  },
  {
    title: '返佣比例',
    key: 'commissionRate',
    minWidth: 210,
    render(row) {
      const isBusy = updatingAgentCommissionUserId.value === row.userId
      return h(
        'div',
        { class: 'admin-function-points-cell' },
        [
          h(NInputNumber, {
            value: agentCommissionRatePercent(row),
            min: 0,
            max: 100,
            precision: 2,
            step: 0.5,
            size: 'small',
            disabled: isBusy,
            'onUpdate:value': (value: number | null) => {
              agentCommissionRateDrafts[row.userId] = value
            },
          }),
          h(
            'span',
            { class: 'admin-percent-suffix' },
            '%',
          ),
          h(
            NButton,
            {
              size: 'small',
              type: 'primary',
              secondary: true,
              loading: isBusy,
              disabled: isBusy,
              onClick: () => void handleAgentCommissionRateSave(row),
            },
            { default: () => '保存' },
          ),
        ],
      )
    },
  },
  {
    title: '管理动作',
    key: 'actions',
    width: 360,
    render(row) {
      const isBusy = disablingAgentUserId.value === row.userId
      return h(
        'div',
        { class: 'admin-table-actions' },
        [
          h(
            NButton,
            {
              size: 'small',
              secondary: true,
              disabled: !canEditPlatformProfile('agent', row.userId),
              onClick: () => openEditPlatformUserProfile(row, 'agent'),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:pencil-outline' }),
              default: () => '编辑资料',
            },
          ),
          h(
            NButton,
            {
              size: 'small',
              type: 'primary',
              secondary: true,
              disabled: !canConnectApplicationToTarget('agent', row.userId),
              onClick: () => void openConnectApplicationModal({
                userId: row.userId,
                username: row.username,
                displayName: row.displayName,
                targetRole: 'agent',
                existingApplications: agentApplicationsForUser(row.userId),
              }),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:apps' }),
              default: () => '接入应用',
            },
          ),
          h(
            NButton,
            {
              size: 'small',
              type: 'error',
              secondary: true,
              loading: isBusy,
              disabled: isBusy || !canDisableAgentPolicy(row),
              onClick: () => handleDisableAgentPolicy(row),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:account-cancel-outline' }),
              default: () => '禁用代理商',
            },
          ),
        ],
      )
    },
  },
]

const developerAgentAuthorizationColumns = computed<DataTableColumns<PlatformAgentPolicyOverride>>(() =>
  withDeveloperAgentColumns(agentAuthorizationColumns),
)

const agentManagementColumns: DataTableColumns<PlatformAgentProfile> = [
  {
    title: '代理商',
    key: 'displayName',
    minWidth: 190,
    render(row) {
      return `${row.displayName} (${row.username})`
    },
  },
  {
    title: '接入应用',
    key: 'applications',
    minWidth: 170,
    render(row) {
      return formatApplicationList(row.applications)
    },
  },
  { title: '手机号', key: 'phone', width: 140, render(row) { return row.phone ?? '-' } },
  {
    title: '积分余额',
    key: 'creditsAvailableBalance',
    width: 130,
    render(row) {
      return formatCreditsBalance(row)
    },
  },
  {
    title: '押金余额',
    key: 'depositBalance',
    width: 140,
    render(row) {
      return formatDepositBalance(row)
    },
  },
  {
    title: '经办人',
    key: 'assignedByUserId',
    width: 150,
    render(row) {
      return formatAssignerName(row)
    },
  },
  { title: '客户数', key: 'customerCount', width: 90 },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      return h(
        NTag,
        {
          round: true,
          bordered: false,
          type: row.status === 'active' ? 'success' : 'default',
        },
        { default: () => row.status },
      )
    },
  },
  {
    title: '管理动作',
    key: 'actions',
    width: 360,
    render(row) {
      const isBusy = disablingAgentUserId.value === row.userId
      return h(
        'div',
        { class: 'admin-table-actions' },
        [
          h(
            NButton,
            {
              size: 'small',
              secondary: true,
              disabled: !canEditPlatformProfile('agent', row.userId, row.status),
              onClick: () => openEditPlatformUserProfile(row, 'agent'),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:pencil-outline' }),
              default: () => '编辑资料',
            },
          ),
          h(
            NButton,
            {
              size: 'small',
              type: 'primary',
              secondary: true,
              disabled: !canConnectApplicationToTarget('agent', row.userId, row.status),
              onClick: () => void openConnectApplicationModal({
                userId: row.userId,
                username: row.username,
                displayName: row.displayName,
                targetRole: 'agent',
                existingApplications: row.applications,
                status: row.status,
              }),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:apps' }),
              default: () => '接入应用',
            },
          ),
          h(
            NButton,
            {
              size: 'small',
              type: 'error',
              secondary: true,
              loading: isBusy,
              disabled: isBusy || !canDisableAgent(row),
              onClick: () => handleDisableAgent(row),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:account-cancel-outline' }),
              default: () => '禁用代理商',
            },
          ),
        ],
      )
    },
  },
]

const developerCustomerColumns = computed<DataTableColumns<CreditsCustomerProfile>>(() =>
  withDeveloperCustomerColumns(customerColumns),
)

const agentCustomerColumns: DataTableColumns<AgentOperationsCustomer> = [
  {
    title: '接入应用',
    key: 'applicationCode',
    width: 150,
    render(row) {
      return formatApplicationDisplayName(row.applicationCode)
    },
  },
  {
    title: '客户',
    key: 'customerDisplayName',
    minWidth: 190,
    render(row) {
      return `${row.customerDisplayName} (${row.customerUsername})`
    },
  },
  { title: '手机号', key: 'customerPhone', width: 140, render(row) { return row.customerPhone ?? '-' } },
  {
    title: '积分余额',
    key: 'creditsAvailableBalance',
    width: 130,
    render(row) {
      return formatCreditsBalance(row)
    },
  },
  {
    title: '经办人',
    key: 'createdByUserId',
    width: 150,
    render(row) {
      return formatCreatorName(row)
    },
  },
  {
    title: '累计充值积分',
    key: 'totalTopUpCredits',
    width: 140,
    render(row) {
      return Number(row.totalTopUpCredits ?? 0).toLocaleString('zh-CN')
    },
  },
  { title: '关系', key: 'relationType', width: 100 },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      return h(
        NTag,
        {
          round: true,
          bordered: false,
          type: row.status === 'active' ? 'success' : 'default',
        },
        { default: () => row.status },
      )
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 320,
    render(row) {
      const existingApplications = agentCustomerApplicationsForUser(row.customerUserId)
      const hasConnectableApplication = agentGrantedApplications.value.some(
        (applicationCode) => !existingApplications.includes(applicationCode),
      )
      return h(
        'div',
        { class: 'admin-table-actions' },
        [
          h(
            NButton,
            {
              size: 'small',
              secondary: true,
              onClick: () => openEditAgentCustomer(row),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:pencil-outline' }),
              default: () => '编辑',
            },
          ),
          h(
            NButton,
            {
              size: 'small',
              type: 'primary',
              secondary: true,
              disabled:
                !canConnectApplicationToTarget('user', row.customerUserId, row.status) ||
                !hasConnectableApplication,
              onClick: () => void openConnectApplicationModal({
                userId: row.customerUserId,
                username: row.customerUsername,
                displayName: row.customerDisplayName,
                targetRole: 'user',
                existingApplications,
                availableApplications: agentGrantedApplications.value,
                status: row.status,
              }),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:apps' }),
              default: () => '接入应用',
            },
          ),
          h(
            NButton,
            {
              size: 'small',
              secondary: true,
              onClick: () => void openAgentCustomerLedger(row),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:eye-outline' }),
              default: () => '详情',
            },
          ),
        ],
      )
    },
  },
]

const agentCustomerLedgerColumns: DataTableColumns<AgentCustomerLedgerTransaction> = [
  {
    title: '时间',
    key: 'createdAt',
    width: 190,
    render(row) {
      return formatDateTime(row.createdAt)
    },
  },
  {
    title: '积分类型',
    key: 'txnType',
    width: 130,
    render(row) {
      return h(
        NTag,
        {
          round: true,
          bordered: false,
          type: transactionTagType(row.txnType),
        },
        { default: () => transactionTypeLabel(row.txnType) },
      )
    },
  },
  {
    title: '积分变动',
    key: 'points',
    width: 130,
    render(row) {
      return h(
        'span',
        { class: ledgerPointsClass(row) },
        formatLedgerSignedPoints(row),
      )
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 120,
    render() {
      return h('span', { class: 'agent-ledger-status' }, [
        h('span', { class: 'agent-ledger-status-dot' }),
        '已生效',
      ])
    },
  },
  {
    title: '来源/用途',
    key: 'source',
    minWidth: 170,
    render(row) {
      return ledgerSourceText(row)
    },
  },
  {
    title: '操作人',
    key: 'actorIdentityLabel',
    minWidth: 180,
    render(row) {
      return h(
        NTag,
        {
          round: true,
          bordered: false,
          type: row.actorIdentityLabel === '主账号' ? 'warning' : 'default',
        },
        { default: () => ledgerActorText(row) },
      )
    },
  },
]

const agentTransactionsColumns: DataTableColumns<AgentCustomerLedgerTransaction> = [
  {
    title: '时间',
    key: 'createdAt',
    width: 190,
    render(row) {
      return formatDateTime(row.createdAt)
    },
  },
  {
    title: '客户',
    key: 'customerDisplayName',
    minWidth: 220,
    render(row) {
      const username = row.customerUsername ?? '-'
      const displayName = row.customerDisplayName && row.customerDisplayName !== username
        ? `${row.customerDisplayName} (${username})`
        : username
      return displayName
    },
  },
  {
    title: '应用',
    key: 'applicationCode',
    width: 160,
    render(row) {
      return formatApplicationDisplayName(row.applicationCode)
    },
  },
  {
    title: '积分类型',
    key: 'txnType',
    width: 130,
    render(row) {
      return h(
        NTag,
        {
          round: true,
          bordered: false,
          type: transactionTagType(row.txnType),
        },
        { default: () => transactionTypeLabel(row.txnType) },
      )
    },
  },
  {
    title: '积分变动',
    key: 'points',
    width: 130,
    render(row) {
      return h(
        'span',
        { class: ledgerPointsClass(row) },
        formatLedgerSignedPoints(row),
      )
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 120,
    render() {
      return h('span', { class: 'agent-ledger-status' }, [
        h('span', { class: 'agent-ledger-status-dot' }),
        '已生效',
      ])
    },
  },
  {
    title: '来源/用途',
    key: 'source',
    minWidth: 170,
    render(row) {
      return ledgerSourceText(row)
    },
  },
  {
    title: '操作人',
    key: 'actorIdentityLabel',
    minWidth: 180,
    render(row) {
      return h(
        NTag,
        {
          round: true,
          bordered: false,
          type: row.actorIdentityLabel === '主账号' ? 'warning' : 'default',
        },
        { default: () => ledgerActorText(row) },
      )
    },
  },
]

const commissionTopUpTransactionColumns: DataTableColumns<AgentOperationsTopUpTransaction> = [
  {
    title: '时间',
    key: 'createdAt',
    minWidth: 170,
    render(row) {
      return formatDateTime(row.createdAt)
    },
  },
  { title: '类型', key: 'txnType', width: 120 },
  {
    title: '充值积分',
    key: 'points',
    width: 130,
    render(row) {
      return Number(row.points ?? 0).toLocaleString('zh-CN')
    },
  },
  {
    title: '来源/用途',
    key: 'remark',
    minWidth: 180,
    render(row) {
      return row.remark ?? row.bizType ?? '-'
    },
  },
]

const agentCommissionColumns: DataTableColumns<AgentOperationsCommissionPreview> = [
  { title: '周期', key: 'period', width: 110 },
  {
    title: '应用',
    key: 'applicationCode',
    width: 150,
    render(row) {
      return formatApplicationDisplayName(row.applicationCode)
    },
  },
  {
    title: '客户',
    key: 'customerDisplayName',
    minWidth: 160,
    render(row) {
      return row.customerDisplayName ?? row.customerUsername ?? '-'
    },
  },
  {
    title: '充值积分',
    key: 'topUpCredits',
    width: 130,
    render(row) {
      return Number(row.topUpCredits ?? row.consumedPoints ?? 0).toLocaleString('zh-CN')
    },
  },
  {
    title: '返佣比例',
    key: 'commissionRate',
    width: 110,
    render(row) {
      return `${(Number(row.commissionRate ?? 0) * 100).toFixed(1)}%`
    },
  },
  {
    title: '预计返佣',
    key: 'commissionPoints',
    width: 130,
    render(row) {
      return Number(row.commissionPoints ?? 0).toLocaleString('zh-CN')
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      return settlementStatusLabel(row.status)
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 240,
    render(row) {
      return h(
        'div',
        { class: 'admin-table-actions' },
        [
          h(
            NButton,
            {
              size: 'small',
              secondary: true,
              onClick: () => {
                selectedCommissionDetail.value = row
              },
            },
            {
              icon: () => h(Icon, { icon: 'mdi:eye-outline' }),
              default: () => '查看详情',
            },
          ),
          h(
            NButton,
            {
              size: 'small',
              secondary: true,
              type: 'primary',
              disabled: row.status !== 'draft' || !row.settlementId,
              loading: confirmingSettlementId.value === row.settlementId,
              onClick: () => handleApplySettlement(row.settlementId, row.period, row.status),
            },
            {
              icon: () => h(Icon, { icon: 'mdi:check-decagram-outline' }),
              default: () => row.status === 'draft' ? '申请结算' : settlementStatusLabel(row.status),
            },
          ),
        ],
      )
    },
  },
]

const agentSettlementColumns: DataTableColumns<AgentOperationsSettlementBill> = [
  { title: '账单编号', key: 'id', minWidth: 180 },
  { title: '结算周期', key: 'period', width: 120 },
  {
    title: '返佣积分',
    key: 'totalCommissionPoints',
    width: 140,
    render(row) {
      return Number(row.totalCommissionPoints ?? 0).toLocaleString('zh-CN')
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 120,
    render(row) {
      return settlementStatusLabel(row.status)
    },
  },
  {
    title: '申请时间',
    key: 'requestedAt',
    minWidth: 180,
    render(row) {
      return row.requestedAt ? formatDateTime(row.requestedAt) : '-'
    },
  },
  {
    title: '批准时间',
    key: 'approvedAt',
    minWidth: 180,
    render(row) {
      return row.paidAt
        ? formatDateTime(row.paidAt)
        : row.confirmedAt
          ? formatDateTime(row.confirmedAt)
          : '-'
    },
  },
]

const settlementApplicationColumns: DataTableColumns<PlatformSettlementApplication> = [
  { title: '账单编号', key: 'id', minWidth: 180 },
  {
    title: '代理商',
    key: 'agentDisplayName',
    minWidth: 180,
    render(row) {
      return `${row.agentDisplayName} (${row.agentUsername})`
    },
  },
  { title: '周期', key: 'period', width: 110 },
  {
    title: '申请返佣积分',
    key: 'totalCommissionPoints',
    width: 150,
    render(row) {
      return Number(row.totalCommissionPoints ?? 0).toLocaleString('zh-CN')
    },
  },
  {
    title: '状态',
    key: 'status',
    width: 110,
    render(row) {
      return settlementStatusLabel(row.status)
    },
  },
  {
    title: '申请时间',
    key: 'requestedAt',
    minWidth: 180,
    render(row) {
      return row.requestedAt ? formatDateTime(row.requestedAt) : '-'
    },
  },
  {
    title: '审批人',
    key: 'approvedByUsername',
    minWidth: 160,
    render(row) {
      return settlementApproverText(row)
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    render(row) {
      return h(
        NButton,
        {
          size: 'small',
          secondary: true,
          type: 'primary',
          disabled: row.status !== 'requested',
          loading: approvingSettlementId.value === row.id,
          onClick: () => handleApproveSettlementPayment(row),
        },
        { default: () => row.status === 'requested' ? '批准支付' : settlementStatusLabel(row.status) },
      )
    },
  },
]

</script>

<template>
  <main class="credits-admin-page theme-light" :class="`role-theme-${activeRole}`">
    <section class="admin-shell">
      <header v-if="activeRole !== 'developer'" class="admin-hero">
        <div class="admin-hero-copy">
          <p class="admin-hero-kicker">Reusable Credits Platform Console</p>
          <h1>欢迎使用 积分后台</h1>
        </div>
        <div class="admin-hero-actions">
          <NButton type="primary" :loading="isLoading" @click="refreshOverview">
            <template #icon>
              <Icon icon="mdi:refresh" />
            </template>
            刷新实时数据
          </NButton>
        </div>
      </header>

      <nav v-if="visibleRoleTabs.length > 1" class="admin-tabs" aria-label="角色切换">
        <button
          v-for="tab in visibleRoleTabs"
          :key="tab.value"
          type="button"
          class="admin-tab"
          :class="{ active: activeRole === tab.value }"
          @click="activeRole = tab.value"
        >
          <Icon :icon="tab.icon" />
          <span class="admin-tab-label">{{ tab.label }}</span>
          <span class="admin-tab-desc">{{ tab.description }}</span>
        </button>
      </nav>

      <NSpin :show="isLoading">
        <p v-if="lastError" class="admin-error">{{ lastError }}</p>
        <p v-if="interactionFeedback" class="admin-feedback">{{ interactionFeedback }}</p>

        <section
          v-if="platformDashboard && activeRoleDashboardPage"
          :id="activeRole === 'developer' ? 'developer-dashboard' : activeRole === 'admin' ? 'admin-dashboard' : 'agent-dashboard-insights'"
          class="admin-dashboard-insights"
          aria-label="系统概览、积分趋势与套餐占比"
        >
          <article class="admin-system-overview-card">
            <div class="admin-trend-head">
              <h2>系统概览</h2>
            </div>
            <ul class="admin-system-overview-list">
              <li v-for="item in adminSystemOverviewList" :key="item.key">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </li>
            </ul>
          </article>

          <article class="admin-trend-card" aria-label="积分趋势">
            <div class="admin-trend-head">
              <h2>{{ dashboardTrendTitle }}</h2>
              <div class="admin-chip-group">
                <button
                  v-for="option in trendPeriodOptions"
                  :key="option.value"
                  type="button"
                  class="admin-chip"
                  :class="{ active: dashboardTrendPeriod === option.value }"
                  @click="dashboardTrendPeriod = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <div class="admin-chip-group admin-chip-group-metric">
              <button
                v-for="option in trendMetricOptions"
                :key="option.value"
                type="button"
                class="admin-chip"
                :class="{ active: dashboardTrendMetric === option.value }"
                @click="dashboardTrendMetric = option.value"
              >
                {{ option.label }}
              </button>
            </div>
            <div ref="dashboardTrendChartRef" class="admin-trend-chart" />
          </article>

          <article class="admin-plan-pie-card" aria-label="套餐占比">
            <div class="admin-trend-head">
              <h2>套餐占比</h2>
            </div>
            <div ref="dashboardPlanPieChartRef" class="admin-plan-pie-chart" />
          </article>

          <article class="admin-filter-band" aria-label="应用筛选">
            <div class="admin-filter-current">
              <p>当前筛选</p>
              <strong>{{ selectedApplicationLabel }}</strong>
              <span v-if="selectedApplicationCode === 'all'">跨应用平台视图</span>
            </div>
            <div class="admin-filter-options">
              <button
                v-for="item in applicationFilterOptions"
                :key="item.code"
                type="button"
                class="admin-filter-chip"
                :class="{ active: selectedApplicationCode === item.code }"
                @click="selectedApplicationCode = item.code"
              >
                <span>{{ item.name }}</span>
                <small>{{ item.statusText }}</small>
              </button>
            </div>
          </article>
        </section>

        <section
          v-if="activeRole === 'developer' && activeDeveloperConsolePage === 'developer-dashboard'"
          id="developer-account-controls"
          class="admin-section"
        >
          <div class="admin-collapse-head">
            <span>
              <p v-if="!authStore.policyEditingEnabled" role="status">原有账号策略模板已保留，当前未激活。后台代建尚未开放；普通用户可自行注册公司账号。</p><strong>账号与权限</strong><p style="margin:6px 0;color:#64748b;font-size:12px">普通用户可自行注册公司账号。代理商机制已保留，{{ authStore.agentWorkflowsEnabled ? '按已配置权限启用' : '当前未启用' }}。</p>
              <small>所有者分别使用独立登录账号。创建账号、发布价格等重要操作可在操作记录中核查。</small>
            </span>
          </div>
          <div class="admin-collapse-body">
            <div class="admin-action-row" aria-label="开发者创建账号">
              <NButton type="primary" @click="ownerRouter.push('/back-office/owners?create=1')">创建公司所有者</NButton>
              <NButton type="primary" @click="openCreateAccountModal('admin')">
                <template #icon>
                  <Icon icon="mdi:account-tie-outline" />
                </template>
                创建 Admin
              </NButton>
              <NButton :disabled="!authStore.policyEditingEnabled || !authStore.agentWorkflowsEnabled" @click="openCreateAccountModal('agent')">
                <template #icon>
                  <Icon icon="mdi:handshake-outline" />
                </template>
                创建 Agent
              </NButton>
              <NButton @click="openCreateAccountModal('user')">
                <template #icon>
                  <Icon icon="mdi:account-plus-outline" />
                </template>
                创建 User
              </NButton>
            </div>
            <div class="admin-toggle-grid">
              <article class="admin-toggle-card">
                <div>
                  <h3>允许公司管理员创建 User</h3>
                  <p>一级总开关；关闭后所有 Admin 不能创建 User。</p>
                </div>
                <NSwitch v-model:value="accountCreationPolicyState.developerAllowsAdminCreateUsers" :aria-disabled="!authStore.policyEditingEnabled" :disabled="!authStore.policyEditingEnabled" />
              </article>
              <article class="admin-toggle-card">
                <div>
                  <h3>允许公司管理员创建 Agent</h3>
                  <p>一级总开关；关闭后所有 Admin 不能创建 Agent，也不能让 User 成为 Agent。</p>
                </div>
                <NSwitch v-model:value="accountCreationPolicyState.developerAllowsAdminCreateAgentsAndUsers" :aria-disabled="!authStore.policyEditingEnabled || !authStore.agentWorkflowsEnabled" :disabled="!authStore.policyEditingEnabled || !authStore.agentWorkflowsEnabled" />
              </article>
              <article class="admin-toggle-card">
                <div>
                  <h3>允许代理商创建 User</h3>
                  <p>一级覆盖开关；关闭后所有 Agent 不能创建 User。</p>
                </div>
                <NSwitch v-model:value="accountCreationPolicyState.developerAllowsAgentCreateUsers" :aria-disabled="!authStore.policyEditingEnabled || !authStore.agentWorkflowsEnabled" :disabled="!authStore.policyEditingEnabled || !authStore.agentWorkflowsEnabled" />
              </article>
            </div>
          </div>
        </section>

        <section
          v-if="activeRole === 'admin' && activeAdminConsolePage === 'admin-dashboard'"
          id="admin-account-creation"
          class="admin-section"
        >
          <div class="admin-collapse-head">
            <span>
              <strong>账号创建权限</strong>
              <small>公司管理员可创建 User 和 Agent；也可以将普通 User 升级为 Agent。</small>
            </span>
          </div>
          <div class="admin-collapse-body">
            <div class="admin-action-row" aria-label="公司管理员创建账号">
              <NButton
                type="primary"
                :disabled="!effectiveAccountCreationPolicy.adminCanCreateUsers"
                @click="openCreateAccountModal('user')"
              >
                <template #icon>
                  <Icon icon="mdi:account-plus-outline" />
                </template>
                创建 User
              </NButton>
              <NButton
                :disabled="!effectiveAccountCreationPolicy.adminCanCreateAgents"
                @click="openCreateAccountModal('agent')"
              >
                <template #icon>
                  <Icon icon="mdi:handshake-outline" />
                </template>
                创建 Agent
              </NButton>
            </div>
            <div class="admin-toggle-grid">
              <article class="admin-toggle-card">
                <div>
                  <h3>公司管理员创建 User</h3>
                  <p>{{ effectiveAccountCreationPolicy.adminCanCreateUsers ? '开发者已开启' : '开发者已关闭' }}</p>
                </div>
                <NSwitch :value="effectiveAccountCreationPolicy.adminCanCreateUsers" aria-disabled="true" disabled />
              </article>
              <article class="admin-toggle-card">
                <div>
                  <h3>公司管理员创建 Agent</h3>
                  <p>{{ effectiveAccountCreationPolicy.adminCanCreateAgents ? '开发者已开启' : '开发者已关闭' }}</p>
                </div>
                <NSwitch :value="effectiveAccountCreationPolicy.adminCanCreateAgents" aria-disabled="true" disabled />
              </article>
              <article class="admin-toggle-card">
                <div>
                  <h3>允许代理商创建 User</h3>
                  <p>公司管理员主开关；若开发者禁用代理商权限，此开关不会生效。</p>
                </div>
                <NSwitch
                  v-model:value="accountCreationPolicyState.adminAllowsAgentCreateUsers"
                  :aria-disabled="!authStore.policyEditingEnabled || !authStore.agentWorkflowsEnabled || !accountCreationPolicyState.developerAllowsAgentCreateUsers" :disabled="!authStore.policyEditingEnabled || !authStore.agentWorkflowsEnabled || !accountCreationPolicyState.developerAllowsAgentCreateUsers"
                />
              </article>
              <article class="admin-toggle-card">
                <div>
                  <h3>允许 User 成为 Agent</h3>
                  <p>公司管理员开关；若开发者关闭公司管理员创建 Agent，此开关不会生效。</p>
                </div>
                <NSwitch
                  v-model:value="accountCreationPolicyState.adminAllowsUserBecomeAgent"
                  :aria-disabled="!authStore.policyEditingEnabled || !authStore.agentWorkflowsEnabled || !accountCreationPolicyState.developerAllowsAdminCreateAgentsAndUsers" :disabled="!authStore.policyEditingEnabled || !authStore.agentWorkflowsEnabled || !accountCreationPolicyState.developerAllowsAdminCreateAgentsAndUsers"
                />
              </article>
            </div>
          </div>
        </section>

        <template v-if="activeRole === 'developer'">
          <section v-if="activeDeveloperConsolePage === 'developer-admins'" id="developer-admins" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>管理员表</strong>
                <small>{{ adminPolicyOverrides.length }} 条记录；查看 Admin 信息并配置公司管理员创建权限。</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <NDataTable
                v-if="adminPolicyOverrides.length"
                :columns="developerAdminAuthorizationColumns"
                :data="adminPolicyOverrides"
                :bordered="false"
                :single-line="false"
                :pagination="compactTablePagination"
              />
              <NEmpty v-else description="暂无公司管理员账号" />
            </div>
          </section>

          <section v-if="activeDeveloperConsolePage === 'developer-agents'" id="developer-agents" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>代理商表</strong>
                <small>{{ searchedAgentPolicyOverrides.length }} 条记录；全平台 Agent 创建权限、押金、返佣比例与禁用管理。</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div class="admin-table-toolbar">
                <NInput
                  v-model:value="adminAgentSearchQuery"
                  clearable
                  placeholder="按 username 或手机号搜索代理商"
                  class="admin-table-search"
                >
                  <template #prefix>
                    <Icon icon="mdi:magnify" />
                  </template>
                </NInput>
              </div>
              <NDataTable
                v-if="searchedAgentPolicyOverrides.length"
                :columns="developerAgentAuthorizationColumns"
                :data="searchedAgentPolicyOverrides"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
              <NEmpty v-else :description="agentPolicyOverrides.length ? '没有匹配的代理商账号' : '暂无代理商账号'" />
            </div>
          </section>

          <section v-if="activeDeveloperConsolePage === 'developer-customers'" id="developer-customers" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>客户表</strong>
                <small>{{ searchedRegularUserProfiles.length }} 条记录；开发者可读取全平台客户余额/流水。</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div class="agent-customer-insights-grid">
                <section class="agent-customer-chart-panel" aria-label="客户积分充值排行">
                  <div class="admin-trend-head">
                    <h2>Top 5 积分充值客户</h2>
                  </div>
                  <div ref="globalCustomerBarChartRef" class="agent-customer-bar-chart" />
                </section>
                <section class="agent-customer-chart-panel" aria-label="客户用户类型分布">
                  <div class="admin-trend-head">
                    <h2>用户类型分布</h2>
                  </div>
                  <div ref="globalCustomerPieChartRef" class="agent-customer-pie-chart" />
                </section>
              </div>
              <div class="admin-table-toolbar">
                <NInput
                  v-model:value="adminCustomerSearchQuery"
                  clearable
                  placeholder="按 username 或手机号搜索客户"
                  class="admin-table-search"
                >
                  <template #prefix>
                    <Icon icon="mdi:magnify" />
                  </template>
                </NInput>
              </div>
              <NDataTable
                :columns="developerCustomerColumns"
                :data="searchedRegularUserProfiles"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
            </div>
          </section>

          <section v-if="activeDeveloperConsolePage === 'developer-transactions'" id="developer-transactions" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>流水表</strong>
                <small>{{ globalLedgerTransactionTotal }} 条记录；开发者查看全平台积分流水。</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div v-if="globalLedgerTransactions.length" class="agent-ledger-insights-grid">
                <section class="agent-ledger-chart-panel" aria-label="流水积分消费排行">
                  <div class="admin-trend-head">
                    <h2>Top 5 积分消费客户</h2>
                  </div>
                  <div ref="globalLedgerConsumerBarChartRef" class="agent-ledger-bar-chart" />
                </section>
                <section class="agent-ledger-chart-panel" aria-label="功能使用分布">
                  <div class="admin-trend-head">
                    <h2>功能使用分布</h2>
                  </div>
                  <div ref="globalFunctionUsagePieChartRef" class="agent-ledger-pie-chart" />
                </section>
              </div>
              <div class="admin-section-actions">
                <NButton size="small" secondary @click="exportRows('developer-global-ledger', globalLedgerTransactions)">
                  <template #icon>
                    <Icon icon="mdi:download-outline" />
                  </template>
                  导出
                </NButton>
              </div>
              <NSpin :show="isLoadingPlatformTransactionsLedger">
                <NDataTable
                  v-if="globalLedgerTransactions.length"
                  :columns="agentTransactionsColumns"
                  :data="globalLedgerTransactions"
                  :bordered="false"
                  :single-line="false"
                  :pagination="platformLedgerPagination"
                />
                <NEmpty v-else :description="isLoadingPlatformTransactionsLedger ? '正在加载流水表' : '暂无积分流水'" />
              </NSpin>
            </div>
          </section>

          <section v-if="activeDeveloperConsolePage === 'developer-settlements'" id="developer-settlements" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>结算审批</strong>
                <small>{{ settlementApplications.length }} 条记录；开发者查看全平台结算申请。</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <NDataTable
                v-if="settlementApplications.length"
                :columns="settlementApplicationColumns"
                :data="settlementApplications"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
              <NEmpty v-else description="暂无结算申请" />
            </div>
          </section>

          <section v-if="activeDeveloperConsolePage === 'developer-billing'" id="developer-billing" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>跨应用功能计费配置 · {{ selectedApplicationLabel }}</strong>
                <small>按当前应用筛选功能编码、计费模式、默认积分与状态。</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <NDataTable
                v-if="selectedApplicationFunctions.length"
                :columns="functionColumns"
                :data="selectedApplicationFunctions"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
              <NEmpty
                v-else
                :description="selectedApplicationCode === 'all' ? '请先选择一个应用后查看功能计费配置' : '暂无功能计费配置'"
              />
            </div>
          </section>
        </template>

        <template v-else-if="activeRole === 'admin'">
          <section v-if="activeAdminConsolePage === 'admin-agents'" id="admin-agents" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>代理商表</strong>
                <small>{{ searchedAdminAgentProfiles.length }} 条记录；公司管理员可以创建 Agent，并可禁用 Agent。</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div class="admin-table-toolbar">
                <NInput
                  v-model:value="adminAgentSearchQuery"
                  clearable
                  placeholder="按 username 或手机号搜索代理商"
                  class="admin-table-search"
                >
                  <template #prefix>
                    <Icon icon="mdi:magnify" />
                  </template>
                </NInput>
              </div>
              <NDataTable
                v-if="searchedAdminAgentProfiles.length"
                :columns="agentManagementColumns"
                :data="searchedAdminAgentProfiles"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
              <NEmpty v-else :description="filteredAgentProfiles.length ? '没有匹配的代理商账号' : '暂无代理商账号'" />
            </div>
          </section>

          <section v-if="activeAdminConsolePage === 'admin-users'" id="admin-users" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>客户表</strong>
                <small>{{ searchedRegularUserProfiles.length }} 条记录；公司管理员可读取全部客户余额/流水。</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div class="agent-customer-insights-grid">
                <section class="agent-customer-chart-panel" aria-label="客户积分充值排行">
                  <div class="admin-trend-head">
                    <h2>Top 5 积分充值客户</h2>
                  </div>
                  <div ref="globalCustomerBarChartRef" class="agent-customer-bar-chart" />
                </section>
                <section class="agent-customer-chart-panel" aria-label="客户用户类型分布">
                  <div class="admin-trend-head">
                    <h2>用户类型分布</h2>
                  </div>
                  <div ref="globalCustomerPieChartRef" class="agent-customer-pie-chart" />
                </section>
              </div>
              <div class="admin-table-toolbar">
                <NInput
                  v-model:value="adminCustomerSearchQuery"
                  clearable
                  placeholder="按 username 或手机号搜索客户"
                  class="admin-table-search"
                >
                  <template #prefix>
                    <Icon icon="mdi:magnify" />
                  </template>
                </NInput>
              </div>
              <NDataTable
                :columns="customerColumns"
                :data="searchedRegularUserProfiles"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
            </div>
          </section>

          <section v-if="activeAdminConsolePage === 'admin-transactions'" id="admin-transactions" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>流水表</strong>
                <small>{{ globalLedgerTransactionTotal }} 条记录；公司管理员查看全平台积分流水。</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div v-if="globalLedgerTransactions.length" class="agent-ledger-insights-grid">
                <section class="agent-ledger-chart-panel" aria-label="流水积分消费排行">
                  <div class="admin-trend-head">
                    <h2>Top 5 积分消费客户</h2>
                  </div>
                  <div ref="globalLedgerConsumerBarChartRef" class="agent-ledger-bar-chart" />
                </section>
                <section class="agent-ledger-chart-panel" aria-label="功能使用分布">
                  <div class="admin-trend-head">
                    <h2>功能使用分布</h2>
                  </div>
                  <div ref="globalFunctionUsagePieChartRef" class="agent-ledger-pie-chart" />
                </section>
              </div>
              <div class="admin-section-actions">
                <NButton size="small" secondary @click="exportRows('admin-global-ledger', globalLedgerTransactions)">
                  <template #icon>
                    <Icon icon="mdi:download-outline" />
                  </template>
                  导出
                </NButton>
              </div>
              <NSpin :show="isLoadingPlatformTransactionsLedger">
                <NDataTable
                  v-if="globalLedgerTransactions.length"
                  :columns="agentTransactionsColumns"
                  :data="globalLedgerTransactions"
                  :bordered="false"
                  :single-line="false"
                  :pagination="platformLedgerPagination"
                />
                <NEmpty v-else :description="isLoadingPlatformTransactionsLedger ? '正在加载流水表' : '暂无积分流水'" />
              </NSpin>
            </div>
          </section>

          <section v-if="activeAdminConsolePage === 'admin-settlements'" id="admin-settlements" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>结算审批</strong>
                <small>{{ settlementApplications.length }} 条记录</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <NDataTable
                v-if="settlementApplications.length"
                :columns="settlementApplicationColumns"
                :data="settlementApplications"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
              <NEmpty v-else description="暂无结算申请" />
            </div>
          </section>

        </template>

        <template v-else>
          <section v-if="activeAgentConsolePage === 'agent-dashboard'" id="agent-dashboard" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>代理商运营视图</strong>
                <small>
                  当前状态：{{ agentCreationGateText }}；当前代理：{{ agentOverview?.agent.displayName ?? '未加载' }}。
                </small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div class="admin-action-row" aria-label="代理商创建账号">
                <NButton
                  type="primary"
                  :disabled="!effectiveAccountCreationPolicy.agentCanCreateUsers"
                  @click="openCreateAccountModal('user')"
                >
                  <template #icon>
                    <Icon icon="mdi:account-plus-outline" />
                  </template>
                  创建 User
                </NButton>
              </div>
              <div class="admin-agent-grid" v-if="agentOverview">
                <article class="admin-agent-card">
                  <h3>自有客户</h3>
                  <strong>{{ filteredAgentCustomers.length }}</strong>
                  <p>来自 Credits Platform · agent_relations</p>
                </article>
                <article class="admin-agent-card">
                  <h3>押金余额</h3>
                  <strong>{{ formatDepositBalance(agentOverview.agent) }}</strong>
                  <p>创建 User 时按套餐价格扣减</p>
                </article>
                <article class="admin-agent-card">
                  <h3>预计返佣</h3>
                  <strong>{{ Number(filteredAgentPreviewCommissionPoints).toLocaleString('zh-CN') }}</strong>
                  <p>预览中佣金积分</p>
                </article>
                <article class="admin-agent-card">
                  <h3>待确认账单</h3>
                  <strong>{{ filteredAgentDraftSettlementCount }}</strong>
                  <p>待申请返佣账单</p>
                </article>
              </div>
              <NEmpty v-else description="暂无代理商运营数据" />
            </div>
          </section>

          <section v-if="activeAgentConsolePage === 'agent-customers'" id="agent-customers" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>客户表</strong>
                <small>{{ searchedAgentCustomers.length }} 条记录</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div v-if="filteredAgentCustomers.length" class="agent-customer-insights-grid">
                <section class="agent-customer-chart-panel" aria-label="客户积分充值排行">
                  <div class="admin-trend-head">
                    <h2>Top 5 积分充值客户</h2>
                  </div>
                  <div ref="agentConsumerBarChartRef" class="agent-customer-bar-chart" />
                </section>
                <section class="agent-customer-chart-panel" aria-label="客户类型分布">
                  <div class="admin-trend-head">
                    <h2>客户类型分布</h2>
                  </div>
                  <div ref="agentUserTypePieChartRef" class="agent-customer-pie-chart" />
                </section>
              </div>
              <div class="admin-section-actions">
                <NInput
                  v-model:value="agentCustomerSearchQuery"
                  clearable
                  placeholder="按 username 或手机号搜索客户"
                  class="admin-table-search"
                >
                  <template #prefix>
                    <Icon icon="mdi:magnify" />
                  </template>
                </NInput>
                <NButton size="small" secondary @click="exportRows('agent-customers', searchedAgentCustomers)">
                  <template #icon>
                    <Icon icon="mdi:download-outline" />
                  </template>
                  导出
                </NButton>
              </div>
              <NDataTable
                v-if="searchedAgentCustomers.length"
                :columns="agentCustomerColumns"
                :data="searchedAgentCustomers"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
              <NEmpty v-else :description="filteredAgentCustomers.length ? '没有匹配的客户档案' : '暂无客户档案'" />
            </div>
          </section>

          <section v-if="activeAgentConsolePage === 'agent-consumption'" id="agent-consumption" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>流水表</strong>
                <small>{{ agentLedgerTransactions.length }} 条记录</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div v-if="agentLedgerTransactions.length" class="agent-ledger-insights-grid">
                <section class="agent-ledger-chart-panel" aria-label="流水积分消费排行">
                  <div class="admin-trend-head">
                    <h2>Top 5 积分消费客户</h2>
                  </div>
                  <div ref="agentLedgerConsumerBarChartRef" class="agent-ledger-bar-chart" />
                </section>
                <section class="agent-ledger-chart-panel" aria-label="功能使用分布">
                  <div class="admin-trend-head">
                    <h2>功能使用分布</h2>
                  </div>
                  <div ref="agentFunctionUsagePieChartRef" class="agent-ledger-pie-chart" />
                </section>
              </div>
              <div class="admin-section-actions">
                <NButton size="small" secondary @click="exportRows('agent-bound-customer-ledger', agentLedgerTransactions)">
                  <template #icon>
                    <Icon icon="mdi:download-outline" />
                  </template>
                  导出
                </NButton>
              </div>
              <NSpin :show="isLoadingAgentTransactionsLedger">
                <NDataTable
                  v-if="agentLedgerTransactions.length"
                  :columns="agentTransactionsColumns"
                  :data="agentLedgerTransactions"
                  :bordered="false"
                  :single-line="false"
                  :pagination="ledgerTablePagination"
                />
                <NEmpty v-else :description="isLoadingAgentTransactionsLedger ? '正在加载流水表' : '暂无绑定客户积分流水'" />
              </NSpin>
            </div>
          </section>

          <section v-if="activeAgentConsolePage === 'agent-settlements'" id="agent-settlements" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>返佣结算</strong>
                <small>{{ filteredAgentCommissions.length }} 条记录</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div class="admin-section-actions">
                <NButton size="small" secondary @click="exportRows('agent-commission-settlements', filteredAgentCommissions)">
                  <template #icon>
                    <Icon icon="mdi:download-outline" />
                  </template>
                  导出
                </NButton>
              </div>
              <div v-if="commissionPolicy" class="admin-rule-grid" aria-label="返佣与结算规则">
                <article class="admin-rule-card">
                  <p>积分汇率</p>
                  <strong>1 RMB = {{ commissionPolicy.creditsPerRmb }} 积分</strong>
                  <span>{{ commissionPolicy.currency }}</span>
                </article>
                <article class="admin-rule-card">
                  <p>默认返佣</p>
                  <strong>{{ (commissionPolicy.commissionRate * 100).toFixed(0) }}%</strong>
                  <span>基于客户充值积分</span>
                </article>
                <article class="admin-rule-card">
                  <p>结算日</p>
                  <strong>每月 {{ commissionPolicy.settlementDayOfMonth }} 日</strong>
                  <span>结算上一个自然月</span>
                </article>
              </div>
              <NDataTable
                v-if="filteredAgentCommissions.length"
                :columns="agentCommissionColumns"
                :data="filteredAgentCommissions"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
              <NEmpty v-else description="暂无返佣结算" />
            </div>
          </section>

          <section v-if="activeAgentConsolePage === 'agent-settlements'" class="admin-section">
            <div class="admin-collapse-head">
              <span>
                <strong>历史账单</strong>
                <small>{{ agentSettlements.length }} 条记录</small>
              </span>
            </div>
            <div class="admin-collapse-body">
              <div class="admin-section-actions">
                <NButton size="small" secondary @click="exportRows('agent-settlement-history', agentSettlements)">
                  <template #icon>
                    <Icon icon="mdi:download-outline" />
                  </template>
                  导出
                </NButton>
              </div>
              <NDataTable
                v-if="agentSettlements.length"
                :columns="agentSettlementColumns"
                :data="agentSettlements"
                :bordered="false"
                :single-line="false"
                :pagination="tablePagination"
              />
              <NEmpty v-else description="暂无历史账单" />
            </div>
          </section>

        </template>
      </NSpin>

      <NModal
        :show="!!selectedCommissionDetail"
        preset="card"
        class="admin-create-modal agent-ledger-modal"
        title="返佣详情"
        :style="{ width: '860px', maxWidth: '94vw', maxHeight: 'calc(100vh - 80px)' }"
        @update:show="(show) => { if (!show) selectedCommissionDetail = null }"
      >
        <div v-if="selectedCommissionDetail" class="agent-ledger-toolbar">
          <div class="agent-ledger-summary">
            <span>{{ selectedCommissionDetail.period }} · {{ selectedCommissionDetail.customerDisplayName ?? selectedCommissionDetail.customerUsername ?? '客户' }}</span>
            <strong>{{ Number(selectedCommissionDetail.topUpCredits ?? selectedCommissionDetail.consumedPoints ?? 0).toLocaleString('zh-CN') }}</strong>
            <small>充值积分</small>
          </div>
          <div class="agent-ledger-summary">
            <span>预计返佣</span>
            <strong>{{ Number(selectedCommissionDetail.commissionPoints ?? 0).toLocaleString('zh-CN') }}</strong>
            <small>{{ (Number(selectedCommissionDetail.commissionRate ?? 0) * 100).toFixed(1) }}%</small>
          </div>
        </div>
        <div v-if="selectedCommissionDetail?.topUpTransactions?.length" class="agent-ledger-table-shell">
          <NDataTable
            :columns="commissionTopUpTransactionColumns"
            :data="selectedCommissionDetail.topUpTransactions"
            :bordered="false"
            :single-line="false"
            :pagination="compactTablePagination"
            :scroll-x="760"
            class="agent-ledger-table"
          />
        </div>
        <NEmpty v-else description="暂无充值积分流水" />
        <template #footer>
          <div class="admin-modal-footer">
            <NButton @click="selectedCommissionDetail = null">
              关闭
            </NButton>
          </div>
        </template>
      </NModal>

      <NModal
        v-model:show="isEditAgentCustomerOpen"
        preset="card"
        class="admin-create-modal"
        title="编辑客户资料"
        :style="{ width: '520px', maxWidth: '92vw' }"
        :mask-closable="!isUpdatingAgentCustomer"
        @update:show="(show) => {
          if (!show && !isUpdatingAgentCustomer) {
            selectedAgentCustomer = null
          }
        }"
      >
        <NForm label-placement="top" class="admin-create-form" :show-feedback="false">
          <NFormItem label="用户名">
            <NInput
              :value="selectedAgentCustomer?.customerUsername ?? '-'"
              disabled
            />
          </NFormItem>
          <NFormItem label="显示名称" required>
            <NInput
              v-model:value="editAgentCustomerForm.displayName"
              maxlength="120"
              placeholder="请输入显示名称"
            />
          </NFormItem>
          <NFormItem label="手机号">
            <NInput
              v-model:value="editAgentCustomerForm.phone"
              maxlength="32"
              placeholder="可留空"
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <div class="admin-modal-footer">
            <NButton :disabled="isUpdatingAgentCustomer" @click="isEditAgentCustomerOpen = false">
              取消
            </NButton>
            <NButton type="primary" :loading="isUpdatingAgentCustomer" @click="handleUpdateAgentCustomerProfile">
              保存
            </NButton>
          </div>
        </template>
      </NModal>

      <NModal
        v-model:show="isEditPlatformUserProfileOpen"
        preset="card"
        class="admin-create-modal"
        title="编辑账号资料"
        :style="{ width: '520px', maxWidth: '92vw' }"
        :mask-closable="!isUpdatingPlatformUserProfile"
        @update:show="(show) => {
          if (!show && !isUpdatingPlatformUserProfile) {
            editPlatformUserProfileForm.userId = ''
            editPlatformUserProfileForm.username = ''
            editPlatformUserProfileForm.displayName = ''
            editPlatformUserProfileForm.phone = ''
          }
        }"
      >
        <NForm label-placement="top" class="admin-create-form" :show-feedback="false">
          <NFormItem label="用户名">
            <NInput
              :value="editPlatformUserProfileForm.username || '-'"
              disabled
            />
          </NFormItem>
          <NFormItem label="账号角色">
            <NInput
              :value="platformProfileRoleLabel(editPlatformUserProfileForm.targetRole)"
              disabled
            />
          </NFormItem>
          <NFormItem label="显示名称" required>
            <NInput
              v-model:value="editPlatformUserProfileForm.displayName"
              maxlength="120"
              placeholder="请输入显示名称"
            />
          </NFormItem>
          <NFormItem label="手机号">
            <NInput
              v-model:value="editPlatformUserProfileForm.phone"
              maxlength="32"
              placeholder="可留空"
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <div class="admin-modal-footer">
            <NButton :disabled="isUpdatingPlatformUserProfile" @click="isEditPlatformUserProfileOpen = false">
              取消
            </NButton>
            <NButton type="primary" :loading="isUpdatingPlatformUserProfile" @click="handleUpdatePlatformUserProfile">
              保存
            </NButton>
          </div>
        </template>
      </NModal>

      <NModal
        v-model:show="isAgentCustomerLedgerOpen"
        preset="card"
        class="admin-create-modal agent-ledger-modal"
        :title="ledgerModalTitle()"
        :style="{ width: '920px', maxWidth: '94vw', maxHeight: 'calc(100vh - 80px)' }"
        @update:show="(show) => {
          if (!show) {
            selectedAgentCustomer = null
            agentCustomerLedger = null
          }
        }"
      >
        <template #header>
          <div class="agent-ledger-header">
            <span class="agent-ledger-header-mark" />
            <div>
              <strong>{{ ledgerModalTitle() }}</strong>
              <small>
                {{ selectedAgentCustomer?.customerDisplayName ?? '客户' }}
                <template v-if="agentCustomerLedger?.customer.enterpriseTenantName">
                  · {{ agentCustomerLedger.customer.enterpriseTenantName }}
                </template>
              </small>
            </div>
          </div>
        </template>

        <div class="agent-ledger-toolbar">
          <div class="agent-ledger-summary">
            <span>当前余额</span>
            <strong>{{ Number(agentCustomerLedger?.account?.availableBalance ?? 0).toLocaleString('zh-CN') }}</strong>
          </div>
          <NButton
            size="small"
            secondary
            :disabled="!agentCustomerLedger?.transactions.length"
            @click="exportRows('agent-customer-ledger', agentCustomerLedger?.transactions ?? [])"
          >
            <template #icon>
              <Icon icon="mdi:download-outline" />
            </template>
            导出
          </NButton>
        </div>

        <NSpin :show="isLoadingAgentCustomerLedger" class="agent-ledger-spin">
          <div v-if="agentCustomerLedger?.transactions.length" class="agent-ledger-table-shell">
            <NDataTable
              :columns="agentCustomerLedgerColumns"
              :data="agentCustomerLedger.transactions"
              :bordered="false"
              :single-line="false"
              :pagination="ledgerTablePagination"
              :scroll-x="980"
              class="agent-ledger-table"
            />
          </div>
          <NEmpty v-else description="暂无积分流水" />
        </NSpin>

        <template #footer>
          <div class="admin-modal-footer">
            <NButton @click="isAgentCustomerLedgerOpen = false">
              关闭
            </NButton>
          </div>
        </template>
      </NModal>

      <NModal
        v-model:show="isAgentDepositAdjustmentModalOpen"
        preset="card"
        class="admin-create-modal"
        title="增减押金"
        :style="{ width: '520px', maxWidth: '92vw' }"
        :mask-closable="!updatingAgentDepositUserId"
        @update:show="(show) => {
          if (!show && selectedAgentDepositUser) {
            delete agentDepositAdjustmentDrafts[selectedAgentDepositUser.userId]
            selectedAgentDepositUser = null
          }
        }"
      >
        <div class="admin-modal-context">
          <strong>{{ selectedAgentDepositUser?.displayName || selectedAgentDepositUser?.username }}</strong>
          <span>
            当前押金余额：
            {{ Number(selectedAgentDepositUser?.depositBalance ?? 0).toLocaleString('zh-CN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) }}
            {{ selectedAgentDepositUser?.depositCurrency || 'CNY' }}
          </span>
        </div>
        <NForm label-placement="top" class="admin-create-form" :show-feedback="false">
          <NFormItem label="调整金额" required>
            <NInputNumber
              v-if="selectedAgentDepositUser"
              :value="agentDepositAdjustmentAmount(selectedAgentDepositUser)"
              :min="0"
              :precision="2"
              :step="100"
              placeholder="请输入押金金额"
              class="admin-create-number"
              :disabled="!!updatingAgentDepositUserId"
              @update:value="(value) => {
                if (selectedAgentDepositUser) {
                  agentDepositAdjustmentDrafts[selectedAgentDepositUser.userId] = value
                }
              }"
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <div class="admin-modal-footer">
            <NButton
              :disabled="!!updatingAgentDepositUserId"
              @click="isAgentDepositAdjustmentModalOpen = false"
            >
              取消
            </NButton>
            <NButton
              type="warning"
              secondary
              :loading="!!selectedAgentDepositUser && updatingAgentDepositUserId === selectedAgentDepositUser.userId"
              :disabled="!selectedAgentDepositUser || !!updatingAgentDepositUserId"
              @click="selectedAgentDepositUser && handleAgentDepositAdjustment(selectedAgentDepositUser, 'decrease')"
            >
              扣减押金
            </NButton>
            <NButton
              type="success"
              secondary
              :loading="!!selectedAgentDepositUser && updatingAgentDepositUserId === selectedAgentDepositUser.userId"
              :disabled="!selectedAgentDepositUser || !!updatingAgentDepositUserId"
              @click="selectedAgentDepositUser && handleAgentDepositAdjustment(selectedAgentDepositUser, 'increase')"
            >
              增加押金
            </NButton>
          </div>
        </template>
      </NModal>

      <NModal
        v-model:show="isPasswordResetModalOpen"
        preset="card"
        class="admin-create-modal"
        title="重置登陆密码"
        :style="{ width: '520px', maxWidth: '92vw' }"
        :mask-closable="!isResettingPassword"
      >
        <div class="admin-modal-context">
          <strong>{{ passwordResetForm.displayName || passwordResetForm.username }}</strong>
          <span>{{ passwordResetForm.username }} · 密码以加密哈希保存，不能查看原密码</span>
        </div>
        <NForm label-placement="top" class="admin-create-form" :show-feedback="false">
          <NFormItem label="新密码" required>
            <NInput
              v-model:value="passwordResetForm.password"
              type="password"
              show-password-on="click"
              maxlength="64"
              placeholder="至少 6 位"
            />
          </NFormItem>
          <NFormItem label="确认新密码" required>
            <NInput
              v-model:value="passwordResetForm.confirmPassword"
              type="password"
              show-password-on="click"
              maxlength="64"
              placeholder="再次输入新密码"
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <div class="admin-modal-footer">
            <NButton :disabled="isResettingPassword" @click="isPasswordResetModalOpen = false">
              取消
            </NButton>
            <NButton type="primary" :loading="isResettingPassword" @click="handleResetPlatformPassword">
              保存新密码
            </NButton>
          </div>
        </template>
      </NModal>

      <NModal
        v-model:show="isCreateAccountModalOpen"
        preset="card"
        class="admin-create-modal account-create-modal"
        :style="{ width: '600px', maxWidth: '92vw', maxHeight: 'calc(100vh - 80px)' }"
        :mask-closable="!isCreatingAccount"
      >
        <template #header>
          <div class="account-create-header">
            <span class="account-create-header-icon">
              <Icon icon="mdi:account-plus-outline" />
            </span>
            <div>
              <strong>创建 {{ targetRoleLabel(createAccountForm.targetRole) }}</strong>
              <small>{{createAccountForm.targetRole==='user'?'公司统一账号，无需选择应用或购买套餐':'填写账号信息；创建取决于已接通的后台服务'}}</small>
            </div>
          </div>
        </template>
        <p v-if="createAccountForm.targetRole==='user'" class="account-create-full">一个公司账号可进入各个应用，首次使用时再建立应用资料；付费权益分别购买。此处不绑定应用、套餐或初始积分。后台代建需接通公司统一账号服务，当前可通过公司账号自行注册。</p>
        <NForm label-placement="top" class="admin-create-form account-create-form" :show-feedback="false">
          <div class="account-create-grid">
            <NFormItem label="账号类型" required>
              <NSelect
                v-model:value="createAccountForm.targetRole"
                :options="createTargetOptions"
                @update:value="handleCreateTargetRoleChange"
              />
            </NFormItem>
            <NFormItem label="初始密码" required>
              <NInput
                v-model:value="createAccountForm.password"
                type="password"
                show-password-on="click"
                maxlength="64"
              />
            </NFormItem>
            <NFormItem label="用户名" required>
              <NInput
                v-model:value="createAccountForm.username"
                placeholder="lowercase_name"
                maxlength="32"
              />
            </NFormItem>
            <NFormItem label="手机号">
              <NInput v-model:value="createAccountForm.phone" placeholder="可选" />
            </NFormItem>
            <NFormItem label="显示名称">
              <NInput v-model:value="createAccountForm.displayName" placeholder="默认使用用户名" />
            </NFormItem>
            <NFormItem label="邮箱">
              <NInput v-model:value="createAccountForm.email" :placeholder="createAccountForm.targetRole==='user'?'公司账号邮箱':'可选'" />
            </NFormItem>
            <NFormItem v-if="createAccountForm.targetRole!=='user'" label="接入应用">
              <NSelect
                v-model:value="createAccountForm.applicationCode"
                :options="applicationSelectOptions"
              />
            </NFormItem>
            <NFormItem v-if="createAccountForm.targetRole!=='user'" label="订阅计划">
              <NSelect
                v-model:value="createAccountForm.planCode"
                :options="planOptions"
                :loading="isLoadingPlanOptions"
                :disabled="isLoadingPlanOptions || planOptions.length === 0"
                placeholder="选择当前应用的订阅计划"
                @update:value="handleCreatePlanChange"
              />
            </NFormItem>
            <NFormItem v-if="createAccountForm.targetRole!=='user'" label="初始积分" required class="account-create-full">
              <NInputNumber
                v-model:value="createAccountForm.initialPoints"
                :min="0"
                :precision="0"
                :show-button="true"
                class="admin-create-number"
              />
            </NFormItem>
          </div>
        </NForm>
        <template #footer>
          <div class="admin-modal-footer account-create-footer">
            <NButton :disabled="isCreatingAccount" @click="isCreateAccountModalOpen = false">
              取消
            </NButton>
            <NButton type="primary" :loading="isCreatingAccount" :disabled="!authStore.staffProvisioningEnabled || (createAccountForm.targetRole==='user'&&!authStore.userProvisioningEnabled)" @click="handleCreateAccount">
              <template #icon>
                <Icon icon="mdi:check" />
              </template>
              创建账号
            </NButton>
          </div>
        </template>
      </NModal>

      <NModal
        v-model:show="isConnectApplicationModalOpen"
        preset="card"
        class="admin-create-modal account-create-modal"
        :style="{ width: '560px', maxWidth: '92vw', maxHeight: 'calc(100vh - 80px)' }"
        title="接入应用"
        :mask-closable="!isConnectingApplication"
      >
        <div class="admin-modal-context">
          <strong>{{ connectApplicationForm.displayName }}</strong>
          <span>{{ connectApplicationForm.username }} · {{ targetRoleLabel(connectApplicationForm.targetRole) }}</span>
        </div>
        <p v-if="createAccountForm.targetRole==='user'" class="account-create-full">一个公司账号可进入各个应用，首次使用时再建立应用资料；付费权益分别购买。此处不绑定应用、套餐或初始积分。后台代建需接通公司统一账号服务，当前可通过公司账号自行注册。</p>
        <NForm label-placement="top" class="admin-create-form account-create-form" :show-feedback="false">
          <NFormItem label="接入应用" required>
            <NSelect
              v-model:value="connectApplicationForm.applicationCode"
              :options="connectApplicationSelectOptions"
            />
          </NFormItem>
          <NFormItem label="订阅计划" required>
            <NSelect
              v-model:value="connectApplicationForm.planCode"
              :options="connectPlanOptions"
              :loading="isLoadingConnectPlanOptions"
              :disabled="isLoadingConnectPlanOptions || connectPlanOptions.length === 0"
              placeholder="选择当前应用的订阅计划"
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <div class="admin-modal-footer account-create-footer">
            <NButton :disabled="isConnectingApplication" @click="isConnectApplicationModalOpen = false">
              取消
            </NButton>
            <NButton type="primary" :loading="isConnectingApplication" @click="handleConnectApplication">
              <template #icon>
                <Icon icon="mdi:check" />
              </template>
              确认接入
            </NButton>
          </div>
        </template>
      </NModal>

      <NModal
        v-model:show="isAdjustCreditsModalOpen"
        preset="card"
        class="admin-create-modal admin-adjust-credits-modal"
        style="width: min(560px, calc(100vw - 32px))"
        title="增减积分"
        :mask-closable="!isAdjustingCredits"
        @update:show="(show) => {
          if (!show && !isAdjustingCredits) {
            selectedAdjustCreditsUser = null
          }
        }"
      >
        <div class="admin-modal-context" v-if="selectedAdjustCreditsUser">
          <strong>{{ selectedAdjustCreditsUser.displayName }}</strong>
          <span>
            {{ selectedAdjustCreditsUser.username }}
            · {{ selectedAdjustCreditsUser.role ? matrixTargetRole(selectedAdjustCreditsUser.role) : '-' }}
          </span>
        </div>
        <NForm label-placement="top" class="admin-create-form">
          <NFormItem label="积分变动">
            <NInputNumber
              v-model:value="adjustCreditsForm.points"
              :precision="0"
              :show-button="true"
              class="admin-create-number"
              placeholder="正数增加，负数扣减"
            />
          </NFormItem>
          <NFormItem label="积分类型">
            <NCheckbox v-model:checked="adjustCreditsForm.classifyAsRecharge">
              积分充值
            </NCheckbox>
            <p class="admin-form-hint">勾选后，正数增加会计入“积分充值”趋势；取消勾选则记录为“调整”。</p>
          </NFormItem>
          <NFormItem label="原因">
            <NInput
              v-model:value="adjustCreditsForm.reason"
              type="textarea"
              placeholder="例如：人工补偿、活动赠送、误扣修正"
              maxlength="240"
              show-count
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <div class="admin-modal-footer">
            <NButton :disabled="isAdjustingCredits" @click="isAdjustCreditsModalOpen = false">
              取消
            </NButton>
            <NButton type="primary" :loading="isAdjustingCredits" @click="handleAdjustCredits">
              <template #icon>
                <Icon icon="mdi:plus-minus-variant" />
              </template>
              确认调整
            </NButton>
          </div>
        </template>
      </NModal>

      <NModal
        v-model:show="isDeleteAccountModalOpen"
        preset="card"
        class="admin-create-modal"
        :title="selectedCapabilityUser ? deleteActionText(selectedCapabilityUser) : '删除账号'"
        :mask-closable="!isDeletingAccount"
      >
        <div class="admin-modal-context" v-if="selectedCapabilityUser">
          <strong>{{ selectedCapabilityUser.displayName }}</strong>
          <span>{{ selectedCapabilityUser.username }} · {{ matrixTargetRole(selectedCapabilityUser.role) }}</span>
        </div>
        <NForm label-placement="top" class="admin-create-form">
          <NFormItem :label="activeRole === 'admin' ? '禁用原因' : '删除原因'">
            <NInput
              v-model:value="deleteAccountForm.reason"
              type="textarea"
              :placeholder="activeRole === 'admin' ? '记录禁用原因，便于后续审计' : '记录删除原因，便于后续审计'"
              maxlength="240"
              show-count
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <div class="admin-modal-footer">
            <NButton :disabled="isDeletingAccount" @click="isDeleteAccountModalOpen = false">
              取消
            </NButton>
            <NButton type="error" :loading="isDeletingAccount" @click="handleDeleteAccount">
              <template #icon>
                <Icon :icon="activeRole === 'admin' ? 'mdi:account-cancel-outline' : 'mdi:trash-can-outline'" />
              </template>
              {{ selectedCapabilityUser ? deleteActionText(selectedCapabilityUser) : '删除账号' }}
            </NButton>
          </div>
        </template>
      </NModal>
    </section>
  </main>
</template>

<style scoped lang="scss">
.credits-admin-page {
  padding: 0;
  background: var(--app-bg);
  color: var(--app-text);
}

.credits-admin-page.theme-light {
  color-scheme: light;
  --app-bg: #f5f7fa;
  --app-surface: #ffffff;
  --app-surface-soft: #f8fafd;
  --app-border: transparent;
  --app-text: #0f172a;
  --app-text-soft: #475569;
  --app-text-muted: #64748b;
  --app-text-disabled: #94a3b8;
  --role-accent: #2f6bff;
  --role-accent-strong: #1d4ed8;
  --role-accent-soft: #eef4ff;
  --color-accent-blue: var(--role-accent);
  --bo-text: #0f172a;
  --bo-text-soft: #475569;
  --bo-text-muted: #64748b;
  --bo-surface: #ffffff;
  --bo-surface-soft: #f8fafc;
  --bo-accent: var(--role-accent);
  --bo-card-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.credits-admin-page.theme-light.role-theme-developer {
  --app-bg: #f5f7ff;
  --app-surface-soft: #f2f6ff;
  --role-accent: #2f6bff;
  --role-accent-strong: #1d4ed8;
  --role-accent-soft: #eaf1ff;
  --bo-surface-soft: #f2f6ff;
}

.credits-admin-page.theme-light.role-theme-admin {
  --app-bg: #f3faf7;
  --app-surface-soft: #effbf5;
  --role-accent: #059669;
  --role-accent-strong: #047857;
  --role-accent-soft: #dcfce7;
  --bo-surface-soft: #effbf5;
}

.credits-admin-page.theme-light.role-theme-agent {
  --app-bg: #fff8ed;
  --app-surface-soft: #fff4dd;
  --role-accent: #d97706;
  --role-accent-strong: #b45309;
  --role-accent-soft: #fef3c7;
  --bo-surface-soft: #fff4dd;
}

.credits-admin-page.theme-dark {
  color-scheme: dark;
  --app-bg: #0b1220;
  --app-surface: #111827;
  --app-surface-soft: #1a2332;
  --app-border: transparent;
  --app-text: #f8fafc;
  --app-text-soft: #cbd5e1;
  --app-text-muted: #94a3b8;
  --app-text-disabled: #64748b;
  --color-accent-blue: #5b8cff;
  --bo-text: #f8fafc;
  --bo-text-soft: #cbd5e1;
  --bo-text-muted: #94a3b8;
  --bo-surface: #111827;
  --bo-surface-soft: #1a2332;
  --bo-accent: #5b8cff;
  --bo-card-shadow: 0 2px 12px rgba(0, 0, 0, 0.28);
}

.admin-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.admin-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 24px;
  border-top: 4px solid var(--role-accent);
  border-radius: 12px;
  background: var(--app-surface);
  box-shadow: var(--bo-card-shadow, 0 2px 12px rgba(0, 0, 0, 0.04));
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
  }
}

.admin-hero-kicker {
  margin: 0 0 6px;
  color: var(--app-text-soft);
  font-size: 13px;
  font-weight: 700;
}

.admin-hero h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 900;
}

.admin-hero-sub {
  margin: 8px 0 0;
  max-width: 720px;
  color: var(--app-text-soft);
  font-size: 13px;
  line-height: 1.6;
}

.admin-hero-sub code {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--app-surface-soft);
  font-size: 12px;
}

.admin-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.admin-tab {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 6px 12px;
  padding: 16px 18px;
  border: 0;
  border-radius: 12px;
  background: var(--app-surface);
  box-shadow: var(--bo-card-shadow, 0 2px 12px rgba(0, 0, 0, 0.04));
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.admin-tab .iconify {
  grid-row: span 2;
  font-size: 24px;
  color: var(--app-text-soft);
}

.admin-tab-label {
  font-size: 16px;
  font-weight: 900;
}

.admin-tab-desc {
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.admin-tab.active {
  border-color: color-mix(in srgb, var(--color-accent-blue, #2f6bff) 64%, var(--app-border));
  background: color-mix(in srgb, var(--color-accent-blue, #2f6bff) 8%, var(--app-surface));
  box-shadow: 0 8px 22px color-mix(in srgb, var(--color-accent-blue, #2f6bff) 14%, transparent);
}

.admin-tab.active .iconify {
  color: var(--color-accent-blue, #2f6bff);
}

.admin-dashboard-insights {
  display: grid;
  grid-template-columns:
    minmax(190px, 240px)
    minmax(360px, 1fr)
    minmax(280px, 360px)
    minmax(190px, 240px);
  gap: 12px;
  margin-top: 12px;
  align-items: stretch;
}

.admin-system-overview-card,
.admin-trend-card,
.admin-plan-pie-card,
.admin-filter-band {
  padding: 20px 24px;
  border: 0;
  border-top: 4px solid color-mix(in srgb, var(--role-accent) 68%, white);
  border-radius: 12px;
  background: var(--app-surface);
  box-shadow: var(--bo-card-shadow, 0 2px 12px rgba(0, 0, 0, 0.04));
}

.admin-system-overview-list {
  display: grid;
  gap: 0;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.admin-system-overview-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.admin-system-overview-list li:last-child {
  border-bottom: 0;
}

.admin-system-overview-list span {
  color: var(--app-text-soft);
  font-size: 14px;
  font-weight: 800;
}

.admin-system-overview-list strong {
  color: var(--app-text-main);
  font-size: 18px;
  font-weight: 900;
  text-align: right;
  white-space: nowrap;
}

.admin-trend-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.admin-trend-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 900;
}

.admin-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-chip-group-metric {
  margin-top: 18px;
}

.admin-chip {
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--app-surface-soft);
  color: var(--app-text-soft);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 800;
}

.admin-chip.active {
  background: color-mix(in srgb, var(--color-accent-blue, #2f6bff) 13%, var(--app-surface));
  color: var(--color-accent-blue, #2f6bff);
}

.admin-trend-chart,
.admin-plan-pie-chart,
.agent-customer-bar-chart,
.agent-customer-pie-chart,
.agent-ledger-bar-chart,
.agent-ledger-pie-chart {
  width: 100%;
}

.admin-trend-chart {
  min-height: 320px;
  margin-top: 12px;
}

.admin-plan-pie-card {
  display: grid;
  grid-template-rows: auto minmax(360px, 1fr);
  min-height: 100%;
}

.admin-plan-pie-chart {
  height: 100%;
  min-height: 420px;
  margin-top: 8px;
}

.agent-customer-insights-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 12px;
  margin-bottom: 14px;
}

.agent-ledger-insights-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 12px;
  margin-bottom: 14px;
}

.agent-customer-chart-panel,
.agent-ledger-chart-panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, white);
}

.agent-customer-bar-chart,
.agent-customer-pie-chart,
.agent-ledger-bar-chart,
.agent-ledger-pie-chart {
  height: 300px;
  min-height: 300px;
  margin-top: 8px;
}

.admin-filter-band {
  display: grid;
  align-content: start;
  gap: 12px;
}

.admin-filter-current {
  display: grid;
  align-content: center;
  gap: 4px;
  min-height: 66px;
  padding: 12px 14px;
  border-left: 4px solid var(--role-accent);
  border-radius: 10px;
  background: var(--app-surface-soft);
}

.admin-filter-current p {
  margin: 0;
  color: var(--app-text-soft);
  font-size: 13px;
  font-weight: 800;
}

.admin-filter-current strong {
  font-size: 20px;
  font-weight: 900;
  line-height: 1.18;
}

.admin-filter-current span {
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 700;
}

.admin-filter-options {
  display: grid;
  gap: 10px;
}

.admin-filter-band + .admin-section {
  margin-top: 0;
}

.admin-filter-chip {
  display: grid;
  gap: 2px;
  width: 100%;
  min-width: 0;
  padding: 9px 12px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.admin-filter-chip:hover {
  border-color: color-mix(in srgb, var(--role-accent) 34%, transparent);
  background: color-mix(in srgb, var(--role-accent) 10%, var(--app-surface));
}

.admin-filter-chip span {
  font-size: 13px;
  font-weight: 900;
}

.admin-filter-chip small {
  color: var(--app-text-soft);
  font-size: 11px;
  font-weight: 700;
}

.admin-filter-chip.active {
  border-color: color-mix(in srgb, var(--role-accent) 88%, #0f172a);
  background: var(--role-accent);
  color: #fff;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--role-accent) 30%, transparent);
  transform: translateY(-1px);
}

.admin-filter-chip.active small {
  color: rgba(255, 255, 255, 0.82);
}

.admin-toggle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.admin-toggle-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 92px;
  padding: 16px 18px;
  border: 0;
  border-radius: 12px;
  background: var(--app-surface-soft);
}

.admin-toggle-card h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 900;
}

.admin-toggle-card p {
  margin: 6px 0 0;
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.55;
}

.admin-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 14px;
}

.admin-subsection {
  display: grid;
  gap: 10px;
  margin: 0 0 14px;
  padding: 14px;
  border: 0;
  border-radius: 12px;
  background: var(--app-surface-soft);
}

.admin-subsection h3,
.admin-subsection p {
  margin: 0;
}

.admin-subsection h3 {
  font-size: 15px;
  font-weight: 900;
}

.admin-subsection p {
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.55;
}

.admin-section {
  padding: 20px 24px;
  border: 0;
  border-top: 4px solid color-mix(in srgb, var(--role-accent) 58%, white);
  border-radius: 12px;
  background: var(--app-surface);
  box-shadow: var(--bo-card-shadow, 0 2px 12px rgba(0, 0, 0, 0.04));
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
  }
}

.admin-section + .admin-section {
  margin-top: 16px;
}

.admin-section[id],
.admin-dashboard-insights[id] {
  scroll-margin-top: 16px;
}

.admin-section h2 {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 900;
}

.admin-section-note {
  margin: 0 0 14px;
  color: var(--app-text-soft);
  font-size: 13px;
  line-height: 1.6;
}

.admin-collapse-trigger,
.admin-collapse-head {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  text-align: left;
  cursor: default;
}

.admin-collapse-trigger span,
.admin-collapse-head span {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.admin-collapse-trigger strong,
.admin-collapse-head strong {
  font-size: 17px;
  font-weight: 900;
}

.admin-collapse-trigger small,
.admin-collapse-head small {
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.55;
}

.admin-collapse-trigger svg,
.admin-collapse-head svg,
.admin-collapse-head .iconify {
  flex: 0 0 auto;
  color: var(--app-text-soft);
  font-size: 22px;
  transition: transform 0.2s ease;
}

.admin-collapse-head .rotated {
  transform: rotate(180deg);
}

.admin-collapse-body {
  margin-top: 14px;
}

.admin-table-toolbar {
  display: flex;
  justify-content: flex-start;
  margin: -2px 0 12px;
}

.admin-table-search {
  width: min(360px, 100%);
}

.admin-section-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin: -4px 0 12px;
}

.admin-section-actions .admin-table-search {
  margin-right: auto;
}

:deep(.admin-function-points-cell) {
  display: flex;
  align-items: center;
  gap: 8px;
}

:deep(.admin-function-points-cell .n-input-number) {
  width: 124px;
  flex: 0 0 124px;
}

.admin-percent-suffix {
  color: var(--bo-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.admin-agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.admin-rule-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 14px;
}

.admin-agent-card {
  display: grid;
  gap: 6px;
  padding: 16px 18px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface-soft);
}

.admin-agent-card h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 900;
}

.admin-agent-card strong {
  font-size: 26px;
  font-weight: 900;
}

.admin-agent-card p {
  margin: 0;
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.55;
}

.admin-rule-card {
  display: grid;
  gap: 5px;
  min-height: 98px;
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-soft);
}

.admin-rule-card p {
  margin: 0;
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 800;
}

.admin-rule-card strong {
  font-size: 18px;
  font-weight: 900;
  line-height: 1.25;
}

.admin-rule-card span {
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 600;
}

.admin-error {
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, #ef4444 32%, var(--app-border));
  border-radius: 10px;
  background: color-mix(in srgb, #ef4444 8%, var(--app-surface));
  color: #ef4444;
  font-size: 13px;
  font-weight: 700;
}

.admin-feedback {
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, #18b77d 34%, var(--app-border));
  border-radius: 10px;
  background: color-mix(in srgb, #18b77d 8%, var(--app-surface));
  color: #12845d;
  font-size: 13px;
  font-weight: 800;
}

.admin-create-form {
  display: grid;
  gap: 2px;
}

.admin-create-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.admin-create-number {
  width: 100%;
}

.admin-form-hint {
  margin: 6px 0 0;
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

.admin-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.admin-modal-context {
  display: grid;
  gap: 4px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-soft);
}

.admin-modal-context strong {
  font-size: 15px;
  font-weight: 900;
}

.admin-modal-context span {
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 700;
}

.admin-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.admin-detail-item {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-soft);
}

.admin-detail-item span {
  color: var(--app-text-soft);
  font-size: 12px;
  font-weight: 800;
}

.admin-detail-item strong {
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
}

:deep(.admin-table-actions) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

:deep(.admin-column-filter-head) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

:global(.admin-dropdown-search) {
  width: 260px;
  padding: 8px;
}

:global(.admin-dropdown-control) {
  display: grid;
  gap: 8px;
  min-width: 280px;
  padding: 8px 12px 10px;
}

:global(.admin-dropdown-control-title),
:global(.admin-dropdown-control-row) {
  display: flex;
  align-items: center;
  gap: 8px;
}

:global(.admin-dropdown-control-title) {
  color: #475569;
  font-size: 12px;
  font-weight: 900;
}

:global(.admin-dropdown-control-row .n-input-number) {
  width: 112px;
}

:deep(.admin-password-cell) {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

:global(.admin-dropdown-option-danger .n-dropdown-option-body__label),
:global(.admin-dropdown-option-danger .iconify) {
  color: #d03050;
}

:deep(.admin-auth-switch-cell) {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

:deep(.admin-auth-switch-cell span) {
  font-size: 12px;
  font-weight: 800;
}

:deep(.admin-auth-switch-cell .is-enabled) {
  color: #12845d;
}

:deep(.admin-auth-switch-cell .is-disabled) {
  color: #b45309;
}

:deep(.admin-create-modal.n-modal) {
  width: min(720px, calc(100vw - 32px));
}

:deep(.agent-ledger-modal.n-modal) {
  width: min(920px, calc(100vw - 32px));
  max-width: calc(100vw - 32px);
}

:deep(.agent-ledger-modal .n-card) {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 80px);
  max-width: 100%;
  overflow: hidden;
}

:deep(.agent-ledger-modal .n-card__content) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

:deep(.agent-ledger-modal .n-card__footer) {
  flex: 0 0 auto;
}

:deep(.admin-delta.is-up) {
  color: #18b77d;
  font-weight: 800;
}

:deep(.admin-delta.is-down) {
  color: #e77835;
  font-weight: 800;
}

.agent-ledger-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.agent-ledger-header-mark {
  width: 5px;
  height: 24px;
  border-radius: 999px;
  background: var(--role-accent);
}

.credits-admin-page :deep(.n-button.n-button--primary-type) {
  --n-color: var(--role-accent) !important;
  --n-color-hover: var(--role-accent-strong) !important;
  --n-color-pressed: var(--role-accent-strong) !important;
  --n-color-focus: var(--role-accent) !important;
  --n-border: 1px solid var(--role-accent) !important;
  --n-border-hover: 1px solid var(--role-accent-strong) !important;
  --n-border-pressed: 1px solid var(--role-accent-strong) !important;
  --n-border-focus: 1px solid var(--role-accent) !important;
  --n-ripple-color: var(--role-accent) !important;
}

.credits-admin-page :deep(.n-button.n-button--primary-type),
.credits-admin-page :deep(.n-button.n-button--success-type),
.credits-admin-page :deep(.n-button.n-button--warning-type),
.credits-admin-page :deep(.n-button.n-button--error-type) {
  --n-text-color: #ffffff !important;
  --n-text-color-hover: #ffffff !important;
  --n-text-color-pressed: #ffffff !important;
  --n-text-color-focus: #ffffff !important;
  --n-text-color-disabled: #64748b !important;
  --n-icon-color: #ffffff !important;
  --n-icon-color-hover: #ffffff !important;
  --n-icon-color-pressed: #ffffff !important;
  --n-icon-color-focus: #ffffff !important;
  --n-icon-color-disabled: #64748b !important;
}

.credits-admin-page :deep(.n-button.n-button--primary-type.n-button--secondary:not(.n-button--disabled):not(:disabled)) {
  --n-color: var(--role-accent) !important;
  --n-color-hover: var(--role-accent-strong) !important;
  --n-color-pressed: var(--role-accent-strong) !important;
  --n-color-focus: var(--role-accent) !important;
  --n-border: 1px solid var(--role-accent) !important;
  --n-border-hover: 1px solid var(--role-accent-strong) !important;
  --n-border-pressed: 1px solid var(--role-accent-strong) !important;
  --n-border-focus: 1px solid var(--role-accent) !important;
}

.credits-admin-page :deep(.n-button.n-button--success-type.n-button--secondary:not(.n-button--disabled):not(:disabled)) {
  --n-color: #059669 !important;
  --n-color-hover: #047857 !important;
  --n-color-pressed: #047857 !important;
  --n-color-focus: #059669 !important;
  --n-border: 1px solid #059669 !important;
  --n-border-hover: 1px solid #047857 !important;
  --n-border-pressed: 1px solid #047857 !important;
  --n-border-focus: 1px solid #059669 !important;
}

.credits-admin-page :deep(.n-button.n-button--warning-type.n-button--secondary:not(.n-button--disabled):not(:disabled)) {
  --n-color: #d97706 !important;
  --n-color-hover: #b45309 !important;
  --n-color-pressed: #b45309 !important;
  --n-color-focus: #d97706 !important;
  --n-border: 1px solid #d97706 !important;
  --n-border-hover: 1px solid #b45309 !important;
  --n-border-pressed: 1px solid #b45309 !important;
  --n-border-focus: 1px solid #d97706 !important;
}

.credits-admin-page :deep(.n-button.n-button--error-type.n-button--secondary:not(.n-button--disabled):not(:disabled)) {
  --n-color: #dc2626 !important;
  --n-color-hover: #b91c1c !important;
  --n-color-pressed: #b91c1c !important;
  --n-color-focus: #dc2626 !important;
  --n-border: 1px solid #dc2626 !important;
  --n-border-hover: 1px solid #b91c1c !important;
  --n-border-pressed: 1px solid #b91c1c !important;
  --n-border-focus: 1px solid #dc2626 !important;
}

.credits-admin-page :deep(.n-button.n-button--primary-type:not(.n-button--disabled):not(:disabled) .n-button__content),
.credits-admin-page :deep(.n-button.n-button--success-type:not(.n-button--disabled):not(:disabled) .n-button__content),
.credits-admin-page :deep(.n-button.n-button--warning-type:not(.n-button--disabled):not(:disabled) .n-button__content),
.credits-admin-page :deep(.n-button.n-button--error-type:not(.n-button--disabled):not(:disabled) .n-button__content),
.credits-admin-page :deep(.n-button.n-button--primary-type:not(.n-button--disabled):not(:disabled) .iconify),
.credits-admin-page :deep(.n-button.n-button--success-type:not(.n-button--disabled):not(:disabled) .iconify),
.credits-admin-page :deep(.n-button.n-button--warning-type:not(.n-button--disabled):not(:disabled) .iconify),
.credits-admin-page :deep(.n-button.n-button--error-type:not(.n-button--disabled):not(:disabled) .iconify) {
  color: #ffffff !important;
}

.credits-admin-page :deep(.n-switch) {
  --n-rail-color-active: var(--role-accent) !important;
  --n-loading-color: var(--role-accent) !important;
}

.agent-ledger-header strong {
  display: block;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 900;
  line-height: 1.25;
}

.agent-ledger-header small {
  display: block;
  margin-top: 4px;
  color: var(--app-text-soft);
  font-size: 13px;
  font-weight: 700;
}

.agent-ledger-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  min-width: 0;
}

.agent-ledger-summary {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  color: var(--app-text-soft);
  font-size: 13px;
  font-weight: 800;
}

.agent-ledger-summary strong {
  color: var(--app-text);
  font-size: 20px;
}

:deep(.agent-ledger-spin) {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

:deep(.agent-ledger-spin .n-spin-content) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.agent-ledger-table-shell {
  flex: 1 1 auto;
  min-height: 0;
  max-height: min(56vh, 520px);
  max-width: 100%;
  overflow: auto;
  border-radius: 12px;
}

:deep(.agent-ledger-table .n-data-table-th) {
  color: #8da0bc;
  font-weight: 900;
}

:deep(.agent-ledger-table) {
  max-width: 100%;
}

:deep(.agent-ledger-table .n-data-table-wrapper) {
  max-width: 100%;
}

:deep(.agent-ledger-table .n-data-table-td) {
  overflow-wrap: anywhere;
}

:deep(.agent-ledger-table .n-data-table-td) {
  background: #f1f7ff;
}

:deep(.agent-ledger-status) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #506178;
  font-weight: 800;
}

:deep(.agent-ledger-status-dot) {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #23c267;
}

@media (max-width: 1024px) {
  .admin-tabs,
  .admin-dashboard-insights,
  .agent-customer-insights-grid,
  .agent-ledger-insights-grid,
  .admin-filter-band,
  .admin-rule-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-create-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ===== 创建账号弹窗（企业级表单样式，作用域限定，不影响其它共用弹窗） ===== */
/* 宽度与最大高度由模板控制；高度由内容自适应，内容过长时内部滚动。 */
:deep(.account-create-modal.n-card) {
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:deep(.account-create-modal .n-card__content) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px 24px;
}

:deep(.account-create-modal .n-card-header) {
  padding: 20px 24px 14px;
}

:deep(.account-create-modal .n-card-header__close) {
  margin: 18px 18px 0 0;
}

.account-create-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.account-create-header-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border-radius: 12px;
  background: rgba(47, 107, 255, 0.1);
  color: #2f6bff;
  font-size: 24px;
}

.account-create-header strong {
  display: block;
  font-size: 22px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.3;
}

.account-create-header small {
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
}

.account-create-form {
  padding: 16px;
  border: 1px solid #e5eaf3;
  border-radius: 12px;
  background: #fff;
}

.account-create-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 16px;
  row-gap: 16px;
}

.account-create-full {
  grid-column: 1 / -1;
}

:deep(.account-create-form .n-form-item-label) {
  padding-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

:deep(.account-create-form .n-form-item-label__asterisk) {
  color: #ef4444;
}

:deep(.account-create-form .n-input),
:deep(.account-create-form .n-base-selection) {
  --n-height: 42px;
  border-radius: 8px;
}

:deep(.account-create-form .n-input .n-input__input-el),
:deep(.account-create-form .n-base-selection .n-base-selection-label) {
  min-height: 42px;
}

:deep(.account-create-form .n-input__placeholder),
:deep(.account-create-form .n-base-selection-placeholder) {
  color: #a3aab8;
}

:deep(.account-create-footer) {
  padding: 16px 24px 20px;
  border-top: 1px solid #eef2f7;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:deep(.account-create-footer .n-button) {
  height: 40px;
  border-radius: 8px;
}

:deep(.account-create-footer .n-button--default-type) {
  padding: 0 22px;
}

:deep(.account-create-footer .n-button--primary-type) {
  padding: 0 24px;
  box-shadow: 0 6px 14px rgba(47, 107, 255, 0.24);
}

@media (max-width: 900px) {
  :deep(.account-create-modal.n-modal) {
    width: 94vw;
  }

  .account-create-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .account-create-full {
    grid-column: 1 / -1;
  }
}
</style>
