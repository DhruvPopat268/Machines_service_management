import { useState, useEffect } from "react";
import { customers as initialCustomers, zones } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, ShoppingCart, Upload, Download, Edit, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import type { Customer } from "@/data/dummyData";
import Spinner from "@/components/Spinner";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const CustomersPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [data, setData] = useState<Customer[]>(initialCustomers);
  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState<Customer | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", zone: "", gstNumber: "" });
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", address: "", zone: "", gstNumber: "" });

  const activeZones = zones.filter((z) => z.status === "Active");

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (editDialog) setEditForm({ name: editDialog.name, email: editDialog.email, phone: editDialog.contact, address: editDialog.address, zone: editDialog.zone ?? "", gstNumber: editDialog.gstNumber ?? "" });
  }, [editDialog]);

  const toggleStatus = (id: string) => {
    setData((prev) => prev.map((c) => c.id === id ? { ...c, status: c.status === "Active" ? "Inactive" : "Active" } : c));
    toast({ title: "Status updated" });
  };

  let filtered = [...data];
  if (filters.status && filters.status !== "all") filtered = filtered.filter((c) => c.status === filters.status);
  if (fromDate && toDate) filtered = filtered.filter((c) => c.joinedAt.slice(0, 10) >= fromDate && c.joinedAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((c) => c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s));
  }

  const handleClear = () => {
    setSearch("");
    setFilters({});
    setFromDate("");
    setToDate("");
  };

  const columns: Column<Customer>[] = [
    { key: "id", label: "No.", render: (_c, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "name", label: "Name", render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "contact", label: "Contact" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address", render: (c) => <span className="max-w-[200px] truncate block">{c.address}</span> },
    { key: "zone", label: "Zone", render: (c) => c.zone ? <span className="text-sm">{c.zone}</span> : <span className="text-muted-foreground text-sm">—</span> },
    { key: "gstNumber", label: "GST Number", render: (c) => c.gstNumber ? <span className="font-mono text-sm">{c.gstNumber}</span> : <span className="text-muted-foreground text-sm">—</span> },
    { key: "totalPurchases", label: "Purchases", render: (c) => <span className="font-medium">{c.totalPurchases}</span> },
    {
      key: "status", label: "Status", render: (c) => (
        <div className="flex items-center gap-2">
          <Switch checked={c.status === "Active"} onCheckedChange={() => toggleStatus(c.id)} />
          <span className={c.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
            {c.status}
          </span>
        </div>
      ),
    },
    {
      key: "joinedAt", label: "Joined At", render: (c) => {
        const { date, time } = formatDateTime(c.joinedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "lastPurchasedAt", label: "Last Purchased At", render: (c) => {
        const { date, time } = formatDateTime(c.lastPurchasedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/sell-machines?customerId=${c.id}`)} title="Sell Machine"><ShoppingCart className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditDialog(c)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteDialog(c)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Customers" description="Manage customer accounts" actionLabel="Add Customer" actionIcon={UserPlus} onAction={() => setAddDialog(true)}>
            <Button variant="outline" className="gap-2" disabled><Upload className="h-4 w-4" /> Import</Button>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>
          <FilterBar
            searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search customers..."
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

      <Dialog open={addDialog} onOpenChange={(open) => { if (!open) { setAddDialog(false); setForm({ name: "", email: "", phone: "", address: "", zone: "", gstNumber: "" }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name</Label><Input placeholder="Company name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input placeholder="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Zone</Label>
              <Select value={form.zone} onValueChange={(v) => setForm((p) => ({ ...p, zone: v }))}>
                <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                <SelectContent>
                  {activeZones.map((z) => (
                    <SelectItem key={z.id} value={z.name}>{z.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Address</Label><Input placeholder="Address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></div>
            <div className="space-y-2"><Label>GST Number</Label><Input placeholder="e.g. 27AABCA1234A1Z5" value={form.gstNumber} onChange={(e) => setForm((p) => ({ ...p, gstNumber: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog(false); setForm({ name: "", email: "", phone: "", address: "", zone: "", gstNumber: "" }); }}>Cancel</Button>
            <Button onClick={() => {
              const now = new Date().toISOString();
              setData((prev) => [{ id: `C-${String(prev.length + 1).padStart(3, "0")}`, name: form.name, contact: form.phone, email: form.email, address: form.address, zone: form.zone, gstNumber: form.gstNumber, totalPurchases: 0, status: "Active", joinedAt: now, lastPurchasedAt: now }, ...prev]);
              toast({ title: "Customer Added" });
              setAddDialog(false);
              setForm({ name: "", email: "", phone: "", address: "", zone: "", gstNumber: "" });
            }}>Add Customer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name</Label><Input placeholder="Company name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="Email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Zone</Label>
              <Select value={editForm.zone} onValueChange={(v) => setEditForm((p) => ({ ...p, zone: v }))}>
                <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                <SelectContent>
                  {activeZones.map((z) => (<SelectItem key={z.id} value={z.name}>{z.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Address</Label><Input placeholder="Address" value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} /></div>
            <div className="space-y-2"><Label>GST Number</Label><Input placeholder="e.g. 27AABCA1234A1Z5" value={editForm.gstNumber} onChange={(e) => setEditForm((p) => ({ ...p, gstNumber: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={() => {
              setData((prev) => prev.map((c) => c.id === editDialog?.id ? { ...c, name: editForm.name, contact: editForm.phone, email: editForm.email, address: editForm.address, zone: editForm.zone, gstNumber: editForm.gstNumber } : c));
              toast({ title: "Customer updated" });
              setEditDialog(null);
            }}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>Are you sure you want to delete <span className="font-semibold text-foreground">{deleteDialog?.name}</span>? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setData((prev) => prev.filter((c) => c.id !== deleteDialog?.id)); toast({ title: "Customer deleted" }); setDeleteDialog(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomersPage;
