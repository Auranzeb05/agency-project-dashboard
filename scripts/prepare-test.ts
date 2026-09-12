import { pool } from '../apps/api/src/db.js';
import { config } from '../apps/api/src/config.js';
import { migrate } from '../apps/api/src/migrate.js';
import { seed } from '../apps/api/src/seed.js';
if (process.env.NODE_ENV !== 'test' || !new URL(config.DATABASE_URL).pathname.endsWith('_test'))
  throw new Error('Only a dedicated _test database may be reset.');
try {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await seed();
} finally {
  await pool.end();
}
