import Lesson from '../models/Lesson.js';
import Course from '../models/Course.js';
import { ApiError } from '../middlewares/errorHandler.js';

export async function findOwnedLesson(lessonId, creator) {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson || !(await Course.exists({ _id: lesson.course, creator }))) {
    throw new ApiError(404, 'lesson_not_found', 'This lesson does not exist or is not available to you.');
  }
  return lesson;
}
