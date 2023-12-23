// middleware/auth.js
const jwt = require('jsonwebtoken');
const config = require('../config');

const verifyToken = (token) => {
  return jwt.verify(token, config.secretKey);
};

module.exports = { verifyToken };


