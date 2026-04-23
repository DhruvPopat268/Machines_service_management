const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif"];
const MAX_IMAGE_SIZE_MB  = 5;
const MAX_IMAGES         = 5;

const validateVariants = (variants) => {
  let parsed = variants;
  if (typeof variants === "string") {
    try { parsed = JSON.parse(variants); } catch { return "Invalid variants format"; }
  }
  if (!Array.isArray(parsed) || parsed.length === 0)
    return "At least one variant is required";
  for (let i = 0; i < parsed.length; i++) {
    const v = parsed[i];
    if (!v.attribute)            return `Variant ${i + 1}: attribute is required`;
    if (!v.value || !String(v.value).trim()) return `Variant ${i + 1}: value is required`;
    if (v.lowStockThreshold === undefined || v.lowStockThreshold === null || v.lowStockThreshold === "")
      return `Variant ${i + 1}: lowStockThreshold is required`;
    const threshold = Number(v.lowStockThreshold);
    if (isNaN(threshold)) return `Variant ${i + 1}: lowStockThreshold must be a number`;
  }
  return null;
};

const validateCreateMachine = ({ name, category, division, gstPercentage, status, variants }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (!category)
    return "Category is required";
  if (!division)
    return "Division is required";
  if (gstPercentage !== undefined && gstPercentage !== null && gstPercentage !== "") {
    const gst = Number(gstPercentage);
    if (isNaN(gst) || gst < 0 || gst > 100)
      return "GST percentage must be between 0 and 100";
  }
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  const variantError = validateVariants(variants);
  if (variantError) return variantError;
  return null;
};

const validateUpdateMachine = ({ name, division, gstPercentage, status, variants }) => {
  if (name !== undefined && (typeof name !== "string" || !name.trim()))
    return "Name must be a non-empty string";
  if (division !== undefined && !division)
    return "Division is required";
  if (gstPercentage !== undefined && gstPercentage !== null && gstPercentage !== "") {
    const gst = Number(gstPercentage);
    if (isNaN(gst) || gst < 0 || gst > 100)
      return "GST percentage must be between 0 and 100";
  }
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  if (variants !== undefined) {
    const variantError = validateVariants(variants);
    if (variantError) return variantError;
  }
  return null;
};

const validateImageFile = (file) => {
  const ext = file.originalname.split(".").pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext))
    return `Invalid file type: ${file.originalname}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024)
    return `File too large: ${file.originalname}. Max size is ${MAX_IMAGE_SIZE_MB}MB`;
  return null;
};

const validateImportMachineRow = (row, rowNum) => {
  const name   = String(row.name   || "").trim();
  const status = String(row.status || "").trim();
  if (!name) return `Row ${rowNum}: name is required`;
  if (!row.category || !String(row.category).trim()) return `Row ${rowNum}: category is required`;
  if (!row.division || !String(row.division).trim()) return `Row ${rowNum}: division is required`;
  if (status && !["Active", "Inactive"].includes(status)) return `Row ${rowNum}: status must be Active or Inactive`;
  if (row.gstpercentage !== undefined && row.gstpercentage !== "") {
    const gst = Number(row.gstpercentage);
    if (isNaN(gst) || gst < 0 || gst > 100) return `Row ${rowNum}: gstPercentage must be between 0 and 100`;
  }
  return null;
};

module.exports = { validateCreateMachine, validateUpdateMachine, validateImageFile, validateImportMachineRow, MAX_IMAGES, ALLOWED_EXTENSIONS };
