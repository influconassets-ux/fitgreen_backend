const express = require('express');
const router = express.Router();
const RequestLog = require('../models/RequestLog');

// Get all traffic logs (with pagination and filtering)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Optional filters
    const filter = {};
    if (req.query.isBlocked !== undefined) {
      filter.isBlocked = req.query.isBlocked === 'true';
    }
    if (req.query.ip) {
      filter.ip = new RegExp(req.query.ip, 'i');
    }

    const logs = await RequestLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalLogs = await RequestLog.countDocuments(filter);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total: totalLogs,
        page,
        pages: Math.ceil(totalLogs / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
});

module.exports = router;
