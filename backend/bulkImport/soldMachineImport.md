# Sold Machine Bulk Import — Full Plan

## Overview

Allow admins to upload an `.xlsx` file to bulk-create multiple sale records at once.  
Uses an **all-or-nothing** strategy — any single error across the entire file causes complete rejection with all errors listed. Nothing is created unless the entire file is valid.

---

## File References

| Role | Path |
|------|------|
| Controller (add `importSales` here) | `backend/modules/admin/soldMachines/admin.soldMachine.controller.js` |
| Routes (add multer + POST /import here) | `backend/modules/admin/soldMachines/admin.soldMachine.routes.js` |
| SoldMachine model | `backend/modules/admin/soldMachines/admin.soldMachine.model.js` |
| PurchasedMachine model | `backend/modules/admin/purchasedMachines/admin.purchasedMachine.model.js` |
| Machine model | `backend/modules/admin/inventoryManagement/admin.machine.model.js` |
| Customer model | `backend/modules/admin/customerManagement/admin.customer.model.js` |
| ContractType model | `backend/modules/admin/contractTypesManagement/admin.contractType.model.js` |
| GstConfig model | `backend/modules/admin/gstConfig/admin.gstConfig.model.js` |
| InventoryLog model | `backend/modules/admin/inventoryLogs/admin.inventoryLog.model.js` |
| PaymentTransaction model | `backend/modules/admin/paymentTransactions/admin.paymentTransaction.model.js` |
| Frontend page (update Import dialog here) | `frontend/src/pages/SellMachinesPage.tsx` |
| Sample file download (already done) | `downloadSample` function in `admin.soldMachine.controller.js` |
| Purchase import reference (same pattern) | `backend/modules/admin/purchasedMachines/admin.purchasedMachine.controller.js` → `importPurchases` |

---

## Excel File Format

One row = **one serial number** (for product machines) or **one parts line**.  
Multiple rows sharing the same `invoiceNumber` = **one sale record**.

### Columns (16 total, order must match)

| # | Column Name | Example |
|---|-------------|---------|
| 1 | `invoiceNumber` | `INV-2024-001` |
| 2 | `customerPhone` | `9800000000` |
| 3 | `companyName` | `Acme Corp` |
| 4 | `itemName` | `Photocopier X200` |
| 5 | `modelNumber` | `X200` |
| 6 | `quantity` | `1` |
| 7 | `sellingPriceWithGst` | `15000` |
| 8 | `discountPercentage` | `0` |
| 9 | `serialNumber` | `SN-001` (blank for parts) |
| 10 | `contractTypeCode` | `TSS` (blank if none) |
| 11 | `validFrom` | `01/04/24` (blank if none) |
| 12 | `validTo` | `31/03/25` (blank if none) |
| 13 | `paymentStatus` | `Paid` / `Unpaid` / `Partial-Paid` |
| 14 | `paidAmount` | `7500` (only for `Partial-Paid`, else blank) |
| 15 | `paymentMethod` | `Cash` / `Online` (blank for `Unpaid`) |
| 16 | `paymentDate` | `01/04/24` (blank for `Unpaid`) |

---

## Validation Pipeline

### Step 1 — File-level checks
- File must be uploaded (not missing)
- File must have `.xlsx` extension
- File must not be empty (at least one data row after filtering blanks)
- All 16 required column names must be present (case-insensitive prefix match)
- Strip fully blank rows before any validation (same fix applied to purchase import)

---

### Step 2 — Row-level type & format checks
*(All rows validated, all errors collected before stopping)*

| Column | Rules |
|--------|-------|
| `invoiceNumber` | Non-empty, max 100 chars |
| `customerPhone` | Non-empty string |
| `companyName` | Non-empty string, max 200 chars |
| `itemName` | Non-empty string |
| `modelNumber` | Non-empty string |
| `quantity` | Positive integer ≥ 1 |
| `sellingPriceWithGst` | Non-negative number |
| `discountPercentage` | Number 0–100; blank defaults to `0` |
| `serialNumber` | No DB check here; blank allowed (parts) |
| `contractTypeCode` | If provided → `validFrom` and `validTo` must also be present |
| `validFrom` | If provided → must be `DD/MM/YY` format |
| `validTo` | If provided → must be `DD/MM/YY` format; must be after `validFrom` |
| `paymentStatus` | Must be `Paid`, `Unpaid`, or `Partial-Paid` |
| `paidAmount` | Required and > 0 when `paymentStatus` is `Partial-Paid`; must be blank for `Paid`/`Unpaid` |
| `paymentMethod` | Required when `paymentStatus` is `Paid` or `Partial-Paid`; must be `Cash` or `Online`; blank for `Unpaid` |
| `paymentDate` | Required when `paymentStatus` is `Paid` or `Partial-Paid`; must be `DD/MM/YY`; blank for `Unpaid` |

---

### Step 3 — Group-level cross-row checks
*(Group rows by `invoiceNumber`, then check each group)*

