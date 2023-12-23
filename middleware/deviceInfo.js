// middleware/deviceInfo.js
const ip = require('ip');
const useragent = require('express-useragent');

const captureDeviceInfo = (req, res, next) => {
  // Capture user IP address
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // Use express-useragent to parse user agent information
  const userAgent = useragent.parse(req.headers['user-agent']);

  // Attach device information to the request object
  req.deviceInfo = {
    ip: clientIp,
    os: userAgent.os,
    browser: userAgent.browser,
  };

  next();
};

module.exports = {
  captureDeviceInfo,
};
