import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { config } from './config.js';

// timezone 'Z' + dateStrings: every DATETIME is read/written as UTC text.
export const pool: Pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: true,
  decimalNumbers: true,
});

export type Row = RowDataPacket;
export type Conn = Pool | PoolConnection;

export async function query<T extends Row = Row>(sql: string, params: unknown[] = [], c: Conn = pool): Promise<T[]> {
  const [rows] = await c.query<T[]>(sql, params as never[]);
  return rows;
}
export async function one<T extends Row = Row>(sql: string, params: unknown[] = [], c: Conn = pool): Promise<T | undefined> {
  return (await query<T>(sql, params, c))[0];
}
export async function exec(sql: string, params: unknown[] = [], c: Conn = pool): Promise<ResultSetHeader> {
  const [res] = await c.query<ResultSetHeader>(sql, params as never[]);
  return res;
}

/** Runs fn inside one transaction: COMMIT on success, ROLLBACK on any throw. */
export async function tx<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const out = await fn(c);
    await c.commit();
    return out;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
