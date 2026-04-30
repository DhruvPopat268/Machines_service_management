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



const InventoryLogsPage = () => {
  const navigate = useNavigate();
  const [data, setData]                       = useState<InventoryLog[]>([]);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters]                 = useState<Record<string, string>>({});
  const [fromDate, setFromDate]               = useState("");
  const [toDate, setToDate]                   = useState("");
  const [loading, setLoading]                 = useState(true);
  const [pageSize, setPageSize]               = useState(10);
  const [pagination, setPagination]           = useState({ page: 1, totalPages: 1, total: 0 });
  const [exportDialog, setExportDialog]       = useState(false);

  // Filter options state
  const [vendors, setVendors]       = useState<{ label: string; value: string }[]>([]);
  const [customers, setCustomers]   = useState<{ label: string; value: string }[]>([]);
  const [categories, setCategories] = useState<{ label: string; value: string }[]>([]);
  const [divisions, setDivisions]   = useState<{ label: string; value: string }[]>([]);
  const [machines, setMachines]     = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch filter options on mount
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [vendorRes, customerRes, categoryRes, divisionRes, machineRes] = await Promise.all([
          api.get("/admin/vendors", { params: { limit: 10 } }),
          api.get("/admin/customers", { params: { limit: 10 } }),
          api.get("/admin/machine-categories", { params: { limit: 10 } }),
          api.get("/admin/machine-divisions", { params: { limit: 10 } }),
          api.get("/admin/machines", { params: { limit: 10 } }),
        ]);
        setVendors(vendorRes.data.data.map((v: any) => ({ label: `${v.companyName} - ${v.name}`, value: v._id })));
        setCustomers(customerRes.data.data.map((c: any) => ({ label: `${c.name} - ${c.phone}`, value: c._id })));
        setCategories(categoryRes.data.data.map((c: any) => ({ label: c.name, value: c._id })));
        setDivisions(divisionRes.data.data.map((d: any) => ({ label: d.name, value: d._id })));
        setMachines(machineRes.data.data.map((m: any) => ({ label: m.name, value: m._id })));
      } catch {
        toast.error("Failed to load filter options");
      }
    };
    fetchFilterOptions();
  }, []);

  // Search functions for SearchableSelect
  const fetchVendors = useCallback(async (searchQuery: string) => {
    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/vendors", { params });
      setVendors(res.data.data.map((v: any) => ({ label: `${v.companyName} - ${v.name}`, value: v._id })));
    } catch { /* silent */ }
  }, []);

  const fetchCustomers = useCallback(async (searchQuery: string) => {
    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/customers", { params });
      setCustomers(res.data.data.map((c: any) => ({ label: `${c.name} - ${c.phone}`, value: c._id })));
    } catch { /* silent */ }
  }, []);

  const fetchCategories = useCallback(async (searchQuery: string) => {
    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/machine-categories", { params });
      setCategories(res.data.data.map((c: any) => ({ label: c.name, value: c._id })));
    } catch { /* silent */ }
  }, []);

  const fetchDivisions = useCallback(async (searchQuery: string) => {
    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/machine-divisions", { params });
      setDivisions(res.data.data.map((d: any) => ({ label: d.name, value: d._id })));
    } catch { /* silent */ }
  }, []);

  const fetchMachines = useCallback(async (searchQuery: string) => {
    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/machines", { params });
      setMachines(res.data.data.map((m: any) => ({ label: m.name, value: m._id })));
    } catch { /* silent */ }
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const fetchLogs = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(pageSize) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.action && filters.action !== "all" && filters.action !== "") params.action = filters.action;
      if (filters.vendor && filters.vendor !== "all" && filters.vendor !== "") params.vendorId = filters.vendor;
      if (filters.customer && filters.customer !== "all" && filters.customer !== "") params.customerId = filters.customer;
      if (filters.category && filters.category !== "all" && filters.category !== "") params.category = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") params.division = filters.division;
      if (filters.machine && filters.machine !== "all" && filters.machine !== "") params.machineId = filters.machine;
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
  }, [debouncedSearch, filters, fromDate, toDate, pageSize]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const handleExport = async () => {
    setExportDialog(false);
    toast.success("Download starting...");
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.action && filters.action !== "all" && filters.action !== "") params.action = filters.action;
      if (filters.vendor && filters.vendor !== "all" && filters.vendor !== "") params.vendorId = filters.vendor;
      if (filters.customer && filters.customer !== "all" && filters.customer !== "") params.customerId = filters.customer;
      if (filters.category && filters.category !== "all" && filters.category !== "") params.category = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") params.division = filters.division;
      if (filters.machine && filters.machine !== "all" && filters.machine !== "") params.machineId = filters.machine;
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
      render: (_l, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * pageSize + i + 1}</span>,
    },
    {
      key: "entity", label: "Entity",
      render: (l) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          l.action === "purchased" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"
        }`}>{l.action === "purchased" ? "Vendor" : "Customer"}</span>
      ),
    },
    {
      key: "party", label: "Vendor / Customer",
      render: (l) => {
        if (l.action === "purchased" && l.vendorInfo) {
          return (
            <div>
              <p className="font-medium text-sm">{l.vendorInfo.companyName}</p>
              <p className="text-xs text-muted-foreground">{l.vendorInfo.name}</p>
              <p className="text-xs text-muted-foreground">{l.vendorInfo.phone}</p>
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
            searchPlaceholder="Search by machine, model, vendor, customer, phone..."
            searchTitle="Search with machine name, model no, vendor info or customer info"
            searchableFilters={[
              { key: "vendor", placeholder: "Vendor", searchPlaceholder: "Search vendors...", options: vendors, onSearch: fetchVendors, disabled: !!(filters.customer && filters.customer !== "all" && filters.customer !== "") },
              { key: "customer", placeholder: "Customer", searchPlaceholder: "Search customers...", options: customers, onSearch: fetchCustomers, disabled: !!(filters.vendor && filters.vendor !== "all" && filters.vendor !== "") },
              { key: "category", placeholder: "Category", searchPlaceholder: "Search categories...", options: categories, onSearch: fetchCategories },
              { key: "division", placeholder: "Division", searchPlaceholder: "Search divisions...", options: divisions, onSearch: fetchDivisions },
              { key: "machine", placeholder: "Machine", searchPlaceholder: "Search machines...", options: machines, onSearch: fetchMachines },
            ]}
            filters={[
              { key: "action", label: "Action", options: [{ label: "Purchased", value: "purchased" }, { label: "Sold", value: "sold" }] },
            ]}
            filterValues={filters}
            onFilterChange={(k, v) => {
              const newFilters = { ...filters, [k]: v };
              // Auto-set action based on vendor/customer selection
              if (k === "vendor" && v && v !== "all" && v !== "") {
                newFilters.action = "purchased";
                newFilters.customer = ""; // Clear customer when vendor is selected
              } else if (k === "customer" && v && v !== "all" && v !== "") {
                newFilters.action = "sold";
                newFilters.vendor = ""; // Clear vendor when customer is selected
              } else if (k === "vendor" && (!v || v === "all" || v === "")) {
                // Clear action when vendor is cleared
                if (filters.action === "purchased") newFilters.action = "";
              } else if (k === "customer" && (!v || v === "all" || v === "")) {
                // Clear action when customer is cleared
                if (filters.action === "sold") newFilters.action = "";
              }
              setFilters(newFilters);
            }}
            showDateRange
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onClear={() => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); }}
            pageSize={pageSize}
            onPageSizeChange={(size) => { 
              setPageSize(size);
            }}
            totalCount={pagination.total}
          />
          <DataTable columns={columns} data={data} pageSize={999} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pageSize}
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
