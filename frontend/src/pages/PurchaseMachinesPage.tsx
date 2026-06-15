import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingBag, Eye, Plus, Trash2, Search, X, Info, Package, Download, Hash } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

const PARTS_CATEGORY_ID = import.meta.env.VITE_PARTS_CATEGORY_ID;

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorInfo { vendorId: string | null; name: string; companyName: string; phone: string; email: string; gstNumber: string; }
interface PurchaseMachine {
  machineId: string; machineName: string; modelNumber: string; category: string; categoryId: string; division: string;
  quantity: number; buyingPrice: number; discountedBuyingPrice: number | null;
  sellingPrice: number | null; discountedSellingPrice: number | null; buyingTotal: number;
  serialNumbers?: { serialNumber: string; status: string }[];
  partCodes?: { partCode: string; status: string }[];
}
interface Purchase { _id: string; vendorInfo: VendorInfo; machines: PurchaseMachine[]; machinesCount: number; grandTotal: number; createdAt: string; }
interface Stats { totalPurchased: number; totalMachinesPurchased: number; avgPurchaseValue: number; }
interface Vendor { _id: string; name: string; companyName: string; phone: string; }
interface Machine { _id: string; name: string; modelNumber: string; category?: { _id: string; name: string }; }

interface MachineEntry {
  machine: Machine;
  quantity: string;
  buyingPrice: string;
  discountedBuyingPrice: string;
  sellingPrice: string;
  discountedSellingPrice: string;
  serialNumbers: string[];
  partCodes: string[];
}

interface CodesDialogState {
  mi: number;
  machineName: string;
  isParts: boolean;
  quantity: number;
  codes: string[];
  saving: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return {
    date: `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`,
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
};
const toISTDateParam = (htmlDate: string) => { const [y,m,d] = htmlDate.split("-"); return `${d}/${m}/${String(y).slice(2)}`; };

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
  const [codesDialog, setCodesDialog]       = useState<CodesDialogState | null>(null);
  const searchRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const machineInputRef = useRef<HTMLInputElement>(null);

  const fetchMachines = async (search = "") => {
    setSearching(true);
    try {
      const params: Record<string, string> = { status: "Active", limit: "10" };
      if (search.trim()) params.search = search.trim();
      const r = await api.get("/admin/machines", { params });
      setMachineResults(r.data.data);
    } catch { toast.error("Failed to load machines"); }
    finally { setSearching(false); }
  };

  const fetchVendors = async () => {
    try {
      const r = await api.get("/admin/vendors", { params: { status: "Active", limit: 100 } });
      setVendors(r.data.data);
    } catch { toast.error("Failed to load vendors"); }
  };

