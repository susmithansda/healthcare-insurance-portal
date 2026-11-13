// The published static Site is an explicitly labelled, synthetic-data preview.
// A reachable Express API is always preferred and never silently bypassed.
import { policyImportOptions, samplePolicyInputs, validatePolicyInput } from '../../shared/policy-import.js';
const CONFIGURED_API = import.meta.env.VITE_API_URL;
const API_BASE = (CONFIGURED_API || '/api').replace(/\/$/, '');
const STATE_KEY = 'careclaim.preview.v1';
const SESSION_KEY = 'careclaim.session.v1';
let mode;
let initialization;
let memoryState;
let session = readStorage(SESSION_KEY, null);

function readStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Session memory remains usable when storage is blocked. */ }
}
function fail(message) { throw new Error(message); }
function uid(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function dateNow() { return new Date().toISOString(); }
function publicUser(user) { const { password, ...safe } = user; return safe; }
const privileged = user => ['officer', 'admin'].includes(user.role);

function seedState() {
  const users = [
    { id: 'user-patient', name: 'Aarav Sharma', email: 'patient@careclaim.demo', role: 'patient', phone: '9876543210' },
    { id: 'user-hospital', name: 'Dr. Meera Kapoor', email: 'hospital@careclaim.demo', role: 'hospital', phone: '9876543211' },
    { id: 'user-officer', name: 'Priya Nair', email: 'officer@careclaim.demo', role: 'officer', phone: '9876543212' },
    { id: 'user-admin', name: 'Arjun Mehta', email: 'admin@careclaim.demo', role: 'admin', phone: '9876543213' },
    { id: 'patient-2', name: 'Ananya Patel', email: 'ananya@example.test', role: 'patient', phone: '9876543214' },
    { id: 'patient-3', name: 'Rohan Das', email: 'rohan@example.test', role: 'patient', phone: '9876543215' },
    { id: 'patient-4', name: 'Ishita Sen', email: 'ishita@example.test', role: 'patient', phone: '9876543216' },
  ].map(user => ({ ...user, password: 'Demo@12345', createdAt: '2026-05-01T09:00:00.000Z' }));
  const policies = [
    { id: 'policy-1', policyNumber: 'CC-2026-1001', name: 'Care Plus Family', patientId: 'user-patient', patientName: 'Aarav Sharma', coverageAmount: 500000, usedAmount: 84500, premiumAmount: 12499, startDate: '2026-01-01', endDate: '2027-01-01', status: 'Active', nextDueDate: '2026-11-18' },
    { id: 'policy-2', policyNumber: 'CC-2026-1002', name: 'Care Essential', patientId: 'patient-2', patientName: 'Ananya Patel', coverageAmount: 300000, usedAmount: 42000, premiumAmount: 8499, startDate: '2026-03-01', endDate: '2027-03-01', status: 'Active', nextDueDate: '2026-12-01' },
    { id: 'policy-3', policyNumber: 'CC-2026-1003', name: 'Care Plus Individual', patientId: 'patient-3', patientName: 'Rohan Das', coverageAmount: 500000, usedAmount: 65000, premiumAmount: 10999, startDate: '2026-02-01', endDate: '2027-02-01', status: 'Active', nextDueDate: '2026-12-12' },
    { id: 'policy-4', policyNumber: 'CC-2026-1004', name: 'Care Complete', patientId: 'patient-4', patientName: 'Ishita Sen', coverageAmount: 1000000, usedAmount: 120000, premiumAmount: 18999, startDate: '2026-04-01', endDate: '2027-04-01', status: 'Active', nextDueDate: '2026-12-24' },
  ];
  const rows = [
    [0, 62500, 'Knee arthroscopy', 'Apollo Hospital, Bengaluru', 'Approved', '2026-11-06', 32, 'Male'],
    [0, 28000, 'Day-care procedure', 'Manipal Hospital, Bengaluru', 'Pending', '2026-11-10', 32, 'Male'],
    [0, 22000, 'Diagnostic evaluation', 'Fortis Hospital, Bengaluru', 'Approved', '2026-08-18', 32, 'Male'],
    [0, 8500, 'Outpatient consultation', 'Apollo Clinic, Bengaluru', 'Rejected', '2026-07-12', 32, 'Male'],
    [1, 42000, 'Gallbladder surgery', 'Fortis Hospital, Mumbai', 'Approved', '2026-10-28', 29, 'Female'],
    [1, 18500, 'Respiratory infection', 'Lilavati Hospital, Mumbai', 'Pending', '2026-11-09', 29, 'Female'],
    [2, 65000, 'Fracture repair', 'AMRI Hospital, Kolkata', 'Approved', '2026-09-14', 45, 'Male'],
    [2, 24000, 'Renal assessment', 'Apollo Hospital, Kolkata', 'Pending', '2026-11-08', 45, 'Male'],
    [3, 120000, 'Cardiac procedure', 'Medica Hospital, Kolkata', 'Approved', '2026-08-21', 57, 'Female'],
    [3, 15000, 'Physiotherapy', 'Woodlands Hospital, Kolkata', 'Rejected', '2026-06-16', 57, 'Female'],
    [1, 36000, 'Appendectomy', 'Kokilaben Hospital, Mumbai', 'Approved', '2026-05-12', 29, 'Female'],
    [2, 12500, 'Diagnostic imaging', 'AMRI Hospital, Kolkata', 'Approved', '2026-06-25', 45, 'Male'],
  ];
  const claims = rows.map(([patientIndex, amount, disease, hospital, status, submitted, age, gender], index) => {
    const policy = policies[patientIndex];
    const at = `${submitted}T09:30:00.000Z`;
    const timeline = [{ status: 'Submitted', note: 'Claim and supporting documents received.', at }, { status: 'Pending', note: 'Your claim is in the review queue.', at }];
    const remarks = status === 'Rejected' ? 'The submitted service is outside this sample policy’s coverage. Contact your claims officer for clarification.' : status === 'Approved' ? 'Documents verified and claim approved.' : 'Your documents are being reviewed.';
    if (status !== 'Pending') timeline.push({ status, note: remarks, at: new Date(Date.parse(at) + 2 * 86400000).toISOString() });
    return { id: `claim-${index + 1}`, claimId: `CC-${2026}-${String(1048 - index).padStart(4, '0')}`, patientId: policy.patientId, patientName: policy.patientName, policyNumber: policy.policyNumber, claimAmount: amount, disease, hospital, admissionDate: submitted, dischargeDate: submitted, age, gender, status, remarks, documents: [], timeline, createdAt: at, updatedAt: timeline.at(-1).at, submittedBy: patientIndex === 0 ? 'user-patient' : 'user-hospital' };
  });
  policies.forEach(policy => { policy.usedAmount = claims.filter(claim => claim.policyNumber === policy.policyNumber && claim.status === 'Approved').reduce((sum, claim) => sum + claim.claimAmount, 0); });
  return { version: 1, users, policies, claims, payments: [{ id: 'payment-seed', receiptId: 'RCPT-2026-001', policyId: 'policy-1', policyName: 'Care Plus Family', patientId: 'user-patient', amount: 12499, status: 'Paid', method: 'Demo payment', provider: 'demo', currency: 'INR', billingPeriod: '2026-10', createdAt: '2026-10-18T10:30:00.000Z', orderId: 'order-seed' }], orders: [], logs: [{ id: 'audit-seed', action: 'Sample workspace initialized', actorName: 'CareClaim', at: '2026-11-01T09:00:00.000Z' }] };
}

function state() {
  if (!memoryState) {
    memoryState = readStorage(STATE_KEY, null) || seedState();
    // Migrate saved previews without changing their sample records or uploads.
    for (const policy of memoryState.policies) {
      policy.billingPeriod ||= policy.nextDueDate.slice(0, 7);
      policy.paidPeriods ||= [];
    }
    for (const order of memoryState.orders) {
      order.billingPeriod ||= memoryState.policies.find(policy => policy.id === order.policyId)?.billingPeriod;
    }
  }
  return memoryState;
}
function save() { writeStorage(STATE_KEY, state()); }
function actor() {
  if (!session || session.mode !== 'preview') return fail('Please sign in to continue.');
  return state().users.find(user => user.id === session.userId) || fail('Your session has expired. Please sign in again.');
}
function allowedClaim(user, claim) { return user.role !== 'patient' || claim.patientId === user.id; }
function canEdit(user, claim) { return user.role === 'admin' || claim.patientId === user.id || (user.role === 'hospital' && claim.submittedBy === user.id); }
function getClaim(id) {
  const claim = state().claims.find(record => record.id === id || record.claimId === id);
  if (!claim || !allowedClaim(actor(), claim)) fail('Claim not found or access is not permitted.');
  return claim;
}
function log(action, targetId) {
  state().logs.unshift({ id: uid('audit'), action, targetId, actorId: actor().id, actorName: actor().name, at: dateNow() });
}
function setSession(value) { session = value; writeStorage(SESSION_KEY, value); }

async function init() {
  if (!initialization) initialization = (async () => {
    try {
      const response = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000), headers: { Accept: 'application/json' } });
      const health = response.ok ? await response.json() : null;
      if (!health || !['demo', 'mongodb'].includes(health.mode)) throw new Error('No API');
      mode = health.mode;
    } catch {
      // An explicitly configured service must never be replaced by sample data.
      if (CONFIGURED_API) {
        initialization = undefined;
        fail('Unable to reach the configured API. Check the server address and connection, then try again.');
      }
      mode = 'preview';
    }
    if (session && ((mode === 'preview') !== (session.mode === 'preview'))) setSession(null);
    return { mode };
  })();
  return initialization;
}
async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined });
  const body = await response.json().catch(() => ({ message: 'The server returned an unexpected response.' }));
  if (!response.ok) {
    if (response.status === 401) setSession(null);
    fail(body.message || 'Unable to complete this request.');
  }
  return body;
}

