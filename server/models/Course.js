/**
 * The top of the tree: Course -> Module -> Lesson. The link is stored on both
 * sides, so both must be kept in sync by hand — Mongo has no foreign keys.
 */

import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema(
  {
    // Trimmed: AI-generated strings routinely arrive with a stray newline.
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Not required — an empty description should not throw away a whole
    // generation.
    description: {
      type: String,
      trim: true,
      default: '',
    },

    // The Auth0 `sub` claim, never an email. Present from day one so Phase 8
    // does not need a migration for courses created before it.
    creator: {
      type: String,
      required: true,
      index: true,
    },

    // Pointers, not data. The ref string must match the model name exactly —
    // 'module' does not throw, populate just returns nothing.
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
    timestamps: true,
  },
);

// Covers the filter AND the sort of "my courses, newest first" in one pass.
courseSchema.index({ creator: 1, createdAt: -1 });

export default mongoose.model('Course', courseSchema);
