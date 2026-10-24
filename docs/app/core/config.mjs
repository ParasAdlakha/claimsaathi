// Every setting in one place. All keys are optional: without them ClaimSaathi runs on
// the sample policy, the sample bill and hand-written bilingual explanations.
// globalThis.process is absent in the browser build (docs/app), where keys are never set.
const env = globalThis.process?.env || {};

export const config = {
  port: Number(env.PORT || 8795),
  openaiKey: env.OPENAI_API_KEY || '',
  textModel: env.AI_MODEL || 'gpt-5-mini',
  visionModel: env.VISION_MODEL || 'gpt-5-mini',
  // Rough public list prices (USD per 1M tokens) used to show what each AI call cost.
  pricePerMTokIn: Number(env.PRICE_IN || 0.25),
  pricePerMTokOut: Number(env.PRICE_OUT || 2.0),
  maxUploadBytes: 8 * 1024 * 1024,
};

export const aiEnabled = () => Boolean(config.openaiKey);
