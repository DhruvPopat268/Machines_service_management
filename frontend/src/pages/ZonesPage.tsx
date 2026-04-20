import { useState, useEffect } from "react";
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
import api from "@/lib/axiosInterceptor";

interface Zone {
  _id: string;
  name: string;
  code: string;
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

const emptyForm = { name: "", code: "", description: "", status: "Active" as Zone["status"] };

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
    { key: "description", label: "Description", render: (z) => <span className="max-w-[400px] truncate block">{z.description}</span> },
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
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${z.name}`} onClick={() => { setEditDialog(z); setEditForm({ name: z.name, code: z.code, description: z.description, status: z.status }); }}>
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
            <Button variant="outline" className="gap-2" disabled><Upload className="h-4 w-4" /> Import</Button>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
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
            <div className="space-y-2"><Label htmlFor="add-zone-description">Description</Label><Textarea id="add-zone-description" placeholder="Regions or areas covered by this zone" value={addForm.description} onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))} /></div>
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
            <div className="space-y-2"><Label htmlFor="edit-zone-description">Description</Label><Textarea id="edit-zone-description" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} /></div>
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
    </div>
  );
};

export default ZonesPage;
