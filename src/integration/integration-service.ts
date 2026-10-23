import type { Database, DatabaseClient } from "../db/pool.js";
import { NotFoundError } from "../domain/index.js";

type FunctionChargeMode = "fixed" | "dynamic" | "estimate_required";
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type ApplicationRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type ApplicationFunctionRow = {
  id: string;
  application_id: string;
  application_code?: string;
  code: string;
  name: string;
  description: string | null;
  charge_mode: FunctionChargeMode;
  default_points: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type RegisterApplicationInput = {
  code: string;
  name: string;
  description?: string | null;
  status?: string;
};

export type RegisterApplicationFunctionInput = {
  applicationCode: string;
  code: string;
  name: string;
  description?: string | null;
  chargeMode: FunctionChargeMode;
  defaultPoints: string;
  status?: string;
};

export type ApplicationResponse = JsonObject & {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: string;
};

export type ApplicationFunctionResponse = JsonObject & {
  id: number;
  applicationId: number;
  applicationCode?: string;
  code: string;
  name: string;
  description: string | null;
  chargeMode: FunctionChargeMode;
  defaultPoints: string;
  status: string;
};

function mapApplication(row: ApplicationRow): ApplicationResponse {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status
  };
}

function mapApplicationFunction(row: ApplicationFunctionRow): ApplicationFunctionResponse {
  const response: ApplicationFunctionResponse = {
    id: Number(row.id),
    applicationId: Number(row.application_id),
    code: row.code,
    name: row.name,
    description: row.description,
    chargeMode: row.charge_mode,
    defaultPoints: row.default_points,
    status: row.status
  };

  if (row.application_code !== undefined) {
    response.applicationCode = row.application_code;
  }

  return response;
}

export class IntegrationService {
  constructor(private readonly db: Database) {}

  async listApplications(): Promise<{ applications: ApplicationResponse[] }> {
    const result = await this.db.query<ApplicationRow>(
      `
        select id, code, name, description, status, created_at, updated_at
        from applications
        order by code asc
      `
    );

    return {
      applications: result.rows.map((row) => mapApplication(row))
    };
  }

  async registerApplication(input: RegisterApplicationInput): Promise<ApplicationResponse> {
    const result = await this.db.query<ApplicationRow>(
      `
        insert into applications (code, name, description, status)
        values ($1, $2, $3, $4)
        on conflict (code) do update
        set name = excluded.name,
            description = excluded.description,
            status = excluded.status,
            updated_at = now()
        returning id, code, name, description, status, created_at, updated_at
      `,
      [input.code, input.name, input.description ?? null, input.status ?? "active"]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Application upsert did not return a row");
    }

    return mapApplication(row);
  }

  async listFunctions(
    applicationCode: string
  ): Promise<{ applicationCode: string; functions: ApplicationFunctionResponse[] }> {
    const application = await this.getApplicationByCode(this.db, applicationCode);
    const result = await this.db.query<ApplicationFunctionRow>(
      `
        select f.id, f.application_id, a.code as application_code, f.code, f.name,
               f.description, f.charge_mode, f.default_points, f.status,
               f.created_at, f.updated_at
        from application_functions f
        join applications a on a.id = f.application_id
        where f.application_id = $1
        order by f.code asc
      `,
      [application.id]
    );

    return {
      applicationCode,
      functions: result.rows.map((row) => mapApplicationFunction(row))
    };
  }

  async registerFunction(
    input: RegisterApplicationFunctionInput
  ): Promise<ApplicationFunctionResponse> {
    return this.db.withTransaction(async (client) => {
      const application = await this.getApplicationByCode(client, input.applicationCode);
      const result = await client.query<ApplicationFunctionRow>(
        `
          insert into application_functions (
            application_id, code, name, description, charge_mode, default_points, status
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (application_id, code) do update
          set name = excluded.name,
              description = excluded.description,
              charge_mode = excluded.charge_mode,
              default_points = excluded.default_points,
              status = excluded.status,
              updated_at = now()
          returning id, application_id, code, name, description, charge_mode,
                    default_points, status, created_at, updated_at
        `,
        [
          application.id,
          input.code,
          input.name,
          input.description ?? null,
          input.chargeMode,
          input.defaultPoints,
          input.status ?? "active"
        ]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("Application function upsert did not return a row");
      }

      return mapApplicationFunction({
        ...row,
        application_code: input.applicationCode
      });
    });
  }

  integrationContract(): JsonObject {
    return {
      version: "phase-5",
      purpose: "Allow external AI applications to plug into the reusable credits platform without storing vertical business data.",
      registration: {
        applications: "POST /integration/applications",
        functions: "POST /integration/applications/:applicationCode/functions"
      },
      usageFlow: [
        "POST /billing/estimate",
        "POST /billing/freeze",
        "external AI task executes",
        "POST /billing/settle on success",
        "POST /billing/refund on failure"
      ],
      rechargeFlow: [
        "GET /recharge-products",
        "POST /payment-orders",
        "payment provider callback",
        "POST /payment-callbacks/:channel"
      ],
      externalFields: [
        "applicationCode",
        "functionCode",
        "bizType",
        "bizId",
        "idempotencyKey",
        "tenantId only after backend membership verification"
      ],
      forbiddenFrontendFields: [
        "amount",
        "points",
        "bonusPoints",
        "commissionRate",
        "rolePermission",
        "tenantPermission"
      ]
    };
  }

  private async getApplicationByCode(
    client: DatabaseClient,
    code: string
  ): Promise<ApplicationResponse> {
    const result = await client.query<ApplicationRow>(
      `
        select id, code, name, description, status, created_at, updated_at
        from applications
        where code = $1
        limit 1
      `,
      [code]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(`Application not found: ${code}`);
    }

    return mapApplication(row);
  }
}
