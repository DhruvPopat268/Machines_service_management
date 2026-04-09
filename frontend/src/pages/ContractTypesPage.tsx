import { useState, useEffect } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Spinner from "@/components/Spinner";

interface ContractType {
  id: string;
  name: string;
  code: string;
  description: string;
  isServiceFree: boolean;
  isPartsFree: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const initialData: ContractType[] = [
  { id: "CT-001", name: "Warranty", code: "WTY", description: "Standard manufacturer warranty coverage", isServiceFree: true, isPartsFree: true, isActive: true, createdAt: "2026-01-05T08:00:00", updatedAt: "2026-03-10T11:30:00" },
  { id: "CT-002", name: "Comprehensive Maintenance Contract", code: "CMC", description: "Full coverage including parts, labour, and emergency visits", isServiceFree: true, isPartsFree: true, isActive: true, createdAt: "2026-01-06T09:15:00", updatedAt: "2026-03-12T14:00:00" },
  { id: "CT-003", name: "Non-Comprehensive Maintenance Contract", code: "NCMC", description: "Covers labour only, parts charged separately", isServiceFree: true, isPartsFree: false, isActive: true, createdAt: "2026-01-07T10:00:00", updatedAt: "2026-02-28T09:45:00" },
  { id: "CT-004", name: "On-Call Service", code: "OCS", description: "Pay-per-visit with no fixed commitment", isServiceFree: false, isPartsFree: false, isActive: true, createdAt: "2026-01-08T11:30:00", updatedAt: "2026-03-20T16:10:00" },
  { id: "CT-005", name: "Parts Only Contract", code: "POC", description: "Covers replacement parts without labour charges", isServiceFree: false, isPartsFree: true, isActive: false, createdAt: "2026-01-09T13:00:00", updatedAt: "2026-04-01T08:20:00" },
];

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const ContractTypesPage = () => {
  const { toast } = useToast();
  const [data, setData] = useState<ContractType[]>(initialData);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [addDialog, setAddDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", code: "", description: "", isServiceFree: false, isPartsFree: false, isActive: true });

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const toggleStatus = (id: string) => {
    setData((prev) => prev.map((c) => c.id === id ? { ...c, isActive: !c.isActive } : c));
    toast({ title: "Status updated" });
  };

  let filtered = [...data];
  if (filters.service && filters.service !== "all") filtered = filtered.filter((c) => filters.service === "Free" ? c.isServiceFree : !c.isServiceFree);
  if (filters.parts && filters.parts !== "all") filtered = filtered.filter((c) => filters.parts === "Free" ? c.isPartsFree : !c.isPartsFree);
  if (filters.status && filters.status !== "all") filtered = filtered.filter((c) => filters.status === "Active" ? c.isActive : !c.isActive);
  if (fromDate && toDate) filtered = filtered.filter((c) => c.createdAt.slice(0, 10) >= fromDate && c.createdAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s) || c.description.toLowerCase().includes(s));
  }

  const handleClear = () => {
    setSearch("");
    setFilters({});
    setFromDate("");
    setToDate("");
  };

  const columns: Column<ContractType>[] = [
    { key: "id", label: "No.", render: (_c, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "name", label: "Contract Type", render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "code", label: "Code", render: (c) => <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{c.code}</span> },
    { key: "description", label: "Description", render: (c) => <span className="max-w-[300px] truncate block">{c.description}</span> },
    {
      key: "isServiceFree", label: "Service Free", render: (c) => (
        <span className={c.isServiceFree ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
          {c.isServiceFree ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "isPartsFree", label: "Parts Free", render: (c) => (
        <span className={c.isPartsFree ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
          {c.isPartsFree ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "isActive", label: "Status", render: (c) => (
        <div className="flex items-center gap-2">
          <Switch checked={c.isActive} onCheckedChange={() => toggleStatus(c.id)} />
          <span className={c.isActive ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
            {c.isActive ? "Active" : "Inactive"}
          </span>
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
      key: "actions", label: "Actions", render: () => (
        <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader
            title="Contract Types"
            description="Manage service contract types offered to customers"
            actionLabel="Add Contract Type"
            actionIcon={Plus}
            onAction={() => setAddDialog(true)}
          />
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search contract types..."
            filters={[
              { key: "service", label: "Service", options: [{ label: "Free", value: "Free" }, { label: "Paid", value: "Paid" }] },
              { key: "parts", label: "Parts", options: [{ label: "Free", value: "Free" }, { label: "Paid", value: "Paid" }] },
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

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Contract Type</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name</Label><Input placeholder="e.g. Comprehensive Maintenance Contract" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Code</Label><Input placeholder="e.g. CMC" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Brief description of this contract type" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox id="isServiceFree" checked={form.isServiceFree} onCheckedChange={(v) => setForm((p) => ({ ...p, isServiceFree: !!v }))} />
                <Label htmlFor="isServiceFree">Service Free</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="isPartsFree" checked={form.isPartsFree} onCheckedChange={(v) => setForm((p) => ({ ...p, isPartsFree: !!v }))} />
                <Label htmlFor="isPartsFree">Parts Free</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select defaultValue="Active" onValueChange={(v) => setForm((p) => ({ ...p, isActive: v === "Active" }))}>
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
            <Button onClick={() => { toast({ title: "Contract Type Added" }); setAddDialog(false); setForm({ name: "", code: "", description: "", isServiceFree: false, isPartsFree: false, isActive: true }); }}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContractTypesPage;
