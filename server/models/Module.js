/**
 * server/models/Module.js
 *
 * The middle of the tree. A section of a course, holding an ordered list of
 * Lesson ids.
 *
 * Note this file has no `creator`. Ownership lives on the Course, and a Module
 * is reachable only through one. Duplicating `creator` here would be a second
 * copy of the same fact that can disagree with the first — the ownership check
 * in Phase 8 walks up to the Course instead.
 */

import mongoose from 'mongoose';

const moduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Required on purpose: a module with no course is an orphan that no query
    // will ever reach and nothing will ever clean up.
    //
    // Indexed because Task 2.3's cascade delete queries modules BY course, and
    // so does any path that loads a course's modules starting from here.
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
