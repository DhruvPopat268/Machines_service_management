const mongoose = require("mongoose");
const xlsx = require("xlsx");
const Vendor = require("./admin.vendor.model");

const getAll = async (req, res) => {
  try {
    const { search, status, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:        { $regex: escaped, $options: "i" } },
          { companyName: { $regex: escaped, $options: "i" } },
          { phone:       { $regex: escaped, $options: "i" } },
          { email:       { $regex: escaped, $options: "i" } },
        ];
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

    const [vendors, total] = await Promise.all([
      Vendor.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Vendor.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: vendors,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, companyName, phone, email, address, gstNumber, status } = req.body;

    if (!name || typeof name !== "string" || !name.trim())
      return res.status(400).json({ success: false, message: "Name is required" });
    if (!companyName || typeof companyName !== "string" || !companyName.trim())
      return res.status(400).json({ success: false, message: "Company name is required" });
    if (!phone || typeof phone !== "string" || !phone.trim())
      return res.status(400).json({ success: false, message: "Phone is required" });
    if (!email || typeof email !== "string" || !email.trim())
      return res.status(400).json({ success: false, message: "Email is required" });
    if (status !== undefined && !["Active", "Inactive"].includes(status))
      return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });

    const trimmedGst = gstNumber ? String(gstNumber).trim().toUpperCase() : "";
    if (trimmedGst) {
      const gstExists = await Vendor.findOne({ gstNumber: trimmedGst });
      if (gstExists)
        return res.status(409).json({ success: false, message: "GST number already exists" });
    }

    const vendor = await Vendor.create({
      name: name.trim(), companyName: companyName.trim(),
      phone: phone.trim(), email: email.trim().toLowerCase(),
      address, gstNumber: trimmedGst, status,
    });
    res.status(201).json({ success: true, data: vendor });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "GST number already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid vendor ID" });

    const { name, companyName, phone, email, address, gstNumber, status } = req.body;
    const updateData = {};

    if (name !== undefined)        updateData.name        = typeof name === "string" ? name.trim() : name;
    if (companyName !== undefined) updateData.companyName = typeof companyName === "string" ? companyName.trim() : companyName;
    if (phone !== undefined)       updateData.phone       = typeof phone === "string" ? phone.trim() : phone;
    if (email !== undefined)       updateData.email       = typeof email === "string" ? email.trim().toLowerCase() : email;
    if (address !== undefined)     updateData.address     = address;
    if (gstNumber !== undefined)   updateData.gstNumber   = typeof gstNumber === "string" ? gstNumber.trim().toUpperCase() : gstNumber;
    if (status !== undefined) {
      if (!["Active", "Inactive"].includes(status))
        return res.status(400).json({ success: false, message: "Status must be Active or Inactive" });
      updateData.status = status;
    }

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    const vendor = await Vendor.findByIdAndUpdate(id, updateData, { new: true, runValidators: true, context: "query" });
    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    res.status(200).json({ success: true, data: vendor });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "GST number already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid vendor ID" });

    const vendor = await Vendor.findByIdAndDelete(id);
    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    res.status(200).json({ success: true, message: "Vendor deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["name", "companyName", "phone", "email", "address", "gstNumber", "status"],
    ["John Doe", "Acme Supplies", "+91 9800000000", "john@acme.com", "123 Main St, Mumbai", "27AABCG1234A1Z5", "Active"],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Vendors");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=vendors_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

const importVendors = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.originalname.match(/\.xlsx$/i))
      return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

    const wb = xlsx.read(req.file.buffer, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    if (!rows.length) return res.status(400).json({ success: false, message: "File is empty" });

    const required = ["name", "companyname", "phone", "email", "status"];
    const headers = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length)
      return res.status(400).json({ success: false, message: `Missing columns: ${missing.join(", ")}` });

    const errors = [];
    const docs = [];
    rows.forEach((row, i) => {
      const name        = String(row.name || "").trim();
      const companyName = String(row.companyName || row.companyname || "").trim();
      const phone       = String(row.phone || "").trim();
      const email       = String(row.email || "").trim().toLowerCase();
      const address     = String(row.address || "").trim();
      const gstNumber   = String(row.gstNumber || row.gstnumber || "").trim().toUpperCase();
      const status      = String(row.status || "").trim();

      if (!name)        { errors.push(`Row ${i + 2}: name is required`); return; }
      if (!companyName) { errors.push(`Row ${i + 2}: companyName is required`); return; }
      if (!phone)       { errors.push(`Row ${i + 2}: phone is required`); return; }
      if (!email)       { errors.push(`Row ${i + 2}: email is required`); return; }
      if (!["Active", "Inactive"].includes(status)) { errors.push(`Row ${i + 2}: status must be Active or Inactive`); return; }
      docs.push({ name, companyName, phone, email, address, gstNumber, status });
    });

    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

    let imported = 0, skipped = 0;
    for (const doc of docs) {
      try {
        if (doc.gstNumber) {
          const existing = await Vendor.findOneAndUpdate(
            { gstNumber: doc.gstNumber },
            { $setOnInsert: doc },
            { upsert: true, returnDocument: "before", setDefaultsOnInsert: true }
          );
          existing ? skipped++ : imported++;
        } else {
          await Vendor.create(doc);
          imported++;
        }
      } catch (rowErr) {
        if (rowErr.code === 11000) { skipped++; } else { throw rowErr; }
      }
    }

    const parts = [`${imported} vendor${imported !== 1 ? "s" : ""} imported successfully`];
    if (skipped) parts.push(`${skipped} skipped (duplicate)`);
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

const exportVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find().lean();
    const rows = vendors.map((v) => {
      const created = formatIST(v.createdAt);
      const updated = formatIST(v.updatedAt);
      return {
        name: v.name, companyName: v.companyName, phone: v.phone,
        email: v.email, address: v.address, gstNumber: v.gstNumber, status: v.status,
        "Created Date": created.date, "Created Time": created.time,
        "Updated Date": updated.date, "Updated Time": updated.time,
      };
    });
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Vendors");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=vendors.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, downloadSample, importVendors, exportVendors };
