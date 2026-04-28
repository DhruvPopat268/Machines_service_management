import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShoppingCart, Eye, Plus, Trash2, Search, X, Info } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerInfo {
  customerId: string | null;
  name: string;
  phone: string;
  email: string;
  address: string;
  zone: string;
  gstNumber: string;
}

interface Sale {
  _id: string;
  customerInfo: CustomerInfo;
  machinesCount: number;
  totalVariants: number;
  grandTotal: number;
  createdAt: string;
}

interface Customer {
  _id: string;
  name: string;
  phone: string;
  email: string;
}

interface MachineVariant {
  attribute: { _id: string; name: string } | string;
  value: string;
  currentStock: number;
}

interface Machine {
  _id: string;
  name: string;
  category?: { name: string };
  variants: MachineVariant[];
}

interface VariantRow {
  attributeId: string;
  attributeName: string;
  value: string;
  quantity: string;
  price: string;
  discountedPrice: string;
  availableStock: number;
}

interface MachineEntry {
  machine: Machine;
  variants: VariantRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Sale Dialog ──────────────────────────────────────────────────────────────

const SellMachineDialog = ({ open, onClose, onSuccess, initialCustomerId = "" }: { open: boolean; onClose: () => void; onSuccess: () => void; initialCustomerId?: string }) => {
  const [customers, setCustomers]           = useState<Customer[]>([]);
  const [customerId, setCustomerId]         = useState(initialCustomerId);
  const [machineSearch, setMachineSearch]   = useState("");
  const [machineResults, setMachineResults] = useState<Machine[]>([]);
  const [searching, setSearching]           = useState(false);
  const [dropdownOpen, setDropdownOpen]     = useState(false);
  const [entries, setEntries]               = useState<MachineEntry[]>([]);
  const [submitting, setSubmitting]         = useState(false);
  const searchRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchMachines = async (search = "") => {
    setSearching(true);
    try {
      const params: Record<string, string> = { status: "Active", limit: "10" };
      if (search.trim()) params.search = search.trim();
      const r = await api.get("/admin/machines", { params });
      setMachineResults(r.data.data);
    } catch {
      toast.error("Failed to load machines");
    } finally {
      setSearching(false);
    }
  };

  // sync customerId when initialCustomerId changes
  useEffect(() => { setCustomerId(initialCustomerId); }, [initialCustomerId]);

  // fetch active customers once on open
  useEffect(() => {
    if (!open) return;
    api.get("/admin/customers", { params: { status: "Active", limit: 100 } })
      .then((r) => setCustomers(r.data.data))
      .catch(() => toast.error("Failed to load customers"));
    fetchMachines();
  }, [open]);

  // debounced machine search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => fetchMachines(machineSearch), 400);
  }, [machineSearch]);

  // close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addMachine = (machine: Machine) => {
    if (entries.find((e) => e.machine._id === machine._id)) {
      toast.info("Machine already added");
      return;
    }
    const variants: VariantRow[] = machine.variants
      .filter((v) => v.currentStock > 0)
      .map((v) => ({
        attributeId:     typeof v.attribute === "string" ? v.attribute : v.attribute._id,
        attributeName:   typeof v.attribute === "string" ? "" : v.attribute.name,
        value:           v.value,
        quantity:        "",
        price:           "",
        discountedPrice: "",
        availableStock:  v.currentStock,
      }));
    
    if (variants.length === 0) {
      toast.error("This machine has no variants in stock");
      return;
    }
    
    setEntries((prev) => [...prev, { machine, variants }]);
  };

  const removeMachine = (machineId: string) =>
    setEntries((prev) => prev.filter((e) => e.machine._id !== machineId));

  const updateVariant = (mi: number, vi: number, field: keyof VariantRow, value: string) =>
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== mi ? e : {
          ...e,
          variants: e.variants.map((v, j) => j !== vi ? v : { ...v, [field]: value }),
        }
      )
    );

  const handleSubmit = async () => {
    if (!customerId) { toast.error("Please select a customer"); return; }
    if (entries.length === 0) { toast.error("Please add at least one machine"); return; }

    for (const entry of entries) {
      for (const v of entry.variants) {
        const hasQty   = v.quantity !== "" && Number(v.quantity) > 0;
        const hasPrice = v.price !== "";
        if (hasQty && !hasPrice) {
          toast.error(`Enter price for ${entry.machine.name} — ${v.attributeName}: ${v.value}`);
          return;
        }
        if (hasPrice && !hasQty) {
          toast.error(`Enter quantity for ${entry.machine.name} — ${v.attributeName}: ${v.value}`);
          return;
        }
        if (hasQty && Number(v.quantity) > v.availableStock) {
          toast.error(`Insufficient stock for ${entry.machine.name} — ${v.attributeName}: ${v.value}. Available: ${v.availableStock}`);
          return;
        }
        if (hasQty && hasPrice && v.discountedPrice !== "" && Number(v.discountedPrice) > Number(v.price)) {
          toast.error(`Discounted price cannot exceed price for ${entry.machine.name} — ${v.attributeName}: ${v.value}`);
          return;
        }
      }
    }

    const payload = {
      customerId,
      machines: entries.map((e) => ({
        machineId: e.machine._id,
        variants:  e.variants
          .filter((v) => v.quantity !== "" && Number(v.quantity) > 0 && v.price !== "")
          .map((v) => ({
            attribute:       v.attributeId,
            value:           v.value,
            quantity:        Number(v.quantity),
            price:           Number(v.price),
            discountedPrice: v.discountedPrice !== "" ? Number(v.discountedPrice) : null,
          })),
      })).filter((m) => m.variants.length > 0),
    };

    if (payload.machines.length === 0) {
      toast.error("Please fill quantity and price for at least one variant");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/admin/sales", payload);
      toast.success("Sale recorded successfully");
      onSuccess();
      handleClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to record sale");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setCustomerId(initialCustomerId);
    setMachineSearch("");
    setMachineResults([]);
    setDropdownOpen(false);
    setEntries([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-5xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Sell Machine</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2 flex-1 overflow-y-auto">
          {/* Customer */}
          <div className="space-y-1.5">
            <Label>Customer <span className="text-destructive">*</span></Label>
            <SearchableSelect
              options={customers.map((c) => ({ label: `${c.name} — ${c.phone}`, value: c._id }))}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Select customer"
              searchPlaceholder="Search customer..."
            />
          </div>

          {/* Machine search */}
          <div className="space-y-1.5">
            <Label>Add Machine</Label>
            <div className="relative" ref={wrapperRef}>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search machine by name..."
                  value={machineSearch}
                  onChange={(e) => setMachineSearch(e.target.value)}
                  onFocus={() => setDropdownOpen(true)}
                />
              </div>
              {dropdownOpen && (
                <div className="absolute z-50 w-full border rounded-md bg-background shadow-md divide-y max-h-48 overflow-y-auto mt-1">
                  {searching
                    ? <p className="text-xs text-muted-foreground px-3 py-2">Loading...</p>
                    : machineResults.length === 0
                      ? <p className="text-xs text-muted-foreground px-3 py-2">No machines found</p>
                      : machineResults.map((m) => (
                          <button
                            key={m._id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between focus:bg-muted focus:outline-none"
                            onClick={() => { addMachine(m); setDropdownOpen(false); }}
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            <span>{m.name}</span>
                            <span className="text-xs text-muted-foreground">{m.category?.name}</span>
                          </button>
                        ))
                  }
                </div>
              )}
            </div>
          </div>

          {/* Machine entries */}
          {entries.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Variants with empty quantity or price will be skipped. Stock will be automatically deducted.</span>
              </div>
              {entries.map((entry, mi) => (
                <div key={entry.machine._id} className="border rounded-lg p-4 space-y-3">
                  {/* Machine header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{entry.machine.name}</p>
                      {entry.machine.category && (
                        <p className="text-xs text-muted-foreground">{entry.machine.category.name}</p>
                      )}
                    </div>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-7 w-7 text-destructive" 
                      onClick={() => removeMachine(entry.machine._id)}
                      aria-label={`Remove ${entry.machine.name}`}
                      title={`Remove ${entry.machine.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Variants table */}
                  {entry.variants.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No variants available in stock.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b">
                            <th className="text-left font-medium pb-2 pr-3">Attribute</th>
                            <th className="text-left font-medium pb-2 pr-3">Value</th>
                            <th className="text-left font-medium pb-2 pr-3 w-20">Available</th>
                            <th className="text-left font-medium pb-2 pr-3 w-20">Qty <span className="text-destructive">*</span></th>
                            <th className="text-left font-medium pb-2 pr-3 w-24">Price <span className="text-destructive">*</span></th>
                            <th className="text-left font-medium pb-2 pr-3 w-24">Disc. Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.variants.map((v, vi) => (
                            <tr key={vi} className="border-b last:border-0">
                              <td className="py-1.5 pr-3">{v.attributeName}</td>
                              <td className="py-1.5 pr-3">{v.value}</td>
                              <td className="py-1.5 pr-3">
                                <span className={`font-medium ${v.availableStock < 10 ? "text-orange-600" : "text-green-600"}`}>
                                  {v.availableStock}
                                </span>
                              </td>
                              <td className="py-1.5 pr-3">
                                <Input
                                  type="number"
                                  min={1}
                                  max={v.availableStock}
                                  className="h-7 text-xs w-20"
                                  value={v.quantity}
                                  onChange={(e) => updateVariant(mi, vi, "quantity", e.target.value)}
                                />
                              </td>
                              <td className="py-1.5 pr-3">
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-7 text-xs w-24"
                                  value={v.price}
                                  onChange={(e) => updateVariant(mi, vi, "price", e.target.value)}
                                />
                              </td>
                              <td className="py-1.5 pr-3">
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-7 text-xs w-24"
                                  placeholder="—"
                                  value={v.discountedPrice}
                                  onChange={(e) => updateVariant(mi, vi, "discountedPrice", e.target.value)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            <Plus className="h-4 w-4" />
            {submitting ? "Recording..." : "Record Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const SellMachinesPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData]                       = useState<Sale[]>([]);
  const [filters, setFilters]                 = useState<Record<string, string>>({});
  const [fromDate, setFromDate]               = useState("");
  const [toDate, setToDate]                   = useState("");
  const [loading, setLoading]                 = useState(true);
  const [pagination, setPagination]           = useState({ page: 1, totalPages: 1, total: 0 });
  const [dialogOpen, setDialogOpen]           = useState(false);
  const [initialCustomerId, setInitialCustomerId] = useState("");
  const [customerOptions, setCustomerOptions] = useState<{ label: string; value: string }[]>([]);
  const [customerSearch, setCustomerSearch]   = useState("");
  const customerSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // auto-open dialog if customerId is in query params
  useEffect(() => {
    const cid = searchParams.get("customerId");
    if (cid) {
      setInitialCustomerId(cid);
      setDialogOpen(true);
    }
  }, [searchParams]);

  // fetch customer options for filter dropdown with debounce
  const fetchCustomerOptions = useCallback(async (search = "") => {
    try {
      const params: Record<string, string> = { status: "Active", limit: "100" };
      if (search.trim()) params.search = search.trim();
      const r = await api.get("/admin/customers", { params });
      setCustomerOptions(r.data.data.map((c: Customer) => ({
        label: `${c.name} — ${c.phone}`,
        value: c._id,
      })));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchCustomerOptions(); }, [fetchCustomerOptions]);

  useEffect(() => {
    if (customerSearchRef.current) clearTimeout(customerSearchRef.current);
    customerSearchRef.current = setTimeout(() => fetchCustomerOptions(customerSearch), 400);
  }, [customerSearch, fetchCustomerOptions]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchSales = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (filters.customerId && filters.customerId !== "all") params.customerId = filters.customerId;
      if (filters.category && filters.category !== "all") params.category = filters.category;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/sales", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({
        page:       res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        total:      res.data.pagination.total,
      });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch sales");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters, fromDate, toDate]);

  useEffect(() => { fetchSales(1); }, [fetchSales]);

  const columns: Column<Sale>[] = [
    {
      key: "_id", label: "No.",
      render: (_s, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span>,
    },
    {
      key: "customerInfo", label: "Customer Info",
      render: (s) => (
        <div>
          <p className="font-medium text-sm">{s.customerInfo.name}</p>
          <p className="text-xs text-muted-foreground">{s.customerInfo.phone}</p>
          <p className="text-xs text-muted-foreground">{s.customerInfo.email}</p>
        </div>
      ),
    },
    {
      key: "machinesCount", label: "Machines",
      render: (s) => <span className="font-medium">{s.machinesCount}</span>,
    },
    {
      key: "totalVariants", label: "Total Variants",
      render: (s) => <span className="font-medium">{s.totalVariants}</span>,
    },
    {
      key: "grandTotal", label: "Total Sold",
      render: (s) => <span className="font-medium">₹{s.grandTotal.toLocaleString()}</span>,
    },
    {
      key: "createdAt", label: "Sold At",
      render: (s) => {
        const { date, time } = formatDateTime(s.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions",
      render: (s) => (
        <Button 
          size="sm" 
          variant="outline" 
          className="text-xs h-7" 
          onClick={() => navigate(`/sell-machines/${s._id}`)}
          aria-label="View sale details"
          title="View sale details"
        >
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
            title="Sell Machines"
            description="Record and manage machine sales to customers"
            actionLabel="Sell Machine"
            actionIcon={ShoppingCart}
            onAction={() => { setInitialCustomerId(""); setDialogOpen(true); }}
          />
          <div className="flex justify-end flex-wrap gap-3 items-center">
            <SearchableSelect
              options={[{ label: "All Customers", value: "" }, ...customerOptions]}
              value={filters.customerId || ""}
              onChange={(v) => setFilters((prev) => ({ ...prev, customerId: v }))}
              placeholder="All Customers"
              searchPlaceholder="Search customer..."
              onSearchChange={setCustomerSearch}
              className="w-[220px] h-9 text-sm"
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" />
            </div>
            {(filters.customerId || fromDate || toDate) && (
              <Button variant="outline" size="sm" onClick={() => { setFilters({}); setFromDate(""); setToDate(""); }} className="h-9">
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div>
            <DataTable columns={columns} data={data} />
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={LIMIT}
            onPageChange={fetchSales}
          />
        </>
      )}

      <SellMachineDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setInitialCustomerId(""); navigate("/sell-machines", { replace: true }); }}
        onSuccess={() => fetchSales(1)}
        initialCustomerId={initialCustomerId}
      />
    </div>
  );
};

export default SellMachinesPage;
