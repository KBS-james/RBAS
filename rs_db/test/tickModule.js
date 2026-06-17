/**
 * tickModule.js
 * A module for converting between ticks and UTC date/time
 * 1 tick = 10 seconds
 * Start tick: 1000000000 = 2022-01-01 00:00:00 UTC
 * Phase Aligned: Changes exactly at ..5 seconds, calculated based on ..0 time.
 */

// Constants
const START_TICK = 1000000000;
const END_TICK = 1999999999;
const SECONDS_PER_TICK = 10;
const TICKS_PER_DAY = 8640; 
const TICKS_PER_HOUR = 360; 
const TICKS_PER_MINUTE = 6; 

// Start date: 2022-01-01 00:00:00 UTC
const START_DATE = new Date(Date.UTC(2022, 0, 1, 0, 0, 0));

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function getDaysInMonth(year, month) {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2 && isLeapYear(year)) return 29;
    return daysInMonth[month - 1];
}

/**
 * Convert a tick to a date/time object (UTC)
 */
function tickToTime(tick) {
    if (tick < START_TICK) {
        throw new Error(`Tick ${tick} is before start tick ${START_TICK}`);
    }
    
    const tickDiff = tick - START_TICK;
    const totalSeconds = tickDiff * SECONDS_PER_TICK;
    const totalDays = Math.floor(totalSeconds / 86400);
    const remainingSeconds = totalSeconds % 86400;
    
    const hour = Math.floor(remainingSeconds / 3600);
    const minute = Math.floor((remainingSeconds % 3600) / 60);
    const second = remainingSeconds % 60;
    
    let year = 2022;
    let month = 1;
    let day = 1 + totalDays;
    
    while (true) {
        const daysInMonth = getDaysInMonth(year, month);
        if (day <= daysInMonth) break;
        day -= daysInMonth;
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }
    
    return { tick, year, month, day, hour, minute, second };
}

/**
 * Convert a tick to ISO string format (YYYY-MM-DD HH:MM:SS UTC)
 */
function tickToISOString(tick) {
    const time = tickToTime(tick);
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:${String(time.second).padStart(2, '0')} UTC`;
}

/**
 * Convert a UTC date/time to a tick value.
 * Changes precisely on the ..5 second boundary, calculated based on ..0 time.
 * @param {Date|string|number} date - Date object, ISO string, or timestamp (UTC)
 * @returns {number} Tick value
 */
function dateToTick(date) {
    let dateObj = (date instanceof Date) ? date : new Date(date);
    
    if (dateObj < START_DATE) {
        throw new Error(`Date ${dateObj.toISOString()} is before start date 2022-01-01 UTC`);
    }
    
    const diffSeconds = Math.floor((dateObj - START_DATE) / 1000);
    
    // Shift by +5 seconds to align the phase transition exactly to the ..5 mark
    const alignedZeroSeconds = Math.floor((diffSeconds + 5) / 10) * 10;
    
    // Determine the absolute deterministic tick value for that block anchor
    return START_TICK + (alignedZeroSeconds / SECONDS_PER_TICK);
}

/**
 * Get current tick based on current absolute UTC system time
 */
function getCurrentTick() {
    return dateToTick(new Date());
}

/**
 * Check if the time falls strictly on a tick changeover boundary (..5 seconds)
 */
function isTickBoundary(dateObj) {
    return dateObj.getUTCSeconds() % 10 === 5;
}

/**
 * Check if the time falls strictly on a flat reference boundary (..0 seconds)
 */
function isUpdateBoundary(dateObj) {
    return dateObj.getUTCSeconds() % 10 === 0;
}

module.exports = {
    START_TICK,
    END_TICK,
    SECONDS_PER_TICK,
    TICKS_PER_DAY,
    TICKS_PER_HOUR,
    TICKS_PER_MINUTE,
    START_DATE,
    tickToTime,
    tickToISOString,
    dateToTick,
    getCurrentTick,
    isTickBoundary,
    isUpdateBoundary
};