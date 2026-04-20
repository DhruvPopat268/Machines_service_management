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
    const { name, code, description, status } = req.body;

    if (!name || !code)
      return res.status(400).json({ success: false, message: "Name and code are required" });

    const existing = await Zone.findOne({ code: code.toUpperCase() });
    if (existing)
      return res.status(409).json({ success: false, message: "Zone code already exists" });

    const zone = await Zone.create({ name, code, description, status });
    res.status(201).json({ success: true, data: zone });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, status } = req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (code !== undefined) update.code = code;
    if (description !== undefined) update.description = description;
    if (status !== undefined) {
      if (!["Active", "Inactive"].includes(status))
        return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });
      update.status = status;
    }

    if (Object.keys(update).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    const zone = await Zone.findByIdAndUpdate(id, update, { new: true });
    if (!zone)
      return res.status(404).json({ success: false, message: "Zone not found" });

    res.status(200).json({ success: true, data: zone });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteZone = async (req, res) => {
  try {
    const { id } = req.params;
    const zone = await Zone.findByIdAndDelete(id);
    if (!zone)
      return res.status(404).json({ success: false, message: "Zone not found" });

    res.status(200).json({ success: true, message: "Zone deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllZones, createZone, updateZone, deleteZone };
