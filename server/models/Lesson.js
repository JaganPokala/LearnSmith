/**
 * The leaf. Holds teaching content as an array of typed blocks:
 * heading | paragraph | code | video | mcq.
 */

import mongoose from 'mongoose';

const lessonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // TWO TRAPS:
    //  1. Mixed validates NOTHING. type:'banana', an mcq with no answer, a
    //     string where an array belongs — all save silently. Validate before
    //     the data ever reaches here.
    //  2. Mongoose cannot see mutations INSIDE a Mixed field.
    //       lesson.content[0].text = 'x'; await lesson.save();  // saves nothing
    //     Assign the whole array, or call markModified('content').
    content: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    objectives: [
      {
        type: String,
        trim: true,
      },
    ],

    // The lazy-generation flag. A flag rather than content.length === 0: a
    // generation that legitimately produced zero blocks would retry forever.
    isEnriched: {
      type: Boolean,
      default: false,
    },

    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      required: true,
      index: true,
    },

    // DENORMALISED — reachable as module -> course, stored twice. Safe only
    // because a lesson never moves, so the copies cannot drift. Buys one
    // indexed query for lesson counts, ownership checks and cascade delete.
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model('Lesson', lessonSchema);
