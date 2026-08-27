/**
 * server/models/Lesson.js
 *
 * The leaf. Holds the actual teaching content as an array of typed blocks:
 *
 *   [ { type: 'heading',   text: '...' },
 *     { type: 'paragraph', text: '...' },
 *     { type: 'code',      language: 'python', text: '...' },
 *     { type: 'video',     query: 'react hooks tutorial' },
 *     { type: 'mcq',       question: '...', options: [...], answer: 1,
 *                          explanation: '...' } ]
 *
 * TWO TRAPS LIVE IN THIS FILE:
 *
 * 1. `Mixed` VALIDATES NOTHING. It is an explicit opt-out from type checking.
 *    A block with type 'banana', an mcq with no `answer`, a string where an
 *    array belongs — all save without complaint. That is the correct choice
 *    here (blocks are genuinely heterogeneous), but it means validation MUST
 *    happen in Phase 3, before data ever reaches this file. Nothing below this
 *    line will protect you.
 *
 * 2. MONGOOSE CANNOT SEE CHANGES INSIDE A MIXED FIELD.
 *       lesson.content[0].text = 'new';
 *       await lesson.save();          // saves NOTHING. No error.
 *    You must call lesson.markModified('content') first. This will bite in
 *    Phase 4.3, where lesson content is written after lazy generation.
 */

import mongoose from 'mongoose';

const lessonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Defaults to empty and is NOT required: a lesson is created as a title
    // only when the course outline is generated, then filled in on first open
    // (Phase 4.3). Requiring it would force inventing placeholder content at
    // creation time.
    //
    // See trap 1 and trap 2 above before touching this field.
    content: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    // Milestone 8 asks the AI for these alongside the blocks; they render as a
    // bullet list at the top of the lesson.
    objectives: [
      {
        type: String,
        trim: true,
      },
    ],

    // The lazy-generation flag: false means "title only, content not generated
    // yet". Phase 4.3 reads this to choose between calling the AI and returning
    // the cached copy.
    //
    // A flag rather than checking content.length === 0, because those are not
    // the same question. A generation that legitimately produced zero blocks
    // would be retried forever by a length check; this records that we tried,
    // separately from what we got.
    isEnriched: {
      type: Boolean,
      default: false,
    },

    // Indexed for the same reason as Module.course: Task 2.3 deletes lessons
    // BY module.
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      required: true,
      index: true,
    },
  },
  {
    // updatedAt doubles as "when was this content generated".
    timestamps: true,
  },
);

export default mongoose.model('Lesson', lessonSchema);
