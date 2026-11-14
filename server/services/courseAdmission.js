import { DAILY_COURSE_ATTEMPT_LIMITS } from '../config/usageLimits.js';
import { ApiError } from '../middlewares/errorHandler.js';
import DailyUsage from '../models/DailyUsage.js';
import { getEntitlement } from './entitlementService.js';
import { ensureDailyUsage } from './usageService.js';

function belowLimit(field, limit) {
  return { $or: [{ [field]: { $lt: limit } }, { [field]: { $exists: false } }] };
}

export function createCourseAdmission({
  UsageModel = DailyUsage,
  resolveEntitlement = getEntitlement,
} = {}) {
  async function reserveCourseAttempt({ creator, identityType, generationId, now = new Date() }) {
    if (typeof creator !== 'string' || !creator.trim() || typeof generationId !== 'string' || !generationId.trim()) {
      throw new Error('A creator and generation ID are required to reserve a course attempt.');
    }
    const { limits, tier } = await resolveEntitlement({ creator, identityType, now });
    const courseLimit = limits.courses;
    const attemptLimit = DAILY_COURSE_ATTEMPT_LIMITS[tier];
    if (!Number.isSafeInteger(courseLimit) || courseLimit < 1 || !Number.isSafeInteger(attemptLimit)) {
      throw new Error('Invalid course admission limits.');
    }
    const day = now.toISOString().slice(0, 10);
    const identity = { creator, day };
    await ensureDailyUsage(identity, UsageModel);

    const result = await UsageModel.updateOne(
      {
        ...identity,
        courseReservationIds: { $ne: generationId },
        $and: [belowLimit('courses', courseLimit), belowLimit('courseAttempts', attemptLimit)],
      },
      { $inc: { courses: 1, courseAttempts: 1 }, $push: { courseReservationIds: generationId } },
    );
    if (result.modifiedCount === 1) return { ...identity, generationId };

    // A read after a failed update only explains the refusal. It never admits work.
    const usage = await UsageModel.findOne(identity).select('courses courseAttempts').lean();
    const reset = new Date(`${day}T00:00:00.000Z`);
    reset.setUTCDate(reset.getUTCDate() + 1);
    const resets = `Your allowance resets at ${reset.toISOString()}.`;
    if (usage?.courses >= courseLimit) {
      throw new ApiError(429, 'daily_quota_exceeded', `Daily courses limit reached (${courseLimit}). ${resets}`);
    }
    if (usage?.courseAttempts >= attemptLimit) {
      throw new ApiError(429, 'daily_course_attempts_exceeded', `Daily course attempt limit reached (${attemptLimit}). ${resets}`);
    }
    throw new ApiError(503, 'course_admission_unavailable', 'Could not reserve a course attempt. Try again.');
  }

  async function settleCourseAttempt({ creator, day, generationId }, { refundCourse }) {
    const filter = { creator, day, courseReservationIds: generationId };
    const update = { $pull: { courseReservationIds: generationId } };
    if (refundCourse) {
      filter.courses = { $gt: 0 };
      update.$inc = { courses: -1 };
    }
    await UsageModel.updateOne(filter, update);
  }

  return { reserveCourseAttempt, settleCourseAttempt };
}

export const { reserveCourseAttempt, settleCourseAttempt } = createCourseAdmission();
