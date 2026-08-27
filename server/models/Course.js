/**
 * server/models/Course.js
 *
 * The top of the tree:  Course -> Module -> Lesson
 *
 * A Course owns an ordered list of Module ids. The link is stored on BOTH
 * sides (Module also holds `course`), which makes either direction a single
 * lookup — and means both sides must be kept in sync by hand. Mongo has no
 * foreign keys and will never warn you about a half-written link.
 */

import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema(
  {
    // Trimmed because the title comes from the AI, and generated strings
    // routinely arrive with a leading space or a trailing newline.
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Not required: a course whose description came back empty should still
    // save rather than throwing away an entire generation over one field.
    description: {
      type: String,
      trim: true,
      default: '',
    },

    // The Auth0 `sub` claim (e.g. "auth0|65f1..."), never an email — an email
    // can change, `sub` cannot.
    //
    // Present from day one even though Auth0 is Phase 8. Adding an owner field
    // later means writing a migration, and "every course created before Phase 8
    // belongs to nobody" is a bug that surfaces during the demo. Until Auth0
    // lands, callers pass a placeholder.
    creator: {
      type: String,
      required: true,
      index: true,
    },

    // Pointers, not data. .populate('modules') swaps these for documents.
    // The ref string must match the model name EXACTLY: 'module' instead of
    // 'Module' does not throw — populate just returns nothing, which is
    // indistinguishable from "this course has no modules".
    // Array order is module order; Mongo preserves it.
    modules: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Module',
      },
    ],

    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    // createdAt is needed in Phase 5 to list courses newest-first.
    timestamps: true,
  },
);

// The exact shape of the "my courses, newest first" query.
//
// An index on `creator` alone would find the matches quickly and then still
// leave Mongo sorting them in memory. One index covering the filter AND the
// sort does both in a single pass. -1 is descending: newest first.
courseSchema.index({ creator: 1, createdAt: -1 });

export default mongoose.model('Course', courseSchema);
