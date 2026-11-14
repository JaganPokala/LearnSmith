export const PRO_DAILY_LIMITS = Object.freeze({ courses: 10, lessons: 50, audio: 20 });
export const DAILY_COURSE_ATTEMPT_LIMITS = Object.freeze({ guest: 10, free: 20, pro: 50 });

const LIMITS = {
  guest: Object.freeze({
    courses: 1,
    lessons: 5,
    audio: 2,
  }),

  free: Object.freeze({
    courses: 3,
    lessons: 20,
    audio: 10,
  }),
  pro: PRO_DAILY_LIMITS,
};

export function getDailyLimits(identityType, tier = 'free') {
  if (identityType === 'guest') {
    return LIMITS.guest;
  }

  if (identityType === 'user') {
    if (!['free', 'pro'].includes(tier)) throw new Error('Unknown account tier.');
    return LIMITS[tier];
  }

  throw new Error('Cannot select limits for an unknown identity type.');
}
