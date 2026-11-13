import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createApp } from './app.js';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(serverDir, 'data');
await mkdir(dataDir, { recursive: true });
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && !production) {
  const secretFile = path.join(dataDir, '.jwt-secret');
  try { jwtSecret = await readFile(secretFile, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; jwtSecret = randomBytes(48).toString('hex'); await writeFile(secretFile, jwtSecret, { mode: 0o600 }); }
}
if (!jwtSecret || jwtSecret.length < 32) throw new Error('Set JWT_SECRET to a random secret of at least 32 characters.');
if (production && !process.env.MONGODB_URI) throw new Error('Production requires MONGODB_URI (MongoDB replica set).');
if (production && process.env.SEED_DEMO === 'true') throw new Error('Disable SEED_DEMO before starting production.');
if (production && process.env.ALLOW_DEMO_PAYMENTS === 'true') throw new Error('Disable ALLOW_DEMO_PAYMENTS before starting production.');
const store = await createStore({ mongoUri: process.env.MONGODB_URI, dataDir, seed: process.env.SEED_DEMO === 'true' || !production && process.env.SEED_DEMO !== 'false' });
const app = createApp({ store, jwtSecret, uploadDir: path.join(dataDir, 'uploads'), clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', demoPayments: !production && process.env.ALLOW_DEMO_PAYMENTS !== 'false', razorpayKeyId: process.env.RAZORPAY_KEY_ID, razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET, staticDir: path.resolve(serverDir, '..', 'dist') });
const port = Number(process.env.PORT || 4000);
const server = app.listen(port, () => { console.log(`CareClaim API: http://localhost:${port} (${store.mode} database)`); if (store.mode === 'demo') console.log('Synthetic demo data only. Demo sign-in: patient@careclaim.demo / Demo@12345'); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await store.close(); process.exit(0); }));
