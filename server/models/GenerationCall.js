import mongoose from 'mongoose';

const tokenCount = {
  type: Number,
  min: 0,
  default: null,
  validate: (value) => value === null || Number.isSafeInteger(value),
};

const generationCallSchema = new mongoose.Schema(
  {
    creator: {
      type: String,
      required: true,
    },

    // Groups all provider attempts for one generation.
    generationId: {
      type: String,
      required: true,
    },

    operation: {
      type: String,
      enum: ['course', 'lesson'],
      required: true,
    },

    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
    },

    provider: {
      type: String,
      default: 'openai',
      required: true,
    },

    requestedModel: {
      type: String,
      required: true,
    },

    responseModel: {
      type: String,
      default: null,
    },

    providerResponseId: {
      type: String,
      default: null,
    },

    providerRequestId: { type: String, default: null },
    serviceTier: { type: String, default: null },
    finishReason: { type: String, default: null },
    // Token details only; no prompts or generated lesson text.
    usageDetails: { type: mongoose.Schema.Types.Mixed, default: null },

    validationStatus: {
      type: String,
      enum: ['not_checked', 'accepted', 'rejected'],
      default: 'not_checked',
    },
    validationErrorCode: { type: String, default: null },

    inputTokens: { ...tokenCount },
    cachedInputTokens: { ...tokenCount },
    outputTokens: { ...tokenCount },

    durationMs: {
      type: Number,
      min: 0,
      default: null,
    },

    // Describes the provider call, not whether the lesson passed validation.
    outcome: {
      type: String,
      enum: ['response_received', 'request_failed', 'unknown'],
      default: 'unknown',
    },

    errorCode: {
      type: String,
      default: null,
    },

    estimatedCostUsd: {
      type: Number,
      min: 0,
      default: null,
    },

    costStatus: {
      type: String,
      enum: [
        'unknown', 'estimated', 'missing_usage', 'invalid_usage',
        'unsupported_model', 'unsupported_tier', 'unsupported_usage',
      ],
      default: 'unknown',
    },

    // Rates and pricing version used for the estimate; added later.
    pricingSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

generationCallSchema.index(
  { generationId: 1, attemptNumber: 1 },
  { unique: true },
);

generationCallSchema.index({ creator: 1, createdAt: -1 });

export default mongoose.model('GenerationCall', generationCallSchema);
