// OCR Controller — receive prescription image, extract text, parse medicines
// Handles missing OCR key gracefully with a clear fallback message
const ocrService = require('../ocr/ocrService');
const medicineParser = require('../ocr/medicineParser');
const { sendSuccess, sendError } = require('../utils/response');
const fs = require('fs');

const extractFromPrescription = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 'Please upload a prescription image', 400);
    }

    const imagePath = req.file.path;

    // Check if OCR is available before attempting
    if (!ocrService.isAvailable()) {
      // Clean up uploaded file
      fs.unlink(imagePath, () => {});
      return sendError(
        res,
        'OCR service is currently unavailable. The Google Vision API key has not been configured. Please add your medicines manually.',
        503
      );
    }

    // Step 1: Extract raw text using Google Vision OCR
    let rawText;
    try {
      rawText = await ocrService.extractText(imagePath);
    } catch (ocrErr) {
      fs.unlink(imagePath, () => {});
      if (ocrErr.message === 'OCR_UNAVAILABLE') {
        return sendError(
          res,
          'OCR service is currently unavailable. Please add your medicines manually.',
          503
        );
      }
      throw ocrErr;
    }

    if (!rawText || rawText.trim().length === 0) {
      fs.unlink(imagePath, () => {});
      return sendError(res, 'Could not extract text from this image. Try a clearer photo.', 422);
    }

    // Step 2: Parse medicines from raw text
    const medicines = medicineParser.parseMedicines(rawText);

    // Clean up uploaded file after processing
    fs.unlink(imagePath, () => {}); // non-blocking, ignore errors

    return sendSuccess(res, {
      rawText,
      medicines, // Editable list — always allow manual correction
      message:
        'OCR extraction complete. Please review and correct any details before saving.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { extractFromPrescription };
