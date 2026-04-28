const validateAndParseDate = (dateStr, fieldName) => {
  if (!dateStr || typeof dateStr !== "string") {
    return { error: `${fieldName} must be a valid string` };
  }

  // Strict format check: dd/mm/yy
  const dateRegex = /^(\d{2})\/(\d{2})\/(\d{2})$/;
  const match = dateStr.match(dateRegex);
  
  if (!match) {
    return { error: `${fieldName} must be in dd/mm/yy format (e.g., 25/12/24)` };
  }

  const [, dd, mm, yy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yy);

  // Validate ranges
  if (day < 1 || day > 31) {
    return { error: `${fieldName}: day must be between 01 and 31` };
  }
  if (month < 1 || month > 12) {
    return { error: `${fieldName}: month must be between 01 and 12` };
  }

  // Construct the date and verify it wasn't auto-corrected
  const fullYear = 2000 + year;
  const constructedDate = new Date(Date.UTC(fullYear, month - 1, day, 0, 0, 0, 0));
  
  // Check if the date components match (detect overflow like 32/01/24 -> 01/02/24)
  if (
    constructedDate.getUTCDate() !== day ||
    constructedDate.getUTCMonth() !== month - 1 ||
    constructedDate.getUTCFullYear() !== fullYear
  ) {
    return { error: `${fieldName}: invalid date (${dateStr})` };
  }

  return { date: constructedDate };
};

const parseIST = (dateStr, endOfDay = false) => {
  const dateRegex = /^(\d{2})\/(\d{2})\/(\d{2})$/;
  const match = dateStr.match(dateRegex);
  if (!match) return null;

  const [, dd, mm, yy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = 2000 + Number(yy);

  const utcDate = new Date(Date.UTC(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  ));

  // Verify no overflow occurred
  if (
    utcDate.getUTCDate() !== day ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCFullYear() !== year
  ) {
    return null;
  }

  // Convert to IST (subtract 5.5 hours)
  return new Date(utcDate.getTime() - 5.5 * 60 * 60 * 1000);
};

module.exports = { validateAndParseDate, parseIST };
