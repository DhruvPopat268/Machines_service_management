import { useState, useEffect, useCallback } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Search, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

const PERMISSION_SECTIONS: { label: string; keys: string[] }[] = [
  { label: "Dashboard",               keys: ["dashboard"] },
  { label: "Company Management",      keys: ["companies"] },
  { label: "Zone Management",         keys: ["zones"] },
  { label: "Contracts Management",    keys: ["contract-types"] },
  { label: "Pages Category",          keys: ["pages-categories"] },
  { label: "Vendor Management",       keys: ["vendors"] },
  { label: "Inventory Management",    keys: ["machine-divisions", "machine-categories", "machines-add", "machines-list", "inventory-logs"] },
  { label: "Purchase Management",     keys: ["purchase-machines"] },
  { label: "Sells Management",        keys: ["sell-machines"] },
  { label: "Call Management",         keys: ["calls", "calls-raise"] },
  { label: "Travel Reimbursements",   keys: ["reimbursements"] },
  { label: "Customers Management",    keys: ["problem-types", "customers"] },
  { label: "System Users Management", keys: ["permissions", "system-users", "roles"] },
  { label: "Engineers Management",    keys: ["engineers", "engineer-performance"] },
];

interface Permission {
  _id: string;
  name: string;
  status: "Active" | "Inactive";
}

interface Role {
  _id: string;
  name: string;
  permissions: Permission[];
  status: "Active" | "Inactive";
  createdAt: string;
}

const emptyForm = { name: "", permissions: [] as string[], status: "Active" as Role["status"] };
const LIMIT = 10;

