/**
 * The middle of the tree: a section of a course holding an ordered list of
 * Lesson ids. No `creator` — ownership lives on the Course, stored once.
 */

import mongoose from 'mongoose';

const moduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Required: a module with no course is an orphan nothing will ever reach.
    // Indexed because the cascade delete queries modules BY course.
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },

    lessons: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lesson',
      },
    ],
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('Module', moduleSchema);
