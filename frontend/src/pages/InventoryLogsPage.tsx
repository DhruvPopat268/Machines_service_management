import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Eye, Download, Search, X } from "lucide-react";
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

interface LogMachine {
  machineId: string;
  machineName: string;
  modelNumber: string;
  category: string;
  division: string;
  quantity: number;
  serialNumbers: string[];
  partCodes: string[];
}

interface InventoryLog {
  _id: string;
  action: "purchased" | "sold" | "dis-installed";
  vendorInfo?: VendorInfo;
  customerInfo?: CustomerInfo;
  machines: LogMachine[];
  machinesCount: number;
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
  const [pageSize]                            = useState(10);
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
    vendorAbortRef.current?.abort();
    const controller = new AbortController();
    vendorAbortRef.current = controller;

    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/vendors", { params, signal: controller.signal });
      if (!controller.signal.aborted) {
        setVendors(res.data.data.map((v: any) => ({ label: `${v.companyName} - ${v.name}`, value: v._id })));
      }
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        console.error("Failed to fetch vendors", err);
      }
    }
  }, []);

  const fetchCustomers = useCallback(async (searchQuery: string) => {
    customerAbortRef.current?.abort();
    const controller = new AbortController();
    customerAbortRef.current = controller;

    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/customers", { params, signal: controller.signal });
      if (!controller.signal.aborted) {
        setCustomers(res.data.data.map((c: any) => ({ label: `${c.name} - ${c.phone}`, value: c._id })));
      }
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        console.error("Failed to fetch customers", err);
      }
    }
  }, []);

  const fetchCategories = useCallback(async (searchQuery: string) => {
    categoryAbortRef.current?.abort();
    const controller = new AbortController();
    categoryAbortRef.current = controller;

    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/machine-categories", { params, signal: controller.signal });
      if (!controller.signal.aborted) {
        setCategories(res.data.data.map((c: any) => ({ label: c.name, value: c._id })));
      }
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        console.error("Failed to fetch categories", err);
      }
    }
  }, []);

  const fetchDivisions = useCallback(async (searchQuery: string) => {
    divisionAbortRef.current?.abort();
    const controller = new AbortController();
    divisionAbortRef.current = controller;

    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/machine-divisions", { params, signal: controller.signal });
      if (!controller.signal.aborted) {
        setDivisions(res.data.data.map((d: any) => ({ label: d.name, value: d._id })));
      }
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        console.error("Failed to fetch divisions", err);
      }
    }
  }, []);

  const fetchMachines = useCallback(async (searchQuery: string) => {
    machineAbortRef.current?.abort();
    const controller = new AbortController();
    machineAbortRef.current = controller;

    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/machines", { params, signal: controller.signal });
      if (!controller.signal.aborted) {
        setMachines(res.data.data.map((m: any) => ({ label: m.name, value: m._id })));
      }
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        console.error("Failed to fetch machines", err);
      }
    }
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const vendorAbortRef = useRef<AbortController | null>(null);
  const customerAbortRef = useRef<AbortController | null>(null);
  const categoryAbortRef = useRef<AbortController | null>(null);
  const divisionAbortRef = useRef<AbortController | null>(null);
  const machineAbortRef = useRef<AbortController | null>(null);

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

  const sep = (i: number, total: number) => i < total - 1 ? <hr className="my-1 border-t border-border" /> : null;

  const columns: Column<InventoryLog>[] = [
    {
      key: "_id", label: "No.",
      render: (_l, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * pageSize + i + 1}</span>,
    },
    {
      key: "action", label: "Action",
      render: (l) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          l.action === "purchased" ? "bg-green-100 text-green-700"
          : l.action === "sold"    ? "bg-blue-100 text-blue-700"
                                   : "bg-orange-100 text-orange-700"
        }`}>
          {l.action === "purchased" ? "Purchased" : l.action === "sold" ? "Sold" : "Dis-Installed"}
        </span>
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
        if ((l.action === "sold" || l.action === "dis-installed") && l.customerInfo) {
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
      key: "machineName", label: "Machine",
      render: (l) => <div>{l.machines.map((m, i) => <div key={i}>{m.machineName}{sep(i, l.machines.length)}</div>)}</div>,
    },
    {
      key: "category", label: "Category",
      render: (l) => <div>{l.machines.map((m, i) => <div key={i}>{m.category || "—"}{sep(i, l.machines.length)}</div>)}</div>,
    },
    {
      key: "division", label: "Division",
      render: (l) => <div>{l.machines.map((m, i) => <div key={i}>{m.division || "—"}{sep(i, l.machines.length)}</div>)}</div>,
    },
    {
      key: "quantity", label: "Qty Change",
      render: (l) => (
        <div>{l.machines.map((m, i) => (
          <div key={i}>
            <span className={`font-medium ${
              l.action === "sold" ? "text-red-600" : "text-green-600"
            }`}>
              {l.action === "sold" ? "-" : "+"}{m.quantity}
            </span>
            {sep(i, l.machines.length)}
          </div>
        ))}</div>
      ),
    },
    {
      key: "codes", label: "Serial No / Part Code",
      render: (l) => (
        <div>{l.machines.map((m, i) => {
          const codes = m.serialNumbers?.length ? m.serialNumbers : (m.partCodes || []);
          return (
            <div key={i}>
              {codes.length > 0 ? codes.map((c, j) => <div key={j} className="font-mono text-xs">{c}</div>) : <span className="text-muted-foreground">—</span>}
              {sep(i, l.machines.length)}
            </div>
          );
        })}</div>
      ),
    },
    {
      key: "createdAt", label: "Date",
      render: (l) => {
        const { date, time } = formatDateTime(l.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
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

          {/* Row 1: search + date range + clear */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by machine, vendor, customer, phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" /></div>
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" /></div>
              {(search || fromDate || toDate || Object.values(filters).some(v => v && v !== "all")) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); }} className="h-9"><X className="h-4 w-4 mr-1" /> Clear</Button>
              )}
            </div>
          </div>

          {/* Row 2: searchable selects + action filter */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Select
              value={filters.action ?? ""}
              onValueChange={(v) => {
                const newFilters = { ...filters, action: v };
                if (!v || v === "all") {
                  newFilters.vendor   = "";
                  newFilters.customer = "";
                }
                setFilters(newFilters);
              }}
            >
              <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchased">Purchased</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="dis-installed">Dis-Installed</SelectItem>
              </SelectContent>
            </Select>
            <SearchableSelect
              options={vendors} value={filters.vendor ?? ""}
              onChange={(v) => {
                const nf = { ...filters, vendor: v, customer: "" };
                if (v && v !== "all" && v !== "") nf.action = "purchased";
                else if (filters.action === "purchased") nf.action = "";
                setFilters(nf);
              }}
              onSearchChange={fetchVendors}
              placeholder="Vendor" searchPlaceholder="Search vendors..."
              className="w-[160px] h-9 text-sm"
              disabled={!!(filters.customer && filters.customer !== "all" && filters.customer !== "")}
            />
            <SearchableSelect
              options={customers} value={filters.customer ?? ""}
              onChange={(v) => {
                const nf = { ...filters, customer: v, vendor: "" };
                if (v && v !== "all" && v !== "") nf.action = "sold";
                else if (filters.action === "sold") nf.action = "";
                setFilters(nf);
              }}
              onSearchChange={fetchCustomers}
              placeholder="Customer" searchPlaceholder="Search customers..."
              className="w-[160px] h-9 text-sm"
              disabled={!!(filters.vendor && filters.vendor !== "all" && filters.vendor !== "")}
            />
            <SearchableSelect options={categories} value={filters.category ?? ""} onChange={(v) => setFilters(p => ({ ...p, category: v }))} onSearchChange={fetchCategories} placeholder="Category" searchPlaceholder="Search categories..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={divisions}  value={filters.division  ?? ""} onChange={(v) => setFilters(p => ({ ...p, division:  v }))} onSearchChange={fetchDivisions}  placeholder="Division"  searchPlaceholder="Search divisions..."  className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={machines}   value={filters.machine   ?? ""} onChange={(v) => setFilters(p => ({ ...p, machine:   v }))} onSearchChange={fetchMachines}   placeholder="Machine"   searchPlaceholder="Search machines..."   className="w-[160px] h-9 text-sm" />
          </div>
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