async function documentDatabase() {
  if (!globalThis.indexedDB) fail('Document storage is unavailable in this browser.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('careclaim-preview-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Unable to open document storage.'));
  });
}
async function fileOperation(action, key, file) {
  const db = await documentDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', action === 'get' ? 'readonly' : 'readwrite');
    const store = transaction.objectStore('files');
    const request = action === 'get' ? store.get(key) : action === 'delete' ? store.delete(key) : store.put(file, key);
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(new Error('Unable to store this document. Check available browser storage.')); };
  });
}
async function checkFile(file) {
  if (file.size > 5 * 1024 * 1024 || !file.size) fail('Each document must be between 1 byte and 5 MB.');
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf = bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45;
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const isJpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!isPdf && !isPng && !isJpg) fail('Upload a valid PDF, PNG, or JPG document.');
}
async function addDocuments(claim, files) {
  const list = Array.from(files || []);
  if (list.length > 5 || claim.documents.length + list.length > 10) fail('Upload up to 5 documents at a time, and up to 10 per claim.');
  await Promise.all(list.map(checkFile));
  const documents = [];
  try {
    for (const file of list) {
      const id = uid('document');
      await fileOperation('put', id, file);
      documents.push({ id, name: file.name, size: file.size, type: file.type });
    }
  } catch (error) {
    await Promise.allSettled(documents.map(document => fileOperation('delete', document.id)));
    throw error;
  }
  claim.documents.push(...documents);
}
function normalizeData(data) {
  if (data instanceof FormData) {
    const values = {};
    const files = [];
    for (const [key, value] of data.entries()) {
      if (value instanceof Blob) { if (value.size) files.push(value); }
      else values[key] = value;
    }
    return { values, files };
  }
  const { files = [], documents: ignored, ...values } = data;
  return { values, files };
}
function validateClaim(values) {
  const amount = Number(values.claimAmount);
  const age = Number(values.age);
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000000) fail('Enter a claim amount between ₹1 and ₹10,00,00,000.');
  if (!Number.isInteger(age) || age < 0 || age > 120) fail('Enter an age between 0 and 120.');
  for (const key of ['policyNumber', 'disease', 'hospital', 'admissionDate', 'dischargeDate']) if (!String(values[key] || '').trim()) fail(`Please complete ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}.`);
  for (const key of ['disease', 'hospital']) if (typeof values[key] !== 'string' || values[key].trim().length < 2 || values[key].trim().length > 200) fail('Treatment and hospital must each contain 2 to 200 characters.');
  for (const key of ['admissionDate', 'dischargeDate']) if (!/^\d{4}-\d{2}-\d{2}$/.test(values[key]) || !Number.isFinite(Date.parse(values[key])) || new Date(values[key]).toISOString().slice(0, 10) !== values[key]) fail('Enter a valid admission and discharge date.');
  if (!['Male', 'Female', 'Other'].includes(values.gender)) fail('Select a valid gender.');
  const admission = Date.parse(values.admissionDate), discharge = Date.parse(values.dischargeDate);
  if (!Number.isFinite(admission) || !Number.isFinite(discharge) || discharge < admission || discharge > Date.now()) fail('Treatment dates must be chronological and cannot be in the future.');
  return { ...values, claimAmount: amount, age };
}

