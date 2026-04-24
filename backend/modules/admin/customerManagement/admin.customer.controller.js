const mongoose = require("mongoose");
const xlsx = require("xlsx");
const Customer = require("./admin.customer.model");
const Zone = require("../zoneManagement/admin.zone.model");
const { validateCreateCustomer, validateUpdateCustomer, validateImportCustomerRow, validateGST } = require("./admin.customer.validator");

const getAll = async (req, res) => {
  try {
    const { search, status, fromDate, toDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:  { $regex: escaped, $options: "i" } },
          { phone: { $regex: escaped, $options: "i" } },
          { email: { $regex: escaped, $options: "i" } },
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

    const [customers, total] = await Promise.all([
      Customer.find(query).populate("zone", "name code").sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Customer.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: customers,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, phone, email, address, zone, status } = req.body;
    const gstNumber = req.body.gstNumber ? String(req.body.gstNumber).trim().toUpperCase() : "";

    const error = validateCreateCustomer({ name, phone, email, address, zone, status });
    if (error) return res.status(400).json({ success: false, message: error });

    if (gstNumber) {
      const gstError = validateGST(gstNumber);
      if (gstError) return res.status(400).json({ success: false, message: gstError });
      const gstExists = await Customer.findOne({ gstNumber });
      if (gstExists)
        return res.status(409).json({ success: false, message: "GST number already exists" });
    }

    const phoneExists = await Customer.findOne({ phone: phone.trim() });
    if (phoneExists) return res.status(409).json({ success: false, message: "Phone number already exists" });
    const emailExists = await Customer.findOne({ email: email.trim().toLowerCase() });
    if (emailExists) return res.status(409).json({ success: false, message: "Email already exists" });

    let zoneId = null;
    if (zone) {
      if (!mongoose.isValidObjectId(zone))
        return res.status(400).json({ success: false, message: "Invalid zone ID" });
      const zoneExists = await Zone.findById(zone);
      if (!zoneExists)
        return res.status(404).json({ success: false, message: "Zone not found" });
      zoneId = zone;
    }

    const customer = await Customer.create({
      name: name.trim(), phone: phone.trim(), email: email.trim().toLowerCase(),
      address: address ? String(address).trim() : "",
      zone: zoneId, gstNumber, status, source: "manual",
    });

    const populated = await customer.populate("zone", "name code");
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0];
      const msg = key === "phone" ? "Phone number already exists" : key === "email" ? "Email already exists" : "GST number already exists";
      return res.status(409).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid customer ID" });

    const { name, phone, email, address, zone, status } = req.body;
    const gstNumber = req.body.gstNumber !== undefined
      ? String(req.body.gstNumber).trim().toUpperCase()
      : undefined;

    const error = validateUpdateCustomer({ name, phone, email, address, zone, status });
    if (error) return res.status(400).json({ success: false, message: error });

    const updateData = {};
    if (name !== undefined)    updateData.name    = String(name).trim();
    if (phone !== undefined)   updateData.phone   = String(phone).trim();
    if (email !== undefined)   updateData.email   = String(email).trim().toLowerCase();
    if (address !== undefined) updateData.address = String(address).trim();
    if (status !== undefined)  updateData.status  = status;
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber;

    if (updateData.gstNumber) {
      const gstError = validateGST(updateData.gstNumber);
      if (gstError) return res.status(400).json({ success: false, message: gstError });
    }

    if (zone !== undefined) {
      if (zone === null || zone === "") {
        updateData.zone = null;
      } else {
        if (!mongoose.isValidObjectId(zone))
          return res.status(400).json({ success: false, message: "Invalid zone ID" });
        const zoneExists = await Zone.findById(zone);
        if (!zoneExists)
          return res.status(404).json({ success: false, message: "Zone not found" });
        updateData.zone = zone;
      }
    }

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    if (updateData.gstNumber) {
      const conflict = await Customer.findOne({ gstNumber: updateData.gstNumber, _id: { $ne: id } });
      if (conflict)
        return res.status(409).json({ success: false, message: "GST number already exists" });
    }
    if (updateData.phone) {
      const conflict = await Customer.findOne({ phone: updateData.phone, _id: { $ne: id } });
      if (conflict) return res.status(409).json({ success: false, message: "Phone number already exists" });
    }
    if (updateData.email) {
      const conflict = await Customer.findOne({ email: updateData.email, _id: { $ne: id } });
      if (conflict) return res.status(409).json({ success: false, message: "Email already exists" });
    }

    const customer = await Customer.findByIdAndUpdate(id, updateData, { new: true, runValidators: true, context: "query" }).populate("zone", "name code");
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found" });

    res.status(200).json({ success: true, data: customer });
  } catch (err) {
    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0];
      const msg = key === "phone" ? "Phone number already exists" : key === "email" ? "Email already exists" : "GST number already exists";
      return res.status(409).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid customer ID" });

    const customer = await Customer.findByIdAndDelete(id);
    if (!customer)
      return res.status(404).json({ success: false, message: "Customer not found" });

    res.status(200).json({ success: true, message: "Customer deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["name", "phone", "email", "address", "zoneName", "gstNumber", "totalPurchases", "status"],
    ["Acme Corp", "+91 9800000000", "acme@example.com", "123 Main St, Mumbai", "North Zone", "27AABCA1234A1Z5", 5, "Active"],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Customers");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=customers_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

const importCustomers = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.originalname.match(/\.xlsx$/i))
      return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

    const wb   = xlsx.read(req.file.buffer, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    if (!rows.length) return res.status(400).json({ success: false, message: "File is empty" });

    const required = ["name", "phone", "email", "status"];
    const headers  = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
    const missing  = required.filter((h) => !headers.includes(h));
    if (missing.length)
      return res.status(400).json({ success: false, message: `Missing columns: ${missing.join(", ")}` });

    const skippedReasons = [];
    const docs   = [];
    rows.forEach((row, i) => {
      const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
      const error = validateImportCustomerRow(normalized, i + 2);
      if (error) { skippedReasons.push(error); return; }
      docs.push({
        name:           String(normalized.name           || "").trim(),
        phone:          String(normalized.phone          || "").trim(),
        email:          String(normalized.email          || "").trim().toLowerCase(),
        address:        String(normalized.address        || "").trim(),
        zoneName:       String(normalized.zonename       || "").trim(),
        gstNumber:      String(normalized.gstnumber      || "").trim().toUpperCase(),
        totalPurchases: normalized.totalpurchases !== undefined && normalized.totalpurchases !== "" ? Math.max(0, Number(normalized.totalpurchases)) : 0,
        status:         String(normalized.status         || "").trim(),
      });
    });

    let imported = 0, skipped = skippedReasons.length;
    for (const doc of docs) {
      try {
        if (doc.gstNumber) {
          const gstError = validateGST(doc.gstNumber);
          if (gstError) { skipped++; continue; }
          const gstExists = await Customer.findOne({ gstNumber: doc.gstNumber });
          if (gstExists) { skipped++; continue; }
        }
        const phoneExists = await Customer.findOne({ phone: doc.phone });
        if (phoneExists) { skipped++; continue; }
        const emailExists = await Customer.findOne({ email: doc.email });
        if (emailExists) { skipped++; continue; }

        let zoneId = null;
        if (doc.zoneName) {
          const zone = await Zone.findOne({ name: { $regex: `^${doc.zoneName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
          if (zone) zoneId = zone._id;
        }

        await Customer.create({
          name: doc.name, phone: doc.phone, email: doc.email,
          address: doc.address, zone: zoneId,
          gstNumber: doc.gstNumber, totalPurchases: doc.totalPurchases, status: doc.status, source: "imported",
        });
        imported++;
      } catch (rowErr) {
        if (rowErr.code === 11000) { skipped++; } else { throw rowErr; }
      }
    }

    const parts = [`${imported} customer${imported !== 1 ? "s" : ""} imported successfully`];
    if (skipped) parts.push(`${skipped} skipped`);
    res.status(200).json({ success: true, message: parts.join(", "), skippedReasons: [...new Set(skippedReasons.map((r) => r.replace(/^Row \d+: /, "")))] });
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

const exportCustomers = async (req, res) => {
  try {
    const { search, status, fromDate, toDate } = req.query;
    const query = {};
    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) { const e = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); query.$or = [{ name: { $regex: e, $options: "i" } }, { phone: { $regex: e, $options: "i" } }, { email: { $regex: e, $options: "i" } }]; }
    }
    if (status && ["Active", "Inactive"].includes(status)) query.status = status;
    if (fromDate || toDate) {
      const p = (ddmmyy, end) => { const [dd,mm,yy]=ddmmyy.split("/"); return new Date(Date.UTC(2000+Number(yy),Number(mm)-1,Number(dd),end?23:0,end?59:0,end?59:0,end?999:0)-(5.5*60*60*1000)); };
      query.createdAt={}; if(fromDate) query.createdAt.$gte=p(fromDate,false); if(toDate) query.createdAt.$lte=p(toDate,true);
    }
    const customers = await Customer.find(query).populate("zone", "name").lean();
    const rows = customers.map((c) => {
      const created = formatIST(c.createdAt);
      const updated = formatIST(c.updatedAt);
      return {
        name: c.name, phone: c.phone, email: c.email,
        address: c.address, zone: c.zone?.name || "",
        gstNumber: c.gstNumber, status: c.status,
        "Created Date": created.date, "Created Time": created.time,
        "Updated Date": updated.date, "Updated Time": updated.time,
      };
    });
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Customers");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=customers.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, downloadSample, importCustomers, exportCustomers };
