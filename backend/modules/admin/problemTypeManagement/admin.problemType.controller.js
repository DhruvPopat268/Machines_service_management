const mongoose = require("mongoose");
const xlsx = require("xlsx");
const ProblemType = require("./admin.problemType.model");
const { validateCreateProblemType, validateUpdateProblemType, validateImportProblemTypeRow, caseInsensitiveNameRegex } = require("./admin.problemType.validator");
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
        if (parsed.error) {
          return res.status(400).json({ success: false, message: parsed.error });
        }
        const istDate = parseIST(fromDate, false);
        if (!istDate) {
          return res.status(400).json({ success: false, message: "Invalid fromDate" });
        }
        query.createdAt = query.createdAt || {};
        query.createdAt.$gte = istDate;
      }
      
      if (toDate) {
        const parsed = validateAndParseDate(toDate, "toDate");
        if (parsed.error) {
          return res.status(400).json({ success: false, message: parsed.error });
        }
        const istDate = parseIST(toDate, true);
        if (!istDate) {
          return res.status(400).json({ success: false, message: "Invalid toDate" });
        }
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = istDate;
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [problemTypes, total] = await Promise.all([
      ProblemType.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      ProblemType.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: problemTypes,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const error = validateCreateProblemType({ name, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const existing = await ProblemType.findOne({ name: caseInsensitiveNameRegex(name.trim()) });
    if (existing)
      return res.status(409).json({ success: false, message: "Problem type name already exists" });

    const problemType = await ProblemType.create({ name: name.trim(), description, status, source: "manual" });
    res.status(201).json({ success: true, data: problemType });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Problem type name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid problem type ID" });

    const { name, description, status } = req.body;

    const error = validateUpdateProblemType({ name, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const updateData = {};
    if (name !== undefined)        updateData.name        = typeof name === "string" ? name.trim() : name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined)      updateData.status      = status;

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (updateData.name) {
      const conflict = await ProblemType.findOne({ name: caseInsensitiveNameRegex(updateData.name), _id: { $ne: id } });
      if (conflict)
        return res.status(409).json({ success: false, message: "Problem type name already exists" });
    }

    const problemType = await ProblemType.findByIdAndUpdate(id, updateData, { new: true, runValidators: true, context: "query" });
    if (!problemType)
      return res.status(404).json({ success: false, message: "Problem type not found" });

    res.status(200).json({ success: true, data: problemType });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Problem type name already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid problem type ID" });

    const problemType = await ProblemType.findByIdAndDelete(id);
    if (!problemType)
      return res.status(404).json({ success: false, message: "Problem type not found" });

    res.status(200).json({ success: true, message: "Problem type deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["name", "description", "status (Active/Inactive)"],
    ["Mechanical Failure", "Issues related to mechanical components", "Active"],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "ProblemTypes");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=problem_types_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

const importProblemTypes = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.originalname.match(/\.xlsx$/i))
      return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

    const wb   = xlsx.read(req.file.buffer, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    if (!rows.length) return res.status(400).json({ success: false, message: "File is empty" });

    const required = ["name"];
    const headers  = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
    const missing  = required.filter((h) => !headers.includes(h));
    if (missing.length)
      return res.status(400).json({ success: false, message: `Missing columns: ${missing.join(", ")}` });

    const statusKey = headers.find((h) => h === "status" || h.startsWith("status ")) ?? "status";

    const errors = [];
    const docs   = [];
    rows.forEach((row, i) => {
      const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
      normalized.status = String(normalized[statusKey] || "Active").trim();
      const error = validateImportProblemTypeRow(normalized, i + 2);
      if (error) { errors.push(error); return; }
      docs.push({
        name:        String(normalized.name        || "").trim(),
        description: String(normalized.description || "").trim(),
        status:      String(normalized[statusKey] || "Active").trim(),
      });
    });

    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

    let imported = 0, skipped = 0;
    for (const doc of docs) {
      try {
        const existing = await ProblemType.findOne({ name: caseInsensitiveNameRegex(doc.name) });
        if (existing) { skipped++; continue; }
        await ProblemType.create({ ...doc, source: "imported" });
        imported++;
      } catch (rowErr) {
        if (rowErr.code === 11000) { skipped++; } else { throw rowErr; }
      }
    }

    const parts = [`${imported} problem type${imported !== 1 ? "s" : ""} imported successfully`];
    if (skipped) parts.push(`${skipped} skipped (duplicate name)`);
    res.status(200).json({ success: true, message: parts.join(", ") });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const formatIST = (date) => {
  const d    = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
  const dd   = String(d.getUTCDate()).padStart(2, "0");
  const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy   = String(d.getUTCFullYear()).slice(2);
  const h    = d.getUTCHours();
  const min  = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = String(h % 12 || 12).padStart(2, "0");
  return { date: `${dd}/${mm}/${yy}`, time: `${h12}:${min} ${ampm}` };
};

const exportProblemTypes = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;
    const query = {};
    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) { const e = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); query.name = { $regex: e, $options: "i" }; }
    }
    if (status && ["Active", "Inactive"].includes(status)) query.status = status;
    if (fromDate || toDate) {
      if (fromDate) {
        const parsed = validateAndParseDate(fromDate, "fromDate");
        if (parsed.error) {
          return res.status(400).json({ success: false, message: parsed.error });
        }
        const istDate = parseIST(fromDate, false);
        if (!istDate) {
          return res.status(400).json({ success: false, message: "Invalid fromDate" });
        }
        query.createdAt = query.createdAt || {};
        query.createdAt.$gte = istDate;
      }
      
      if (toDate) {
        const parsed = validateAndParseDate(toDate, "toDate");
        if (parsed.error) {
          return res.status(400).json({ success: false, message: parsed.error });
        }
        const istDate = parseIST(toDate, true);
        if (!istDate) {
          return res.status(400).json({ success: false, message: "Invalid toDate" });
        }
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = istDate;
      }
    }
    const problemTypes = await ProblemType.find(query).lean();
    const rows = problemTypes.map((p) => {
      const created = formatIST(p.createdAt);
      const updated = formatIST(p.updatedAt);
      return {
        name: p.name, description: p.description, status: p.status,
        "Created Date": created.date, "Created Time": created.time,
        "Updated Date": updated.date, "Updated Time": updated.time,
      };
    });
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "ProblemTypes");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=problem_types.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, downloadSample, importProblemTypes, exportProblemTypes };
