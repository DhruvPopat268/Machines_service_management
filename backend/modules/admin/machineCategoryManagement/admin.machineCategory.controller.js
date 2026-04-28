const mongoose = require("mongoose");
const xlsx = require("xlsx");
const MachineCategory = require("./admin.machineCategory.model");
const { validateCreateCategory, validateUpdateCategory, validateImportCategoryRow, caseInsensitiveNameRegex } = require("./admin.machineCategory.validator");

const Attribute = require("../attributeManagement/admin.attribute.model");

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
      const parseIST = (ddmmyy, endOfDay = false) => {
        const [dd, mm, yy] = ddmmyy.split("/");
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const base = Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return new Date(base - istOffsetMs);
      };
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = parseIST(fromDate, false);
      if (toDate)   query.createdAt.$lte = parseIST(toDate, true);
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [categories, total] = await Promise.all([
      MachineCategory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      MachineCategory.countDocuments(query),
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
    const { name, description, status } = req.body;

    const error = validateCreateCategory({ name, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const existing = await MachineCategory.findOne({ name: caseInsensitiveNameRegex(name.trim()) });
    if (existing)
      return res.status(409).json({ success: false, message: "Category name already exists" });

    const category = await MachineCategory.create({ name: name.trim(), description, status, source: "manual" });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Category name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid category ID" });

    const { name, description, status } = req.body;

    const error = validateUpdateCategory({ name, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const updateData = {};

    if (name !== undefined)        updateData.name        = typeof name === "string" ? name.trim() : name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined)      updateData.status      = status;

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (updateData.name) {
      const conflict = await MachineCategory.findOne({ name: caseInsensitiveNameRegex(updateData.name), _id: { $ne: id } });
      if (conflict)
        return res.status(409).json({ success: false, message: "Category name already exists" });
    }

    const category = await MachineCategory.findByIdAndUpdate(id, updateData, { new: true, runValidators: true, context: "query" });
    if (!category)
      return res.status(404).json({ success: false, message: "Category not found" });

    res.status(200).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Category name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid category ID" });

    const category = await MachineCategory.findByIdAndDelete(id);
    if (!category)
      return res.status(404).json({ success: false, message: "Category not found" });

    res.status(200).json({ success: true, message: "Category deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAttributeCount = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid category ID" });
    const count = await Attribute.countDocuments({ machineCategory: id });
    res.status(200).json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["name", "description", "status (Active/Inactive)"],
    ["Heavy Machinery", "Large industrial machines", "Active"],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "MachineCategories");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=machine_categories_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

const importCategories = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.originalname.match(/\.xlsx$/i))
      return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

    const wb = xlsx.read(req.file.buffer, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    if (!rows.length) return res.status(400).json({ success: false, message: "File is empty" });

    const required = ["name"];
    const headers = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length)
      return res.status(400).json({ success: false, message: `Missing columns: ${missing.join(", ")}` });

    const statusKey = headers.find((h) => h === "status" || h.startsWith("status ")) ?? "status";

    const errors = [];
    const docs = [];
    rows.forEach((row, i) => {
      const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
      normalized.status = String(normalized[statusKey] || "").trim();
      const error = validateImportCategoryRow(normalized, i + 2);
      if (error) { errors.push(error); return; }
      docs.push({
        name:        String(normalized.name        || "").trim(),
        description: String(normalized.description || "").trim(),
        status:      String(normalized.status      || "").trim(),
      });
    });

    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

    let imported = 0, skipped = 0;
    for (const doc of docs) {
      try {
        const existing = await MachineCategory.findOne({ name: caseInsensitiveNameRegex(doc.name) });
        if (existing) { skipped++; continue; }
        await MachineCategory.create({ ...doc, source: "imported" });
        imported++;
      } catch (rowErr) {
        if (rowErr.code === 11000) { skipped++; } else { throw rowErr; }
      }
    }

    const parts = [`${imported} categor${imported !== 1 ? "ies" : "y"} imported successfully`];
    if (skipped) parts.push(`${skipped} skipped (duplicate name)`);
    res.status(200).json({ success: true, message: parts.join(", ") });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const formatIST = (date) => {
  const d = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
  const dd  = String(d.getUTCDate()).padStart(2, "0");
  const mm  = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy  = String(d.getUTCFullYear()).slice(2);
  const h   = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = String(h % 12 || 12).padStart(2, "0");
  return { date: `${dd}/${mm}/${yy}`, time: `${h12}:${min} ${ampm}` };
};

const exportCategories = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;
    const query = {};
    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) { const e = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); query.name = { $regex: e, $options: "i" }; }
    }
    if (status && ["Active", "Inactive"].includes(status)) query.status = status;
    if (fromDate || toDate) {
      const p = (ddmmyy, end) => { const [dd,mm,yy]=ddmmyy.split("/"); return new Date(Date.UTC(2000+Number(yy),Number(mm)-1,Number(dd),end?23:0,end?59:0,end?59:0,end?999:0)-(5.5*60*60*1000)); };
      query.createdAt={}; if(fromDate) query.createdAt.$gte=p(fromDate,false); if(toDate) query.createdAt.$lte=p(toDate,true);
    }
    const categories = await MachineCategory.find(query).lean();
    const rows = categories.map((c) => {
      const created = formatIST(c.createdAt);
      const updated = formatIST(c.updatedAt);
      return {
        name: c.name, description: c.description, status: c.status,
        "Created Date": created.date, "Created Time": created.time,
        "Updated Date": updated.date, "Updated Time": updated.time,
      };
    });
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "MachineCategories");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=machine_categories.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, getAttributeCount, downloadSample, importCategories, exportCategories };
