/**
 * tickModule.js
 * A module for converting between ticks and UTC date/time
 * 1 tick = 10 seconds
 * Start tick: 1000000000 = 2022-01-01 00:00:00 UTC
 * For times between ticks, returns the NEXT tick (rounding up)
 */

// Constants
const START_TICK = 1000000000;
const END_TICK = 1999999999;
const SECONDS_PER_TICK = 10;
const TICKS_PER_DAY = 8640; // 24 * 60 * 60 / 10
const TICKS_PER_HOUR = 360; // 3600 / 10
const TICKS_PER_MINUTE = 6; // 60 / 10

// Start date: 2022-01-01 00:00:00 UTC
const START_DATE = new Date(Date.UTC(2022, 0, 1, 0, 0, 0));

// Leap year check
function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// Get days in month
function getDaysInMonth(year, month) {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2 && isLeapYear(year)) return 29;
    return daysInMonth[month - 1];
}

/**
 * Convert a tick to a date/time object (UTC)
 * @param {number} tick - The tick value to convert
 * @returns {Object} Object containing tick, year, month, day, hour, minute, second
 * @throws {Error} If tick is before START_TICK
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
    
    // Normalize date by subtracting days per month
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
    
    return { 
        tick, 
        year, 
        month, 
        day, 
        hour, 
        minute, 
        second 
    };
}

/**
 * Convert a tick to ISO string format (YYYY-MM-DD HH:MM:SS UTC)
 * @param {number} tick - The tick value to convert
 * @returns {string} Formatted date/time string
 */
function tickToISOString(tick) {
    const time = tickToTime(tick);
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:${String(time.second).padStart(2, '0')} UTC`;
}

/**
 * Convert a UTC date/time to tick value
 * Returns the NEXT tick for any time not exactly on a tick boundary (rounding up)
 * @param {Date|string|number} date - Date object, ISO string, or timestamp (UTC)
 * @returns {number} Tick value (rounded up to next tick)
 * @throws {Error} If date is before start date
 */
function dateToTick(date) {
    let dateObj;
    if (date instanceof Date) {
        dateObj = date;
    } else {
        dateObj = new Date(date);
    }
    
    if (dateObj < START_DATE) {
        throw new Error(`Date ${dateObj.toISOString()} is before start date 2022-01-01 UTC`);
    }
    
    const diffSeconds = Math.floor((dateObj - START_DATE) / 1000);
    // Round UP to the next tick for any time not exactly on boundary
    const ticks = START_TICK + Math.ceil(diffSeconds / SECONDS_PER_TICK);
    
    return ticks;
}

/**
 * Get tick for the first second (00:00:00 UTC) of a specific year
 * @param {number} year - The year (must be >= 2022)
 * @returns {number} Tick value for Jan 1 00:00:00 UTC of that year
 * @throws {Error} If year is before 2022
 */
function getTickForYearStart(year) {
    if (year < 2022) {
        throw new Error(`Year ${year} is before start year 2022`);
    }
    
    const date = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    return dateToTick(date);
}

/**
 * Generate an array of time objects at specified intervals
 * @param {number} startTick - Starting tick (default: START_TICK)
 * @param {number} endTick - Ending tick (default: END_TICK)
 * @param {number} interval - Interval between ticks (default: 10000000)
 * @returns {Array} Array of time objects
 */
function generateTickInterval(startTick = START_TICK, endTick = END_TICK, interval = 10000000) {
    const results = [];
    for (let tick = startTick; tick <= endTick; tick += interval) {
        results.push(tickToTime(tick));
    }
    // Add end tick if not already included
    if ((endTick - startTick) % interval !== 0) {
        results.push(tickToTime(endTick));
    }
    return results;
}

// Export all functions and constants
module.exports = {
    // Constants
    START_TICK,
    END_TICK,
    SECONDS_PER_TICK,
    TICKS_PER_DAY,
    TICKS_PER_HOUR,
    TICKS_PER_MINUTE,
    START_DATE,
    
    // Core conversion functions
    tickToTime,
    tickToISOString,
    dateToTick,
    getTickForYearStart,
    
    // Utility functions
    generateTickInterval,
    
    // Helper functions
    isLeapYear,
    getDaysInMonth
};