export const api = {
  init,
  get mode() { return mode; },
  get token() { return session?.token || null; },
  async login(email, password) {
    await init();
    if (mode !== 'preview') {
      const result = await request('/auth/login', { method: 'POST', body: { email, password } });
      setSession({ token: result.token, mode });
      return result;
    }
    const user = state().users.find(user => user.email.toLowerCase() === String(email).trim().toLowerCase() && user.password === password);
    if (!user) fail('Email or password is incorrect.');
    const token = uid('preview');
    setSession({ token, userId: user.id, mode: 'preview' });
    return { token, user: publicUser(user) };
  },
  async register(data) {
    await init();
    if (mode !== 'preview') {
      const result = await request('/auth/register', { method: 'POST', body: data });
      setSession({ token: result.token, mode }); return result;
    }
    if (!data.name?.trim() || data.name.trim().length < 2 || data.name.trim().length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) fail('Enter your name (2–80 characters) and a valid email address.');
    if (data.phone && (String(data.phone).trim().length < 7 || String(data.phone).length > 20)) fail('Enter a phone number of 7 to 20 characters.');
    if (!data.password || data.password.length < 10 || new TextEncoder().encode(data.password).length > 72 || !/[a-z]/.test(data.password) || !/[A-Z]/.test(data.password) || !/\d/.test(data.password)) fail('Use 10+ characters with uppercase, lowercase, and a number (up to 72 UTF-8 bytes).');
    if (state().users.some(user => user.email.toLowerCase() === data.email.toLowerCase())) fail('An account with this email already exists.');
    const user = { id: uid('user'), name: data.name.trim(), email: data.email.trim().toLowerCase(), password: data.password, phone: data.phone || '', role: 'patient', createdAt: dateNow() };
    state().users.push(user); save();
    const token = uid('preview'); setSession({ token, userId: user.id, mode: 'preview' });
    return { token, user: publicUser(user) };
  },
  async me() { await init(); return mode === 'preview' ? { user: publicUser(actor()) } : request('/auth/me'); },
  logout() { setSession(null); },
  async profile(data) {
    await init(); if (mode !== 'preview') return request('/auth/profile', { method: 'PUT', body: data });
    const user = actor();
    if (!data.name?.trim() || data.name.trim().length < 2 || data.name.length > 80) fail('Enter a name of 2 to 80 characters.');
    if (data.phone && (String(data.phone).trim().length < 7 || String(data.phone).length > 20)) fail('Enter a phone number of 7 to 20 characters.');
    user.name = data.name.trim(); user.phone = String(data.phone || '').trim(); log('PROFILE_UPDATED', user.id); save();
    return { user: publicUser(user) };
  },
  async claims() {
    await init(); if (mode !== 'preview') return request('/claims');
    const user = actor(); return { claims: state().claims.filter(claim => allowedClaim(user, claim)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  },
  async createClaim(data) {
    await init(); if (mode !== 'preview') return request('/claims', { method: 'POST', body: data });
    const user = actor();
    if (!['patient', 'hospital', 'admin'].includes(user.role)) fail('This role cannot submit claims.');
    const { values, files } = normalizeData(data);
    const validated = validateClaim(values);
    const policy = state().policies.find(policy => policy.policyNumber === validated.policyNumber && (user.role !== 'patient' || policy.patientId === user.id));
    if (!policy) fail('Choose an existing policy you are allowed to access.');
    if (policy.status !== 'Active' || validated.admissionDate < policy.startDate || validated.admissionDate > policy.endDate) fail('This treatment is outside the active policy period.');
    if (validated.claimAmount > policy.coverageAmount) fail('The claim amount exceeds the policy’s coverage.');
    const at = dateNow();
    const claim = { ...validated, id: uid('claim'), claimId: `CC-2026-${String(state().claims.length + 1049).padStart(4, '0')}`, patientId: policy.patientId, patientName: policy.patientName, status: 'Pending', remarks: '', documents: [], timeline: [{ status: 'Submitted', note: 'Claim submitted successfully.', at }, { status: 'Pending', note: 'Awaiting review by a claims officer.', at }], createdAt: at, updatedAt: at, submittedBy: user.id };
    await addDocuments(claim, files);
    state().claims.unshift(claim); log('Claim submitted', claim.id); save(); return { claim };
  },
  async updateClaim(id, data) {
    await init(); if (mode !== 'preview') return request(`/claims/${encodeURIComponent(id)}`, { method: 'PUT', body: data });
    const user = actor(), claim = getClaim(id);
    if (data.status !== undefined) {
      if (!privileged(user)) fail('Only a claims officer or administrator can change claim status.');
      if (!['Approved', 'Rejected'].includes(data.status)) fail('Choose Approved or Rejected.');
      if (!data.remarks?.trim() || data.remarks.trim().length < 5) fail('Add a review note of at least 5 characters.');
      if (claim.status !== 'Pending') fail('This claim already has a final decision.');
      const policy = state().policies.find(policy => policy.policyNumber === claim.policyNumber);
      if (data.status === 'Approved') {
        if (!policy) fail('The associated policy could not be found.');
        if (claim.claimAmount > policy.coverageAmount - policy.usedAmount) fail('The policy has insufficient remaining coverage.');
        policy.usedAmount += claim.claimAmount;
      }
      claim.status = data.status; claim.remarks = data.remarks.trim();
      claim.timeline.push({ status: data.status, note: claim.remarks, at: dateNow() });
    } else {
      if (claim.status !== 'Pending' || !canEdit(user, claim)) fail('Only the submitter can edit a pending claim.');
      const permitted = ['disease', 'hospital', 'admissionDate', 'dischargeDate', 'claimAmount', 'age', 'gender'];
      const merged = validateClaim({ ...claim, ...Object.fromEntries(Object.entries(data).filter(([key]) => permitted.includes(key))) });
      const policy = state().policies.find(policy => policy.policyNumber === claim.policyNumber);
      if (!policy || merged.claimAmount > policy.coverageAmount || merged.admissionDate < policy.startDate || merged.admissionDate > policy.endDate) fail('The claim is outside the policy coverage.');
      Object.assign(claim, Object.fromEntries(permitted.map(key => [key, merged[key]])));
    }
    claim.updatedAt = dateNow(); log(`Claim ${claim.status.toLowerCase()}`, claim.id); save(); return { claim };
  },
  async uploadDocuments(id, files) {
    await init();
    if (mode !== 'preview') { const data = new FormData(); Array.from(files).forEach(file => data.append('documents', file)); return request(`/claims/${encodeURIComponent(id)}/documents`, { method: 'POST', body: data }); }
    const claim = getClaim(id);
    if (claim.status !== 'Pending' || !canEdit(actor(), claim)) fail('Only the submitter can add documents to a pending claim.');
    await addDocuments(claim, files); log('Supporting documents uploaded', claim.id); save(); return { claim };
  },
  async documentUrl(id) {
    await init();
    if (mode !== 'preview') {
      const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${session?.token || ''}` } });
      if (!response.ok) fail('This document is unavailable or access is not permitted.');
      return URL.createObjectURL(await response.blob());
    }
    const user = actor();
    if (!state().claims.some(claim => allowedClaim(user, claim) && claim.documents.some(document => document.id === id))) fail('Document access is not permitted.');
    const file = await fileOperation('get', id);
    if (!file) fail('This document is no longer stored in this browser.');
    return URL.createObjectURL(file);
  },
  async policies() {
    await init(); if (mode !== 'preview') return request('/policies');
    const user = actor(); return { policies: state().policies.filter(policy => user.role !== 'patient' || policy.patientId === user.id), importOptions: policyImportOptions(user, 'demo') };
  },
  async importPolicies(data) {
    await init(); if (mode !== 'preview') return request('/policies/import', { method: 'POST', body: data });
    const user = actor(), source = data.source === 'sample' ? 'sample' : 'csv';
    if (data.source !== undefined && !['sample', 'csv'].includes(data.source)) fail('Choose sample policies or a CSV policy import.');
    if (!policyImportOptions(user, 'demo')[source]) fail('You are not permitted to import policies.');
    if (source === 'sample') {
      const existing = state().policies.filter(policy => policy.patientId === user.id && policy.source === 'sample');
      if (existing.length) return { policies: existing, importedCount: 0, source };
    }
    const input = source === 'sample' ? samplePolicyInputs(user.id) : data.policies;
    if (!Array.isArray(input) || !input.length || input.length > 100) fail('Import between 1 and 100 policies at a time.');
    const numbers = new Set(state().policies.map(policy => policy.policyNumber.toLowerCase()));
    const imported = input.map((value, index) => {
      let row;
      try { row = validatePolicyInput(value); } catch (err) { fail(`Policy ${index + 1}: ${err.message}`); }
      const number = row.policyNumber.toLowerCase();
      if (numbers.has(number)) fail(`Policy ${index + 1}: policy number ${row.policyNumber} already exists.`);
      numbers.add(number);
      if (user.role === 'patient' && row.patientEmail && row.patientEmail !== user.email.toLowerCase()) fail('You can only import policies for your own account.');
      const patient = user.role === 'admin' ? state().users.find(item => item.role === 'patient' && item.email.toLowerCase() === row.patientEmail) : user;
      if (!patient) fail(`Policy ${index + 1}: enter the email of an existing patient account.`);
      const { patientEmail, ...fields } = row;
      return { ...fields, id: uid('policy'), patientId: patient.id, patientName: patient.name, usedAmount: 0, status: 'Active', billingPeriod: row.nextDueDate.slice(0, 7), paidPeriods: [], source, sample: true, createdAt: dateNow() };
    });
    state().policies.push(...imported);
    imported.forEach(policy => log('POLICY_IMPORTED', policy.id));
    save(); return { policies: imported, importedCount: imported.length, source };
  },
  async payments() {
    await init(); if (mode !== 'preview') return request('/payments');
    const user = actor(); return { payments: state().payments.filter(payment => privileged(user) || payment.patientId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  },
  async createOrder(policyId) {
    await init(); if (mode !== 'preview') return request('/payments/order', { method: 'POST', body: { policyId } });
    const user = actor(), policy = state().policies.find(policy => policy.id === policyId);
    if (user.role !== 'patient') fail('Only a policyholder can pay a premium.');
    if (!policy || policy.patientId !== user.id || policy.status !== 'Active') fail('You cannot pay for this policy.');
    const billingPeriod = policy.billingPeriod || policy.nextDueDate.slice(0, 7);
    if (`${billingPeriod}-01` > policy.endDate) fail('This policy term is fully paid. The next premium is not due; contact the insurer to renew the policy.');
    if (Date.parse(`${billingPeriod}-01T00:00:00Z`) > Date.now() + 90 * 86400000) fail('Your premium is paid. The next premium is not due yet.');
    if (state().payments.some(payment => payment.policyId === policy.id && payment.billingPeriod === billingPeriod)) fail('This premium has already been paid.');
    const existing = state().orders.find(order => order.policyId === policyId && order.patientId === user.id && order.billingPeriod === billingPeriod && order.status === 'created' && Date.parse(order.expiresAt) > Date.now());
    const order = existing || { id: uid('order'), policyId, patientId: user.id, amount: Math.round(policy.premiumAmount * 100), currency: 'INR', provider: 'demo', billingPeriod, status: 'created', createdAt: dateNow(), expiresAt: new Date(Date.now() + 30 * 60000).toISOString() };
    if (!existing) state().orders.push(order);
    save(); return { order: { ...order, order_id: order.id }, provider: 'demo' };
  },
  async paymentStatus(orderId) {
    await init();
    if (mode !== 'preview') return request(`/payments/orders/${encodeURIComponent(orderId)}`);
    const user = actor(), order = state().orders.find(item => item.id === orderId && item.patientId === user.id);
    if (!order) fail('Payment order not found.');
    const payment = state().payments.find(item => item.orderId === order.id) || null;
    return { order, payment, policy: payment ? state().policies.find(item => item.id === order.policyId) : null, status: payment ? 'paid' : Date.parse(order.expiresAt) < Date.now() ? 'expired' : 'pending', paymentMode: 'demo' };
  },
  async verifyPayment(data) {
    await init(); if (mode !== 'preview') return request('/payments/verify', { method: 'POST', body: data });
    const user = actor(), order = state().orders.find(order => order.id === data.orderId);
    if (!order || order.patientId !== user.id) fail('Payment order not found.');
    const policy = state().policies.find(policy => policy.id === order.policyId);
    const existing = state().payments.find(payment => payment.orderId === order.id);
    if (existing) return { payment: existing, policy };
    if (Date.parse(order.expiresAt) < Date.now()) fail('Checkout has expired. Please start a new payment.');
    if (!policy) fail('The associated policy could not be found.');
    if (state().payments.some(payment => payment.policyId === policy.id && payment.billingPeriod === order.billingPeriod)) fail('This premium has already been paid.');
    const payment = { id: uid('payment'), receiptId: `RCPT-${new Date().getFullYear()}-${String(state().payments.length + 1).padStart(4, '0')}`, policyId: policy.id, policyName: policy.name, patientId: policy.patientId, amount: order.amount / 100, currency: 'INR', provider: 'demo', billingPeriod: order.billingPeriod, status: 'Paid', method: 'Sandbox', createdAt: dateNow(), orderId: order.id };
    order.status = 'paid'; state().payments.unshift(payment);
    const renewal = new Date(`${order.billingPeriod}-01T00:00:00Z`); renewal.setUTCFullYear(renewal.getUTCFullYear() + 1);
    policy.paidPeriods = [...new Set([...(policy.paidPeriods || []), order.billingPeriod])];
    policy.nextDueDate = renewal.toISOString().slice(0, 10); policy.billingPeriod = policy.nextDueDate.slice(0, 7);
    log('Demo premium payment recorded', payment.id); save(); return { payment, policy };
  },
  async audit() {
    await init(); if (mode !== 'preview') return request('/audit');
    if (!privileged(actor())) fail('Audit history is restricted to officers and administrators.');
    return { logs: state().logs };
  },
  async stats() {
    await init(); if (mode !== 'preview') return request('/claims/stats');
    const { claims } = await api.claims();
    const totalAmount = claims.reduce((sum, claim) => sum + claim.claimAmount, 0);
    const statusDistribution = ['Approved', 'Pending', 'Rejected'].map(name => ({ name, value: claims.filter(claim => claim.status === name).length }));
    const genderDistribution = ['Male', 'Female', 'Other'].map(name => ({ name, value: claims.filter(claim => claim.gender === name).length }));
    const claimAmounts = claims.map(claim => ({ name: claim.patientName, amount: claim.claimAmount, claimId: claim.claimId }));
    const ageTrend = ['0–18', '19–35', '36–50', '51–65', '66+'].map((name, index) => ({ name, count: claims.filter(claim => index === 0 ? claim.age <= 18 : index === 1 ? claim.age >= 19 && claim.age <= 35 : index === 2 ? claim.age >= 36 && claim.age <= 50 : index === 3 ? claim.age >= 51 && claim.age <= 65 : claim.age >= 66).length }));
    const monthly = Array.from({ length: 7 }, (_, index) => { const month = index + 4; const selected = claims.filter(claim => new Date(claim.createdAt).getUTCMonth() === month); return { name: new Date(Date.UTC(2026, month, 1)).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }), amount: selected.reduce((sum, claim) => sum + claim.claimAmount, 0), claims: selected.length }; });
    const amountByPatient = [...new Set(claims.map(claim => claim.patientName))].map(name => ({ name, amount: claims.filter(claim => claim.patientName === name).reduce((sum, claim) => sum + claim.claimAmount, 0) }));
    const monthlyTrend = monthly.map(item => ({ ...item, month: item.name, submitted: item.amount, approved: claims.filter(claim => claim.status === 'Approved' && new Date(claim.createdAt).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }) === item.name).reduce((sum, claim) => sum + claim.claimAmount, 0) }));
    return { stats: { totalClaims: claims.length, totalAmount, approvedAmount: claims.filter(claim => claim.status === 'Approved').reduce((sum, claim) => sum + claim.claimAmount, 0), approved: statusDistribution[0].value, pending: statusDistribution[1].value, rejected: statusDistribution[2].value, approvalRate: claims.length ? Math.round(statusDistribution[0].value / claims.length * 100) : 0, statusDistribution, genderDistribution, claimAmounts, amountByPatient, ageTrend: ageTrend.map(item => ({ ...item, ageGroup: item.name, claims: item.count })), monthly, monthlyTrend } };
  },
};

export default api;
