import { useState, useEffect, useRef, useCallback } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Search, X, Upload, Download, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

interface IncentiveCategory {
  _id: string;
  name: string;
}

interface Incentive {
  _id: string;
  category: { categoryId: string; name: string };
  description: string;
  date: string;
  amount: number;
  method: "Cash" | "Online";
  createdAt: string;
  updatedAt: string;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const toInputDate = (iso: string) => new Date(iso).toISOString().split("T")[0];

const emptyForm = { categoryId: "", description: "", date: "", amount: "", method: "Cash" as "Cash" | "Online" };

const AddIncentivePage = () => {
  const [data, setData]               = useState<Incentive[]>([]);
  const [totalIncentive, setTotalIncentive] = useState(0);
  const [categories, setCategories]   = useState<IncentiveCategory[]>([]);
  // applied filters — only updated on Apply click
  const [appliedSearch, setAppliedSearch]       = useState("");
  const [appliedCategory, setAppliedCategory]   = useState("");
  const [appliedMethod, setAppliedMethod]       = useState("");
  const [appliedFromDate, setAppliedFromDate]   = useState("");
  const [appliedToDate, setAppliedToDate]       = useState("");
  // pending (uncommitted) filter state
  const [pendingSearch, setPendingSearch]       = useState("");
  const [pendingCategory, setPendingCategory]   = useState("");
  const [pendingMethod, setPendingMethod]       = useState("");
  const [pendingFromDate, setPendingFromDate]   = useState<Date | undefined>(undefined);
  const [pendingToDate, setPendingToDate]       = useState<Date | undefined>(undefined);
  const [limit, setLimit]                       = useState(10);
  const [loading, setLoading]                   = useState(true);
  const [submitting, setSubmitting]             = useState(false);
  const [pagination, setPagination]             = useState({ page: 1, totalPages: 1, total: 0 });

  const [addDialog, setAddDialog]     = useState(false);
  const [addForm, setAddForm]         = useState(emptyForm);

  const [editDialog, setEditDialog]   = useState<Incentive | null>(null);
  const [editForm, setEditForm]       = useState(emptyForm);

  const [deleteDialog, setDeleteDialog] = useState<Incentive | null>(null);

  // quick-create category
  const [quickCatDialog, setQuickCatDialog] = useState<"add" | "edit" | null>(null);
  const [quickCatName, setQuickCatName]     = useState("");
  const [quickCatSubmitting, setQuickCatSubmitting] = useState(false);

  // import / export
  const [importDialog, setImportDialog]   = useState(false);
  const [importStep, setImportStep]       = useState<"menu" | "confirm" | "upload">("menu");
  const [importFile, setImportFile]       = useState<File | null>(null);
  const [isDragging, setIsDragging]       = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);
  const [exportDialog, setExportDialog]   = useState(false);

