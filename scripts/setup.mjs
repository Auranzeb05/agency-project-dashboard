import { randomBytes } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
const root = new URL('../', import.meta.url),
  target = new URL('.env', root);
try {
  await access(target);
  console.log('.env already exists; left unchanged.');
} catch {
  let template = await readFile(new URL('.env.example', root), 'utf8');
  const password = randomBytes(24).toString('hex');
  template = template
    .replaceAll('CHANGE_ME', password)
    .replace(
      'JWT_ACCESS_SECRET=GENERATE_WITH_NPM_RUN_SETUP',
      `JWT_ACCESS_SECRET=${randomBytes(48).toString('hex')}`,
    )
    .replace(
      'JWT_REFRESH_SECRET=GENERATE_WITH_NPM_RUN_SETUP',
      `JWT_REFRESH_SECRET=${randomBytes(48).toString('hex')}`,
    )
    .replace(
      'SEED_PASSWORD=GENERATE_WITH_NPM_RUN_SETUP',
      `SEED_PASSWORD=${randomBytes(18).toString('base64url')}`,
    );
  await writeFile(target, template, { mode: 0o600 });
  console.log(
    'Created .env with random local credentials. The seed account password is in SEED_PASSWORD.',
  );
}
