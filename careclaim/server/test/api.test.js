import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { createStore } from '../src/store.js';
import { createApp } from '../src/app.js';

const secret = 'careclaim-test-secret-with-at-least-32-characters';
async function setup(t, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'careclaim-test-'));
  const store = await createStore({ dataDir });
  const app = createApp({ store, jwtSecret: secret, uploadDir: path.join(dataDir, 'uploads'), logger: { error: (...args) => { console.error(...args); } }, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await store.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function request(url, { method = 'GET', token, body, form } = {}) {
    const response = await fetch(`${base}/api${url}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : form ? { body: form } : {}) });
    const content = response.headers.get('content-type') || '';
    return { status: response.status, data: content.includes('application/json') ? await response.json() : await response.text() };
  }
  async function login(role = 'patient') { const r = await request('/auth/login', { method: 'POST', body: { email: `${role}@careclaim.demo`, password: 'Demo@12345' } }); assert.equal(r.status, 200); return r.data; }
  return { store, request, login, dataDir, base };
}
const claimBody = { policyNumber: 'CC-2026-104201', age: 32, gender: 'Male', claimAmount: 25000, disease: 'Hospital observation', hospital: 'Sample Medical Centre', admissionDate: '2026-01-11', dischargeDate: '2026-01-12' };

test('authentication, registration restrictions, duplicate emails and password privacy', async t => {
  const { request, login } = await setup(t);
  assert.equal((await request('/claims')).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST' })).status, 400);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'patient@careclaim.demo', password: 'wrong' } })).status, 401);
  const session = await login(); assert.equal(session.user.role, 'patient'); assert.equal(session.user.passwordHash, undefined);
  const me = await request('/auth/me', { token: session.token }); assert.equal(me.data.user.id, 'user-patient'); assert.equal(me.data.user.passwordHash, undefined);
  const registration = { name: 'Test Patient', email: 'test@example.com', password: 'SecurePass123!' };
  assert.equal((await request('/auth/register', { method: 'POST', body: { ...registration, role: 'admin' } })).status, 403);
  const created = await request('/auth/register', { method: 'POST', body: registration }); assert.equal(created.status, 201); assert.equal(created.data.user.role, 'patient');
  assert.equal((await request('/auth/register', { method: 'POST', body: registration })).status, 409);
  assert.equal((await request('/auth/profile', { method: 'PUT', token: session.token, body: { name: 'Aarav S', phone: '9876543210', role: 'admin' } })).data.user.role, 'patient');
});

test('patient ownership, staff role boundaries and role-filtered analytics', async t => {
  const { request, login } = await setup(t);
  const patient = await login(), officer = await login('officer'), hospital = await login('hospital');
  const own = await request('/claims', { token: patient.token }); assert.ok(own.data.claims.every(c => c.patientId === patient.user.id)); assert.equal(own.data.claims.length, 4);
  assert.equal((await request('/claims/claim-5', { token: patient.token })).status, 404);
  assert.equal((await request('/claims', { token: officer.token })).data.claims.length, 8);
  assert.equal((await request('/claims/stats', { token: patient.token })).data.stats.totalClaims, 4);
  assert.equal((await request('/audit', { token: hospital.token })).status, 403);
  assert.equal((await request('/audit', { token: officer.token })).status, 200);
  assert.equal((await request('/payments/order', { method: 'POST', token: hospital.token, body: { policyId: 'policy-1' } })).status, 403);
});

test('claim validation, self-service edits and reviewer transitions are enforced', async t => {
  const { request, login } = await setup(t); const patient = await login(), officer = await login('officer');
  for (const body of [{ ...claimBody, claimAmount: -1 }, { ...claimBody, admissionDate: '2026-02-31' }, { ...claimBody, claimAmount: 1000001 }, { ...claimBody, policyNumber: 'CC-2026-104202' }, { ...claimBody, age: '' }]) assert.equal((await request('/claims', { method: 'POST', token: patient.token, body })).status, 400);
  const submitted = await request('/claims', { method: 'POST', token: patient.token, body: { ...claimBody, status: 'Approved', patientId: 'user-patient-2' } });
  assert.equal(submitted.status, 201); const c = submitted.data.claim; assert.equal(c.status, 'Pending'); assert.equal(c.patientId, patient.user.id);
  assert.equal((await request(`/claims/${c.id}`, { method: 'PUT', token: patient.token, body: { claimAmount: 27000 } })).data.claim.claimAmount, 27000);
  assert.equal((await request(`/claims/${c.id}`, { method: 'PUT', token: patient.token, body: { status: 'Approved', remarks: 'Please approve' } })).status, 403);
  assert.equal((await request(`/claims/${c.id}`, { method: 'PUT', token: officer.token, body: { status: 'Approved', remarks: '' } })).status, 400);
  const [a, b] = await Promise.all(['Approved', 'Rejected'].map(status => request(`/claims/${c.id}`, { method: 'PUT', token: officer.token, body: { status, remarks: 'Documents reviewed and verified.' } })));
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal((await request(`/claims/${c.id}`, { method: 'PUT', token: patient.token, body: { claimAmount: 20000 } })).status, 403);
});

test('uploaded documents require signatures and authenticated ownership', async t => {
  const { request, login } = await setup(t); const patient = await login();
  const invalid = new FormData(); invalid.append('documents', new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' }), 'fake.pdf');
  assert.equal((await request('/claims/claim-3/documents', { method: 'POST', token: patient.token, form: invalid })).status, 400);
  const valid = new FormData(); valid.append('documents', new Blob(['%PDF-1.4\nSynthetic sample bill\n%%EOF'], { type: 'application/pdf' }), 'sample-bill.pdf');
  const added = await request('/claims/claim-3/documents', { method: 'POST', token: patient.token, form: valid }); assert.equal(added.status, 201);
  const doc = added.data.claim.documents[0]; assert.equal(doc.path, undefined); assert.equal(doc.name, 'sample-bill.pdf');
  assert.equal((await request(`/documents/${doc.id}`)).status, 401);
  assert.equal((await request(`/documents/${doc.id}`, { token: patient.token })).status, 200);
  const registration = await request('/auth/register', { method: 'POST', body: { name: 'Another Patient', email: 'another@example.com', password: 'SecurePass123!' } });
  assert.equal((await request(`/documents/${doc.id}`, { token: registration.data.token })).status, 404);
});

test('sandbox premiums use server amounts, disallow another patient and settle idempotently', async t => {
  const { request, login, store } = await setup(t); const patient = await login();
  assert.equal((await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-2' } })).status, 404);
  const checkout = await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1', amount: 1 } });
  assert.equal(checkout.status, 201); assert.equal(checkout.data.provider, 'demo'); assert.equal(checkout.data.order.amount, 1249900);
  assert.equal(checkout.data.paymentMode, 'demo');
  assert.equal((await request(`/payments/orders/${checkout.data.order.id}`, { token: patient.token })).data.status, 'pending');
  assert.equal(store.read().payments.length, 0);
  const repeated = await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } }); assert.equal(repeated.data.order.id, checkout.data.order.id);
  const responses = await Promise.all([1, 2].map(() => request('/payments/verify', { method: 'POST', token: patient.token, body: { orderId: checkout.data.order.id } })));
  assert.ok(responses.every(r => r.status === 200)); assert.equal(responses[0].data.payment.id, responses[1].data.payment.id); assert.equal(store.read().payments.length, 1);
  assert.equal(responses[0].data.payment.paymentMode, 'demo');
  assert.equal((await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } })).status, 409);
  assert.equal((await request('/payments', { token: patient.token })).data.payments.length, 1);
});

test('Razorpay requires a valid server signature AND a captured matching payment', async t => {
  let captured = false;
  const { request, login } = await setup(t, { razorpayKeyId: 'rzp_test_example', razorpayKeySecret: 'test-secret', demoPayments: false, gatewayFetch: async (url, options) => {
    if (url.endsWith('/orders')) { assert.equal(JSON.parse(options.body).amount, 1249900); return new Response(JSON.stringify({ id: 'order_gateway_123' })); }
    return new Response(JSON.stringify({ id: 'pay_gateway_123', status: captured ? 'captured' : 'authorized', order_id: 'order_gateway_123', amount: 1249900, currency: 'INR', method: 'upi' }));
  } });
  const patient = await login(); const order = await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } });
  assert.equal(order.data.provider, 'razorpay'); assert.equal(order.data.keyId, 'rzp_test_example');
  assert.equal(order.data.paymentMode, 'test'); assert.equal(order.data.order.paymentMode, 'test');
  assert.equal((await request('/health')).data.paymentMode, 'test');
  const body = { orderId: order.data.order.id, razorpay_payment_id: 'pay_gateway_123', razorpay_signature: '0'.repeat(64) };
  assert.equal((await request('/payments/verify', { method: 'POST', token: patient.token, body })).status, 400);
  body.razorpay_signature = createHmac('sha256', 'test-secret').update('order_gateway_123|pay_gateway_123').digest('hex');
  assert.equal((await request('/payments/verify', { method: 'POST', token: patient.token, body })).status, 409);
  captured = true;
  const verified = await request('/payments/verify', { method: 'POST', token: patient.token, body }); assert.equal(verified.status, 200); assert.equal(verified.data.payment.method, 'upi');
});

test('disabled sandbox refuses checkout without payment credentials', async t => {
  const { request, login } = await setup(t, { demoPayments: false }); const patient = await login();
  assert.equal((await request('/health')).data.paymentMode, 'disabled');
  assert.equal((await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } })).status, 503);
});

test('Razorpay status refresh recovers a captured UPI payment after checkout expiry, scoped to its owner', async t => {
  let payments = [];
  const { request, login, store } = await setup(t, { razorpayKeyId: 'rzp_test_example', razorpayKeySecret: 'test-secret', gatewayFetch: async url => {
    if (url.endsWith('/orders')) return Response.json({ id: 'order_reconcile_123' });
    assert.ok(url.endsWith('/orders/order_reconcile_123/payments'));
    return Response.json({ items: payments });
  } });
  const patient = await login(), officer = await login('officer');
  const { data } = await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } });
  const endpoint = `/payments/orders/${data.order.id}`;
  assert.equal((await request(endpoint)).status, 401);
  assert.equal((await request(endpoint, { token: officer.token })).status, 404);
  assert.equal((await request(endpoint, { token: patient.token })).data.status, 'pending');
  const matching = { id: 'pay_reconcile_123', order_id: 'order_reconcile_123', amount: 1249900, currency: 'INR', method: 'upi' };
  payments = [{ ...matching, status: 'failed' }];
  assert.equal((await request(endpoint, { token: patient.token })).data.status, 'failed');
  payments = [{ ...matching, status: 'authorized' }];
  assert.equal((await request(endpoint, { token: patient.token })).data.status, 'awaiting_capture');
  payments = [{ ...matching, status: 'captured', amount: 1 }, { ...matching, status: 'captured', order_id: 'order_someone_else' }];
  assert.equal((await request(endpoint, { token: patient.token })).data.payment, null);
  assert.equal(store.read().payments.length, 0);
  await store.mutate(state => { state.orders[0].expiresAt = new Date(Date.now() - 60000).toISOString(); });
  payments = [];
  assert.equal((await request(endpoint, { token: patient.token })).data.status, 'expired');
  payments = [{ ...matching, status: 'captured' }];
  const results = await Promise.all([1, 2].map(() => request(endpoint, { token: patient.token })));
  assert.ok(results.every(r => r.status === 200 && r.data.status === 'paid'));
  assert.equal(results[0].data.order.status, 'Paid');
  assert.equal(results[0].data.payment.id, results[1].data.payment.id);
  assert.equal(results[0].data.payment.paymentMode, 'test');
  assert.equal(results[0].data.payment.method, 'upi');
  assert.equal(store.read().payments.length, 1);
  assert.ok(results[0].data.policy.nextDueDate > data.order.billingPeriod);
});

test('orders are not reused across gateway configuration changes and live mode is explicit', async t => {
  let calls = 0;
  const { request, login, store } = await setup(t, { razorpayKeyId: 'rzp_live_example', razorpayKeySecret: 'test-secret', gatewayFetch: async () => Response.json({ id: `order_config_${++calls}` }) });
  const patient = await login();
  assert.equal((await request('/health')).data.paymentMode, 'live');
  const first = await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } });
  assert.equal(first.data.paymentMode, 'live');
  await store.mutate(state => { state.orders[0].gatewayKeyId = 'rzp_test_previous'; state.orders[0].paymentMode = 'test'; });
  const second = await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } });
  assert.notEqual(second.data.order.id, first.data.order.id);
  assert.equal(calls, 2);
  assert.equal((await request(`/payments/orders/${first.data.order.id}`, { token: patient.token })).status, 409);
  await store.mutate(state => { state.orders[0].provider = 'demo'; state.orders[0].paymentMode = 'demo'; });
  assert.equal((await request('/payments/verify', { method: 'POST', token: patient.token, body: { orderId: first.data.order.id } })).status, 409);
  assert.equal(store.read().payments.length, 0);
});

test('premium checkout blocks authorized attempts and reuses expired gateway orders until capture is reconciled', async t => {
  let createCalls = 0, attempts = [];
  const { request, login, store } = await setup(t, { razorpayKeyId: 'rzp_test_example', razorpayKeySecret: 'test-secret', gatewayFetch: async url => {
    if (url.endsWith('/orders')) { createCalls += 1; return Response.json({ id: 'order_delayed_123' }); }
    assert.ok(url.endsWith('/orders/order_delayed_123/payments'));
    return Response.json({ items: attempts });
  } });
  const patient = await login();
  const checkout = () => request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } });
  const original = await checkout(); assert.equal(original.status, 201);
  const attempt = { id: 'pay_delayed_123', order_id: 'order_delayed_123', amount: 1249900, currency: 'INR', method: 'upi' };
  attempts = [{ ...attempt, status: 'authorized' }];
  const unexpired = await checkout(); assert.equal(unexpired.status, 409); assert.match(unexpired.data.message, /awaiting capture/);
  await store.mutate(state => { state.orders[0].expiresAt = new Date(Date.now() - 60000).toISOString(); });
  const expired = await checkout(); assert.equal(expired.status, 409); assert.match(expired.data.message, /awaiting capture/);
  assert.equal(createCalls, 1); assert.equal(store.read().payments.length, 0);
  attempts = [{ ...attempt, status: 'failed' }];
  const retried = await checkout(); assert.equal(retried.status, 201);
  assert.equal(retried.data.order.id, original.data.order.id);
  assert.equal(retried.data.order.order_id, original.data.order.order_id);
  assert.ok(Date.parse(retried.data.order.expiresAt) > Date.now());
  assert.equal(createCalls, 1);
  await store.mutate(state => { state.orders[0].expiresAt = new Date(Date.now() - 60000).toISOString(); });
  attempts = [{ ...attempt, status: 'captured' }];
  const settled = await checkout(); assert.equal(settled.status, 409);
  assert.equal(settled.data.payment.gatewayPaymentId, attempt.id);
  assert.equal(store.read().payments.length, 1); assert.equal(createCalls, 1);
  const confirmed = await request(`/payments/orders/${original.data.order.id}`, { token: patient.token });
  assert.equal(confirmed.data.status, 'paid');
  assert.equal(confirmed.data.payment.id, settled.data.payment.id);
  assert.equal((await checkout()).status, 409); assert.equal(createCalls, 1);
});

test('malformed gateway responses cannot create a checkout or receipt', async t => {
  const responses = [new Response('upstream unavailable'), Response.json(null), Response.json({}), Response.json([])];
  const { request, login, store } = await setup(t, { razorpayKeyId: 'rzp_test_example', razorpayKeySecret: 'test-secret', gatewayFetch: async () => responses.shift() });
  const patient = await login();
  const checkout = () => request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } });
  for (let i = 0; i < 4; i++) assert.equal((await checkout()).status, 502);
  assert.equal(store.read().orders.length, 0);
  assert.equal(store.read().payments.length, 0);
});

test('signed captured-payment webhooks reconcile once and reject forged signatures', async t => {
  const { request, login, store, base } = await setup(t, { razorpayKeyId: 'rzp_test_example', razorpayKeySecret: 'gateway-secret', webhookSecret: 'webhook-secret', demoPayments: false, gatewayFetch: async () => new Response(JSON.stringify({ id: 'order_webhook_123' })) });
  const patient = await login(); const order = await request('/payments/order', { method: 'POST', token: patient.token, body: { policyId: 'policy-1' } });
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_webhook_123', order_id: 'order_webhook_123', amount: 1249900, currency: 'INR', status: 'captured', method: 'upi' } } } });
  const send = signature => fetch(`${base}/api/payments/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature }, body });
  assert.equal((await send('0'.repeat(64))).status, 400);
  const signature = createHmac('sha256', 'webhook-secret').update(body).digest('hex');
  assert.equal((await send(signature)).status, 200); assert.equal((await send(signature)).status, 200);
  assert.equal(store.read().payments.length, 1);
  const verify = await request('/payments/verify', { method: 'POST', token: patient.token, body: { orderId: order.data.order.id } }); assert.equal(verify.status, 200); assert.equal(verify.data.payment.gatewayPaymentId, 'pay_webhook_123');
});

test('demonstration records persist across reopen and failed mutations roll back', async t => {
  const { store, dataDir } = await setup(t);
  await store.mutate(state => { state.users[0].phone = '9123456789'; });
  await assert.rejects(store.mutate(state => { state.users[0].phone = 'bad'; throw new Error('Abort transaction'); }), /Abort transaction/);
  assert.equal(store.read().users[0].phone, '9123456789');
  const reopened = await createStore({ dataDir });
  assert.equal(reopened.read().users[0].phone, '9123456789');
  await reopened.close();
});
