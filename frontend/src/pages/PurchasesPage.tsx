import { useState, useEffect } from "react";
import { purchases, customers } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import type { Purchase } from "@/data/dummyData";
import Spinner from "@/components/Spinner";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const PurchasesPage = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const customerFilter = searchParams.get("customer");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [addDialog, setAddDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  let filtered = [...purchases];
  if (customerFilter) filtered = filtered.filter((p) => p.customerId === customerFilter);
  if (filters.warrantyStatus && filters.warrantyStatus !== "all") filtered = filtered.filter((p) => p.warrantyStatus === filters.warrantyStatus);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((p) => p.customerName.toLowerCase().includes(s) || p.item.toLowerCase().includes(s));
  }

  const columns: Column<Purchase>[] = [
    { key: "id", label: "ID", render: (p) => <span className="font-medium text-foreground">{p.id}</span> },
    { key: "customerName", label: "Customer", render: (p) => <span className="font-medium">{p.customerName}</span> },
    { key: "item", label: "Item" },
    { key: "price", label: "Price", render: (p) => <span>₹{p.price.toLocaleString()}</span> },
    { key: "warrantyStatus", label: "Warranty", render: (p) => <StatusBadge status={p.warrantyStatus} /> },
    {
      key: "purchasedAt", label: "Purchased At", render: (p) => {
        const { date, time } = formatDateTime(p.purchasedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Customer Purchases" description="View and manage customer purchases" actionLabel="Add Purchase" actionIcon={Plus} onAction={() => setAddDialog(true)} />
          <FilterBar
            searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search purchases..."
            filters={[{ key: "warrantyStatus", label: "Warranty", options: [{ label: "Under Warranty", value: "Under Warranty" }, { label: "Expired", value: "Expired" }] }]}
            filterValues={filters} onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
          />
          <DataTable columns={columns} data={filtered} />
        </>
      )}

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Purchase</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Item</Label><Input placeholder="Item name" /></div>
            <div className="space-y-2"><Label>Price (₹)</Label><Input type="number" placeholder="Price" /></div>
            <div className="space-y-2"><Label>Purchase Date</Label><Input type="date" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={() => { toast({ title: "Purchase Added" }); setAddDialog(false); }}>Add Purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchasesPage;