  useEffect(() => { setVendorId(initialVendorId); }, [initialVendorId]);
  useEffect(() => { if (!open) return; fetchVendors(); fetchMachines(); }, [open]);
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => fetchMachines(machineSearch), 400);
  }, [machineSearch]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setDropdownOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addMachine = (machine: Machine) => {
    if (entries.find((e) => e.machine._id === machine._id)) { toast.info("Machine already added"); return; }
    setEntries((prev) => [...prev, { machine, quantity: "", buyingPrice: "", discountedBuyingPrice: "", sellingPrice: "", discountedSellingPrice: "", serialNumbers: [], partCodes: [] }]);
    setMachineSearch(""); setDropdownOpen(false); machineInputRef.current?.blur();
  };

  const removeMachine = (id: string) => setEntries((prev) => prev.filter((e) => e.machine._id !== id));

  const updateEntry = (mi: number, field: keyof MachineEntry, value: any) =>
    setEntries((prev) => prev.map((e, i) => i !== mi ? e : { ...e, [field]: value }));

  const openCodesDialog = (mi: number) => {
    const e      = entries[mi];
    const isParts = e.machine.category?._id === PARTS_CATEGORY_ID;
    const qty    = Number(e.quantity) || 0;
    const existing = isParts ? [...e.partCodes] : [...e.serialNumbers];
    const codes  = existing.length > 0 ? existing : Array.from({ length: qty }, () => "");
    setCodesDialog({ mi, machineName: e.machine.name, isParts, quantity: qty, codes: codes.slice(0, qty), saving: false });
  };

  const saveCodes = async () => {
    if (!codesDialog) return;
    const { mi, codes, quantity, isParts } = codesDialog;
    for (let i = 0; i < quantity; i++) {
      if (!codes[i]?.trim()) { toast.error(`${isParts ? "Part code" : "Serial number"} ${i + 1} is empty`); return; }
    }
    const trimmed = codes.map((c) => c.trim());
    const unique  = new Set(trimmed.map((c) => c.toUpperCase()));
    if (unique.size !== trimmed.length) { toast.error("Duplicate codes in the list"); return; }

    setCodesDialog((prev) => prev ? { ...prev, saving: true } : prev);
    try {
      const endpoint = isParts ? "/admin/purchases/verify-part-codes" : "/admin/purchases/verify-serial-numbers";
      const key      = isParts ? "partCodes" : "serialNumbers";
      const res      = await api.post(endpoint, { [key]: trimmed });
      if (!res.data.available) {
        toast.error(`Already exist: ${res.data.duplicates.join(", ")}`);
        setCodesDialog((prev) => prev ? { ...prev, saving: false } : prev);
        return;
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Verification failed");
      setCodesDialog((prev) => prev ? { ...prev, saving: false } : prev);
      return;
    }
    updateEntry(mi, isParts ? "partCodes" : "serialNumbers", trimmed);
    setCodesDialog(null);
  };

  const handleSubmit = async () => {
    if (!vendorId)           { toast.error("Please select a vendor"); return; }
    if (entries.length === 0) { toast.error("Please add at least one machine"); return; }

    for (const e of entries) {
      if (!e.quantity || Number(e.quantity) <= 0) { toast.error(`Enter quantity for ${e.machine.name}`); return; }
      if (!e.buyingPrice)                          { toast.error(`Enter buying price for ${e.machine.name}`); return; }
      const isParts = e.machine.category?._id === PARTS_CATEGORY_ID;
      if (isParts) {
        if (e.partCodes.length !== Number(e.quantity)) { toast.error(`Enter ${e.quantity} part codes for ${e.machine.name}`); return; }
      } else {
        if (e.serialNumbers.length !== Number(e.quantity)) { toast.error(`Enter ${e.quantity} serial numbers for ${e.machine.name}`); return; }
      }
    }

    const payload = {
      vendorId,
      machines: entries.map((e) => {
        const isParts = e.machine.category?._id === PARTS_CATEGORY_ID;
        return {
          machineId:              e.machine._id,
          quantity:               Number(e.quantity),
          buyingPrice:            Number(e.buyingPrice),
          discountedBuyingPrice:  e.discountedBuyingPrice !== "" ? Number(e.discountedBuyingPrice) : null,
          sellingPrice:           e.sellingPrice !== "" ? Number(e.sellingPrice) : null,
          discountedSellingPrice: e.discountedSellingPrice !== "" ? Number(e.discountedSellingPrice) : null,
          ...(isParts ? { partCodes: e.partCodes } : { serialNumbers: e.serialNumbers }),
        };
      }),
    };

    setSubmitting(true);
    try {
      await api.post("/admin/purchases", payload);
      toast.success("Purchase recorded successfully");
      onSuccess(); handleClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to record purchase");
    } finally { setSubmitting(false); }
  };

  const handleCreateVendor = async () => {
    if (!vendorForm.name || !vendorForm.companyName || !vendorForm.phone || !vendorForm.email) { toast.error("Name, company, phone and email are required"); return; }
    setSubmitting(true);
    try {
      await api.post("/admin/vendors", { ...vendorForm, status: "Active" });
      toast.success("Vendor created successfully");
      await fetchVendors();
      setCreateVendorDialog(false);
      setVendorForm({ name: "", companyName: "", phone: "", email: "", address: "", gstNumber: "" });
    } catch (err: any) { toast.error(err.response?.data?.message || "Failed to create vendor"); }
    finally { setSubmitting(false); }
  };

  const handleClose = () => { setVendorId(initialVendorId); setMachineSearch(""); setMachineResults([]); setDropdownOpen(false); setEntries([]); onClose(); };

  const buyingTotal = entries.reduce((sum, e) => {
    if (!e.quantity || !e.buyingPrice) return sum;
    return sum + (Number(e.discountedBuyingPrice) || Number(e.buyingPrice)) * Number(e.quantity);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Record Machine Purchase</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Select a vendor and add machines to record a purchase</p>
          </div>
        </div>

        {/* Body: two-panel */}
        <div className="flex flex-1 min-h-0">

          {/* Left panel — vendor + machine search */}
          <div className="w-72 shrink-0 border-r flex flex-col bg-muted/30">
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">

              {/* Vendor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor <span className="text-destructive">*</span></Label>
                  <button type="button" className="text-xs text-primary hover:underline flex items-center gap-1" onClick={() => setCreateVendorDialog(true)}>
                    <Plus className="h-3 w-3" /> New
                  </button>
                </div>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v._id} value={v._id}>
                        <div>
                          <p className="font-medium text-sm">{v.companyName}</p>
                          <p className="text-xs text-muted-foreground">{v.name} · {v.phone}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Divider */}
              <div className="border-t" />

              {/* Machine search */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add Machine</Label>
                <div className="relative" ref={wrapperRef}>
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input ref={machineInputRef} className="pl-8 h-9 text-sm bg-background" placeholder="Search by name..." value={machineSearch}
                    onChange={(e) => setMachineSearch(e.target.value)} onFocus={() => setDropdownOpen(true)} />
                  {dropdownOpen && (
                    <div className="absolute z-50 w-full border rounded-md bg-background shadow-lg divide-y max-h-56 overflow-y-auto mt-1">
                      {searching
                        ? <p className="text-xs text-muted-foreground px-3 py-2.5">Loading...</p>
                        : machineResults.length === 0
                          ? <p className="text-xs text-muted-foreground px-3 py-2.5">No machines found</p>
                          : machineResults.map((m) => (
                              <button key={m._id} type="button"
                                className="w-full text-left px-3 py-2.5 hover:bg-muted flex items-center justify-between focus:bg-muted focus:outline-none"
                                onClick={() => addMachine(m)} onMouseDown={(e) => e.preventDefault()}>
                                <span className="text-sm font-medium">{m.name}</span>
                                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{m.category?.name}</span>
                              </button>
                            ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Parts machines use part codes. Others use serial numbers. Count must match quantity.</span>
              </div>

              {/* Machine chips */}
              {entries.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Added ({entries.length})</Label>
                  <div className="flex flex-col gap-1">
                    {entries.map((e) => (
                      <div key={e.machine._id} className="flex items-center justify-between rounded-md bg-background border px-2.5 py-1.5">
                        <div>
                          <p className="text-xs font-medium leading-tight">{e.machine.name}</p>
                          {e.machine.category && <p className="text-[10px] text-muted-foreground">{e.machine.category.name}</p>}
                        </div>
                        <button type="button" className="text-destructive hover:text-destructive/80 ml-2 shrink-0" onClick={() => removeMachine(e.machine._id)}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right panel — machine entries */}
          <div className="flex-1 flex flex-col min-w-0">
            {entries.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                <Package className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">No machines added yet</p>
                <p className="text-xs mt-1">Search and select machines from the left panel</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {entries.map((entry, mi) => {
                  const isParts = entry.machine.category?._id === PARTS_CATEGORY_ID;
                  const qty     = Number(entry.quantity) || 0;
                  const codes   = isParts ? entry.partCodes : entry.serialNumbers;
                  const codesOk = codes.length === qty && qty > 0;
                  return (
                    <div key={entry.machine._id} className="rounded-xl border bg-background shadow-sm overflow-hidden">
                      {/* Machine header */}
                      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
                        <div>
                          <p className="font-semibold text-sm">{entry.machine.name}</p>
                          {entry.machine.category && <p className="text-xs text-muted-foreground">{entry.machine.category.name}</p>}
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => removeMachine(entry.machine._id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {/* Fields */}
                      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Qty <span className="text-destructive">*</span></Label>
                          <Input type="number" min={1} className="h-8 text-sm" value={entry.quantity}
                            onChange={(e) => { updateEntry(mi, "quantity", e.target.value); updateEntry(mi, isParts ? "partCodes" : "serialNumbers", []); }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{isParts ? "Part Codes" : "Serial Nos"}</Label>
                          <Button type="button" variant="outline" size="sm"
                            className={`h-8 text-xs gap-1.5 w-full font-normal ${ codesOk ? "border-green-400 text-green-600 bg-green-50" : "" }`}
                            disabled={!entry.quantity || Number(entry.quantity) === 0}
                            onClick={() => openCodesDialog(mi)}>
                            <Hash className="h-3.5 w-3.5" />
                            {codesOk ? `${codes.length} saved ✓` : `Enter ${isParts ? "Part Codes" : "Serial Nos"}`}
                          </Button>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Buying Price <span className="text-destructive">*</span></Label>
                          <Input type="number" min={0} className="h-8 text-sm" placeholder="0" value={entry.buyingPrice}
                            onChange={(e) => updateEntry(mi, "buyingPrice", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Disc. Buying Price</Label>
                          <Input type="number" min={0} className="h-8 text-sm" placeholder="—" value={entry.discountedBuyingPrice}
                            onChange={(e) => updateEntry(mi, "discountedBuyingPrice", e.target.value)} />
                        </div>
                        {isParts && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Selling Price</Label>
                            <Input type="number" min={0} className="h-8 text-sm" placeholder="—" value={entry.sellingPrice}
                              onChange={(e) => updateEntry(mi, "sellingPrice", e.target.value)} />
                          </div>
                        )}
                        {isParts && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Disc. Selling Price</Label>
                            <Input type="number" min={0} className="h-8 text-sm" placeholder="—" value={entry.discountedSellingPrice}
                              onChange={(e) => updateEntry(mi, "discountedSellingPrice", e.target.value)} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div className="border-t px-4 py-3 flex items-center justify-between gap-4 shrink-0 bg-background">
              <span className="text-sm font-medium">
                Buying Total: <span className="text-base font-bold text-green-600">₹{buyingTotal.toLocaleString()}</span>
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                  <Plus className="h-4 w-4" />{submitting ? "Recording..." : "Record Purchase"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Codes Dialog */}
      {codesDialog && (
        <Dialog open onOpenChange={(o) => { if (!o) setCodesDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enter {codesDialog.isParts ? "Part Codes" : "Serial Numbers"} — {codesDialog.machineName}</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">{codesDialog.quantity} unit{codesDialog.quantity > 1 ? "s" : ""}</p>
            <div className="space-y-3 py-2 max-h-80 overflow-y-auto">
              {Array.from({ length: codesDialog.quantity }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Label className="text-xs">Unit {i + 1}</Label>
                  <Input className="h-8 text-xs" placeholder={codesDialog.isParts ? `e.g. PT-00${i+1}` : `e.g. SN-00${i+1}`}
                    value={codesDialog.codes[i] ?? ""}
                    onChange={(e) => setCodesDialog((prev) => {
                      if (!prev) return prev;
                      const codes = [...prev.codes]; codes[i] = e.target.value; return { ...prev, codes };
                    })} />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCodesDialog(null)} disabled={codesDialog.saving}>Cancel</Button>
              <Button onClick={saveCodes} disabled={codesDialog.saving}>{codesDialog.saving ? "Verifying..." : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Vendor Dialog */}
      <Dialog open={createVendorDialog} onOpenChange={(o) => { if (!o) { setCreateVendorDialog(false); setVendorForm({ name: "", companyName: "", phone: "", email: "", address: "", gstNumber: "" }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Vendor</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name <span className="text-destructive">*</span></Label><Input placeholder="Contact person name" value={vendorForm.name} onChange={(e) => setVendorForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Company Name <span className="text-destructive">*</span></Label><Input placeholder="Company / firm name" value={vendorForm.companyName} onChange={(e) => setVendorForm((p) => ({ ...p, companyName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone <span className="text-destructive">*</span></Label><Input placeholder="e.g. 9800000000" value={vendorForm.phone} onChange={(e) => setVendorForm((p) => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email <span className="text-destructive">*</span></Label><Input type="email" placeholder="vendor@company.com" value={vendorForm.email} onChange={(e) => setVendorForm((p) => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Address</Label><Input placeholder="Full address" value={vendorForm.address} onChange={(e) => setVendorForm((p) => ({ ...p, address: e.target.value }))} /></div>
            <div className="space-y-2"><Label>GST Number</Label><Input placeholder="e.g. 27AABCG1234A1Z5" value={vendorForm.gstNumber} onChange={(e) => setVendorForm((p) => ({ ...p, gstNumber: e.target.value }))} /></div>
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
  const [pageSize]                            = useState(10);
  const [pagination, setPagination]           = useState({ page: 1, totalPages: 1, total: 0 });
  const [dialogOpen, setDialogOpen]           = useState(false);
  const [exportDialog, setExportDialog]       = useState(false);
  const [codesPopup, setCodesPopup]           = useState<{ title: string; isParts: boolean; items: { code: string; status: string }[] } | null>(null);
  const [initialVendorId, setInitialVendorId] = useState("");
  const [vendorOptions, setVendorOptions]     = useState<{ label: string; value: string }[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [divisionOptions, setDivisionOptions] = useState<{ label: string; value: string }[]>([]);
  const [machineOptions, setMachineOptions]   = useState<{ label: string; value: string }[]>([]);
  const abortRef         = useRef<AbortController | null>(null);
  const vendorAbortRef   = useRef<AbortController | null>(null);
  const categoryAbortRef = useRef<AbortController | null>(null);
  const divisionAbortRef = useRef<AbortController | null>(null);
  const machineAbortRef  = useRef<AbortController | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 500); return () => clearTimeout(t); }, [search]);

  useEffect(() => { const vid = searchParams.get("vendorId"); if (vid) { setInitialVendorId(vid); setDialogOpen(true); } }, [searchParams]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [vr, cr, dr, mr] = await Promise.all([
          api.get("/admin/vendors", { params: { limit: 10 } }),
          api.get("/admin/machine-categories", { params: { limit: 10 } }),
          api.get("/admin/machine-divisions", { params: { limit: 10 } }),
          api.get("/admin/machines", { params: { limit: 10 } }),
        ]);
        setVendorOptions(vr.data.data.map((v: any) => ({ label: `${v.companyName} - ${v.name}`, value: v._id })));
        setCategoryOptions(cr.data.data.map((c: any) => ({ label: c.name, value: c._id })));
        setDivisionOptions(dr.data.data.map((d: any) => ({ label: d.name, value: d._id })));
        setMachineOptions(mr.data.data.map((m: any) => ({ label: m.name, value: m._id })));
      } catch { toast.error("Failed to load filter options"); }
    };
    fetch();
  }, []);

  const mkSearch = (setFn: any, abortRef: any, url: string, labelFn: (i: any) => string) =>
    useCallback(async (q: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController(); abortRef.current = ctrl;
      try {
        const p: any = { limit: "100" }; if (q) p.search = q;
        const res = await api.get(url, { params: p, signal: ctrl.signal });
        if (!ctrl.signal.aborted) setFn(res.data.data.map((i: any) => ({ label: labelFn(i), value: i._id })));
      } catch {}
    }, []);

  const fetchVendors    = mkSearch(setVendorOptions,   vendorAbortRef,   "/admin/vendors",             (v) => `${v.companyName} - ${v.name}`);
  const fetchCategories = mkSearch(setCategoryOptions, categoryAbortRef, "/admin/machine-categories",  (c) => c.name);
  const fetchDivisions  = mkSearch(setDivisionOptions, divisionAbortRef, "/admin/machine-divisions",   (d) => d.name);
  const fetchMachines   = mkSearch(setMachineOptions,  machineAbortRef,  "/admin/machines",             (m) => m.name);

  const fetchPurchases = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setLoading(true);
    try {
      const p: Record<string, string> = { page: String(page), limit: String(pageSize) };
      if (debouncedSearch)                                                       p.search    = debouncedSearch;
      if (filters.vendor   && filters.vendor   !== "all" && filters.vendor   !== "") p.vendorId  = filters.vendor;
      if (filters.category && filters.category !== "all" && filters.category !== "") p.category  = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") p.division  = filters.division;
      if (filters.machine  && filters.machine  !== "all" && filters.machine  !== "") p.machineId = filters.machine;
      if (fromDate) p.fromDate = toISTDateParam(fromDate);
      if (toDate)   p.toDate   = toISTDateParam(toDate);
      const res = await api.get("/admin/purchases", { params: p, signal: ctrl.signal });
      setData(res.data.data); setStats(res.data.stats || null);
      setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages, total: res.data.pagination.total });
    } catch (err: any) { if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") toast.error("Failed to fetch purchases"); }
    finally { if (!ctrl.signal.aborted) setLoading(false); }
  }, [debouncedSearch, filters, fromDate, toDate, pageSize]);

  useEffect(() => { fetchPurchases(1); }, [fetchPurchases]);

  const handleExport = async () => {
    setExportDialog(false); toast.success("Download starting...");
    try {
      const p: Record<string, string> = {};
      if (debouncedSearch)                                                       p.search    = debouncedSearch;
      if (filters.vendor   && filters.vendor   !== "all" && filters.vendor   !== "") p.vendorId  = filters.vendor;
      if (filters.category && filters.category !== "all" && filters.category !== "") p.category  = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") p.division  = filters.division;
      if (filters.machine  && filters.machine  !== "all" && filters.machine  !== "") p.machineId = filters.machine;
      if (fromDate) p.fromDate = toISTDateParam(fromDate);
      if (toDate)   p.toDate   = toISTDateParam(toDate);
      const res = await api.get("/admin/purchases/export", { params: p, responseType: "blob" });
      const url = URL.createObjectURL(res.data); const a = document.createElement("a");
      a.href = url; a.download = "purchases_export.xlsx"; a.click(); URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  const sep = (i: number, total: number) => i < total - 1 ? <hr className="my-1 border-t border-border" /> : null;

  const columns: Column<Purchase>[] = [
    { key: "_id",         label: "No.",      render: (_p, i) => <span className="font-medium">{(pagination.page - 1) * pageSize + i + 1}</span> },
    { key: "vendorInfo",  label: "Vendor",   render: (p) => <div><p className="font-medium text-sm">{p.vendorInfo.companyName}</p><p className="text-xs text-muted-foreground">{p.vendorInfo.name}</p><p className="text-xs text-muted-foreground">{p.vendorInfo.phone}</p></div> },
    { key: "machineName", label: "Machine",   render: (p) => <div>{p.machines.map((m, i) => <div key={i}>{m.machineName}{sep(i, p.machines.length)}</div>)}</div> },
    { key: "category",    label: "Category",  render: (p) => <div>{p.machines.map((m, i) => <div key={i}>{m.category || "—"}{sep(i, p.machines.length)}</div>)}</div> },
    { key: "division",    label: "Division",  render: (p) => <div>{p.machines.map((m, i) => <div key={i}>{m.division || "—"}{sep(i, p.machines.length)}</div>)}</div> },
    { key: "modelNumber", label: "Model No",  render: (p) => <div>{p.machines.map((m, i) => <div key={i}>{m.modelNumber || "—"}{sep(i, p.machines.length)}</div>)}</div> },
    { key: "quantity",    label: "Qty",      render: (p) => <div>{p.machines.map((m, i) => <div key={i}>{m.quantity}{sep(i, p.machines.length)}</div>)}</div> },
    {
      key: "codes", label: "Serial / Part Code",
      render: (p) => (
        <div>
          {p.machines.map((m, i) => {
            const isParts = !!m.partCodes?.length;
            const items   = isParts ? (m.partCodes || []).map(e => ({ code: e.partCode, status: e.status })) : (m.serialNumbers || []).map(e => ({ code: e.serialNumber, status: e.status }));
            return (
              <div key={i}>
                {items.map((item, j) => <div key={j} className="font-mono text-xs">{item.code}</div>)}
                {sep(i, p.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "available", label: "Available",
      render: (p) => (
        <div>{p.machines.map((m, i) => {
          const items = m.partCodes?.length ? m.partCodes : (m.serialNumbers || []);
          const count = items.filter((e: any) => e.status === "available").length;
          return <div key={i}><span className="text-green-600 font-medium">{count}</span>{sep(i, p.machines.length)}</div>;
        })}</div>
      ),
    },
    {
      key: "sold", label: "Sold",
      render: (p) => (
        <div>{p.machines.map((m, i) => {
          const items = m.partCodes?.length ? m.partCodes : (m.serialNumbers || []);
          const count = items.filter((e: any) => e.status === "sold").length;
          return <div key={i}><span className="text-red-500 font-medium">{count}</span>{sep(i, p.machines.length)}</div>;
        })}</div>
      ),
    },
    { key: "buyingPrice",            label: "Buying Price",       render: (p) => <div>{p.machines.map((m, i) => <div key={i}>₹{m.buyingPrice.toLocaleString()}{sep(i, p.machines.length)}</div>)}</div> },
    { key: "discountedBuyingPrice",  label: "Disc. Buying",       render: (p) => <div>{p.machines.map((m, i) => <div key={i}>{m.discountedBuyingPrice != null ? `₹${m.discountedBuyingPrice.toLocaleString()}` : "—"}{sep(i, p.machines.length)}</div>)}</div> },
    { key: "sellingPrice",           label: "Selling Price",      render: (p) => <div>{p.machines.map((m, i) => <div key={i}>{m.sellingPrice != null ? `₹${m.sellingPrice.toLocaleString()}` : "—"}{sep(i, p.machines.length)}</div>)}</div> },
    { key: "discountedSellingPrice", label: "Disc. Selling",      render: (p) => <div>{p.machines.map((m, i) => <div key={i}>{m.discountedSellingPrice != null ? `₹${m.discountedSellingPrice.toLocaleString()}` : "—"}{sep(i, p.machines.length)}</div>)}</div> },
    { key: "grandTotal",             label: "Grand Total",        render: (p) => <span className="font-semibold">₹{p.grandTotal.toLocaleString()}</span> },
    { key: "createdAt",              label: "Purchased At",       render: (p) => { const { date, time } = formatDateTime(p.createdAt); return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>; } },
    // { key: "actions", label: "Actions", sticky: true, render: (p) => <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate(`/purchase-machines/${p._id}`)}><Eye className="h-3 w-3" /></Button> },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Purchase Machines" description="Record and manage machine purchases from vendors" actionLabel="Purchase Machine" actionIcon={ShoppingBag} onAction={() => { setInitialVendorId(""); setDialogOpen(true); }}>
            <Button variant="outline" className="gap-2" onClick={() => setExportDialog(true)}><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Total Purchased",          value: `₹${stats.totalPurchased.toLocaleString()}`,        icon: ShoppingBag, color: "blue" },
                { label: "Total Machines Purchased", value: stats.totalMachinesPurchased,                       icon: Package,     color: "green" },
                { label: "Avg Purchase Value",       value: `₹${stats.avgPurchaseValue.toLocaleString()}`,      icon: ShoppingBag, color: "orange" },
              ].map((s) => (
                <Card key={s.label} className="border-0 shadow-sm">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm text-muted-foreground">{s.label}</p><p className="text-2xl font-bold mt-1">{s.value}</p></div>
                      <div className={`h-12 w-12 rounded-full bg-${s.color}-100 flex items-center justify-center`}>
                        <s.icon className={`h-6 w-6 text-${s.color}-600`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by vendor, machine, model..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" /></div>
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" /></div>
              {(search || fromDate || toDate || Object.values(filters).some(v => v && v !== "all")) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); }} className="h-9"><X className="h-4 w-4 mr-1" /> Clear</Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <SearchableSelect options={vendorOptions}   value={filters.vendor   ?? ""} onChange={(v) => setFilters(p => ({ ...p, vendor:   v }))} onSearchChange={fetchVendors}    placeholder="Vendor"    searchPlaceholder="Search vendors..."    className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={categoryOptions} value={filters.category ?? ""} onChange={(v) => setFilters(p => ({ ...p, category: v }))} onSearchChange={fetchCategories} placeholder="Category" searchPlaceholder="Search categories..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={divisionOptions} value={filters.division ?? ""} onChange={(v) => setFilters(p => ({ ...p, division: v }))} onSearchChange={fetchDivisions}  placeholder="Division" searchPlaceholder="Search divisions..."  className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={machineOptions}  value={filters.machine  ?? ""} onChange={(v) => setFilters(p => ({ ...p, machine:  v }))} onSearchChange={fetchMachines}   placeholder="Machine"  searchPlaceholder="Search machines..."   className="w-[160px] h-9 text-sm" />
          </div>

          <DataTable columns={columns} data={data} pageSize={999} />
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pageSize} onPageChange={fetchPurchases} />
        </>
      )}

      {codesPopup && (
        <Dialog open onOpenChange={() => setCodesPopup(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{codesPopup.isParts ? "Part Codes" : "Serial Numbers"} — {codesPopup.title}</DialogTitle></DialogHeader>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/40 border-b"><th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-8">#</th><th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{codesPopup.isParts ? "Part Code" : "Serial Number"}</th><th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th></tr></thead>
                <tbody className="divide-y">
                  {codesPopup.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono font-medium">{item.code}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${item.status === "sold" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {item.status === "sold" ? "Sold" : "Available"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setCodesPopup(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <PurchaseMachineDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setInitialVendorId(""); navigate("/purchase-machines", { replace: true }); }} onSuccess={() => fetchPurchases(1)} initialVendorId={initialVendorId} />

      <Dialog open={exportDialog} onOpenChange={setExportDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Export Purchase Data</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">Do you want to download all purchase data as an Excel file?</p>
          <DialogFooter><Button variant="outline" onClick={() => setExportDialog(false)}>Cancel</Button><Button onClick={handleExport}>Yes, Download</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseMachinesPage;
