const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean);

let currentKeyIndex = 0;

const getGenAI = () => new GoogleGenerativeAI(API_KEYS[currentKeyIndex]);

const rotateKey = () => {
  if (API_KEYS.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`🔑 Rotated to API key ${currentKeyIndex + 1} of ${API_KEYS.length}`);
  } else {
    console.warn('⚠️  Only 1 API key — cannot rotate');
  }
};

const MODEL_CHAIN = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];
const isQuotaError = (err) =>
  err?.status === 429                          ||
  err?.message?.includes('429')               ||
  err?.message?.includes('quota')             ||
  err?.message?.includes('limit: 0')          ||
  err?.message?.includes('RESOURCE_EXHAUSTED')||
  err?.message?.includes('Too Many Requests');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const runWithFallback = async (fn) => {
  for (let modelIdx = 0; modelIdx < MODEL_CHAIN.length; modelIdx++) {
    const modelName = MODEL_CHAIN[modelIdx];
    for (let keyAttempt = 0; keyAttempt < API_KEYS.length; keyAttempt++) {
      try {
        const model = getGenAI().getGenerativeModel({ model: modelName });
        console.log(`🤖 Trying model: ${modelName} | Key slot: ${currentKeyIndex + 1}`);
        const result = await fn(model);
        console.log(`✅ Success — ${modelName}`);
        return result;
      } catch (err) {
        if (isQuotaError(err)) {
          console.warn(`⚠️  Quota hit [${modelName}] key[${currentKeyIndex + 1}] — rotating...`);
          rotateKey();
          await delay(6000); // was 2000
        } else {
          throw err;
        }
      }
    }
    console.warn(`⛔ All keys exhausted for [${modelName}] — trying next model...`);
    await delay(10000); // was 3000
  }
  throw new Error('QUOTA_EXHAUSTED');
};
console.log(`✅ Gemini config loaded — ${API_KEYS.length} API key(s) available`);

module.exports = { getGenAI, rotateKey, runWithFallback };
