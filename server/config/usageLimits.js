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
};

export function getDailyLimits(identityType) {
  if (identityType === 'guest') {
    return LIMITS.guest;
  }

  if (identityType === 'user') {
    return LIMITS.free;
  }

  throw new Error('Cannot select limits for an unknown identity type.');
}
