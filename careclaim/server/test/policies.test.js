import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/store.js';
import { createApp } from '../src/app.js';

const year = new Date().getUTCFullYear();
const policyInput = overrides => ({ policyNumber: 'IMPORTED-001', name: 'Imported Family Cover', coverageAmount: 500000, premiumAmount: 12499, startDate: `${year}-01-01`, endDate: `${year + 1}-12-31`, nextDueDate: `${year}-12-01`, ...overrides });
async function setup(t, { storeMode = 'demo', ...options } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'careclaim-policy-test-'));
  const persistentStore = await createStore({ dataDir });
  const store = { ...persistentStore, mode: storeMode };
  const app = createApp({ store, jwtSecret: 'policy-test-secret-with-more-than-32-characters', uploadDir: path.join(dataDir, 'uploads'), ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await persistentStore.close();
    const resolved = path.resolve(dataDir);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('careclaim-policy-test-')) throw new Error('Unexpected policy-test cleanup path.');
    await rm(resolved, { recursive: true, force: true });
  });
  async function request(endpoint, { token, body, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(`${base}${endpoint}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  async function login(role = 'patient') {
    const response = await request('/auth/login', { body: { email: `${role}@careclaim.demo`, password: 'Demo@12345' } });
    assert.equal(response.status, 200);
    return response.data;
  }
  return { request, login, store };
}

test('a new demo member imports usable sample cover once, scoped to their account', async t => {
  const { request, login, store } = await setup(t);
  const registered = await request('/auth/register', { body: { name: 'Policy Import Member', email: 'policy-member@example.test', password: 'SecurePassword123' } });
  assert.equal(registered.status, 201);
  const { token, user } = registered.data;
  assert.deepEqual((await request('/policies', { token })).data, { policies: [], importOptions: { sample: true, csv: true } });
  const imported = await request('/policies/import', { token, body: { source: 'sample', patientId: 'user-patient' } });
  assert.equal(imported.status, 201);
  assert.equal(imported.data.importedCount, 2);
  assert.deepEqual(imported.data.policies.map(policy => policy.name), ['Sample Family Cover', 'Sample Essential Cover']);
  assert.ok(imported.data.policies.every(policy => policy.patientId === user.id && policy.patientName === user.name && policy.status === 'Active' && policy.sample === true && policy.source === 'sample' && policy.usedAmount === 0));
  const repeats = await Promise.all([1, 2].map(() => request('/policies/import', { token, body: { source: 'sample' } })));
  assert.ok(repeats.every(response => response.status === 200 && response.data.importedCount === 0));
  assert.equal((await request('/policies', { token })).data.policies.length, 2);
  assert.equal(store.read().logs.filter(log => log.action === 'POLICY_IMPORTED' && log.actorId === user.id).length, 2);
  const other = await login();
  assert.ok((await request('/policies', { token: other.token })).data.policies.every(policy => policy.patientId !== user.id));
  const submitted = await request('/claims', { token, body: { policyNumber: imported.data.policies[0].policyNumber, age: 32, gender: 'Male', claimAmount: 1500, disease: 'Import workflow observation', hospital: 'Synthetic Care Hospital', admissionDate: new Date().toISOString().slice(0, 10), dischargeDate: new Date().toISOString().slice(0, 10) } });
  assert.equal(submitted.status, 201);
  assert.equal(submitted.data.claim.patientId, user.id);
});

test('CSV policy imports validate the entire batch and reject duplicates without partial records', async t => {
  const { request, login, store } = await setup(t);
  const { token, user } = await login();
  const imported = await request('/policies/import', { token, body: { policies: [policyInput({ name: '  Imported Family Cover  ', coverageAmount: '500000.50', premiumAmount: '12499.25', patientId: 'user-patient-2', usedAmount: 400000, status: 'Expired' })] } });
  assert.equal(imported.status, 201);
  assert.equal(imported.data.policies[0].coverageAmount, 500000.5);
  assert.equal(imported.data.policies[0].name, 'Imported Family Cover');
  assert.equal(imported.data.policies[0].patientId, user.id);
  assert.equal(imported.data.policies[0].usedAmount, 0);
  assert.equal(imported.data.policies[0].status, 'Active');
  const before = store.read();
  const failures = [
    { policies: [policyInput({ policyNumber: 'VALID-BUT-ROLLED-BACK' }), policyInput({ policyNumber: 'INVALID-DATE', startDate: `${year}-02-31` })] },
    { policies: [policyInput({ policyNumber: 'BATCH-DUPLICATE' }), policyInput({ policyNumber: 'batch-duplicate' })] },
    { policies: [policyInput({ policyNumber: 'imported-001' })] },
    { policies: [policyInput({ policyNumber: 'BAD-DATES', endDate: `${year}-01-01` })] },
    { policies: [policyInput({ policyNumber: 'BAD-DUE', nextDueDate: `${year + 2}-01-01` })] },
    { policies: [policyInput({ premiumAmount: '1e3' })] },
    { policies: [policyInput({ coverageAmount: 0 })] },
    { policies: [policyInput({ policyNumber: 'AB' })] },
    { policies: [policyInput({ premiumAmount: true })] },
    { policies: [policyInput({ premiumAmount: 12.345 })] },
    { policies: [] },
    { policies: Array.from({ length: 101 }, (_, index) => policyInput({ policyNumber: `TOO-MANY-${index}` })) },
  ];
  for (const body of failures) {
    const result = await request('/policies/import', { token, body });
    assert.ok([400, 409].includes(result.status), JSON.stringify(result.data));
    assert.deepEqual(store.read(), before);
  }
});

test('import permissions preserve member ownership and require admin patient assignments', async t => {
  const { request, login, store } = await setup(t);
  assert.equal((await request('/policies/import', { body: { source: 'sample' } })).status, 401);
  const member = await login();
  assert.equal((await request('/policies/import', { token: member.token, body: { policies: [policyInput({ patientEmail: 'meera@careclaim.demo' })] } })).status, 403);
  for (const role of ['hospital', 'officer']) {
    const staff = await login(role);
    assert.deepEqual((await request('/policies', { token: staff.token })).data.importOptions, { sample: false, csv: false });
    assert.equal((await request('/policies/import', { token: staff.token, body: { source: 'sample' } })).status, 403);
    assert.equal((await request('/policies/import', { token: staff.token, body: { policies: [policyInput()] } })).status, 403);
  }
  const admin = await login('admin');
  assert.deepEqual((await request('/policies', { token: admin.token })).data.importOptions, { sample: false, csv: true });
  assert.equal((await request('/policies/import', { token: admin.token, body: { source: 'sample' } })).status, 403);
  const count = store.read().policies.length;
  assert.equal((await request('/policies/import', { token: admin.token, body: { policies: [policyInput()] } })).status, 400);
  assert.equal((await request('/policies/import', { token: admin.token, body: { policies: [policyInput({ patientEmail: 'missing@example.test' })] } })).status, 400);
  assert.equal(store.read().policies.length, count);
  const imported = await request('/policies/import', { token: admin.token, body: { policies: [policyInput({ patientEmail: 'MEERA@careclaim.demo' })] } });
  assert.equal(imported.status, 201);
  assert.equal(imported.data.policies[0].patientId, 'user-patient-2');
  assert.equal(imported.data.policies[0].patientName, 'Meera Patel');
});

test('connected members cannot self-authorize cover, and sample policies cannot collect live funds', async t => {
  // The temporary JSON persistence supplies data while this app advertises the
  // connected-store mode, testing the same access branch without a Mongo service.
  const connected = await setup(t, { storeMode: 'mongodb' });
  const member = await connected.login();
  assert.deepEqual((await connected.request('/policies', { token: member.token })).data.importOptions, { sample: false, csv: false });
  for (const body of [{ source: 'sample' }, { policies: [policyInput()] }]) assert.equal((await connected.request('/policies/import', { token: member.token, body })).status, 403);
  const admin = await connected.login('admin');
  const imported = await connected.request('/policies/import', { token: admin.token, body: { policies: [policyInput({ patientEmail: 'patient@careclaim.demo' })] } });
  assert.equal(imported.status, 201);
  assert.equal(imported.data.policies[0].sample, false);
  let gatewayCalls = 0;
  const demo = await setup(t, { razorpayKeyId: 'rzp_live_policy_test', razorpayKeySecret: 'fixture-secret', gatewayFetch: async () => { gatewayCalls++; throw new Error('Gateway must not be called for sample policies.'); } });
  const demoMember = await demo.login();
  const samples = await demo.request('/policies/import', { token: demoMember.token, body: { source: 'sample' } });
  const checkout = await demo.request('/payments/order', { token: demoMember.token, body: { policyId: samples.data.policies[0].id } });
  assert.equal(checkout.status, 409);
  assert.match(checkout.data.message, /only sandbox or Razorpay test/);
  assert.equal(gatewayCalls, 0);
});
