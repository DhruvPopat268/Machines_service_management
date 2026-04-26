import { useState, useEffect, useRef, useCallback } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ShoppingBag, Plus } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

interface PurchaseVariant {
  name: string;
  value: string;
  quantity: number;
  price: number;
  discountedPrice: number | null;
  total: number;
}

interface VendorInfo {
  vendorId: string | null;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  gstNumber: string;
}

interface Purchase {
  _id: string;
  vendorInfo: VendorInfo;
  category: string;
  machineId: string;
  machineName: string;
  variants: PurchaseVariant[];
  willAddToInventory: boolean;
  totalPurchased: number;
  createdAt: string;
  updatedAt: string;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const toISTDateParam = (htmlDate: string) => {
  const [yyyy, mm, dd] = htmlDate.split("-");
  return `${dd}/${mm}/${String(yyyy).slice(2)}`;
};

const LIMIT = 10;

const PurchaseMachinesPage = () => {
  const [data, setData]                     = useState<Purchase[]>([]);
  const [search, setSearch]                 = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters]               = useState<Record<string, string>>({});
  const [fromDate, setFromDate]             = useState("");
  const [toDate, setToDate]                 = useState("");
  const [loading, setLoading]               = useState(true);
  const [submitting, setSubmitting]         = useState(false);
  const [pagination, setPagination]         = useState({ page: 1, totalPages: 1, total: 0 });
  const [addInventoryDialog, setAddInventoryDialog] = useState<Purchase | null>(null);

  // debounce search 500ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchPurchases = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (debouncedSearch)                                              params.search             = debouncedSearch;
      if (filters.vendorId       && filters.vendorId !== "all")        params.vendorId            = filters.vendorId;
      if (filters.category       && filters.category !== "all")        params.category            = filters.category;
      if (filters.willAddToInventory && filters.willAddToInventory !== "all") params.willAddToInventory = filters.willAddToInventory;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/purchases", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page:       res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total:      res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch purchases");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters, fromDate, toDate]);

  useEffect(() => { fetchPurchases(1); }, [fetchPurchases]);

  const handleAddToInventory = async () => {
    if (!addInventoryDialog) return;
    setSubmitting(true);
    try {
      await api.patch(`/admin/purchases/${addInventoryDialog._id}/add-inventory`);
      toast.success("Inventory updated successfully");
      setAddInventoryDialog(null);
      fetchPurchases(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update inventory");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<Purchase>[] = [
    {
      key: "_id", label: "No.",
      render: (_p, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span>,
    },
    {
      key: "vendorInfo", label: "Vendor",
      render: (p) => (
        <div>
          <p className="font-medium text-sm">{p.vendorInfo.companyName}</p>
          <p className="text-xs text-muted-foreground">{p.vendorInfo.name}</p>
          <p className="text-xs text-muted-foreground">{p.vendorInfo.phone}</p>
        </div>
      ),
    },
    {
      key: "machineName", label: "Machine",
      render: (p) => (
        <div>
          <p className="font-medium text-sm">{p.machineName}</p>
          <p className="text-xs text-muted-foreground">{p.category}</p>
        </div>
      ),
    },
    {
      key: "variants", label: "Variants",
      render: (p) => (
        <table className="text-xs w-full">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="text-left font-medium pb-1 pr-3">Variant</th>
              <th className="text-left font-medium pb-1 pr-3">Value</th>
              <th className="text-right font-medium pb-1 pr-3">Qty</th>
              <th className="text-right font-medium pb-1 pr-3">Price</th>
              <th className="text-right font-medium pb-1 pr-3">Disc. Price</th>
              <th className="text-right font-medium pb-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {p.variants.map((v, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 pr-3">{v.name}</td>
                  <td className="py-1 pr-3">{v.value}</td>
                  <td className="py-1 pr-3 text-right">{v.quantity}</td>
                  <td className="py-1 pr-3 text-right">₹{v.price.toLocaleString()}</td>
                  <td className="py-1 pr-3 text-right">{v.discountedPrice !== null ? `₹${v.discountedPrice.toLocaleString()}` : "—"}</td>
                  <td className="py-1 text-right font-medium">₹{v.total.toLocaleString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ),
    },
    {
      key: "totalPurchased", label: "Total (₹)",
      render: (p) => <span className="font-medium">₹{p.totalPurchased.toLocaleString()}</span>,
    },
    {
      key: "willAddToInventory", label: "Added to Inventory",
      render: (p) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          p.willAddToInventory ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
        }`}>
          {p.willAddToInventory ? "Yes" : "Pending"}
        </span>
      ),
    },
    {
      key: "createdAt", label: "Purchased At",
      render: (p) => {
        const { date, time } = formatDateTime(p.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions",
      render: (p) => !p.willAddToInventory ? (
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setAddInventoryDialog(p)}>
          <Plus className="h-3 w-3" /> Add to Inventory
        </Button>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader
            title="Purchase Machines"
            description="Record and manage machine purchases from vendors"
            actionLabel="Purchase Machine"
            actionIcon={ShoppingBag}
            onAction={() => toast.info("Coming soon")}
          />
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by machine name or vendor..."
            filters={[
              { key: "willAddToInventory", label: "Added to Inventory", options: [{ label: "Yes", value: "true" }, { label: "Pending", value: "false" }] },
            ]}
            filterValues={filters}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
            showDateRange
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onClear={() => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); }}
          />
          <DataTable columns={columns} data={data} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={LIMIT}
            onPageChange={fetchPurchases}
          />
        </>
      )}

      <Dialog open={!!addInventoryDialog} onOpenChange={(open) => { if (!open) setAddInventoryDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Inventory</DialogTitle>
            <DialogDescription>
              Are you sure you want to add <span className="font-semibold text-foreground">{addInventoryDialog?.machineName}</span> variants to inventory? This will update the machine stock.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddInventoryDialog(null)}>Cancel</Button>
            <Button onClick={handleAddToInventory} disabled={submitting}>
              {submitting ? "Updating..." : "Yes, Add to Inventory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseMachinesPage;
