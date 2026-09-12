import cron from 'node-cron';
import { createApplication } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { runOverdueJob } from './services.js';
const { http, live } = createApplication();
await pool.query('SELECT 1');
if (!cron.validate(config.OVERDUE_CRON)) throw new Error('Invalid OVERDUE_CRON');
const job =
  config.JOBS_ENABLED === 'true'
    ? cron.schedule(
        config.OVERDUE_CRON,
        async () => {
          try {
            await runOverdueJob();
          } catch (e) {
            console.error('Overdue job failed', e);
          }
        },
        { timezone: 'UTC', noOverlap: true },
      )
    : undefined;
if (job) await runOverdueJob();
http.listen(config.PORT, '0.0.0.0', () => console.log(`Fieldwork API listening on ${config.PORT}`));
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await job?.stop();
  live.io.close();
  http.close();
  await pool.end();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
