import type { Pool } from "mysql2/promise";

export const MYSQL_CHINA_TIME_ZONE = "+08:00";

export function configureMysqlChinaTimezone<T extends Pool>(pool: T): T {
  pool.on("connection", (connection) => {
    const rawConnection = connection as unknown as {
      query(sql: string, callback: (error: unknown) => void): void;
    };

    rawConnection.query(`SET time_zone = '${MYSQL_CHINA_TIME_ZONE}'`, () => {
      // Keep the pool usable even if a managed database rejects session time zone changes.
      // The mysql2 timezone option below still keeps DATETIME conversion aligned to Beijing time.
    });
  });

  return pool;
}
