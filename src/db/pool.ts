import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket
} from "mysql2/promise";
import type { AppEnv } from "../config/env.js";
import { configureMysqlChinaTimezone, MYSQL_CHINA_TIME_ZONE } from "./mysql-timezone.js";

export type DatabaseResult<T> = {
  rows: T[];
  insertId?: number;
  affectedRows?: number;
};

export type DatabaseClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<DatabaseResult<T>>;
};

export type Database = DatabaseClient & {
  withTransaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

type NormalizedQuery = {
  sql: string;
  values: MysqlValue[];
};

type MysqlValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | null
  | Buffer
  | Uint8Array
  | MysqlValue[]
  | { [key: string]: MysqlValue };

function normalizeSql(text: string): string {
  return text
    .replace(/::[a-zA-Z_][a-zA-Z0-9_]*/g, "")
    .replace(/([a-zA-Z0-9_.]+)\s+is\s+not\s+distinct\s+from\s+\?/gi, "$1 <=> ?")
    .replace(/\bnow\(\)/gi, "CURRENT_TIMESTAMP");
}

function normalizeQuery(text: string, values: unknown[] = []): NormalizedQuery {
  const normalizedValues: unknown[] = [];
  const sql = normalizeSql(
    text.replace(/\$(\d+)(?:::[a-zA-Z_][a-zA-Z0-9_]*)?/g, (_match, indexText: string) => {
      const index = Number(indexText) - 1;
      normalizedValues.push(values[index]);
      return "?";
    })
  );

  return {
    sql,
    values: normalizeJsonValues(normalizedValues)
  };
}

function normalizeJsonValues(values: unknown[] = []): MysqlValue[] {
  return values.map((value) => {
    if (value === undefined) return null;
    if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      return JSON.stringify(value);
    }
    return value as MysqlValue;
  });
}

function splitReturning(text: string) {
  const match = /\breturning\b/i.exec(text);
  if (!match) return null;

  return {
    statement: text.slice(0, match.index).trim(),
    columns: text.slice(match.index + match[0].length).trim().replace(/;$/, "")
  };
}

function transformPostgresUpsert(statement: string) {
  const doNothing = /\bon\s+conflict\s*\([^)]+\)(?:\s+where\s+[\s\S]*?)?\s+do\s+nothing\b/i;
  if (doNothing.test(statement)) {
    return statement.replace(/\binsert\s+into\b/i, "insert ignore into").replace(doNothing, "");
  }

  const upsert = /\bon\s+conflict\s*\([^)]+\)(?:\s+where\s+[\s\S]*?)?\s+do\s+update\s+set\s+([\s\S]*)$/i;
  const match = upsert.exec(statement);
  if (!match) return statement;

  const assignments = match[1]!
    .replace(/\bexcluded\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g, "values($1)")
    .trim();
  const prefix = statement.slice(0, match.index).trim();
  const updateAssignments = assignments ? `id = LAST_INSERT_ID(id), ${assignments}` : "id = LAST_INSERT_ID(id)";

  return `${prefix} on duplicate key update ${updateAssignments}`;
}

function tableNameFromStatement(statement: string) {
  const match = /^\s*(?:insert\s+(?:ignore\s+)?into|update)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i.exec(
    statement
  );
  return match?.[1] ?? null;
}

function operationFromStatement(statement: string) {
  const match = /^\s*(insert|update)\b/i.exec(statement);
  return match?.[1]?.toLowerCase() as "insert" | "update" | undefined;
}

function returningLookup(statement: string, values: unknown[]) {
  const match = /\bwhere\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\$(\d+)/i.exec(statement);
  if (!match) return null;

  return {
    column: match[1],
    value: values[Number(match[2]) - 1]
  };
}

function makeClient(connection: Pool | PoolConnection): DatabaseClient {
  return {
    async query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values = []) {
      const returning = splitReturning(text);
      const statement = returning ? transformPostgresUpsert(returning.statement) : transformPostgresUpsert(text);
      const normalized = normalizeQuery(statement, values);
      const [result] = await connection.execute<RowDataPacket[] | ResultSetHeader>(
        normalized.sql,
        normalized.values
      );

      if (Array.isArray(result)) {
        return { rows: result as T[] };
      }

      if (returning) {
        const table = tableNameFromStatement(statement);
        const operation = operationFromStatement(statement);
        if (!table || !operation) return { rows: [], insertId: result.insertId, affectedRows: result.affectedRows };

        const lookup =
          operation === "insert"
            ? result.insertId
              ? { column: "id", value: result.insertId }
              : null
            : returningLookup(statement, values);

        if (!lookup) {
          return { rows: [], insertId: result.insertId, affectedRows: result.affectedRows };
        }

        const select = normalizeQuery(
          `select ${returning.columns} from ${table} where ${lookup.column} = $1 limit 1`,
          [lookup.value]
        );
        const [rows] = await connection.execute<RowDataPacket[]>(select.sql, select.values);
        return {
          rows: rows as T[],
          insertId: result.insertId,
          affectedRows: result.affectedRows
        };
      }

      return {
        rows: [],
        insertId: result.insertId,
        affectedRows: result.affectedRows
      };
    }
  };
}

export function createDatabase(env: AppEnv): Database {
  const pool = configureMysqlChinaTimezone(mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    database: env.mysql.database,
    user: env.mysql.user,
    password: env.mysql.password,
    timezone: MYSQL_CHINA_TIME_ZONE,
    waitForConnections: true,
    connectionLimit: env.mysql.connectionLimit,
    namedPlaceholders: false,
    dateStrings: false,
    decimalNumbers: false
  }));
  let closePromise: Promise<void> | null = null;
  const client = makeClient(pool);

  return {
    query: (text, values) => client.query(text, values),
    withTransaction: async (fn) => {
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();
        const result = await fn(makeClient(connection));
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    close: () => {
      closePromise ??= pool.end();
      return closePromise;
    }
  };
}