| Check | Rule |
|-------|-------|
| `customerPhone` consistency | All rows in a group must have the same `customerPhone` |
| `companyName` consistency | All rows in a group must have the same `companyName` |
| `paymentStatus` consistency | Same across all rows in the group |
| `paidAmount` consistency | Same across all rows in the group |
| `paymentMethod` consistency | Same across all rows in the group |
| `paymentDate` consistency | Same across all rows in the group |
| No duplicate serial numbers within group | Two rows in the same group cannot have the same `serialNumber` (case-insensitive) |
| No duplicate serial numbers across groups | Same `serialNumber` cannot appear in two different invoice groups |

---

### Step 4 — DB lookups & business rule checks
*(Run only after Steps 1–3 pass with zero errors)*

| Check | Rule |
|-------|-------|
| Invoice uniqueness | `invoiceNumber` must not already exist in `SoldMachine` (case-insensitive regex) |
| Customer exists | Lookup `Customer` by `phone` field matching `customerPhone`; must exist and `status = "Active"` |
| Machine exists | Lookup `Machine` by `name` (case-insensitive) + `modelNumber` (case-insensitive); must exist and `status = "Active"` |
| Product machine row | Machine category `_id` === `PRODUCT_CATEGORY_ID` → `serialNumber` must be non-blank; `quantity` must be exactly `1` per row |
| Parts machine row | Machine category `_id` !== `PRODUCT_CATEGORY_ID` → `serialNumber` must be blank |
| Serial in purchase | Each `serialNumber` must exist in a `PurchasedMachine` doc with `status = "available"` |
| Parts stock check | For each parts machine, total `quantity` across all rows of that machine in the group must be ≤ `availableParts` summed across all active purchase docs for that machine |
| `contractTypeCode` DB check | If provided → lookup `ContractType` by `code` (case-insensitive); must exist and `status = "Active"` |
| `paidAmount` < grandTotal | For `Partial-Paid`, computed `paidAmount` must be < computed `grandTotalWithGst` for that invoice group |
| Fetch GST config once | Load `GstConfig` once at start of Step 4 for price calculations |

---

### Step 5 — Create all records (transactions)
*(Run only after Steps 1–4 pass with zero errors)*

For each invoice group:
1. Compute `grandTotalBase`, `grandTotalWithGst`, `grandTotalGstAmount`, `cogsTotalBase` using GST config
2. Build `machineEntries` array (same shape as `createSale`)
3. Create one `SoldMachine` document inside a Mongoose session transaction
4. If `paymentStatus` is `Paid` or `Partial-Paid` → create `PaymentTransaction` document
5. Mark each `serialNumber` as `"sold"` in `PurchasedMachine`
6. Deduct `currentStock` on `Machine`, update `stockStatus` using `lowStockThreshold`
7. For parts machines: FIFO deduct `availableParts` / increment `soldParts` on oldest purchase doc
8. Create one `InventoryLog` entry per sale with `action: "sold"`
9. Commit transaction; if any error → abort entire session

Return: `{ success: true, message: "Imported X sale(s) successfully" }`

---

## What We Will NOT Do in Bulk Import

| Feature | Reason |
|---------|--------|
| PDF sales invoice generation | Too slow for bulk; Puppeteer per row would time out. User can generate individually after via "Generate Invoice" button |
| PDF payment receipt generation | Same reason as above |
| Sale confirmation email to customer | Noisy for bulk historical data entry; user can notify manually |
| Payment received email to customer | Same reason |
| Contract expiry email checks | Not triggered at import time |
| `customerPORef` field | Not included in import columns; can be added via edit after import |
| `processedBy` assignment | Not included; no single user to attribute bulk historical imports to |
| `companyInfo` snapshot on sale | Not stored during import since no invoice is generated |
| TSS pages categories (`pagesCategories`) | Complex nested data; not feasible in flat Excel format |
| Contract renewal validation (past date block) | Import may be for historical data; `validFrom` can be a past date |

---

## Backend Route to Add

```
POST /admin/sales/import
```

- Middleware: `adminAuthMiddleware`, `multer({ storage: memoryStorage(), limits: { fileSize: 5MB } }).single("file")`
- Handler: `importSales`
- File: `admin.soldMachine.routes.js`

---

## Frontend Changes

File: `frontend/src/pages/SellMachinesPage.tsx`

- Add state: `importStep`, `importFile`, `importing`, `isDragging`, `importErrors`, `fileInputRef`
- Add handlers: `handleDrop`, `handleImportUpload`
- Replace existing simple Import dialog with **3-step dialog** (same pattern as `PurchaseMachinesPage.tsx`):
  - **Step `menu`**: Download Sample + Upload File buttons
  - **Step `confirm`**: Format checklist reminder with all 16 column names
  - **Step `upload`**: Drag & drop `.xlsx` zone + Import button; on error → show red error list below drop zone (no toast)
- On success: `toast.success(res.data.message)`, close dialog, refresh table via `fetchSales(1)`

---

## Key Constants & Helpers (same as purchase import)

- `PRODUCT_CATEGORY_ID` — env var; distinguishes product (serial-based) from parts (quantity-based) machines
- `escapeRegex` — escape special chars for MongoDB `$regex` queries
- `ciRegex(val)` — returns `{ $regex: "^<escaped>$", $options: "i" }` for case-insensitive exact match
- `resolveStockStatus(stock, threshold)` — returns `"Out of Stock"` / `"Low Stock"` / `"In Stock"`
- GST config fetched once at the top of Step 4, not per row
