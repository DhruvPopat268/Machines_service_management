const mongoose = require("mongoose");
const xlsx            = require("xlsx");
const Expense         = require("./admin.expense.model");
const ExpenseCategory = require("../expenseCategoriesManagement/admin.expenseCategory.model");

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

const getAll = async (req, res) => {
  try {
    const { search, categoryId, method, fromDate, toDate, page = 1, limit = 10 } = req.query;
    const query = {};

    if (search && typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) {
        const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.description = { $regex: escaped, $options: "i" };
      }
    }

    if (categoryId) {
      if (!mongoose.isValidObjectId(categoryId))
        return res.status(400).json({ success: false, message: "Invalid categoryId" });
      query["category.categoryId"] = new mongoose.Types.ObjectId(categoryId);
    }

    if (method && ["Cash", "Online"].includes(method)) query.method = method;

    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = new Date(fromDate);
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        query.date.$lte = to;
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [expenses, total, statsResult] = await Promise.all([
      Expense.find(query).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limitNum),
      Expense.countDocuments(query),
      Expense.aggregate([{ $match: query }, { $group: { _id: null, totalExpense: { $sum: "$amount" } } }]),
    ]);

    const totalExpense = statsResult[0]?.totalExpense ?? 0;

    res.status(200).json({
      success: true,
      data: {
        stats: { totalExpense: Math.round(totalExpense * 100) / 100 },
        expenses,
      },
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { categoryId, description, date, amount, method } = req.body;

    if (!categoryId || !mongoose.isValidObjectId(categoryId))
      return res.status(400).json({ success: false, message: "Valid categoryId is required" });

    if (!date)
      return res.status(400).json({ success: false, message: "Date is required" });

    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0)
      return res.status(400).json({ success: false, message: "Valid amount is required" });

    if (!method || !["Cash", "Online"].includes(method))
      return res.status(400).json({ success: false, message: "Method must be Cash or Online" });

    const category = await ExpenseCategory.findById(categoryId);
    if (!category)
      return res.status(404).json({ success: false, message: "Expense category not found" });

    const expense = await Expense.create({
      category: { categoryId: category._id, name: category.name },
      description,
      date:   new Date(date),
      amount: Number(amount),
      method,
    });

    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid expense ID" });

    const { categoryId, description, date, amount, method } = req.body;
    const updateData = {};

    if (categoryId !== undefined) {
      if (!mongoose.isValidObjectId(categoryId))
        return res.status(400).json({ success: false, message: "Valid categoryId is required" });
      const category = await ExpenseCategory.findById(categoryId);
      if (!category)
        return res.status(404).json({ success: false, message: "Expense category not found" });
      updateData.category = { categoryId: category._id, name: category.name };
    }

    if (description !== undefined) updateData.description = description;

    if (date !== undefined) updateData.date = new Date(date);

    if (amount !== undefined) {
      if (isNaN(Number(amount)) || Number(amount) < 0)
        return res.status(400).json({ success: false, message: "Valid amount is required" });
      updateData.amount = Number(amount);
    }

    if (method !== undefined) {
      if (!["Cash", "Online"].includes(method))
        return res.status(400).json({ success: false, message: "Method must be Cash or Online" });
      updateData.method = method;
    }

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ success: false, message: "Nothing to update" });

    const expense = await Expense.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!expense)
      return res.status(404).json({ success: false, message: "Expense not found" });

    res.status(200).json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid expense ID" });

    const expense = await Expense.findByIdAndDelete(id);
    if (!expense)
      return res.status(404).json({ success: false, message: "Expense not found" });

    res.status(200).json({ success: true, message: "Expense deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Parse a date value from xlsx — supports DD/MM/YY and DD/MM/YYYY (single or double digit day/month)
const parseFlexibleDate = (val) => {
  if (!val && val !== 0) return null;
  const s = String(val).trim();
  // D/M/YY or D/M/YYYY or DD/MM/YY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const mon = Number(m[2]);
  let year  = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, mon - 1, day));
  if (isNaN(d.getTime()) || d.getUTCFullYear() !== year || d.getUTCMonth() !== mon - 1 || d.getUTCDate() !== day) return null;
  return d;
};

