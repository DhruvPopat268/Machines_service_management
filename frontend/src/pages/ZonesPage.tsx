import { useState, useEffect, useRef } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import api from "@/lib/axiosInterceptor";

interface Zone {
  _id: string;
  name: string;
  code: string;
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

const emptyForm = { name: "", code: "", status: "Active" as Zone["status"] };

const ZonesPage = () => {
  const [data, setData] = useState<Zone[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  const [editDialog, setEditDialog] = useState<Zone | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [deleteDialog, setDeleteDialog] = useState<Zone | null>(null);

  // Import flow: step "menu" | "confirm" | "upload"
  const [importDialog, setImportDialog] = useState(false);
  const [importStep, setImportStep] = useState<"menu" | "confirm" | "upload">("menu");
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.xlsx$/i)) return toast.error("Only .xlsx files are allowed");
    setImportFile(file);
  };

  // Export confirm
  const [exportDialog, setExportDialog] = useState(false);

  const fetchZones = async () => {
    try {
      const res = await api.get("/admin/zones");
      setData(res.data.data);
    } catch {
      toast.error("Failed to fetch zones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchZones(); }, []);

  const handleAdd = async () => {
    if (!addForm.name || !addForm.code) return toast.error("Name and code are required");
    setSubmitting(true);
    try {
      const res = await api.post("/admin/zones", addForm);
      setData((prev) => [res.data.data, ...prev]);
      toast.success("Zone added successfully");
      setAddDialog(false);
      setAddForm(emptyForm);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add zone");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (!editForm.name || !editForm.code) return toast.error("Name and code are required");
    setSubmitting(true);
    try {
      const res = await api.patch(`/admin/zones/${editDialog._id}`, editForm);
      setData((prev) => prev.map((z) => z._id === editDialog._id ? res.data.data : z));
      toast.success("Zone updated successfully");
      setEditDialog(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update zone");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/zones/${deleteDialog._id}`);
      setData((prev) => prev.filter((z) => z._id !== deleteDialog._id));
      toast.success("Zone deleted successfully");
      setDeleteDialog(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete zone");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (zone: Zone) => {
    const newStatus = zone.status === "Active" ? "Inactive" : "Active";
    try {
      const res = await api.patch(`/admin/zones/${zone._id}`, { status: newStatus });
      setData((prev) => prev.map((z) => z._id === zone._id ? res.data.data : z));
      toast.success(`Status updated to ${newStatus}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const handleDownloadSample = async () => {
    try {
      const res = await api.get("/admin/zones/sample", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zones_sample.xlsx";
      a.click();
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
      const res = await api.post("/admin/zones/import", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(res.data.message);
      setImportDialog(false);
      setImportStep("menu");
      setImportFile(null);
      fetchZones();
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
      const res = await api.get("/admin/zones/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zones.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  let filtered = [...data];
  if (filters.status && filters.status !== "all") filtered = filtered.filter((z) => z.status === filters.status);
  if (fromDate && toDate) filtered = filtered.filter((z) => z.createdAt.slice(0, 10) >= fromDate && z.createdAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((z) => z.name.toLowerCase().includes(s) || z.code.toLowerCase().includes(s));
  }

  const columns: Column<Zone>[] = [
    { key: "_id", label: "No.", render: (_z, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "name", label: "Zone Name", render: (z) => <span className="font-medium">{z.name}</span> },
    { key: "code", label: "Zone Code", render: (z) => <span className="font-mono text-sm">{z.code}</span> },
    {
      key: "status", label: "Status", render: (z) => (
        <div className="flex items-center gap-2">
          <Switch checked={z.status === "Active"} onCheckedChange={() => toggleStatus(z)} aria-label={`Toggle status for ${z.name}`} />
          <span className={z.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>{z.status}</span>
        </div>
      ),
    },
    {
      key: "createdAt", label: "Created At", render: (z) => {
        const { date, time } = formatDateTime(z.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (z) => {
        const { date, time } = formatDateTime(z.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (z) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${z.name}`} onClick={() => { setEditDialog(z); setEditForm({ name: z.name, code: z.code, status: z.status }); }}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${z.name}`} onClick={() => setDeleteDialog(z)}>
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
            title="Zone Management"
            description="Manage service zones for engineer assignment and call routing"
            actionLabel="Add Zone"
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
            searchPlaceholder="Search by zone name or code..."
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
          <DataTable columns={columns} data={filtered} />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Zone</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="add-zone-name">Zone Name</Label><Input id="add-zone-name" placeholder="e.g. North Zone" value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="add-zone-code">Zone Code</Label><Input id="add-zone-code" placeholder="e.g. NZ" value={addForm.code} onChange={(e) => setAddForm((p) => ({ ...p, code: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label htmlFor="add-zone-status">Status</Label>
              <Select value={addForm.status} onValueChange={(v) => setAddForm((p) => ({ ...p, status: v as Zone["status"] }))}>
                <SelectTrigger id="add-zone-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>{submitting ? "Adding..." : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Zone</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="edit-zone-name">Zone Name</Label><Input id="edit-zone-name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="edit-zone-code">Zone Code</Label><Input id="edit-zone-code" value={editForm.code} onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label htmlFor="edit-zone-status">Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v as Zone["status"] }))}>
                <SelectTrigger id="edit-zone-status"><SelectValue /></SelectTrigger>
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
            <DialogTitle>Delete Zone</DialogTitle>
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
              <DialogHeader><DialogTitle>Import Zones</DialogTitle><DialogDescription>Download the sample file, fill in your data, then upload.</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <Button variant="outline" className="gap-2 w-full" onClick={handleDownloadSample}>
                  <Download className="h-4 w-4" /> Download Sample File
                </Button>
                <Button className="gap-2 w-full" onClick={() => setImportStep("confirm")}>
                  <Upload className="h-4 w-4" /> Upload File
                </Button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportDialog(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
          {importStep === "confirm" && (
            <>
              <DialogHeader><DialogTitle>Upload Zones</DialogTitle><DialogDescription>Please confirm you have checked the sample file and your file matches the required format before uploading.</DialogDescription></DialogHeader>
              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setImportStep("menu")}>Back</Button>
                <Button onClick={() => setImportStep("upload")}>Yes, I Checked — Continue</Button>
              </DialogFooter>
            </>
          )}
          {importStep === "upload" && (
            <>
              <DialogHeader><DialogTitle>Select File</DialogTitle><DialogDescription>Select a .xlsx file to import zones.</DialogDescription></DialogHeader>
              <div className="py-4">
                <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }} />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${
                    isDragging ? "border-primary bg-primary/5" : importFile ? "border-primary/50 bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50"
                  }`}
                >
                  <Upload className={`h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  {importFile ? (
                    <>
                      <p className="text-sm font-medium text-primary">{importFile.name}</p>
                      <p className="text-xs text-muted-foreground">Click or drop to replace</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium">{isDragging ? "Drop your file here" : "Drag & drop your .xlsx file here"}</p>
                      <p className="text-xs text-muted-foreground">or click to browse</p>
                    </>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportStep("confirm")}>Back</Button>
                <Button onClick={handleImportUpload} disabled={!importFile || submitting}>
                  {submitting ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Confirm Dialog */}
      <Dialog open={exportDialog} onOpenChange={setExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Zones</DialogTitle>
            <DialogDescription>Do you want to download all zones as an Excel file?</DialogDescription>
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

export default ZonesPage;
