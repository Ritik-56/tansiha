// Auth Controller — handles register, login, logout, and current user
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');

// ─── Helper: attach JWT as an httpOnly cookie ─────────────────────────────────
const attachTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
};

// ─── Register Patient ─────────────────────────────────────────────────────────
const registerPatient = async (req, res, next) => {
  try {
    const { fullName, email, phone, password, age, gender, medicalHistory } = req.body;

    // Check if phone or email already registered
    const existing = await User.findOne({ $or: [{ phone }, { email }] });
    if (existing) {
      return sendError(res, 'Email or Phone number is already registered', 409);
    }

    const user = await User.create({
      fullName,
      email,
      phone,
      password,
      role: 'patient',
      age,
      gender,
      medicalHistory,
    });

    const token = generateToken({ id: user._id, role: user.role });
    attachTokenCookie(res, token);

    return sendCreated(res, {
      token,
      user: {
        id: user._id,
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        age: user.age,
        gender: user.gender,
      },
    }, 'Patient registered successfully');
  } catch (err) {
    next(err);
  }
};

// ─── Register Caretaker ───────────────────────────────────────────────────────
const registerCaretaker = async (req, res, next) => {
  try {
    const { fullName, email, phone, password, relationship } = req.body;

    const existing = await User.findOne({ $or: [{ phone }, { email }] });
    if (existing) {
      return sendError(res, 'Email or Phone number is already registered', 409);
    }

    const user = await User.create({
      fullName,
      email,
      phone,
      password,
      role: 'caretaker',
      relationship,
    });

    const token = generateToken({ id: user._id, role: user.role });
    attachTokenCookie(res, token);

    return sendCreated(res, {
      token,
      user: {
        id: user._id,
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        relationship: user.relationship,
      },
    }, 'Caretaker registered successfully');
  } catch (err) {
    next(err);
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    const query = identifier.includes('@') ? { email: identifier.toLowerCase() } : { phone: identifier };

    // Explicitly select password (it's hidden by default via select: false)
    const user = await User.findOne(query).select('+password');
    if (!user) {
      return sendError(res, 'Invalid credentials', 401);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return sendError(res, 'Invalid credentials', 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Your account has been deactivated', 403);
    }

    const token = generateToken({ id: user._id, role: user.role });
    attachTokenCookie(res, token);

    return sendSuccess(res, {
      token,
      user: {
        id: user._id,
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
const logout = (req, res) => {
  res.clearCookie('token');
  return sendSuccess(res, {}, 'Logged out successfully');
};

// ─── Get Current User (me) ────────────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    // req.user is already set by the protect middleware
    const user = await User.findById(req.user._id);
    return sendSuccess(res, { user }, 'Current user fetched');
  } catch (err) {
    next(err);
  }
};

// ─── Update FCM Token ─────────────────────────────────────────────────────────
const updateFCMToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return sendError(res, 'FCM token is required', 400);

    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    return sendSuccess(res, {}, 'FCM token updated');
  } catch (err) {
    next(err);
  }
};

module.exports = { registerPatient, registerCaretaker, login, logout, getMe, updateFCMToken };
