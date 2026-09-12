import pg from 'pg';
import { config } from './config.js';
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 12),
  connectionTimeoutMillis: 10000,
});
pool.on('error', (error) => console.error('Database connection error:', error.message));
export type DB = Pick<pg.PoolClient, 'query'>;
export async function transaction<T>(fn: (db: DB) => Promise<T>, serialized = false): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Keep event sequence order equal to commit order; catch-up cursors cannot skip a late commit.
    if (serialized) await client.query('SELECT pg_advisory_xact_lock(812736)');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
