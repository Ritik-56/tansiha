// Centralized error handler — catches all errors thrown in controllers
const { sendError } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  // Always log the full error in development
  console.error(`❌ [${req.method}] ${req.originalUrl}`);
  console.error('   Message:', err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error('   Stack:', err.stack);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return sendError(res, messages.join('. '), 400);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return sendError(res, `${field} already exists`, 409);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    return sendError(res, `Invalid ID: ${err.value}`, 400);
  }

  // Multer file size / type errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(res, 'File too large. Max 5MB allowed.', 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'Invalid token.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 'Token expired. Please login again.', 401);
  }

  // Generic fallback
  const statusCode = err.statusCode || 500;
  const isDev = process.env.NODE_ENV === 'development';
  const message = isDev
    ? (err.message || 'Internal Server Error')
    : (statusCode < 500 ? err.message : 'Internal Server Error');
  return sendError(res, message, statusCode);
};

module.exports = { errorHandler };
