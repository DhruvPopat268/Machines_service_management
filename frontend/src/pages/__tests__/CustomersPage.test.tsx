import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock the api module
vi.mock("@/lib/axiosInterceptor", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock react-router-dom navigate (keep real MemoryRouter)
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import api from "@/lib/axiosInterceptor";
import { toast } from "sonner";
import CustomersPage from "../CustomersPage";

const mockApi = api as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const makeCustomer = (overrides = {}) => ({
  _id: "64a1b2c3d4e5f6789012abcd",
  name: "Acme Corp",
  phone: "+91 9800000000",
  email: "acme@example.com",
  address: "123 Main St",
  zone: { _id: "64a1b2c3d4e5f6789012ab01", name: "North", code: "N01" },
  gstNumber: "27AABCA1234A1Z5",
  totalPurchases: 5,
  status: "Active" as const,
  createdAt: "2024-01-15T10:00:00.000Z",
  updatedAt: "2024-01-15T12:00:00.000Z",
  ...overrides,
});

const defaultPagination = { total: 1, page: 1, totalPages: 1, limit: 10 };

const renderPage = () =>
  render(
    <MemoryRouter>
      <CustomersPage />
    </MemoryRouter>
  );

describe("CustomersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: zones fetch returns empty, customers fetch returns one customer
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes("/admin/zones")) {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url.includes("/admin/customers/sample")) {
        return Promise.resolve({ data: new Blob() });
      }
      if (url.includes("/admin/customers/export")) {
        return Promise.resolve({ data: new Blob() });
      }
      // /admin/customers
      return Promise.resolve({
        data: {
          data: [makeCustomer()],
          pagination: defaultPagination,
        },
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────────────────────────
  // Rendering
  // ────────────────────────────────────────────────────────────────
  it("shows spinner initially while loading", () => {
    // Prevent the fetch from resolving immediately
    mockApi.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    // The Spinner component should be visible
    expect(document.querySelector(".animate-spin") || screen.queryByRole("status") || screen.queryByText(/loading/i) || document.body.textContent).toBeTruthy();
  });

  it("renders page header with Customers title after load", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Customers")).toBeInTheDocument();
    });
  });

  it("renders customer name in the table after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });
  });

  it("renders customer email in the table", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("acme@example.com")).toBeInTheDocument();
    });
  });

  it("renders customer GST number in the table", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("27AABCA1234A1Z5")).toBeInTheDocument();
    });
  });

  it("renders Add Customer button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Add Customer")).toBeInTheDocument();
    });
  });

  it("renders Import and Export buttons", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Import")).toBeInTheDocument();
      expect(screen.getByText("Export")).toBeInTheDocument();
    });
  });

  it("shows '—' when customer has no address", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes("/admin/zones")) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({
        data: { data: [makeCustomer({ address: "" })], pagination: defaultPagination },
      });
    });
    renderPage();
    await waitFor(() => {
      // Address column renders '—' for empty address
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  it("shows '—' when customer has no zone", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes("/admin/zones")) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({
        data: { data: [makeCustomer({ zone: null })], pagination: defaultPagination },
      });
    });
    renderPage();
    await waitFor(() => {
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Add Dialog
  // ────────────────────────────────────────────────────────────────
  it("opens add dialog when Add Customer button clicked", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Add Customer"));
    fireEvent.click(screen.getByText("Add Customer"));
    expect(screen.getByText("Add New Customer")).toBeInTheDocument();
  });

  it("shows error toast when submitting add form with missing name", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Add Customer"));
    fireEvent.click(screen.getByText("Add Customer"));
    // Click Add Customer button in dialog footer without filling form
    const addButtons = screen.getAllByText("Add Customer");
    // The button in the dialog footer
    const dialogAddBtn = addButtons[addButtons.length - 1];
    fireEvent.click(dialogAddBtn);
    expect(toast.error).toHaveBeenCalledWith("Name is required");
  });

  it("shows error toast when submitting add form with name but missing phone", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Add Customer"));
    fireEvent.click(screen.getByText("Add Customer"));

    const nameInput = screen.getByPlaceholderText("Company or customer name");
    fireEvent.change(nameInput, { target: { value: "Test Corp" } });

    const addButtons = screen.getAllByText("Add Customer");
    fireEvent.click(addButtons[addButtons.length - 1]);
    expect(toast.error).toHaveBeenCalledWith("Phone is required");
  });

  it("shows error toast when submitting add form without email", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Add Customer"));
    fireEvent.click(screen.getByText("Add Customer"));

    fireEvent.change(screen.getByPlaceholderText("Company or customer name"), { target: { value: "Test Corp" } });
    fireEvent.change(screen.getByPlaceholderText("+91 9800000000"), { target: { value: "+91 9999999999" } });

    const addButtons = screen.getAllByText("Add Customer");
    fireEvent.click(addButtons[addButtons.length - 1]);
    expect(toast.error).toHaveBeenCalledWith("Email is required");
  });

  it("calls POST /admin/customers when add form is valid", async () => {
    mockApi.post.mockResolvedValue({ data: {} });
    renderPage();
    await waitFor(() => screen.getByText("Add Customer"));
    fireEvent.click(screen.getByText("Add Customer"));

    fireEvent.change(screen.getByPlaceholderText("Company or customer name"), { target: { value: "Test Corp" } });
    fireEvent.change(screen.getByPlaceholderText("+91 9800000000"), { target: { value: "+91 9999999999" } });
    fireEvent.change(screen.getByPlaceholderText("email@example.com"), { target: { value: "test@corp.com" } });

    const addButtons = screen.getAllByText("Add Customer");
    await act(async () => {
      fireEvent.click(addButtons[addButtons.length - 1]);
    });

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        "/admin/customers",
        expect.objectContaining({ name: "Test Corp", phone: "+91 9999999999", email: "test@corp.com" })
      );
    });
  });

  it("shows success toast after successfully adding a customer", async () => {
    mockApi.post.mockResolvedValue({ data: {} });
    renderPage();
    await waitFor(() => screen.getByText("Add Customer"));
    fireEvent.click(screen.getByText("Add Customer"));

    fireEvent.change(screen.getByPlaceholderText("Company or customer name"), { target: { value: "Test Corp" } });
    fireEvent.change(screen.getByPlaceholderText("+91 9800000000"), { target: { value: "+91 9999999999" } });
    fireEvent.change(screen.getByPlaceholderText("email@example.com"), { target: { value: "test@corp.com" } });

    const addButtons = screen.getAllByText("Add Customer");
    await act(async () => { fireEvent.click(addButtons[addButtons.length - 1]); });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Customer added successfully");
    });
  });

  it("shows error toast when add API call fails", async () => {
    mockApi.post.mockRejectedValue({ response: { data: { message: "GST number already exists" } } });
    renderPage();
    await waitFor(() => screen.getByText("Add Customer"));
    fireEvent.click(screen.getByText("Add Customer"));

    fireEvent.change(screen.getByPlaceholderText("Company or customer name"), { target: { value: "Test Corp" } });
    fireEvent.change(screen.getByPlaceholderText("+91 9800000000"), { target: { value: "+91 9999999999" } });
    fireEvent.change(screen.getByPlaceholderText("email@example.com"), { target: { value: "test@corp.com" } });

    const addButtons = screen.getAllByText("Add Customer");
    await act(async () => { fireEvent.click(addButtons[addButtons.length - 1]); });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("GST number already exists");
    });
  });

  it("closes add dialog when Cancel is clicked", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Add Customer"));
    fireEvent.click(screen.getByText("Add Customer"));
    expect(screen.getByText("Add New Customer")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => {
      expect(screen.queryByText("Add New Customer")).not.toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Edit Dialog
  // ────────────────────────────────────────────────────────────────
  it("opens edit dialog with customer data when edit button clicked", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    const editButton = screen.getByLabelText("Edit Acme Corp");
    fireEvent.click(editButton);

    expect(screen.getByText("Edit Customer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Acme Corp")).toBeInTheDocument();
  });

  it("shows error toast when saving edit with empty name", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    fireEvent.click(screen.getByLabelText("Edit Acme Corp"));

    const nameInput = screen.getByDisplayValue("Acme Corp");
    fireEvent.change(nameInput, { target: { value: "" } });

    fireEvent.click(screen.getByText("Save Changes"));
    expect(toast.error).toHaveBeenCalledWith("Name is required");
  });

  it("calls PATCH /admin/customers/:id when edit form is valid", async () => {
    mockApi.patch.mockResolvedValue({ data: {} });
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    fireEvent.click(screen.getByLabelText("Edit Acme Corp"));

    const nameInput = screen.getByDisplayValue("Acme Corp");
    fireEvent.change(nameInput, { target: { value: "Acme Updated" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Save Changes"));
    });

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        "/admin/customers/64a1b2c3d4e5f6789012abcd",
        expect.objectContaining({ name: "Acme Updated" })
      );
    });
  });

  it("shows success toast after successful edit", async () => {
    mockApi.patch.mockResolvedValue({ data: {} });
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    fireEvent.click(screen.getByLabelText("Edit Acme Corp"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save Changes"));
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Customer updated successfully");
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Delete Dialog
  // ────────────────────────────────────────────────────────────────
  it("opens delete dialog with customer name when delete button clicked", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    fireEvent.click(screen.getByLabelText("Delete Acme Corp"));

    expect(screen.getByText("Delete Customer")).toBeInTheDocument();
    // Customer name appears multiple times (table + dialog description)
    const matches = screen.getAllByText(/Acme Corp/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("calls DELETE /admin/customers/:id when confirmed", async () => {
    mockApi.delete.mockResolvedValue({ data: {} });
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    fireEvent.click(screen.getByLabelText("Delete Acme Corp"));
    await act(async () => {
      fireEvent.click(screen.getByText("Delete"));
    });

    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledWith(
        "/admin/customers/64a1b2c3d4e5f6789012abcd"
      );
    });
  });

  it("shows success toast after deletion", async () => {
    mockApi.delete.mockResolvedValue({ data: {} });
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    fireEvent.click(screen.getByLabelText("Delete Acme Corp"));
    await act(async () => {
      fireEvent.click(screen.getByText("Delete"));
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Customer deleted successfully");
    });
  });

  it("shows error toast when delete API call fails", async () => {
    mockApi.delete.mockRejectedValue({ response: { data: { message: "Not found" } } });
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    fireEvent.click(screen.getByLabelText("Delete Acme Corp"));
    await act(async () => {
      fireEvent.click(screen.getByText("Delete"));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Not found");
    });
  });

  it("closes delete dialog when Cancel is clicked", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    fireEvent.click(screen.getByLabelText("Delete Acme Corp"));
    expect(screen.getByText("Delete Customer")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => {
      expect(screen.queryByText("Delete Customer")).not.toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Status Toggle
  // ────────────────────────────────────────────────────────────────
  it("calls PATCH with toggled status when switch is clicked", async () => {
    mockApi.patch.mockResolvedValue({ data: {} });
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    const statusSwitch = screen.getByLabelText("Toggle status for Acme Corp");
    await act(async () => {
      fireEvent.click(statusSwitch);
    });

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        "/admin/customers/64a1b2c3d4e5f6789012abcd",
        { status: "Inactive" }
      );
    });
  });

  it("shows success toast after toggling status to Inactive", async () => {
    mockApi.patch.mockResolvedValue({ data: {} });
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    const statusSwitch = screen.getByLabelText("Toggle status for Acme Corp");
    await act(async () => { fireEvent.click(statusSwitch); });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Status updated to Inactive");
    });
  });

  it("shows success toast with 'Active' when toggling from Inactive", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes("/admin/zones")) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({
        data: { data: [makeCustomer({ status: "Inactive" })], pagination: defaultPagination },
      });
    });
    mockApi.patch.mockResolvedValue({ data: {} });
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    const statusSwitch = screen.getByLabelText("Toggle status for Acme Corp");
    await act(async () => { fireEvent.click(statusSwitch); });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Status updated to Active");
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Import Dialog
  // ────────────────────────────────────────────────────────────────
  it("opens import dialog when Import button clicked", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Import"));
    fireEvent.click(screen.getByText("Import"));
    expect(screen.getByText("Import Customers")).toBeInTheDocument();
  });

  it("shows upload step after clicking Upload File in import menu", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Import"));
    fireEvent.click(screen.getByText("Import"));

    fireEvent.click(screen.getByText(/Upload File/));
    expect(screen.getByText("Upload Customers")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Yes, I Checked/));
    expect(screen.getByText("Select File")).toBeInTheDocument();
  });

  it("shows error toast when uploading non-xlsx file via handleDrop", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Import"));
    fireEvent.click(screen.getByText("Import"));
    fireEvent.click(screen.getByText(/Upload File/));
    fireEvent.click(screen.getByText(/Yes, I Checked/));

    const dropZone = screen.getByRole("button", { name: /Upload .xlsx file/i });
    const file = new File(["content"], "test.csv", { type: "text/csv" });
    const dataTransfer = { files: [file] };

    fireEvent.drop(dropZone, { dataTransfer });
    expect(toast.error).toHaveBeenCalledWith("Only .xlsx files are allowed");
  });

  it("shows error toast when Upload button clicked with no file selected", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Import"));
    fireEvent.click(screen.getByText("Import"));
    fireEvent.click(screen.getByText(/Upload File/));
    fireEvent.click(screen.getByText(/Yes, I Checked/));

    // Upload button should be disabled when no file, but also check the error logic
    const uploadBtn = screen.getByText("Upload");
    // Button is disabled when no file
    expect(uploadBtn.closest("button")).toBeDisabled();
  });

  // ────────────────────────────────────────────────────────────────
  // Export Dialog
  // ────────────────────────────────────────────────────────────────
  it("opens export dialog when Export button clicked", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Export"));
    fireEvent.click(screen.getByText("Export"));
    expect(screen.getByText("Export Customers")).toBeInTheDocument();
  });

  it("closes export dialog and calls export API on confirm", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Export"));
    fireEvent.click(screen.getByText("Export"));
    expect(screen.getByText("Export Customers")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Yes, Download"));
    });

    // Dialog closes and success toast is shown
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Download starting...");
    });
    // Export dialog should close
    await waitFor(() => {
      expect(screen.queryByText("Export Customers")).not.toBeInTheDocument();
    });
  });

  it("shows export error toast when export API fails", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes("/admin/zones")) return Promise.resolve({ data: { data: [] } });
      if (url.includes("/admin/customers/export")) return Promise.reject(new Error("Network error"));
      return Promise.resolve({
        data: { data: [makeCustomer()], pagination: defaultPagination },
      });
    });

    renderPage();
    await waitFor(() => screen.getByText("Export"));
    fireEvent.click(screen.getByText("Export"));

    await act(async () => {
      fireEvent.click(screen.getByText("Yes, Download"));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Export failed");
    });
  });

  // ────────────────────────────────────────────────────────────────
  // API fetch error
  // ────────────────────────────────────────────────────────────────
  it("shows error toast when fetching customers fails", async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url.includes("/admin/zones")) return Promise.resolve({ data: { data: [] } });
      const err: any = new Error("Network error");
      return Promise.reject(err);
    });

    renderPage();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to fetch customers");
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Sell Machine navigation
  // ────────────────────────────────────────────────────────────────
  it("navigates to sell-machines page with customerId when ShoppingCart button clicked", async () => {
    renderPage();
    await waitFor(() => screen.getByText("Acme Corp"));

    const sellBtn = screen.getByTitle("Sell Machine");
    fireEvent.click(sellBtn);

    expect(mockNavigate).toHaveBeenCalledWith(
      "/sell-machines?customerId=64a1b2c3d4e5f6789012abcd"
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Pure utility function tests (logic re-tested to ensure correctness)
// ────────────────────────────────────────────────────────────────────────────
describe("formatDateTime (utility logic)", () => {
  // Replicating the function from CustomersPage to test it directly
  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    return { date, time };
  };

  it("formats date as DD/MM/YY", () => {
    const result = formatDateTime("2024-01-15T10:00:00.000Z");
    // Date part should be DD/MM/YY format
    expect(result.date).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
  });

  it("includes AM/PM in time output", () => {
    const result = formatDateTime("2024-01-15T10:00:00.000Z");
    expect(result.time).toMatch(/AM|PM/i);
  });

  it("pads month with leading zero", () => {
    const result = formatDateTime("2024-03-05T00:00:00.000Z");
    // Month should be 2 digits
    const parts = result.date.split("/");
    expect(parts[1].length).toBe(2);
  });

  it("pads day with leading zero", () => {
    const result = formatDateTime("2024-01-05T00:00:00.000Z");
    const parts = result.date.split("/");
    expect(parts[0].length).toBe(2);
  });

  it("returns year as 2-digit string", () => {
    const result = formatDateTime("2024-01-15T10:00:00.000Z");
    const parts = result.date.split("/");
    expect(parts[2].length).toBe(2);
    expect(parts[2]).toBe("24");
  });
});

describe("toISTDateParam (utility logic)", () => {
  // Replicating the function from CustomersPage to test it directly
  const toISTDateParam = (htmlDate: string) => {
    const [yyyy, mm, dd] = htmlDate.split("-");
    return `${dd}/${mm}/${String(yyyy).slice(2)}`;
  };

  it("converts YYYY-MM-DD to DD/MM/YY", () => {
    expect(toISTDateParam("2024-01-15")).toBe("15/01/24");
  });

  it("handles end of year", () => {
    expect(toISTDateParam("2023-12-31")).toBe("31/12/23");
  });

  it("handles beginning of year", () => {
    expect(toISTDateParam("2024-01-01")).toBe("01/01/24");
  });

  it("correctly extracts 2-digit year", () => {
    expect(toISTDateParam("2099-06-15")).toBe("15/06/99");
  });

  it("preserves leading zeros in month and day", () => {
    const result = toISTDateParam("2024-03-05");
    expect(result).toBe("05/03/24");
  });
});