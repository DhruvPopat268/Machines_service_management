const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const caseInsensitiveNameRegex = (name) => ({
  $regex: `^${escapeRegex(name)}$`,
  $options: "i",
});

const validateCreateZone = ({ name, code, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (!code || typeof code !== "string" || !code.trim())
    return "Code is required";
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateZone = ({ status }) => {
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateImportZoneRow = (row, rowNum) => {
  const name   = String(row.name  || "").trim();
  const code   = String(row.code  || "").trim().toUpperCase();
  const status = String(row.status || "").trim();
  if (!name)   return `Row ${rowNum}: name is required`;
  if (!code)   return `Row ${rowNum}: code is required`;
  if (!["Active", "Inactive"].includes(status)) return `Row ${rowNum}: status must be Active or Inactive`;
  return null;
};

module.exports = { validateCreateZone, validateUpdateZone, validateImportZoneRow, caseInsensitiveNameRegex };
