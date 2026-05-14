// Notification Controller — fetch, mark read, and delete notifications
const Notification = require('../models/Notification');
const { sendSuccess, sendError } = require('../utils/response');

// ─── Get notifications for logged-in user ────────────────────────────────────
const getNotifications = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    return sendSuccess(res, {
      notifications,
      unreadCount,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Mark a notification as read ─────────────────────────────────────────────
const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return sendError(res, 'Notification not found', 404);

    if (notification.userId.toString() !== req.user._id.toString()) {
      return sendError(res, 'Access denied', 403);
    }

    notification.isRead = true;
    await notification.save();

    return sendSuccess(res, { notification }, 'Notification marked as read');
  } catch (err) {
    next(err);
  }
};

// ─── Mark all as read ────────────────────────────────────────────────────────
const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );
    return sendSuccess(res, {}, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
};

// ─── Delete a notification ────────────────────────────────────────────────────
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return sendError(res, 'Notification not found', 404);

    if (notification.userId.toString() !== req.user._id.toString()) {
      return sendError(res, 'Access denied', 403);
    }

    await notification.deleteOne();
    return sendSuccess(res, {}, 'Notification deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead, deleteNotification };
