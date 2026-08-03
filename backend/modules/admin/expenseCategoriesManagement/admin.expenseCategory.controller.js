const mongoose = require("mongoose");
const ExpenseCategory = require("./admin.expenseCategory.model");

const getAll = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.name = { $regex: escaped, $options: "i" };
      }
    }

    if (status && ["Active", "Inactive"].includes(status)) query.status = status;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [categories, total] = await Promise.all([
      ExpenseCategory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      ExpenseCategory.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: categories,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, status } = req.body;

    if (!name || typeof name !== "string" || !name.trim())
      return res.status(400).json({ success: false, message: "Name is required" });

    if (status && !["Active", "Inactive"].includes(status))
      return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });

    const existing = await ExpenseCategory.findOne({ name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
    if (existing)
      return res.status(409).json({ success: false, message: "Expense category name already exists" });

    const category = await ExpenseCategory.create({ name: name.trim(), status });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Expense category name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid expense category ID" });

    const { name, status } = req.body;
    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim())
        return res.status(400).json({ success: false, message: "Name cannot be empty" });
      updateData.name = name.trim();
    }

    if (status !== undefined) {
      if (!["Active", "Inactive"].includes(status))
        return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });
      updateData.status = status;
    }

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (updateData.name) {
      const conflict = await ExpenseCategory.findOne({
        name: { $regex: `^${updateData.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        _id: { $ne: id },
      });
      if (conflict)
        return res.status(409).json({ success: false, message: "Expense category name already exists" });
    }

    const category = await ExpenseCategory.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!category)
      return res.status(404).json({ success: false, message: "Expense category not found" });

    res.status(200).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Expense category name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid expense category ID" });

    const category = await ExpenseCategory.findByIdAndDelete(id);
    if (!category)
      return res.status(404).json({ success: false, message: "Expense category not found" });

    res.status(200).json({ success: true, message: "Expense category deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove };
