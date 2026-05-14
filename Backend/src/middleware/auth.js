// Auth middleware — verifies JWT and attaches user to req
const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const { sendError } = require('../utils/response');

/**
 * Protect routes — requires a valid JWT in Authorization header or cookie
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    // Fallback to httpOnly cookie
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return sendError(res, 'Not authenticated. Please login.', 401);
    }

    // Verify token
    const decoded = verifyToken(token);

    // Attach user to request (excluding password)
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return sendError(res, 'User not found. Token is invalid.', 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Your account has been deactivated.', 403);
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'Session expired. Please login again.', 401);
    }
    return sendError(res, 'Invalid token.', 401);
  }
};

/**
 * Role-based authorization middleware
 * Usage: authorize('patient') or authorize('caretaker') or authorize('patient', 'caretaker')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(
        res,
        `Access denied. This route is for: ${roles.join(', ')}`,
        403
      );
    }
    next();
  };
};

module.exports = { protect, authorize };
