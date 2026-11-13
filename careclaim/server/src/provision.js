import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { createStore } from './store.js';

const command = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).reduce((pairs, value, index, all) => value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs, []));
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!['user', 'policy'].includes(command) || !args.email || !args.name) throw new Error('Usage: provision user --email EMAIL --name NAME --role ROLE, or provision policy --email EMAIL --name NAME --coverage INR --premium INR --start YYYY-MM-DD --end YYYY-MM-DD --due YYYY-MM-DD');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) throw new Error('A valid email is required.');
const store = await createStore({ mongoUri: process.env.MONGODB_URI, dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(serverDir, 'data'), seed: false });
try {
  if (command === 'user') {
    if (!['patient', 'hospital', 'officer', 'admin'].includes(args.role)) throw new Error('Role must be patient, hospital, officer, or admin.');
    if (store.read().users.some(u => u.email === args.email.toLowerCase())) throw new Error('A user with this email already exists.');
    if (!process.stdin.isTTY) throw new Error('Run user provisioning in an interactive terminal to enter a password securely.');
    const password = await new Promise(resolve => {
      process.stdout.write('Password (10+ characters; uppercase, lowercase, number): ');
      process.stdin.setRawMode(true); process.stdin.resume();
      let value = '';
      const read = chunk => {
        const s = chunk.toString();
        if (s === '\u0003') { process.stdin.setRawMode(false); process.exit(130); }
        if (s === '\r' || s === '\n') { process.stdin.off('data', read); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); resolve(value); }
        else if (s === '\u007f' || s === '\b') value = value.slice(0, -1);
        else if (!/[\x00-\x1f]/.test(s)) value += s;
      };
      process.stdin.on('data', read);
    });
    if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) throw new Error('Password must contain at least 10 characters with uppercase, lowercase, and a number, and at most 72 UTF-8 bytes.');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await store.mutate(state => { const user = { id: `user-${randomUUID()}`, name: args.name, email: args.email.toLowerCase(), role: args.role, passwordHash, phone: '', createdAt: new Date().toISOString() }; state.users.push(user); state.logs.push({ id: `audit-${randomUUID()}`, actorId: 'operator', actorName: 'Provisioning CLI', action: 'USER_PROVISIONED', targetId: user.id, detail: `${user.role} account provisioned.`, at: new Date().toISOString() }); return user; });
    console.log(`Created ${user.role} account ${user.email}.`);
  } else {
    const patient = store.read().users.find(u => u.email === args.email.toLowerCase() && u.role === 'patient');
    if (!patient) throw new Error('No patient account exists with that email.');
    const coverageAmount = Number(args.coverage), premiumAmount = Number(args.premium);
    if (!(coverageAmount > 0 && coverageAmount <= 100000000 && premiumAmount > 0 && premiumAmount <= 10000000)) throw new Error('Coverage and premium must be positive INR amounts.');
    for (const key of ['start', 'end', 'due']) if (!/^\d{4}-\d{2}-\d{2}$/.test(args[key] || '') || !Number.isFinite(Date.parse(args[key])) || new Date(args[key]).toISOString().slice(0, 10) !== args[key]) throw new Error(`A valid --${key} YYYY-MM-DD date is required.`);
    if (args.end <= args.start || args.due < args.start || args.due > args.end) throw new Error('Policy dates are inconsistent.');
    const policy = await store.mutate(state => { const policy = { id: `policy-${randomUUID()}`, policyNumber: `CC-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`, name: args.name, patientId: patient.id, patientName: patient.name, coverageAmount, usedAmount: 0, premiumAmount, startDate: args.start, endDate: args.end, nextDueDate: args.due, billingPeriod: args.due.slice(0, 7), paidPeriods: [], status: 'Active' }; state.policies.push(policy); state.logs.push({ id: `audit-${randomUUID()}`, actorId: 'operator', actorName: 'Provisioning CLI', action: 'POLICY_PROVISIONED', targetId: policy.id, detail: `Policy ${policy.policyNumber} assigned to ${patient.email}.`, at: new Date().toISOString() }); return policy; });
    console.log(`Created policy ${policy.policyNumber} for ${patient.email}.`);
  }
} finally { await store.close(); }
