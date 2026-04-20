const mongoose = require("mongoose");
const Zone = require("./admin.zone.model");

const getAllZones = async (req, res) => {
  try {
    const zones = await Zone.find();
    res.status(200).json({ success: true, data: zones });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createZone = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const rawCode = req.body.code;

    if (!name || typeof name !== "string" || !name.trim())
      return res.status(400).json({ success: false, message: "Name is required" });
    if (!rawCode || typeof rawCode !== "string" || !rawCode.trim())
      return res.status(400).json({ success: false, message: "Code is required" });
    if (status !== undefined && !["Active", "Inactive"].includes(status))
      return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });

    const code = rawCode.trim().toUpperCase();

    const existing = await Zone.findOne({ code });
    if (existing)
      return res.status(409).json({ success: false, message: "Zone code already exists" });

    const zone = await Zone.create({ name: name.trim(), code, description, status });
    res.status(201).json({ success: true, data: zone });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Zone code already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid zone ID" });

    const { name, code, description, status } = req.body;

    const update = {};
    if (name !== undefined) update.name = typeof name === "string" ? name.trim() : name;
    if (code !== undefined) update.code = typeof code === "string" ? code.trim().toUpperCase() : code;
    if (description !== undefined) update.description = description;
    if (status !== undefined) {
      if (!["Active", "Inactive"].includes(status))
        return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });
      update.status = status;
    }

    if (Object.keys(update).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    const zone = await Zone.findByIdAndUpdate(id, update, { new: true, runValidators: true, context: "query" });
    if (!zone)
      return res.status(404).json({ success: false, message: "Zone not found" });

    res.status(200).json({ success: true, data: zone });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Zone code already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteZone = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid zone ID" });

    const zone = await Zone.findByIdAndDelete(id);
    if (!zone)
      return res.status(404).json({ success: false, message: "Zone not found" });

    res.status(200).json({ success: true, message: "Zone deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllZones, createZone, updateZone, deleteZone };
