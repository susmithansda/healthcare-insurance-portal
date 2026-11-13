import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore } from '../server/src/store.js';
import { createApp } from '../server/src/app.js';
const dataDir=await mkdtemp(path.join(tmpdir(),'careclaim-browser-'));
const store=await createStore({dataDir,seed:true});
const app=createApp({store,jwtSecret:'browser-test-secret-only-not-for-deployment-12345',uploadDir:path.join(dataDir,'uploads'),clientOrigin:'http://127.0.0.1:5175'});
const server=app.listen(4001,'127.0.0.1');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{
  await store.close();
  const resolved=path.resolve(dataDir);
  if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('careclaim-browser-'))throw new Error('Unexpected browser-test cleanup directory.');
  await rm(resolved,{recursive:true,force:true});
  process.exit(0);
}));
