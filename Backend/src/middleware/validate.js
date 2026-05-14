// Validation middleware — checks express-validator results and returns errors
const { validationResult } = require('express-validator');
const { sendError } = require('../utils/response');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    return sendError(res, messages[0], 422, errors.array());
  }
  next();
};

module.exports = { validate };
