const GstConfig = require("./admin.gstConfig.model");

const updateGstConfig = async (req, res) => {
  try {
    const { cgst, sgst, igst } = req.body;

    const hasCgst = cgst !== undefined && cgst !== null;
    const hasSgst = sgst !== undefined && sgst !== null;
    const hasIgst = igst !== undefined && igst !== null;

    // Validate: igst cannot be set together with cgst or sgst
    if (hasIgst && (hasCgst || hasSgst))
      return res.status(400).json({ success: false, message: "IGST cannot be set together with CGST or SGST. Use either CGST + SGST or IGST only." });

    // At least one field must be provided
    if (!hasCgst && !hasSgst && !hasIgst)
      return res.status(400).json({ success: false, message: "Provide at least one of cgst, sgst, or igst." });

    // Validate number ranges
    const fields = { cgst, sgst, igst };
    for (const [key, val] of Object.entries(fields)) {
      if (val === undefined || val === null) continue;
      if (typeof val !== "number" || isNaN(val))
        return res.status(400).json({ success: false, message: `${key.toUpperCase()} must be a number.` });
      if (val < 0 || val > 100)
        return res.status(400).json({ success: false, message: `${key.toUpperCase()} must be between 0 and 100.` });
    }

    // Fetch existing config to enforce cgst+sgst vs igst rule across current + incoming values
    const existing = await GstConfig.findOne().lean();

    const merged = {
      cgst: hasCgst ? cgst : existing?.cgst ?? 0,
      sgst: hasSgst ? sgst : existing?.sgst ?? 0,
      igst: hasIgst ? igst : existing?.igst ?? 0,
    };

    // After merge: if igst > 0 and (cgst > 0 or sgst > 0) — conflict
    if (merged.igst > 0 && (merged.cgst > 0 || merged.sgst > 0))
      return res.status(400).json({ success: false, message: "Conflict: IGST cannot be non-zero when CGST or SGST is also non-zero. Set the other fields to 0 first." });

    const config = await GstConfig.findOneAndUpdate(
      {},
      { $set: { cgst: merged.cgst, sgst: merged.sgst, igst: merged.igst } },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getGstConfig = async (req, res) => {
  try {
    const config = await GstConfig.findOne().lean();
    if (!config) return res.status(200).json({ success: true, data: null });
    const totalGst = (config.cgst || 0) + (config.sgst || 0) + (config.igst || 0);
    res.status(200).json({ success: true, data: { ...config, totalGst } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { updateGstConfig, getGstConfig };
