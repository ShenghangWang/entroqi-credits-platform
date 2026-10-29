export type BackOfficeRoleCode = "developer" | "admin" | "agent" | "enterprise";
export type AccountCreationTargetRole = "admin" | "agent" | "user";
export type AccountCreationTargetScope = "personal" | "tenant";

export type AccountCreationPolicyCode =
  | "developer_create_admin"
  | "developer_create_agent"
  | "developer_create_user"
  | "developer_allows_admin_create_users"
  | "developer_allows_admin_create_agents_users"
  | "developer_allows_agent_create_users"
  | "admin_allows_agent_create_users"
  | "admin_allows_user_become_agent";

export type AccountCreationPolicySnapshot = Record<AccountCreationPolicyCode, boolean>;

export type BackOfficeRoleSeed = {
  code: Exclude<BackOfficeRoleCode, "enterprise">;
  name: string;
  description: string;
  hierarchyRank: number;
  canLogin: boolean;
  canCreateAccounts: boolean;
};

export type BackOfficePermissionPolicySeed = {
  policyCode: AccountCreationPolicyCode;
  name: string;
  controllerRoleCode: Exclude<BackOfficeRoleCode, "enterprise"> | null;
  subjectRoleCode: Exclude<BackOfficeRoleCode, "enterprise">;
  actionCode: "account:create" | "policy:allow";
  targetRoleCode: AccountCreationTargetRole;
  isEnabled: boolean;
  isDisableable: boolean;
  description: string;
};

export const defaultBackOfficeRolePermissions = {
  developer: [
    "menu:home",
    "menu:workspace",
    "menu:pricing",
    "menu:points",
    "menu:recharge",
    "menu:admin",
    "account:create:admin",
    "account:create:agent",
    "account:create:user",
    "account:delete:admin",
    "account:delete:agent",
    "account:delete:user",
    "credits:balance:read:all",
    "credits:transaction:read:all",
    "credits:points:adjust",
    "policy:account-creation:manage",
  ],
  admin: [
    "menu:home",
    "menu:workspace",
    "menu:pricing",
    "menu:points",
    "menu:recharge",
    "menu:admin",
    "account:create:agent",
    "account:create:user",
    "account:delete:agent",
    "credits:balance:read:all",
    "credits:transaction:read:all",
    "policy:agent-user-creation:manage",
    "policy:user-agent-promotion:manage",
  ],
  agent: [
    "menu:home",
    "menu:points",
    "menu:recharge",
    "menu:admin",
    "account:create:user",
    "credits:balance:read:created-users",
    "credits:transaction:read:created-users",
  ],
  enterprise: [
    "menu:home",
    "menu:workspace",
    "menu:pricing",
    "menu:points",
    "menu:recharge",
  ],
} as const;

export type AccountCreationDecision = {
  allowed: boolean;
  reason: string;
};

export const defaultBackOfficeRoles: BackOfficeRoleSeed[] = [
  {
    code: "developer",
    name: "开发者",
    description: "Reusable Credits Platform 全局开发者权限",
    hierarchyRank: 100,
    canLogin: true,
    canCreateAccounts: true,
  },
  {
    code: "admin",
    name: "管理员",
    description: "公司管理员账号、代理商、客户与积分运营权限",
    hierarchyRank: 70,
    canLogin: true,
    canCreateAccounts: true,
  },
  {
    code: "agent",
    name: "代理商",
    description: "代理商客户创建、消费跟进、返佣与结算权限",
    hierarchyRank: 40,
    canLogin: true,
    canCreateAccounts: true,
  },
];

export const defaultBackOfficePermissionPolicies: BackOfficePermissionPolicySeed[] = [
  {
    policyCode: "developer_create_admin",
    name: "开发者创建 Admin",
    controllerRoleCode: null,
    subjectRoleCode: "developer",
    actionCode: "account:create",
    targetRoleCode: "admin",
    isEnabled: true,
    isDisableable: false,
    description: "Developer can always create Admin accounts.",
  },
  {
    policyCode: "developer_create_agent",
    name: "开发者创建 Agent",
    controllerRoleCode: null,
    subjectRoleCode: "developer",
    actionCode: "account:create",
    targetRoleCode: "agent",
    isEnabled: true,
    isDisableable: false,
    description: "Developer can always create Agent accounts.",
  },
  {
    policyCode: "developer_create_user",
    name: "开发者创建 User",
    controllerRoleCode: null,
    subjectRoleCode: "developer",
    actionCode: "account:create",
    targetRoleCode: "user",
    isEnabled: true,
    isDisableable: false,
    description: "Developer can always create regular User accounts.",
  },
  {
    policyCode: "developer_allows_admin_create_users",
    name: "开发者允许 Admin 创建 User",
    controllerRoleCode: "developer",
    subjectRoleCode: "admin",
    actionCode: "policy:allow",
    targetRoleCode: "user",
    isEnabled: true,
    isDisableable: true,
    description: "Developer gate for Admin creating regular User accounts.",
  },
  {
    policyCode: "developer_allows_admin_create_agents_users",
    name: "开发者允许 Admin 创建 Agent / 升级 User",
    controllerRoleCode: "developer",
    subjectRoleCode: "admin",
    actionCode: "policy:allow",
    targetRoleCode: "agent",
    isEnabled: true,
    isDisableable: true,
    description: "Developer gate for Admin creating Agent accounts and promoting User accounts to Agent.",
  },
  {
    policyCode: "developer_allows_agent_create_users",
    name: "开发者可禁用 Agent 创建 User",
    controllerRoleCode: "developer",
    subjectRoleCode: "agent",
    actionCode: "policy:allow",
    targetRoleCode: "user",
    isEnabled: true,
    isDisableable: true,
    description: "Developer override that can disable Agent-created User accounts.",
  },
  {
    policyCode: "admin_allows_agent_create_users",
    name: "Admin 控制 Agent 创建 User",
    controllerRoleCode: "admin",
    subjectRoleCode: "agent",
    actionCode: "policy:allow",
    targetRoleCode: "user",
    isEnabled: true,
    isDisableable: true,
    description: "Admin gate for Agent-created User accounts unless Developer disables it.",
  },
  {
    policyCode: "admin_allows_user_become_agent",
    name: "Admin 允许 User 成为 Agent",
    controllerRoleCode: "admin",
    subjectRoleCode: "admin",
    actionCode: "policy:allow",
    targetRoleCode: "agent",
    isEnabled: true,
    isDisableable: true,
    description: "Admin gate for promoting a regular User into an Agent.",
  },
];

