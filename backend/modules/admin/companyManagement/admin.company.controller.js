const mongoose = require("mongoose");
const Company = require("./admin.company.model");
const { validateCreateCompany, validateUpdateCompany, validateGST } = require("./admin.company.validator");
const { validateAndParseDate, parseIST } = require("../../../utils/dateValidation");

const getAllCompanies = async (req, res) => {
  try {
    const { search, status, fromDate, toDate, page = 1, limit = 10 } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:  { $regex: escaped, $options: "i" } },
          { email: { $regex: escaped, $options: "i" } },
          { phone: { $regex: escaped, $options: "i" } },
        ];
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

    const [companies, total] = await Promise.all([
      Company.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Company.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: companies,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createCompany = async (req, res) => {
  try {
    const { name, address, phone, email, gstNumber, status } = req.body;
    const error = validateCreateCompany({ name, address, phone, email, gstNumber, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const trimmedGst = String(gstNumber).trim().toUpperCase();
    const gstError = validateGST(trimmedGst);
    if (gstError) return res.status(400).json({ success: false, message: gstError });
    const gstExists = await Company.findOne({ gstNumber: trimmedGst });
    if (gstExists) return res.status(409).json({ success: false, message: "GST number already exists" });

    const existing = await Company.findOne({ name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
    if (existing) return res.status(409).json({ success: false, message: "Company name already exists" });

    const company = await Company.create({ name: name.trim(), address: address.trim(), phone: phone.trim(), email: email.trim().toLowerCase(), gstNumber: trimmedGst, status });
    res.status(201).json({ success: true, data: company });
  } catch (err) {
    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0];
      const msg = key === "gstNumber" ? "GST number already exists" : "Company name already exists";
      return res.status(409).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid company ID" });

    const { name, address, phone, email, gstNumber, status } = req.body;
    const error = validateUpdateCompany({ name, address, phone, email, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const update = {};
    if (name      !== undefined) update.name    = name.trim();
    if (address   !== undefined) update.address = address.trim();
    if (phone     !== undefined) update.phone   = phone.trim();
    if (email     !== undefined) update.email   = email.trim().toLowerCase();
    if (gstNumber !== undefined) update.gstNumber = gstNumber ? String(gstNumber).trim().toUpperCase() : undefined;
    if (status    !== undefined) update.status  = status;

    if (update.gstNumber) {
      const gstError = validateGST(update.gstNumber);
      if (gstError) return res.status(400).json({ success: false, message: gstError });
      const conflict = await Company.findOne({ gstNumber: update.gstNumber, _id: { $ne: id } });
      if (conflict) return res.status(409).json({ success: false, message: "GST number already exists" });
    }

    if (Object.keys(update).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (update.name) {
      const conflict = await Company.findOne({
        name: { $regex: `^${update.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        _id: { $ne: id },
      });
      if (conflict) return res.status(409).json({ success: false, message: "Company name already exists" });
    }

    const company = await Company.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });

    res.status(200).json({ success: true, data: company });
  } catch (err) {
    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0];
      const msg = key === "gstNumber" ? "GST number already exists" : "Company name already exists";
      return res.status(409).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid company ID" });

    const company = await Company.findByIdAndDelete(id);
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });

    res.status(200).json({ success: true, message: "Company deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllCompanies, createCompany, updateCompany, deleteCompany };
