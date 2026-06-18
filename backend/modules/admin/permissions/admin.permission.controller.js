const mongoose = require("mongoose");
const Permission = require("./admin.permission.model");

const getAllPermissions = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) query.name = { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }
    if (status && ["Active", "Inactive"].includes(status)) query.status = status;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const [data, total] = await Promise.all([
      Permission.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
      Permission.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createPermission = async (req, res) => {
  try {
    const { name, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: "Name is required" });

    const permission = await Permission.create({ name: name.trim(), status });
    res.status(201).json({ success: true, data: permission });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: "Permission name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const updatePermission = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const { name, status } = req.body;
    const update = {};
    if (name   !== undefined) update.name   = name.trim();
    if (status !== undefined) update.status = status;

    if (!Object.keys(update).length) return res.status(400).json({ success: false, message: "Nothing to update" });

    const permission = await Permission.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!permission) return res.status(404).json({ success: false, message: "Permission not found" });

    res.status(200).json({ success: true, data: permission });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: "Permission name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const deletePermission = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const permission = await Permission.findByIdAndDelete(id);
    if (!permission) return res.status(404).json({ success: false, message: "Permission not found" });

    res.status(200).json({ success: true, message: "Permission deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllPermissions, createPermission, updatePermission, deletePermission };
