import type { SubscriptionStateSnapshot } from './subscription'

export type UserRole = 'developer' | 'admin' | 'agent' | 'enterprise'
export type EnterpriseMemberRole = 'owner' | 'admin' | 'member'
export type EnterpriseAccountRole = 'standalone' | 'mother' | 'child'

export interface UserInfo {
  id: string
  username: string
  phone?: string | null
  displayName: string
  role: UserRole
  permissions: string[]
  creditsUserId?: number | null
  creditsTenantId?: number | null
  accountScope?: 'personal' | 'tenant'
  enterpriseTenantId?: string | null
  enterpriseTenantName?: string | null
  enterpriseMemberRole?: EnterpriseMemberRole | null
  enterpriseOwnerUserId?: string | null
  enterpriseSubscriptionUserId?: string | null
  enterpriseAccountRole?: EnterpriseAccountRole
  canViewEnterpriseChildren?: boolean
}

export interface LoginRequest {
  username: string
  password: string
  remember?: boolean
}

export interface LoginResponse {
  token: string
  userInfo: UserInfo
  subscription: SubscriptionStateSnapshot
}
