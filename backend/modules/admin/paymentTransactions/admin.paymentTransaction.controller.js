const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs/promises");
const PaymentTransaction = require("./admin.paymentTransaction.model");
const SoldMachine = require("../soldMachines/admin.soldMachine.model");
const Company = require("../companyManagement/admin.company.model");
const Counter = require("../auth/counter.model");

const DOCS_DIR = process.env.NODE_ENV === "production"
  ? "/app/cloud/Documents"
  : path.join(__dirname, "../../../cloud/Documents");

const numberToWords = (amount) => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convert = (n) => {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred " + convert(n % 100);
    if (n < 100000) return convert(Math.floor(n / 1000)) + "Thousand " + convert(n % 1000);
    if (n < 10000000) return convert(Math.floor(n / 100000)) + "Lakh " + convert(n % 100000);
    return convert(Math.floor(n / 10000000)) + "Crore " + convert(n % 10000000);
  };

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = convert(rupees).trim();
  if (!words) words = "Zero";
  words += " Rupees";
  if (paise > 0) words += " and " + convert(paise).trim() + " Paise";
  words += " Only";
  return words;
};

const generatePaymentReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ success: false, message: "Invalid transaction ID" });

    const { companyId } = req.body;
    if (!mongoose.isValidObjectId(companyId))
      return res.status(400).json({ success: false, message: "Invalid companyId" });

    const transaction = await PaymentTransaction.findById(id);
    if (!transaction)
      return res.status(404).json({ success: false, message: "Payment transaction not found" });

    const sale = await SoldMachine.findById(transaction.soldMachineId).lean();
    if (!sale)
      return res.status(404).json({ success: false, message: "Sale not found" });

    const company = await Company.findById(companyId).lean();
    if (!company)
      return res.status(404).json({ success: false, message: "Company not found" });

    const counter = await Counter.findByIdAndUpdate(
      "paymentReceipt",
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const receiptNumber = `REC-${counter.seq}`;

    const d = new Date(transaction.createdAt);
    const receiptDate = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

    const invoiceLogoUrl = process.env.INVOICE_LOGO_URL || "";
    const invoiceLogoText = process.env.INVOICE_LOGO_TEXT || "";

    const templatePath = path.join(__dirname, "../../../invoicesExamples/payment-receipt.html");
    let html = await fs.readFile(templatePath, "utf-8");

    const formatNum = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    html = html
      .replace(/{{receiptNumber}}/g, receiptNumber)
      .replace(/{{receiptDate}}/g, receiptDate)
      .replace(/{{customerName}}/g, sale.customerInfo.name || "")
      .replace(/{{customerAddress}}/g, sale.customerInfo.address || "")
      .replace(/{{amountInWords}}/g, numberToWords(transaction.amount))
      .replace(/{{amountReceived}}/g, formatNum(transaction.amount))
      .replace(/{{invoiceNumber}}/g, sale.invoiceNumber || "")
      .replace(/{{companyName}}/g, company.name || "")
      .replace(/{{companyTagline}}/g, company.tagline || "")
      .replace(/{{companyAddress}}/g, company.address || "")
      .replace(/{{companyPhone}}/g, company.phone || "")
      .replace(/{{companyEmail}}/g, company.email || "")
      .replace(/{{invoiceLogoUrl}}/g, invoiceLogoUrl)
      .replace(/{{invoiceLogoText}}/g, invoiceLogoText);

    // Handle conditional blocks
    html = company.tagline
      ? html.replace(/{{#if companyTagline}}([\.\s\S]*?){{\/if}}/g, "$1")
      : html.replace(/{{#if companyTagline}}[\.\s\S]*?{{\/if}}/g, "");
    html = invoiceLogoUrl
      ? html.replace(/{{#if invoiceLogoUrl}}([\.\s\S]*?){{\/if}}/g, "$1")
      : html.replace(/{{#if invoiceLogoUrl}}[\.\s\S]*?{{\/if}}/g, "");
    html = invoiceLogoText
      ? html.replace(/{{#if invoiceLogoText}}([\.\s\S]*?){{\/if}}/g, "$1")
      : html.replace(/{{#if invoiceLogoText}}[\.\s\S]*?{{\/if}}/g, "");

    const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
      import("puppeteer"),
      import("@sparticuz/chromium"),
    ]);
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
    await fs.mkdir(DOCS_DIR, { recursive: true });
    const filename = `payment_receipt_${receiptNumber}_${Date.now()}.pdf`;
    const filepath = path.join(DOCS_DIR, filename);

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: filepath, format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
    await browser.close();

    const receiptUrl = `${process.env.BACKEND_URL}/app/cloud/Documents/${filename}`;
    await PaymentTransaction.findByIdAndUpdate(id, { receiptNumber, receiptUrl });

    return res.status(200).json({ success: true, receiptUrl, receiptNumber });
  } catch (err) {
    console.error("Error generating payment receipt:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { generatePaymentReceipt };
