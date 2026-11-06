/**
 * Lazy lesson content: lessons are created as titles only and the body is
 * written the first time somebody opens one, then served from the database.
 *
 * A 5x4 course is 20 lessons at ~9-13s each — generating them all up front is
 * four minutes of spinner for lessons most users never open.
 */

import Lesson from '../models/Lesson.js';
import Module from '../models/Module.js';
import Course from '../models/Course.js';
import { generateLesson } from '../services/lessonGenerator.js';
import { creatorOf } from '../middlewares/auth.js';
import { resolveVideoBlocks } from '../services/youtube.js';
import { generateLessonAudio, prepareNarration } from '../services/audio.js';
import { features } from '../config/env.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { trace, traceError } from '../middlewares/trace.js';
import { consumeDailyQuota } from '../services/usageService.js';
import {
  findReadyAudio, claimAudioGeneration, renewAudioGeneration,
  completeAudioGeneration, failAudioGeneration,
} from '../services/audioGenerationState.js';

import {
  claimLessonGeneration,
  completeLessonGeneration,
  failLessonGeneration,
} from '../services/lessonGenerationState.js';


/**
 * POST /api/lessons/:id/generate
 * First call generates (~9-13s) and saves; later calls return the copy (~70ms).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */

export function createGenerateLessonContent({
    generate = generateLesson,
    resolveVideos = resolveVideoBlocks,
    consumeQuota = consumeDailyQuota,
  } = {}) {
    return async function generateLessonContent(req, res) {
    const startedAt = performance.now();

    // A malformed id throws CastError -> 400 invalid_id, handled centrally.
    const lesson = await Lesson.findById(req.params.id);

    if (!lesson) {
      throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
    }

    // OWNERSHIP, on the denormalised `course` field — one indexed lookup instead
    // of walking module -> course. The module is needed only for its title, which
    // is context for the generator, so both run in parallel.
    const [course, module] = await Promise.all([
      Course.findOne({ _id: lesson.course, creator: creatorOf(req) }),
      Module.findById(lesson.module),
    ]);

    // Same 404 for "no such lesson", "orphaned" and "not yours" — which one it
    // was is ours to debug, not the caller's to learn.
    if (!course || !module) {
      throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
    }

    // isEnriched, NOT content.length: a generation that legitimately produced
    // zero blocks would be retried forever by a length check.
    if (lesson.isEnriched) {
      trace(
        `  lesson: "${lesson.title}" cache hit, ${Math.round(performance.now() - startedAt)}ms, ${lesson.content.length} blocks`
      );

      return res.json(lesson);
    }

    const claim = await claimLessonGeneration(lesson._id, course._id);

    if (!claim) {
      // Another request may have finished after our initial cache check.
      const latest = await Lesson.findOne({
        _id: lesson._id,
        course: course._id,
      });

      if (!latest) {
        throw new ApiError(
          404,
          'lesson_not_found',
          'This lesson no longer exists.',
        );
      }

      if (latest.isEnriched) {
        return res.json(latest);
      }

      throw new ApiError(
        409,
        'generation_in_progress',
        'This lesson is already being generated. Try again shortly.',
      );
    }

    const { attemptId } = claim;

    try {
      // Cache hits and unsuccessful claims return before consuming quota.
      // Keep this inside try so quota rejection releases this attempt's claim.
      await consumeQuota({
        creator: creatorOf(req),
        identityType: req.identityType,
        resource: 'lessons',
      });

      const { lesson: generated, ms } = await generate({
        courseTitle: course.title,
        moduleTitle: module.title,
        lessonTitle: claim.lesson.title,
      }, {
        creator: creatorOf(req),
        generationId: attemptId,
      });

      const content = await resolveVideos(generated.content);

      const saved = await completeLessonGeneration({
        lessonId: lesson._id,
        courseId: course._id,
        attemptId,
        content,
        objectives: generated.objectives,
      });

      if (!saved) {
        throw new ApiError(
          409,
          'generation_claim_lost',
          'This generation attempt expired or was replaced. Reload the lesson.',
        );
      }

      trace(
        `lesson=${lesson._id} attempt=${attemptId} generated in ${ms}ms`,
      );

      return res.json(saved);
    } catch (err) {
      try {
        await failLessonGeneration({
          lessonId: lesson._id,
          courseId: course._id,
          attemptId,
        });
      } catch (cleanupError) {
        // Preserve the original failure.
        // If cleanup fails, lease expiration still permits recovery.
        traceError(
          `Generation cleanup failed: lesson=${lesson._id} ` +
          `attempt=${attemptId} error=${cleanupError.message}`,
        );
      }

      throw err;
    }
  };
}

export const generateLessonContent = createGenerateLessonContent();