const downloadSample = (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    ["category", "description", "date", "amount", "method (Online/Cash)"],
    ["Travel", "Flight to Mumbai", "15/01/2026", "5000", "Online"],
    ["Food", "Team lunch", "1/1/26", "1200", "Cash"],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Expenses");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=expenses_sample.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

const importExpenses = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (!req.file.originalname.match(/\.xlsx$/i))
      return res.status(400).json({ success: false, message: "Only .xlsx files are allowed" });

    const wb   = xlsx.read(req.file.buffer, { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

    if (!rows.length) return res.status(400).json({ success: false, message: "File is empty" });

    const headers = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());
    const required = ["category", "date", "amount", "method (online/cash)"];
    const missing  = required.filter((h) => !headers.includes(h));
    if (missing.length)
      return res.status(400).json({ success: false, message: `Missing columns: ${missing.join(", ")}` });

    // pre-load all active categories for lookup
    const allCategories = await ExpenseCategory.find({ status: "Active" }).lean();
    const catMap = new Map(allCategories.map((c) => [c.name.trim().toLowerCase(), c]));

    const skipped = [];
    const docs   = [];

    rows.forEach((row, i) => {
      const norm = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
      const rowNum = i + 2;

      const catName = String(norm["category"] || "").trim();
      const dateRaw = norm["date"];
      const amount  = Number(norm["amount"]);
      const method  = String(norm["method (online/cash)"] || "").trim();

      if (!catName)  { skipped.push(`category is required`); return; }
      if (!dateRaw && dateRaw !== 0) { skipped.push(`date is required`); return; }
      if (isNaN(amount) || amount < 0) { skipped.push(`valid amount is required`); return; }
      if (!["Cash", "Online"].includes(method)) { skipped.push(`method must be Cash or Online`); return; }

      const cat = catMap.get(catName.toLowerCase());
      if (!cat) { skipped.push(`category "${catName}" not found or inactive`); return; }

      const parsedDate = parseFlexibleDate(dateRaw);
      if (!parsedDate) { skipped.push(`invalid date — use DD/MM/YYYY or DD/MM/YY`); return; }

      docs.push({
        category: { categoryId: cat._id, name: cat.name },
        description: norm["description"] || "",
        date:   parsedDate,
        amount,
        method,
      });
    });

    if (docs.length) await Expense.insertMany(docs);

    const parts = [`${docs.length} expense${docs.length !== 1 ? "s" : ""} imported successfully`];
    if (skipped.length) parts.push(`${skipped.length} row${skipped.length !== 1 ? "s" : ""} skipped`);
    res.status(200).json({ success: true, message: parts.join(", "), skippedReasons: skipped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const exportExpenses = async (req, res) => {
  try {
    const { search, categoryId, method, fromDate, toDate } = req.query;
    const query = {};

    if (search && typeof search === "string") {
      const s = search.trim().slice(0, 100);
      if (s) { const e = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); query.description = { $regex: e, $options: "i" }; }
    }
    if (categoryId) {
      if (!mongoose.isValidObjectId(categoryId))
        return res.status(400).json({ success: false, message: "Invalid categoryId" });
      query["category.categoryId"] = new mongoose.Types.ObjectId(categoryId);
    }
    if (method && ["Cash", "Online"].includes(method)) query.method = method;
    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = new Date(fromDate);
      if (toDate)   { const to = new Date(toDate); to.setHours(23, 59, 59, 999); query.date.$lte = to; }
    }

    const expenses = await Expense.find(query).sort({ date: -1, createdAt: -1 }).lean();

    const rows = expenses.map((e) => {
      const d       = formatIST(e.date);
      const created = formatIST(e.createdAt);
      return {
        Category:       e.category?.name ?? "",
        Description:    e.description ?? "",
        Date:           d.date,
        "Amount (₹)":   e.amount,
        Method:         e.method,
        "Created Date": created.date,
        "Created Time": created.time,
      };
    });

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Expenses");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=expenses.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, create, update, remove, downloadSample, importExpenses, exportExpenses };
