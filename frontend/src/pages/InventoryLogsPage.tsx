import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Eye, Download } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

interface VendorInfo {
  vendorId: string | null;
  name: string;
  companyName: string;
  phone: string;
}

interface CustomerInfo {
  customerId: string | null;
  name: string;
  phone: string;
  zone: string;
}

interface InventoryLog {
  _id: string;
  action: "purchased" | "sold";
  vendorInfo?: VendorInfo;
  customerInfo?: CustomerInfo;
  machinesCount: number;
  totalVariants: number;
  createdAt: string;
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

const InventoryLogsPage = () => {
  const navigate = useNavigate();
  const [data, setData]                       = useState<InventoryLog[]>([]);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters]                 = useState<Record<string, string>>({});
  const [fromDate, setFromDate]               = useState("");
  const [toDate, setToDate]                   = useState("");
  const [loading, setLoading]                 = useState(true);
  const [pagination, setPagination]           = useState({ page: 1, totalPages: 1, total: 0 });
  const [exportDialog, setExportDialog]       = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchLogs = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.action && filters.action !== "all") params.action = filters.action;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/inventory-logs", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page:       res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total:      res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch inventory logs");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, filters, fromDate, toDate]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const handleExport = async () => {
    setExportDialog(false);
    toast.success("Download starting...");
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.action && filters.action !== "all") params.action = filters.action;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);
      const res = await api.get("/admin/inventory-logs/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "inventory_logs.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const columns: Column<InventoryLog>[] = [
    {
      key: "_id", label: "No.",
      render: (_l, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span>,
    },
    {
      key: "party", label: "Vendor / Customer",
      render: (l) => {
        if (l.action === "purchased" && l.vendorInfo) {
          return (
            <div>
              <p className="font-medium text-sm">{l.vendorInfo.companyName}</p>
              <p className="text-xs text-muted-foreground">{l.vendorInfo.name}</p>
            </div>
          );
        }
        if (l.action === "sold" && l.customerInfo) {
          return (
            <div>
              <p className="font-medium text-sm">{l.customerInfo.name}</p>
              <p className="text-xs text-muted-foreground">{l.customerInfo.phone}</p>
            </div>
          );
        }
        return <span className="text-muted-foreground text-sm">—</span>;
      },
    },
    {
      key: "machinesCount", label: "Machines",
      render: (l) => <span className="font-medium">{l.machinesCount}</span>,
    },
    {
      key: "totalVariants", label: "Total Variants",
      render: (l) => <span className="font-medium">{l.totalVariants}</span>,
    },
    {
      key: "action", label: "Action",
      render: (l) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          l.action === "purchased" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
        }`}>{l.action === "purchased" ? "Purchased" : "Sold"}</span>
      ),
    },
    {
      key: "createdAt", label: "Purchase / Sale Date",
      render: (l) => {
        const { date, time } = formatDateTime(l.createdAt);
        return (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{l.action === "purchased" ? "Purchase Date" : "Sale Date"}</p>
            <p className="text-sm">{date}</p>
            <p className="text-xs text-muted-foreground">{time}</p>
          </div>
        );
      },
    },
    {
      key: "actions", label: "Actions",
      render: (l) => (
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate(`/inventory-logs/${l._id}`)}>
          <Eye className="h-3 w-3" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader
            title="Inventory Logs"
            description="Track all inventory changes from purchases and sales"
          >
            <Button variant="outline" className="gap-2" onClick={() => setExportDialog(true)}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </PageHeader>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by machine, vendor or customer..."
            filters={[
              { key: "action", label: "Action", options: [{ label: "Purchased", value: "purchased" }, { label: "Sold", value: "sold" }] },
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
            onPageChange={fetchLogs}
          />

          {/* Export Confirm Dialog */}
          <Dialog open={exportDialog} onOpenChange={setExportDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export Inventory Logs</DialogTitle>
                <DialogDescription>Do you want to download all inventory logs as an Excel file?</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExportDialog(false)}>Cancel</Button>
                <Button onClick={handleExport}>Yes, Download</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default InventoryLogsPage;
