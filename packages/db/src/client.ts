import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

export type Database = ReturnType<typeof createDb>['db'];

let _pool: pg.Pool | null = null;
let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    const result = createDb(connectionString);
    _pool = result.pool;
    _db = result.db;
  }
  return _db;
}

export function getPoolStats() {
  if (!_pool) return null;
  return {
    totalCount: _pool.totalCount,
    idleCount: _pool.idleCount,
    waitingCount: _pool.waitingCount,
  };
}
