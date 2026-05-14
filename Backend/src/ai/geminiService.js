const { GoogleGenerativeAI } = require('@google/generative-ai');

// Cache instance
let genAI = null;

const getGenAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(key.trim());
    console.log('🤖 Gemini SDK initialized successfully');
  }
  return genAI;
};

/**
 * Send a prompt to Gemini and return the text response.
 * Uses getGenerativeModel() and generateContent() per latest SDK syntax.
 * Attempts gemini-1.5-flash as the primary requested model, with seamless automatic
 * fallback to newer flash models if the API key encounters a 404 Model Not Found error.
 * @param {string} prompt - fully constructed prompt string
 * @returns {Promise<string>} AI response text
 */
const generateResponse = async (prompt) => {
  const ai = getGenAI();

  // Primary model requested by instructions, followed by supported fallback options
  const modelsToTry = [
    'gemini-1.5-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-flash-latest'
  ];

  let lastError = null;

  console.log(`🚀 Prompt sent to Gemini (length: ${prompt.length} chars)`);

  for (const modelName of modelsToTry) {
    try {
      console.log(`🔄 Gemini initialized with model: ${modelName}`);
      const model = ai.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error('Gemini returned an empty response');
      }

      console.log(`✅ Gemini response received successfully from ${modelName} (length: ${text.length} chars)`);
      return text;
    } catch (err) {
      console.warn(`⚠️ Attempt with model ${modelName} failed: ${err.message}`);
      lastError = err;
      
      // If it's a 404 / model not found error, gracefully continue to fallback models
      if (err.message?.includes('not found') || err.message?.includes('404') || err.status === 404) {
        continue;
      }
      
      // If blocked by safety filters, throw immediately
      if (err.message?.includes('SAFETY') || err.message?.includes('safety')) {
        throw new Error('SAFETY: Your message was blocked by safety filters. Please rephrase.');
      }
    }
  }

  // If all attempted models failed, log properly and throw
  console.error('❌ All compatible Gemini models failed to generate a response.');
  if (lastError) {
    throw lastError;
  }
  throw new Error('AI service is temporarily unavailable. Please try again.');
};

module.exports = { generateResponse };
