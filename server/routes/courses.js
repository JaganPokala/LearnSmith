/**
 * Mounted at /api/courses. URL shapes only; the controller owns the logic.
 */

import { Router } from 'express';
import { createCourse, listCourses, getCourse, removeCourse } from '../controllers/courseController.js';
import { requireDatabase } from '../middlewares/requireDatabase.js';
import { requireUser } from '../middlewares/auth.js';

const router = Router();

// On the router, so a route added later cannot forget it.
router.use(requireDatabase);

router.post('/generate', createCourse);
// The ONLY route that demands a login. Everything else works for a guest,
// which is what lets a visitor generate and read a course without an account.
router.get('/', requireUser, listCourses);

// AFTER /generate: Express matches in registration order and ':id' would match
// the literal string "generate".
router.get('/:id', getCourse);

router.delete('/:id', removeCourse);

export default router;
