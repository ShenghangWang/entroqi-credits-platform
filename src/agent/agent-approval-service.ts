import type { Database, DatabaseClient } from "../db/pool.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../domain/index.js";

export type AgentProfileStatus = "pending" | "approved" | "rejected" | "suspended";
type PlatformAdminRole = "owner" | "admin" | "operator";
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type AgentProfileRow = {
  id: string;
  user_id: string;
  status: AgentProfileStatus;
  applied_at: Date;
  approved_by_user_id: string | null;
  approved_at: Date | null;
  rejected_at: Date | null;
  rejected_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

export type AgentProfileResponse = JsonObject & {
  id: number;
  userId: number;
  status: AgentProfileStatus;
  appliedAt: string;
  approvedByUserId: number | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

function optionalNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function mapProfile(row: AgentProfileRow): AgentProfileResponse {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    status: row.status,
    appliedAt: row.applied_at.toISOString(),
    approvedByUserId: optionalNumber(row.approved_by_user_id),
    approvedAt: row.approved_at ? row.approved_at.toISOString() : null,
    rejectedAt: row.rejected_at ? row.rejected_at.toISOString() : null,
    rejectedReason: row.rejected_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function getProfile(
  client: DatabaseClient,
  userId: number
): Promise<AgentProfileRow | undefined> {
  const result = await client.query<AgentProfileRow>(
    `
      select id, user_id, status, applied_at, approved_by_user_id, approved_at,
             rejected_at, rejected_reason, created_at, updated_at
      from agent_profiles
      where user_id = $1
    `,
    [userId]
  );

  return result.rows[0];
}

export class AgentApprovalService {
  constructor(private readonly db: Database) {}

  async applyForAgent(userId: number): Promise<AgentProfileResponse> {
    return this.db.withTransaction(async (client) => {
      const existing = await getProfile(client, userId);
      if (existing?.status === "approved" || existing?.status === "pending") {
        return mapProfile(existing);
      }
      if (existing?.status === "suspended") {
        throw new ConflictError(`Agent profile for user ${userId} is suspended`);
      }

      const result = await client.query<AgentProfileRow>(
        `
          insert into agent_profiles (
            user_id, status, applied_at, approved_by_user_id, approved_at,
            rejected_at, rejected_reason
          )
          values ($1, 'pending', now(), null, null, null, null)
          on conflict (user_id) do update
          set status = 'pending',
              applied_at = now(),
              approved_by_user_id = null,
              approved_at = null,
              rejected_at = null,
              rejected_reason = null,
              updated_at = now()
          returning id, user_id, status, applied_at, approved_by_user_id, approved_at,
                    rejected_at, rejected_reason, created_at, updated_at
        `,
        [userId]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("Agent profile application did not return a row");
      }

      return mapProfile(row);
    });
  }

  async listApplications(input: {
    currentUserId: number;
    status?: AgentProfileStatus;
    limit: number;
  }): Promise<{ applications: AgentProfileResponse[] }> {
    return this.db.withTransaction(async (client) => {
      await this.requirePlatformAdmin(client, input.currentUserId);
      const result = await client.query<AgentProfileRow>(
        `
          select id, user_id, status, applied_at, approved_by_user_id, approved_at,
                 rejected_at, rejected_reason, created_at, updated_at
          from agent_profiles
          where ($1::varchar is null or status = $1)
          order by applied_at desc, id desc
          limit $2
        `,
        [input.status ?? null, input.limit]
      );

      return {
        applications: result.rows.map((row) => mapProfile(row))
      };
    });
  }

  async approveAgent(input: {
    currentUserId: number;
    userId: number;
  }): Promise<AgentProfileResponse> {
    return this.db.withTransaction(async (client) => {
      await this.requirePlatformAdmin(client, input.currentUserId);
      const existing = await getProfile(client, input.userId);
      if (!existing) {
        throw new NotFoundError(`Agent application not found for user ${input.userId}`);
      }
      if (existing.status === "approved") {
        return mapProfile(existing);
      }
      if (existing.status !== "pending") {
        throw new ConflictError(`Agent application for user ${input.userId} is not pending`);
      }

      const result = await client.query<AgentProfileRow>(
        `
          update agent_profiles
          set status = 'approved',
              approved_by_user_id = $2,
              approved_at = now(),
              rejected_at = null,
              rejected_reason = null,
              updated_at = now()
          where user_id = $1
          returning id, user_id, status, applied_at, approved_by_user_id, approved_at,
                    rejected_at, rejected_reason, created_at, updated_at
        `,
        [input.userId, input.currentUserId]
      );

      return mapProfile(this.requiredRow(result.rows[0], input.userId));
    });
  }

  async rejectAgent(input: {
    currentUserId: number;
    userId: number;
    reason?: string | null;
  }): Promise<AgentProfileResponse> {
    return this.db.withTransaction(async (client) => {
      await this.requirePlatformAdmin(client, input.currentUserId);
      const existing = await getProfile(client, input.userId);
      if (!existing) {
        throw new NotFoundError(`Agent application not found for user ${input.userId}`);
      }
      if (existing.status !== "pending") {
        throw new ConflictError(`Agent application for user ${input.userId} is not pending`);
      }

      const result = await client.query<AgentProfileRow>(
        `
          update agent_profiles
          set status = 'rejected',
              rejected_at = now(),
              rejected_reason = $2,
              updated_at = now()
          where user_id = $1
          returning id, user_id, status, applied_at, approved_by_user_id, approved_at,
                    rejected_at, rejected_reason, created_at, updated_at
        `,
        [input.userId, input.reason ?? null]
      );

      return mapProfile(this.requiredRow(result.rows[0], input.userId));
    });
  }

  async suspendAgent(input: {
    currentUserId: number;
    userId: number;
  }): Promise<AgentProfileResponse> {
    return this.db.withTransaction(async (client) => {
      await this.requirePlatformAdmin(client, input.currentUserId);
      const existing = await getProfile(client, input.userId);
      if (!existing) {
        throw new NotFoundError(`Agent profile not found for user ${input.userId}`);
      }
      if (existing.status === "suspended") {
        return mapProfile(existing);
      }
      if (existing.status !== "approved") {
        throw new ConflictError(`Agent profile for user ${input.userId} is not approved`);
      }

      const result = await client.query<AgentProfileRow>(
        `
          update agent_profiles
          set status = 'suspended',
              updated_at = now()
          where user_id = $1
          returning id, user_id, status, applied_at, approved_by_user_id, approved_at,
                    rejected_at, rejected_reason, created_at, updated_at
        `,
        [input.userId]
      );

      return mapProfile(this.requiredRow(result.rows[0], input.userId));
    });
  }

  async requirePlatformAdmin(client: DatabaseClient, userId: number): Promise<void> {
    const result = await client.query<{ id: string; role: PlatformAdminRole }>(
      `
        select id, role
        from platform_admins
        where user_id = $1
          and status = 'active'
        limit 1
      `,
      [userId]
    );

    if (!result.rows[0]) {
      throw new ForbiddenError("Platform admin approval is required");
    }
  }

  async requireApprovedAgent(client: DatabaseClient, userId: number): Promise<void> {
    const result = await client.query<{ id: string }>(
      `
        select id
        from agent_profiles
        where user_id = $1
          and status = 'approved'
        limit 1
      `,
      [userId]
    );

    if (!result.rows[0]) {
      throw new ForbiddenError("Agent must be approved by a platform admin");
    }
  }

  private requiredRow(row: AgentProfileRow | undefined, userId: number): AgentProfileRow {
    if (!row) {
      throw new NotFoundError(`Agent profile not found for user ${userId}`);
    }

    return row;
  }
}
