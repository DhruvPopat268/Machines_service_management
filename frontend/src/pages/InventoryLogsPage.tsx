import { useState, useEffect } from "react";
import { inventoryLogs } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { InventoryLog } from "@/data/dummyData";
import { Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import Spinner from "@/components/Spinner";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const InventoryLogsPage = () => {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const performedByOptions = [...new Set(inventoryLogs.map((l) => l.performedBy))].map((v) => ({ label: v, value: v }));

  let filtered = [...inventoryLogs];
  if (filters.division && filters.division !== "all") filtered = filtered.filter((l) => l.division === filters.division);
  if (filters.category && filters.category !== "all") filtered = filtered.filter((l) => l.category === filters.category);
  if (filters.action && filters.action !== "all") filtered = filtered.filter((l) => l.action === filters.action);
  if (filters.performedBy && filters.performedBy !== "all") filtered = filtered.filter((l) => l.performedBy === filters.performedBy);
  if (fromDate && toDate) filtered = filtered.filter((l) => l.createdAt.slice(0, 10) >= fromDate && l.createdAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((l) => l.itemName.toLowerCase().includes(s) || l.performedBy.toLowerCase().includes(s));
  }

  const handleClear = () => {
    setSearch("");
    setFilters({});
    setFromDate("");
    setToDate("");
  };

  const columns: Column<InventoryLog>[] = [
    { key: "id", label: "No.", render: (_l, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "itemName", label: "Name", render: (l) => <span className="font-medium">{l.itemName}</span> },
    { key: "model", label: "Model", render: (l) => l.model ? <span className="text-sm">{l.model}</span> : <span className="text-muted-foreground text-sm">—</span> },
    { key: "division", label: "Division", render: (l) => l.division ? <span className="text-sm">{l.division}</span> : <span className="text-muted-foreground text-sm">—</span> },
    { key: "category", label: "Category", render: (l) => l.category ? <span className="text-sm">{l.category}</span> : <span className="text-muted-foreground text-sm">—</span> },
    { key: "action", label: "Action", render: (l) => <StatusBadge status={l.action} /> },
    { key: "quantityChange", label: "Qty Change", render: (l) => <span className={l.quantityChange > 0 ? "text-success font-medium" : l.quantityChange < 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
      {l.quantityChange > 0 ? `+${l.quantityChange}` : l.quantityChange}
    </span> },
    {
      key: "createdAt", label: "Created At", render: (l) => {
        const { date, time } = formatDateTime(l.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    { key: "performedBy", label: "Performed By" },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Inventory Logs" description="Track all inventory changes">
            <Button variant="outline" className="gap-2" disabled><Upload className="h-4 w-4" /> Import</Button>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>
          <FilterBar
            searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by machine name..."
            filters={[
              { key: "division", label: "Division", options: [{ label: "CNC Division", value: "CNC Division" }, { label: "3D Printing Division", value: "3D Printing Division" }, { label: "Laser Division", value: "Laser Division" }, { label: "Welding Division", value: "Welding Division" }, { label: "Hydraulic Division", value: "Hydraulic Division" }] },
              { key: "category", label: "Category", options: [{ label: "Heavy Machinery", value: "Heavy Machinery" }, { label: "Additive Manufacturing", value: "Additive Manufacturing" }, { label: "Cutting Machines", value: "Cutting Machines" }, { label: "Robotics", value: "Robotics" }, { label: "Sheet Metal", value: "Sheet Metal" }] },
              { key: "action", label: "Action", options: [{ label: "Added", value: "Added" }, { label: "Removed", value: "Removed" }, { label: "Sold", value: "Sold" }, { label: "Updated", value: "Updated" }] },
              { key: "performedBy", label: "Performed By", options: performedByOptions },
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

export default InventoryLogsPage;
