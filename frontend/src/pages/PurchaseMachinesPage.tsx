import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingBag, Eye, Plus, Trash2, Search, X, Info, Package, Download } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  machinesCount: number;
  totalVariants: number;
  grandTotal: number;
  createdAt: string;
}

interface Stats {
  totalPurchased: number;
  totalMachinesPurchased: number;
  totalVariantsPurchased: number;
  avgPurchaseValue: number;
}

interface Vendor {
  _id: string;
  name: string;
  companyName: string;
  phone: string;
}

interface MachineVariant {
  attribute: { _id: string; name: string } | string;
  value: string;
}

interface Machine {
  _id: string;
  name: string;
  category?: { _id: string; name: string };
  variants: MachineVariant[];
}

interface VariantRow {
  attributeId: string;
  attributeName: string;
  value: string;
  quantity: string;
  price: string;
  discountedPrice: string;
  sellingPrice: string;
  discountedSellingPrice: string;
  willAddToInventory: boolean;
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

// ─── Purchase Dialog ──────────────────────────────────────────────────────────

const PurchaseMachineDialog = ({ open, onClose, onSuccess, initialVendorId = "" }: { open: boolean; onClose: () => void; onSuccess: () => void; initialVendorId?: string }) => {
  const [vendors, setVendors]               = useState<Vendor[]>([]);
  const [vendorId, setVendorId]             = useState(initialVendorId);
  const [machineSearch, setMachineSearch]   = useState("");
  const [machineResults, setMachineResults] = useState<Machine[]>([]);
  const [searching, setSearching]           = useState(false);
  const [dropdownOpen, setDropdownOpen]     = useState(false);
  const [entries, setEntries]               = useState<MachineEntry[]>([]);
  const [submitting, setSubmitting]         = useState(false);
  const [createVendorDialog, setCreateVendorDialog] = useState(false);
  const [vendorForm, setVendorForm]         = useState({ name: "", companyName: "", phone: "", email: "", address: "", gstNumber: "" });
  const searchRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const machineInputRef = useRef<HTMLInputElement>(null);

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

  const fetchVendors = async () => {
    try {
      const r = await api.get("/admin/vendors", { params: { status: "Active", limit: 100 } });
      setVendors(r.data.data);
    } catch {
      toast.error("Failed to load vendors");
    }
  };

  // sync vendorId when initialVendorId changes (e.g. opened from vendor page)
  useEffect(() => { setVendorId(initialVendorId); }, [initialVendorId]);

  // fetch active vendors once on open
  useEffect(() => {
    if (!open) return;
    fetchVendors();
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
    const variants: VariantRow[] = machine.variants.map((v) => ({
      attributeId:            typeof v.attribute === "string" ? v.attribute : v.attribute._id,
      attributeName:          typeof v.attribute === "string" ? "" : v.attribute.name,
      value:                  v.value,
      quantity:               "",
      price:                  "",
      discountedPrice:        "",
      sellingPrice:           "",
      discountedSellingPrice: "",
      willAddToInventory:     true,
    }));
    setEntries((prev) => [...prev, { machine, variants }]);
    setMachineSearch("");
    setDropdownOpen(false);
    machineInputRef.current?.blur();
  };

  const removeMachine = (machineId: string) =>
    setEntries((prev) => prev.filter((e) => e.machine._id !== machineId));

  const updateVariant = (mi: number, vi: number, field: keyof VariantRow, value: string | boolean) =>
    setEntries((prev) =>
      prev.map((e, i) =>
        i !== mi ? e : {
          ...e,
          variants: e.variants.map((v, j) => j !== vi ? v : { ...v, [field]: value }),
        }
      )
    );

  const handleSubmit = async () => {
    if (!vendorId) { toast.error("Please select a vendor"); return; }
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
        if (hasQty && hasPrice && v.discountedPrice !== "" && Number(v.discountedPrice) > Number(v.price)) {
          toast.error(`Discounted buying price cannot exceed buying price for ${entry.machine.name} — ${v.attributeName}: ${v.value}`);
          return;
        }
        const isParts = entry.machine.category?._id === import.meta.env.VITE_PARTS_CATEGORY_ID;
        if (isParts && hasQty && !v.sellingPrice) {
          toast.error(`Selling price is required for ${entry.machine.name} — ${v.attributeName}: ${v.value}`);
          return;
        }
        if (isParts && v.sellingPrice !== "" && v.discountedSellingPrice !== "" && Number(v.discountedSellingPrice) > Number(v.sellingPrice)) {
          toast.error(`Discounted selling price cannot exceed selling price for ${entry.machine.name} — ${v.attributeName}: ${v.value}`);
          return;
        }
      }
    }

    const payload = {
      vendorId,
      machines: entries.map((e) => ({
        machineId: e.machine._id,
        variants:  e.variants
          .filter((v) => v.quantity !== "" && Number(v.quantity) > 0 && v.price !== "")
          .map((v) => ({
            attribute:              v.attributeId,
            value:                  v.value,
            quantity:               Number(v.quantity),
            price:                  Number(v.price),
            discountedPrice:        v.discountedPrice !== "" ? Number(v.discountedPrice) : null,
            sellingPrice:           v.sellingPrice !== "" ? Number(v.sellingPrice) : null,
            discountedSellingPrice: v.discountedSellingPrice !== "" ? Number(v.discountedSellingPrice) : null,
            willAddToInventory:     v.willAddToInventory,
          })),
      })).filter((m) => m.variants.length > 0),
    };

    if (payload.machines.length === 0) {
      toast.error("Please fill quantity and price for at least one variant");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/admin/purchases", payload);
      toast.success("Purchase recorded successfully");
      onSuccess();
      handleClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to record purchase");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateVendor = async () => {
    if (!vendorForm.name || !vendorForm.companyName || !vendorForm.phone || !vendorForm.email) {
      toast.error("Name, company name, phone and email are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/admin/vendors", { ...vendorForm, status: "Active" });
      toast.success("Vendor created successfully");
      await fetchVendors();
      setCreateVendorDialog(false);
      setVendorForm({ name: "", companyName: "", phone: "", email: "", address: "", gstNumber: "" });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create vendor");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setVendorId(initialVendorId);
    setMachineSearch("");
    setMachineResults([]);
    setDropdownOpen(false);
    setEntries([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-7xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Record Machine Purchase</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2 flex-1 overflow-y-auto">
          {/* Vendor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Vendor <span className="text-destructive">*</span></Label>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs gap-1.5" 
                onClick={() => setCreateVendorDialog(true)}
              >
                <Plus className="h-3 w-3" /> Create New Vendor
              </Button>
            </div>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v._id} value={v._id}>
                    {v.companyName} — {v.name} ({v.phone})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Machine search */}
          <div className="space-y-1.5">
            <Label>Add Machine</Label>
            <div className="relative" ref={wrapperRef}>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={machineInputRef}
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
                            onClick={() => { addMachine(m); }}
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
                <span>Variants with empty quantity or price will be skipped and not included in the purchase.</span>
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
                    <p className="text-xs text-muted-foreground">This machine has no variants.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b">
                            <th className="text-left font-medium pb-2 pr-3">Attribute</th>
                            <th className="text-left font-medium pb-2 pr-3">Value</th>
                            <th className="text-left font-medium pb-2 pr-3 w-20">Qty <span className="text-destructive">*</span></th>
                            <th className="text-left font-medium pb-2 pr-3 w-24">Buying Price <span className="text-destructive">*</span></th>
                            <th className="text-left font-medium pb-2 pr-3 w-24">Discounted Buying Price</th>
                            {entry.machine.category?._id === import.meta.env.VITE_PARTS_CATEGORY_ID && (
                              <>
                                <th className="text-left font-medium pb-2 pr-3 w-24">Selling Price <span className="text-destructive">*</span></th>
                                <th className="text-left font-medium pb-2 pr-3 w-24">Discounted Selling Price</th>
                              </>
                            )}
                            <th className="text-left font-medium pb-2 pr-3 w-24">Total</th>
                            <th className="text-center font-medium pb-2">Add to Inv.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.variants.map((v, vi) => (
                            <tr key={vi} className="border-b last:border-0">
                              <td className="py-1.5 pr-3">{v.attributeName}</td>
                              <td className="py-1.5 pr-3">{v.value}</td>
                              <td className="py-1.5 pr-3">
                                <Input
                                  type="number"
                                  min={1}
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
                              {entry.machine.category?._id === import.meta.env.VITE_PARTS_CATEGORY_ID && (
                                <>
                                  <td className="py-1.5 pr-3">
                                    <Input
                                      type="number"
                                      min={0}
                                      className="h-7 text-xs w-24"
                                      placeholder="—"
                                      value={v.sellingPrice}
                                      onChange={(e) => updateVariant(mi, vi, "sellingPrice", e.target.value)}
                                    />
                                  </td>
                                  <td className="py-1.5 pr-3">
                                    <Input
                                      type="number"
                                      min={0}
                                      className="h-7 text-xs w-24"
                                      placeholder="—"
                                      value={v.discountedSellingPrice}
                                      onChange={(e) => updateVariant(mi, vi, "discountedSellingPrice", e.target.value)}
                                    />
                                  </td>
                                </>
                              )}
                              <td className="py-1.5 pr-3">
                                {v.quantity && v.price ? (
                                  <span className="text-xs font-medium text-foreground">
                                    ₹{((Number(v.discountedPrice) || Number(v.price)) * Number(v.quantity)).toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                              <td className="py-1.5 text-center">
                                {v.quantity !== "" && Number(v.quantity) > 0 && v.price !== "" ? (
                                  <Switch
                                    checked={v.willAddToInventory}
                                    onCheckedChange={(val) => updateVariant(mi, vi, "willAddToInventory", val)}
                                  />
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
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
            {submitting ? "Recording..." : "Record Purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Create Vendor Dialog */}
      <Dialog open={createVendorDialog} onOpenChange={(o) => { if (!o) { setCreateVendorDialog(false); setVendorForm({ name: "", companyName: "", phone: "", email: "", address: "", gstNumber: "" }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Contact person name" value={vendorForm.name} onChange={(e) => setVendorForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Company Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Company / firm name" value={vendorForm.companyName} onChange={(e) => setVendorForm((prev) => ({ ...prev, companyName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. 9800000000" value={vendorForm.phone} onChange={(e) => setVendorForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" placeholder="vendor@company.com" value={vendorForm.email} onChange={(e) => setVendorForm((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input placeholder="Full address" value={vendorForm.address} onChange={(e) => setVendorForm((prev) => ({ ...prev, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>GST Number</Label>
              <Input placeholder="e.g. 27AABCG1234A1Z5" value={vendorForm.gstNumber} onChange={(e) => setVendorForm((prev) => ({ ...prev, gstNumber: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateVendorDialog(false); setVendorForm({ name: "", companyName: "", phone: "", email: "", address: "", gstNumber: "" }); }} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreateVendor} disabled={submitting}>{submitting ? "Creating..." : "Create Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const PurchaseMachinesPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData]                       = useState<Purchase[]>([]);
  const [stats, setStats]                     = useState<Stats | null>(null);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters]                 = useState<Record<string, string>>({});
  const [fromDate, setFromDate]               = useState("");
  const [toDate, setToDate]                   = useState("");
  const [loading, setLoading]                 = useState(true);
  const [pageSize, setPageSize]               = useState(10);
  const [pagination, setPagination]           = useState({ page: 1, totalPages: 1, total: 0 });
  const [dialogOpen, setDialogOpen]           = useState(false);
  const [exportDialog, setExportDialog]       = useState(false);
  const [initialVendorId, setInitialVendorId] = useState("");
  const [vendorOptions, setVendorOptions]     = useState<{ label: string; value: string }[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [divisionOptions, setDivisionOptions] = useState<{ label: string; value: string }[]>([]);
  const [machineOptions, setMachineOptions]   = useState<{ label: string; value: string }[]>([]);
  const vendorAbortRef = useRef<AbortController | null>(null);
  const categoryAbortRef = useRef<AbortController | null>(null);
  const divisionAbortRef = useRef<AbortController | null>(null);
  const machineAbortRef = useRef<AbortController | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  // auto-open dialog if vendorId is in query params
  useEffect(() => {
    const vid = searchParams.get("vendorId");
    if (vid) {
      setInitialVendorId(vid);
      setDialogOpen(true);
    }
  }, [searchParams]);

  // Fetch filter options on mount
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [vendorRes, categoryRes, divisionRes, machineRes] = await Promise.all([
          api.get("/admin/vendors", { params: { limit: 10 } }),
          api.get("/admin/machine-categories", { params: { limit: 10 } }),
          api.get("/admin/machine-divisions", { params: { limit: 10 } }),
          api.get("/admin/machines", { params: { limit: 10 } }),
        ]);
        setVendorOptions(vendorRes.data.data.map((v: any) => ({ label: `${v.companyName} - ${v.name}`, value: v._id })));
        setCategoryOptions(categoryRes.data.data.map((c: any) => ({ label: c.name, value: c._id })));
        setDivisionOptions(divisionRes.data.data.map((d: any) => ({ label: d.name, value: d._id })));
        setMachineOptions(machineRes.data.data.map((m: any) => ({ label: m.name, value: m._id })));
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
        setVendorOptions(res.data.data.map((v: any) => ({ label: `${v.companyName} - ${v.name}`, value: v._id })));
      }
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        console.error("Failed to fetch vendors", err);
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
        setCategoryOptions(res.data.data.map((c: any) => ({ label: c.name, value: c._id })));
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
        setDivisionOptions(res.data.data.map((d: any) => ({ label: d.name, value: d._id })));
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
        setMachineOptions(res.data.data.map((m: any) => ({ label: m.name, value: m._id })));
      }
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        console.error("Failed to fetch machines", err);
      }
    }
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const fetchPurchases = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(pageSize) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.vendor && filters.vendor !== "all" && filters.vendor !== "") params.vendorId = filters.vendor;
      if (filters.category && filters.category !== "all" && filters.category !== "") params.category = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") params.division = filters.division;
      if (filters.machine && filters.machine !== "all" && filters.machine !== "") params.machineId = filters.machine;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/purchases", { params, signal: controller.signal });
      setData(res.data.data);
      setStats(res.data.stats || null);
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
  }, [debouncedSearch, filters, fromDate, toDate, pageSize]);

  const handleExport = async () => {
    setExportDialog(false);
    toast.success("Download starting...");
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.vendor && filters.vendor !== "all" && filters.vendor !== "") params.vendorId = filters.vendor;
      if (filters.category && filters.category !== "all" && filters.category !== "") params.category = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") params.division = filters.division;
      if (filters.machine && filters.machine !== "all" && filters.machine !== "") params.machineId = filters.machine;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/purchases/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "purchases_export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  useEffect(() => { fetchPurchases(1); }, [fetchPurchases]);

  const columns: Column<Purchase>[] = [
    {
      key: "_id", label: "No.",
      render: (_p, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * pageSize + i + 1}</span>,
    },
    {
      key: "vendorInfo", label: "Vendor Info",
      render: (p) => (
        <div>
          <p className="font-medium text-sm">{p.vendorInfo.companyName}</p>
          <p className="text-xs text-muted-foreground">{p.vendorInfo.name}</p>
          <p className="text-xs text-muted-foreground">{p.vendorInfo.phone}</p>
        </div>
      ),
    },
    {
      key: "machinesCount", label: "Machines",
      render: (p) => <span className="font-medium">{p.machinesCount}</span>,
    },
    {
      key: "totalVariants", label: "Total Variants",
      render: (p) => <span className="font-medium">{p.totalVariants}</span>,
    },
    {
      key: "grandTotal", label: "Total Purchased",
      render: (p) => <span className="font-medium">₹{p.grandTotal.toLocaleString()}</span>,
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
      render: (p) => (
        <Button 
          size="sm" 
          variant="outline" 
          className="text-xs h-7" 
          onClick={() => navigate(`/purchase-machines/${p._id}`)}
          aria-label="View purchase details"
          title="View purchase details"
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
            title="Purchase Machines"
            description="Record and manage machine purchases from vendors"
            actionLabel="Purchase Machine"
            actionIcon={ShoppingBag}
            onAction={() => { setInitialVendorId(""); setDialogOpen(true); }}
          >
            <Button variant="outline" className="gap-2" onClick={() => setExportDialog(true)}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </PageHeader>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Purchased</p>
                      <p className="text-2xl font-bold mt-1">₹{stats.totalPurchased.toLocaleString()}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <ShoppingBag className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Machines Purchased</p>
                      <p className="text-2xl font-bold mt-1">{stats.totalMachinesPurchased}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                      <Package className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Variants Purchased</p>
                      <p className="text-2xl font-bold mt-1">{stats.totalVariantsPurchased}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                      <Package className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Purchase Value</p>
                      <p className="text-2xl font-bold mt-1">₹{stats.avgPurchaseValue.toLocaleString()}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                      <ShoppingBag className="h-6 w-6 text-orange-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Row 1: Search + Date Range + Clear */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by vendor, machine, model..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" />
              </div>
              {(search || fromDate || toDate || Object.values(filters).some(v => v && v !== "all")) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); }} className="h-9">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: Filters right-aligned */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SearchableSelect options={vendorOptions} value={filters.vendor ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, vendor: v }))} onSearchChange={fetchVendors} placeholder="Vendor" searchPlaceholder="Search vendors..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={categoryOptions} value={filters.category ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, category: v }))} onSearchChange={fetchCategories} placeholder="Category" searchPlaceholder="Search categories..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={divisionOptions} value={filters.division ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, division: v }))} onSearchChange={fetchDivisions} placeholder="Division" searchPlaceholder="Search divisions..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={machineOptions} value={filters.machine ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, machine: v }))} onSearchChange={fetchMachines} placeholder="Machine" searchPlaceholder="Search machines..." className="w-[160px] h-9 text-sm" />
          </div>
          <div>
            <DataTable columns={columns} data={data} pageSize={999} />
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pageSize}
            onPageChange={fetchPurchases}
          />
        </>
      )}

      <PurchaseMachineDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setInitialVendorId(""); navigate("/purchase-machines", { replace: true }); }}
        onSuccess={() => fetchPurchases(1)}
        initialVendorId={initialVendorId}
      />

      {/* Export Confirm Dialog */}
      <Dialog open={exportDialog} onOpenChange={setExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Purchase Data</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            Do you want to download all purchase data as an Excel file?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialog(false)}>Cancel</Button>
            <Button onClick={handleExport}>Yes, Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseMachinesPage;
