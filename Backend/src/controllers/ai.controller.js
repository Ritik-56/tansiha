// AI Controller — symptom guidance chatbot powered by Gemini
// Supports: chat, adherence suggestions, medicine explanation, and chat-to-schedule workflow
const geminiService = require('../ai/geminiService');
const promptBuilder = require('../ai/promptBuilder');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');
const Chat = require('../models/Chat');
const schedulingService = require('../ai/schedulingService');
const AdherenceLog = require('../models/AdherenceLog');
const CaregiverPatientLink = require('../models/CaregiverPatientLink');
const { startOfDay, endOfDay, subDays } = require('date-fns');

// Helper to verify if the user has authorization for a target patient ID
const verifyPatientAccess = async (user, targetPatientId) => {
  if (!targetPatientId) return false;
  if (user.role === 'patient') {
    return user._id.toString() === targetPatientId.toString();
  }
  if (user.role === 'caretaker') {
    const link = await CaregiverPatientLink.findOne({
      caretakerId: user._id,
      patientId: targetPatientId,
      status: 'accepted',
    });
    return !!link;
  }
  return false;
};

// ─── Helper: fetch patient profile for AI context ────────────────────────────
const getPatientContext = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (user && user.role === 'patient') {
      // Fetch all live active medicines from MongoDB
      const medicines = await Medicine.find({ patientId: userId, status: 'active' }).sort({ createdAt: -1 });

      // Fetch today's real adherence logs
      const today = new Date();
      const todayLogs = await AdherenceLog.find({
        patientId: userId,
        scheduledDate: { $gte: startOfDay(today), $lte: endOfDay(today) },
      });

      // Calculate last 30 days overall adherence stats directly from DB
      const fromDate = startOfDay(subDays(today, 29));
      const monthLogs = await AdherenceLog.find({
        patientId: userId,
        scheduledDate: { $gte: fromDate, $lte: endOfDay(today) },
      });

      const total = monthLogs.length;
      const taken = monthLogs.filter((l) => l.status === 'taken').length;
      const missed = monthLogs.filter((l) => l.status === 'missed').length;
      const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 0;

      const todayTaken = todayLogs.filter((l) => l.status === 'taken').length;
      const todayMissed = todayLogs.filter((l) => l.status === 'missed').length;

      return {
        fullName: user.name || user.fullName,
        age: user.age,
        gender: user.gender,
        medicalHistory: user.medicalHistory,
        currentMedicines: medicines.map((m) => ({
          id: m._id,
          medicineName: m.medicineName,
          dosage: m.dosage,
          timing: m.timing,
          duration: m.duration,
          startDate: m.startDate,
          endDate: m.endDate,
          status: m.status,
          notes: m.notes,
        })),
        adherenceStats: {
          period: 'Last 30 days',
          adherenceRate,
          takenCount: taken,
          missedCount: missed,
        },
        todayAdherence: {
          takenCount: todayTaken,
          missedCount: todayMissed,
          logs: todayLogs.map((l) => ({
            medicineId: l.medicineId,
            status: l.status,
            scheduledTime: l.scheduledTime,
          })),
        },
      };
    }
  } catch (err) {
    console.error('❌ [AI Controller] Failed to compile centralized application context:', err.message);
  }
  return null;
};

