import { useState, useEffect } from "react";
import { machines as initialMachines } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { Plus, Edit, Trash2, Upload, Download } from "lucide-react";
import type { Machine } from "@/data/dummyData";
import Spinner from "@/components/Spinner";
import { useToast } from "@/hooks/use-toast";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const MachinesPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<Machine[]>(initialMachines);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const toggleStatus = (id: string) => {
    setData((prev) => prev.map((m) => m.id === id ? { ...m, status: m.status === "Active" ? "Inactive" : "Active" } : m));
    toast({ title: "Status updated" });
  };

  let filtered = [...data];
  if (filters.category && filters.category !== "all") filtered = filtered.filter((m) => m.category === filters.category);
  if (filters.division && filters.division !== "all") filtered = filtered.filter((m) => m.division === filters.division);
  if (filters.stockStatus && filters.stockStatus !== "all") filtered = filtered.filter((m) => m.stockStatus === filters.stockStatus);
  if (filters.status && filters.status !== "all") filtered = filtered.filter((m) => m.status === filters.status);
  if (fromDate && toDate) filtered = filtered.filter((m) => m.createdAt.slice(0, 10) >= fromDate && m.createdAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((m) => m.name.toLowerCase().includes(s) || m.model.toLowerCase().includes(s));
  }

  const handleClear = () => {
    setSearch("");
    setFilters({});
    setFromDate("");
    setToDate("");
  };

  const columns: Column<Machine>[] = [
    { key: "id", label: "No.", render: (_m, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "name", label: "Name", render: (m) => <span className="font-medium">{m.name}</span> },
    { key: "model", label: "Model" },
    { key: "division", label: "Division", render: (m) => <span className="text-sm">{m.division}</span> },
    { key: "category", label: "Category", render: (m) => <span className="text-sm">{m.category}</span> },
    { key: "price", label: "Price", render: (m) => <span>₹{m.price.toLocaleString()}</span> },
    { key: "quantity", label: "Qty", render: (m) => <span className="font-medium">{m.quantity}</span> },
    { key: "stockStatus", label: "Stock", render: (m) => <StatusBadge status={m.stockStatus} /> },
    {
      key: "status", label: "Status", render: (m) => (
        <div className="flex items-center gap-2">
          <Switch checked={m.status === "Active"} onCheckedChange={() => toggleStatus(m.id)} />
          <span className={m.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
            {m.status}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt", label: "Created At", render: (m) => {
        const { date, time } = formatDateTime(m.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (m) => {
        const { date, time } = formatDateTime(m.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: () => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Machines" description="Manage machine inventory" actionLabel="Add Machine" actionIcon={Plus} onAction={() => navigate("/machines/add")}>
            <Button variant="outline" className="gap-2" disabled><Upload className="h-4 w-4" /> Import</Button>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>
          <FilterBar
            searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by machine name or model..."
            filters={[
              { key: "category", label: "Category", options: [{ label: "Heavy Machinery", value: "Heavy Machinery" }, { label: "Additive Manufacturing", value: "Additive Manufacturing" }, { label: "Cutting Machines", value: "Cutting Machines" }, { label: "Robotics", value: "Robotics" }, { label: "Sheet Metal", value: "Sheet Metal" }] },
              { key: "division", label: "Division", options: [{ label: "CNC Division", value: "CNC Division" }, { label: "3D Printing Division", value: "3D Printing Division" }, { label: "Laser Division", value: "Laser Division" }, { label: "Welding Division", value: "Welding Division" }, { label: "Hydraulic Division", value: "Hydraulic Division" }] },
              { key: "stockStatus", label: "Stock Status", options: [{ label: "In Stock", value: "In Stock" }, { label: "Low Stock", value: "Low Stock" }, { label: "Out of Stock", value: "Out of Stock" }] },
              { key: "status", label: "Status", options: [{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }] },
            ]}
            filterValues={filters} onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
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
    </div>
  );
};

export default MachinesPage;
