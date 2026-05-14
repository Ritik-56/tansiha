/**
 * Medicine Parser — converts raw OCR text into structured medicine objects.
 *
 * Prescription text is messy, so this uses heuristics + regex.
 * The frontend MUST allow the user to manually edit the parsed output.
 *
 * Example prescription line:
 *   "Tab. Metformin 500mg - twice daily for 30 days"
 *   "Amoxicillin 250mg 1-0-1 x 5 days"
 */

// Common timing keywords → normalized timing array
const TIMING_MAP = {
  'once daily': ['08:00'],
  'od': ['08:00'],
  'twice daily': ['08:00', '20:00'],
  'bd': ['08:00', '20:00'],
  'bid': ['08:00', '20:00'],
  'three times': ['08:00', '14:00', '20:00'],
  'thrice': ['08:00', '14:00', '20:00'],
  'tds': ['08:00', '14:00', '20:00'],
  'tid': ['08:00', '14:00', '20:00'],
  'four times': ['08:00', '12:00', '16:00', '20:00'],
  'qid': ['08:00', '12:00', '16:00', '20:00'],
  'at night': ['21:00'],
  'hs': ['21:00'],
  'morning': ['08:00'],
  'afternoon': ['14:00'],
  'evening': ['19:00'],
};

// Pattern: "1-0-1" → morning/afternoon/evening dosing shorthand
const parseDosagePattern = (text) => {
  const match = text.match(/\b(\d)-(\d)-(\d)\b/);
  if (!match) return null;

  const timings = [];
  if (parseInt(match[1]) > 0) timings.push('08:00');
  if (parseInt(match[2]) > 0) timings.push('14:00');
  if (parseInt(match[3]) > 0) timings.push('20:00');
  return timings.length > 0 ? timings : null;
};

// Extract duration in days from text
const parseDuration = (text) => {
  const match = text.match(/(\d+)\s*(day|days|week|weeks|month|months)/i);
  if (!match) return 7; // default 7 days if not found

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('week')) return value * 7;
  if (unit.startsWith('month')) return value * 30;
  return value;
};

// Extract dosage string (e.g. "500mg", "1 tablet")
const parseDosageStr = (text) => {
  const match = text.match(/\b(\d+\s*mg|\d+\s*ml|\d+\s*mcg|\d+\s*tablet[s]?|\d+\s*cap[sule]*s?)\b/i);
  return match ? match[0].trim() : 'As prescribed';
};

// Extract timing array from text
const parseTiming = (text) => {
  const lower = text.toLowerCase();

  // Try 1-0-1 pattern first
  const pattern = parseDosagePattern(text);
  if (pattern) return pattern;

  // Try keyword map
  for (const [keyword, times] of Object.entries(TIMING_MAP)) {
    if (lower.includes(keyword)) return times;
  }

  return ['08:00']; // Default: morning
};

// Strip common medicine prefixes (Tab., Cap., Inj., Syr.)
const cleanMedicineName = (name) => {
  return name.replace(/^(tab\.?|cap\.?|inj\.?|syr\.?|syp\.?|drops?\.?)\s*/i, '').trim();
};

/**
 * Main parser — splits OCR text into lines and tries to extract medicines
 * @param {string} rawText - full OCR extracted text
 * @returns {Array} array of medicine objects ready for frontend editing
 */
const parseMedicines = (rawText) => {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3); // ignore very short lines

  const medicines = [];

  for (const line of lines) {
    // Skip lines that look like dates, headers, clinic names
    if (/^(date|dr\.|name|age|rx|address|phone|patient|ref)/i.test(line)) continue;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(line)) continue; // pure dates

    // Look for medicine-like lines — contain a capitalized word + dosage or timing
    const hasDosageInfo =
      /\d+\s*(mg|ml|mcg|tablet|cap|iu)/i.test(line) ||
      /\b(daily|twice|tds|bd|od|hs|bid|tid|qid|morning|evening|night)\b/i.test(line) ||
      /\d-\d-\d/.test(line);

    if (!hasDosageInfo) continue;

    // Extract medicine name — first word(s) before dosage numbers
    const nameMatch = line.match(/^([A-Za-z\s\.]+?)(?:\s+\d|\s+-\s+\d|$)/);
    const rawName = nameMatch ? nameMatch[1] : line.split(' ')[0];
    const medicineName = cleanMedicineName(rawName);

    if (!medicineName || medicineName.length < 2) continue;

    medicines.push({
      medicineName,
      dosage: parseDosageStr(line),
      timing: parseTiming(line),
      duration: parseDuration(line),
      startDate: new Date().toISOString().split('T')[0], // default today
      reminderEnabled: true,
      notes: '',
      // Flag so the frontend knows this was auto-parsed and needs review
      needsReview: true,
    });
  }

  return medicines;
};

module.exports = { parseMedicines };
