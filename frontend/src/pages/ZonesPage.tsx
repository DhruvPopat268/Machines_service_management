import { useState, useEffect } from "react";
import { zones as initialData } from "@/data/dummyData";
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
import type { Zone } from "@/data/dummyData";
import Spinner from "@/components/Spinner";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const ZonesPage = () => {
  const { toast } = useToast();
  const [data, setData] = useState<Zone[]>(initialData);
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
    setData((prev) => prev.map((z) => z.id === id ? { ...z, status: z.status === "Active" ? "Inactive" : "Active" } : z));
    toast({ title: "Status updated" });
  };

  let filtered = [...data];
  if (filters.status && filters.status !== "all") filtered = filtered.filter((z) => z.status === filters.status);
  if (fromDate && toDate) filtered = filtered.filter((z) => z.createdAt.slice(0, 10) >= fromDate && z.createdAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((z) => z.name.toLowerCase().includes(s) || z.description.toLowerCase().includes(s));
  }

  const handleClear = () => {
    setSearch("");
    setFilters({});
    setFromDate("");
    setToDate("");
  };

  const columns: Column<Zone>[] = [
    { key: "id", label: "No.", render: (_z, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "name", label: "Zone Name", render: (z) => <span className="font-medium">{z.name}</span> },
    { key: "description", label: "Description", render: (z) => <span className="max-w-[400px] truncate block">{z.description}</span> },
    {
      key: "status", label: "Status", render: (z) => (
        <div className="flex items-center gap-2">
          <Switch checked={z.status === "Active"} onCheckedChange={() => toggleStatus(z.id)} />
          <span className={z.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
            {z.status}
          </span>
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
            title="Zone Management"
            description="Manage service zones for engineer assignment and call routing"
            actionLabel="Add Zone"
            actionIcon={Plus}
            onAction={() => setAddDialog(true)}
          />
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by zone name or description..."
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
          <DialogHeader><DialogTitle>Add Zone</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Zone Name</Label><Input placeholder="e.g. North Zone" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Regions or areas covered by this zone" /></div>
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
            <Button onClick={() => { toast({ title: "Zone Added" }); setAddDialog(false); }}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ZonesPage;
