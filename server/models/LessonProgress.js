import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  creator: { type: String, required: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  completed: { type: Boolean, default: false, required: true },
  completedAt: { type: Date, default: null },
  lastOpenedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ creator: 1, lesson: 1 }, { unique: true });
schema.index({ creator: 1, course: 1, lastOpenedAt: -1 });
export default mongoose.model('LessonProgress', schema);
