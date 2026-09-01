/**
 * Mounted at /api/lessons. Flat id routes rather than nesting under a course,
 * because the client already holds the lesson _id.
 */

import { Router } from 'express';
import {
  getLesson,
  generateLessonContent,
  getLessonAudio,
  generateLessonAudioContent,
} from '../controllers/lessonController.js';
import { requireDatabase } from '../middlewares/requireDatabase.js';

const router = Router();

// On the router, so a route added later cannot forget it.
router.use(requireDatabase);

router.get('/:id', getLesson);
router.post('/:id/generate', generateLessonContent);

// GET reads, POST pays. Same split as the lesson itself: a revalidation or a
// link preview must never start a billed synthesis.
router.get('/:id/audio', getLessonAudio);
router.post('/:id/audio', generateLessonAudioContent);

export default router;