export const defaultAccountCreationPolicySnapshot: AccountCreationPolicySnapshot =
  Object.fromEntries(
    defaultBackOfficePermissionPolicies.map((policy) => [
      policy.policyCode,
      policy.isEnabled,
    ]),
  ) as AccountCreationPolicySnapshot;

export function resolveAccountCreationPolicy(
  snapshot: AccountCreationPolicySnapshot,
) {
  return {
    developerCanCreateAdmins: snapshot.developer_create_admin,
    developerCanCreateAgents: snapshot.developer_create_agent,
    developerCanCreateUsers: snapshot.developer_create_user,
    adminCanCreateAgents: snapshot.developer_allows_admin_create_agents_users,
    adminCanCreateUsers: snapshot.developer_allows_admin_create_users,
    adminCanPromoteUserToAgent:
      snapshot.developer_allows_admin_create_agents_users &&
      snapshot.admin_allows_user_become_agent,
    agentCanCreateUsers:
      snapshot.developer_allows_agent_create_users &&
      snapshot.admin_allows_agent_create_users,
  };
}

export function canCreateAccountFromSnapshot(
  operatorRole: BackOfficeRoleCode,
  targetRole: AccountCreationTargetRole,
  snapshot: AccountCreationPolicySnapshot,
): AccountCreationDecision {
  const effective = resolveAccountCreationPolicy(snapshot);

  if (operatorRole === "developer") {
    const developerAllowed =
      (targetRole === "admin" && effective.developerCanCreateAdmins) ||
      (targetRole === "agent" && effective.developerCanCreateAgents) ||
      (targetRole === "user" && effective.developerCanCreateUsers);

    return developerAllowed
      ? { allowed: true, reason: "developer account creation is always enabled" }
      : { allowed: false, reason: "developer account creation policy is disabled" };
  }

  if (operatorRole === "admin") {
    if (targetRole === "agent" && effective.adminCanCreateAgents) {
      return { allowed: true, reason: "developer allows admin to create agents" };
    }
    if (targetRole === "user" && effective.adminCanCreateUsers) {
      return { allowed: true, reason: "developer allows admin to create users" };
    }
    return {
      allowed: false,
      reason: targetRole === "user"
        ? "developer has disabled admin user creation"
        : "developer has disabled admin account creation",
    };
  }

  if (operatorRole === "agent") {
    if (targetRole === "user" && effective.agentCanCreateUsers) {
      return {
        allowed: true,
        reason: "admin allows agent user creation and developer has not disabled it",
      };
    }
    return {
      allowed: false,
      reason: "admin has not allowed agent user creation or developer has disabled it",
    };
  }

  return {
    allowed: false,
    reason: "regular users cannot create accounts in the console",
  };
}

export function canCreateUserFromSnapshot(
  operatorRole: BackOfficeRoleCode,
  snapshot: AccountCreationPolicySnapshot,
): AccountCreationDecision {
  return canCreateAccountFromSnapshot(operatorRole, "user", snapshot);
}

export function canPromoteUserToAgentFromSnapshot(
  operatorRole: BackOfficeRoleCode,
  snapshot: AccountCreationPolicySnapshot,
): AccountCreationDecision {
  if (operatorRole === "developer") {
    return { allowed: true, reason: "developer can create or assign agents" };
  }

  if (operatorRole !== "admin") {
    return { allowed: false, reason: "only developer or admin can promote users to agent" };
  }

  return resolveAccountCreationPolicy(snapshot).adminCanPromoteUserToAgent
    ? {
        allowed: true,
        reason: "developer allows admin agent/user creation and admin allows promotion",
      }
    : {
        allowed: false,
        reason: "developer or admin has disabled user-to-agent promotion",
      };
}
