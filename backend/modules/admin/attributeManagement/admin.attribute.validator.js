const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const caseInsensitiveNameRegex = (name) => ({
  $regex: `^${escapeRegex(name)}$`,
  $options: "i",
});

const validateCreateAttribute = ({ name, machineCategory, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (!machineCategory)
    return "Machine category is required";
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateAttribute = ({ status }) => {
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateImportAttributeRow = (row, rowNum) => {
  const name             = String(row.name             || "").trim();
  const machineCategory  = String(row.machineCategory  || row.machinecategory || "").trim();
  const status           = String(row.status           || "").trim();
  if (!name)            return `Row ${rowNum}: name is required`;
  if (!machineCategory) return `Row ${rowNum}: machineCategory is required`;
  if (!["Active", "Inactive"].includes(status)) return `Row ${rowNum}: status must be Active or Inactive`;
  return null;
};

module.exports = { validateCreateAttribute, validateUpdateAttribute, validateImportAttributeRow, caseInsensitiveNameRegex };
