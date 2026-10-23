import type { FastifyInstance } from "fastify";
import type { Database } from "../db/pool.js";
import { IntegrationService } from "../integration/integration-service.js";

type RegisterIntegrationRoutesOptions = {
  db: Database;
};

type ApplicationCodeParam = {
  applicationCode: string;
};

type RegisterApplicationBody = {
  code: string;
  name: string;
  description?: string | null;
  status?: string;
};

type RegisterFunctionBody = {
  code: string;
  name: string;
  description?: string | null;
  chargeMode: "fixed" | "dynamic" | "estimate_required";
  defaultPoints: string;
  status?: string;
};

const applicationSchema = {
  type: "object",
  required: ["id", "code", "name", "description", "status"],
  properties: {
    id: { type: "number" },
    code: { type: "string" },
    name: { type: "string" },
    description: { type: ["string", "null"] },
    status: { type: "string" }
  }
};

const functionSchema = {
  type: "object",
  required: [
    "id",
    "applicationId",
    "code",
    "name",
    "description",
    "chargeMode",
    "defaultPoints",
    "status"
  ],
  properties: {
    id: { type: "number" },
    applicationId: { type: "number" },
    applicationCode: { type: "string" },
    code: { type: "string" },
    name: { type: "string" },
    description: { type: ["string", "null"] },
    chargeMode: { type: "string", enum: ["fixed", "dynamic", "estimate_required"] },
    defaultPoints: { type: "string" },
    status: { type: "string" }
  }
};

export function registerIntegrationRoutes(
  app: FastifyInstance,
  options: RegisterIntegrationRoutesOptions
): void {
  const integration = new IntegrationService(options.db);

  app.get(
    "/integration/contract",
    {
      schema: {
        tags: ["integration"],
        response: {
          200: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    },
    () => integration.integrationContract()
  );

  app.get(
    "/integration/applications",
    {
      schema: {
        tags: ["integration"],
        response: {
          200: {
            type: "object",
            required: ["applications"],
            properties: {
              applications: {
                type: "array",
                items: applicationSchema
              }
            }
          }
        }
      }
    },
    async () => integration.listApplications()
  );

  app.post<{ Body: RegisterApplicationBody }>(
    "/integration/applications",
    {
      schema: {
        tags: ["integration"],
        body: {
          type: "object",
          required: ["code", "name"],
          additionalProperties: false,
          properties: {
            code: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
            description: { type: ["string", "null"] },
            status: { type: "string" }
          }
        },
        response: {
          200: applicationSchema
        }
      }
    },
    async (request) => integration.registerApplication(request.body)
  );

  app.get<{ Params: ApplicationCodeParam }>(
    "/integration/applications/:applicationCode/functions",
    {
      schema: {
        tags: ["integration"],
        params: {
          type: "object",
          required: ["applicationCode"],
          properties: {
            applicationCode: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["applicationCode", "functions"],
            properties: {
              applicationCode: { type: "string" },
              functions: {
                type: "array",
                items: functionSchema
              }
            }
          }
        }
      }
    },
    async (request) => integration.listFunctions(request.params.applicationCode)
  );

  app.post<{ Params: ApplicationCodeParam; Body: RegisterFunctionBody }>(
    "/integration/applications/:applicationCode/functions",
    {
      schema: {
        tags: ["integration"],
        params: {
          type: "object",
          required: ["applicationCode"],
          properties: {
            applicationCode: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["code", "name", "chargeMode", "defaultPoints"],
          additionalProperties: false,
          properties: {
            code: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
            description: { type: ["string", "null"] },
            chargeMode: { type: "string", enum: ["fixed", "dynamic", "estimate_required"] },
            defaultPoints: { type: "string", pattern: "^\\d+(\\.\\d{1,4})?$" },
            status: { type: "string" }
          }
        },
        response: {
          200: functionSchema
        }
      }
    },
    async (request) =>
      integration.registerFunction({
        applicationCode: request.params.applicationCode,
        ...request.body
      })
  );
}
