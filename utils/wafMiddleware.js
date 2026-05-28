const geoip = require('geoip-lite');
const rateLimit = require('express-rate-limit');
const RequestLog = require('../models/RequestLog');

// FIX 2: Tighter rate limit — 30 req/min per IP (was 100)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 30, // Reduced from 100 — a real user never needs 30 API calls/min
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for the /ping keep-alive route
  skip: (req) => req.path === '/ping',
  handler: async (req, res, next, options) => {
    const ip = req.ip || req.socket.remoteAddress;
    const geo = geoip.lookup(ip) || {};

    // Always log blocked requests — these are the important ones
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

// FIX 3: Only log errors (4xx/5xx) and blocked requests — not every single request.
// This eliminates thousands of pointless MongoDB writes per hour from normal traffic.
const requestLogger = async (req, res, next) => {
  res.on('finish', async () => {
    // Skip OPTIONS preflight, socket.io handshakes, and ping keep-alive
    if (req.method === 'OPTIONS') return;
    if (req.path.startsWith('/socket.io')) return;
    if (req.path === '/ping') return;

    // FIX 3: Only log errors (400+) — successful requests don't need individual DB writes
    if (res.statusCode < 400) return;

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
