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

const getGroq = () => new Groq({ apiKey: API_KEYS[currentKeyIndex] });

const rotateKey = () => {
  if (API_KEYS.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`🔑 Rotated to Groq key ${currentKeyIndex + 1} of ${API_KEYS.length}`);
  } else {
    console.warn('⚠️  Only 1 Groq key — cannot rotate');
  }
};

const MODEL_CHAIN = [
  'llama-3.1-8b-instant',   // fastest, best for chat
  'gemma2-9b-it',            // fallback
];

const isQuotaError = (err) =>
  err?.status === 429                          ||
  err?.message?.includes('429')               ||
  err?.message?.includes('quota')             ||
  err?.message?.includes('rate limit')        ||
  err?.message?.includes('Rate limit')        ||
  err?.message?.includes('RESOURCE_EXHAUSTED');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));



const runWithFallback = async (fn) => {
  console.log(`📋 Groq keys available: ${API_KEYS.length}`);
  console.log(`📋 Keys loaded: ${API_KEYS.map((k, i) => `key${i+1}: ${k?.substring(0,10)}...`).join(', ')}`);
  
  for (let modelIdx = 0; modelIdx < MODEL_CHAIN.length; modelIdx++) {
    const modelName = MODEL_CHAIN[modelIdx];
    for (let keyAttempt = 0; keyAttempt < API_KEYS.length; keyAttempt++) {
      try {
        const groq = getGroq();
        console.log(`🤖 Trying model: ${modelName} | Key slot: ${currentKeyIndex + 1}`);
        const result = await fn(groq, modelName);
        console.log(`✅ Success — ${modelName}`);
        return result;
      } catch (err) {
        if (isQuotaError(err)) {
          console.warn(`⚠️  Quota hit [${modelName}] key[${currentKeyIndex + 1}] — rotating...`);
          rotateKey();
          await delay(3000);
        } else {
          throw err;
        }
      }
    }
    console.warn(`⛔ All keys exhausted for [${modelName}] — trying next model...`);
    await delay(5000);
  }
  throw new Error('QUOTA_EXHAUSTED');
};

console.log(`✅ Groq config loaded — ${API_KEYS.length} API key(s) available`);

module.exports = { getGroq, rotateKey, runWithFallback };