  useEffect(() => {
    api.get("/admin/incentives", { params: { limit: "200", status: "Active" } })
      .then((res) => setCategories(res.data.data))
      .catch(() => {});
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const fetchIncentives = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (appliedSearch)   params.search     = appliedSearch;
      if (appliedCategory) params.categoryId = appliedCategory;
      if (appliedMethod)   params.method     = appliedMethod;
      if (appliedFromDate) params.fromDate   = appliedFromDate;
      if (appliedToDate)   params.toDate     = appliedToDate;

      const res = await api.get("/admin/add-incentives", { params, signal: controller.signal });
      setData(res.data.data.incentives);
      setTotalIncentive(res.data.data.stats.totalIncentive ?? 0);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total: res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch incentives");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [appliedSearch, appliedCategory, appliedMethod, appliedFromDate, appliedToDate, limit]);

  useEffect(() => { fetchIncentives(1); }, [fetchIncentives]);

  const handleAdd = async () => {
    if (!addForm.categoryId) return toast.error("Category is required");
    if (!addForm.date)        return toast.error("Date is required");
    if (!addForm.amount)      return toast.error("Amount is required");
    setSubmitting(true);
    try {
      await api.post("/admin/add-incentives", {
        categoryId:  addForm.categoryId,
        description: addForm.description,
        date:        addForm.date,
        amount:      Number(addForm.amount),
        method:      addForm.method,
      });
      toast.success("Incentive added successfully");
      setAddDialog(false);
      setAddForm(emptyForm);
      fetchIncentives(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add incentive");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (!editForm.categoryId) return toast.error("Category is required");
    if (!editForm.date)        return toast.error("Date is required");
    if (!editForm.amount)      return toast.error("Amount is required");
    setSubmitting(true);
    try {
      await api.patch(`/admin/add-incentives/${editDialog._id}`, {
        categoryId:  editForm.categoryId,
        description: editForm.description,
        date:        editForm.date,
        amount:      Number(editForm.amount),
        method:      editForm.method,
      });
      toast.success("Incentive updated successfully");
      setEditDialog(null);
      fetchIncentives(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update incentive");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/add-incentives/${deleteDialog._id}`);
      toast.success("Incentive deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchIncentives(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete incentive");
    } finally {
      setSubmitting(false);
    }
  };

  const hasPending = !!(pendingSearch || pendingCategory || pendingMethod || pendingFromDate || pendingToDate);

  const handleApply = () => {
    setAppliedSearch(pendingSearch);
    setAppliedCategory(pendingCategory);
    setAppliedMethod(pendingMethod);
    setAppliedFromDate(pendingFromDate ? format(pendingFromDate, "yyyy-MM-dd") : "");
    setAppliedToDate(pendingToDate ? format(pendingToDate, "yyyy-MM-dd") : "");
  };

  const handleClear = () => {
    setPendingSearch(""); setPendingCategory(""); setPendingMethod(""); setPendingFromDate(undefined); setPendingToDate(undefined);
    setAppliedSearch(""); setAppliedCategory(""); setAppliedMethod(""); setAppliedFromDate(""); setAppliedToDate("");
  };

  const columns: Column<Incentive>[] = [
    { key: "_id",      label: "No.",      render: (_, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * limit + i + 1}</span> },
    { key: "category", label: "Category", render: (e) => <span className="font-medium">{e.category?.name ?? "—"}</span> },
    { key: "description", label: "Description", render: (e) => <span className="max-w-[300px] truncate block font-medium">{e.description || "—"}</span> },
    { key: "date",     label: "Date",     render: (e) => <span>{e.date ? formatDate(e.date) : "—"}</span> },
    { key: "amount",   label: "Amount",   render: (e) => <span className="font-semibold">₹{(e.amount ?? 0).toLocaleString("en-IN")}</span> },
    { key: "method",   label: "Method",   render: (e) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        e.method === "Online" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
      }`}>{e.method ?? "—"}</span>
    )},
    {
      key: "createdAt", label: "Created At", render: (e) => {
        const { date, time } = formatDateTime(e.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (e) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
            setEditDialog(e);
            setEditForm({ categoryId: e.category?.categoryId ?? "", description: e.description ?? "", date: e.date ? toInputDate(e.date) : "", amount: String(e.amount ?? ""), method: e.method ?? "Cash" });
          }}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteDialog(e)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

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
      const res = await api.get("/admin/add-incentives/sample", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "incentives_sample.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download sample file");
    }
  };

  const handleImportUpload = async () => {
    if (!importFile) return toast.error("Please select a file");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await api.post("/admin/add-incentives/import", form, { headers: { "Content-Type": "multipart/form-data" } });
      const skipped = res.data.skippedReasons?.length
        ? `\nSkipped reasons:\n${res.data.skippedReasons.map((r: string) => `• ${r}`).join("\n")}`
        : "";
      toast.success(`${res.data.message}${skipped}`, { duration: skipped ? 8000 : 4000 });
      setImportDialog(false); setImportStep("menu"); setImportFile(null);
      fetchIncentives(1);
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
      if (appliedSearch)   params.search     = appliedSearch;
      if (appliedCategory) params.categoryId = appliedCategory;
      if (appliedMethod)   params.method     = appliedMethod;
      if (appliedFromDate) params.fromDate   = appliedFromDate;
      if (appliedToDate)   params.toDate     = appliedToDate;
      const res = await api.get("/admin/add-incentives/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "incentives.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const handleQuickAddCategory = async (targetForm: "add" | "edit") => {
    if (!quickCatName.trim()) return toast.error("Category name is required");
    setQuickCatSubmitting(true);
    try {
      const res = await api.post("/admin/incentives", { name: quickCatName.trim(), status: "Active" });
      const newCat: IncentiveCategory = res.data.data;
      setCategories((prev) => [...prev, newCat]);
      if (targetForm === "add") setAddForm((p) => ({ ...p, categoryId: newCat._id }));
      else setEditForm((p) => ({ ...p, categoryId: newCat._id }));
      toast.success("Category created");
      setQuickCatDialog(null);
      setQuickCatName("");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create category");
    } finally {
      setQuickCatSubmitting(false);
    }
  };

  const CategorySelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
      <SelectContent>
        {categories.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader
            title="Incentives"
            description="Manage and track all incentives"
            actionLabel="Add Incentive"
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

          {/* Filters */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by description..." value={pendingSearch} onChange={(e) => setPendingSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="flex items-center gap-3">
                <Select value={pendingCategory || "all"} onValueChange={(v) => setPendingCategory(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={pendingMethod || "all"} onValueChange={(v) => setPendingMethod(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Methods" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-36 h-9 text-sm font-normal justify-start gap-2 text-foreground">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        {pendingFromDate ? format(pendingFromDate, "dd/MM/yyyy") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar mode="single" selected={pendingFromDate} onSelect={setPendingFromDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-36 h-9 text-sm font-normal justify-start gap-2 text-foreground">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        {pendingToDate ? format(pendingToDate, "dd/MM/yyyy") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar mode="single" selected={pendingToDate} onSelect={setPendingToDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                {hasPending && (
                  <>
                    <Button variant="outline" size="sm" className="h-9" onClick={handleClear}><X className="h-4 w-4 mr-1" />Clear</Button>
                    <Button size="sm" className="h-9" onClick={handleApply}>Apply Filters</Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Records per page left, total incentive right */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Records per page</Label>
              <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); fetchIncentives(1); }}>
                <SelectTrigger className="w-[80px] h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Incentive</p>
              <p className="text-xl font-bold text-green-600">₹{totalIncentive.toLocaleString("en-IN")}</p>
            </div>
          </div>

          <DataTable columns={columns} data={data} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={limit}
            onPageChange={fetchIncentives}
          />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={(open) => { if (!open) { setAddDialog(false); setAddForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Incentive</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Category</Label>
                <button type="button" onClick={() => { setQuickCatDialog("add"); setQuickCatName(""); }} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />New</button>
              </div>
              <CategorySelect value={addForm.categoryId} onChange={(v) => setAddForm((p) => ({ ...p, categoryId: v }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Optional description" value={addForm.description} onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={addForm.date} onChange={(e) => setAddForm((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input type="number" min="0" placeholder="0.00" value={addForm.amount} onChange={(e) => setAddForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={addForm.method} onValueChange={(v) => setAddForm((p) => ({ ...p, method: v as "Cash" | "Online" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
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
          <DialogHeader><DialogTitle>Edit Incentive</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Category</Label>
                <button type="button" onClick={() => { setQuickCatDialog("edit"); setQuickCatName(""); }} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />New</button>
              </div>
              <CategorySelect value={editForm.categoryId} onChange={(v) => setEditForm((p) => ({ ...p, categoryId: v }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={editForm.date} onChange={(e) => setEditForm((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input type="number" min="0" value={editForm.amount} onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={editForm.method} onValueChange={(v) => setEditForm((p) => ({ ...p, method: v as "Cash" | "Online" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
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

      {/* Quick Add Category Dialog */}
      <Dialog open={!!quickCatDialog} onOpenChange={(open) => { if (!open) { setQuickCatDialog(null); setQuickCatName(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Incentive Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input placeholder="e.g. Performance Bonus" value={quickCatName} onChange={(e) => setQuickCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && quickCatDialog && handleQuickAddCategory(quickCatDialog)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setQuickCatDialog(null); setQuickCatName(""); }}>Cancel</Button>
            <Button onClick={() => quickCatDialog && handleQuickAddCategory(quickCatDialog)} disabled={quickCatSubmitting}>{quickCatSubmitting ? "Adding..." : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!open) setDeleteDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Incentive</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this incentive of <span className="font-semibold text-foreground">₹{deleteDialog?.amount.toLocaleString("en-IN")}</span>? This action cannot be undone.
            </DialogDescription>
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
              <DialogHeader><DialogTitle>Import Incentives</DialogTitle><DialogDescription>Download the sample file, fill in your data, then upload.</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <Button variant="outline" className="gap-2 w-full" onClick={handleDownloadSample}><Download className="h-4 w-4" /> Download Sample File</Button>
                <Button className="gap-2 w-full" onClick={() => setImportStep("confirm")}><Upload className="h-4 w-4" /> Upload File</Button>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setImportDialog(false)}>Close</Button></DialogFooter>
            </>
          )}
          {importStep === "confirm" && (
            <>
              <DialogHeader><DialogTitle>Upload Incentives</DialogTitle><DialogDescription>Please confirm you have checked the sample file and your file matches the required format before uploading.</DialogDescription></DialogHeader>
              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setImportStep("menu")}>Back</Button>
                <Button onClick={() => setImportStep("upload")}>Yes, I Checked — Continue</Button>
              </DialogFooter>
            </>
          )}
          {importStep === "upload" && (
            <>
              <DialogHeader><DialogTitle>Select File</DialogTitle><DialogDescription>Select a .xlsx file to import incentives.</DialogDescription></DialogHeader>
              <div className="py-4">
                <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }} />
                <div
                  role="button" tabIndex={0} aria-label="Upload .xlsx file"
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
            <DialogTitle>Export Incentives</DialogTitle>
            <DialogDescription>Do you want to download the current filtered incentives as an Excel file?</DialogDescription>
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

export default AddIncentivePage;
