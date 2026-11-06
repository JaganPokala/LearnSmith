import DailyUsage from '../models/DailyUsage.js';
import GenerationCall from '../models/GenerationCall.js';
import { creatorOf } from '../middlewares/auth.js';
import { getEntitlement } from '../services/entitlementService.js';

export async function getUsage(req, res) {
  const creator = creatorOf(req);
  const { limits, tier, expiresAt } = await getEntitlement({ creator, identityType: req.identityType });
  const day = new Date().toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const [usage, totals] = await Promise.all([
    DailyUsage.findOne({ creator, day }).lean(),
    GenerationCall.aggregate([
      { $match: {
        creator,
        operation: { $in: ['course', 'lesson', 'audio_translation', 'audio_speech'] },
        createdAt: { $gte: start, $lt: end },
      } },
      { $group: {
        _id: { $cond: [{ $in: ['$operation', ['course', 'lesson']] }, 'text', 'audio'] },
        calls: { $sum: 1 },
        knownInputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
        knownCachedInputTokens: { $sum: { $ifNull: ['$cachedInputTokens', 0] } },
        knownOutputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
        knownInputChars: { $sum: { $ifNull: ['$inputChars', 0] } },
        knownOutputBytes: { $sum: { $ifNull: ['$outputBytes', 0] } },
        knownEstimatedCostUsd: { $sum: { $ifNull: ['$estimatedCostUsd', 0] } },
        unpricedCalls: { $sum: { $cond: [
          { $eq: [{ $ifNull: ['$estimatedCostUsd', null] }, null] }, 1, 0,
        ] } },
        unknownOutcomeCalls: { $sum: { $cond: [{ $eq: ['$outcome', 'unknown'] }, 1, 0] } },
        rejectedContentCalls: { $sum: { $cond: [{ $eq: ['$validationStatus', 'rejected'] }, 1, 0] } },
        incompleteUsageCalls: { $sum: { $cond: [
          { $or: ['inputTokens', 'cachedInputTokens', 'outputTokens'].map(
            (field) => ({ $eq: [{ $ifNull: [`$${field}`, null] }, null] }),
          ) }, 1, 0,
        ] } },
      } },
    ]),
  ]);

  function summary(group, scope) {
    const { _id, ...calls } = totals.find((row) => row._id === group) ?? {
      calls: 0, knownInputTokens: 0, knownCachedInputTokens: 0,
      knownOutputTokens: 0, knownInputChars: 0, knownOutputBytes: 0,
      knownEstimatedCostUsd: 0, unpricedCalls: 0,
      unknownOutcomeCalls: 0, rejectedContentCalls: 0, incompleteUsageCalls: 0,
    };
    return {
      scope, ...calls,
      estimatedCostUsd: calls.unpricedCalls ? null : Number(calls.knownEstimatedCostUsd.toFixed(12)),
      costStatus: calls.unpricedCalls ? 'partial' : (calls.calls ? 'estimated' : 'no_calls'),
    };
  }

  const quota = Object.fromEntries(['courses', 'lessons', 'audio'].map((resource) => {
    const used = usage?.[resource] ?? 0;
    return [resource, { used, limit: limits[resource], remaining: Math.max(0, limits[resource] - used) }];
  }));

  res.set('Cache-Control', 'private, no-store');
  res.json({
    day, resetAt: end.toISOString(), quota, tier, entitlementExpiresAt: expiresAt,
    generation: summary('text', 'course_and_lesson_text'),
    audio: summary('audio', 'audio_translation_and_speech'),
  });
}
