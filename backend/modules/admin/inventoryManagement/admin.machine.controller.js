const xlsx = require("xlsx");
const path   = require("path");
const fs     = require("fs/promises");
const sharp  = require("sharp");

const IMAGES_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/images"
  : path.join(__dirname, "../../../cloud/images");
const mongoose = require("mongoose");
const Machine  = require("./admin.machine.model");
const MachineCategory = require("../machineCategoryManagement/admin.machineCategory.model");
const MachineDivision = require("../machineDivisionManagement/admin.machineDivision.model");
const Attribute       = require("../attributeManagement/admin.attribute.model");
const { validateCreateMachine, validateUpdateMachine, validateImageFile, validateImportMachineRow, MAX_IMAGES } = require("./admin.machine.validator");

const createdDirs = new Set();

const uploadToServer = async (fileBuffer, filename) => {
  if (!createdDirs.has(IMAGES_DIR)) {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
    createdDirs.add(IMAGES_DIR);
  }

  await sharp(fileBuffer)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 70, effort: 1, smartSubsample: true })
    .toFile(path.join(IMAGES_DIR, filename));

  return `${process.env.BACKEND_URL}/app/cloud/images/${filename}`;
};

const deleteFromServer = async (url) => {
  try {
    const filename = url.split("/app/cloud/images/")[1];
    if (!filename) return;
    await fs.unlink(path.join(IMAGES_DIR, filename));
  } catch (_) {}
};

