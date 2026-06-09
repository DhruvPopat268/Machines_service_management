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

interface Company {
  _id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  gstNumber?: string;
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

const emptyForm = { name: "", address: "", phone: "", email: "", gstNumber: "", status: "Active" as Company["status"] };
const LIMIT = 10;

const CompaniesPage = () => {
  const [data, setData] = useState<Company[]>([]);
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

  const [editDialog, setEditDialog] = useState<Company | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [deleteDialog, setDeleteDialog] = useState<Company | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchCompanies = useCallback(async (page = 1) => {
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
      const res = await api.get("/admin/companies", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total: res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") toast.error("Failed to fetch companies");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters, fromDate, toDate]);

  useEffect(() => { fetchCompanies(1); }, [fetchCompanies]);

  const handleAdd = async () => {
    if (!addForm.name || !addForm.address || !addForm.phone || !addForm.email || !addForm.gstNumber)
      return toast.error("All fields are required");
    setSubmitting(true);
    try {
      await api.post("/admin/companies", addForm);
      toast.success("Company added successfully");
      setAddDialog(false);
      setAddForm(emptyForm);
      fetchCompanies(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add company");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (!editForm.name || !editForm.address || !editForm.phone || !editForm.email)
      return toast.error("All fields are required");
    setSubmitting(true);
    try {
      await api.patch(`/admin/companies/${editDialog._id}`, editForm);
      toast.success("Company updated successfully");
      setEditDialog(null);
      fetchCompanies(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update company");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/companies/${deleteDialog._id}`);
      toast.success("Company deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchCompanies(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete company");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (company: Company) => {
    const newStatus = company.status === "Active" ? "Inactive" : "Active";
    try {
      await api.patch(`/admin/companies/${company._id}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchCompanies(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const columns: Column<Company>[] = [
    { key: "_id",     label: "No.",     render: (_c, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "name",      label: "Name",       render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "email",     label: "Email",      render: (c) => <span className="text-sm">{c.email}</span> },
    { key: "phone",     label: "Phone",      render: (c) => <span className="text-sm">{c.phone}</span> },
    { key: "address",   label: "Address",    render: (c) => <span className="text-sm">{c.address}</span> },
    { key: "gstNumber", label: "GST Number", render: (c) => <span className="text-sm font-mono">{c.gstNumber || "—"}</span> },
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
      key: "actions", label: "Actions", render: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditDialog(c); setEditForm({ name: c.name, address: c.address, phone: c.phone, email: c.email, gstNumber: c.gstNumber || "", status: c.status }); }}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteDialog(c)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const formFields = (form: typeof emptyForm, setForm: (fn: (p: typeof emptyForm) => typeof emptyForm) => void, prefix: string) => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-name`}>Company Name</Label>
        <Input id={`${prefix}-name`} placeholder="e.g. Acme Corp" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-address`}>Address</Label>
        <Input id={`${prefix}-address`} placeholder="e.g. 123 Main St, City" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-phone`}>Phone</Label>
        <Input id={`${prefix}-phone`} placeholder="e.g. 9876543210" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-email`}>Email</Label>
        <Input id={`${prefix}-email`} type="email" placeholder="e.g. info@company.com" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-gstNumber`}>GST Number</Label>
        <Input id={`${prefix}-gstNumber`} placeholder="e.g. 27AABCG1234A1Z5" value={form.gstNumber} onChange={(e) => setForm((p) => ({ ...p, gstNumber: e.target.value.toUpperCase() }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-status`}>Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as Company["status"] }))}>
          <SelectTrigger id={`${prefix}-status`}><SelectValue /></SelectTrigger>
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
          <PageHeader
            title="Company Management"
            description="Manage companies in the system"
            actionLabel="Add Company"
            actionIcon={Plus}
            onAction={() => { setAddForm(emptyForm); setAddDialog(true); }}
          />
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name, email or phone..."
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
            onPageChange={fetchCompanies}
          />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Company</DialogTitle></DialogHeader>
          {formFields(addForm, setAddForm, "add")}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>{submitting ? "Adding..." : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Company</DialogTitle></DialogHeader>
          {formFields(editForm, setEditForm, "edit")}
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
            <DialogTitle>Delete Company</DialogTitle>
            <DialogDescription>Are you sure you want to delete <span className="font-semibold text-foreground">{deleteDialog?.name}</span>? This action cannot be undone.</DialogDescription>
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

export default CompaniesPage;
