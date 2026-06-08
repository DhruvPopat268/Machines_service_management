const mongoose = require("mongoose");
const PagesCategory = require("./admin.pagesCategory.model");
const { validateCreatePagesCategory, validateUpdatePagesCategory, caseInsensitiveNameRegex } = require("./admin.pagesCategory.validator");
const { validateAndParseDate, parseIST } = require("../../../utils/dateValidation");

const getAll = async (req, res) => {
  try {
    const { search, status, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.name = { $regex: escaped, $options: "i" };
      }
    }

    if (status && ["Active", "Inactive"].includes(status)) query.status = status;

    if (fromDate || toDate) {
      if (fromDate) {
        const parsed = validateAndParseDate(fromDate, "fromDate");
        if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
        const istDate = parseIST(fromDate, false);
        if (!istDate) return res.status(400).json({ success: false, message: "Invalid fromDate" });
        query.createdAt = query.createdAt || {};
        query.createdAt.$gte = istDate;
      }
      if (toDate) {
        const parsed = validateAndParseDate(toDate, "toDate");
        if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
        const istDate = parseIST(toDate, true);
        if (!istDate) return res.status(400).json({ success: false, message: "Invalid toDate" });
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = istDate;
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [categories, total] = await Promise.all([
      PagesCategory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      PagesCategory.countDocuments(query),
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

const getActive = async (req, res) => {
  try {
    const categories = await PagesCategory.find({ status: "Active" }).sort({ name: 1 }).select("_id name");
    res.status(200).json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const error = validateCreatePagesCategory({ name, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const existing = await PagesCategory.findOne({ name: caseInsensitiveNameRegex(name.trim()) });
    if (existing) return res.status(409).json({ success: false, message: "Pages category name already exists" });

    const category = await PagesCategory.create({ name: name.trim(), description, status });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Pages category name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid pages category ID" });

    const { name, description, status } = req.body;

    const error = validateUpdatePagesCategory({ name, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const updateData = {};
    if (name        !== undefined) updateData.name        = typeof name === "string" ? name.trim() : name;
    if (description !== undefined) updateData.description = description;
    if (status      !== undefined) updateData.status      = status;

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (updateData.name) {
      const conflict = await PagesCategory.findOne({ name: caseInsensitiveNameRegex(updateData.name), _id: { $ne: id } });
      if (conflict) return res.status(409).json({ success: false, message: "Pages category name already exists" });
    }

    const category = await PagesCategory.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, message: "Pages category not found" });

    res.status(200).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Pages category name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid pages category ID" });

    const category = await PagesCategory.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ success: false, message: "Pages category not found" });

    res.status(200).json({ success: true, message: "Pages category deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getActive, create, update, remove };
