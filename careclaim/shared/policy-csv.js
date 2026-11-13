const REQUIRED_COLUMNS = ['policyNumber', 'name', 'coverageAmount', 'premiumAmount', 'startDate', 'endDate', 'nextDueDate'];
const COLUMN_NAMES = new Map([
  ['policynumber', 'policyNumber'],
  ['name', 'name'], ['policyname', 'name'],
  ['coverageamount', 'coverageAmount'], ['coverage', 'coverageAmount'],
  ['premiumamount', 'premiumAmount'], ['premium', 'premiumAmount'],
  ['startdate', 'startDate'], ['enddate', 'endDate'],
  ['nextduedate', 'nextDueDate'],
  ['patientemail', 'patientEmail'],
]);
const MAX_BYTES = 256 * 1024;
const MAX_POLICIES = 100;

function csvRecords(text) {
  const records = [];
  let cells = [], value = '', state = 'start', line = 1, recordLine = 1;
  const field = () => { cells.push(value); value = ''; state = 'start'; };
  const record = () => {
    field();
    if (cells.some(cell => cell.trim())) records.push({ cells, line: recordLine });
    cells = [];
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (state === 'quoted') {
      if (character === '"') {
        if (text[index + 1] === '"') { value += '"'; index++; }
        else state = 'closed';
      } else { value += character; if (character === '\n') line++; }
      continue;
    }
    if (character === ',') { field(); continue; }
    if (character === '\n') { record(); line++; recordLine = line; continue; }
    if (state === 'closed') {
      if (character === ' ' || character === '\t') continue;
      throw new Error(`Row ${line}: unexpected text after a closing quote.`);
    }
    if (character === '"') {
      if (state !== 'start' && value.trim()) throw new Error(`Row ${line}: quotes must surround the entire CSV field.`);
      value = ''; state = 'quoted';
    } else { value += character; state = 'unquoted'; }
  }
  if (state === 'quoted') throw new Error(`Row ${recordLine}: a quoted CSV field is not closed.`);
  record();
  return records;
}

function amount(value, column, row) {
  const raw = value.trim().replace(/^(?:₹|INR)\s*/i, '');
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{2,3})+)(?:\.\d+)?$/.test(raw)) {
    throw new Error(`Row ${row}: ${column} must be a numeric INR amount, such as 12499.`);
  }
  const parsed = Number(raw.replaceAll(',', ''));
  if (!Number.isFinite(parsed)) throw new Error(`Row ${row}: ${column} must be a finite INR amount.`);
  return parsed;
}

/** Parse a policy CSV into canonical API rows. Eligibility is validated by the API. */
export function parsePolicyCsv(text) {
  if (typeof text !== 'string') throw new Error('Choose a CSV text file.');
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('The CSV file must be 256 KB or smaller.');
  const records = csvRecords(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'));
  if (!records.length) throw new Error('The CSV file is empty. Download the template to get started.');
  const header = records.shift();
  const columns = header.cells.map(value => {
    const column = COLUMN_NAMES.get(value.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (!column) throw new Error(`Row ${header.line}: unsupported column "${value.trim()}". Use the policy CSV template headers.`);
    return column;
  });
  if (new Set(columns).size !== columns.length) throw new Error(`Row ${header.line}: the CSV contains duplicate column headers.`);
  const missing = REQUIRED_COLUMNS.filter(column => !columns.includes(column));
  if (missing.length) throw new Error(`Missing required CSV columns: ${missing.join(', ')}.`);
  if (!records.length) throw new Error('The CSV has headers but no policies. Add at least one policy row.');
  if (records.length > MAX_POLICIES) throw new Error('Import no more than 100 policies at a time.');
  return records.map(({ cells, line }) => {
    if (cells.length !== columns.length) throw new Error(`Row ${line}: expected ${columns.length} fields but found ${cells.length}. Put values containing commas inside double quotes.`);
    const policy = Object.fromEntries(columns.map((column, index) => [column, cells[index].trim()]));
    policy.coverageAmount = amount(policy.coverageAmount, 'coverageAmount', line);
    policy.premiumAmount = amount(policy.premiumAmount, 'premiumAmount', line);
    return policy;
  });
}

/** Return an editable example, never an assertion of issued insurance coverage. */
export function policyCsvTemplate({ includePatientEmail = false } = {}) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const nextMonth = new Date(Date.UTC(year, now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const columns = [...REQUIRED_COLUMNS, ...(includePatientEmail ? ['patientEmail'] : [])];
  const values = [`SAMPLE-${year}-001`, 'Sample Family Cover', '500000', '12499', `${year}-01-01`, `${year + 1}-12-31`, nextMonth, ...(includePatientEmail ? ['patient@example.test'] : [])];
  return '\uFEFF' + columns.join(',') + '\r\n' + values.join(',') + '\r\n';
}
