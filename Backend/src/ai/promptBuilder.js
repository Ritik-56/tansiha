/**
 * Prompt Builder — constructs safe, structured prompts for Gemini.
 *
 * All prompts include:
 * - A clear role definition ("You are a health assistant, NOT a doctor")
 * - Safety guardrails to prevent medical over-prescription
 * - Instructions to keep responses concise and user-friendly
 */

const SYSTEM_CONTEXT = `
You are MediSync AI, a friendly healthcare assistant built into a medication adherence app.
You help patients understand symptoms, medicines, and adherence tips.

IMPORTANT RULES:
- You are NOT a doctor. Never diagnose or prescribe medications.
- Always recommend consulting a qualified healthcare professional for medical decisions.
- Keep responses clear, empathetic, and easy to understand.
- Avoid using heavy medical jargon without explanation.
- Always include a reminder to consult a doctor for serious symptoms.
- NEVER suggest specific prescription medicines — only general OTC (over-the-counter) guidance.
`.trim();

const SCHEDULE_INSTRUCTIONS = `
If the user asks about setting up a medicine schedule, adding a medicine, or managing their medications,
you may suggest a structured schedule. When you do, always end your response with a JSON block in this EXACT format:

<SCHEDULE>
{
  "medicines": [
    {
      "medicineName": "Medicine Name",
      "dosage": "dosage amount",
      "timing": ["HH:MM", "HH:MM"],
      "duration": 30,
      "notes": "optional notes"
    }
  ]
}
</SCHEDULE>

Only include the SCHEDULE block if the user is clearly asking to set up or add a medicine schedule.
Do NOT include it for general health questions.
Always remind the user to confirm with their doctor before following any AI-suggested schedule.
`;

/**
 * Build a symptom guidance prompt
 * @param {string} userMessage - user's current question/symptom
 * @param {Array} history - array of { role: 'user'|'assistant', content: string }
 * @param {Object} userProfile - patient's medical history and demographic details
 */
const buildSymptomPrompt = (userMessage, history = [], userProfile = null) => {
  let conversationContext = '';

  if (history.length > 0) {
    conversationContext = history
      .slice(-6) // only keep last 3 exchanges to avoid token bloat
      .map((h) => `${h.role === 'user' ? 'Patient' : 'MediSync AI'}: ${h.content}`)
      .join('\n');
    conversationContext = `\nPrevious conversation:\n${conversationContext}\n`;
  }

  let profileContext = '';
  if (userProfile) {
    const mh = userProfile.medicalHistory || {};
    const meds = userProfile.currentMedicines || [];
    const stats = userProfile.adherenceStats || {};
    const today = userProfile.todayAdherence || {};

    const formattedMeds = meds.length > 0
      ? meds.map(m => `  - ${m.medicineName}: ${m.dosage} taken at ${Array.isArray(m.timing) ? m.timing.join(', ') : m.timing} (Duration: ${m.duration} days, Status: ${m.status})`).join('\n')
      : '  No active medicines found in schedule database.';

    profileContext = `
=== REAL-TIME APPLICATION CONTEXT AWARENESS ===
Patient Name: ${userProfile.fullName || 'User'}
Demographics: Age ${userProfile.age || 'Unknown'}, Gender ${userProfile.gender || 'Unknown'}

Medical History & Health Context:
- Chronic Conditions: ${mh.conditions && mh.conditions.length > 0 ? mh.conditions.join(', ') : 'None reported'}
- Allergies: ${mh.allergies && mh.allergies.length > 0 ? mh.allergies.join(', ') : 'None reported'}
- Historical Medications: ${mh.medications && mh.medications.length > 0 ? mh.medications.join(', ') : 'None reported'}
- General Notes: ${mh.notes || 'None'}

Real MongoDB Active Medicine Schedule:
${formattedMeds}

Adherence Overview (${stats.period || 'Last 30 days'}):
- Overall Adherence Percentage: ${stats.adherenceRate ?? 0}%
- Doses Taken: ${stats.takenCount ?? 0}
- Doses Missed: ${stats.missedCount ?? 0}

Today's Real-Time Synchronization State:
- Taken Today: ${today.takenCount ?? 0}
- Missed Today: ${today.missedCount ?? 0}
===============================================

CRITICAL INSTRUCTIONS FOR CENTRAL INTELLIGENT ASSISTANT:
1. You are directly connected to the user's actual live database state. If the user asks "Show my medicines", "List my schedule", "What medicines am I taking?", or queries about their active schedule, reminders, or adherence percentage, you MUST answer accurately using the real active medicine schedule block above. Do NOT say "There are no medicines" if medicines exist above.
2. If the user asks about missed medicines or adherence stats, refer directly to the Adherence Overview and Today's Synchronization State.
3. Keep your replies concise, friendly, helpful, and answer directly as an integrated MediSync app assistant.
`;
  }

  // Check if the user's message involves medicine scheduling
  const schedulingKeywords = ['add medicine', 'schedule', 'reminder', 'take medicine', 'medication schedule', 'set up', 'plan my'];
  const wantsSchedule = schedulingKeywords.some(kw => userMessage.toLowerCase().includes(kw));
  const scheduleHint = wantsSchedule ? `\n${SCHEDULE_INSTRUCTIONS}` : '';

  return `
${SYSTEM_CONTEXT}
${profileContext}
${conversationContext}
Patient: ${userMessage}
${scheduleHint}

MediSync AI (respond in 3-5 sentences, be empathetic and helpful):
`.trim();
};

