import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { policyImportOptions, samplePolicyInputs, validatePolicyInput } from '../../shared/policy-import.js';

const now = () => new Date().toISOString();
const id = prefix => `${prefix}-${randomUUID()}`;
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const cleanUser = ({ passwordHash, ...u }) => u;
const staff = u => ['hospital', 'officer', 'admin'].includes(u.role);
const reviewer = u => ['officer', 'admin'].includes(u.role);
const visible = (u, item) => staff(u) || item.patientId === u.id;
const text = (v, label, min = 1, max = 200) => {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) fail(400, `${label} must contain ${min}–${max} characters.`);
  return v.trim();
};
const finite = (v, label, min, max) => { if ((typeof v !== 'number' && typeof v !== 'string') || typeof v === 'string' && !v.trim()) fail(400, `${label} is required.`); const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail(400, `${label} must be between ${min} and ${max}.`); return n; };
const date = (v, label) => { const s = text(v, label, 10, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) fail(400, `${label} must be a valid date.`); return s; };
const audit = (state, user, action, targetId, detail) => state.logs.push({ id: id('audit'), actorId: user.id, actorName: user.name, action, targetId, detail, at: now() });

export function buildStats(claims) {
  const approved = claims.filter(c => c.status === 'Approved');
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + i); return { key: d.toISOString().slice(0, 7), month: d.toLocaleDateString('en-IN', { month: 'short' }), submitted: 0, approved: 0 }; });
  for (const c of claims) { const m = months.find(m => m.key === c.createdAt.slice(0, 7)); if (m) { m.submitted += c.claimAmount; if (c.status === 'Approved') m.approved += c.claimAmount; } }
  return {
    totalClaims: claims.length, totalAmount: claims.reduce((s, c) => s + c.claimAmount, 0), approvedAmount: approved.reduce((s, c) => s + c.claimAmount, 0), approved: approved.length,
    pending: claims.filter(c => c.status === 'Pending').length, rejected: claims.filter(c => c.status === 'Rejected').length,
    approvalRate: claims.length ? Math.round(approved.length / claims.length * 100) : 0,
    statusDistribution: ['Approved', 'Pending', 'Rejected'].map(name => ({ name, value: claims.filter(c => c.status === name).length })),
    genderDistribution: ['Male', 'Female', 'Other'].map(name => ({ name, value: claims.filter(c => c.gender === name).length })),
    amountByPatient: [...new Set(claims.map(c => c.patientName))].map(name => ({ name, amount: claims.filter(c => c.patientName === name).reduce((s, c) => s + c.claimAmount, 0) })),
    ageTrend: ['0–20', '21–35', '36–50', '51–65', '66+'].map((name, i) => ({ name, ageGroup: name, claims: claims.filter(c => c.age >= [0, 21, 36, 51, 66][i] && c.age <= [20, 35, 50, 65, 150][i]).length })),
    monthlyTrend: months,
  };
}

