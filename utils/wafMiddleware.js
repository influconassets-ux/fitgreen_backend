const geoip = require('geoip-lite');
const rateLimit = require('express-rate-limit');
const RequestLog = require('../models/RequestLog');

// Configuration for rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: async (req, res, next, options) => {
    // When rate limit is exceeded
    const ip = req.ip || req.socket.remoteAddress;
    const geo = geoip.lookup(ip) || {};
    
    // Log blocked request
    try {
      await RequestLog.create({
        ip: ip,
        region: geo.region || 'Unknown',
        country: geo.country || 'Unknown',
        method: req.method,
        url: req.originalUrl,
        userAgent: req.get('User-Agent') || 'Unknown',
        status: options.statusCode,
        isBlocked: true,
        blockReason: 'Rate limit exceeded (Bot protection)'
      });
    } catch (err) {
      console.error('Failed to log blocked request:', err);
    }

    res.status(options.statusCode).json({
      success: false,
      message: 'Too many requests, please try again later. (WAF Blocked)'
    });
  }
});

// Middleware to log all legitimate requests (optional, but requested for tracking IP/Region)
const requestLogger = async (req, res, next) => {
  // Execute after the response finishes to get the status code
  res.on('finish', async () => {
    // Avoid logging OPTIONS requests or static files if not needed
    if (req.method === 'OPTIONS') return;

    const ip = req.ip || req.socket.remoteAddress;
    const geo = geoip.lookup(ip) || {};

    try {
      await RequestLog.create({
        ip: ip,
        region: geo.region || 'Unknown',
        country: geo.country || 'Unknown',
        method: req.method,
        url: req.originalUrl,
        userAgent: req.get('User-Agent') || 'Unknown',
        status: res.statusCode,
        isBlocked: false
      });
    } catch (err) {
      console.error('Failed to log request:', err);
    }
  });

  next();
};

module.exports = {
  limiter,
  requestLogger
};