const RolesPage = () => {
  const [data, setData] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [editDialog, setEditDialog] = useState<Role | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [deleteDialog, setDeleteDialog] = useState<Role | null>(null);
  const [viewDialog, setViewDialog] = useState<Role | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const fetchAllPermissions = useCallback(async () => {
    try {
      const res = await api.get("/admin/permissions", { params: { limit: "100", status: "Active" } });
      setAllPermissions(res.data.data);
    } catch {
      toast.error("Failed to load permissions");
    }
  }, []);

  const fetchRoles = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await api.get("/admin/roles", { params });
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      toast.error("Failed to fetch roles");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => { fetchAllPermissions(); }, [fetchAllPermissions]);
  useEffect(() => { fetchRoles(1); }, [fetchRoles]);

  const togglePermission = (id: string, selected: string[], onChange: (v: string[]) => void) => {
    onChange(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);
  };

  const toggleSection = (keys: string[], selected: string[], onChange: (v: string[]) => void) => {
    const ids = keys.map((k) => allPermissions.find((p) => p.name === k)?._id).filter(Boolean) as string[];
    const allChecked = ids.every((id) => selected.includes(id));
    onChange(allChecked ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (editDialog.name !== "Support" && !editForm.name.trim()) return toast.error("Name is required");
    setSubmitting(true);
    try {
      const payload: Record<string, any> = { permissions: editForm.permissions };
      if (editDialog.name !== "Support") {
        payload.name = editForm.name;
        payload.status = editForm.status;
      }
      await api.patch(`/admin/roles/${editDialog._id}`, payload);
      toast.success("Role updated successfully");
      setEditDialog(null);
      fetchRoles(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update role");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/roles/${deleteDialog._id}`);
      toast.success("Role deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchRoles(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete role");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (r: Role) => {
    const newStatus = r.status === "Active" ? "Inactive" : "Active";
    try {
      await api.patch(`/admin/roles/${r._id}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchRoles(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const PermissionSelector = ({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) => {
    const [openSection, setOpenSection] = useState<string | null>(null);

    if (allPermissions.length === 0)
      return <p className="text-sm text-muted-foreground">No active permissions found</p>;

    const activeSection = openSection ? PERMISSION_SECTIONS.find((s) => s.label === openSection) ?? null : null;
    const activeSectionIds = activeSection
      ? (activeSection.keys.map((k) => allPermissions.find((p) => p.name === k)?._id).filter(Boolean) as string[])
      : [];
    const activeSectionAllChecked = activeSectionIds.length > 0 && activeSectionIds.every((id) => selected.includes(id));

    return (
      <div className="border rounded-md overflow-hidden">
        <div className="p-3 flex flex-wrap gap-2 max-h-36 overflow-y-auto border-b">
          {PERMISSION_SECTIONS.map((section) => {
            const ids = section.keys.map((k) => allPermissions.find((p) => p.name === k)?._id).filter(Boolean) as string[];
            if (ids.length === 0) return null;
            const selectedCount = ids.filter((id) => selected.includes(id)).length;
            const isOpen = openSection === section.label;
            return (
              <button
                key={section.label}
                type="button"
                onClick={() => setOpenSection(isOpen ? null : section.label)}
                className={cn(
                  "px-3 py-1 rounded border text-xs font-medium transition-colors whitespace-nowrap",
                  isOpen
                    ? "bg-primary text-primary-foreground border-primary"
                    : selectedCount > 0
                    ? "bg-green-50 text-green-700 border-green-400 hover:border-green-500"
                    : "bg-background text-foreground border-border hover:border-primary/60"
                )}
              >
                {section.label}{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </button>
            );
          })}
        </div>
        {activeSection && (
          <div className="bg-background">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
              <span className="text-sm font-semibold">{activeSection.label}</span>
              <Checkbox checked={activeSectionAllChecked} onCheckedChange={() => toggleSection(activeSection.keys, selected, onChange)} />
            </div>
            <div className="divide-y">
              {activeSection.keys.map((key) => {
                const perm = allPermissions.find((p) => p.name === key);
                if (!perm) return null;
                return (
                  <div key={perm._id} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-foreground">{perm.name}</span>
                    <Checkbox
                      id={`perm-${perm._id}`}
                      checked={selected.includes(perm._id)}
                      onCheckedChange={() => togglePermission(perm._id, selected, onChange)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const columns: Column<Role>[] = [
    { key: "_id", label: "No.", render: (_, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "name", label: "Role Name", render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "permissions", label: "Permissions", render: (r) => (
        <div className="flex flex-wrap gap-1 max-w-[300px]">
          {r.permissions.length === 0 ? (
            <span className="text-muted-foreground text-sm">None</span>
          ) : r.permissions.length <= 3 ? (
            r.permissions.map((p) => <Badge key={p._id} variant="secondary" className="text-xs">{p.name}</Badge>)
          ) : (
            <>
              {r.permissions.slice(0, 2).map((p) => <Badge key={p._id} variant="secondary" className="text-xs">{p.name}</Badge>)}
              <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => setViewDialog(r)}>
                +{r.permissions.length - 2} more
              </Badge>
            </>
          )}
        </div>
      ),
    },
    {
      key: "status", label: "Status", render: (r) => (
        <div className="flex items-center gap-2">
          <Switch checked={r.status === "Active"} onCheckedChange={() => toggleStatus(r)} disabled={["Admin", "Support"].includes(r.name)} />
          <span className={r.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>{r.status}</span>
        </div>
      ),
    },
    {
      key: "actions", label: "Actions", render: (r) => {
        if (r.name === "Admin") {
          return (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span className="text-xs">Locked</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
              setEditDialog(r);
              setEditForm({ name: r.name, permissions: r.permissions.map((p) => p._id), status: r.status });
            }}>
              <Edit className="h-4 w-4" />
            </Button>
            {r.name !== "Support" && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteDialog(r)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="System Users Roles" description="Manage roles and their assigned permissions" />

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by role name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {(search || statusFilter !== "all") && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }} className="h-9">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>

          <DataTable columns={columns} data={data} />
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={LIMIT} onPageChange={fetchRoles} />
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="max-h-[90vh] flex flex-col w-full max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Role — {editDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
            {editDialog?.name !== "Support" && (
              <>
                <div className="space-y-2">
                  <Label>Name <span className="text-destructive">*</span></Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm(p => ({ ...p, status: v as Role["status"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Permissions</Label>
              <PermissionSelector
                selected={editForm.permissions}
                onChange={(ids) => setEditForm(p => ({ ...p, permissions: ids }))}
              />
              <p className="text-xs text-muted-foreground">{editForm.permissions.length} permission(s) selected</p>
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>Are you sure you want to delete <span className="font-semibold text-foreground">{deleteDialog?.name}</span>? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>{submitting ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View All Permissions Dialog */}
      <Dialog open={!!viewDialog} onOpenChange={(open) => !open && setViewDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{viewDialog?.name} — Permissions</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2 py-4">
            {viewDialog?.permissions.map((p) => (
              <Badge key={p._id} variant="secondary">{p.name}</Badge>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RolesPage;