/**
 * Extract a structured medicine schedule from an AI response if present.
 * Returns null if no schedule block is found.
 * @param {string} aiResponse
 * @returns {Object|null} { medicines: [...] } or null
 */
const extractMedicineSchedule = (aiResponse) => {
  try {
    const match = aiResponse.match(/<SCHEDULE>([\s\S]*?)<\/SCHEDULE>/);
    if (!match) return null;

    const jsonStr = match[1].trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.medicines || !Array.isArray(parsed.medicines)) return null;

    // Validate and sanitize each medicine entry
    const medicines = parsed.medicines
      .filter((m) => m.medicineName && m.dosage)
      .map((m) => ({
        medicineName: String(m.medicineName).trim(),
        dosage: String(m.dosage).trim(),
        timing: Array.isArray(m.timing) ? m.timing : ['08:00'],
        duration: typeof m.duration === 'number' ? m.duration : 30,
        notes: m.notes || '',
      }));

    return medicines.length > 0 ? { medicines } : null;
  } catch (_) {
    return null;
  }
};

/**
 * Clean AI response text — removes the <SCHEDULE> block for display
 * @param {string} aiResponse
 * @returns {string} clean display text
 */
const cleanResponseText = (aiResponse) => {
  return aiResponse.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g, '').trim();
};

/**
 * Build an adherence improvement suggestions prompt
 * @param {number} adherenceRate - e.g. 65
 * @param {Array} missedMedicines - array of medicine names missed
 */
const buildAdherencePrompt = (adherenceRate, missedMedicines = []) => {
  const missedList = missedMedicines.length > 0
    ? `Medicines frequently missed: ${missedMedicines.join(', ')}.`
    : 'No specific medicines provided.';

  return `
${SYSTEM_CONTEXT}

A patient has a medication adherence rate of ${adherenceRate}%.
${missedList}

Please provide 3-4 practical, friendly, and motivating tips to help them improve their medication adherence.
Keep each tip concise (1-2 sentences). Be encouraging, not judgmental.
`.trim();
};

/**
 * Build a medicine explanation prompt
 * @param {string} medicineName - name of the medicine to explain
 */
const buildMedicineExplainPrompt = (medicineName) => {
  return `
${SYSTEM_CONTEXT}

A patient wants to understand the medicine: "${medicineName}".

Please explain:
1. What it is commonly used for (in simple terms)
2. Common side effects to watch out for
3. General precautions (e.g., with food, other medicines)
4. When to contact a doctor immediately

Keep the explanation simple, friendly, and under 200 words.
Always remind the patient to follow their doctor's specific instructions.
`.trim();
};

module.exports = {
  buildSymptomPrompt,
  buildAdherencePrompt,
  buildMedicineExplainPrompt,
  extractMedicineSchedule,
  cleanResponseText,
};
