/**
 * Mounted at /api/lessons. Flat id routes rather than nesting under a course,
 * because the client already holds the lesson _id.
 */

import { Router } from 'express';
import {
  getLesson,
  getLessonGenerationStatus,
  generateLessonContent,
  getLessonAudio,
  generateLessonAudioContent,
} from '../controllers/lessonController.js';
import { requireDatabase } from '../middlewares/requireDatabase.js';
import { generationLimiter, learningWriteLimiter } from '../middlewares/burstLimits.js';
import { getLessonLearning, visitLesson, updateLessonProgress, submitQuizAttempt } from '../controllers/learningController.js';

const router = Router();

// On the router, so a route added later cannot forget it.
router.use(requireDatabase);

router.get('/:id', getLesson);
router.get('/:id/generation', getLessonGenerationStatus);
router.get('/:id/learning', getLessonLearning);
router.post('/:id/visit', learningWriteLimiter, visitLesson);
router.put('/:id/progress', learningWriteLimiter, updateLessonProgress);
router.post('/:id/quiz-attempts', learningWriteLimiter, submitQuizAttempt);
router.post('/:id/generate', generationLimiter, generateLessonContent);

// GET reads, POST pays. Same split as the lesson itself: a revalidation or a
// link preview must never start a billed synthesis.
router.get('/:id/audio', getLessonAudio);
router.post('/:id/audio', generationLimiter, generateLessonAudioContent);

export default router;
