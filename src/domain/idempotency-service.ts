import type { DatabaseClient } from "../db/pool.js";
import { ConflictError } from "./errors.js";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type IdempotencyReservation =
  | {
      kind: "fresh";
      id: number;
    }
  | {
      kind: "replay";
      id: number;
      responseBody: unknown;
    }
  | {
      kind: "in_progress";
      id: number;
    };

type IdempotencyRow = {
  id: string;
  request_hash: string;
  response_body: JsonValue;
  status: string;
};

export class IdempotencyService {
  constructor(private readonly db: DatabaseClient) {}

  async reserve(input: {
    userId: number;
    idempotencyKey: string;
    requestHash: string;
    expiresAt: Date;
  }): Promise<IdempotencyReservation> {
    const inserted = await this.db.query<{ id: string }>(
      `
        insert into idempotency_keys (
          user_id, idempotency_key, request_hash, response_body, status, expires_at
        )
        values ($1, $2, $3, null, 'processing', $4)
        on conflict (user_id, idempotency_key) do nothing
        returning id
      `,
      [input.userId, input.idempotencyKey, input.requestHash, input.expiresAt]
    );

    const fresh = inserted.rows[0];
    if (fresh) {
      return {
        kind: "fresh",
        id: Number(fresh.id)
      };
    }

    const existing = await this.db.query<IdempotencyRow>(
      `
        select id, request_hash, response_body, status
        from idempotency_keys
        where user_id = $1
          and idempotency_key = $2
        limit 1
      `,
      [input.userId, input.idempotencyKey]
    );

    const row = existing.rows[0];
    if (!row) {
      throw new ConflictError("Idempotency reservation conflict could not be resolved");
    }

    if (row.request_hash !== input.requestHash) {
      throw new ConflictError("Idempotency key was already used for a different request");
    }

    if (row.status === "completed") {
      return {
        kind: "replay",
        id: Number(row.id),
        responseBody: row.response_body
      };
    }

    return {
      kind: "in_progress",
      id: Number(row.id)
    };
  }

  async complete(id: number, responseBody: unknown): Promise<void> {
    await this.db.query(
      `
        update idempotency_keys
        set response_body = $2,
            status = 'completed'
        where id = $1
      `,
      [id, responseBody]
    );
  }
}
