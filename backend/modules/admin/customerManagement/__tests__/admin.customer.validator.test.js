const {
  validateCreateCustomer,
  validateUpdateCustomer,
  validateImportCustomerRow,
} = require("../admin.customer.validator");

describe("validateCreateCustomer", () => {
  const valid = { name: "Acme Corp", phone: "+91 9800000000", email: "acme@example.com", status: "Active" };

  it("returns null for valid input", () => {
    expect(validateCreateCustomer(valid)).toBeNull();
  });

  it("returns null when status is omitted", () => {
    const { status, ...rest } = valid;
    expect(validateCreateCustomer(rest)).toBeNull();
  });

  it("returns error when name is missing", () => {
    expect(validateCreateCustomer({ ...valid, name: "" })).toBe("Name is required");
  });

  it("returns error when name is only whitespace", () => {
    expect(validateCreateCustomer({ ...valid, name: "   " })).toBe("Name is required");
  });

  it("returns error when name is not a string", () => {
    expect(validateCreateCustomer({ ...valid, name: 123 })).toBe("Name is required");
  });

  it("returns error when name is null", () => {
    expect(validateCreateCustomer({ ...valid, name: null })).toBe("Name is required");
  });

  it("returns error when phone is missing", () => {
    expect(validateCreateCustomer({ ...valid, phone: "" })).toBe("Phone is required");
  });

  it("returns error when phone is only whitespace", () => {
    expect(validateCreateCustomer({ ...valid, phone: "   " })).toBe("Phone is required");
  });

  it("returns error when phone is not a string", () => {
    expect(validateCreateCustomer({ ...valid, phone: 9800000000 })).toBe("Phone is required");
  });

  it("returns error when email is missing", () => {
    expect(validateCreateCustomer({ ...valid, email: "" })).toBe("Email is required");
  });

  it("returns error when email is only whitespace", () => {
    expect(validateCreateCustomer({ ...valid, email: "   " })).toBe("Email is required");
  });

  it("returns error for invalid email format - missing @", () => {
    expect(validateCreateCustomer({ ...valid, email: "notanemail" })).toBe("Invalid email format");
  });

  it("returns error for invalid email format - missing domain", () => {
    expect(validateCreateCustomer({ ...valid, email: "user@" })).toBe("Invalid email format");
  });

  it("returns error for invalid email format - missing TLD", () => {
    expect(validateCreateCustomer({ ...valid, email: "user@domain" })).toBe("Invalid email format");
  });

  it("accepts email with leading/trailing whitespace (trims before regex)", () => {
    expect(validateCreateCustomer({ ...valid, email: "  acme@example.com  " })).toBeNull();
  });

  it("returns error when status is invalid value", () => {
    expect(validateCreateCustomer({ ...valid, status: "Pending" })).toBe("Status must be Active or Inactive");
  });

  it("returns error when status is empty string", () => {
    expect(validateCreateCustomer({ ...valid, status: "" })).toBe("Status must be Active or Inactive");
  });

  it("accepts Inactive as valid status", () => {
    expect(validateCreateCustomer({ ...valid, status: "Inactive" })).toBeNull();
  });

  it("validates name before phone (name error returned first)", () => {
    expect(validateCreateCustomer({ name: "", phone: "", email: "", status: "Active" })).toBe("Name is required");
  });
});

