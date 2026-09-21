# Quick Raise Call & System Enhancement Documentation

This document covers all architectural designs, files added/modified, workflows, API specifications, and setup instructions implemented for the **Quick Raise Call** automation system.

---

## 📌 Overview

The traditional workflow required several manual, multi-step operations before a service call could be registered:
1. Manually creating or finding a vendor
2. Creating machine items, categories, and divisions
3. Creating a purchase invoice with serial numbers
4. Creating a sale invoice to link the machine to a customer
5. Finally raising a service call

**Quick Raise Call** automates this entire pipeline into a single wizard interface with two distinct operating modes:
- **Mode 1 — Auto / Dummy Vendor & Machine**: Designed for first-time or walk-in customers with unregistered machines. Automatically creates a system dummy vendor, generates a ₹0 purchase invoice, registers the sold machine record, and raises the service call in one atomic transaction.
- **Mode 2 — Real / Existing Vendor & Stock**: Allows selecting real vendors with available inventory stock, choosing their machines, and picking available serial numbers from dropdown lists. Supports custom selling price (or default ₹0).
- **Google Maps Integration**: Live Google Places Autocomplete to search customer addresses and capture exact Latitude and Longitude coordinates.
- **Zero Disruption Policy**: All existing routes, controllers, and database models were preserved. New functionality is isolated in its own self-contained module.

---

## 📁 Summary of Files Changed & Created

### 1. Backend (`/backend`)

