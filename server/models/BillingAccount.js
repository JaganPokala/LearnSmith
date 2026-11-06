import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  creator: { type: String, required: true },
  mode: { type: String, enum: ['test'], default: 'test', required: true },
  subscriptionId: { type: String },
  planId: { type: String, default: null },
  checkoutState: { type: String, enum: ['none', 'creating', 'ready', 'failed', 'unknown'], default: 'none' },
  checkoutAttemptId: { type: String, default: null },
  status: { type: String, default: 'none' },
  paidFrom: { type: Date, default: null },
  paidThrough: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  syncAttemptId: { type: String, default: null },
  syncExpiresAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ creator: 1 }, { unique: true });
schema.index({ subscriptionId: 1 }, { unique: true, sparse: true });
const TestBillingAccount = mongoose.model('BillingAccount', schema);
const liveSchema = schema.clone();
liveSchema.remove('mode');
liveSchema.add({ mode: { type: String, enum: ['live'], default: 'live', required: true } });
const LiveBillingAccount = mongoose.model('LiveBillingAccount', liveSchema);

// Separate collections preserve existing test records and unique indexes;
// switching deployment mode can never promote a test payment into live access.
export function billingAccountModel(mode) {
  if (mode === 'test') return TestBillingAccount;
  if (mode === 'live') return LiveBillingAccount;
  throw new Error('Invalid billing mode.');
}
export default TestBillingAccount;
