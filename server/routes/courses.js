/**
 * Mounted at /api/courses. URL shapes only; the controller owns the logic.
 */

import { Router } from 'express';
import { createCourse, listCourses, getCourse, removeCourse } from '../controllers/courseController.js';
import { requireDatabase } from '../middlewares/requireDatabase.js';

const router = Router();

// On the router, so a route added later cannot forget it.
router.use(requireDatabase);

router.post('/generate', createCourse);
router.get('/', listCourses);

// AFTER /generate: Express matches in registration order and ':id' would match
// the literal string "generate".
router.get('/:id', getCourse);

router.delete('/:id', removeCourse);

export default router;
