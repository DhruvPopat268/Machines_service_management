const mongoose = require("mongoose");
const xlsx = require("xlsx");
const Attribute = require("./admin.attribute.model");
const MachineCategory = require("../machineCategoryManagement/admin.machineCategory.model");
const { validateCreateAttribute, validateUpdateAttribute, validateImportAttributeRow, caseInsensitiveNameRegex } = require("./admin.attribute.validator");

const getAll = async (req, res) => {
  try {
    const { search, status, machineCategory, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.name = { $regex: escaped, $options: "i" };
      }
    }

    if (status && ["Active", "Inactive"].includes(status)) query.status = status;
    if (machineCategory && mongoose.isValidObjectId(machineCategory)) query.machineCategory = machineCategory;

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

    const [attributes, total] = await Promise.all([
      Attribute.find(query).populate("machineCategory", "name").sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Attribute.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: attributes,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, description, machineCategory, status } = req.body;

    const error = validateCreateAttribute({ name, machineCategory, status });
    if (error) return res.status(400).json({ success: false, message: error });

    if (!mongoose.isValidObjectId(machineCategory))
      return res.status(400).json({ success: false, message: "Invalid machine category ID" });

    const categoryExists = await MachineCategory.findById(machineCategory);
    if (!categoryExists)
      return res.status(404).json({ success: false, message: "Machine category not found" });

    const existing = await Attribute.findOne({ name: caseInsensitiveNameRegex(name.trim()), machineCategory });
    if (existing)
      return res.status(409).json({ success: false, message: "Attribute name already exists in this category" });

    const attribute = await Attribute.create({ name: name.trim(), machineCategory, description, status, source: "manual" });
    res.status(201).json({ success: true, data: attribute });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Attribute name already exists in this category" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid attribute ID" });

    const { name, description, machineCategory, status } = req.body;

    const error = validateUpdateAttribute({ status });
    if (error) return res.status(400).json({ success: false, message: error });

    const updateData = {};
    if (name !== undefined)        updateData.name        = typeof name === "string" ? name.trim() : name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined)      updateData.status      = status;

    if (machineCategory !== undefined) {
      if (!mongoose.isValidObjectId(machineCategory))
        return res.status(400).json({ success: false, message: "Invalid machine category ID" });
      const categoryExists = await MachineCategory.findById(machineCategory);
      if (!categoryExists)
        return res.status(404).json({ success: false, message: "Machine category not found" });
      updateData.machineCategory = machineCategory;
    }

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (updateData.name || updateData.machineCategory) {
      const current = await Attribute.findById(id);
      if (!current)
        return res.status(404).json({ success: false, message: "Attribute not found" });
      const effectiveName     = updateData.name            || current.name;
      const effectiveCategory = updateData.machineCategory || current.machineCategory;
      const conflict = await Attribute.findOne({ name: caseInsensitiveNameRegex(effectiveName), machineCategory: effectiveCategory, _id: { $ne: id } });
      if (conflict)
        return res.status(409).json({ success: false, message: "Attribute name already exists in this category" });
    }

    const attribute = await Attribute.findByIdAndUpdate(id, updateData, { new: true, runValidators: true, context: "query" });
    if (!attribute)
      return res.status(404).json({ success: false, message: "Attribute not found" });

    res.status(200).json({ success: true, data: attribute });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Attribute name already exists in this category" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid attribute ID" });

    const attribute = await Attribute.findByIdAndDelete(id);
    if (!attribute)
      return res.status(404).json({ success: false, message: "Attribute not found" });

    res.status(200).json({ success: true, message: "Attribute deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["name", "machineCategory", "description", "status"],
    ["Color", "Heavy Machinery", "Color of the machine", "Active"],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Attributes");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=attributes_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

const importAttributes = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.originalname.match(/\.xlsx$/i))
      return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

    const wb = xlsx.read(req.file.buffer, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    if (!rows.length) return res.status(400).json({ success: false, message: "File is empty" });

    const required = ["name", "machinecategory", "status"];
    const headers = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length)
      return res.status(400).json({ success: false, message: `Missing columns: ${missing.join(", ")}` });

    const errors = [];
    const docs = [];
    rows.forEach((row, i) => {
      const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
      const error = validateImportAttributeRow(normalized, i + 2);
      if (error) { errors.push(error); return; }
      docs.push({
        name:            String(normalized.name            || "").trim(),
        machineCategory: String(normalized.machinecategory || "").trim(),
        description:     String(normalized.description     || "").trim(),
        status:          String(normalized.status          || "").trim(),
      });
    });

    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

    let imported = 0, skipped = 0;
    for (const doc of docs) {
      try {
        // Case-insensitive category lookup
        const category = await MachineCategory.findOne({ name: caseInsensitiveNameRegex(doc.machineCategory) });
        if (!category) { skipped++; continue; }

        // Case-insensitive duplicate check within the same category
        const existing = await Attribute.findOne({ name: caseInsensitiveNameRegex(doc.name), machineCategory: category._id });
        if (existing) { skipped++; continue; }

        await Attribute.create({ name: doc.name, machineCategory: category._id, description: doc.description, status: doc.status, source: "imported" });
        imported++;
      } catch (rowErr) {
        if (rowErr.code === 11000) { skipped++; } else { throw rowErr; }
      }
    }

    const parts = [`${imported} attribute${imported !== 1 ? "s" : ""} imported successfully`];
    if (skipped) parts.push(`${skipped} skipped (category not found or duplicate)`);
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

const exportAttributes = async (req, res) => {
  try {
    const attributes = await Attribute.find().populate("machineCategory", "name").lean();
    const rows = attributes.map((a) => {
      const created = formatIST(a.createdAt);
      const updated = formatIST(a.updatedAt);
      return {
        name: a.name,
        machineCategory: a.machineCategory?.name || "",
        description: a.description, status: a.status,
        "Created Date": created.date, "Created Time": created.time,
        "Updated Date": updated.date, "Updated Time": updated.time,
      };
    });
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Attributes");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=attributes.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, downloadSample, importAttributes, exportAttributes };