// ─── Symptom Guidance Chat ────────────────────────────────────────────────────
const chat = async (req, res, next) => {
  try {
    console.log('📥 [AI Controller] Chat request received');
    const { message, history, patientId } = req.body;
    const targetUserId = patientId || (req.user ? req.user._id : null);

    if (!message || message.trim().length === 0) {
      console.warn('⚠️ [AI Controller] Chat request rejected: Message is empty');
      return sendError(res, 'Message is required', 400);
    }

    if (req.user) {
      const hasAccess = await verifyPatientAccess(req.user, targetUserId);
      if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);
    }

    let chatDoc = null;
    let replyText = '';
    let scheduleCreated = false;
    let scheduleData = null;

    if (targetUserId) {
      chatDoc = await Chat.findOne({ userId: targetUserId });
      if (!chatDoc) {
        chatDoc = new Chat({ userId: targetUserId, messages: [] });
      }

      // ─── Task 2 & 3: Conversational Scheduling Flow & Memory ────────────────
      const schedulingContext = chatDoc.schedulingState || { active: false, medicineName: '', dosage: '', timing: [], duration: null, step: '' };
      
      // Analyze intent and extract multi-turn parameters using Gemini
      const parsed = await schedulingService.parseConversationalScheduling(message, schedulingContext);

      if (parsed && parsed.isSchedulingIntent) {
        console.log('🔄 [AI Controller] Conversational scheduling intent detected');
        
        // Merge extracted parameters into memory state
        const ext = parsed.extracted || {};
        const medName = ext.medicineName || schedulingContext.medicineName || '';
        const dosage = ext.dosage || schedulingContext.dosage || '';
        const timing = (ext.timing && ext.timing.length > 0) ? ext.timing : (schedulingContext.timing || []);
        const duration = ext.duration || schedulingContext.duration || null;

        // Check missing details flow intelligently
        if (!medName) {
          chatDoc.schedulingState = { active: true, medicineName: '', dosage, timing, duration, step: 'ask_name' };
          replyText = "Sure, I can help you schedule a medicine. What is the name of the medication?";
        } else if (!dosage) {
          chatDoc.schedulingState = { active: true, medicineName: medName, dosage: '', timing, duration, step: 'ask_dosage' };
          replyText = `What dosage of **${medName}** should I add? (commonly prescribed amounts: 20mg, 500mg, 1 tablet, etc.)`;
        } else if (!timing || timing.length === 0) {
          chatDoc.schedulingState = { active: true, medicineName: medName, dosage, timing: [], duration, step: 'ask_timing' };
          
          // Smart guidance wording per task instructions
          const hints = parsed.categoryHints || {};
          if (hints.isGastric) {
            replyText = `What time should you take **${medName}**? This medicine is usually taken on an empty stomach in the morning. Suggested timing: 08:00 AM.`;
          } else if (hints.isSleepRelated) {
            replyText = `What time should you take **${medName}**? This medicine is commonly taken before bedtime. Suggested timing: 09:00 PM.`;
          } else {
            replyText = `What time should you take **${medName}**? (e.g., 8:00 AM, 5 PM daily)`;
          }
        } else if (!duration) {
          chatDoc.schedulingState = { active: true, medicineName: medName, dosage, timing, duration: null, step: 'ask_duration' };
          replyText = `For how many days should I schedule **${medName}**? (e.g., 5 days, 30 days)`;
        } else {
          // All details present! Create actual schedule conversationally
          console.log(`✅ [AI Controller] All scheduling parameters collected for ${medName}. Creating schedule automatically.`);
          
          const startDate = new Date();
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + Number(duration));

          await Medicine.create({
            patientId: targetUserId,
            medicineName: medName,
            dosage,
            timing,
            duration: Number(duration),
            startDate,
            endDate,
            reminderEnabled: true,
            notes: 'Added via conversational AI assistant',
            addedViaOCR: false,
          });

          // Clear temporary scheduling context completely upon completion
          chatDoc.schedulingState = { active: false, medicineName: '', dosage: '', timing: [], duration: null, step: '' };
          
          replyText = `✅ I have successfully scheduled **${medName} (${dosage})** at **${timing.join(', ')}** daily for **${duration} days**. The dashboard and reminders have been updated automatically!`;
          scheduleCreated = true;
        }

        // Save messages directly to chat persistence
        chatDoc.messages.push({ from: 'user', text: message, timestamp: new Date() });
        chatDoc.messages.push({ from: 'ai', text: replyText, timestamp: new Date() });
        await chatDoc.save();

        console.log('📤 [AI Controller] Conversational scheduling response sent');
        return sendSuccess(res, {
          reply: replyText,
          scheduleData: null,
          scheduleCreated, // Emits custom event for automated real-time reload
          disclaimer: '⚠️ AI-generated schedule configuration. Always follow your doctor\'s instructions.',
        });
      }
    }

    // ─── Normal Symptom Guidance Chat Flow ──────────────────────────────────
    let userContext = null;
    if (targetUserId) {
      userContext = await getPatientContext(targetUserId);
      console.log(`👤 [AI Controller] Fetched context for target patient ID: ${targetUserId}`);
    }

    const prompt = promptBuilder.buildSymptomPrompt(message, history || [], userContext);
    console.log('📝 [AI Controller] Prompt built successfully');

    const aiResponse = await geminiService.generateResponse(prompt);
    console.log('📬 [AI Controller] Response received from Gemini service');

    scheduleData = promptBuilder.extractMedicineSchedule(aiResponse);
    if (scheduleData) {
      console.log('📅 [AI Controller] Extracted structured medicine schedule suggestion');
    }

    replyText = promptBuilder.cleanResponseText(aiResponse);

    if (chatDoc) {
      chatDoc.messages.push({ from: 'user', text: message, timestamp: new Date() });
      chatDoc.messages.push({ from: 'ai', text: replyText, timestamp: new Date() });
      await chatDoc.save();
      console.log(`💾 [AI Controller] Normal chat history persisted for user ID: ${targetUserId}`);
    }

    console.log('📤 [AI Controller] AI response sent to frontend successfully');
    return sendSuccess(res, {
      reply: replyText,
      scheduleData,
      scheduleCreated: false,
      disclaimer: '⚠️ This is AI-generated guidance only. It is NOT a substitute for professional medical advice. Always consult a qualified doctor.',
    });
  } catch (err) {
    console.error('❌ [AI Controller] Chat request failed with error:', err.message);
    next(err);
  }
};

