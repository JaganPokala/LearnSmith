import DailyUsage from '../models/DailyUsage.js';
import { getEntitlement } from './entitlementService.js';
import { ApiError } from '../middlewares/errorHandler.js';

export async function consumeDailyQuota({
  creator,
  identityType,
  resource,
  now = new Date(),
}) {
  if (typeof creator !== 'string' || !creator.trim()) {
    throw new Error('A creator is required to consume quota.');
  }

  // Only these counter names are allowed.
  if (!['courses', 'lessons', 'audio'].includes(resource)) {
    throw new Error('Unknown quota resource.');
  }

  const { limits } = await getEntitlement({ creator, identityType, now });
  const limit = limits[resource];

  const day = now.toISOString().slice(0, 10);

  const resetAt = new Date(`${day}T00:00:00.000Z`);
  resetAt.setUTCDate(resetAt.getUTCDate() + 1);

  await ensureDailyUsage({ creator, day });

  // Step 2: Atomically check the limit AND consume one allowance.
  const usage = await DailyUsage.findOneAndUpdate(
    {
      creator,
      day,
      // Older daily records have no audio counter. Treat that field as zero.
      $or: [{ [resource]: { $lt: limit } }, { [resource]: { $exists: false } }],
    },
    {
      $inc: {
        [resource]: 1,
      },
    },
    {
      returnDocument: 'after',
    },
  );

  if (!usage) {
    throw new ApiError(
      429,
      'daily_quota_exceeded',
      `Daily ${resource} limit reached (${limit}). ` +
        `Your allowance resets at ${resetAt.toISOString()}.`,
    );
  }

  return {
    day,
    resource,
    used: usage[resource],
    limit,
    remaining: limit - usage[resource],
    resetAt: resetAt.toISOString(),
  };
}

export async function ensureDailyUsage({ creator, day }, UsageModel = DailyUsage) {
  await UsageModel.init();
  try {
    await UsageModel.updateOne(
      { creator, day },
      { $setOnInsert: { creator, day, courses: 0, lessons: 0, audio: 0 } },
      { upsert: true, runValidators: true },
    );
  } catch (err) {
    // Concurrent requests may both try to create the same daily record.
    if (err.code !== 11000 || err.keyPattern?.creator !== 1 || err.keyPattern?.day !== 1) {
      throw err;
    }
  }
}
