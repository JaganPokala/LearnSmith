import mongoose from 'mongoose';

const integer = { type: Number, required: true, min: 0, validate: Number.isSafeInteger };
const schema = new mongoose.Schema({
  creator: { type: String, required: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  submissionId: { type: String, required: true },
  questionIndex: { ...integer },
  questionVersion: { type: String, required: true },
  selectedOption: { ...integer },
  correctOption: { ...integer },
  isCorrect: { type: Boolean, required: true },
  // Immutable snapshots make past attempts meaningful if content changes.
  question: { type: String, required: true },
  options: { type: [String], required: true },
  explanation: { type: String, required: true },
}, { timestamps: true });

schema.index({ creator: 1, submissionId: 1 }, { unique: true });
schema.index({ creator: 1, lesson: 1, _id: -1 });
schema.index({ course: 1 });
export default mongoose.model('QuizAttempt', schema);
