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
import { Plus, Edit, Trash2, Upload, Download, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";
import { useNavigate } from "react-router-dom";

interface Vendor {
  _id: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  gstNumber: string;
  status: "Active" | "Inactive";
  source: "manual" | "imported";
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

const emptyForm = { name: "", companyName: "", phone: "", email: "", address: "", gstNumber: "", status: "Active" as Vendor["status"] };
const LIMIT = 10;

const FormFields = ({ values, onChange }: { values: typeof emptyForm; onChange: (k: string, v: string) => void }) => (
  <div className="space-y-4 py-4">
    <div className="space-y-2"><Label>Name <span className="text-destructive">*</span></Label><Input placeholder="Contact person name" value={values.name} onChange={(e) => onChange("name", e.target.value)} /></div>
    <div className="space-y-2"><Label>Company Name <span className="text-destructive">*</span></Label><Input placeholder="Company / firm name" value={values.companyName} onChange={(e) => onChange("companyName", e.target.value)} /></div>
    <div className="space-y-2"><Label>Phone <span className="text-destructive">*</span></Label><Input placeholder="e.g. 9800000000" value={values.phone} onChange={(e) => onChange("phone", e.target.value)} /></div>
    <div className="space-y-2"><Label>Email <span className="text-destructive">*</span></Label><Input type="email" placeholder="vendor@company.com" value={values.email} onChange={(e) => onChange("email", e.target.value)} /></div>
    <div className="space-y-2"><Label>Address</Label><Input placeholder="Full address" value={values.address} onChange={(e) => onChange("address", e.target.value)} /></div>
    <div className="space-y-2"><Label>GST Number</Label><Input placeholder="e.g. 27AABCG1234A1Z5" value={values.gstNumber} onChange={(e) => onChange("gstNumber", e.target.value)} /></div>
    <div className="space-y-2">
      <Label>Status</Label>
      <Select value={values.status} onValueChange={(v) => onChange("status", v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Active">Active</SelectItem>
          <SelectItem value="Inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
);

const VendorsPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Vendor[]>([]);
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

  const [editDialog, setEditDialog] = useState<Vendor | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [deleteDialog, setDeleteDialog] = useState<Vendor | null>(null);

  const [importDialog, setImportDialog] = useState(false);
  const [importStep, setImportStep] = useState<"menu" | "confirm" | "upload">("menu");
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [exportDialog, setExportDialog] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.xlsx$/i)) return toast.error("Only .xlsx files are allowed");
    setImportFile(file);
  };

  // Debounce search 500ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchVendors = useCallback(async (page = 1) => {
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

      const res = await api.get("/admin/vendors", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total: res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        toast.error("Failed to fetch vendors");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters, fromDate, toDate]);

  useEffect(() => { fetchVendors(1); }, [fetchVendors]);

  const handleAdd = async () => {
    if (!addForm.name || !addForm.companyName || !addForm.phone || !addForm.email)
      return toast.error("Name, company name, phone and email are required");
    setSubmitting(true);
    try {
      await api.post("/admin/vendors", addForm);
      toast.success("Vendor added successfully");
      setAddDialog(false);
      setAddForm(emptyForm);
      fetchVendors(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add vendor");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (!editForm.name || !editForm.companyName || !editForm.phone || !editForm.email)
      return toast.error("Name, company name, phone and email are required");
    setSubmitting(true);
    try {
      await api.patch(`/admin/vendors/${editDialog._id}`, editForm);
      toast.success("Vendor updated successfully");
      setEditDialog(null);
      fetchVendors(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update vendor");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/vendors/${deleteDialog._id}`);
      toast.success("Vendor deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchVendors(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete vendor");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (vendor: Vendor) => {
    const newStatus = vendor.status === "Active" ? "Inactive" : "Active";
    try {
      await api.patch(`/admin/vendors/${vendor._id}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchVendors(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const handleDownloadSample = async () => {
    try {
      const res = await api.get("/admin/vendors/sample", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "vendors_sample.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download sample file");
    }
  };

  const handleImportUpload = async () => {
    if (!importFile) return toast.error("Please select a file");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await api.post("/admin/vendors/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const reasons = res.data.skippedReasons?.length
        ? `\nSkipped reasons: ${res.data.skippedReasons.map((r: string) => r).join(", ")}`
        : "";
      toast.success(`${res.data.message}${reasons}`);
      setImportDialog(false); setImportStep("menu"); setImportFile(null);
      fetchVendors(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Import failed");
    } finally { setSubmitting(false); }
  };

  const handleExport = async () => {
    setExportDialog(false);
    toast.success("Download starting...");
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch)                                 params.search = debouncedSearch;
      if (filters.status && filters.status !== "all")     params.status = filters.status;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);
      const res = await api.get("/admin/vendors/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "vendors.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const columns: Column<Vendor>[] = [
    { key: "_id", label: "No.", render: (_v, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "name", label: "Name", render: (v) => <span className="font-medium">{v.name}</span> },
    { key: "companyName", label: "Company Name", render: (v) => <span className="font-medium">{v.companyName}</span> },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address", render: (v) => <span className="max-w-[200px] truncate block">{v.address}</span> },
    { key: "gstNumber", label: "GST Number", render: (v) => <span className="font-mono text-sm">{v.gstNumber}</span> },
    {
      key: "status", label: "Status", render: (v) => (
        <div className="flex items-center gap-2">
          <Switch checked={v.status === "Active"} onCheckedChange={() => toggleStatus(v)} aria-label={`Toggle status for ${v.name}`} />
          <span className={v.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>{v.status}</span>
        </div>
      ),
    },
    {
      key: "source", label: "Source", render: (v) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          v.source === "imported" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
        }`}>{v.source === "imported" ? "Imported" : "Manual"}</span>
      ),
    },
    {
      key: "createdAt", label: "Created At", render: (v) => {
        const { date, time } = formatDateTime(v.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (v) => {
        const { date, time } = formatDateTime(v.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (v) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Purchase Machine" onClick={() => navigate(`/purchase-machines?vendorId=${v._id}`)}>
            <ShoppingBag className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${v.name}`} onClick={() => { setEditDialog(v); setEditForm({ name: v.name, companyName: v.companyName, phone: v.phone, email: v.email, address: v.address, gstNumber: v.gstNumber, status: v.status }); }}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${v.name}`} onClick={() => setDeleteDialog(v)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader
            title="Vendor Management"
            description="Manage suppliers and vendors from whom machines are purchased"
            actionLabel="Add Vendor"
            actionIcon={Plus}
            onAction={() => { setAddForm(emptyForm); setAddDialog(true); }}
          >
            <Button variant="outline" className="gap-2" onClick={() => { setImportStep("menu"); setImportFile(null); setImportDialog(true); }}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setExportDialog(true)}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </PageHeader>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name, company, email or phone..."
            filters={[{ key: "status", label: "Status", options: [{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }] }]}
            filterValues={filters}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
            showDateRange
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onClear={() => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); }}
          />
          <DataTable columns={columns} data={data} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={LIMIT}
            onPageChange={fetchVendors}
          />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={(open) => { if (!open) { setAddDialog(false); setAddForm(emptyForm); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
          <FormFields values={addForm} onChange={(k, v) => setAddForm((prev) => ({ ...prev, [k]: v }))} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog(false); setAddForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>{submitting ? "Adding..." : "Add Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Vendor</DialogTitle></DialogHeader>
          <FormFields values={editForm} onChange={(k, v) => setEditForm((prev) => ({ ...prev, [k]: v }))} />
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
            <DialogTitle>Delete Vendor</DialogTitle>
            <DialogDescription>Are you sure you want to delete <span className="font-semibold text-foreground">{deleteDialog?.companyName}</span>? This action cannot be undone.</DialogDescription>
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
              <DialogHeader><DialogTitle>Import Vendors</DialogTitle><DialogDescription>Download the sample file, fill in your data, then upload.</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <Button variant="outline" className="gap-2 w-full" onClick={handleDownloadSample}><Download className="h-4 w-4" /> Download Sample File</Button>
                <Button className="gap-2 w-full" onClick={() => setImportStep("confirm")}><Upload className="h-4 w-4" /> Upload File</Button>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setImportDialog(false)}>Close</Button></DialogFooter>
            </>
          )}
          {importStep === "confirm" && (
            <>
              <DialogHeader><DialogTitle>Upload Vendors</DialogTitle><DialogDescription>Please confirm you have checked the sample file and your file matches the required format before uploading.</DialogDescription></DialogHeader>
              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setImportStep("menu")}>Back</Button>
                <Button onClick={() => setImportStep("upload")}>Yes, I Checked — Continue</Button>
              </DialogFooter>
            </>
          )}
          {importStep === "upload" && (
            <>
              <DialogHeader><DialogTitle>Select File</DialogTitle><DialogDescription>Select a .xlsx file to import vendors.</DialogDescription></DialogHeader>
              <div className="py-4">
                <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }} />
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload .xlsx file — click or drag and drop"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${
                    isDragging ? "border-primary bg-primary/5" : importFile ? "border-primary/50 bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50"
                  }`}
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
            <DialogTitle>Export Vendors</DialogTitle>
            <DialogDescription>Do you want to download all vendors as an Excel file?</DialogDescription>
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

export default VendorsPage;
