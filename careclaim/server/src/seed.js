import bcrypt from 'bcryptjs';

export async function makeSeed() {
  const passwordHash = await bcrypt.hash('Demo@12345', 12);
  const createdAt = new Date().toISOString();
  const users = [
    { id: 'user-patient', name: 'Aarav Sharma', email: 'patient@careclaim.demo', role: 'patient', phone: '9876543210', age: 32, gender: 'Male' },
    { id: 'user-hospital', name: 'Dr. Ananya Sen', email: 'hospital@careclaim.demo', role: 'hospital', phone: '9876543211' },
    { id: 'user-officer', name: 'Priya Mehta', email: 'officer@careclaim.demo', role: 'officer', phone: '9876543212' },
    { id: 'user-admin', name: 'Rohan Kapoor', email: 'admin@careclaim.demo', role: 'admin', phone: '9876543213' },
    { id: 'user-patient-2', name: 'Meera Patel', email: 'meera@careclaim.demo', role: 'patient', age: 45, gender: 'Female' },
    { id: 'user-patient-3', name: 'Kabir Das', email: 'kabir@careclaim.demo', role: 'patient', age: 27, gender: 'Male' },
    { id: 'user-patient-4', name: 'Ishita Rao', email: 'ishita@careclaim.demo', role: 'patient', age: 56, gender: 'Female' },
  ].map(u => ({ ...u, passwordHash, createdAt }));
  const policies = users.filter(u => u.role === 'patient').map((u, i) => ({
    id: `policy-${i + 1}`, policyNumber: `CC-2026-${104201 + i}`, name: i ? 'Care Plus Individual' : 'Care Plus Family', patientId: u.id, patientName: u.name,
    coverageAmount: i ? 500000 : 1000000, usedAmount: i ? 0 : 148500, premiumAmount: i ? 8900 : 12499,
    startDate: '2026-01-01', endDate: '2026-12-31', nextDueDate: '2026-12-01', status: 'Active', billingPeriod: '2026-12', paidPeriods: [],
  }));
  const inputs = [
    [0, 'Appendectomy', 'Apollo Hospital, Kolkata', 68500, 'Approved', 31],
    [0, 'Knee arthroscopy', 'AMRI Hospital, Kolkata', 80000, 'Approved', 58],
    [0, 'Dengue treatment', 'Fortis Hospital, Kolkata', 42500, 'Pending', 3],
    [0, 'Dental procedure', 'City Care Clinic', 12000, 'Rejected', 16],
    [1, 'Cataract surgery', 'Manipal Hospital, Bengaluru', 54000, 'Approved', 11],
    [2, 'Fracture treatment', 'Max Hospital, Delhi', 92000, 'Pending', 2],
    [3, 'Cardiac observation', 'Medanta Hospital, Gurugram', 125000, 'Pending', 5],
    [1, 'Diagnostic investigation', 'Apollo Hospital, Ahmedabad', 18500, 'Rejected', 23],
  ];
  const claims = inputs.map(([i, disease, hospital, claimAmount, status, days], n) => {
    const u = users.filter(u => u.role === 'patient')[i], p = policies[i];
    const date = new Date(Date.now() - days * 86400000).toISOString();
    const timeline = [{ status: 'Submitted', note: 'Claim received for initial verification.', at: date }, { status: 'Pending', note: 'Documents queued for review.', at: date }];
    const remarks = status === 'Rejected' ? 'This expense is excluded by the sample policy. Contact your insurer for clarification.' : status === 'Approved' ? 'Supporting documents verified. Claim approved.' : '';
    if (status !== 'Pending') timeline.push({ status, note: remarks, at: new Date(new Date(date).getTime() + 86400000).toISOString() });
    return { id: `claim-${n + 1}`, claimId: `CLM-2026-${String(1048 + n).padStart(4, '0')}`, patientId: u.id, patientName: u.name, age: u.age, gender: u.gender, policyNumber: p.policyNumber, claimAmount, disease, hospital, admissionDate: date.slice(0, 10), dischargeDate: date.slice(0, 10), status, previousClaimHistory: '', remarks, documents: [], timeline, submittedBy: u.id, createdAt: date, updatedAt: date };
  });
  policies.forEach(p => { p.usedAmount = claims.filter(c => c.policyNumber === p.policyNumber && c.status === 'Approved').reduce((s, c) => s + c.claimAmount, 0); });
  return { users, policies, claims, payments: [], orders: [], documents: [], logs: [{ id: 'audit-seed', action: 'DEMO_INITIALIZED', actorId: 'system', actorName: 'System', targetId: 'demo', at: createdAt, detail: 'Synthetic demonstration records initialized.' }] };
}