export function createApp({ store, jwtSecret, uploadDir, clientOrigin = 'http://localhost:5173', demoPayments = true, razorpayKeyId = '', razorpayKeySecret = '', webhookSecret = '', staticDir, logger = console, gatewayFetch = fetch } = {}) {
  if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: clientOrigin, credentials: false }));
  app.use(rateLimit({ windowMs: 60000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }));
  const hasGateway = Boolean(razorpayKeyId && razorpayKeySecret);
  const paymentMode = hasGateway ? razorpayKeyId.startsWith('rzp_live_') ? 'live' : 'test' : demoPayments ? 'demo' : 'disabled';

  async function gateway(resource, { method = 'GET', body } = {}) {
    if (!hasGateway) fail(503, 'Payment gateway is not configured.');
    let response;
    try { response = await gatewayFetch(`https://api.razorpay.com/v1/${resource}`, { method, headers: { Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) }); }
    catch { fail(502, 'Payment gateway is unavailable. Please try again.'); }
    let data;
    try { data = await response.json(); } catch { fail(502, 'Payment gateway returned an invalid response. Please try again.'); }
    if (!response.ok) fail(502, 'Payment gateway could not complete this request.');
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(502, 'Payment gateway returned an invalid response. Please try again.');
    return data;
  }
  const paymentSafe = p => { const { gatewayData, ...result } = p; return { ...result, paymentMode: p.paymentMode || (p.provider === 'demo' ? 'demo' : 'unknown') }; };
  const orderSafe = order => { const { gatewayKeyId, ...result } = order; return { ...result, order_id: order.gatewayOrderId || order.id, paymentMode: order.paymentMode || (order.provider === 'demo' ? 'demo' : 'unknown') }; };
  const matchesCapture = (payment, order) => payment?.status === 'captured' && typeof payment.id === 'string' && payment.id.startsWith('pay_') && payment.order_id === order.gatewayOrderId && payment.amount === order.amount && payment.currency === order.currency;
  function checkGatewayConfig(order) {
    if (order.gatewayKeyId && order.gatewayKeyId !== razorpayKeyId) fail(409, 'This checkout belongs to an earlier payment configuration. Contact support to check its status.');
  }
  function settleState(state, orderId, gatewayPaymentId, method) {
      const order = state.orders.find(x => x.id === orderId);
      if (!order) fail(404, 'Payment order not found.');
      const policy = state.policies.find(p => p.id === order.policyId);
      const existing = state.payments.find(p => p.orderId === order.id);
      if (existing) return { payment: paymentSafe(existing), policy };
      if (state.payments.some(p => p.policyId === policy.id && p.billingPeriod === order.billingPeriod)) fail(409, 'This policy premium has already been paid.');
      const payment = { id: id('payment'), receiptId: `RCT-${Date.now()}-${randomUUID().slice(0, 4)}`, orderId: order.id, gatewayPaymentId, policyId: policy.id, policyName: policy.name, patientId: order.patientId, amount: order.amount / 100, currency: 'INR', status: 'Paid', method, billingPeriod: order.billingPeriod, provider: order.provider, paymentMode: order.paymentMode || (order.provider === 'demo' ? 'demo' : 'unknown'), createdAt: now() };
      state.payments.push(payment);
      order.status = 'Paid'; order.paidAt = now();
      policy.paidPeriods = [...new Set([...(policy.paidPeriods || []), order.billingPeriod])];
      const nextDue = new Date(`${order.billingPeriod}-01T00:00:00Z`); nextDue.setUTCFullYear(nextDue.getUTCFullYear() + 1);
      policy.nextDueDate = nextDue.toISOString().slice(0, 10); policy.billingPeriod = policy.nextDueDate.slice(0, 7);
      audit(state, state.users.find(u => u.id === order.patientId) || { id: order.patientId, name: 'Policyholder' }, 'PAYMENT_COMPLETED', payment.id, `${order.provider} payment confirmed for ${policy.policyNumber}.`);
      return { payment, policy };
  }
  const settle = (orderId, gatewayPaymentId, method) => store.mutate(state => settleState(state, orderId, gatewayPaymentId, method));
  async function gatewayAttempts(order) {
    checkGatewayConfig(order);
    const result = await gateway(`orders/${encodeURIComponent(order.gatewayOrderId)}/payments`);
    if (!Array.isArray(result.items) || result.items.some(p => !p || typeof p !== 'object')) fail(502, 'Payment gateway returned an invalid status response. Please try again.');
    return result.items;
  }

  app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!webhookSecret) fail(503, 'Webhook is not configured.');
    const received = req.get('x-razorpay-signature') || '';
    const expected = createHmac('sha256', webhookSecret).update(req.body).digest('hex');
    if (!/^[a-f0-9]{64}$/i.test(received) || !timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'))) fail(400, 'Invalid webhook signature.');
    let payload; try { payload = JSON.parse(req.body.toString('utf8')); } catch { fail(400, 'Invalid webhook JSON.'); }
    const entity = payload.payload?.payment?.entity;
    if (payload.event === 'payment.captured' && entity?.order_id) {
      const order = store.read().orders.find(o => o.gatewayOrderId === entity.order_id);
      if (order?.provider === 'razorpay' && matchesCapture(entity, order)) await settle(order.id, entity.id, entity.method || 'Razorpay');
    }
    res.json({ received: true });
  });
  app.use(express.json({ limit: '200kb' }));
  app.use((req, _res, next) => { req.body ||= {}; next(); });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: store.mode, payments: hasGateway ? 'razorpay' : demoPayments ? 'demo' : 'disabled', paymentMode }));
  const authLimiter = rateLimit({ windowMs: 15 * 60000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false });
  function token(user) { return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '8h', issuer: 'careclaim', audience: 'careclaim-web', algorithm: 'HS256' }); }
  const resets = new Map();
  app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    const email = text(req.body.email, 'Email', 3, 254).toLowerCase();
    if (!process.env.RESET_EMAIL_WEBHOOK_URL) fail(503, 'Password recovery email delivery is not configured. Please contact support.');
    const user = store.read().users.find(u => u.email === email);
    if (user) {
      const code = randomUUID() + randomUUID();
      resets.set(code, { userId: user.id, expires: Date.now() + 15 * 60000 });
      const url = new URL(clientOrigin); url.searchParams.set('reset', code);
      try {
        const response = await fetch(process.env.RESET_EMAIL_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESET_EMAIL_WEBHOOK_SECRET || ''}` }, body: JSON.stringify({ email, resetUrl: url.href, expiresInMinutes: 15 }), signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Delivery failed');
      } catch { resets.delete(code); fail(503, 'Email delivery is unavailable. Please try again later.'); }
    }
    for (const [key, value] of resets) if (value.expires < Date.now()) resets.delete(key);
    res.json({ message: 'If an account exists, a recovery link has been sent.' });
  });
  app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    const code = text(req.body.token, 'Recovery token', 1, 200);
    const password = text(req.body.password, 'Password', 10, 128);
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || Buffer.byteLength(password, 'utf8') > 72) fail(400, 'Use uppercase, lowercase, a number, and at most 72 UTF-8 bytes.');
    const entry = resets.get(code);
    if (!entry || entry.expires < Date.now()) fail(400, 'Recovery link is invalid or expired. Request another link.');
    resets.delete(code);
    const passwordHash = await bcrypt.hash(password, 12);
    await store.mutate(state => { const user = state.users.find(u => u.id === entry.userId); if (!user) fail(400, 'Account unavailable.'); user.passwordHash = passwordHash; });
    res.json({ message: 'Password updated. You can now sign in.' });
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const email = text(req.body.email, 'Email', 3, 254).toLowerCase();
    const password = text(req.body.password, 'Password', 1, 128);
    const user = store.read().users.find(u => u.email === email);
    if (!user || !await bcrypt.compare(password, user.passwordHash)) fail(401, 'Email or password is incorrect.');
    res.json({ token: token(user), user: cleanUser(user) });
  });
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const name = text(req.body.name, 'Name', 2, 80), email = text(req.body.email, 'Email', 5, 254).toLowerCase(), password = text(req.body.password, 'Password', 10, 128);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email.');
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || Buffer.byteLength(password, 'utf8') > 72) fail(400, 'Password needs uppercase, lowercase, a number, and at most 72 UTF-8 bytes.');
    if (req.body.role && req.body.role !== 'patient') fail(403, 'Staff accounts must be provisioned by an administrator.');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await store.mutate(state => { if (state.users.some(u => u.email === email)) fail(409, 'An account with this email already exists.'); const u = { id: id('user'), name, email, role: 'patient', phone: req.body.phone ? text(req.body.phone, 'Phone', 7, 20) : '', passwordHash, createdAt: now() }; state.users.push(u); audit(state, u, 'USER_REGISTERED', u.id, 'Patient account created.'); return u; });
    res.status(201).json({ token: token(user), user: cleanUser(user) });
  });
  app.use('/api', (req, _res, next) => {
    const header = req.get('authorization') || '';
    try {
      if (!header.startsWith('Bearer ')) fail(401, 'Sign in to continue.');
      const payload = jwt.verify(header.slice(7), jwtSecret, { algorithms: ['HS256'], issuer: 'careclaim', audience: 'careclaim-web' });
      req.user = store.read().users.find(u => u.id === payload.sub);
      if (!req.user) fail(401, 'Account not found.');
    } catch { return next(Object.assign(new Error('Your session has expired. Please sign in again.'), { status: 401 })); }
    next();
  });
  app.get('/api/auth/me', (req, res) => res.json({ user: cleanUser(req.user) }));
  app.put('/api/auth/profile', async (req, res) => {
    const name = text(req.body.name, 'Name', 2, 80), phone = req.body.phone ? text(req.body.phone, 'Phone', 7, 20) : '';
    const user = await store.mutate(state => { const u = state.users.find(u => u.id === req.user.id); u.name = name; u.phone = phone; audit(state, u, 'PROFILE_UPDATED', u.id, 'Contact details updated.'); return u; });
    res.json({ user: cleanUser(user) });
  });
  const getClaim = (req, state) => { const claim = state.claims.find(c => c.id === req.params.id || c.claimId === req.params.id); if (!claim || !visible(req.user, claim)) fail(404, 'Claim not found.'); return claim; };
  app.get('/api/claims/stats', (req, res) => res.json({ stats: buildStats(store.read().claims.filter(c => visible(req.user, c))) }));
  app.get('/api/claims', (req, res) => {
    let claims = store.read().claims.filter(c => visible(req.user, c));
    if (req.query.status) claims = claims.filter(c => c.status === req.query.status);
    if (req.query.search) { const q = String(req.query.search).slice(0, 200).toLowerCase(); claims = claims.filter(c => `${c.patientName} ${c.claimId} ${c.disease} ${c.hospital}`.toLowerCase().includes(q)); }
    res.json({ claims: claims.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  });
  app.get('/api/claims/:id', (req, res) => res.json({ claim: getClaim(req, store.read()) }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 20, fieldSize: 10000 } });
  function checkedFiles(files = []) {
    return files.map(file => {
      const b = file.buffer;
      const pdf = b.subarray(0, 5).toString() === '%PDF-';
      const png = b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpg = b[0] === 255 && b[1] === 216 && b[2] === 255;
      if (!pdf && !png && !jpg) fail(400, 'Only valid PDF, PNG, and JPEG files are accepted.');
      const name = path.basename(file.originalname).replace(/[\x00-\x1f]/g, '').slice(0, 180);
      return { ...file, safeName: name || 'document', safeMime: pdf ? 'application/pdf' : png ? 'image/png' : 'image/jpeg' };
    });
  }
  async function saveFiles(state, claim, files, written) {
    if (claim.documents.length + files.length > 10) fail(400, 'A claim can have at most 10 documents.');
    await mkdir(uploadDir, { recursive: true });
    for (const file of files) {
      const documentId = id('document'), filePath = path.join(uploadDir, documentId);
      await writeFile(filePath, file.buffer, { mode: 0o600 }); written.push(filePath);
      const document = { id: documentId, claimId: claim.id, name: file.safeName, size: file.size, mime: file.safeMime, path: filePath, createdAt: now() };
      state.documents.push(document); const { path: ignored, claimId, ...publicDocument } = document; claim.documents.push(publicDocument);
    }
  }
  function claimFields(body) {
    const fields = { policyNumber: text(body.policyNumber, 'Policy number', 3, 80), age: finite(body.age, 'Age', 0, 120), gender: text(body.gender, 'Gender', 1, 20), claimAmount: finite(body.claimAmount, 'Claim amount', 1, 100000000), disease: text(body.disease, 'Treatment', 2, 200), hospital: text(body.hospital, 'Hospital', 2, 200), admissionDate: date(body.admissionDate, 'Admission date'), dischargeDate: date(body.dischargeDate, 'Discharge date'), previousClaimHistory: body.previousClaimHistory ? text(body.previousClaimHistory, 'Previous claim history', 1, 2000) : '' };
    if (!Number.isInteger(fields.age) || !['Male', 'Female', 'Other'].includes(fields.gender)) fail(400, 'Choose a valid age and gender.');
    if (fields.admissionDate > fields.dischargeDate || fields.dischargeDate > now().slice(0, 10)) fail(400, 'Treatment dates must be chronological and cannot be in the future.');
    return fields;
  }
  app.post('/api/claims', upload.array('documents', 5), async (req, res) => {
    if (!['patient', 'hospital', 'admin'].includes(req.user.role)) fail(403, 'This role cannot submit claims.');
    const fields = claimFields(req.body), files = checkedFiles(req.files), written = [];
    let claim;
    try {
      claim = await store.mutate(async state => {
        const policy = state.policies.find(p => p.policyNumber === fields.policyNumber && (req.user.role !== 'patient' || p.patientId === req.user.id));
        if (!policy) fail(400, 'Select a policy assigned to the patient.');
        if (policy.status !== 'Active' || fields.admissionDate < policy.startDate || fields.admissionDate > policy.endDate) fail(400, 'This treatment is outside the active policy period.');
        if (fields.claimAmount > policy.coverageAmount) fail(400, 'Claim amount exceeds policy coverage.');
        const c = { ...fields, id: id('claim'), claimId: `CLM-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`, patientId: policy.patientId, patientName: state.users.find(u => u.id === policy.patientId)?.name || policy.patientName, status: 'Pending', remarks: '', documents: [], timeline: [{ status: 'Submitted', note: 'Claim submitted successfully.', at: now() }, { status: 'Pending', note: 'Awaiting review by a claim officer.', at: now() }], submittedBy: req.user.id, createdAt: now(), updatedAt: now() };
        await saveFiles(state, c, files, written); state.claims.push(c); audit(state, req.user, 'CLAIM_SUBMITTED', c.id, `${c.claimId} submitted.`); return c;
      });
    } catch (error) { await Promise.all(written.map(f => unlink(f).catch(() => {}))); throw error; }
    res.status(201).json({ claim });
  });
  app.put('/api/claims/:id', async (req, res) => {
    const claim = await store.mutate(state => {
      const c = getClaim(req, state);
      if (req.body.status !== undefined) {
        if (!reviewer(req.user)) fail(403, 'Only claim officers and administrators can change claim status.');
        if (!['Approved', 'Rejected'].includes(req.body.status)) fail(400, 'Choose Approved or Rejected.');
        if (c.status !== 'Pending') fail(409, 'This claim has already been reviewed.');
        const remarks = text(req.body.remarks, 'Review remarks', 5, 2000);
        const policy = state.policies.find(p => p.policyNumber === c.policyNumber);
        if (req.body.status === 'Approved') {
          if (!policy || c.claimAmount + policy.usedAmount > policy.coverageAmount) fail(409, 'Approval would exceed the available policy coverage.');
          policy.usedAmount += c.claimAmount;
        }
        c.status = req.body.status; c.remarks = remarks; c.timeline.push({ status: c.status, note: remarks, at: now() });
        audit(state, req.user, `CLAIM_${c.status.toUpperCase()}`, c.id, remarks);
      } else {
        if (c.status !== 'Pending' || !(c.patientId === req.user.id || req.user.role === 'hospital' && c.submittedBy === req.user.id || req.user.role === 'admin')) fail(403, 'Only the submitter can edit a pending claim.');
        const fields = claimFields({ ...c, ...req.body });
        if (fields.policyNumber !== c.policyNumber) fail(400, 'The policy cannot be changed after submission.');
        const policy = state.policies.find(p => p.policyNumber === c.policyNumber);
        if (fields.claimAmount > policy.coverageAmount || fields.admissionDate < policy.startDate || fields.admissionDate > policy.endDate) fail(400, 'Claim is outside the policy coverage.');
        Object.assign(c, fields); audit(state, req.user, 'CLAIM_UPDATED', c.id, 'Pending claim details updated.');
      }
      c.updatedBy = req.user.id; c.updatedAt = now(); return c;
    });
    res.json({ claim });
  });
  app.post('/api/claims/:id/documents', upload.array('documents', 5), async (req, res) => {
    const files = checkedFiles(req.files), written = [];
    if (!files.length) fail(400, 'Select at least one document.');
    try {
      const claim = await store.mutate(async state => { const c = getClaim(req, state); if (c.status !== 'Pending' || !(c.patientId === req.user.id || req.user.role === 'hospital' && c.submittedBy === req.user.id || req.user.role === 'admin')) fail(403, 'Documents can only be added by the submitter while a claim is pending.'); await saveFiles(state, c, files, written); c.updatedAt = now(); audit(state, req.user, 'DOCUMENT_UPLOADED', c.id, `${files.length} supporting document(s) added.`); return c; });
      res.status(201).json({ claim });
    } catch (error) { await Promise.all(written.map(f => unlink(f).catch(() => {}))); throw error; }
  });
  app.get('/api/documents/:id', (req, res, next) => {
    const state = store.read(), doc = state.documents.find(d => d.id === req.params.id), claim = state.claims.find(c => c.id === doc?.claimId);
    if (!doc || !claim || !visible(req.user, claim)) fail(404, 'Document not found.');
    res.type(doc.mime); res.setHeader('X-Content-Type-Options', 'nosniff'); res.download(doc.path, doc.name, error => { if (error) next(error); });
  });
  app.get('/api/policies', (req, res) => res.json({ policies: store.read().policies.filter(p => visible(req.user, p)), importOptions: policyImportOptions(req.user, store.mode) }));
  app.post('/api/policies/import', async (req, res) => {
    const source = req.body.source === 'sample' ? 'sample' : 'csv';
    if (req.body.source !== undefined && !['sample', 'csv'].includes(req.body.source)) fail(400, 'Choose sample policies or a CSV policy import.');
    const options = policyImportOptions(req.user, store.mode);
    if (!options[source]) fail(403, source === 'sample' ? 'Sample policies are available only to members in the demonstration workspace.' : 'An administrator must import and assign policies in a connected workspace.');
    const rows = source === 'sample' ? samplePolicyInputs(req.user.id) : req.body.policies;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) fail(400, 'Import between 1 and 100 policy records at a time.');
    const normalized = rows.map((row, index) => {
      try { return validatePolicyInput(row); }
      catch (error) { fail(400, `Row ${index + 1}: ${error.message}`); }
    });
    const result = await store.mutate(state => {
      if (source === 'sample') {
        const existingSamples = state.policies.filter(policy => policy.patientId === req.user.id && policy.source === 'sample');
        if (existingSamples.length) return { policies: existingSamples, importedCount: 0, source };
      }
      const numbers = new Set(state.policies.map(policy => policy.policyNumber.toLowerCase()));
      const imported = normalized.map((row, index) => {
        const key = row.policyNumber.toLowerCase();
        if (numbers.has(key)) fail(409, `Row ${index + 1}: Policy number ${row.policyNumber} already exists. No policies were imported.`);
        numbers.add(key);
        let patient;
        if (req.user.role === 'admin') {
          if (!row.patientEmail) fail(400, `Row ${index + 1}: Patient email is required when an administrator imports policies.`);
          patient = state.users.find(user => user.role === 'patient' && user.email.toLowerCase() === row.patientEmail);
          if (!patient) fail(400, `Row ${index + 1}: No registered patient has the supplied email. No policies were imported.`);
        } else {
          if (row.patientEmail && row.patientEmail !== req.user.email.toLowerCase()) fail(403, `Row ${index + 1}: You can import policies only for your own account.`);
          patient = state.users.find(user => user.id === req.user.id && user.role === 'patient');
          if (!patient) fail(404, 'The policyholder account was not found.');
        }
        const { patientEmail, ...fields } = row;
        return { ...fields, id: id('policy'), patientId: patient.id, patientName: patient.name, usedAmount: 0, status: 'Active', billingPeriod: row.nextDueDate.slice(0, 7), paidPeriods: [], source, sample: store.mode === 'demo', createdAt: now() };
      });
      state.policies.push(...imported);
      for (const policy of imported) audit(state, req.user, 'POLICY_IMPORTED', policy.id, `${source === 'sample' ? 'Sample policy' : 'Policy'} ${policy.policyNumber} assigned to ${policy.patientName}.`);
      return { policies: imported, importedCount: imported.length, source };
    });
    res.status(result.importedCount ? 201 : 200).json(result);
  });
  app.get('/api/payments', (req, res) => res.json({ payments: store.read().payments.filter(p => reviewer(req.user) || p.patientId === req.user.id).map(paymentSafe).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
  app.get('/api/payments/orders/:id', async (req, res) => {
    const state = store.read(), order = state.orders.find(o => o.id === req.params.id && o.patientId === req.user.id);
    if (!order) fail(404, 'Payment order not found.');
    const existing = state.payments.find(p => p.orderId === order.id);
    const result = { order: orderSafe(order), paymentMode: orderSafe(order).paymentMode, status: 'pending', payment: null, policy: null };
    if (existing) return res.json({ ...result, status: 'paid', payment: paymentSafe(existing), policy: state.policies.find(p => p.id === order.policyId) });
    if (order.provider === 'razorpay') {
      const attempts = await gatewayAttempts(order);
      const captured = attempts.find(p => matchesCapture(p, order));
      if (captured) {
        const settled = await settle(order.id, captured.id, captured.method || 'Razorpay');
        return res.json({ ...result, ...settled, order: orderSafe(store.read().orders.find(o => o.id === order.id)), status: 'paid' });
      }
      const matching = attempts.filter(p => p.order_id === order.gatewayOrderId && p.amount === order.amount && p.currency === order.currency);
      if (matching.some(p => p.status === 'authorized')) result.status = 'awaiting_capture';
      else if (matching.length && matching.every(p => p.status === 'failed')) result.status = 'failed';
    }
    if (result.status !== 'awaiting_capture' && Date.parse(order.expiresAt) <= Date.now()) result.status = 'expired';
    res.json(result);
  });
  app.post('/api/payments/order', async (req, res) => {
    if (req.user.role !== 'patient') fail(403, 'Only a policyholder can pay a premium.');
    const policyId = text(req.body.policyId, 'Policy', 1, 100);
    if (!hasGateway && !demoPayments) fail(503, 'Payments are not configured.');
    const result = await store.mutate(async state => {
      const policy = state.policies.find(p => p.id === policyId && p.patientId === req.user.id);
      if (!policy || policy.status !== 'Active') fail(404, 'Active policy not found.');
      if (policy.sample && paymentMode === 'live') fail(409, 'Sample policies can use only sandbox or Razorpay test payments.');
      const billingPeriod = policy.billingPeriod || policy.nextDueDate.slice(0, 7);
      if (`${billingPeriod}-01` > policy.endDate) fail(409, 'This policy term is fully paid. Contact the insurer to renew the policy.');
      const dueDate = new Date(`${billingPeriod}-01T00:00:00Z`);
      if (dueDate.getTime() > Date.now() + 90 * 86400000) fail(409, 'Your premium is paid. The next premium is not due yet.');
      if (state.payments.some(p => p.policyId === policy.id && p.billingPeriod === billingPeriod)) fail(409, 'This premium has already been paid.');
      const outstanding = state.orders.filter(o => o.policyId === policy.id && o.billingPeriod === billingPeriod && o.status === 'Created');
      const gatewayOrders = outstanding.filter(o => o.provider === 'razorpay' && (!o.paymentMode || o.paymentMode === 'unknown' || o.paymentMode === paymentMode || o.paymentMode === 'live'));
      let reusable;
      // A local checkout timeout does not cancel a Razorpay order or prevent late authorisation.
      // Reconcile every outstanding order, and reuse its gateway ID rather than create a second chargeable order.
      for (const previous of gatewayOrders) {
        const attempts = await gatewayAttempts(previous);
        const captured = attempts.find(p => matchesCapture(p, previous));
        if (captured) return { settled: settleState(state, previous.id, captured.id, captured.method || 'Razorpay') };
        if (attempts.some(p => p.order_id === previous.gatewayOrderId && p.status === 'authorized')) fail(409, 'A previous payment is awaiting capture. Refresh its status before trying again.');
        reusable ||= previous;
      }
      if (reusable) {
        reusable.expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
        return { order: reusable };
      }
      const existing = outstanding.find(o => o.provider === 'demo' && !hasGateway && Date.parse(o.expiresAt) > Date.now());
      if (existing) return { order: existing };
      const o = { id: id('order'), patientId: req.user.id, policyId, amount: Math.round(policy.premiumAmount * 100), currency: 'INR', provider: hasGateway ? 'razorpay' : 'demo', paymentMode, status: 'Created', billingPeriod, createdAt: now(), expiresAt: new Date(Date.now() + 30 * 60000).toISOString() };
      if (hasGateway) { const gatewayOrder = await gateway('orders', { method: 'POST', body: { amount: o.amount, currency: o.currency, receipt: o.id.slice(0, 40), notes: { policyId, billingPeriod } } }); if (typeof gatewayOrder.id !== 'string' || !gatewayOrder.id.startsWith('order_')) fail(502, 'Payment gateway returned an invalid order. Please try again.'); o.gatewayOrderId = gatewayOrder.id; o.gatewayKeyId = razorpayKeyId; }
      state.orders.push(o); return { order: o };
    });
    if (result.settled) return res.status(409).json({ message: 'Your previous payment has been confirmed. Refresh your transaction history to view the receipt.', ...result.settled });
    const { order } = result;
    res.status(201).json({ order: orderSafe(order), provider: order.provider, paymentMode: order.paymentMode, ...(hasGateway ? { keyId: razorpayKeyId } : {}) });
  });
  app.post('/api/payments/verify', async (req, res) => {
    const orderId = text(req.body.orderId, 'Order', 1, 100), state = store.read();
    const order = state.orders.find(o => o.id === orderId && o.patientId === req.user.id);
    if (!order) fail(404, 'Payment order not found.');
    const existing = state.payments.find(p => p.orderId === order.id);
    if (existing) return res.json({ payment: paymentSafe(existing), policy: state.policies.find(p => p.id === order.policyId) });
    let gatewayPaymentId = `demo_${randomUUID()}`, method = 'Sandbox';
    if (order.provider === 'razorpay') {
      checkGatewayConfig(order);
      gatewayPaymentId = text(req.body.razorpay_payment_id, 'Payment ID', 5, 100);
      const received = text(req.body.razorpay_signature, 'Payment signature', 64, 64);
      const expected = createHmac('sha256', razorpayKeySecret).update(`${order.gatewayOrderId}|${gatewayPaymentId}`).digest('hex');
      if (!/^[a-f0-9]{64}$/i.test(received) || !timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'))) fail(400, 'Payment verification failed.');
      const captured = await gateway(`payments/${encodeURIComponent(gatewayPaymentId)}`);
      if (!matchesCapture(captured, order) || captured.id !== gatewayPaymentId) fail(409, 'Payment is awaiting capture or could not be matched. Refresh its status before trying again.');
      method = captured.method || 'Razorpay';
    } else {
      if (!demoPayments) fail(503, 'Sandbox payments are disabled.');
      if (hasGateway) fail(409, 'This sandbox checkout is no longer active. Please start a new payment.');
      if (Date.parse(order.expiresAt) <= Date.now()) fail(409, 'Checkout has expired. Please start a new payment.');
    }
    res.json(await settle(order.id, gatewayPaymentId, method));
  });
  app.get('/api/audit', (req, res) => { if (!reviewer(req.user)) fail(403, 'Audit records are available to officers and administrators.'); res.json({ logs: store.read().logs.slice().reverse().slice(0, 500) }); });
  app.use('/api', (_req, _res) => fail(404, 'API route not found.'));
  if (staticDir) { app.use(express.static(staticDir)); app.get('/{*path}', (_req, res) => res.sendFile(path.join(staticDir, 'index.html'))); }
  app.use((error, _req, res, _next) => {
    const status = error instanceof multer.MulterError ? 400 : error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
    if (status === 500) logger.error(error);
    if (!res.headersSent) res.status(status).json({ message: status === 500 ? 'An unexpected server error occurred.' : error instanceof multer.MulterError ? 'Uploads must contain at most 5 files, each up to 5 MB.' : error.message });
  });
  return app;
}
