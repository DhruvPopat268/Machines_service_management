jest.mock("../admin.customer.model");
jest.mock("../../zoneManagement/admin.zone.model");
jest.mock("xlsx");

const mongoose = require("mongoose");
const Customer = require("../admin.customer.model");
const Zone = require("../../zoneManagement/admin.zone.model");
const xlsx = require("xlsx");

const {
  getAll,
  create,
  update,
  remove,
  downloadSample,
  importCustomers,
  exportCustomers,
} = require("../admin.customer.controller");

// Helpers to build mock req/res
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const validObjectId = new mongoose.Types.ObjectId().toString();
const validObjectId2 = new mongoose.Types.ObjectId().toString();

// ─────────────────────────────────────────────────────────────────────
// getAll
// ─────────────────────────────────────────────────────────────────────
describe("getAll", () => {
  const makeChain = (results = [], total = 0) => {
    const chain = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(results),
    };
    return chain;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns paginated customers with success true", async () => {
    const customers = [{ _id: validObjectId, name: "Acme" }];
    Customer.find.mockReturnValue(makeChain(customers, 1));
    Customer.countDocuments.mockResolvedValue(1);

    const req = { query: {} };
    const res = mockRes();

    await getAll(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: customers,
        pagination: expect.objectContaining({ total: 1, page: 1, limit: 10 }),
      })
    );
  });

  it("filters by status when valid status is provided", async () => {
    Customer.find.mockReturnValue(makeChain([], 0));
    Customer.countDocuments.mockResolvedValue(0);

    const req = { query: { status: "Active" } };
    const res = mockRes();
    await getAll(req, res);

    expect(Customer.find).toHaveBeenCalledWith(expect.objectContaining({ status: "Active" }));
  });

  it("ignores invalid status filter", async () => {
    Customer.find.mockReturnValue(makeChain([], 0));
    Customer.countDocuments.mockResolvedValue(0);

    const req = { query: { status: "Unknown" } };
    const res = mockRes();
    await getAll(req, res);

    const callArg = Customer.find.mock.calls[0][0];
    expect(callArg.status).toBeUndefined();
  });

  it("builds search $or query when search string provided", async () => {
    Customer.find.mockReturnValue(makeChain([], 0));
    Customer.countDocuments.mockResolvedValue(0);

    const req = { query: { search: "acme" } };
    const res = mockRes();
    await getAll(req, res);

    const callArg = Customer.find.mock.calls[0][0];
    expect(callArg.$or).toHaveLength(3);
  });

  it("does not add $or when search is only whitespace", async () => {
    Customer.find.mockReturnValue(makeChain([], 0));
    Customer.countDocuments.mockResolvedValue(0);

    const req = { query: { search: "   " } };
    const res = mockRes();
    await getAll(req, res);

    const callArg = Customer.find.mock.calls[0][0];
    expect(callArg.$or).toBeUndefined();
  });

  it("applies date range filter when fromDate and toDate are provided", async () => {
    Customer.find.mockReturnValue(makeChain([], 0));
    Customer.countDocuments.mockResolvedValue(0);

    const req = { query: { fromDate: "01/01/24", toDate: "31/01/24" } };
    const res = mockRes();
    await getAll(req, res);

    const callArg = Customer.find.mock.calls[0][0];
    expect(callArg.createdAt).toBeDefined();
    expect(callArg.createdAt.$gte).toBeInstanceOf(Date);
    expect(callArg.createdAt.$lte).toBeInstanceOf(Date);
  });

  it("clamps limit to max 100", async () => {
    Customer.find.mockReturnValue(makeChain([], 0));
    Customer.countDocuments.mockResolvedValue(0);

    const req = { query: { limit: "500" } };
    const res = mockRes();
    await getAll(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: expect.objectContaining({ limit: 100 }) })
    );
  });

  it("returns 500 on unexpected error", async () => {
    Customer.find.mockImplementation(() => { throw new Error("DB failure"); });

    const req = { query: {} };
    const res = mockRes();
    await getAll(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

// ─────────────────────────────────────────────────────────────────────
// create
// ─────────────────────────────────────────────────────────────────────
describe("create", () => {
  beforeEach(() => jest.clearAllMocks());

  const validBody = { name: "Acme Corp", phone: "+91 9800000000", email: "acme@example.com", status: "Active" };

  it("creates a customer and returns 201", async () => {
    const createdCustomer = { ...validBody, _id: validObjectId, populate: jest.fn().mockResolvedValue({ ...validBody, _id: validObjectId }) };
    Customer.findOne.mockResolvedValue(null);
    Customer.create.mockResolvedValue(createdCustomer);

    const req = { body: validBody };
    const res = mockRes();
    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns 400 when name is missing", async () => {
    const req = { body: { ...validBody, name: "" } };
    const res = mockRes();
    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: "Name is required" }));
  });

  it("returns 400 when email is invalid", async () => {
    const req = { body: { ...validBody, email: "not-an-email" } };
    const res = mockRes();
    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: "Invalid email format" }));
  });

  it("returns 409 when GST number already exists", async () => {
    Customer.findOne.mockResolvedValue({ _id: validObjectId2 }); // GST conflict
    const req = { body: { ...validBody, gstNumber: "27AABCA1234A1Z5" } };
    const res = mockRes();
    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "GST number already exists" })
    );
  });

  it("returns 400 when zone ID is invalid ObjectId", async () => {
    Customer.findOne.mockResolvedValue(null);
    const req = { body: { ...validBody, zone: "invalid-id" } };
    const res = mockRes();
    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Invalid zone ID" })
    );
  });

  it("returns 404 when zone is valid ObjectId but not found", async () => {
    Customer.findOne.mockResolvedValue(null);
    Zone.findById.mockResolvedValue(null);
    const req = { body: { ...validBody, zone: validObjectId } };
    const res = mockRes();
    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Zone not found" })
    );
  });

  it("creates customer with valid zone", async () => {
    Customer.findOne.mockResolvedValue(null);
    Zone.findById.mockResolvedValue({ _id: validObjectId, name: "North" });
    const createdCustomer = { ...validBody, _id: validObjectId2, zone: validObjectId, populate: jest.fn().mockResolvedValue({}) };
    Customer.create.mockResolvedValue(createdCustomer);
    const req = { body: { ...validBody, zone: validObjectId } };
    const res = mockRes();
    await create(req, res);

    expect(Customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ zone: validObjectId })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("returns 409 on duplicate key error from DB", async () => {
    Customer.findOne.mockResolvedValue(null);
    const dupErr = new Error("dup key");
    dupErr.code = 11000;
    Customer.create.mockRejectedValue(dupErr);
    const req = { body: validBody };
    const res = mockRes();
    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("returns 500 on unexpected DB error", async () => {
    Customer.findOne.mockResolvedValue(null);
    Customer.create.mockRejectedValue(new Error("DB error"));
    const req = { body: validBody };
    const res = mockRes();
    await create(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("uppercases gstNumber before storing", async () => {
    Customer.findOne.mockResolvedValue(null);
    const createdCustomer = { ...validBody, populate: jest.fn().mockResolvedValue({}) };
    Customer.create.mockResolvedValue(createdCustomer);
    const req = { body: { ...validBody, gstNumber: "27aabca1234a1z5" } };
    const res = mockRes();
    await create(req, res);

    expect(Customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ gstNumber: "27AABCA1234A1Z5" })
    );
  });

  it("lowercases email before storing", async () => {
    Customer.findOne.mockResolvedValue(null);
    const createdCustomer = { ...validBody, populate: jest.fn().mockResolvedValue({}) };
    Customer.create.mockResolvedValue(createdCustomer);
    const req = { body: { ...validBody, email: "ACME@EXAMPLE.COM" } };
    const res = mockRes();
    await create(req, res);

    expect(Customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "acme@example.com" })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────
describe("update", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when id is invalid ObjectId", async () => {
    const req = { params: { id: "not-valid" }, body: { name: "Test" } };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid customer ID" })
    );
  });

  it("returns 400 when nothing to update", async () => {
    const req = { params: { id: validObjectId }, body: {} };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Nothing to update" })
    );
  });

  it("returns 400 for invalid email in update", async () => {
    const req = { params: { id: validObjectId }, body: { email: "bad-email" } };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid email format" })
    );
  });

  it("returns 409 when new GST conflicts with another customer", async () => {
    Customer.findOne.mockResolvedValue({ _id: validObjectId2 }); // conflict
    const req = { params: { id: validObjectId }, body: { gstNumber: "27AABCA1234A1Z5" } };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "GST number already exists" })
    );
  });

  it("returns 404 when customer not found after update", async () => {
    Customer.findOne.mockResolvedValue(null);
    const populateChain = { populate: jest.fn().mockResolvedValue(null) };
    Customer.findByIdAndUpdate.mockReturnValue(populateChain);
    const req = { params: { id: validObjectId }, body: { name: "New Name" } };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Customer not found" })
    );
  });

  it("successfully updates customer and returns 200", async () => {
    const updatedCustomer = { _id: validObjectId, name: "New Name", email: "a@b.com" };
    Customer.findOne.mockResolvedValue(null);
    const populateChain = { populate: jest.fn().mockResolvedValue(updatedCustomer) };
    Customer.findByIdAndUpdate.mockReturnValue(populateChain);
    const req = { params: { id: validObjectId }, body: { name: "New Name" } };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: updatedCustomer })
    );
  });

  it("clears zone when zone is set to empty string", async () => {
    const updatedCustomer = { _id: validObjectId, zone: null };
    Customer.findOne.mockResolvedValue(null);
    const populateChain = { populate: jest.fn().mockResolvedValue(updatedCustomer) };
    Customer.findByIdAndUpdate.mockReturnValue(populateChain);
    const req = { params: { id: validObjectId }, body: { zone: "" } };
    const res = mockRes();
    await update(req, res);

    expect(Customer.findByIdAndUpdate).toHaveBeenCalledWith(
      validObjectId,
      expect.objectContaining({ zone: null }),
      expect.any(Object)
    );
  });

  it("returns 400 when zone ID in update is invalid ObjectId", async () => {
    const req = { params: { id: validObjectId }, body: { zone: "bad-zone-id" } };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid zone ID" })
    );
  });

  it("returns 404 when zone not found during update", async () => {
    Zone.findById.mockResolvedValue(null);
    const req = { params: { id: validObjectId }, body: { zone: validObjectId2 } };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Zone not found" })
    );
  });

  it("returns 409 on duplicate key error from DB", async () => {
    Customer.findOne.mockResolvedValue(null);
    const dupErr = new Error("dup");
    dupErr.code = 11000;
    const populateChain = { populate: jest.fn().mockRejectedValue(dupErr) };
    Customer.findByIdAndUpdate.mockReturnValue(populateChain);
    const req = { params: { id: validObjectId }, body: { name: "Test" } };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("returns 500 on unexpected error", async () => {
    Customer.findOne.mockResolvedValue(null);
    const populateChain = { populate: jest.fn().mockRejectedValue(new Error("DB error")) };
    Customer.findByIdAndUpdate.mockReturnValue(populateChain);
    const req = { params: { id: validObjectId }, body: { name: "Test" } };
    const res = mockRes();
    await update(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─────────────────────────────────────────────────────────────────────
// remove
// ─────────────────────────────────────────────────────────────────────
describe("remove", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 for invalid customer ID", async () => {
    const req = { params: { id: "not-valid" } };
    const res = mockRes();
    await remove(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid customer ID" })
    );
  });

  it("returns 404 when customer not found", async () => {
    Customer.findByIdAndDelete.mockResolvedValue(null);
    const req = { params: { id: validObjectId } };
    const res = mockRes();
    await remove(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Customer not found" })
    );
  });

  it("returns 200 and success message when deleted", async () => {
    Customer.findByIdAndDelete.mockResolvedValue({ _id: validObjectId });
    const req = { params: { id: validObjectId } };
    const res = mockRes();
    await remove(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: "Customer deleted successfully" })
    );
  });

  it("returns 500 on unexpected error", async () => {
    Customer.findByIdAndDelete.mockRejectedValue(new Error("DB error"));
    const req = { params: { id: validObjectId } };
    const res = mockRes();
    await remove(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─────────────────────────────────────────────────────────────────────
// downloadSample
// ─────────────────────────────────────────────────────────────────────
describe("downloadSample", () => {
  it("sets correct headers and sends buffer", () => {
    const fakeWs = {};
    const fakeWb = {};
    const fakeBuf = Buffer.from("xlsx-data");

    xlsx.utils = {
      aoa_to_sheet: jest.fn().mockReturnValue(fakeWs),
      book_new: jest.fn().mockReturnValue(fakeWb),
      book_append_sheet: jest.fn(),
    };
    xlsx.write = jest.fn().mockReturnValue(fakeBuf);

    const req = {};
    const res = mockRes();
    downloadSample(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      "attachment; filename=customers_sample.xlsx"
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.send).toHaveBeenCalledWith(fakeBuf);
  });
});

// ─────────────────────────────────────────────────────────────────────
// importCustomers
// ─────────────────────────────────────────────────────────────────────
describe("importCustomers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default xlsx mock setup
    xlsx.read = jest.fn();
    xlsx.utils = {
      sheet_to_json: jest.fn(),
      aoa_to_sheet: jest.fn(),
      book_new: jest.fn(),
      book_append_sheet: jest.fn(),
      json_to_sheet: jest.fn(),
    };
  });

  it("returns 400 when no file uploaded", async () => {
    const req = {};
    const res = mockRes();
    await importCustomers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "No file uploaded" })
    );
  });

  it("returns 400 when file is not .xlsx", async () => {
    const req = { file: { originalname: "data.csv", buffer: Buffer.from("") } };
    const res = mockRes();
    await importCustomers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Only .xlsx files are allowed" })
    );
  });

  it("returns 400 when file is empty (no rows)", async () => {
    xlsx.read.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
    xlsx.utils.sheet_to_json.mockReturnValue([]);

    const req = { file: { originalname: "data.xlsx", buffer: Buffer.from("") } };
    const res = mockRes();
    await importCustomers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "File is empty" })
    );
  });

  it("returns 400 when required columns are missing", async () => {
    xlsx.read.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
    xlsx.utils.sheet_to_json.mockReturnValue([{ name: "Test" }]); // missing phone, email, status

    const req = { file: { originalname: "data.xlsx", buffer: Buffer.from("") } };
    const res = mockRes();
    await importCustomers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toContain("Missing columns");
  });

  it("returns 400 when a row has validation errors", async () => {
    xlsx.read.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
    xlsx.utils.sheet_to_json.mockReturnValue([
      { name: "", phone: "+91 9800000000", email: "a@b.com", status: "Active" }, // invalid: name empty
    ]);

    const req = { file: { originalname: "data.xlsx", buffer: Buffer.from("") } };
    const res = mockRes();
    await importCustomers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("imports valid rows and returns success message", async () => {
    xlsx.read.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
    xlsx.utils.sheet_to_json.mockReturnValue([
      { name: "Acme Corp", phone: "+91 9800000000", email: "acme@example.com", status: "Active" },
    ]);
    Customer.findOne.mockResolvedValue(null); // no GST conflict
    Customer.create.mockResolvedValue({});

    const req = { file: { originalname: "data.xlsx", buffer: Buffer.from("") } };
    const res = mockRes();
    await importCustomers(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining("imported successfully"),
      })
    );
  });

  it("skips rows with duplicate GST number and reports count", async () => {
    xlsx.read.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
    xlsx.utils.sheet_to_json.mockReturnValue([
      { name: "Corp A", phone: "111", email: "a@b.com", status: "Active", gstnumber: "27AABCA1234A1Z5" },
      { name: "Corp B", phone: "222", email: "b@c.com", status: "Active", gstnumber: "27AABCA1234A1Z6" },
    ]);
    // First row: GST already exists → skip
    // Second row: no conflict → import
    Customer.findOne
      .mockResolvedValueOnce({ _id: validObjectId }) // Corp A GST exists
      .mockResolvedValueOnce(null); // Corp B no conflict
    Customer.create.mockResolvedValue({});

    const req = { file: { originalname: "data.xlsx", buffer: Buffer.from("") } };
    const res = mockRes();
    await importCustomers(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toContain("skipped");
  });

  it("resolves zone by name during import", async () => {
    xlsx.read.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
    xlsx.utils.sheet_to_json.mockReturnValue([
      { name: "Corp A", phone: "111", email: "a@b.com", status: "Active", zonename: "North Zone" },
    ]);
    Customer.findOne.mockResolvedValue(null);
    Zone.findOne.mockResolvedValue({ _id: validObjectId });
    Customer.create.mockResolvedValue({});

    const req = { file: { originalname: "data.xlsx", buffer: Buffer.from("") } };
    const res = mockRes();
    await importCustomers(req, res);

    expect(Zone.findOne).toHaveBeenCalled();
    expect(Customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ zone: validObjectId })
    );
  });

  it("returns 500 on unexpected error during processing", async () => {
    xlsx.read.mockImplementation(() => { throw new Error("corrupt file"); });

    const req = { file: { originalname: "data.xlsx", buffer: Buffer.from("") } };
    const res = mockRes();
    await importCustomers(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─────────────────────────────────────────────────────────────────────
// exportCustomers
// ─────────────────────────────────────────────────────────────────────
describe("exportCustomers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    xlsx.utils = {
      json_to_sheet: jest.fn().mockReturnValue({}),
      book_new: jest.fn().mockReturnValue({}),
      book_append_sheet: jest.fn(),
      aoa_to_sheet: jest.fn(),
      sheet_to_json: jest.fn(),
    };
    xlsx.write = jest.fn().mockReturnValue(Buffer.from("xlsx"));
  });

  it("exports all customers and returns xlsx buffer", async () => {
    const customers = [
      {
        _id: validObjectId,
        name: "Acme",
        phone: "123",
        email: "a@b.com",
        address: "Mumbai",
        zone: { name: "North" },
        gstNumber: "27AABCA",
        status: "Active",
        createdAt: new Date("2024-01-15T10:00:00Z"),
        updatedAt: new Date("2024-01-15T12:00:00Z"),
      },
    ];
    const populateChain = { lean: jest.fn().mockResolvedValue(customers) };
    Customer.find.mockReturnValue({ populate: jest.fn().mockReturnValue(populateChain) });

    const req = {};
    const res = mockRes();
    await exportCustomers(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      "attachment; filename=customers.xlsx"
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.send).toHaveBeenCalled();
  });

  it("handles customers with no zone (zone is null)", async () => {
    const customers = [
      {
        _id: validObjectId,
        name: "Corp",
        phone: "111",
        email: "c@d.com",
        address: "",
        zone: null,
        gstNumber: "",
        status: "Inactive",
        createdAt: new Date("2024-03-01T08:00:00Z"),
        updatedAt: new Date("2024-03-01T09:00:00Z"),
      },
    ];
    const populateChain = { lean: jest.fn().mockResolvedValue(customers) };
    Customer.find.mockReturnValue({ populate: jest.fn().mockReturnValue(populateChain) });

    const req = {};
    const res = mockRes();
    await exportCustomers(req, res);

    // zone name should be empty string when zone is null
    const rowsArg = xlsx.utils.json_to_sheet.mock.calls[0][0];
    expect(rowsArg[0].zone).toBe("");
  });

  it("returns 500 on unexpected error", async () => {
    Customer.find.mockImplementation(() => { throw new Error("DB error"); });

    const req = {};
    const res = mockRes();
    await exportCustomers(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});