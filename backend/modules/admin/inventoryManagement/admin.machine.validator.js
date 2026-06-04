const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif"];
const MAX_IMAGE_SIZE_MB  = 5;
const MAX_IMAGES         = 5;

const validateCreateMachine = ({ name, category, division, modelNumber, gstPercentage, status }) => {
  if (!name || typeof name !== "string" || !name.trim())
    return "Name is required";
  if (!category)
    return "Category is required";
  if (!division)
    return "Division is required";
  if (!modelNumber || typeof modelNumber !== "string" || !modelNumber.trim())
    return "Model number is required";
  if (gstPercentage !== undefined && gstPercentage !== null && gstPercentage !== "") {
    const gst = Number(gstPercentage);
    if (isNaN(gst) || gst < 0 || gst > 100)
      return "GST percentage must be between 0 and 100";
  }
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
  return null;
};

const validateUpdateMachine = ({ name, modelNumber, division, gstPercentage, status }) => {
  if (name !== undefined && (typeof name !== "string" || !name.trim()))
    return "Name must be a non-empty string";
  if (modelNumber !== undefined && (typeof modelNumber !== "string" || !modelNumber.trim()))
    return "Model number must be a non-empty string";
  if (division !== undefined && !division)
    return "Division is required";
  if (gstPercentage !== undefined && gstPercentage !== null && gstPercentage !== "") {
    const gst = Number(gstPercentage);
    if (isNaN(gst) || gst < 0 || gst > 100)
      return "GST percentage must be between 0 and 100";
  }
  if (status !== undefined && !["Active", "Inactive"].includes(status))
    return "Status must be Active or Inactive";
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

module.exports = { validateCreateMachine, validateUpdateMachine, validateImageFile, MAX_IMAGES, ALLOWED_EXTENSIONS };
