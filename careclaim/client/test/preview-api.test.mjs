import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('static preview enforces roles and records a premium payment exactly once', async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  globalThis.fetch = async () => { throw new Error('Static hosting has no Express API'); };
  try {
    const source = (await readFile(new URL('../src/api.js', import.meta.url), 'utf8')).replace('import.meta.env.VITE_API_URL', "''").replace("'../../shared/policy-import.js'", JSON.stringify(new URL('../../shared/policy-import.js', import.meta.url).href));
    const { api } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    assert.deepEqual(await api.init(), { mode: 'preview' });
    await assert.rejects(api.me(), /sign in/);
    await assert.rejects(api.login('patient@careclaim.demo', 'wrong'), /incorrect/);
    const { user } = await api.login('patient@careclaim.demo', 'Demo@12345');
    assert.equal(user.role, 'patient');
    assert.equal(user.password, undefined);
    const { claims } = await api.claims();
    assert.ok(claims.length > 0);
    assert.ok(claims.every(claim => claim.patientId === user.id));
    await assert.rejects(api.audit(), /restricted/);
    await assert.rejects(api.updateClaim(claims.find(claim => claim.status === 'Pending').id, { status: 'Approved', remarks: 'Trying unauthorized approval' }), /officer/);
    const { policies } = await api.policies();
    const { order } = await api.createOrder(policies[0].id);
    assert.equal(order.amount, policies[0].premiumAmount * 100);
    const pendingPayment = await api.paymentStatus(order.id);
    assert.equal(pendingPayment.status, 'pending');
    assert.equal(pendingPayment.payment, null);
    const result = await api.verifyPayment({ orderId: order.id });
    const repeated = await api.verifyPayment({ orderId: order.id });
    assert.equal(result.payment.id, repeated.payment.id);
    assert.equal((await api.payments()).payments.filter(payment => payment.orderId === order.id).length, 1);
    assert.equal((await api.paymentStatus(order.id)).payment.id, result.payment.id);
    await assert.rejects(api.createOrder(policies[0].id), /next premium is not due/);
    api.logout();
    await api.login('officer@careclaim.demo', 'Demo@12345');
    await assert.rejects(api.paymentStatus(order.id), /not found/);
    assert.ok((await api.claims()).claims.length > claims.length);
    await assert.rejects(api.createOrder(policies[0].id), /policyholder/);
    const claim = (await api.claims()).claims.find(claim => claim.status === 'Pending');
    await assert.rejects(api.updateClaim(claim.id, { status: 'Approved', remarks: 'ok' }), /5 characters/);
    await api.updateClaim(claim.id, { status: 'Approved', remarks: 'All sample documents verified.' });
    assert.equal((await api.claims()).claims.find(item => item.id === claim.id).status, 'Approved');
    await assert.rejects(api.updateClaim(claim.id, { status: 'Rejected', remarks: 'Second decision is not allowed' }), /final decision/);
    api.logout();
    await api.login('hospital@careclaim.demo', 'Demo@12345');
    const pending = (await api.claims()).claims.find(item => item.status === 'Pending');
    if (pending.submittedBy !== 'user-hospital') await assert.rejects(api.updateClaim(pending.id, { disease: 'Unauthorized edit' }), /submitter/);
    const stats = (await api.stats()).stats;
    assert.equal(stats.totalClaims, (await api.claims()).claims.length);
    assert.equal(stats.statusDistribution.reduce((sum, item) => sum + item.value, 0), stats.totalClaims);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
  }
});
