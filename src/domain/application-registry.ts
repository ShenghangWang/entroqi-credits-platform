import type { DatabaseClient } from "../db/pool.js";
import { NotFoundError } from "./errors.js";

export type ApplicationFunctionRef = {
  applicationId: number;
  applicationCode: string;
  functionId: number;
  functionCode: string;
  chargeMode: "fixed" | "dynamic" | "estimate_required";
  defaultPoints: string;
};

type ApplicationFunctionRow = {
  application_id: string;
  application_code: string;
  function_id: string;
  function_code: string;
  charge_mode: "fixed" | "dynamic" | "estimate_required";
  default_points: string;
};

export class ApplicationRegistry {
  constructor(private readonly db: DatabaseClient) {}

  async resolveFunction(
    applicationCode: string,
    functionCode: string
  ): Promise<ApplicationFunctionRef> {
    const result = await this.db.query<ApplicationFunctionRow>(
      `
        select a.id as application_id,
               a.code as application_code,
               f.id as function_id,
               f.code as function_code,
               f.charge_mode,
               f.default_points
        from applications a
        join application_functions f on f.application_id = a.id
        where a.code = $1
          and f.code = $2
          and a.status = 'active'
          and f.status = 'active'
        limit 1
      `,
      [applicationCode, functionCode]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundError(
        `Active application function not found: ${applicationCode}/${functionCode}`
      );
    }

    return {
      applicationId: Number(row.application_id),
      applicationCode: row.application_code,
      functionId: Number(row.function_id),
      functionCode: row.function_code,
      chargeMode: row.charge_mode,
      defaultPoints: row.default_points
    };
  }
}
