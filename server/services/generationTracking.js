import GenerationCall from '../models/GenerationCall.js';
import { MODEL_PRICING } from '../config/modelPricing.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { traceError } from '../middlewares/trace.js';

const count = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

export function estimateTextCost({ model, usage, serviceTier }) {
  const inputTokens = count(usage?.prompt_tokens);
  const cachedInputTokens = count(usage?.prompt_tokens_details?.cached_tokens);
  const outputTokens = count(usage?.completion_tokens);
  const result = {
    inputTokens, cachedInputTokens, outputTokens,
    estimatedCostUsd: null, pricingSnapshot: null,
  };

  if ([inputTokens, cachedInputTokens, outputTokens].includes(null)) {
    return { ...result, costStatus: 'missing_usage' };
  }
  if (cachedInputTokens > inputTokens) {
    return { ...result, costStatus: 'invalid_usage' };
  }
  if (serviceTier !== 'default') {
    return { ...result, costStatus: 'unsupported_tier' };
  }
  if (
    (usage?.prompt_tokens_details?.audio_tokens ?? 0) !== 0 ||
    (usage?.completion_tokens_details?.audio_tokens ?? 0) !== 0 ||
    (usage?.prompt_tokens_details?.cache_write_tokens ?? 0) !== 0
  ) {
    return { ...result, costStatus: 'unsupported_usage' };
  }

  const pricing = Object.hasOwn(MODEL_PRICING, model) ? MODEL_PRICING[model] : null;
  if (!pricing) return { ...result, costStatus: 'unsupported_model' };

  // Cached tokens are already included in prompt_tokens. Reasoning tokens,
  // where present, are already included in completion_tokens.
  const usd = (
    (inputTokens - cachedInputTokens) * pricing.inputPerMillion +
    cachedInputTokens * pricing.cachedInputPerMillion +
    outputTokens * pricing.outputPerMillion
  ) / 1_000_000;

  return {
    ...result,
    estimatedCostUsd: Number(usd.toFixed(12)),
    pricingSnapshot: { model, ...pricing },
    costStatus: 'estimated',
  };
}

export function createGenerationTracker({
  CallModel = GenerationCall,
  logError = traceError,
} = {}) {
  async function start({ creator, generationId, operation, attemptNumber, requestedModel }) {
    if (
      typeof creator !== 'string' || !creator.trim() ||
      typeof generationId !== 'string' || !generationId.trim() ||
      !['course', 'lesson'].includes(operation) ||
      !Number.isSafeInteger(attemptNumber) || attemptNumber < 1 ||
      typeof requestedModel !== 'string' || !requestedModel.trim()
    ) {
      throw new ApiError(503, 'tracking_context_invalid', 'Generation identity was not initialized.');
    }

    try {
      await CallModel.init();
      return await CallModel.create({
        creator, generationId, operation, attemptNumber, requestedModel,
      });
    } catch {
      // Do not start paid work if its initial accounting record cannot be saved.
      throw new ApiError(503, 'tracking_unavailable', 'Generation accounting is unavailable. Try again later.');
    }
  }

  async function finish(call, fields) {
    try {
      const result = await CallModel.updateOne(
        { _id: call._id, outcome: 'unknown' },
        { $set: fields },
        { runValidators: true },
      );
      if (result.matchedCount !== 1) throw new Error('Accounting record missing');
      return true;
    } catch {
      // A provider call has already happened. Never retry paid work merely
      // because accounting failed. Leave the row unknown and emit metadata
      // for investigation without logging prompts, secrets, or error bodies.
      logError('generation_accounting_write_failed', JSON.stringify({
        generationId: call.generationId,
        attemptNumber: call.attemptNumber,
        ...fields,
      }));
      return false;
    }
  }

  async function response(call, res, durationMs) {
    const serviceTier = res.service_tier ?? 'default'; // Requests explicitly use default.
    return finish(call, {
      outcome: 'response_received',
      responseModel: res.model ?? null,
      providerResponseId: res.id ?? null,
      providerRequestId: res._request_id ?? null,
      serviceTier,
      finishReason: res.choices?.[0]?.finish_reason ?? null,
      usageDetails: res.usage ?? null,
      durationMs,
      ...estimateTextCost({ model: res.model, usage: res.usage, serviceTier }),
    });
  }

  async function failure(call, err, durationMs) {
    // Network errors and server errors cannot establish whether work was billed.
    const rejected = err.status >= 400 && err.status < 500 && err.status !== 408;
    return finish(call, {
      outcome: rejected ? 'request_failed' : 'unknown',
      errorCode: String(err.code ?? err.name ?? 'provider_error').slice(0, 120),
      providerRequestId: err.request_id ?? null,
      durationMs,
    });
  }

  async function validation(context, status, errorCode = null) {
    try {
      const result = await CallModel.updateOne(
        {
          generationId: context.generationId,
          attemptNumber: context.attemptNumber,
          outcome: 'response_received',
        },
        { $set: { validationStatus: status, validationErrorCode: errorCode } },
        { runValidators: true },
      );
      if (result.matchedCount !== 1) throw new Error('Accounting response unavailable');
    } catch {
      logError('generation_validation_write_failed', JSON.stringify({
        generationId: context.generationId, attemptNumber: context.attemptNumber,
        validationStatus: status, validationErrorCode: errorCode,
      }));
    }
  }

  return { start, response, failure, validation };
}

export const generationTracker = createGenerationTracker();
