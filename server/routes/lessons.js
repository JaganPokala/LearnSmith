/**
 * server/routes/lessons.js
 *
 * Mounted at /api/lessons.
 *
 * Lessons get their own router rather than nesting under
 * /api/courses/:id/modules/:i/lessons/:j — the client already holds the lesson
 * _id from the course tree, and a flat id route means one lookup instead of
 * walking three collections to find something we can address directly.
 */

import { Router } from 'express';
import { generateLessonContent, getLesson } from '../controllers/lessonController.js';
import { requireDatabase } from '../middlewares/requireDatabase.js';

const router = Router();

// Every lesson route touches the database. Same reasoning as routes/courses.js:
// applied to the router so a route added later cannot forget it.
router.use(requireDatabase);

// GET /api/lessons/:id — read, never writes
router.get('/:id', getLesson);

// POST /api/lessons/:id/generate — writes the body if it does not exist yet
router.post('/:id/generate', generateLessonContent);

export default router;
