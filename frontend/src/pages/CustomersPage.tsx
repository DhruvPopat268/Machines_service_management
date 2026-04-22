import { useState, useEffect, useRef, useCallback } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { UserPlus, ShoppingCart, Edit, Trash2, Upload, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

interface Zone {
  _id: string;
  name: string;
  code: string;
}

interface Customer {
  _id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  zone: Zone | null;
  gstNumber: string;
  totalPurchases: number;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const toISTDateParam = (htmlDate: string) => {
  const [yyyy, mm, dd] = htmlDate.split("-");
  return `${dd}/${mm}/${String(yyyy).slice(2)}`;
};

const emptyForm = { name: "", phone: "", email: "", address: "", zone: "", gstNumber: "", status: "Active" as Customer["status"] };
const LIMIT = 10;

const CustomersPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Customer[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  const [editDialog, setEditDialog] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [deleteDialog, setDeleteDialog] = useState<Customer | null>(null);

  const [importDialog, setImportDialog] = useState(false);
  const [importStep, setImportStep] = useState<"menu" | "confirm" | "upload">("menu");
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [exportDialog, setExportDialog] = useState(false);

  // fetch active zones for dropdown
  useEffect(() => {
    api.get("/admin/zones", { params: { status: "Active", limit: "100" } })
      .then((res) => setZones(res.data.data || []))
      .catch(() => {});
  }, []);

  const zoneOptions = zones.map((z) => ({ label: `${z.name} (${z.code})`, value: z._id }));

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.xlsx$/i)) return toast.error("Only .xlsx files are allowed");
    setImportFile(file);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchCustomers = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.status && filters.status !== "all") params.status = filters.status;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/customers", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total: res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        toast.error("Failed to fetch customers");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters, fromDate, toDate]);

  useEffect(() => { fetchCustomers(1); }, [fetchCustomers]);

  const handleAdd = async () => {
    if (!addForm.name)  return toast.error("Name is required");
    if (!addForm.phone) return toast.error("Phone is required");
    if (!addForm.email) return toast.error("Email is required");
    setSubmitting(true);
    try {
      const payload = {
        ...addForm,
        gstNumber: addForm.gstNumber.toUpperCase(),
        zone: addForm.zone || undefined,
      };
      await api.post("/admin/customers", payload);
      toast.success("Customer added successfully");
      setAddDialog(false);
      setAddForm(emptyForm);
      fetchCustomers(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (!editForm.name)  return toast.error("Name is required");
    if (!editForm.phone) return toast.error("Phone is required");
    if (!editForm.email) return toast.error("Email is required");
    setSubmitting(true);
    try {
      const payload = {
        ...editForm,
        gstNumber: editForm.gstNumber.toUpperCase(),
        zone: editForm.zone || null,
      };
      await api.patch(`/admin/customers/${editDialog._id}`, payload);
      toast.success("Customer updated successfully");
      setEditDialog(null);
      fetchCustomers(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update customer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/customers/${deleteDialog._id}`);
      toast.success("Customer deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchCustomers(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete customer");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (c: Customer) => {
    const newStatus = c.status === "Active" ? "Inactive" : "Active";
    try {
      await api.patch(`/admin/customers/${c._id}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchCustomers(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const handleDownloadSample = async () => {
    try {
      const res = await api.get("/admin/customers/sample", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "customers_sample.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download sample file");
    }
  };

  const handleImportUpload = async () => {
    if (!importFile) return toast.error("Please select a file");
    if (!importFile.name.match(/\.xlsx$/i)) return toast.error("Only .xlsx files are allowed");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await api.post("/admin/customers/import", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(res.data.message);
      setImportDialog(false); setImportStep("menu"); setImportFile(null);
      fetchCustomers(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Import failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    setExportDialog(false);
    toast.success("Download starting...");
    try {
      const res = await api.get("/admin/customers/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "customers.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const columns: Column<Customer>[] = [
    { key: "_id", label: "No.", render: (_c, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "name", label: "Name", render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "phone", label: "Phone", render: (c) => <span className="text-sm">{c.phone}</span> },
    { key: "email", label: "Email", render: (c) => <span className="text-sm">{c.email}</span> },
    { key: "address", label: "Address", render: (c) => <span className="max-w-[180px] truncate block text-sm">{c.address || "—"}</span> },
    { key: "zone", label: "Zone", render: (c) => c.zone ? <span className="text-sm">{c.zone.name}</span> : <span className="text-muted-foreground text-sm">—</span> },
    { key: "gstNumber", label: "GST Number", render: (c) => c.gstNumber ? <span className="font-mono text-sm">{c.gstNumber}</span> : <span className="text-muted-foreground text-sm">—</span> },
    { key: "totalPurchases", label: "Purchases", render: (c) => <span className="font-medium text-sm">{c.totalPurchases}</span> },
    {
      key: "status", label: "Status", render: (c) => (
        <div className="flex items-center gap-2">
          <Switch checked={c.status === "Active"} onCheckedChange={() => toggleStatus(c)} aria-label={`Toggle status for ${c.name}`} />
          <span className={c.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>{c.status}</span>
        </div>
      ),
    },
    {
      key: "createdAt", label: "Created At", render: (c) => {
        const { date, time } = formatDateTime(c.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (c) => {
        const { date, time } = formatDateTime(c.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Sell Machine" onClick={() => navigate(`/sell-machines?customerId=${c._id}`)}><ShoppingCart className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${c.name}`} onClick={() => { setEditDialog(c); setEditForm({ name: c.name, phone: c.phone, email: c.email, address: c.address, zone: c.zone?._id || "", gstNumber: c.gstNumber, status: c.status }); }}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${c.name}`} onClick={() => setDeleteDialog(c)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const CustomerForm = ({ form, setForm }: { form: typeof emptyForm; setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>> }) => (
    <div className="space-y-4 py-4">
      <div className="space-y-2"><Label htmlFor="cust-name">Name</Label><Input id="cust-name" placeholder="Company or customer name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
      <div className="space-y-2"><Label htmlFor="cust-phone">Phone</Label><Input id="cust-phone" placeholder="+91 9800000000" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
      <div className="space-y-2"><Label htmlFor="cust-email">Email</Label><Input id="cust-email" type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
      <div className="space-y-2"><Label htmlFor="cust-address">Address</Label><Input id="cust-address" placeholder="Full address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></div>
      <div className="space-y-2">
        <Label>Zone</Label>
        <SearchableSelect options={zoneOptions} value={form.zone} onChange={(v) => setForm((p) => ({ ...p, zone: v }))} placeholder="Select zone" searchPlaceholder="Search zones..." />
      </div>
      <div className="space-y-2"><Label htmlFor="cust-gst">GST Number</Label><Input id="cust-gst" placeholder="e.g. 27AABCA1234A1Z5" value={form.gstNumber} onChange={(e) => setForm((p) => ({ ...p, gstNumber: e.target.value.toUpperCase() }))} /></div>
      <div className="space-y-2">
        <Label htmlFor="cust-status">Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as Customer["status"] }))}>
          <SelectTrigger id="cust-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Customers" description="Manage customer accounts" actionLabel="Add Customer" actionIcon={UserPlus} onAction={() => { setAddForm(emptyForm); setAddDialog(true); }}>
            <Button variant="outline" className="gap-2" onClick={() => { setImportStep("menu"); setImportFile(null); setImportDialog(true); }}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setExportDialog(true)}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </PageHeader>
          <FilterBar
            searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by name, phone or email..."
            filters={[{ key: "status", label: "Status", options: [{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }] }]}
            filterValues={filters}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
            showDateRange fromDate={fromDate} toDate={toDate}
            onFromDateChange={setFromDate} onToDateChange={setToDate}
            onClear={() => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); }}
          />
          <DataTable columns={columns} data={data} />
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={LIMIT} onPageChange={fetchCustomers} />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={(open) => { if (!open) { setAddDialog(false); setAddForm(emptyForm); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
          <CustomerForm form={addForm} setForm={setAddForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog(false); setAddForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>{submitting ? "Adding..." : "Add Customer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <CustomerForm form={editForm} setForm={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>Are you sure you want to delete <span className="font-semibold text-foreground">{deleteDialog?.name}</span>? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>{submitting ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialog} onOpenChange={(open) => { if (!open) { setImportDialog(false); setImportStep("menu"); setImportFile(null); } }}>
        <DialogContent>
          {importStep === "menu" && (
            <>
              <DialogHeader><DialogTitle>Import Customers</DialogTitle><DialogDescription>Download the sample file, fill in your data, then upload.</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <Button variant="outline" className="gap-2 w-full" onClick={handleDownloadSample}><Download className="h-4 w-4" /> Download Sample File</Button>
                <Button className="gap-2 w-full" onClick={() => setImportStep("confirm")}><Upload className="h-4 w-4" /> Upload File</Button>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setImportDialog(false)}>Close</Button></DialogFooter>
            </>
          )}
          {importStep === "confirm" && (
            <>
              <DialogHeader><DialogTitle>Upload Customers</DialogTitle><DialogDescription>Please confirm you have checked the sample file and your file matches the required format before uploading.</DialogDescription></DialogHeader>
              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setImportStep("menu")}>Back</Button>
                <Button onClick={() => setImportStep("upload")}>Yes, I Checked — Continue</Button>
              </DialogFooter>
            </>
          )}
          {importStep === "upload" && (
            <>
              <DialogHeader><DialogTitle>Select File</DialogTitle><DialogDescription>Select a .xlsx file to import customers.</DialogDescription></DialogHeader>
              <div className="py-4">
                <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }} />
                <div
                  role="button" tabIndex={0} aria-label="Upload .xlsx file — click or drag and drop"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : importFile ? "border-primary/50 bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50"}`}
                >
                  <Upload className={`h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  {importFile ? (
                    <><p className="text-sm font-medium text-primary">{importFile.name}</p><p className="text-xs text-muted-foreground">Click or drop to replace</p></>
                  ) : (
                    <><p className="text-sm font-medium">{isDragging ? "Drop your file here" : "Drag & drop your .xlsx file here"}</p><p className="text-xs text-muted-foreground">or click to browse</p></>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportStep("confirm")}>Back</Button>
                <Button onClick={handleImportUpload} disabled={!importFile || submitting}>{submitting ? "Uploading..." : "Upload"}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Confirm Dialog */}
      <Dialog open={exportDialog} onOpenChange={setExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Customers</DialogTitle>
            <DialogDescription>Do you want to download all customers as an Excel file?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialog(false)}>Cancel</Button>
            <Button onClick={handleExport}>Yes, Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomersPage;
