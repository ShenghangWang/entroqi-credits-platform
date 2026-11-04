export type SubscriptionPlanCode = 'basic' | 'team' | 'flagship'

export interface SubscriptionPlan {
  plan: SubscriptionPlanCode
  name: string
  price: number
  accountLimit: number
  concurrentTaskLimit: number
  visualConcurrentTaskLimit: number
  batchConcurrentTaskLimit: number
  giftPoints: number
}

export interface SubscriptionStateSnapshot {
  currentPlan: SubscriptionPlanCode
  accountLimit: number
  concurrentTaskLimit: number
  visualConcurrentTaskLimit?: number
  batchConcurrentTaskLimit?: number
  giftPoints: number
  expireTime: string
}
