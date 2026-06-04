import { useState, useEffect, useRef, useCallback } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { Plus, Eye, Edit, Trash2, Upload, Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

interface Machine {
  _id: string;
  name: string;
  modelNumber: string;
  hsnCode: string;
  gstPercentage: number | null;
  category: { _id: string; name: string } | null;
  division: { _id: string; name: string } | null;
  lowStockThreshold: number;
  currentStock: number;
  stockStatus: "In Stock" | "Low Stock" | "Out of Stock";
  images: string[];
  notes: string;
  status: "Active" | "Inactive";
  source: "manual" | "imported";
  createdAt: string;
  updatedAt: string;
}

interface DropdownOption { _id: string; name: string; }

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

const LIMIT = 10;

const MachinesPage = () => {
  const navigate = useNavigate();

  const [data, setData]           = useState<Machine[]>([]);
  const [search, setSearch]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters]     = useState<Record<string, string>>({});
  const [fromDate, setFromDate]   = useState("");
  const [toDate, setToDate]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [categories, setCategories] = useState<DropdownOption[]>([]);
  const [divisions, setDivisions]   = useState<DropdownOption[]>([]);

  const [deleteDialog,  setDeleteDialog]  = useState<Machine | null>(null);
  const [importDialog,  setImportDialog]  = useState(false);
  const [importStep,    setImportStep]    = useState<"menu" | "confirm" | "upload">("menu");
  const [importFile,    setImportFile]    = useState<File | null>(null);
  const [exportDialog,  setExportDialog]  = useState(false);
  const [isDragging,    setIsDragging]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  // fetch category & division options for filter dropdowns
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [catRes, divRes] = await Promise.all([
          api.get("/admin/machine-categories", { params: { limit: 10 } }),
          api.get("/admin/machine-divisions",  { params: { limit: 10 } }),
        ]);
        setCategories(catRes.data.data);
        setDivisions(divRes.data.data);
      } catch {
        toast.error("Failed to load filter options");
      }
    };
    fetchOptions();
  }, []);

  // Fetch categories with search
  const fetchCategories = useCallback(async (searchQuery: string) => {
    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/machine-categories", { params });
      setCategories(res.data.data);
    } catch {
      toast.error("Failed to search categories");
    }
  }, []);

  // Fetch divisions with search
  const fetchDivisions = useCallback(async (searchQuery: string) => {
    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/machine-divisions", { params });
      setDivisions(res.data.data);
    } catch {
      toast.error("Failed to search divisions");
    }
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const fetchMachines = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (debouncedSearch)                                         params.search      = debouncedSearch;
      if (filters.status      && filters.status      !== "all" && filters.status      !== "")    params.status      = filters.status;
      if (filters.category    && filters.category    !== "all" && filters.category    !== "")    params.category    = filters.category;
      if (filters.division    && filters.division    !== "all" && filters.division    !== "")    params.division    = filters.division;
      if (filters.stockStatus && filters.stockStatus !== "all" && filters.stockStatus !== "")    params.stockStatus = filters.stockStatus;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/machines", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total: res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch machines");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters, fromDate, toDate]);

  useEffect(() => { fetchMachines(1); }, [fetchMachines]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.xlsx$/i)) return toast.error("Only .xlsx files are allowed");
    setImportFile(file);
  };

  const handleDownloadSample = async () => {
    try {
      const res = await api.get("/admin/machines/sample", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "machines_sample.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Failed to download sample file"); }
  };

  const handleImportUpload = async () => {
    if (!importFile) return toast.error("Please select a file");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await api.post("/admin/machines/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const reasons = res.data.skippedReasons?.length
        ? `\nSkipped reasons: ${res.data.skippedReasons.join(", ")}`
        : "";
      toast.success(`${res.data.message}${reasons}`);
      setImportDialog(false); setImportStep("menu"); setImportFile(null);
      fetchMachines(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Import failed");
    } finally { setSubmitting(false); }
  };

  const handleExport = async () => {
    setExportDialog(false);
    toast.success("Download starting...");
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch)                                         params.search      = debouncedSearch;
      if (filters.status      && filters.status      !== "all" && filters.status      !== "") params.status      = filters.status;
      if (filters.category    && filters.category    !== "all" && filters.category    !== "") params.category    = filters.category;
      if (filters.division    && filters.division    !== "all" && filters.division    !== "") params.division    = filters.division;
      if (filters.stockStatus && filters.stockStatus !== "all" && filters.stockStatus !== "") params.stockStatus = filters.stockStatus;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/machines/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "machines.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  const toggleStatus = async (machine: Machine) => {
    const newStatus = machine.status === "Active" ? "Inactive" : "Active";
    try {
      await api.patch(`/admin/machines/${machine._id}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchMachines(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/machines/${deleteDialog._id}`);
      toast.success("Machine deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchMachines(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete machine");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<Machine>[] = [
    { key: "_id",    label: "No.",   className: "w-12",                render: (_m, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "images", label: "Image", className: "w-20",               render: (m) => m.images?.[0]
        ? <img src={m.images[0]} alt={m.name} className="h-14 w-14 object-cover rounded-md border" />
        : <div className="h-14 w-14 rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground">No img</div>,
    },
    { key: "name",        label: "Name",          className: "min-w-[180px] max-w-[220px]", render: (m) => <span className="font-medium block truncate max-w-[200px]" title={m.name}>{m.name}</span> },
    { key: "modelNumber", label: "Model Number",   className: "min-w-[140px]", render: (m) => <span className="text-sm">{m.modelNumber || "—"}</span> },
    { key: "category",   label: "Category",       className: "min-w-[140px]", render: (m) => <span className="text-sm">{m.category?.name || "—"}</span> },
    { key: "division",   label: "Division",       className: "min-w-[140px]", render: (m) => <span className="text-sm">{m.division?.name || "—"}</span> },
    { key: "currentStock",     label: "Current Stock",   className: "min-w-[130px] text-center", render: (m) => <span className="text-sm font-medium">{m.currentStock}</span> },
    {
      key: "stockStatus", label: "Stock Status", className: "min-w-[130px] text-center",
      render: (m) => (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
          m.stockStatus === "In Stock"  ? "bg-green-100 text-green-700"  :
          m.stockStatus === "Low Stock" ? "bg-yellow-100 text-yellow-700" :
                                          "bg-red-100 text-red-700"
        }`}>{m.stockStatus}</span>
      ),
    },
    { key: "lowStockThreshold", label: "Low Stock Alert", className: "min-w-[140px] text-center",
      render: (m) => m.lowStockThreshold === -1
        ? <span className="text-muted-foreground text-xs">Disabled</span>
        : <span className="text-sm font-medium">{m.lowStockThreshold}</span>,
    },
    {
      key: "status", label: "Status", className: "min-w-[130px]", render: (m) => (
        <div className="flex items-center gap-2">
          <Switch checked={m.status === "Active"} onCheckedChange={() => toggleStatus(m)} />
          <span className={m.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>{m.status}</span>
        </div>
      ),
    },
    {
      key: "source", label: "Source", className: "min-w-[110px]", render: (m) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          m.source === "imported" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
        }`}>{m.source === "imported" ? "Imported" : "Manual"}</span>
      ),
    },
    {
      key: "createdAt", label: "Created At", className: "min-w-[120px]", render: (m) => {
        const { date, time } = formatDateTime(m.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", className: "min-w-[120px]", render: (m) => {
        const { date, time } = formatDateTime(m.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", sticky: true, className: "min-w-[100px]", render: (m) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/machines/${m._id}`)} title="View">
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/machines/${m._id}/edit`)} title="Edit">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteDialog(m)} title="Delete">
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
          <PageHeader title="Machines" description="Manage machine inventory" actionLabel="Add Machine" actionIcon={Plus} onAction={() => navigate("/machines/add")}>
            <Button variant="outline" className="gap-2" onClick={() => { setImportStep("menu"); setImportFile(null); setImportDialog(true); }}><Upload className="h-4 w-4" /> Import</Button>
            <Button variant="outline" className="gap-2" onClick={() => setExportDialog(true)}><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>

          {/* Row 1: Search + Date Range + Clear */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or model number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" />
              </div>
              {(search || fromDate || toDate || Object.values(filters).some(v => v && v !== "all")) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); }} className="h-9">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: Filters right-aligned */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SearchableSelect options={categories.map(c => ({ label: c.name, value: c._id }))} value={filters.category ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, category: v }))} onSearchChange={fetchCategories} placeholder="Category" searchPlaceholder="Search categories..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={divisions.map(d => ({ label: d.name, value: d._id }))} value={filters.division ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, division: v }))} onSearchChange={fetchDivisions} placeholder="Division" searchPlaceholder="Search divisions..." className="w-[160px] h-9 text-sm" />
            <Select value={filters.stockStatus || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, stockStatus: v }))}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder="Stock Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="In Stock">In Stock</SelectItem>
                <SelectItem value="Low Stock">Low Stock</SelectItem>
                <SelectItem value="Out of Stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.status || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DataTable columns={columns} data={data} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={LIMIT}
            onPageChange={fetchMachines}
          />
        </>
      )}

      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!open) setDeleteDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Machine</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{deleteDialog?.name}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>{submitting ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialog} onOpenChange={(open) => { if (!open) { setImportDialog(false); setImportStep("menu"); setImportFile(null); } }}>
        <DialogContent>
          {importStep === "menu" && (
            <>
              <DialogHeader><DialogTitle>Import Machines</DialogTitle><DialogDescription>Download the sample file, fill in your data, then upload.</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <Button variant="outline" className="gap-2 w-full" onClick={handleDownloadSample}><Download className="h-4 w-4" /> Download Sample File</Button>
                <Button className="gap-2 w-full" onClick={() => setImportStep("confirm")}><Upload className="h-4 w-4" /> Upload File</Button>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setImportDialog(false)}>Close</Button></DialogFooter>
            </>
          )}
          {importStep === "confirm" && (
            <>
              <DialogHeader><DialogTitle>Upload Machines</DialogTitle><DialogDescription>Please confirm you have checked the sample file and your file matches the required format before uploading.</DialogDescription></DialogHeader>
              <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 mt-2">
                <span className="text-blue-600 text-sm">Import covers basic machine data only. After import, go to each machine's detail page to upload images.</span>
              </div>
              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setImportStep("menu")}>Back</Button>
                <Button onClick={() => setImportStep("upload")}>Yes, I Checked — Continue</Button>
              </DialogFooter>
            </>
          )}
          {importStep === "upload" && (
            <>
              <DialogHeader><DialogTitle>Select File</DialogTitle><DialogDescription>Select a .xlsx file to import machines.</DialogDescription></DialogHeader>
              <div className="py-4">
                <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }} />
                <div
                  role="button" tabIndex={0}
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
                  {importFile
                    ? <><p className="text-sm font-medium text-primary">{importFile.name}</p><p className="text-xs text-muted-foreground">Click or drop to replace</p></>
                    : <><p className="text-sm font-medium">{isDragging ? "Drop your file here" : "Drag & drop your .xlsx file here"}</p><p className="text-xs text-muted-foreground">or click to browse</p></>}
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

      <Dialog open={exportDialog} onOpenChange={setExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Machines</DialogTitle>
            <DialogDescription>Do you want to download all machines as an Excel file?</DialogDescription>
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

export default MachinesPage;
