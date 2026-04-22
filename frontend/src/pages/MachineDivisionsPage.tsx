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
import { Plus, Edit, Trash2, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

interface MachineDivision {
  _id: string;
  name: string;
  description: string;
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

const emptyForm = { name: "", description: "", status: "Active" as MachineDivision["status"] };
const LIMIT = 10;

const MachineDivisionsPage = () => {
  const [data, setData] = useState<MachineDivision[]>([]);
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

  const [editDialog, setEditDialog] = useState<MachineDivision | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [deleteDialog, setDeleteDialog] = useState<MachineDivision | null>(null);

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchDivisions = useCallback(async (page = 1) => {
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

      const res = await api.get("/admin/machine-divisions", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total: res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        toast.error("Failed to fetch machine divisions");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters, fromDate, toDate]);

  useEffect(() => { fetchDivisions(1); }, [fetchDivisions]);

  const handleAdd = async () => {
    if (!addForm.name) return toast.error("Name is required");
    setSubmitting(true);
    try {
      await api.post("/admin/machine-divisions", addForm);
      toast.success("Division added successfully");
      setAddDialog(false);
      setAddForm(emptyForm);
      fetchDivisions(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add division");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (!editForm.name) return toast.error("Name is required");
    setSubmitting(true);
    try {
      await api.patch(`/admin/machine-divisions/${editDialog._id}`, editForm);
      toast.success("Division updated successfully");
      setEditDialog(null);
      fetchDivisions(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update division");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/machine-divisions/${deleteDialog._id}`);
      toast.success("Division deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchDivisions(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete division");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (div: MachineDivision) => {
    const newStatus = div.status === "Active" ? "Inactive" : "Active";
    try {
      await api.patch(`/admin/machine-divisions/${div._id}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchDivisions(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const handleDownloadSample = async () => {
    try {
      const res = await api.get("/admin/machine-divisions/sample", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "machine_divisions_sample.xlsx"; a.click();
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
      const res = await api.post("/admin/machine-divisions/import", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(res.data.message);
      setImportDialog(false); setImportStep("menu"); setImportFile(null);
      fetchDivisions(1);
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
      const res = await api.get("/admin/machine-divisions/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "machine_divisions.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const columns: Column<MachineDivision>[] = [
    { key: "_id", label: "No.", render: (_d, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "name", label: "Division Name", render: (d) => <span className="font-medium">{d.name}</span> },
    { key: "description", label: "Description", render: (d) => <span className="max-w-[400px] truncate block">{d.description}</span> },
    {
      key: "status", label: "Status", render: (d) => (
        <div className="flex items-center gap-2">
          <Switch checked={d.status === "Active"} onCheckedChange={() => toggleStatus(d)} aria-label={`Toggle status for ${d.name}`} />
          <span className={d.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>{d.status}</span>
        </div>
      ),
    },
    {
      key: "createdAt", label: "Created At", render: (d) => {
        const { date, time } = formatDateTime(d.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (d) => {
        const { date, time } = formatDateTime(d.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (d) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${d.name}`} onClick={() => { setEditDialog(d); setEditForm({ name: d.name, description: d.description, status: d.status }); }}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${d.name}`} onClick={() => setDeleteDialog(d)}>
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
            title="Machine Divisions"
            description="Manage machine divisions for categorizing inventory"
            actionLabel="Add Division"
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
            searchPlaceholder="Search by division name..."
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
            onPageChange={fetchDivisions}
          />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={(open) => { if (!open) { setAddDialog(false); setAddForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Machine Division</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="add-div-name">Division Name</Label><Input id="add-div-name" placeholder="e.g. CNC Division" value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="add-div-desc">Description</Label><Textarea id="add-div-desc" placeholder="Types of machines covered by this division" value={addForm.description} onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label htmlFor="add-div-status">Status</Label>
              <Select value={addForm.status} onValueChange={(v) => setAddForm((p) => ({ ...p, status: v as MachineDivision["status"] }))}>
                <SelectTrigger id="add-div-status"><SelectValue /></SelectTrigger>
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
          <DialogHeader><DialogTitle>Edit Machine Division</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="edit-div-name">Division Name</Label><Input id="edit-div-name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="edit-div-desc">Description</Label><Textarea id="edit-div-desc" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label htmlFor="edit-div-status">Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v as MachineDivision["status"] }))}>
                <SelectTrigger id="edit-div-status"><SelectValue /></SelectTrigger>
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
            <DialogTitle>Delete Machine Division</DialogTitle>
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
              <DialogHeader><DialogTitle>Import Machine Divisions</DialogTitle><DialogDescription>Download the sample file, fill in your data, then upload.</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <Button variant="outline" className="gap-2 w-full" onClick={handleDownloadSample}><Download className="h-4 w-4" /> Download Sample File</Button>
                <Button className="gap-2 w-full" onClick={() => setImportStep("confirm")}><Upload className="h-4 w-4" /> Upload File</Button>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setImportDialog(false)}>Close</Button></DialogFooter>
            </>
          )}
          {importStep === "confirm" && (
            <>
              <DialogHeader><DialogTitle>Upload Machine Divisions</DialogTitle><DialogDescription>Please confirm you have checked the sample file and your file matches the required format before uploading.</DialogDescription></DialogHeader>
              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setImportStep("menu")}>Back</Button>
                <Button onClick={() => setImportStep("upload")}>Yes, I Checked — Continue</Button>
              </DialogFooter>
            </>
          )}
          {importStep === "upload" && (
            <>
              <DialogHeader><DialogTitle>Select File</DialogTitle><DialogDescription>Select a .xlsx file to import machine divisions.</DialogDescription></DialogHeader>
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
            <DialogTitle>Export Machine Divisions</DialogTitle>
            <DialogDescription>Do you want to download all machine divisions as an Excel file?</DialogDescription>
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

export default MachineDivisionsPage;
