// Entry point: node server.js. Settings from the environment (systemd EnvironmentFile):
//   BOARDROUTE_PORT (3041), BOARDROUTE_HOST (0.0.0.0; nginx reaches it as host.docker.internal),
//   BOARDROUTE_DB (./data/boardroute.db), BOARDROUTE_ORIGIN (https://boardroute.com),
//   BOARDROUTE_SMTP_* and BOARDROUTE_MAIL_FROM(_NAME) for mail.js, NODE_ENV=production.
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { sendMail, signInMail } from './mail.js';

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const file = resolve(here, env.BOARDROUTE_DB || 'data/boardroute.db');
mkdirSync(dirname(file), { recursive: true });

const origin = env.BOARDROUTE_ORIGIN || 'https://boardroute.com';
const app = createApp({ db: openDb(file), send: sendMail, signInMail, origin, secure: origin.startsWith('https:') });
setInterval(app.cleanup, 3600e3).unref();

const port = Number(env.BOARDROUTE_PORT) || 3041, host = env.BOARDROUTE_HOST || '0.0.0.0';
createServer(app.handle).listen(port, host, () => console.log(`boardroute api on ${host}:${port}, db ${file}`));
