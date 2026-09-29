import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
const secrets = {
  HUB_ADMIN_TOKEN: randomBytes(32).toString('base64url'),
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
};
try {
  if (production) {
    await mkdir(resolve(root, '.secrets'), { recursive: true, mode: 0o700 });
    await writeFile(resolve(root, '.secrets/production.json'), `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await writeFile(resolve(root, '.secrets/OWNER-ACCESS.txt'), `Postiz Business Hub owner access\n\nUse this token on the hub's sign-in page. Store it in your password manager.\n\n${secrets.HUB_ADMIN_TOKEN}\n\nDo not give the owner token to agent teams. Issue a business-scoped token in Agent access instead.\nThe encryption key is in production.json; keep an encrypted backup.\n`, { mode: 0o600, flag: 'wx' });
    console.log('Created .secrets/production.json and .secrets/OWNER-ACCESS.txt (private files). No secret values were printed.');
  } else {
    await writeFile(resolve(root, '.dev.vars'), Object.entries({ ...secrets, PUBLIC_ORIGIN: 'http://localhost:8787' }).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
    console.log('Created .dev.vars. Use its HUB_ADMIN_TOKEN for local sign-in.');
  }
} catch (error) {
  if (error.code === 'EEXIST') console.error('Secret files already exist. They were preserved; use the existing credentials.');
  else console.error('Unable to create secret files:', error.code || error.name);
  process.exitCode = 1;
}
