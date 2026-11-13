import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { models } from './models.js';
import { makeSeed } from './seed.js';

const collections = Object.keys(models);
export async function createStore({ mongoUri, dataDir, seed = true } = {}) {
  let state, queue = Promise.resolve();
  const mode = mongoUri ? 'mongodb' : 'demo';
  const file = path.join(dataDir, 'database.json');
  if (mongoUri) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    await Promise.all(Object.values(models).map(m => m.init()));
    state = Object.fromEntries(await Promise.all(collections.map(async key => [key, (await models[key].find().lean()).map(({ _id, ...value }) => value)])));
  } else {
    await mkdir(dataDir, { recursive: true });
    try { state = JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (!state || (seed && !state.users.length)) state = seed ? await makeSeed() : Object.fromEntries(collections.map(k => [k, []]));
  async function persist(before = Object.fromEntries(collections.map(k => [k, []]))) {
    if (mongoUri) {
      // Replica-set transactions ensure all record changes in one operation commit together.
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          for (const key of collections) {
            const previous = new Map(before[key].map(x => [x.id, JSON.stringify(x)]));
            const operations = state[key].filter(x => previous.get(x.id) !== JSON.stringify(x)).map(x => ({ replaceOne: { filter: { id: x.id }, replacement: x, upsert: true } }));
            if (operations.length) await models[key].bulkWrite(operations, { session });
          }
        });
      } finally { await session.endSession(); }
    } else {
      await writeFile(`${file}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    }
  }
  await persist();
  return {
    mode,
    read: () => structuredClone(state),
    async mutate(fn) {
      const task = queue.then(async () => {
        const before = structuredClone(state);
        try { const result = await fn(state); await persist(before); return structuredClone(result); }
        catch (error) { state = before; throw error; }
      });
      queue = task.catch(() => {});
      return task;
    },
    close: async () => { await queue; if (mongoUri) await mongoose.disconnect(); },
  };
}
