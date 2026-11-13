import mongoose from 'mongoose';

const { Schema } = mongoose;
const base = { id: { type: String, required: true, unique: true, index: true } };
const options = { strict: false, versionKey: false };
export const models = {
  users: mongoose.model('User', new Schema({ ...base, email: { type: String, required: true, unique: true, lowercase: true }, passwordHash: { type: String, required: true }, name: { type: String, required: true }, role: { type: String, enum: ['patient', 'hospital', 'officer', 'admin'], required: true } }, options)),
  claims: mongoose.model('Claim', new Schema({ ...base, claimId: { type: String, unique: true }, patientId: { type: String, required: true, index: true }, status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], index: true }, claimAmount: { type: Number, min: 1, index: true }, policyNumber: { type: String, index: true }, documents: [Schema.Types.Mixed], timeline: [Schema.Types.Mixed] }, options)),
  policies: mongoose.model('Policy', new Schema({ ...base, policyNumber: { type: String, unique: true }, patientId: { type: String, required: true, index: true }, coverageAmount: { type: Number, min: 1 }, premiumAmount: { type: Number, min: 1 } }, options)),
  payments: mongoose.model('Payment', new Schema({ ...base, orderId: { type: String, required: true, unique: true }, policyId: { type: String, required: true, index: true }, patientId: { type: String, required: true, index: true } }, options)),
  orders: mongoose.model('PaymentOrder', new Schema({ ...base, patientId: { type: String, required: true, index: true }, policyId: { type: String, required: true }, billingPeriod: String, status: String }, options)),
  documents: mongoose.model('Document', new Schema({ ...base, claimId: { type: String, required: true, index: true }, path: { type: String, required: true } }, options)),
  logs: mongoose.model('AuditLog', new Schema({ ...base, actorId: String, action: String, at: { type: String, index: true } }, options)),
};
