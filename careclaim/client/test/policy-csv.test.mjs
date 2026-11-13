import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePolicyCsv, policyCsvTemplate } from '../../shared/policy-csv.js';

const headers = 'policyNumber,name,coverageAmount,premiumAmount,startDate,endDate,nextDueDate';
const values = 'POL-001,Family Cover,500000,12499,2026-01-01,2027-12-31,2026-12-01';

test('policy CSV accepts canonical headers, BOM, CRLF, escaped names and quoted INR values', () => {
  const csv = '\uFEFF' + headers + ',patientEmail\r\nPOL-001,"Family, \"\"Plus\"\"", "₹5,00,000",12499.50,2026-01-01,2027-12-31,2026-12-01,member@example.test\r\n\r\n';
  assert.deepEqual(parsePolicyCsv(csv), [{
    policyNumber: 'POL-001', name: 'Family, "Plus"', coverageAmount: 500000, premiumAmount: 12499.5,
    startDate: '2026-01-01', endDate: '2027-12-31', nextDueDate: '2026-12-01', patientEmail: 'member@example.test',
  }]);
});

test('policy CSV normalizes friendly headers and preserves a quoted multiline policy name', () => {
  const csv = 'Policy Number,Policy Name,Coverage,Premium,Start Date,End Date,Next Due Date\nPOL-001,"Family\nCover",INR 500000,12499,2026-01-01,2027-12-31,2026-12-01';
  const [policy] = parsePolicyCsv(csv);
  assert.equal(policy.name, 'Family\nCover');
  assert.equal(policy.coverageAmount, 500000);
  assert.equal(policy.policyNumber, 'POL-001');
  assert.equal(Object.hasOwn(policy, 'patientEmail'), false);
});

test('policy CSV rejects malformed quoting and gives source row numbers', () => {
  assert.throws(() => parsePolicyCsv(`${headers}\nPOL-001,"Unclosed name,500000,12499,2026-01-01,2027-12-31,2026-12-01`), /Row 2.*not closed/);
  assert.throws(() => parsePolicyCsv(`${headers}\nPOL-001,Family"Cover,500000,12499,2026-01-01,2027-12-31,2026-12-01`), /Row 2.*quotes/);
  assert.throws(() => parsePolicyCsv(`${headers}\nPOL-001,"Family"oops,500000,12499,2026-01-01,2027-12-31,2026-12-01`), /Row 2.*closing quote/);
  assert.throws(() => parsePolicyCsv(`${headers}\n${values}\nPOL-002,Too,Few,Fields`), /Row 3.*expected 7 fields/);
});

test('policy CSV rejects missing, duplicate, unknown and empty policy inputs', () => {
  assert.throws(() => parsePolicyCsv(''), /empty/);
  assert.throws(() => parsePolicyCsv(headers), /no policies/);
  assert.throws(() => parsePolicyCsv('policyNumber,name\nPOL-001,Family'), /Missing required.*coverageAmount/);
  assert.throws(() => parsePolicyCsv(headers + ',coverage\n' + values + ',500000'), /duplicate column/);
  assert.throws(() => parsePolicyCsv(headers + ',unexpected\n' + values + ',data'), /unsupported column/);
});

test('policy CSV rejects nonnumeric amounts and protects file and record limits', () => {
  for (const value of ['', 'NaN', 'Infinity', '1e3', '10 rupees']) {
    assert.throws(() => parsePolicyCsv(headers + '\n' + values.replace('12499', value)), /Row 2.*premiumAmount.*amount/);
  }
  assert.equal(parsePolicyCsv(headers + '\n' + Array.from({ length: 100 }, () => values).join('\n')).length, 100);
  assert.throws(() => parsePolicyCsv(headers + '\n' + Array.from({ length: 101 }, () => values).join('\n')), /100 policies/);
  assert.throws(() => parsePolicyCsv('₹'.repeat(90000)), /256 KB/);
});

test('policy CSV template is parseable and includes optional administrator patient mapping', () => {
  const [member] = parsePolicyCsv(policyCsvTemplate());
  const [admin] = parsePolicyCsv(policyCsvTemplate({ includePatientEmail: true }));
  assert.match(member.policyNumber, /^SAMPLE-\d{4}-001$/);
  assert.equal(member.name, 'Sample Family Cover');
  assert.equal(Object.hasOwn(member, 'patientEmail'), false);
  assert.equal(admin.patientEmail, 'patient@example.test');
  assert.ok(member.startDate < member.nextDueDate && member.nextDueDate <= member.endDate);
});
