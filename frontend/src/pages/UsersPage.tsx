import { useState, useEffect, useRef, useCallback } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserPlus, Edit, Trash2, Search, X, Eye, EyeOff, KeyRound, UserCircle } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

interface SystemUser {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: "Admin" | "Engineer" | "Support";
  status: "Active" | "Inactive";
  profilePhoto?: string;
  address?: string;
  engineerId?: string;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const ROLES = ["Admin", "Engineer", "Support"];
const LIMIT = 10;

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const emptyForm = { name: "", email: "", phone: "", password: "", role: "" as SystemUser["role"] | "", status: "Active" as SystemUser["status"], address: "", profilePhoto: null as File | null };

// ─── Reset Password Popup ─────────────────────────────────────────────────────
const ResetPasswordPopup = ({ open, onClose, userId, userEmail }: { open: boolean; onClose: () => void; userId: string; userEmail: string }) => {
  const [otp, setOtp]                         = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [otpSent, setOtpSent]                 = useState(false);
  const [sending, setSending]                 = useState(false);

  const handleClose = () => {
    setOtp(""); setNewPassword(""); setConfirmPassword("");
    setShowNew(false); setShowConfirm(false);
    setOtpSent(false);
    onClose();
  };

  const handleSendOtp = async () => {
    setSending(true);
    try {
      await api.post(`/admin/system-users/${userId}/send-reset-otp`);
      toast.success("OTP sent to user's email");
      setOtpSent(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to send OTP");
    } finally {
      setSending(false);
    }
  };

  const handleReset = async () => {
    if (!otp.trim()) return toast.error("Please enter the OTP");
    if (!newPassword || newPassword.length < 6) return toast.error("Password must be at least 6 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");
    setSubmitting(true);
    try {
      await api.patch(`/admin/system-users/${userId}/reset-password`, { otp: otp.trim(), password: newPassword });
      toast.success("Password reset successfully");
      handleClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Reset Password</DialogTitle>
          <DialogDescription>
            {otpSent
              ? `OTP sent to ${userEmail}. Enter it below along with the new password.`
              : `Click "Send OTP" to send a verification code to ${userEmail}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Verification Code <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Input placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value)} disabled={!otpSent} />
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleSendOtp} disabled={sending}>
                {sending ? "Sending..." : otpSent ? "Resend" : "Send OTP"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>New Password <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Input type={showNew ? "text" : "password"} placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={!otpSent} />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setShowNew(p => !p)} disabled={!otpSent}>
                {showNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Confirm Password <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Input type={showConfirm ? "text" : "password"} placeholder="Re-enter new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={!otpSent} />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setShowConfirm(p => !p)} disabled={!otpSent}>
                {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleReset} disabled={submitting || !otpSent}>{submitting ? "Resetting..." : "Reset Password"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const UsersPage = () => {
  const [data, setData]                       = useState<SystemUser[]>([]);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters]                 = useState<Record<string, string>>({});
  const [loading, setLoading]                 = useState(true);
  const [submitting, setSubmitting]           = useState(false);
  const [pagination, setPagination]           = useState({ page: 1, totalPages: 1, total: 0 });

  const [addDialog, setAddDialog]             = useState(false);
  const [addForm, setAddForm]                 = useState(emptyForm);
  const [showAddPassword, setShowAddPassword] = useState(false);
  const addPhotoRef                           = useRef<HTMLInputElement>(null);

  const [editDialog, setEditDialog]           = useState<SystemUser | null>(null);
  const [editForm, setEditForm]               = useState({ name: "", email: "", phone: "", role: "" as SystemUser["role"] | "", status: "Active" as SystemUser["status"], address: "", profilePhoto: null as File | null });
  const [resetPopup, setResetPopup]           = useState(false);
  const editPhotoRef                          = useRef<HTMLInputElement>(null);

  const [deleteDialog, setDeleteDialog]       = useState<SystemUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchUsers = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (debouncedSearch)                                       params.search = debouncedSearch;
      if (filters.role   && filters.role   !== "all")           params.role   = filters.role;
      if (filters.status && filters.status !== "all")           params.status = filters.status;
      const res = await api.get("/admin/system-users", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages, total: res.data.pagination.total });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch users");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters]);

  useEffect(() => { fetchUsers(1); }, [fetchUsers]);

  const handleAdd = async () => {
    if (!addForm.name || !addForm.email || !addForm.password || !addForm.role)
      return toast.error("Name, email, password and role are required");
    setSubmitting(true);
    try {
      let payload: any = addForm;
      if (addForm.role === "Engineer" && addForm.profilePhoto) {
        const fd = new FormData();
        fd.append("name", addForm.name);
        fd.append("email", addForm.email);
        fd.append("phone", addForm.phone);
        fd.append("password", addForm.password);
        fd.append("role", addForm.role);
        fd.append("status", addForm.status);
        if (addForm.address) fd.append("address", addForm.address);
        fd.append("profilePhoto", addForm.profilePhoto);
        payload = fd;
      }
      await api.post("/admin/system-users", payload);
      toast.success("User added successfully");
      setAddDialog(false);
      setAddForm(emptyForm);
      fetchUsers(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    setSubmitting(true);
    try {
      let payload: any;
      if (editForm.profilePhoto) {
        const fd = new FormData();
        fd.append("name", editForm.name);
        fd.append("email", editForm.email);
        fd.append("phone", editForm.phone);
        fd.append("role", editForm.role);
        fd.append("status", editForm.status);
        if (editForm.address) fd.append("address", editForm.address);
        fd.append("profilePhoto", editForm.profilePhoto);
        payload = fd;
      } else {
        const { profilePhoto: _p, ...rest } = editForm;
        payload = rest;
      }
      await api.patch(`/admin/system-users/${editDialog._id}`, payload);
      toast.success("User updated successfully");
      setEditDialog(null);
      fetchUsers(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (user: SystemUser) => {
    const newStatus = user.status === "Active" ? "Inactive" : "Active";
    try {
      await api.patch(`/admin/system-users/${user._id}`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchUsers(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      await api.delete(`/admin/system-users/${deleteDialog._id}`);
      toast.success("User deleted successfully");
      setDeleteDialog(null);
      const newPage = data.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchUsers(newPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete user");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<SystemUser>[] = [
    { key: "_id",   label: "No.",   render: (_u, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    {
      key: "profilePhoto", label: "Photo", render: (u) => u.role === "Engineer"
        ? u.profilePhoto
          ? <img src={u.profilePhoto} alt={u.name} className="h-8 w-8 rounded-full object-cover" />
          : <UserCircle className="h-8 w-8 text-muted-foreground" />
        : <span className="text-muted-foreground text-sm">—</span>,
    },
    { key: "name",  label: "Name",  render: (u) => <span className="font-medium">{u.name || "—"}</span> },
    { key: "email", label: "Email", render: (u) => <span className="text-sm">{u.email}</span> },
    { key: "phone", label: "Phone", render: (u) => <span className="text-sm">{u.phone || "—"}</span> },
    { key: "role",  label: "Role",  render: (u) => <StatusBadge status={u.role} /> },
    { key: "engineerId", label: "Engineer ID", render: (u) => u.role === "Engineer" ? <span className="text-sm font-medium">{u.engineerId || "—"}</span> : <span className="text-muted-foreground text-sm">—</span> },
    { key: "address", label: "Address", render: (u) => u.role === "Engineer" ? <span className="text-sm">{u.address || "—"}</span> : <span className="text-muted-foreground text-sm">—</span> },
    {
      key: "status", label: "Status", render: (u) => (
        <div className="flex items-center gap-2">
          <Switch checked={u.status === "Active"} onCheckedChange={() => toggleStatus(u)} />
          <span className={u.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>{u.status}</span>
        </div>
      ),
    },
    {
      key: "lastLoginAt", label: "Last Login", render: (u) => u.lastLoginAt
        ? (() => { const { date, time } = formatDateTime(u.lastLoginAt!); return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>; })()
        : <span className="text-muted-foreground text-sm">Never</span>,
    },
    {
      key: "lastActivityAt", label: "Last Activity", render: (u) => u.lastActivityAt
        ? (() => { const { date, time } = formatDateTime(u.lastActivityAt!); return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>; })()
        : <span className="text-muted-foreground text-sm">Never</span>,
    },
    {
      key: "createdAt", label: "Created At", className: "w-[150px]", render: (u) => {
        const { date, time } = formatDateTime(u.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", sticky: true, render: (u) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => { setEditDialog(u); setEditForm({ name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, address: u.address ?? "", profilePhoto: null }); setResetPopup(false); }}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete" onClick={() => setDeleteDialog(u)}>
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
          <PageHeader title="System Users" description="Manage system users and their roles" actionLabel="Add User" actionIcon={UserPlus} onAction={() => { setAddForm(emptyForm); setShowAddPassword(false); setAddDialog(true); }} />

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, email, phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-3">
              <Select value={filters.role || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, role: v }))}>
                <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
                <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {(search || Object.values(filters).some(v => v && v !== "all")) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilters({}); }} className="h-9">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>

          <DataTable columns={columns} data={data} />
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={LIMIT} onPageChange={fetchUsers} />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add System User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Full name" value={addForm.name} onChange={(e) => setAddForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" placeholder="user@example.com" value={addForm.email} onChange={(e) => setAddForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input placeholder="e.g. 9800000000" value={addForm.phone} onChange={(e) => setAddForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Password <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input type={showAddPassword ? "text" : "password"} placeholder="Min 6 characters" value={addForm.password} onChange={(e) => setAddForm(p => ({ ...p, password: e.target.value }))} />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setShowAddPassword(p => !p)}>
                  {showAddPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role <span className="text-destructive">*</span></Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm(p => ({ ...p, role: v as SystemUser["role"], address: "", profilePhoto: null }))}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Engineer">Engineer</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Support" disabled>Support</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addForm.role === "Engineer" && (
              <>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input placeholder="Engineer's address" value={addForm.address} onChange={(e) => setAddForm(p => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Profile Photo</Label>
                  <div className="flex items-center gap-2">
                    <input ref={addPhotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => setAddForm(p => ({ ...p, profilePhoto: e.target.files?.[0] ?? null }))} />
                    <Button type="button" variant="outline" size="sm" onClick={() => addPhotoRef.current?.click()}>
                      {addForm.profilePhoto ? "Change Photo" : "Upload Photo"}
                    </Button>
                    {addForm.profilePhoto && (
                      <>
                        <span className="text-sm text-muted-foreground truncate max-w-[160px]">{addForm.profilePhoto.name}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setAddForm(p => ({ ...p, profilePhoto: null })); if (addPhotoRef.current) addPhotoRef.current.value = ""; }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={addForm.status} onValueChange={(v) => setAddForm(p => ({ ...p, status: v as SystemUser["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>{submitting ? "Adding..." : "Add User"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => { if (!open) { setEditDialog(null); setResetPopup(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))} />
            </div>

            {/* Password row — disabled display + Reset button */}
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="flex items-center gap-2">
                <Input disabled value="••••••••" className="flex-1 text-muted-foreground tracking-widest" />
                <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setResetPopup(true)}>
                  <KeyRound className="h-3.5 w-3.5" /> Reset
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm(p => ({ ...p, role: v as SystemUser["role"], address: "", profilePhoto: null }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} disabled={r !== "Engineer"}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {editForm.role === "Engineer" && (
              <>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input placeholder="Engineer's address" value={editForm.address} onChange={(e) => setEditForm(p => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Profile Photo</Label>
                  <div className="flex items-center gap-2">
                    {editDialog?.profilePhoto && !editForm.profilePhoto && (
                      <img src={editDialog.profilePhoto} alt="current" className="h-8 w-8 rounded-full object-cover shrink-0" />
                    )}
                    <input ref={editPhotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => setEditForm(p => ({ ...p, profilePhoto: e.target.files?.[0] ?? null }))} />
                    <Button type="button" variant="outline" size="sm" onClick={() => editPhotoRef.current?.click()}>
                      {editDialog?.profilePhoto || editForm.profilePhoto ? "Change Photo" : "Upload Photo"}
                    </Button>
                    {editForm.profilePhoto && (
                      <>
                        <span className="text-sm text-muted-foreground truncate max-w-[160px]">{editForm.profilePhoto.name}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditForm(p => ({ ...p, profilePhoto: null })); if (editPhotoRef.current) editPhotoRef.current.value = ""; }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm(p => ({ ...p, status: v as SystemUser["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialog(null); setResetPopup(false); }}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Popup — nested over edit dialog */}
      {editDialog && (
        <ResetPasswordPopup
          open={resetPopup}
          onClose={() => setResetPopup(false)}
          userId={editDialog._id}
          userEmail={editDialog.email}
        />
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>Are you sure you want to delete <span className="font-semibold text-foreground">{deleteDialog?.name || deleteDialog?.email}</span>? This action cannot be undone.</DialogDescription>
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

export default UsersPage;