const processImages = async (files, existingCount = 0) => {
  const urls = [];
  for (const file of files) {
    const error = validateImageFile(file);
    if (error) throw new Error(error);
    const filename = `machine_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
    const url = await uploadToServer(file.buffer, filename);
    urls.push(url);
  }
  return urls;
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const caseInsensitiveRegex = (val) => ({ $regex: `^${escapeRegex(String(val).trim())}$`, $options: "i" });

const isMachineDuplicate = async (name, category, division, modelNumber, excludeId = null) => {
  const query = {
    name:        caseInsensitiveRegex(name),
    category,
    division:    division || null,
    modelNumber: caseInsensitiveRegex(modelNumber || ""),
  };
  if (excludeId) query._id = { $ne: excludeId };
  return !!(await Machine.findOne(query));
};

const applyImageOrder = (imageOrder, uploadedUrls, keptImages = []) => {
  if (!imageOrder || !imageOrder.length) return [...keptImages, ...uploadedUrls];
  return imageOrder.map((token) => {
    if (token.startsWith("new:")) {
      const idx = parseInt(token.split(":")[1]);
      return uploadedUrls[idx] ?? null;
    }
    return token;
  }).filter(Boolean);
};

const getAll = async (req, res) => {
  try {
    const { search, status, category, division, fromDate, toDate, page = 1, limit = 10 } = req.query;
    const query = {};

    if (typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { name:        { $regex: escaped, $options: "i" } },
          { modelNumber: { $regex: escaped, $options: "i" } },
        ];
      }
    }

    if (status && ["Active", "Inactive"].includes(status)) query.status = status;
    if (category && mongoose.isValidObjectId(category)) query.category = category;
    if (division && mongoose.isValidObjectId(division)) query.division = division;

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

    const [machines, total] = await Promise.all([
      Machine.find(query)
        .populate("category", "name")
        .populate("division", "name")
        .populate("variants.attribute", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Machine.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: machines,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getOne = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid machine ID" });

    const machine = await Machine.findById(id)
      .populate("category", "name")
      .populate("division", "name")
      .populate("variants.attribute", "name");

    if (!machine)
      return res.status(404).json({ success: false, message: "Machine not found" });

    res.status(200).json({ success: true, data: machine });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, modelNumber, serialNumber, hsnCode, partCode, gstPercentage, category, division, variants, notes, status, imageOrder } = req.body;

    const error = validateCreateMachine({ name, category, division, gstPercentage, status, variants });
    if (error) return res.status(400).json({ success: false, message: error });

    const duplicate = await isMachineDuplicate(name, category, division, modelNumber);
    if (duplicate)
      return res.status(409).json({ success: false, message: "A machine with the same name, category, division and model number already exists" });

    const files = req.files || [];
    if (files.length > MAX_IMAGES)
      return res.status(400).json({ success: false, message: `Maximum ${MAX_IMAGES} images allowed` });

    let imageUrls = [];
    if (files.length) {
      try {
        imageUrls = await processImages(files);
      } catch (imgErr) {
        return res.status(400).json({ success: false, message: imgErr.message });
      }
    }

    const parsedOrder = imageOrder ? (typeof imageOrder === "string" ? JSON.parse(imageOrder) : imageOrder) : null;
    const orderedImages = applyImageOrder(parsedOrder, imageUrls);

    let parsedVariants = [];
    if (variants) {
      try {
        parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;
      } catch (_) {
        return res.status(400).json({ success: false, message: "Invalid variants format" });
      }
    }

    const machine = await Machine.create({
      name: name.trim(),
      modelNumber, serialNumber, hsnCode, partCode,
      gstPercentage: gstPercentage !== "" && gstPercentage !== undefined ? Number(gstPercentage) : null,
      category,
      division: division || null,
      variants: parsedVariants,
      images: orderedImages,
      notes,
      status,
    });

    res.status(201).json({ success: true, data: machine });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid machine ID" });

    const machine = await Machine.findById(id);
    if (!machine)
      return res.status(404).json({ success: false, message: "Machine not found" });

    const { name, modelNumber, serialNumber, hsnCode, partCode, gstPercentage, category, division, variants, notes, status, existingImages, imageOrder } = req.body;

    const error = validateUpdateMachine({ name, division, gstPercentage, status, variants });
    if (error) return res.status(400).json({ success: false, message: error });

    const dupName     = name        !== undefined ? name        : machine.name;
    const dupCategory = category    !== undefined ? category    : machine.category;
    const dupDivision = division    !== undefined ? division    : machine.division;
    const dupModel    = modelNumber !== undefined ? modelNumber : machine.modelNumber;
    const duplicate   = await isMachineDuplicate(dupName, dupCategory, dupDivision, dupModel, id);
    if (duplicate)
      return res.status(409).json({ success: false, message: "A machine with the same name, category, division and model number already exists" });

    // existingImages = ordered kept URLs from frontend (index 0 = primary)
    const keptImages = existingImages !== undefined
      ? (typeof existingImages === "string" ? JSON.parse(existingImages) : existingImages)
      : [...machine.images];

    // validate count before any disk operations
    const files = req.files || [];
    if (keptImages.length + files.length > MAX_IMAGES)
      return res.status(400).json({ success: false, message: `Maximum ${MAX_IMAGES} images allowed` });

    // upload new files
    let uploadedUrls = [];
    if (files.length) {
      try {
        uploadedUrls = await processImages(files);
      } catch (imgErr) {
        return res.status(400).json({ success: false, message: imgErr.message });
      }
    }

    // apply imageOrder manifest to reconstruct full ordered array
    const parsedOrder = imageOrder ? (typeof imageOrder === "string" ? JSON.parse(imageOrder) : imageOrder) : null;
    const currentImages = applyImageOrder(parsedOrder, uploadedUrls, keptImages);

    const updateData = { images: currentImages };
    if (name !== undefined)          updateData.name          = name.trim();
    if (modelNumber !== undefined)   updateData.modelNumber   = modelNumber;
    if (serialNumber !== undefined)  updateData.serialNumber  = serialNumber;
    if (hsnCode !== undefined)       updateData.hsnCode       = hsnCode;
    if (partCode !== undefined)      updateData.partCode      = partCode;
    if (gstPercentage !== undefined) updateData.gstPercentage = gstPercentage !== "" ? Number(gstPercentage) : null;
    if (category !== undefined)      updateData.category      = category;
    if (division !== undefined)      updateData.division      = division || null;
    if (notes !== undefined)         updateData.notes         = notes;
    if (status !== undefined)        updateData.status        = status;
    if (variants !== undefined) {
      try {
        updateData.variants = typeof variants === "string" ? JSON.parse(variants) : variants;
      } catch (_) {
        return res.status(400).json({ success: false, message: "Invalid variants format" });
      }
    }

    const updated = await Machine.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
      .populate("category", "name")
      .populate("division", "name")
      .populate("variants.attribute", "name");

    // delete removed files from disk only after DB update succeeds
    const removedUrls = machine.images.filter((url) => !keptImages.includes(url));
    for (const url of removedUrls) await deleteFromServer(url);

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid machine ID" });

    const machine = await Machine.findByIdAndDelete(id);
    if (!machine)
      return res.status(404).json({ success: false, message: "Machine not found" });

    for (const url of machine.images) await deleteFromServer(url);

    res.status(200).json({ success: true, message: "Machine deleted successfully" });
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

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["name", "modelNumber", "serialNumber", "partCode", "hsnCode", "gstPercentage", "category", "division", "status", "notes"],
    ["CNC Machine X200", "X200", "SN-001", "MC-X200-001", "84715000", "18", "Heavy Machinery", "CNC Division", "Active", "Sample notes"],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Machines");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=machines_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

const importMachines = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.originalname.match(/\.xlsx$/i))
      return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

    const wb   = xlsx.read(req.file.buffer, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    if (!rows.length) return res.status(400).json({ success: false, message: "File is empty" });

    const required = ["name", "category", "status"];
    const headers  = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
    const missing  = required.filter((h) => !headers.includes(h));
    if (missing.length)
      return res.status(400).json({ success: false, message: `Missing columns: ${missing.join(", ")}` });

    // pre-load all categories, divisions, attributes for name → id lookup
    const [allCategories, allDivisions, allAttributes] = await Promise.all([
      MachineCategory.find({}, "name _id").lean(),
      MachineDivision.find({}, "name _id").lean(),
      Attribute.find({}, "name _id").lean(),
    ]);

    const catMap  = Object.fromEntries(allCategories.map((c) => [c.name.toLowerCase(), c._id]));
    const divMap  = Object.fromEntries(allDivisions.map((d)  => [d.name.toLowerCase(), d._id]));
    const attrMap = Object.fromEntries(allAttributes.map((a) => [a.name.toLowerCase(), a._id]));

    let imported = 0, skipped = 0;
    const skippedReasons = [];

    for (let i = 0; i < rows.length; i++) {
      const row        = rows[i];
      const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), typeof v === "string" ? v.trim() : v]));
      const rowNum     = i + 2;

      const validationError = validateImportMachineRow(normalized, rowNum);
      if (validationError) { skipped++; skippedReasons.push(validationError); continue; }

      const categoryId = catMap[String(normalized.category || "").toLowerCase()];
      if (!categoryId) { skipped++; skippedReasons.push(`Row ${rowNum}: category "${normalized.category}" not found`); continue; }

      const divisionId = normalized.division ? divMap[String(normalized.division).toLowerCase()] : null;
      if (!normalized.division || !divisionId) { skipped++; skippedReasons.push(`Row ${rowNum}: division "${normalized.division}" not found`); continue; }

      try {
        const duplicate = await isMachineDuplicate(normalized.name, categoryId, divisionId, normalized.modelnumber || "");
        if (duplicate) { skipped++; skippedReasons.push(`Row ${rowNum}: duplicate machine (same name, category, division, model number)`); continue; }

        await Machine.create({
          name:          String(normalized.name          || ""),
          modelNumber:   String(normalized.modelnumber   || ""),
          serialNumber:  String(normalized.serialnumber  || ""),
          partCode:      String(normalized.partcode      || ""),
          hsnCode:       String(normalized.hsncode       || ""),
          gstPercentage: normalized.gstpercentage !== "" ? Number(normalized.gstpercentage) : null,
          category:      categoryId,
          division:      divisionId || null,
          status:        ["Active", "Inactive"].includes(normalized.status) ? normalized.status : "Active",
          notes:         String(normalized.notes || ""),
          variants:      [],
          images:        [],
          source:        "imported",
        });
        imported++;
      } catch (rowErr) {
        skipped++;
        skippedReasons.push(`Row ${rowNum}: ${rowErr.message}`);
      }
    }

    const parts = [`${imported} machine${imported !== 1 ? "s" : ""} imported successfully`];
    if (skipped) parts.push(`${skipped} skipped`);
    res.status(200).json({ success: true, message: parts.join(", "), skippedReasons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const exportMachines = async (req, res) => {
  try {
    const machines = await Machine.find()
      .populate("category", "name")
      .populate("division", "name")
      .populate("variants.attribute", "name")
      .lean();

    const rows = machines.map((m) => {
      const created = formatIST(m.createdAt);
      const updated = formatIST(m.updatedAt);
      return {
        name:          m.name,
        modelNumber:   m.modelNumber,
        serialNumber:  m.serialNumber,
        partCode:      m.partCode,
        hsnCode:       m.hsnCode,
        gstPercentage: m.gstPercentage ?? "",
        category:      m.category?.name  ?? "",
        division:      m.division?.name  ?? "",
        status:        m.status,
        notes:         m.notes,
        variants:      m.variants.map((v) => `${v.attribute?.name}:${v.value}`).join(" | "),
        "Created Date": created.date, "Created Time": created.time,
        "Updated Date": updated.date,  "Updated Time": updated.time,
      };
    });

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Machines");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=machines.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getOne, create, update, remove, downloadSample, importMachines, exportMachines };