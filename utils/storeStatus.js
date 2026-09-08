const moment = require('moment-timezone');

/**
 * Calculates the current store status and next state change time.
 * @param {Object} settings - The settings document from the database
 * @returns {Object} { isStoreOpen, nextStateChangeTime, nextStateChangeReason }
 */
function getComputedStoreStatus(settings) {
  // Get current time in India Standard Time
  const now = moment().tz('Asia/Kolkata');
  const currentDay = now.day(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const currentHour = now.hour(); // 0-23
  const currentMinute = now.minute();

  let isNormalScheduleOpen = false;
  let normalCloseTime = null;
  let normalOpenTime = null;

  // 1. Determine Normal Schedule
  if (currentDay === 0) {
    // Sunday: Closed all day
    isNormalScheduleOpen = false;
    // Next open is Monday 12:00 PM
    normalOpenTime = moment(now).add(1, 'days').hour(12).minute(0).second(0);
  } else if (currentDay >= 1 && currentDay <= 5) {
    // Mon-Fri: 12:00 PM to 9:00 PM (21:00)
    if (currentHour >= 12 && currentHour < 21) {
      isNormalScheduleOpen = true;
      normalCloseTime = moment(now).hour(21).minute(0).second(0);
    } else {
      isNormalScheduleOpen = false;
      if (currentHour < 12) {
        normalOpenTime = moment(now).hour(12).minute(0).second(0);
      } else {
        // Next open is tomorrow 12:00 PM
        normalOpenTime = moment(now).add(1, 'days').hour(12).minute(0).second(0);
      }
    }
  } else if (currentDay === 6) {
    // Sat: 12:00 PM to 7:00 PM (19:00)
    if (currentHour >= 12 && currentHour < 19) {
      isNormalScheduleOpen = true;
      normalCloseTime = moment(now).hour(19).minute(0).second(0);
    } else {
      isNormalScheduleOpen = false;
      if (currentHour < 12) {
        normalOpenTime = moment(now).hour(12).minute(0).second(0);
      } else {
        // Next open is Monday 12:00 PM (skip Sunday)
        normalOpenTime = moment(now).add(2, 'days').hour(12).minute(0).second(0);
      }
    }
  }

  // 2. Check Manual Override
  let isManuallyClosed = false;
  let manualCloseUntil = null;

  if (settings && settings.manualCloseUntil) {
    manualCloseUntil = moment(settings.manualCloseUntil).tz('Asia/Kolkata');
    if (manualCloseUntil.isAfter(now)) {
      isManuallyClosed = true;
    }
  }

  // 3. Final Decision
  const isStoreOpen = isNormalScheduleOpen && !isManuallyClosed;

  // 4. Calculate Next State Change
  let nextStateChangeTime = null;
  let nextStateChangeReason = '';

  if (isStoreOpen) {
    // It's currently open. It will close at the normalCloseTime.
    nextStateChangeTime = normalCloseTime.format('hh:mm A');
    nextStateChangeReason = 'auto-close';
  } else {
    // It's currently closed.
    if (isManuallyClosed && isNormalScheduleOpen) {
      // Closed manually during normal open hours.
      // It will reopen when the manual timer expires, OR when normal schedule dictates (if the timer goes past closing time).
      if (manualCloseUntil.isBefore(normalCloseTime)) {
        // Timer expires before the store naturally closes tonight
        if (manualCloseUntil.date() === now.date()) {
            nextStateChangeTime = manualCloseUntil.format('hh:mm A');
        } else {
            nextStateChangeTime = manualCloseUntil.format('hh:mm A (Tomorrow)');
        }
        nextStateChangeReason = 'manual-timer-expires';
      } else {
        // Timer expires AFTER the store naturally closes tonight.
        // It will just open normally tomorrow.
        nextStateChangeTime = normalOpenTime.format('hh:mm A (Tomorrow)');
        nextStateChangeReason = 'normal-open';
      }
    } else {
      // Closed by normal schedule
      if (normalOpenTime.date() === now.date()) {
        nextStateChangeTime = normalOpenTime.format('hh:mm A');
      } else if (normalOpenTime.date() === moment(now).add(1, 'days').date()) {
        nextStateChangeTime = normalOpenTime.format('hh:mm A [Tomorrow]');
      } else {
        nextStateChangeTime = normalOpenTime.format('hh:mm A [on] dddd'); // e.g., on Monday
      }
      nextStateChangeReason = 'normal-open';
    }
  }

  return {
    isStoreOpen,
    nextStateChangeTime,
    nextStateChangeReason,
    isManuallyClosed
  };
}

module.exports = {
  getComputedStoreStatus
};
