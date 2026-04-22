const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const caseInsensitiveNameRegex = (name) => ({
  $regex: `^${escapeRegex(name)}$`,
  $options: "i",
});

const validateCreateProblemType = ({ name, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateProblemType = ({ name, status }) => {
  if (name !== undefined && (typeof name !== "string" || !name.trim()))
    return "Name must be a non-empty string";
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateImportProblemTypeRow = (row, rowNum) => {
  const name   = String(row.name   || "").trim();
  const status = String(row.status || "").trim();
  if (!name)   return `Row ${rowNum}: name is required`;
  if (!["Active", "Inactive"].includes(status)) return `Row ${rowNum}: status must be Active or Inactive`;
  return null;
};

module.exports = { validateCreateProblemType, validateUpdateProblemType, validateImportProblemTypeRow, caseInsensitiveNameRegex };
