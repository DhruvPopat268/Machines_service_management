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
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

interface IncentiveCategory {
  _id: string;
  name: string;
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

const emptyForm = { name: "", status: "Active" as IncentiveCategory["status"] };
const LIMIT = 10;

const IncentiveCategoriesPage = () => {
  const [data, setData] = useState<IncentiveCategory[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  const [editDialog, setEditDialog] = useState<IncentiveCategory | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [deleteDialog, setDeleteDialog] = useState<IncentiveCategory | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchCategories = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.status && filters.status !== "all") params.status = filters.status;

      const res = await api.get("/admin/incentives", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total: res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        toast.error("Failed to fetch incentive categories");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters]);

  useEffect(() => { fetchCategories(1); }, [fetchCategories]);

  const handleAdd = async () => {
    if (!addForm.name) return toast.error("Name is required");
    setSubmitting(true);
    try {
      await api.post("/admin/incentives", addForm);
      toast.success("Incentive category added successfully");
      setAddDialog(false);
      setAddForm(emptyForm);
      fetchCategories(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add incentive category");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (!editForm.name) return toast.error("Name is required");
    setSubmitting(true);
    try {
      await api.patch(`/admin/incentives/${editDialog._id}`, editForm);
      toast.success("Incentive category updated successfully");
      setEditDialog(null);
      fetchCategories(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update incentive category");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/incentives/${deleteDialog._id}`);
      toast.success("Incentive category deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchCategories(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete incentive category");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (cat: IncentiveCategory) => {
    const newStatus = cat.status === "Active" ? "Inactive" : "Active";
    try {
      await api.patch(`/admin/incentives/${cat._id}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchCategories(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const columns: Column<IncentiveCategory>[] = [
    { key: "_id", label: "No.", render: (_c, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "name", label: "Category Name", render: (c) => <span className="font-medium">{c.name}</span> },
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
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${c.name}`} onClick={() => { setEditDialog(c); setEditForm({ name: c.name, status: c.status }); }}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete ${c.name}`} onClick={() => setDeleteDialog(c)}>
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
            title="Incentive Categories"
            description="Manage incentive categories for classifying incentives"
            actionLabel="Add Category"
            actionIcon={Plus}
            onAction={() => { setAddForm(emptyForm); setAddDialog(true); }}
          />
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by category name..."
            filters={[{ key: "status", label: "Status", options: [{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }] }]}
            filterValues={filters}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
            onClear={() => { setSearch(""); setFilters({}); }}
          />
          <DataTable columns={columns} data={data} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={LIMIT}
            onPageChange={fetchCategories}
          />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={(open) => { if (!open) { setAddDialog(false); setAddForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Incentive Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-inc-name">Category Name</Label>
              <Input id="add-inc-name" placeholder="e.g. Performance Bonus" value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-inc-status">Status</Label>
              <Select value={addForm.status} onValueChange={(v) => setAddForm((p) => ({ ...p, status: v as IncentiveCategory["status"] }))}>
                <SelectTrigger id="add-inc-status"><SelectValue /></SelectTrigger>
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
          <DialogHeader><DialogTitle>Edit Incentive Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-inc-name">Category Name</Label>
              <Input id="edit-inc-name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-inc-status">Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v as IncentiveCategory["status"] }))}>
                <SelectTrigger id="edit-inc-status"><SelectValue /></SelectTrigger>
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
      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!open) setDeleteDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Incentive Category</DialogTitle>
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
    </div>
  );
};

export default IncentiveCategoriesPage;
