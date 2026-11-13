// Pure policy-import validation shared by the server and synthetic browser preview.
const invalid = message => { const error = new Error(message); error.status = 400; throw error; };
const text = (value, label, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(`${label} must contain ${min}–${max} characters.`);
  return value.trim();
};
const amount = (value, label, max) => {
  if (!['string', 'number'].includes(typeof value) || typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) invalid(`${label} must be a positive INR amount with at most two decimal places.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > max || Math.abs(number * 100 - Math.round(number * 100)) > .00001) invalid(`${label} must be greater than zero and at most ${max} INR, with at most two decimal places.`);
  return number;
};
const date = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid(`${label} must be a valid YYYY-MM-DD date.`);
  return value;
};

export function validatePolicyInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Each imported policy must be a policy record.');
  const policy = {
    policyNumber: text(input.policyNumber, 'Policy number', 3, 80),
    name: text(input.name, 'Policy name', 2, 120),
    coverageAmount: amount(input.coverageAmount, 'Coverage', 100000000),
    premiumAmount: amount(input.premiumAmount, 'Premium', 10000000),
    startDate: date(input.startDate, 'Start date'),
    endDate: date(input.endDate, 'End date'),
    nextDueDate: date(input.nextDueDate, 'Next premium due date'),
  };
  if (policy.endDate <= policy.startDate || policy.nextDueDate < policy.startDate || policy.nextDueDate > policy.endDate) invalid('Policy end date must follow its start date, and the premium due date must fall within the cover period.');
  if (input.patientEmail !== undefined && input.patientEmail !== '') {
    policy.patientEmail = text(input.patientEmail, 'Patient email', 3, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(policy.patientEmail)) invalid('Patient email must be a valid email address.');
  }
  return policy;
}

export function samplePolicyInputs(patientId, current = new Date()) {
  const year = current.getUTCFullYear();
  const nextMonth = new Date(Date.UTC(year, current.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const suffix = String(patientId).replace(/[^a-z0-9]/gi, '').slice(-20).toUpperCase();
  return [
    { policyNumber: `SAMPLE-${suffix}-FAMILY`, name: 'Sample Family Cover', coverageAmount: 500000, premiumAmount: 12499 },
    { policyNumber: `SAMPLE-${suffix}-ESSENTIAL`, name: 'Sample Essential Cover', coverageAmount: 300000, premiumAmount: 8499 },
  ].map(policy => ({ ...policy, startDate: `${year}-01-01`, endDate: `${year + 1}-12-31`, nextDueDate: nextMonth }));
}

export function policyImportOptions(user, storeMode) {
  const demoMember = user.role === 'patient' && storeMode === 'demo';
  return { sample: demoMember, csv: user.role === 'admin' || demoMember };
}
