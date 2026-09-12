import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  COOKIE_SAME_SITE: z.enum(['lax', 'none', 'strict']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  JOBS_ENABLED: z.enum(['true', 'false']).default('true'),
  OVERDUE_CRON: z.string().default('* * * * *'),
});
export const config = schema.parse(process.env);
export const origins = config.WEB_ORIGIN.split(',').map((s) => s.trim());
if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET)
  throw new Error('Access and refresh secrets must be different.');
if (
  config.NODE_ENV === 'production' &&
  /GENERATE|CHANGE_ME/.test(config.JWT_ACCESS_SECRET + config.JWT_REFRESH_SECRET)
)
  throw new Error('Generate deployment secrets before starting.');
