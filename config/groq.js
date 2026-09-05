const Groq = require('groq-sdk');

console.log('🔍 Groq keys check:', {
  key1: process.env.GROQ_API_KEY?.substring(0, 10),
  key2: process.env.GROQ_API_KEY_2?.substring(0, 10),
  key3: process.env.GROQ_API_KEY_3?.substring(0, 10),
});

const API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
].filter(Boolean);

let currentKeyIndex = 0;

const getGroq = () => {
  if (!API_KEYS.length) {
    throw new Error('NO_GROQ_API_KEYS');
  }

  return new Groq({
    apiKey: API_KEYS[currentKeyIndex],
  });
};

const rotateKey = () => {
  if (API_KEYS.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;

    console.log(
      `🔑 Rotated to Groq key ${currentKeyIndex + 1} of ${API_KEYS.length}`
    );
  } else {
    console.warn('⚠️ Only 1 Groq key — cannot rotate');
  }
};

/*
 * Current Groq models.
 *
 * These are still accessed through Groq.
 * "openai/" is part of the model ID and does NOT mean
 * you need the OpenAI SDK or an OpenAI API key.
 */
const MODEL_CHAIN = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
];

const isQuotaError = (err) => {
  const message = err?.message?.toLowerCase() || '';

  return (
    err?.status === 429 ||
    message.includes('429') ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('resource_exhausted')
  );
};

const isModelError = (err) => {
  const message = err?.message?.toLowerCase() || '';

  return (
    err?.status === 404 ||
    message.includes('model_not_found') ||
    message.includes('model does not exist') ||
    message.includes('do not have access to it')
  );
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runWithFallback = async (fn) => {
  console.log(`📋 Groq keys available: ${API_KEYS.length}`);

  if (!API_KEYS.length) {
    throw new Error('NO_GROQ_API_KEYS');
  }

  console.log(
    `📋 Keys loaded: ${API_KEYS
      .map((k, i) => `key${i + 1}: ${k?.substring(0, 10)}...`)
      .join(', ')}`
  );

  let lastError = null;

  /*
   * Try each model.
   * For each model, try all available API keys.
   */
  for (let modelIdx = 0; modelIdx < MODEL_CHAIN.length; modelIdx++) {
    const modelName = MODEL_CHAIN[modelIdx];

    console.log(
      `\n🤖 Model ${modelIdx + 1}/${MODEL_CHAIN.length}: ${modelName}`
    );

    for (
      let keyAttempt = 0;
      keyAttempt < API_KEYS.length;
      keyAttempt++
    ) {
      try {
        const groq = getGroq();

        console.log(
          `🔄 Trying ${modelName} | Key slot: ${currentKeyIndex + 1}`
        );

        const result = await fn(groq, modelName);

        console.log(`✅ Success — ${modelName}`);

        return result;
      } catch (err) {
        lastError = err;

        /*
         * 429 = rate limit / quota
         * Rotate to the next Groq API key.
         */
        if (isQuotaError(err)) {
          console.warn(
            `⚠️ Quota/rate limit hit [${modelName}] ` +
            `key[${currentKeyIndex + 1}]`
          );

          if (keyAttempt < API_KEYS.length - 1) {
            rotateKey();
            await delay(1000);
            continue;
          }

          console.warn(
            `⛔ All keys exhausted for [${modelName}]`
          );

          break;
        }

        /*
         * 404 model_not_found
         * Don't rotate API keys because the problem is the model,
         * not the key. Move directly to the next model.
         */
        if (isModelError(err)) {
          console.warn(
            `⚠️ Model unavailable: ${modelName}`
          );

          console.warn(
            `➡️ Moving to next model...`
          );

          break;
        }

        /*
         * Authentication or other unexpected errors
         * Don't hide them.
         */
        console.error(
          `❌ Groq error [${modelName}]:`,
          err?.message || err
        );

        throw err;
      }
    }

    /*
     * Move to the next model.
     */
    if (modelIdx < MODEL_CHAIN.length - 1) {
      console.log(
        `➡️ Trying fallback model: ${MODEL_CHAIN[modelIdx + 1]}`
      );

      await delay(1000);
    }
  }

  /*
   * Everything failed.
   */
  if (lastError) {
    throw lastError;
  }

  throw new Error('GROQ_ALL_MODELS_FAILED');
};

console.log(
  `✅ Groq config loaded — ${API_KEYS.length} API key(s) available`
);

module.exports = {
  getGroq,
  rotateKey,
  runWithFallback,
};