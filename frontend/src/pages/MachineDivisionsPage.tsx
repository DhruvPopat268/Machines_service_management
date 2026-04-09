import { useState, useEffect } from "react";
import { machineDivisions as initialData } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { MachineDivision } from "@/data/dummyData";
import Spinner from "@/components/Spinner";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const MachineDivisionsPage = () => {
  const { toast } = useToast();
  const [data, setData] = useState<MachineDivision[]>(initialData);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [addDialog, setAddDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const toggleStatus = (id: string) => {
    setData((prev) => prev.map((d) => d.id === id ? { ...d, status: d.status === "Active" ? "Inactive" : "Active" } : d));
    toast({ title: "Status updated" });
  };

  let filtered = [...data];
  if (filters.status && filters.status !== "all") filtered = filtered.filter((d) => d.status === filters.status);
  if (fromDate && toDate) filtered = filtered.filter((d) => d.createdAt.slice(0, 10) >= fromDate && d.createdAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((d) => d.name.toLowerCase().includes(s) || d.description.toLowerCase().includes(s));
  }

  const handleClear = () => {
    setSearch("");
    setFilters({});
    setFromDate("");
    setToDate("");
  };

  const columns: Column<MachineDivision>[] = [
    { key: "id", label: "No.", render: (_d, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "name", label: "Division Name", render: (d) => <span className="font-medium">{d.name}</span> },
    { key: "description", label: "Description", render: (d) => <span className="max-w-[400px] truncate block">{d.description}</span> },
    {
      key: "status", label: "Status", render: (d) => (
        <div className="flex items-center gap-2">
          <Switch checked={d.status === "Active"} onCheckedChange={() => toggleStatus(d.id)} />
          <span className={d.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
            {d.status}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt", label: "Created At", render: (d) => {
        const { date, time } = formatDateTime(d.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (d) => {
        const { date, time } = formatDateTime(d.updatedAt);
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
            title="Machine Divisions"
            description="Manage machine divisions for categorizing inventory"
            actionLabel="Add Division"
            actionIcon={Plus}
            onAction={() => setAddDialog(true)}
          />
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search divisions..."
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

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Machine Division</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Division Name</Label><Input placeholder="e.g. CNC Division" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Types of machines covered by this division" /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select defaultValue="Active">
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
            <Button onClick={() => { toast({ title: "Division Added" }); setAddDialog(false); }}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MachineDivisionsPage;
