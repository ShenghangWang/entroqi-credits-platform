export type QueryResultRow = Record<string, unknown>;

export type QueryResult<T extends QueryResultRow = QueryResultRow> = {
  rows: T[];
  rowCount: number;
  command: string;
  oid: number;
  fields: unknown[];
};