/**
 * GET /api/lessons/:id — the lesson plus the context the page frames it with:
 * course and module for the breadcrumb, siblings for the rail, position/total.
 *
 * NEVER GENERATES. A read must be safe to repeat — a refresh or a link preview
 * would otherwise each trigger ~12s of billed generation. An unwritten lesson
 * comes back isEnriched:false and the client decides whether to POST.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getLesson(req, res) {
  const lesson = await Lesson.findById(req.params.id);

  if (!lesson) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  // The module is populated rather than queried because THE ARRAY ORDER IS THE
  // LESSON ORDER — Lesson.find({ module }) returns them in whatever order the
  // database felt like, and the rail would silently scramble.
  const [course, module] = await Promise.all([
    Course.findOne({ _id: lesson.course, creator: creatorOf(req) }).select('title'),
    Module.findById(lesson.module)
      .select('title lessons')
      .populate({ path: 'lessons', select: 'title isEnriched' }),
  ]);

  if (!course || !module) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  const siblings = module.lessons;
  const index = siblings.findIndex((s) => String(s._id) === String(lesson._id));

  trace(
    `  lesson: read "${lesson.title}" isEnriched=${lesson.isEnriched} blocks=${lesson.content.length}`
  );

  res.json({
    lesson,
    course: { _id: course._id, title: course.title },
    module: { _id: module._id, title: module.title },
    siblings,
    // -1 means the lesson is not listed in its own module's array — a broken
    // link the UI should not render a number for.
    position: index === -1 ? null : index + 1,
    total: siblings.length,
  });
}

/**
 * Load a lesson and prove the caller owns it, or throw.
 *
 * Ownership is checked through the denormalised `course` field (D31) with the
 * creator IN THE QUERY (D28) — a findById plus a check afterwards is a
 * different thing, and a worse one.
 *
 * @param {import('express').Request} req
 * @returns {Promise<object>} the Lesson document
 */
async function ownedLesson(req) {
  const lesson = await Lesson.findById(req.params.id);

  if (!lesson) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  const course = await Course.findOne({ _id: lesson.course, creator: creatorOf(req) }).select('_id');

  // 404, not 403: a lesson you may not read should be indistinguishable from
  // one that does not exist, or the response confirms it is there.
  if (!course) {
    throw new ApiError(404, 'lesson_not_found', `No lesson with id ${req.params.id}.`);
  }

  return lesson;
}

/**
 * GET /api/lessons/:id/audio — stream stored narration.
 *
 * NEVER GENERATES, for the same reason getLesson does not: a browser
 * revalidating, a prefetch or a link preview would each start a billed
 * synthesis. 404 means "not made yet", and the client POSTs.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getLessonAudio(req, res) {
  await ownedLesson(req);

  const audio = await findReadyAudio(req.params.id);

  if (!audio) {
    throw new ApiError(404, 'audio_not_found', 'This lesson has no narration yet.');
  }

  trace(`  audio: cache hit, ${Math.round(audio.mp3.length / 1024)}KB`);

  res.set('Content-Type', 'audio/mpeg');
  res.set('Content-Length', String(audio.mp3.length));
  // Recheck ownership when accounts change in the same browser. The database
  // cache still avoids provider calls; HTTP caching could bypass this check.
  res.set('Cache-Control', 'private, no-store');

  res.send(audio.mp3);
}

/**
 * POST /api/lessons/:id/audio — generate the narration, then return it.
 *
 * A database claim admits one job before quota/provider work. Subsequent
 * requests receive saved bytes or a conflict while that job is active.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function createGenerateLessonAudioContent({
  generate = generateLessonAudio,
  consumeQuota = consumeDailyQuota,
  ttsEnabled = () => features.tts,
} = {}) {
  return async function generateLessonAudioContent(req, res) {
    res.set('Cache-Control', 'private, no-store');
    const startedAt = performance.now();

    const lesson = await ownedLesson(req);

    // The REAL signal, not a proxy for it. A character-count guard in audio.js
    // let an unwritten lesson through whenever its TITLE happened to be long
    // enough, and paid to read that title aloud. `isEnriched` is what every other
    // part of the app already uses to mean "this lesson has content".
    if (!lesson.isEnriched) {
      throw new ApiError(
        400,
        'nothing_to_narrate',
        'This lesson has not been written yet. Write it first, then it can be read aloud.'
      );
    }

    const existing = await findReadyAudio(lesson._id);

    if (existing) {
      trace(`  audio: "${lesson.title}" cache hit, ${Math.round(existing.mp3.length / 1024)}KB`);

      res.set('Content-Type', 'audio/mpeg');
      return res.send(existing.mp3);
    }

    // Cached narration remains playable if the speech provider is disabled.
    if (!ttsEnabled()) {
      throw new ApiError(503, 'tts_unavailable', 'Audio narration is not configured on this server.');
    }
    prepareNarration(lesson); // Reject unusable input before spending allowance.

    const claim = await claimAudioGeneration(lesson._id);
    if (!claim) {
      const latest = await findReadyAudio(lesson._id);
      if (latest) {
        res.set('Content-Type', 'audio/mpeg');
        return res.send(latest.mp3);
      }
      throw new ApiError(409, 'audio_generation_in_progress', 'Narration is already being generated. Check again shortly.');
    }

    const context = { lessonId: lesson._id, attemptId: claim.attemptId };
    const lostClaim = () => new ApiError(
      409, 'audio_claim_lost', 'This audio attempt expired or was replaced. Check for saved audio before retrying.',
    );

    try {
      await consumeQuota({ creator: creatorOf(req), identityType: req.identityType, resource: 'audio' });
      const { bytes, chars } = await generate(lesson, {
        creator: creatorOf(req), generationId: claim.attemptId,
        beforeProviderCall: async () => {
          if (!(await renewAudioGeneration(context))) throw lostClaim();
        },
      });
      const saved = await completeAudioGeneration({ ...context, bytes, chars });
      if (!saved) throw lostClaim();

      trace(`audio=${lesson._id} attempt=${claim.attemptId} stored in ${Math.round(performance.now() - startedAt)}ms`);

      res.set('Content-Type', 'audio/mpeg');
      return res.status(201).send(saved.mp3);
    } catch (err) {
      try {
        await failAudioGeneration(context);
      } catch {
        traceError(`Audio cleanup failed: lesson=${lesson._id} attempt=${claim.attemptId}`);
      }
      throw err;
    }
  };
}

export const generateLessonAudioContent = createGenerateLessonAudioContent();
