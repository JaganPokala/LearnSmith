/**
 * server/routes/courses.js
 *
 * URL shapes only. No logic — the controller owns that.
 *
 * Mounted in server.js with app.use('/api/courses', coursesRouter), so paths
 * here are relative to that. '/generate' becomes /api/courses/generate.
 */

import { Router } from 'express';
import { createCourse, listCourses, getCourse, removeCourse } from '../controllers/courseController.js';
import { requireDatabase } from '../middlewares/requireDatabase.js';

const router = Router();

// Applied to the whole router: every course route touches the database, and
// listing it once here is what stops a future route being added without it.
router.use(requireDatabase);

// POST /api/courses/generate
router.post('/generate', createCourse);

// GET /api/courses
router.get('/', listCourses);

// GET /api/courses/:id
//
// Registered AFTER /generate. Express matches in registration order, and ':id'
// would happily match the string "generate" — putting this first would turn
// POST /generate's sibling GET into a lookup for a course whose id is
// "generate". Specific paths before parameterised ones, always.
router.get('/:id', getCourse);

// DELETE /api/courses/:id
router.delete('/:id', removeCourse);

export default router;
