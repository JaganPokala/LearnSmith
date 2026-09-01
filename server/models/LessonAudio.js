import mongoose from 'mongoose';

/**
 * Generated narration for one lesson, kept OUT of the lesson document.
 *
 * A three-minute mp3 is 1-3 MB. Embedded in Lesson, every GET /api/lessons/:id
 * would ship those megabytes to build a page that mostly shows text — for a
 * feature most readers never open. Its own collection means the audio is
 * fetched only by the endpoint that serves audio.
 *
 * Not GridFS: that exists for files over the 16 MB document limit, and these
 * are nowhere near it.
 *
 * Not the filesystem: Render's disk is ephemeral, so a file written here is
 * gone at the next deploy or restart.
 */
const lessonAudioSchema = new mongoose.Schema(
  {
    // unique: one narration per lesson. The index is what makes "already
    // generated?" a single indexed lookup rather than a scan, and what stops
    // two simultaneous requests storing two copies.
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
      unique: true,
      index: true,
    },

    mp3: { type: Buffer, required: true },

    /** Characters of Hinglish spoken — what the generation actually cost. */
    chars: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const LessonAudio = mongoose.model('LessonAudio', lessonAudioSchema);
