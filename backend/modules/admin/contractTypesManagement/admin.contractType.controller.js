const mongoose = require("mongoose");
const xlsx = require("xlsx");
const ContractType = require("./admin.contractType.model");
const { validateCreateContractType, validateUpdateContractType, validateImportContractTypeRow, caseInsensitiveNameRegex } = require("./admin.contractType.validator");

const getAll = async (req, res) => {
  try {
    const { search, status, freeService, freeParts, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name: { $regex: escaped, $options: "i" } },
          { code: { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (status && ["Active", "Inactive"].includes(status)) query.status = status;
    if (freeService === "true")  query.freeService = true;
    if (freeService === "false") query.freeService = false;
    if (freeParts === "true")    query.freeParts = true;
    if (freeParts === "false")   query.freeParts = false;

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

    const [contractTypes, total] = await Promise.all([
      ContractType.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      ContractType.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: contractTypes,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, description, freeService, freeParts, status } = req.body;
    const rawCode = req.body.code;

    const error = validateCreateContractType({ name, code: rawCode, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const code = rawCode.trim().toUpperCase();

    const existing = await ContractType.findOne({ $or: [{ name: caseInsensitiveNameRegex(name.trim()) }, { code }] });
    if (existing) {
      if (existing.name.toLowerCase() === name.trim().toLowerCase())
        return res.status(409).json({ success: false, message: "Contract type name already exists" });
      return res.status(409).json({ success: false, message: "Contract type code already exists" });
    }

    const contractType = await ContractType.create({
      name: name.trim(), code, description,
      freeService: !!freeService, freeParts: !!freeParts, status,
    });
    res.status(201).json({ success: true, data: contractType });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyPattern?.name ? "Contract type name" : "Contract type code";
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid contract type ID" });

    const { name, code, description, freeService, freeParts, status } = req.body;

    const error = validateUpdateContractType({ name, code, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const updateData = {};

    if (name !== undefined)        updateData.name        = typeof name === "string" ? name.trim() : name;
    if (code !== undefined)        updateData.code        = typeof code === "string" ? code.trim().toUpperCase() : code;
    if (description !== undefined) updateData.description = description;
    if (freeService !== undefined) updateData.freeService = !!freeService;
    if (freeParts !== undefined)   updateData.freeParts   = !!freeParts;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (updateData.name || updateData.code) {
      const orConditions = [];
      if (updateData.name) orConditions.push({ name: caseInsensitiveNameRegex(updateData.name) });
      if (updateData.code) orConditions.push({ code: updateData.code });
      const conflict = await ContractType.findOne({ $or: orConditions, _id: { $ne: id } });
      if (conflict) {
        if (updateData.name && conflict.name.toLowerCase() === updateData.name.toLowerCase())
          return res.status(409).json({ success: false, message: "Contract type name already exists" });
        return res.status(409).json({ success: false, message: "Contract type code already exists" });
      }
    }
    const contractType = await ContractType.findByIdAndUpdate(id, updateData, { new: true, runValidators: true, context: "query" });
    if (!contractType)
      return res.status(404).json({ success: false, message: "Contract type not found" });

    res.status(200).json({ success: true, data: contractType });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyPattern?.name ? "Contract type name" : "Contract type code";
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid contract type ID" });

    const contractType = await ContractType.findByIdAndDelete(id);
    if (!contractType)
      return res.status(404).json({ success: false, message: "Contract type not found" });

    res.status(200).json({ success: true, message: "Contract type deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["name", "code", "description", "freeService", "freeParts", "status"],
    ["Warranty", "WTY", "Standard warranty", "true", "true", "Active"],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "ContractTypes");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=contract_types_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

const importContractTypes = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.originalname.match(/\.xlsx$/i))
      return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

    const wb = xlsx.read(req.file.buffer, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    if (!rows.length) return res.status(400).json({ success: false, message: "File is empty" });

    const required = ["name", "code", "status"];
    const headers = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length)
      return res.status(400).json({ success: false, message: `Missing columns: ${missing.join(", ")}` });

    const errors = [];
    const docs = [];
    rows.forEach((row, i) => {
      const error = validateImportContractTypeRow(row, i + 2);
      if (error) { errors.push(error); return; }
      docs.push({
        name:        String(row.name        || "").trim(),
        code:        String(row.code        || "").trim().toUpperCase(),
        status:      String(row.status      || "").trim(),
        freeService: String(row.freeService || "").trim().toLowerCase() === "true",
        freeParts:   String(row.freeParts   || "").trim().toLowerCase() === "true",
        description: String(row.description || "").trim(),
      });
    });

    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

    let imported = 0, skipped = 0;
    for (const doc of docs) {
      try {
        const existing = await ContractType.findOne({
          $or: [
            { name: caseInsensitiveNameRegex(doc.name) },
            { code: doc.code },
          ],
        });
        if (existing) { skipped++; continue; }
        await ContractType.create(doc);
        imported++;
      } catch (rowErr) {
        if (rowErr.code === 11000) { skipped++; } else { throw rowErr; }
      }
    }

    const parts = [`${imported} contract type${imported !== 1 ? "s" : ""} imported successfully`];
    if (skipped) parts.push(`${skipped} skipped (duplicate name or code)`);
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

const exportContractTypes = async (req, res) => {
  try {
    const contractTypes = await ContractType.find().lean();
    const rows = contractTypes.map((c) => {
      const created = formatIST(c.createdAt);
      const updated = formatIST(c.updatedAt);
      return {
        name: c.name, code: c.code, description: c.description,
        freeService: c.freeService, freeParts: c.freeParts, status: c.status,
        "Created Date": created.date, "Created Time": created.time,
        "Updated Date": updated.date, "Updated Time": updated.time,
      };
    });
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "ContractTypes");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=contract_types.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, downloadSample, importContractTypes, exportContractTypes };