// ─── Fetch Persistent Chat History ────────────────────────────────────────────
const getChatHistory = async (req, res, next) => {
  try {
    if (!req.user) {
      return sendError(res, 'Not authenticated', 401);
    }
    const targetUserId = req.query.patientId || req.user._id;
    const hasAccess = await verifyPatientAccess(req.user, targetUserId);
    if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);

    const chatDoc = await Chat.findOne({ userId: targetUserId });
    const messages = chatDoc ? chatDoc.messages : [];
    return sendSuccess(res, { messages }, 'Chat history fetched successfully');
  } catch (err) {
    next(err);
  }
};

// ─── Confirm & Save AI-Suggested Medicine Schedule ───────────────────────────
// Called after user confirms the chat-to-schedule suggestion
const confirmSchedule = async (req, res, next) => {
  try {
    const { medicines, patientId } = req.body; // Array of { medicineName, dosage, timing, duration }
    const targetUserId = patientId || (req.user ? req.user._id : null);

    if (!medicines || !Array.isArray(medicines) || medicines.length === 0) {
      return sendError(res, 'No medicines provided', 400);
    }

    if (req.user) {
      const hasAccess = await verifyPatientAccess(req.user, targetUserId);
      if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);
    }

    const saved = [];
    const startDate = new Date();

    for (const med of medicines) {
      if (!med.medicineName || !med.dosage) continue;

      const duration = med.duration || 30;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Number(duration));

      const timing = Array.isArray(med.timing) && med.timing.length > 0
        ? med.timing
        : ['08:00'];

      const medicine = await Medicine.create({
        patientId: targetUserId,
        medicineName: med.medicineName,
        dosage: med.dosage,
        timing,
        duration,
        startDate,
        endDate,
        reminderEnabled: true,
        notes: med.notes || 'Added via AI chat assistant',
        addedViaOCR: false,
      });

      saved.push(medicine);
    }

    return sendCreated(res, {
      medicines: saved,
      count: saved.length,
    }, `${saved.length} medicine(s) saved to schedule ✅`);
  } catch (err) {
    next(err);
  }
};

// ─── Adherence Suggestions ────────────────────────────────────────────────────
const getAdherenceSuggestion = async (req, res, next) => {
  try {
    const { adherenceRate, missedMedicines } = req.body;

    const prompt = promptBuilder.buildAdherencePrompt(adherenceRate, missedMedicines || []);
    const aiResponse = await geminiService.generateResponse(prompt);

    return sendSuccess(res, {
      suggestion: aiResponse,
      disclaimer:
        '⚠️ AI-generated suggestion only. Not medical advice. Consult your healthcare provider.',
    });
  } catch (err) {
    next(err);
  }
};

// ─── OCR Medicine Understanding ───────────────────────────────────────────────
const explainMedicine = async (req, res, next) => {
  try {
    const { medicineName } = req.body;
    if (!medicineName) return sendError(res, 'Medicine name is required', 400);

    const prompt = promptBuilder.buildMedicineExplainPrompt(medicineName);
    const aiResponse = await geminiService.generateResponse(prompt);

    return sendSuccess(res, {
      explanation: aiResponse,
      disclaimer:
        '⚠️ This information is for educational purposes only. Always follow your doctor\'s instructions.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { chat, confirmSchedule, getAdherenceSuggestion, explainMedicine, getChatHistory };
