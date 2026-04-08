import { useState, useEffect } from "react";
import { inventoryLogs } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { InventoryLog } from "@/data/dummyData";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  let filtered = [...inventoryLogs];
  if (filters.type && filters.type !== "all") filtered = filtered.filter((l) => l.type === filters.type);
  if (filters.action && filters.action !== "all") filtered = filtered.filter((l) => l.action === filters.action);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((l) => l.itemName.toLowerCase().includes(s) || l.performedBy.toLowerCase().includes(s));
  }

  const columns: Column<InventoryLog>[] = [
    { key: "id", label: "ID", render: (l) => <span className="font-medium text-foreground">{l.id}</span> },
    { key: "itemName", label: "Item Name", render: (l) => <span className="font-medium">{l.itemName}</span> },
    { key: "type", label: "Type", render: (l) => <StatusBadge status={l.type} /> },
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
          <PageHeader title="Inventory Logs" description="Track all inventory changes" />
          <FilterBar
            searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search logs..."
            filters={[
              { key: "type", label: "Type", options: [{ label: "Machine", value: "Machine" }, { label: "Accessory", value: "Accessory" }] },
              { key: "action", label: "Action", options: [{ label: "Added", value: "Added" }, { label: "Removed", value: "Removed" }, { label: "Sold", value: "Sold" }, { label: "Updated", value: "Updated" }] },
            ]}
            filterValues={filters} onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
          />
          <DataTable columns={columns} data={filtered} />
        </>
      )}
    </div>
  );
};

export default InventoryLogsPage;
