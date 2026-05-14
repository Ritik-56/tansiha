const geminiService = require('./geminiService');

/**
 * Analyzes user message and current scheduling context using Gemini to extract medicine parameters
 * intelligently for multi-turn conversational medicine scheduling.
 * @param {string} userMessage - text sent by the user
 * @param {object} currentState - existing scheduling state from persistent memory
 * @returns {Promise<object|null>} parsed JSON structure containing extracted scheduling data
 */
const parseConversationalScheduling = async (userMessage, currentState = {}) => {
  const prompt = `
You are an advanced entity extraction parser for a conversational medicine scheduling system.
Analyze the user's message to extract or update medicine schedule parameters.

Current Active Scheduling State:
${JSON.stringify(currentState, null, 2)}

User Message: "${userMessage}"

INSTRUCTIONS:
1. Determine if the user intends to add, schedule, or configure a medication. If currentState.active is true, intent is automatically true since they are answering a follow-up question in the scheduling flow.
2. Extract the following fields if mentioned or implied in the User Message:
   - medicineName: string (name of medication, e.g. "Atorvastatin", "Metformin")
   - dosage: string (amount/strength, e.g. "20mg", "500 mg", "1 tablet", "10ml")
   - timing: array of strings in standard "HH:MM" 24-hour format (e.g. "5:00 PM" -> ["17:00"], "8am" -> ["08:00"], "morning and evening" -> ["08:00", "20:00"])
   - duration: integer representing total days (e.g. "for 30 days" -> 30, "one week" -> 7, "a month" -> 30)
3. Merge extracted values with the Current Active Scheduling State. If a field already has a valid value in the Current State, preserve it unless the User Message explicitly changes or overrides it.
4. Detect intelligent guidance category hints based on the medicineName:
   - isGastric: true if the medicine is gastric-related, antacid, proton pump inhibitor, or typically taken on an empty stomach.
   - isSleepRelated: true if the medicine is sleep-related, sedative, or commonly taken before bedtime.

CRITICAL: Return ONLY a valid JSON object matching the exact schema below. Do not include markdown code blocks, backticks, or conversational pleasantries.

{
  "isSchedulingIntent": true,
  "extracted": {
    "medicineName": "string or null",
    "dosage": "string or null",
    "timing": ["HH:MM"] or [],
    "duration": integer or null
  },
  "categoryHints": {
    "isGastric": true/false,
    "isSleepRelated": true/false
  }
}
`.trim();

  try {
    const responseText = await geminiService.generateResponse(prompt);
    
    // Strip markdown code block formatting if returned
    const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (err) {
    console.error('❌ [Scheduling Parser] Failed to parse conversational scheduling context:', err.message);
    return null;
  }
};

module.exports = { parseConversationalScheduling };
