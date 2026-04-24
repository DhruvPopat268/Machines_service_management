const mongoose = require("mongoose");
const xlsx = require("xlsx");
const Zone = require("./admin.zone.model");
const { validateCreateZone, validateUpdateZone, validateImportZoneRow, caseInsensitiveNameRegex } = require("./admin.zone.validator");

const Customer = require("../customerManagement/admin.customer.model");

const getAllZones = async (req, res) => {
  try {
    const { search, status, fromDate, toDate, page = 1, limit = 10 } = req.query;

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

    if (status && ["Active", "Inactive"].includes(status)) {
      query.status = status;
    }

    // fromDate / toDate arrive as dd/mm/yy IST — convert to UTC range for MongoDB
    if (fromDate || toDate) {
      const parseIST = (ddmmyy, endOfDay = false) => {
        const [dd, mm, yy] = ddmmyy.split("/");
        const year = 2000 + Number(yy);
        // IST midnight = UTC 18:30 previous day; IST 23:59:59 = UTC 18:29:59 same day
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const base = Date.UTC(year, Number(mm) - 1, Number(dd), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return new Date(base - istOffsetMs);
      };

      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = parseIST(fromDate, false);
      if (toDate)   query.createdAt.$lte = parseIST(toDate, true);
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [zones, total] = await Promise.all([
      Zone.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Zone.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: zones,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createZone = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const rawCode = req.body.code;

    const error = validateCreateZone({ name, code: rawCode, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const code = rawCode.trim().toUpperCase();

    const existing = await Zone.findOne({ $or: [{ name: caseInsensitiveNameRegex(name.trim()) }, { code }] });
    if (existing) {
      if (existing.name.toLowerCase() === name.trim().toLowerCase())
        return res.status(409).json({ success: false, message: "Zone name already exists" });
      return res.status(409).json({ success: false, message: "Zone code already exists" });
    }

    const zone = await Zone.create({ name: name.trim(), code, description, status, source: "manual" });
    res.status(201).json({ success: true, data: zone });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyPattern && err.keyPattern.name ? "Zone name" : "Zone code";
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid zone ID" });

    const { name, code, description, status } = req.body;

    const error = validateUpdateZone({ name, code, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const update = {};
    if (name !== undefined) update.name = typeof name === "string" ? name.trim() : name;
    if (code !== undefined) update.code = typeof code === "string" ? code.trim().toUpperCase() : code;
    if (description !== undefined) update.description = description;
    if (status !== undefined) update.status = status;

    if (Object.keys(update).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    // Case-insensitive duplicate check for name and code (excluding current doc)
    if (update.name || update.code) {
      const orConditions = [];
      if (update.name) orConditions.push({ name: caseInsensitiveNameRegex(update.name) });
      if (update.code) orConditions.push({ code: update.code });
      const conflict = await Zone.findOne({ $or: orConditions, _id: { $ne: id } });
      if (conflict) {
        if (update.name && conflict.name.toLowerCase() === update.name.toLowerCase())
          return res.status(409).json({ success: false, message: "Zone name already exists" });
        return res.status(409).json({ success: false, message: "Zone code already exists" });
      }
    }
    const zone = await Zone.findByIdAndUpdate(id, update, { new: true, runValidators: true, context: "query" });
    if (!zone)
      return res.status(404).json({ success: false, message: "Zone not found" });

    res.status(200).json({ success: true, data: zone });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyPattern && err.keyPattern.name ? "Zone name" : "Zone code";
      return res.status(409).json({ success: false, message: `${field} already exists` });
    }
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

const getCustomerCount = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid zone ID" });
    const count = await Customer.countDocuments({ zone: id });
    res.status(200).json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([["name", "code", "status (Active/Inactive)"], ["North Zone", "NZ", "Active"]]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Zones");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=zones_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

const importZones = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.originalname.match(/\.xlsx$/i))
      return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

    const wb = xlsx.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });

    if (!rows.length) return res.status(400).json({ success: false, message: "File is empty" });

    const required = ["name", "code", "status"];
    const headers = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length)
      return res.status(400).json({ success: false, message: `Missing columns: ${missing.join(", ")}` });

    const errors = [];
    const docs = [];
    rows.forEach((row, i) => {
      const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
      const error = validateImportZoneRow(normalized, i + 2);
      if (error) { errors.push(error); return; }
      docs.push({
        name:   String(normalized.name   || "").trim(),
        code:   String(normalized.code   || "").trim().toUpperCase(),
        status: String(normalized.status || "").trim(),
      });
    });

    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

    let imported = 0;
    let skipped = 0;
    for (const doc of docs) {
      try {
        const existing = await Zone.findOne({
          $or: [
            { name: caseInsensitiveNameRegex(doc.name) },
            { code: doc.code },
          ],
        });
        if (existing) { skipped++; continue; }
        await Zone.create({ ...doc, source: "imported" });
        imported++;
      } catch (rowErr) {
        if (rowErr.code === 11000) { skipped++; } else { throw rowErr; }
      }
    }

    const parts = [`${imported} zone${imported !== 1 ? "s" : ""} imported successfully`];
    if (skipped) parts.push(`${skipped} skipped (duplicate name or code)`);
    res.status(200).json({ success: true, message: parts.join(", ") });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const formatIST = (date) => {
  const d = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(2);
  const h = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = String(h % 12 || 12).padStart(2, "0");
  return { date: `${dd}/${mm}/${yy}`, time: `${h12}:${min} ${ampm}` };
};

const exportZones = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;
    const query = {};
    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) { const e = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); query.$or = [{ name: { $regex: e, $options: "i" } }, { code: { $regex: e, $options: "i" } }]; }
    }
    if (status && ["Active", "Inactive"].includes(status)) query.status = status;
    if (fromDate || toDate) {
      const p = (ddmmyy, end) => { const [dd,mm,yy]=ddmmyy.split("/"); return new Date(Date.UTC(2000+Number(yy),Number(mm)-1,Number(dd),end?23:0,end?59:0,end?59:0,end?999:0)-(5.5*60*60*1000)); };
      query.createdAt={}; if(fromDate) query.createdAt.$gte=p(fromDate,false); if(toDate) query.createdAt.$lte=p(toDate,true);
    }
    const zones = await Zone.find(query).lean();
    const rows = zones.map((z) => {
      const created = formatIST(z.createdAt);
      const updated = formatIST(z.updatedAt);
      return {
        name: z.name,
        code: z.code,
        status: z.status,
        "Created Date": created.date,
        "Created Time": created.time,
        "Updated Date": updated.date,
        "Updated Time": updated.time,
      };
    });
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Zones");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=zones.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllZones, createZone, updateZone, deleteZone, getCustomerCount, importZones, exportZones, downloadSample };
