import { useState, useEffect, useRef, useCallback } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Plus, Edit, Trash2, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

interface MachineCategory {
  _id: string;
  name: string;
}

interface Attribute {
  _id: string;
  name: string;
  machineCategory: MachineCategory;
  description: string;
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

const emptyForm = { name: "", machineCategory: "", description: "", status: "Active" as Attribute["status"] };
const LIMIT = 10;

const AttributesPage = () => {
  const [data, setData] = useState<Attribute[]>([]);
  const [categories, setCategories] = useState<MachineCategory[]>([]);
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

  const [editDialog, setEditDialog] = useState<Attribute | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [deleteDialog, setDeleteDialog] = useState<Attribute | null>(null);

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

  // Fetch all active machine categories for dropdowns
  useEffect(() => {
    api.get("/admin/machine-categories", { params: { limit: "100", status: "Active" } })
      .then((res) => setCategories(res.data.data))
      .catch(() => toast.error("Failed to fetch machine categories"));
  }, []);

  const categoryOptions = categories.map((c) => ({ label: c.name, value: c._id }));

  // Debounce search 500ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchAttributes = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.status && filters.status !== "all") params.status = filters.status;
      if (filters.machineCategory && filters.machineCategory !== "all") params.machineCategory = filters.machineCategory;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/attributes", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total: res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        toast.error("Failed to fetch attributes");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters, fromDate, toDate]);

  useEffect(() => { fetchAttributes(1); }, [fetchAttributes]);

  const handleAdd = async () => {
    if (!addForm.name) return toast.error("Name is required");
    if (!addForm.machineCategory) return toast.error("Machine category is required");
    setSubmitting(true);
    try {
      await api.post("/admin/attributes", addForm);
      toast.success("Attribute added successfully");
      setAddDialog(false);
      setAddForm(emptyForm);
      fetchAttributes(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add attribute");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (!editForm.name) return toast.error("Name is required");
    if (!editForm.machineCategory) return toast.error("Machine category is required");
    setSubmitting(true);
    try {
      await api.patch(`/admin/attributes/${editDialog._id}`, editForm);
      toast.success("Attribute updated successfully");
      setEditDialog(null);
      fetchAttributes(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update attribute");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/attributes/${deleteDialog._id}`);
      toast.success("Attribute deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchAttributes(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete attribute");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (attr: Attribute) => {
    const newStatus = attr.status === "Active" ? "Inactive" : "Active";
    try {
      await api.patch(`/admin/attributes/${attr._id}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchAttributes(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const handleDownloadSample = async () => {
    try {
      const res = await api.get("/admin/attributes/sample", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "attributes_sample.xlsx"; a.click();
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
      const res = await api.post("/admin/attributes/import", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(res.data.message);
      setImportDialog(false); setImportStep("menu"); setImportFile(null);
      fetchAttributes(1);
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
      const params: Record<string, string> = {};
      if (debouncedSearch)                                          params.search          = debouncedSearch;
      if (filters.status          && filters.status          !== "all") params.status      = filters.status;
      if (filters.machineCategory && filters.machineCategory !== "all") params.machineCategory = filters.machineCategory;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);
      const res = await api.get("/admin/attributes/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "attributes.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const CategorySelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <SearchableSelect options={categoryOptions} value={value} onChange={onChange} placeholder="Select category" searchPlaceholder="Search categories..." />
  );

  const columns: Column<Attribute>[] = [
    { key: "_id", label: "No.", render: (_a, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "name", label: "Attribute Name", render: (a) => <span className="font-medium">{a.name}</span> },
    { key: "machineCategory", label: "Category", render: (a) => <span className="text-sm">{a.machineCategory?.name || "—"}</span> },
    { key: "description", label: "Description", render: (a) => <span className="max-w-[300px] truncate block">{a.description}</span> },
    {
      key: "status", label: "Status", render: (a) => (
        <div className="flex items-center gap-2">
          <Switch checked={a.status === "Active"} onCheckedChange={() => toggleStatus(a)} aria-label={`Toggle status for ${a.name}`} />
          <span className={a.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>{a.status}</span>
        </div>
      ),
    },
    {
      key: "source", label: "Source", render: (a) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          a.source === "imported" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
        }`}>{a.source === "imported" ? "Imported" : "Manual"}</span>
      ),
    },
    {
      key: "createdAt", label: "Created At", render: (a) => {
        const { date, time } = formatDateTime(a.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (a) => {
        const { date, time } = formatDateTime(a.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (a) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${a.name}`} onClick={() => {
            setEditDialog(a);
            setEditForm({ name: a.name, machineCategory: a.machineCategory?._id || "", description: a.description, status: a.status });
          }}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${a.name}`} onClick={() => setDeleteDialog(a)}>
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
            title="Attributes"
            description="Manage machine attributes used to define product variants"
            actionLabel="Add Attribute"
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
            searchPlaceholder="Search by attribute name..."
            filters={[
              { key: "status", label: "Status", options: [{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }] },
              { key: "machineCategory", label: "Category", options: categories.map((c) => ({ label: c.name, value: c._id })) },
            ]}
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
            onPageChange={fetchAttributes}
          />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={(open) => { if (!open) { setAddDialog(false); setAddForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Attribute</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-attr-cat">Machine Category</Label>
              <CategorySelect value={addForm.machineCategory} onChange={(v) => setAddForm((p) => ({ ...p, machineCategory: v }))} />
            </div>
            <div className="space-y-2"><Label htmlFor="add-attr-name">Attribute Name</Label><Input id="add-attr-name" placeholder="e.g. Color, Voltage, Power (kW)" value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="add-attr-desc">Description</Label><Textarea id="add-attr-desc" placeholder="Brief description of this attribute" value={addForm.description} onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label htmlFor="add-attr-status">Status</Label>
              <Select value={addForm.status} onValueChange={(v) => setAddForm((p) => ({ ...p, status: v as Attribute["status"] }))}>
                <SelectTrigger id="add-attr-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog(false); setAddForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>{submitting ? "Adding..." : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Attribute</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-attr-cat">Machine Category</Label>
              <CategorySelect value={editForm.machineCategory} onChange={(v) => setEditForm((p) => ({ ...p, machineCategory: v }))} />
            </div>
            <div className="space-y-2"><Label htmlFor="edit-attr-name">Attribute Name</Label><Input id="edit-attr-name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="edit-attr-desc">Description</Label><Textarea id="edit-attr-desc" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label htmlFor="edit-attr-status">Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v as Attribute["status"] }))}>
                <SelectTrigger id="edit-attr-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Attribute</DialogTitle>
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
              <DialogHeader><DialogTitle>Import Attributes</DialogTitle><DialogDescription>Download the sample file, fill in your data, then upload.</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <Button variant="outline" className="gap-2 w-full" onClick={handleDownloadSample}><Download className="h-4 w-4" /> Download Sample File</Button>
                <Button className="gap-2 w-full" onClick={() => setImportStep("confirm")}><Upload className="h-4 w-4" /> Upload File</Button>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setImportDialog(false)}>Close</Button></DialogFooter>
            </>
          )}
          {importStep === "confirm" && (
            <>
              <DialogHeader><DialogTitle>Upload Attributes</DialogTitle><DialogDescription>Please confirm you have checked the sample file and your file matches the required format before uploading.</DialogDescription></DialogHeader>
              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setImportStep("menu")}>Back</Button>
                <Button onClick={() => setImportStep("upload")}>Yes, I Checked — Continue</Button>
              </DialogFooter>
            </>
          )}
          {importStep === "upload" && (
            <>
              <DialogHeader><DialogTitle>Select File</DialogTitle><DialogDescription>Select a .xlsx file to import attributes.</DialogDescription></DialogHeader>
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
            <DialogTitle>Export Attributes</DialogTitle>
            <DialogDescription>Do you want to download all attributes as an Excel file?</DialogDescription>
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

export default AttributesPage;
