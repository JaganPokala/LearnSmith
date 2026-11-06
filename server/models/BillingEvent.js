import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  eventId: { type: String, required: true },
  event: { type: String, required: true },
  subscriptionId: { type: String, required: true },
  processedAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ eventId: 1 }, { unique: true });
const TestBillingEvent = mongoose.model('BillingEvent', schema);
const LiveBillingEvent = mongoose.model('LiveBillingEvent', schema.clone());
export function billingEventModel(mode) {
  if (mode === 'test') return TestBillingEvent;
  if (mode === 'live') return LiveBillingEvent;
  throw new Error('Invalid billing mode.');
}
export default TestBillingEvent;