describe("validateUpdateCustomer", () => {
  it("returns null when all fields are undefined (no fields to validate)", () => {
    expect(validateUpdateCustomer({})).toBeNull();
  });

  it("returns null for valid partial update with name only", () => {
    expect(validateUpdateCustomer({ name: "New Name" })).toBeNull();
  });

  it("returns null for valid full update", () => {
    expect(validateUpdateCustomer({ name: "Acme", phone: "123", email: "a@b.com", status: "Inactive" })).toBeNull();
  });

  it("returns error when name is provided but empty string", () => {
    expect(validateUpdateCustomer({ name: "" })).toBe("Name must be a non-empty string");
  });

  it("returns error when name is provided but only whitespace", () => {
    expect(validateUpdateCustomer({ name: "   " })).toBe("Name must be a non-empty string");
  });

  it("returns error when name is provided but not a string", () => {
    expect(validateUpdateCustomer({ name: 42 })).toBe("Name must be a non-empty string");
  });

  it("returns error when phone is provided but empty string", () => {
    expect(validateUpdateCustomer({ phone: "" })).toBe("Phone must be a non-empty string");
  });

  it("returns error when phone is provided but only whitespace", () => {
    expect(validateUpdateCustomer({ phone: "  " })).toBe("Phone must be a non-empty string");
  });

  it("returns error when email is provided but empty string", () => {
    expect(validateUpdateCustomer({ email: "" })).toBe("Email must be a non-empty string");
  });

  it("returns error when email is provided but only whitespace", () => {
    expect(validateUpdateCustomer({ email: "   " })).toBe("Email must be a non-empty string");
  });

  it("returns error when email is provided but invalid format", () => {
    expect(validateUpdateCustomer({ email: "invalid-email" })).toBe("Invalid email format");
  });

  it("returns null for valid email update", () => {
    expect(validateUpdateCustomer({ email: "new@email.com" })).toBeNull();
  });

  it("returns error when status is provided but invalid", () => {
    expect(validateUpdateCustomer({ status: "Unknown" })).toBe("Status must be Active or Inactive");
  });

  it("returns null when status is Active", () => {
    expect(validateUpdateCustomer({ status: "Active" })).toBeNull();
  });

  it("returns null when status is Inactive", () => {
    expect(validateUpdateCustomer({ status: "Inactive" })).toBeNull();
  });

  it("skips email validation when email is undefined", () => {
    expect(validateUpdateCustomer({ name: "Test", phone: "123" })).toBeNull();
  });
});

describe("validateImportCustomerRow", () => {
  const validRow = {
    name: "Acme Corp",
    phone: "+91 9800000000",
    email: "acme@example.com",
    status: "Active",
    totalpurchases: 5,
  };

  it("returns null for a valid row", () => {
    expect(validateImportCustomerRow(validRow, 2)).toBeNull();
  });

  it("returns null when totalpurchases is zero", () => {
    expect(validateImportCustomerRow({ ...validRow, totalpurchases: 0 }, 2)).toBeNull();
  });

  it("returns null when totalpurchases is omitted", () => {
    const { totalpurchases, ...row } = validRow;
    expect(validateImportCustomerRow(row, 2)).toBeNull();
  });

  it("returns row-specific error when name is missing", () => {
    expect(validateImportCustomerRow({ ...validRow, name: "" }, 3)).toBe("Row 3: name is required");
  });

  it("returns row-specific error when name is only whitespace", () => {
    expect(validateImportCustomerRow({ ...validRow, name: "   " }, 5)).toBe("Row 5: name is required");
  });

  it("returns row-specific error when phone is missing", () => {
    expect(validateImportCustomerRow({ ...validRow, phone: "" }, 4)).toBe("Row 4: phone is required");
  });

  it("returns row-specific error when email is missing", () => {
    expect(validateImportCustomerRow({ ...validRow, email: "" }, 6)).toBe("Row 6: email is required");
  });

  it("returns row-specific error for invalid email format", () => {
    expect(validateImportCustomerRow({ ...validRow, email: "bademail" }, 7)).toBe("Row 7: invalid email format");
  });

  it("returns row-specific error when status is invalid", () => {
    expect(validateImportCustomerRow({ ...validRow, status: "Maybe" }, 8)).toBe(
      "Row 8: status must be Active or Inactive"
    );
  });

  it("returns row-specific error when status is empty", () => {
    expect(validateImportCustomerRow({ ...validRow, status: "" }, 9)).toBe(
      "Row 9: status must be Active or Inactive"
    );
  });

  it("returns row-specific error when totalpurchases is negative", () => {
    expect(validateImportCustomerRow({ ...validRow, totalpurchases: -1 }, 10)).toBe(
      "Row 10: totalPurchases must be a non-negative number"
    );
  });

  it("returns row-specific error when totalpurchases is not a number", () => {
    expect(validateImportCustomerRow({ ...validRow, totalpurchases: "abc" }, 11)).toBe(
      "Row 11: totalPurchases must be a non-negative number"
    );
  });

  it("accepts Inactive as a valid status", () => {
    expect(validateImportCustomerRow({ ...validRow, status: "Inactive" }, 2)).toBeNull();
  });

  it("validates in order: name -> phone -> email -> email format -> status -> totalpurchases", () => {
    // All fields missing: should fail on name first
    expect(validateImportCustomerRow({ name: "", phone: "", email: "", status: "", totalpurchases: -1 }, 2)).toBe(
      "Row 2: name is required"
    );
  });

  it("handles numeric name value gracefully by converting to string", () => {
    // Number 0 converts to "0", which is truthy after trim
    expect(validateImportCustomerRow({ ...validRow, name: 123 }, 2)).toBeNull();
  });
});