// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const Moment = require('../models/Moment');

const verifyToken = (token) => {
  return jwt.verify(token, 'your-secret-key'); // Replace 'your-secret-key' with your actual secret key
};

const authenticateUser = (req, res, next) => {
  try {
    const token = req.headers.authorization;
    const user = verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};

const authorizeUser = async (req, res, next) => {
  try {
    const momentId = req.params.momentId;
    const userId = req.user.userId;

    const moment = await Moment.findById(momentId);

    if (!moment) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    if (moment.user.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to perform this action' });
    }

    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { authenticateUser, authorizeUser };