| File Path | Action | Description |
|---|---|---|
| [`backend/modules/admin/quickRaiseCall/admin.quickRaiseCall.controller.js`](file:///e:/work/canon/backend/modules/admin/quickRaiseCall/admin.quickRaiseCall.controller.js) | **Created** | Core business logic: handles `dummy` & `existing` flows, transaction management, auto-invoicing, stock depletion, customer `userLocation` geocoding, and vendor stock inspection. |
| [`backend/modules/admin/quickRaiseCall/admin.quickRaiseCall.routes.js`](file:///e:/work/canon/backend/modules/admin/quickRaiseCall/admin.quickRaiseCall.routes.js) | **Created** | Express routes protected with `adminAuthMiddleware`. |
| [`backend/routes/index.js`](file:///e:/work/canon/backend/routes/index.js) | **Modified** | Mounted `/admin/quick-raise-call` under the admin route tree (1 line added). |
| [`backend/database/connection.js`](file:///e:/work/canon/backend/database/connection.js) | **Modified** | Added `dns.setServers(["8.8.8.8", "8.8.4.4"])` to resolve MongoDB Atlas SRV records on Windows networks. |

### 2. Frontend (`/frontend`)

| File Path | Action | Description |
|---|---|---|
| [`frontend/src/services/quickRaiseCallApi.ts`](file:///e:/work/canon/frontend/src/services/quickRaiseCallApi.ts) | **Created** | Typed API service covering `getVendors()`, `getStatus()`, and `raise()` payloads with `userLocation` support. |
| [`frontend/src/pages/QuickRaiseCallPage.tsx`](file:///e:/work/canon/frontend/src/pages/QuickRaiseCallPage.tsx) | **Created** | 4-step wizard UI featuring Google Maps autocomplete, cascading dropdowns for Vendor $\rightarrow$ Machine $\rightarrow$ Serial Number, and instant status preview. |
| [`frontend/src/App.tsx`](file:///e:/work/canon/frontend/src/App.tsx) | **Modified** | Added route: `/calls/quick-raise` mapped to `QuickRaiseCallPage` (2 lines added). |
| [`frontend/src/index.css`](file:///e:/work/canon/frontend/src/index.css) | **Modified** | Moved font `@import` to line 1 to adhere to CSS specifications and avoid Vite HMR warnings. |

---

## ⚙️ Feature Breakdown & Workflows

### 1. Step-by-Step UI Wizard (`QuickRaiseCallPage.tsx`)

#### Step 1: Mode Selection
- **Auto / Dummy Vendor**: Creates dummy vendor (Phone: `0000000000`, Company: `Dummy Vendor Co.`) if not already present. Handles ₹0 purchase + sale automatically.
- **Use Real / Existing Vendor**: Queries all active vendors with available stock. Shows stock counts and Real vs. Dummy badges.

#### Step 2: Customer Details + Google Maps Autocomplete
- **Quick-Select Existing Customer**: Dropdown populated from `/api/admin/customers` to instantly auto-fill returning customer records.
- **Google Maps Places Autocomplete**:
  - As the user types into the Address input, real-time predictions are fetched from the Google Places API.
  - Selecting a prediction automatically resolves latitude and longitude coordinates via `PlacesService` / `Geocoder`.
  - Stored inside `userLocation: { address, latitude, longitude }` in MongoDB.
- **Manual Entry**: Name (required), Phone (10 digits, required), Email (optional), Address (optional).

#### Step 3: Machine Details & Cascading Dropdowns
- **For Real / Existing Vendor Mode**:
  1. **Vendor Dropdown**: Lists all vendors with available inventory stock, showing vendor type and stock counts.
  2. **Machine Dropdown**: Enabled once a vendor is chosen; lists distinct machines with active serials under that vendor.
  3. **Serial Number Dropdown**: Enabled once a machine is chosen; lists specific available serial numbers for that machine.
  4. **Selling Price**: Defaults to ₹0 (sale marked as **Paid**). If a positive amount is entered, the sale is recorded as **Unpaid** with that remaining balance.
- **For Auto / Dummy Mode**:
  - Optional dropdown to pick from existing system machines to auto-fill Name, Model, Category, and Division.
  - Or manually enter Machine Name, Model Number, Part Code, Category (`<Select>`), Division (`<Select>`), and Serial Number.

#### Step 4: Call Details & Submission
- Summary badges verifying the selections.
- Issue Description (required), Priority (`Low`, `Medium`, `High`, `Critical`), Call Type (`Service-Call`, `Installation`, etc.), and Internal Notes.
- On submission, displays a modal dialog with generated Call ID, Purchase Invoice number, and Sale Invoice number, with direct navigation to the new Call Details page.

---

## 🌐 API Reference

### 1. Raise Quick Service Call
- **Endpoint**: `POST /api/admin/quick-raise-call`
- **Auth**: Bearer token / Admin session cookie

#### Payload: Mode "dummy"
```json
{
  "mode": "dummy",
  "customer": {
    "name": "Ravi Kumar",
    "phone": "9876543210",
    "email": "ravi@example.com",
    "address": "MG Road, Pune, Maharashtra",
    "userLocation": {
      "address": "MG Road, Pune, Maharashtra",
      "latitude": 18.5204,
      "longitude": 73.8567
    }
  },
  "machine": {
    "name": "Canon imageRUNNER 2520",
    "modelNumber": "iR 2520",
    "partCode": "CAN-2520",
    "categoryId": "69e9f5e7477ea9445d24bed7",
    "divisionId": "6a1a764e8df173072f6f457b",
    "serialNumber": "SN-CAN-998811"
  },
  "call": {
    "issueDescription": "Paper feeder jamming frequently",
    "priority": "High",
    "callType": "Service-Call",
    "note": "Customer needs urgent assistance before 5 PM"
  }
}
```

#### Payload: Mode "existing"
```json
{
  "mode": "existing",
  "customer": {
    "name": "Ravi Kumar",
    "phone": "9876543210",
    "email": "ravi@example.com",
    "address": "Kothrud, Pune",
    "userLocation": {
      "address": "Kothrud, Pune",
      "latitude": 18.5074,
      "longitude": 73.8077
    }
  },
  "existing": {
    "vendorId": "660c1f2e8f1b2c001f3e4a11",
    "machineId": "660c1f2e8f1b2c001f3e4b22",
    "serialNumber": "SN-STOCK-10293",
    "sellingPrice": 45000
  },
  "call": {
    "issueDescription": "Toner cartridge replacement error code E020",
    "priority": "Medium",
    "callType": "Service-Call"
  }
}
```

---

### 2. Get Vendors with Available Stock
- **Endpoint**: `GET /api/admin/quick-raise-call/vendors`
- **Response**:
```json
{
  "success": true,
  "data": {
    "dummyVendorExists": true,
    "totalVendors": 5,
    "realVendorCount": 4,
    "vendors": [
      {
        "_id": "660c1f2e8f1b2c001f3e4a11",
        "name": "Apex Office Solutions",
        "companyName": "Apex Technologies Ltd",
        "phone": "9811223344",
        "isDummy": false,
        "vendorType": "Real Vendor",
        "availableStockCount": 8,
        "machines": [
          {
            "machineId": "660c1f2e8f1b2c001f3e4b22",
            "machineName": "Canon iR 2625",
            "modelNumber": "2625",
            "category": "Photocopier",
            "division": "Digital Printing",
            "availableSerials": ["SN-101", "SN-102"]
          }
        ]
      }
    ]
  }
}
```

---

### 3. Check Serial Number Status
- **Endpoint**: `GET /api/admin/quick-raise-call/status?serialNumber=<SERIAL_NO>`
- **Response**:
  - Checks whether a serial number already exists in active purchases, has been sold, or has existing service calls.
  - Returns recommended mode (`"existing"` or `"dummy"`).

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js 18+ installed
- MongoDB connection string configured in `backend/.env`
- Google Maps API key configured in `frontend/.env`

### 1. Start the Backend
```bash
cd e:\work\canon\backend
npm install
npm start
```
- The backend will start on **`http://localhost:1111`**.
- Health check: `http://localhost:1111/` $\rightarrow$ `Server is running`.

### 2. Start the Frontend
```bash
cd e:\work\canon\frontend
npm install
npm run dev
```
- The frontend will start on **`http://localhost:8080`** (or default Vite port).

### 3. Access Quick Raise Call
Open your browser and navigate directly to:
**`http://localhost:8080/calls/quick-raise`**
