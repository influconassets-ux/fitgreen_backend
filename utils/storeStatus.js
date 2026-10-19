const moment = require('moment-timezone');

/**
 * Returns today's normal schedule window, or null if closed all day (Sunday).
 */
function getScheduleWindow(now) {
  const currentDay = now.day(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  if (currentDay === 0) {
    return null; // Sunday: closed all day
  }
  if (currentDay >= 1 && currentDay <= 5) {
    return { openHour: 12, closeHour: 21 }; // Mon-Fri: 12:00 PM - 9:00 PM
  }
  return { openHour: 12, closeHour: 19 }; // Sat: 12:00 PM - 7:00 PM
}

function getNextNormalOpenTime(now) {
  // Walk forward day by day until we find a non-Sunday day, then its open hour.
  let candidate = moment(now);
  for (let i = 0; i < 8; i++) {
    const window = getScheduleWindow(candidate);
    const isToday = candidate.isSame(now, 'day');
    if (window) {
      const openTime = moment(candidate).hour(window.openHour).minute(0).second(0);
      if (!isToday || now.isBefore(openTime)) {
        return openTime;
      }
    }
    candidate = moment(candidate).add(1, 'days').startOf('day').hour(now.hour());
  }
  return moment(now).add(1, 'days').hour(12).minute(0).second(0);
}

/**
 * Given a manual-close-until timestamp, returns when the store will actually
 * reopen: that exact moment if it falls inside a normal schedule window that
 * day, otherwise the next normal opening time after it. This makes multi-day
 * closures (e.g. a Puja holiday from the 19th to the 22nd) report the real
 * reopen date instead of whatever the schedule happens to say "right now".
 */
function getEffectiveReopenTime(manualCloseUntil) {
  const window = getScheduleWindow(manualCloseUntil);
  if (window && manualCloseUntil.hour() >= window.openHour && manualCloseUntil.hour() < window.closeHour) {
    return { time: moment(manualCloseUntil), isExact: true };
  }
  return { time: getNextNormalOpenTime(manualCloseUntil), isExact: false };
}

/**
 * Calculates the current store status and next state change time.
 * @param {Object} settings - The settings document from the database
 * @returns {Object} { isStoreOpen, nextStateChangeTime, nextStateChangeReason, isManuallyClosed }
 */
function getComputedStoreStatus(settings) {
  const now = moment().tz('Asia/Kolkata');
  const todayStr = now.format('YYYY-MM-DD');

  const window = getScheduleWindow(now);
  const isNormalScheduleOpen = !!window && now.hour() >= window.openHour && now.hour() < window.closeHour;
  const normalCloseTime = window ? moment(now).hour(window.closeHour).minute(0).second(0) : null;

  // 1. Manual CLOSE override takes priority over everything.
  let isManuallyClosed = false;
  let manualCloseUntil = null;
  if (settings && settings.manualCloseUntil) {
    manualCloseUntil = moment(settings.manualCloseUntil).tz('Asia/Kolkata');
    if (manualCloseUntil.isAfter(now)) {
      isManuallyClosed = true;
    }
  }

  // 2. Manual OPEN override: only valid for the calendar day it was set.
  const isManualOpenActive = !!(settings && settings.manualOpenOverride && settings.manualOpenOverrideDate === todayStr);

  // 3. Final decision
  const isStoreOpen = !isManuallyClosed && (isNormalScheduleOpen || isManualOpenActive);

  // 4. Next state change
  let nextStateChangeTime = null;
  let nextStateChangeReason = '';

  if (isStoreOpen) {
    // Open now (either normal schedule or manual override). It closes at today's
    // scheduled close time if one exists today, otherwise at the normal schedule's close.
    const closeTime = normalCloseTime || getNextNormalOpenTime(now); // fallback, shouldn't hit on a day with a window
    nextStateChangeTime = closeTime.format('hh:mm A');
    nextStateChangeReason = 'auto-close';
  } else if (isManuallyClosed) {
    // Manually closed (short pause or a multi-day holiday closure). The store
    // reopens at the manualCloseUntil time itself if that falls inside a normal
    // open window that day, otherwise at the next normal opening time after it.
    const { time: reopenTime, isExact } = getEffectiveReopenTime(manualCloseUntil);
    if (reopenTime.isSame(now, 'day')) {
      nextStateChangeTime = reopenTime.format('hh:mm A');
    } else if (reopenTime.isSame(moment(now).add(1, 'days'), 'day')) {
      nextStateChangeTime = reopenTime.format('hh:mm A [Tomorrow]');
    } else {
      nextStateChangeTime = reopenTime.format('hh:mm A [on] MMM D');
    }
    nextStateChangeReason = isExact ? 'manual-timer-expires' : 'normal-open';
  } else {
    // Closed by normal schedule (no manual override active)
    const nextOpen = getNextNormalOpenTime(now);
    if (nextOpen.isSame(now, 'day')) {
      nextStateChangeTime = nextOpen.format('hh:mm A');
    } else if (nextOpen.isSame(moment(now).add(1, 'days'), 'day')) {
      nextStateChangeTime = nextOpen.format('hh:mm A [Tomorrow]');
    } else {
      nextStateChangeTime = nextOpen.format('hh:mm A [on] dddd');
    }
    nextStateChangeReason = 'normal-open';
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
