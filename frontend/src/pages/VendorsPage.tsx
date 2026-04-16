import { useState, useEffect } from "react";
import { vendors as initialData } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Upload, Download, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Vendor } from "@/data/dummyData";
import Spinner from "@/components/Spinner";
import { useNavigate } from "react-router-dom";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const emptyForm = { name: "", companyName: "", phone: "", email: "", address: "", gstNumber: "", status: "Active" as Vendor["status"] };

const VendorsPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<Vendor[]>(initialData);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState<Vendor | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (editDialog) {
      setEditForm({
        name: editDialog.name,
        companyName: editDialog.companyName,
        phone: editDialog.phone,
        email: editDialog.email,
        address: editDialog.address,
        gstNumber: editDialog.gstNumber,
        status: editDialog.status,
      });
    }
  }, [editDialog]);

  const toggleStatus = (id: string) => {
    setData((prev) => prev.map((v) => v.id === id ? { ...v, status: v.status === "Active" ? "Inactive" : "Active", updatedAt: new Date().toISOString() } : v));
    toast({ title: "Status updated" });
  };

  const handleAdd = () => {
    if (!form.name || !form.companyName || !form.phone || !form.email) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    const now = new Date().toISOString();
    const newVendor: Vendor = {
      id: `VN-${String(data.length + 1).padStart(3, "0")}`,
      ...form,
      createdAt: now,
      updatedAt: now,
    };
    setData((prev) => [newVendor, ...prev]);
    toast({ title: "Vendor added successfully" });
    setAddDialog(false);
    setForm(emptyForm);
  };

  const handleEdit = () => {
    if (!editForm.name || !editForm.companyName || !editForm.phone || !editForm.email) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    setData((prev) => prev.map((v) => v.id === editDialog?.id ? { ...v, ...editForm, updatedAt: new Date().toISOString() } : v));
    toast({ title: "Vendor updated successfully" });
    setEditDialog(null);
  };

  const handleDelete = () => {
    setData((prev) => prev.filter((v) => v.id !== deleteDialog?.id));
    toast({ title: "Vendor deleted" });
    setDeleteDialog(null);
  };

  let filtered = [...data];
  if (filters.status && filters.status !== "all") filtered = filtered.filter((v) => v.status === filters.status);
  if (fromDate && toDate) filtered = filtered.filter((v) => v.createdAt.slice(0, 10) >= fromDate && v.createdAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((v) =>
      v.name.toLowerCase().includes(s) ||
      v.companyName.toLowerCase().includes(s) ||
      v.email.toLowerCase().includes(s) ||
      v.phone.includes(s)
    );
  }

  const handleClear = () => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); };

  const columns: Column<Vendor>[] = [
    { key: "id", label: "No.", render: (_v, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "name", label: "Name", render: (v) => <span className="font-medium">{v.name}</span> },
    { key: "companyName", label: "Company Name", render: (v) => <span className="font-medium">{v.companyName}</span> },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address", render: (v) => <span className="max-w-[200px] truncate block">{v.address}</span> },
    { key: "gstNumber", label: "GST Number", render: (v) => <span className="font-mono text-sm">{v.gstNumber}</span> },
    {
      key: "status", label: "Status", render: (v) => (
        <div className="flex items-center gap-2">
          <Switch checked={v.status === "Active"} onCheckedChange={() => toggleStatus(v.id)} />
          <span className={v.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
            {v.status}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt", label: "Created At", render: (v) => {
        const { date, time } = formatDateTime(v.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (v) => {
        const { date, time } = formatDateTime(v.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (v) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Purchase Machine" onClick={() => navigate(`/purchase-machines?vendorId=${v.id}`)}><ShoppingBag className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditDialog(v)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteDialog(v)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  const FormFields = ({ values, onChange }: { values: typeof emptyForm; onChange: (k: string, v: string) => void }) => (
    <div className="space-y-4 py-4">
      <div className="space-y-2"><Label>Name <span className="text-destructive">*</span></Label><Input placeholder="Contact person name" value={values.name} onChange={(e) => onChange("name", e.target.value)} /></div>
      <div className="space-y-2"><Label>Company Name <span className="text-destructive">*</span></Label><Input placeholder="Company / firm name" value={values.companyName} onChange={(e) => onChange("companyName", e.target.value)} /></div>
      <div className="space-y-2"><Label>Phone <span className="text-destructive">*</span></Label><Input placeholder="+91 98XXXXXXXX" value={values.phone} onChange={(e) => onChange("phone", e.target.value)} /></div>
      <div className="space-y-2"><Label>Email <span className="text-destructive">*</span></Label><Input type="email" placeholder="vendor@company.com" value={values.email} onChange={(e) => onChange("email", e.target.value)} /></div>
      <div className="space-y-2"><Label>Address</Label><Input placeholder="Full address" value={values.address} onChange={(e) => onChange("address", e.target.value)} /></div>
      <div className="space-y-2"><Label>GST Number</Label><Input placeholder="e.g. 27AABCG1234A1Z5" value={values.gstNumber} onChange={(e) => onChange("gstNumber", e.target.value)} /></div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={values.status} onValueChange={(v) => onChange("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
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
            title="Vendor Management"
            description="Manage suppliers and vendors from whom machines are purchased"
            actionLabel="Add Vendor"
            actionIcon={Plus}
            onAction={() => { setForm(emptyForm); setAddDialog(true); }}
          >
            <Button variant="outline" className="gap-2" disabled><Upload className="h-4 w-4" /> Import</Button>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name, company, email or phone..."
            filters={[
              { key: "status", label: "Status", options: [{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }] },
            ]}
            filterValues={filters}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
            showDateRange
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onClear={handleClear}
          />
          <DataTable columns={columns} data={filtered} />
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={(open) => { if (!open) { setAddDialog(false); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
          <FormFields values={form} onChange={(k, v) => setForm((prev) => ({ ...prev, [k]: v }))} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog(false); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleAdd}>Add Vendor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Vendor</DialogTitle></DialogHeader>
          <FormFields values={editForm} onChange={(k, v) => setEditForm((prev) => ({ ...prev, [k]: v }))} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Vendor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{deleteDialog?.companyName}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorsPage;
