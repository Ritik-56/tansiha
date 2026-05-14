// Google Vision OCR Service — extracts text from prescription images
// Gracefully handles missing API credentials (OCR_AVAILABLE flag)

let client = null;
let OCR_AVAILABLE = false;

const initOCR = () => {
  try {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credPath || credPath.includes('your_') || credPath === './google-vision-key.json') {
      const fs = require('fs');
      if (!credPath || !fs.existsSync(credPath)) {
        console.warn('⚠️  Google Vision OCR: credentials file not found. OCR will be unavailable.');
        return;
      }
    }
    const vision = require('@google-cloud/vision');
    client = new vision.ImageAnnotatorClient();
    OCR_AVAILABLE = true;
    console.log('✅ Google Vision OCR initialized');
  } catch (err) {
    console.warn('⚠️  Google Vision OCR could not be initialized:', err.message);
    OCR_AVAILABLE = false;
  }
};

// Initialize lazily on first call
let initialized = false;

/**
 * Extract all text from an image file using Google Vision OCR
 * @param {string} imagePath - absolute path to the uploaded image
 * @returns {string} extracted raw text
 */
const extractText = async (imagePath) => {
  if (!initialized) {
    initOCR();
    initialized = true;
  }

  if (!OCR_AVAILABLE) {
    throw new Error('OCR_UNAVAILABLE');
  }

  try {
    const [result] = await client.textDetection(imagePath);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      return '';
    }

    // First annotation contains the full extracted text
    return detections[0].description || '';
  } catch (err) {
    console.error('❌ Google Vision OCR error:', err.message);
    throw new Error('OCR service failed. Please try again or enter medicines manually.');
  }
};

module.exports = { extractText, isAvailable: () => OCR_AVAILABLE };
