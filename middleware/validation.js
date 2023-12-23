const mongoose = require('mongoose');

/**
 * Validate MongoDB ObjectId.
 * @param {string} id - The ObjectId to validate.
 * @returns {boolean} - Returns true if the ObjectId is valid, otherwise false.
 */
const validateObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

module.exports = {
  validateObjectId,
};
