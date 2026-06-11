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
import { ShoppingCart, Eye, Plus, Trash2, Search, X, Info, Package, Download, Hash, Edit, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

const PARTS_CATEGORY_ID    = import.meta.env.VITE_PARTS_CATEGORY_ID;
const TSS_CONTRACT_TYPE_ID = import.meta.env.VITE_TSS_CONTRACT_TYPE_ID;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerInfo { customerId: string | null; name: string; phone: string; email: string; address: string; zone: string; gstNumber: string; }
interface Sale { _id: string; customerInfo: CustomerInfo; machinesCount: number; grandTotal: number; createdAt: string; invoiceUrl?: string; invoiceNumber?: string; companyInfo?: { companyId: string; name?: string } | null; cgst?: { percent: number; amount: number } | null; sgst?: { percent: number; amount: number } | null; igst?: { percent: number; amount: number } | null; invoiceGrandTotal?: number | null; }
interface Stats { totalSales: number; totalMachinesSold: number; avgSaleValue: number; }
interface Customer { _id: string; name: string; phone: string; email: string; }
interface Machine { _id: string; name: string; modelNumber: string; category?: { _id: string; name: string }; }
interface ContractType { _id: string; name: string; code: string; freeService: boolean; freeParts: boolean; }
interface ActiveCompany { _id: string; name: string; }

interface PagesCategory { _id: string; name: string; }
interface PagesCategoryEntry { pagesCategoryId: string; pagesCategory: string; costPerPage: string; }

interface MachineEntry {
  machine: Machine;
  quantity: string;
  sellingPrice: string;
  discountedSellingPrice: string;
  serialNumbers: { serialNumber: string; contractTypeId: string; validFrom: string; validTo: string; minCopies: string; pagesCategories: PagesCategoryEntry[] }[];
  partCodes: string[];
}

interface CodesDialogState {
  mi: number; machineName: string; isParts: boolean;
  quantity: number;
  availableCodes: string[];
  codes: { value: string; contractTypeId: string; validFrom: string; validTo: string; minCopies: string }[];
  saving: boolean;
  loading: boolean;
}

interface PagesCategoryConfigState {
  serialNumbers: string[];
  currentIndex: number;
  mi: number;
  pendingCodes: CodesDialogState["codes"];
  configs: Record<string, PagesCategoryEntry[]>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return {
    date: `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`,
    time: d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:true}),
  };
};
const toISTDateParam = (h: string) => { const [y,m,d] = h.split("-"); return `${d}/${m}/${String(y).slice(2)}`; };

// ─── Sell Dialog ──────────────────────────────────────────────────────────────

const SellMachineDialog = ({ open, onClose, onSuccess, initialCustomerId = "" }: { open: boolean; onClose: () => void; onSuccess: () => void; initialCustomerId?: string }) => {
  const [customers, setCustomers]         = useState<Customer[]>([]);
  const [customerId, setCustomerId]       = useState(initialCustomerId);
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
  const [machineSearch, setMachineSearch] = useState("");
  const [machineResults, setMachineResults] = useState<Machine[]>([]);
  const [searching, setSearching]         = useState(false);
  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const [entries, setEntries]             = useState<MachineEntry[]>([]);
  const [submitting, setSubmitting]       = useState(false);
  const [createCustomerDialog, setCreateCustomerDialog] = useState(false);
  const [customerForm, setCustomerForm]   = useState({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "" });
  const [codesDialog, setCodesDialog]         = useState<CodesDialogState | null>(null);
  const [pagesCatConfig, setPagesCatConfig]   = useState<PagesCategoryConfigState | null>(null);
  const [activePagesCats, setActivePagesCats] = useState<PagesCategory[]>([]);
  const ctAbortRef    = useRef<AbortController | null>(null);
  const searchRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const machineInputRef = useRef<HTMLInputElement>(null);

  const fetchMachines = async (search = "") => {
    setSearching(true);
    try {
      const p: any = { status: "Active", limit: "10" }; if (search.trim()) p.search = search.trim();
      const r = await api.get("/admin/machines", { params: p });
      setMachineResults(r.data.data);
    } catch { toast.error("Failed to load machines"); }
    finally { setSearching(false); }
  };

  const fetchCustomers = async () => {
    try { const r = await api.get("/admin/customers", { params: { status: "Active", limit: 100 } }); setCustomers(r.data.data); }
    catch { toast.error("Failed to load customers"); }
  };

  const fetchContractTypes = useCallback(async (q = "") => {
    ctAbortRef.current?.abort();
    const ctrl = new AbortController(); ctAbortRef.current = ctrl;
    try {
      const p: any = { status: "Active", limit: "100" }; if (q) p.search = q;
      const r = await api.get("/admin/contract-types", { params: p, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setContractTypes(r.data.data);
    } catch {}
  }, []);

  useEffect(() => { setCustomerId(initialCustomerId); }, [initialCustomerId]);
  useEffect(() => { if (!open) return; fetchCustomers(); fetchContractTypes(); fetchMachines(); fetchActivePagesCats(); }, [open]);

  const fetchActivePagesCats = async () => {
    try {
      const r = await api.get("/admin/pages-categories/active");
      setActivePagesCats(r.data.data);
    } catch { toast.error("Failed to load pages categories"); }
  };
  useEffect(() => { if (searchRef.current) clearTimeout(searchRef.current); searchRef.current = setTimeout(() => fetchMachines(machineSearch), 400); }, [machineSearch]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setDropdownOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const addMachine = (machine: Machine) => {
    if (entries.find((e) => e.machine._id === machine._id)) { toast.info("Machine already added"); return; }
    setEntries((prev) => [...prev, { machine, quantity: "", sellingPrice: "", discountedSellingPrice: "", serialNumbers: [], partCodes: [] }]);
    setMachineSearch(""); setDropdownOpen(false); machineInputRef.current?.blur();
  };

  const removeMachine = (id: string) => setEntries((prev) => prev.filter((e) => e.machine._id !== id));
  const updateEntry   = (mi: number, field: keyof MachineEntry, value: any) =>
    setEntries((prev) => prev.map((e, i) => i !== mi ? e : { ...e, [field]: value }));

  const openCodesDialog = async (mi: number) => {
    const e       = entries[mi];
    const isParts = e.machine.category?._id === PARTS_CATEGORY_ID;
    const qty     = Number(e.quantity) || 0;

    // First fetch available codes to check max allowed
    let available: string[] = [];
    try {
      const res = await api.get("/admin/sales/available-codes", { params: { machineId: e.machine._id } });
      available = res.data.data;
    } catch {
      toast.error("Failed to load available codes");
      return;
    }

    if (available.length === 0) {
      toast.error(`No available ${isParts ? "part codes" : "serial numbers"} in stock for this machine`);
      return;
    }

    if (qty > available.length) {
      toast.error(`Max available quantity is ${available.length}. Please reduce the quantity.`);
      return;
    }

    const existingCodes = isParts
      ? (e.partCodes.length > 0 ? e.partCodes.map(v => ({ value: v, contractTypeId: "", validFrom: "", validTo: "", minCopies: "" })) : Array.from({ length: qty }, () => ({ value: "", contractTypeId: "", validFrom: "", validTo: "", minCopies: "" })))
      : (e.serialNumbers.length > 0 ? e.serialNumbers.map(s => ({ value: s.serialNumber, contractTypeId: s.contractTypeId, validFrom: s.validFrom, validTo: s.validTo, minCopies: s.minCopies })) : Array.from({ length: qty }, () => ({ value: "", contractTypeId: "", validFrom: "", validTo: "", minCopies: "" })));

    setCodesDialog({ mi, machineName: e.machine.name, isParts, quantity: qty, availableCodes: available, codes: existingCodes.slice(0, qty), saving: false, loading: false });
  };

  const saveCodes = async () => {
    if (!codesDialog) return;
    const { mi, codes, quantity, isParts, availableCodes } = codesDialog;

    for (let i = 0; i < quantity; i++) {
      if (!codes[i]?.value?.trim()) { toast.error(`${isParts ? "Part code" : "Serial number"} ${i + 1} is not selected`); return; }
      if (!isParts) {
        if (!codes[i].contractTypeId) { toast.error(`Select contract type for serial number ${i + 1}`); return; }
        if (!codes[i].validFrom)      { toast.error(`Enter valid from date for serial number ${i + 1}`); return; }
        if (!codes[i].validTo)        { toast.error(`Enter valid to date for serial number ${i + 1}`); return; }
        if (codes[i].validTo <= codes[i].validFrom) { toast.error(`Valid To must be after Valid From for serial number ${i + 1}`); return; }
      }
    }

    const trimmedValues = codes.map(c => c.value.trim());
    const unique = new Set(trimmedValues.map(v => v.toUpperCase()));
    if (unique.size !== trimmedValues.length) { toast.error("Duplicate codes selected"); return; }

    const notAvailable = trimmedValues.filter(v => !availableCodes.includes(v));
    if (notAvailable.length > 0) { toast.error(`Some codes are no longer available: ${notAvailable.join(", ")}`); return; }

    if (isParts) {
      updateEntry(mi, "partCodes", trimmedValues);
      setCodesDialog(null);
      return;
    }

    // Check if any serial has TSS contract type — needs pages category config
    const tssSerials = TSS_CONTRACT_TYPE_ID
      ? codes.slice(0, quantity).filter(c => c.contractTypeId === TSS_CONTRACT_TYPE_ID).map(c => c.value.trim())
      : [];

    if (tssSerials.length > 0) {
      const existing = entries[mi].serialNumbers;
      const existingConfigs: Record<string, PagesCategoryEntry[]> = {};
      for (const sn of tssSerials) {
        const prev = existing.find(s => s.serialNumber === sn);
        existingConfigs[sn] = (prev?.pagesCategories ?? []).map(e => ({ ...e, costPerPage: String(e.costPerPage) }));
      }
      setPagesCatConfig({ serialNumbers: tssSerials, currentIndex: 0, mi, pendingCodes: codes, configs: existingConfigs });
    } else {
      updateEntry(mi, "serialNumbers", codes.slice(0, quantity).map(c => ({
        serialNumber: c.value.trim(), contractTypeId: c.contractTypeId,
        validFrom: c.validFrom, validTo: c.validTo, minCopies: c.minCopies, pagesCategories: [],
      })));
      setCodesDialog(null);
    }
  };

  const handleSubmit = async () => {
    if (!customerId)          { toast.error("Please select a customer"); return; }
    if (entries.length === 0) { toast.error("Please add at least one machine"); return; }

    for (const e of entries) {
      if (!e.quantity || Number(e.quantity) <= 0) { toast.error(`Enter quantity for ${e.machine.name}`); return; }
      if (!e.sellingPrice)                         { toast.error(`Enter selling price for ${e.machine.name}`); return; }
      const isParts = e.machine.category?._id === PARTS_CATEGORY_ID;
      if (isParts) {
        if (e.partCodes.length !== Number(e.quantity)) { toast.error(`Enter ${e.quantity} part codes for ${e.machine.name}`); return; }
      } else {
        if (e.serialNumbers.length !== Number(e.quantity)) { toast.error(`Enter ${e.quantity} serial numbers for ${e.machine.name}`); return; }
      }
    }

    const payload = {
      customerId,
      machines: entries.map((e) => {
        const isParts = e.machine.category?._id === PARTS_CATEGORY_ID;
        return {
          machineId:              e.machine._id,
          categoryId:             e.machine.category?._id,
          quantity:               Number(e.quantity),
          sellingPrice:           Number(e.sellingPrice),
          discountedSellingPrice: e.discountedSellingPrice !== "" ? Number(e.discountedSellingPrice) : null,
          ...(isParts
            ? { partCodes: e.partCodes }
            : { serialNumbers: e.serialNumbers.map(s => ({ ...s, minCopies: Number(s.minCopies) || 0, pagesCategories: (s.pagesCategories ?? []).map(p => ({ ...p, costPerPage: Number(p.costPerPage) })) })) }),
        };
      }),
    };

    setSubmitting(true);
    try {
      await api.post("/admin/sales", payload);
      toast.success("Sale recorded successfully");
      onSuccess(); handleClose();
    } catch (err: any) { toast.error(err.response?.data?.message || "Failed to record sale"); }
    finally { setSubmitting(false); }
  };

  const handleCreateCustomer = async () => {
    if (!customerForm.name || !customerForm.phone || !customerForm.email) { toast.error("Name, phone and email are required"); return; }
    setSubmitting(true);
    try {
      await api.post("/admin/customers", { ...customerForm, status: "Active" });
      toast.success("Customer created successfully");
      await fetchCustomers(); setCreateCustomerDialog(false);
      setCustomerForm({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "" });
    } catch (err: any) { toast.error(err.response?.data?.message || "Failed to create customer"); }
    finally { setSubmitting(false); }
  };

  const handleClose = () => { setCustomerId(initialCustomerId); setMachineSearch(""); setMachineResults([]); setDropdownOpen(false); setEntries([]); onClose(); };

  const sellingTotal = entries.reduce((s, e) => {
    if (!e.quantity || !e.sellingPrice) return s;
    return s + (Number(e.discountedSellingPrice) || Number(e.sellingPrice)) * Number(e.quantity);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Record Machine Sale</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Select a customer and add machines to record a sale</p>
          </div>
        </div>

        {/* Body: two-panel */}
        <div className="flex flex-1 min-h-0">

          {/* Left panel — customer + machine search */}
          <div className="w-72 shrink-0 border-r flex flex-col bg-muted/30">
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">

              {/* Customer */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer <span className="text-destructive">*</span></Label>
                  <button type="button" className="text-xs text-primary hover:underline flex items-center gap-1" onClick={() => setCreateCustomerDialog(true)}>
                    <Plus className="h-3 w-3" /> New
                  </button>
                </div>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        <div>
                          <p className="font-medium text-sm">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.phone}</p>
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
                <span>Parts machines use part codes. Others need serial numbers with individual contract types.</span>
              </div>

              {/* Added machine chips */}
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
                  const isParts    = entry.machine.category?._id === PARTS_CATEGORY_ID;
                  const qty        = Number(entry.quantity) || 0;
                  const codes      = isParts ? entry.partCodes : entry.serialNumbers;
                  const codesOk    = codes.length === qty && qty > 0;
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
                      <div className="p-4 space-y-3">
                        {/* Row 1: qty, codes, selling price, disc price */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Qty <span className="text-destructive">*</span></Label>
                            <Input type="number" min={1} className="h-8 text-sm" value={entry.quantity}
                              onChange={(e) => { updateEntry(mi, "quantity", e.target.value); updateEntry(mi, isParts ? "partCodes" : "serialNumbers", []); }} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{isParts ? "Part Codes" : "Serial Nos"}</Label>
                            <Button type="button" variant="outline" size="sm"
                              className={`h-8 text-xs gap-1.5 w-full font-normal ${codesOk ? "border-green-400 text-green-600 bg-green-50" : ""}`}
                              disabled={!entry.quantity || Number(entry.quantity) === 0}
                              onClick={() => openCodesDialog(mi)}>
                              <Hash className="h-3.5 w-3.5" />
                              {codesOk ? `${codes.length} saved ✓` : `Enter ${isParts ? "Part Codes" : "Serial Nos"}`}
                            </Button>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Selling Price <span className="text-destructive">*</span></Label>
                            <Input type="number" min={0} className="h-8 text-sm" placeholder="0" value={entry.sellingPrice}
                              onChange={(e) => updateEntry(mi, "sellingPrice", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Disc. Selling Price</Label>
                            <Input type="number" min={0} className="h-8 text-sm" placeholder="—" value={entry.discountedSellingPrice}
                              onChange={(e) => updateEntry(mi, "discountedSellingPrice", e.target.value)} />
                          </div>
                        </div>
                        {/* TSS serial numbers — pages category edit */}
                        {!isParts && entry.serialNumbers.some(s => s.contractTypeId === TSS_CONTRACT_TYPE_ID) && (
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Pages Category Config</Label>
                            <div className="flex flex-col gap-1">
                              {entry.serialNumbers.filter(s => s.contractTypeId === TSS_CONTRACT_TYPE_ID).map((s) => (
                                <div key={s.serialNumber} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 bg-muted/30">
                                  <div>
                                    <p className="text-xs font-medium">{s.serialNumber}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {s.pagesCategories.length > 0
                                        ? s.pagesCategories.map(p => `${p.pagesCategory} — ₹${p.costPerPage}/pg`).join(", ")
                                        : <span className="text-amber-600">No pages categories configured</span>}
                                      {s.minCopies ? <span className="ml-1 text-blue-600">· Min: {s.minCopies} copies</span> : null}
                                    </p>
                                  </div>
                                  <Button
                                    type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                                    onClick={() => {
                                      const existingConfigs: Record<string, PagesCategoryEntry[]> = {
                                        [s.serialNumber]: (s.pagesCategories ?? []).map(e => ({ ...e, costPerPage: String(e.costPerPage) })),
                                      };
                                      setPagesCatConfig({
                                        serialNumbers: [s.serialNumber],
                                        currentIndex: 0,
                                        mi,
                                        pendingCodes: entry.serialNumbers.map(sn => ({ value: sn.serialNumber, contractTypeId: sn.contractTypeId, validFrom: sn.validFrom, validTo: sn.validTo, minCopies: sn.minCopies })),
                                        configs: existingConfigs,
                                      });
                                    }}
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
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
                Net Total: <span className="text-base font-bold text-green-600">₹{sellingTotal.toLocaleString()}</span>
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                  <Plus className="h-4 w-4" />{submitting ? "Recording..." : "Record Sale"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Pages Category Config Dialog */}
      {pagesCatConfig && (() => {
        const { serialNumbers, currentIndex, mi, pendingCodes, configs } = pagesCatConfig;
        const sn       = serialNumbers[currentIndex];
        const entries_ = configs[sn] ?? [];

        const setEntries_ = (updated: PagesCategoryEntry[]) =>
          setPagesCatConfig(p => p ? { ...p, configs: { ...p.configs, [sn]: updated } } : p);

        const allConfigured = serialNumbers.every(s => (configs[s] ?? []).length > 0);

        const commit = () => {
          // validate all serials
          for (const snKey of serialNumbers) {
            const snEntries = configs[snKey] ?? [];
            if (snEntries.length === 0) { toast.error(`Add at least one pages category for serial ${snKey}`); return; }
            for (let pi = 0; pi < snEntries.length; pi++) {
              const e = snEntries[pi];
              if (!e.pagesCategoryId) { toast.error(`Select a pages category for ${snKey} entry ${pi + 1}`); return; }
              if (e.costPerPage === "" || isNaN(Number(e.costPerPage)) || Number(e.costPerPage) < 0) {
                toast.error(`Enter a valid cost per page for ${snKey} entry ${pi + 1}`); return;
              }
            }
          }
          updateEntry(mi, "serialNumbers", pendingCodes.map(c => ({
            serialNumber:    c.value.trim(),
            contractTypeId:  c.contractTypeId,
            validFrom:       c.validFrom,
            validTo:         c.validTo,
            minCopies:       c.minCopies,
            pagesCategories: (configs[c.value.trim()] ?? entries[mi].serialNumbers.find(s => s.serialNumber === c.value.trim())?.pagesCategories?.map(e => ({ ...e, costPerPage: String(e.costPerPage) })) ?? []).map(e => ({
              pagesCategoryId: e.pagesCategoryId,
              pagesCategory:   e.pagesCategory,
              costPerPage:     String(e.costPerPage),
            })),
          })));
          setPagesCatConfig(null);
          setCodesDialog(null);
        };

        const usedCategoryIds = entries_.map(e => e.pagesCategoryId).filter(Boolean);

        return (
          <Dialog open onOpenChange={(o) => { if (!o) setPagesCatConfig(null); }}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Pages Category Config</DialogTitle>
              </DialogHeader>

              {/* Serial number tabs */}
              {serialNumbers.length > 1 && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {serialNumbers.map((s, idx) => {
                    const configured = (configs[s] ?? []).length > 0;
                    const isActive   = idx === currentIndex;
                    return (
                      <button
                        key={s} type="button"
                        onClick={() => setPagesCatConfig(p => p ? { ...p, currentIndex: idx } : p)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : configured
                              ? "bg-green-50 text-green-700 border-green-300"
                              : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {s} {configured && !isActive ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Current serial label */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Configuring: <span className="text-foreground">{sn}</span>
              </p>

              {/* Pages category entries for selected serial */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {entries_.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No entries yet. Add a pages category below.</p>
                )}
                {entries_.map((entry, pi) => {
                  const availableOpts = activePagesCats.filter(
                    c => c._id === entry.pagesCategoryId || !usedCategoryIds.includes(c._id)
                  );
                  return (
                    <div key={pi} className="flex items-end gap-2 rounded-lg border p-3">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Pages Category <span className="text-destructive">*</span></Label>
                        <Select
                          value={entry.pagesCategoryId}
                          onValueChange={(v) => {
                            const cat = activePagesCats.find(c => c._id === v);
                            setEntries_(entries_.map((e, i) => i !== pi ? e : { ...e, pagesCategoryId: v, pagesCategory: cat?.name ?? "" }));
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>
                            {availableOpts.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32 space-y-1">
                        <Label className="text-xs text-muted-foreground">Cost / Page <span className="text-destructive">*</span></Label>
                        <Input
                          type="number" min={0} className="h-8 text-xs" placeholder="0.00"
                          value={entry.costPerPage}
                          onChange={(e) => setEntries_(entries_.map((en, i) => i !== pi ? en : { ...en, costPerPage: e.target.value }))}
                        />
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => setEntries_(entries_.filter((_, i) => i !== pi))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
                {entries_.length < activePagesCats.length && (
                  <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs h-8"
                    onClick={() => setEntries_([...entries_, { pagesCategoryId: "", pagesCategory: "", costPerPage: "" }])}>
                    <Plus className="h-3.5 w-3.5" /> Add Pages Category
                  </Button>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPagesCatConfig(null)}>Cancel</Button>
                <Button onClick={commit} disabled={!allConfigured}>Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Codes Dialog */}
      {codesDialog && (
        <Dialog open onOpenChange={(o) => { if (!o) setCodesDialog(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Select {codesDialog.isParts ? "Part Codes" : "Serial Numbers"} — {codesDialog.machineName}</DialogTitle>
            </DialogHeader>
            {codesDialog.availableCodes.length === 0 ? (
              <div className="py-8 flex items-center justify-center text-sm text-muted-foreground">No available {codesDialog.isParts ? "part codes" : "serial numbers"} found in stock</div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {codesDialog.quantity} unit{codesDialog.quantity > 1 ? "s" : ""} · {codesDialog.availableCodes.length} available in stock
                </p>
                <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
                  {Array.from({ length: codesDialog.quantity }).map((_, i) => {
                    const selectedValues = codesDialog.codes.map(c => c.value).filter(Boolean);
                    const options = codesDialog.availableCodes.filter(c => c === codesDialog.codes[i]?.value || !selectedValues.includes(c));
                    return (
                      <div key={i} className="space-y-2 rounded-lg border p-3">
                        <Label className="text-xs font-semibold">Unit {i + 1}</Label>
                        <Select
                          value={codesDialog.codes[i]?.value ?? ""}
                          onValueChange={(v) => setCodesDialog(p => { if (!p) return p; const c = [...p.codes]; c[i] = { ...c[i], value: v }; return { ...p, codes: c }; })}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`Select ${codesDialog.isParts ? "part code" : "serial number"}`} /></SelectTrigger>
                          <SelectContent>
                            {options.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {!codesDialog.isParts && (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Contract Type <span className="text-destructive">*</span></Label>
                              <SearchableSelect
                                options={contractTypes.map((ct) => ({ label: `${ct.name} (${ct.code})`, value: ct._id }))}
                                value={codesDialog.codes[i]?.contractTypeId ?? ""}
                                onChange={(v) => setCodesDialog((p) => { if (!p) return p; const c = [...p.codes]; c[i] = { ...c[i], contractTypeId: v }; return { ...p, codes: c }; })}
                                onSearchChange={fetchContractTypes}
                                placeholder="Select" searchPlaceholder="Search..."
                                className="h-8 text-xs"
                              />
                              {(() => { const ct = contractTypes.find(ct => ct._id === codesDialog.codes[i]?.contractTypeId); return ct ? <p className="text-[10px] text-muted-foreground">Free Svc: {ct.freeService ? "Yes" : "No"} · Free Parts: {ct.freeParts ? "Yes" : "No"}</p> : null; })()}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Valid From <span className="text-destructive">*</span></Label>
                              <Input type="date" className="h-8 text-xs"
                                value={codesDialog.codes[i]?.validFrom ?? ""}
                                disabled={!codesDialog.codes[i]?.contractTypeId}
                                onChange={(e) => setCodesDialog((p) => { if (!p) return p; const c = [...p.codes]; c[i] = { ...c[i], validFrom: e.target.value }; return { ...p, codes: c }; })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Valid To <span className="text-destructive">*</span></Label>
                              <Input type="date" className="h-8 text-xs"
                                value={codesDialog.codes[i]?.validTo ?? ""}
                                disabled={!codesDialog.codes[i]?.contractTypeId}
                                onChange={(e) => setCodesDialog((p) => { if (!p) return p; const c = [...p.codes]; c[i] = { ...c[i], validTo: e.target.value }; return { ...p, codes: c }; })} />
                            </div>
                            {codesDialog.codes[i]?.contractTypeId === TSS_CONTRACT_TYPE_ID && (
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Min Copies</Label>
                                <Input type="number" min={0} className="h-8 text-xs" placeholder="0"
                                  value={codesDialog.codes[i]?.minCopies ?? ""}
                                  onChange={(e) => setCodesDialog((p) => { if (!p) return p; const c = [...p.codes]; c[i] = { ...c[i], minCopies: e.target.value }; return { ...p, codes: c }; })} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCodesDialog(null)}>Cancel</Button>
              <Button onClick={saveCodes} disabled={codesDialog.saving || codesDialog.availableCodes.length === 0}>
                {codesDialog.saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Customer Dialog */}
      <Dialog open={createCustomerDialog} onOpenChange={(o) => { if (!o) { setCreateCustomerDialog(false); setCustomerForm({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "" }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New Customer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name <span className="text-destructive">*</span></Label><Input placeholder="Customer name" value={customerForm.name} onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone <span className="text-destructive">*</span></Label><Input placeholder="e.g. 9800000000" value={customerForm.phone} onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email <span className="text-destructive">*</span></Label><Input type="email" placeholder="customer@example.com" value={customerForm.email} onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Address</Label><Input placeholder="Full address" value={customerForm.address} onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Zone</Label><Input placeholder="Zone/Area" value={customerForm.zone} onChange={(e) => setCustomerForm((p) => ({ ...p, zone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>GST Number</Label><Input placeholder="e.g. 27AABCG1234A1Z5" value={customerForm.gstNumber} onChange={(e) => setCustomerForm((p) => ({ ...p, gstNumber: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateCustomerDialog(false); setCustomerForm({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "" }); }} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreateCustomer} disabled={submitting}>{submitting ? "Creating..." : "Create Customer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const SellMachinesPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData]                       = useState<Sale[]>([]);
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
  const [initialCustomerId, setInitialCustomerId] = useState("");
  const [invoiceDialog, setInvoiceDialog]     = useState<Sale | null>(null);
  const [companies, setCompanies]             = useState<ActiveCompany[]>([]);
  const [invoiceForm, setInvoiceForm]         = useState({ companyId: "", cgst: "", sgst: "", igst: "" });
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<{ label: string; value: string }[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [divisionOptions, setDivisionOptions] = useState<{ label: string; value: string }[]>([]);
  const [machineOptions, setMachineOptions]   = useState<{ label: string; value: string }[]>([]);
  const abortRef         = useRef<AbortController | null>(null);
  const customerAbortRef = useRef<AbortController | null>(null);
  const categoryAbortRef = useRef<AbortController | null>(null);
  const divisionAbortRef = useRef<AbortController | null>(null);
  const machineAbortRef  = useRef<AbortController | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 500); return () => clearTimeout(t); }, [search]);
  useEffect(() => { const cid = searchParams.get("customerId"); if (cid) { setInitialCustomerId(cid); setDialogOpen(true); } }, [searchParams]);

  useEffect(() => {
    api.get("/admin/companies", { params: { status: "Active", limit: 100 } })
      .then(r => setCompanies(r.data.data))
      .catch(() => {});
  }, []);

  const handleGenerateInvoice = async () => {
    if (!invoiceDialog) return;
    if (!invoiceForm.companyId) { toast.error("Please select a company"); return; }
    if (invoiceForm.cgst === "" || invoiceForm.sgst === "" || invoiceForm.igst === "") { toast.error("Enter all tax fields (use 0 if not applicable)"); return; }
    setGeneratingInvoice(true);
    const tab = window.open("", "_blank");
    try {
      const res = await api.post(`/admin/sales/${invoiceDialog._id}/generate-invoice`, {
        companyId: invoiceForm.companyId,
        cgst: Number(invoiceForm.cgst),
        sgst: Number(invoiceForm.sgst),
        igst: Number(invoiceForm.igst),
      });
      toast.success("Invoice generated");
      if (tab) tab.location.href = res.data.invoiceUrl; else window.open(res.data.invoiceUrl, "_blank");
      setInvoiceDialog(null);
      fetchSales(pagination.page);
    } catch (err: any) { toast.error(err.response?.data?.message || "Failed to generate invoice"); if (tab) tab.close(); }
    finally { setGeneratingInvoice(false); }
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        const [cr, catr, dr, mr] = await Promise.all([
          api.get("/admin/customers", { params: { limit: 10 } }),
          api.get("/admin/machine-categories", { params: { limit: 10 } }),
          api.get("/admin/machine-divisions", { params: { limit: 10 } }),
          api.get("/admin/machines", { params: { limit: 10 } }),
        ]);
        setCustomerOptions(cr.data.data.map((c: any) => ({ label: `${c.name} - ${c.phone}`, value: c._id })));
        setCategoryOptions(catr.data.data.map((c: any) => ({ label: c.name, value: c._id })));
        setDivisionOptions(dr.data.data.map((d: any) => ({ label: d.name, value: d._id })));
        setMachineOptions(mr.data.data.map((m: any) => ({ label: m.name, value: m._id })));
      } catch { toast.error("Failed to load filter options"); }
    };
    fetch();
  }, []);

  const mkSearch = (setFn: any, abortRef: any, url: string, labelFn: (i: any) => string) =>
    useCallback(async (q: string) => {
      abortRef.current?.abort(); const ctrl = new AbortController(); abortRef.current = ctrl;
      try {
        const p: any = { limit: "100" }; if (q) p.search = q;
        const res = await api.get(url, { params: p, signal: ctrl.signal });
        if (!ctrl.signal.aborted) setFn(res.data.data.map((i: any) => ({ label: labelFn(i), value: i._id })));
      } catch {}
    }, []);

  const fetchCustomers  = mkSearch(setCustomerOptions, customerAbortRef, "/admin/customers",            (c) => `${c.name} - ${c.phone}`);
  const fetchCategories = mkSearch(setCategoryOptions, categoryAbortRef, "/admin/machine-categories",   (c) => c.name);
  const fetchDivisions  = mkSearch(setDivisionOptions, divisionAbortRef, "/admin/machine-divisions",    (d) => d.name);
  const fetchMachines   = mkSearch(setMachineOptions,  machineAbortRef,  "/admin/machines",              (m) => m.name);

  const fetchSales = useCallback(async (page = 1) => {
    abortRef.current?.abort(); const ctrl = new AbortController(); abortRef.current = ctrl;
    setLoading(true);
    try {
      const p: Record<string, string> = { page: String(page), limit: String(pageSize) };
      if (debouncedSearch)                                                          p.search     = debouncedSearch;
      if (filters.customer && filters.customer !== "all" && filters.customer !== "") p.customerId = filters.customer;
      if (filters.category && filters.category !== "all" && filters.category !== "") p.category   = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") p.division   = filters.division;
      if (filters.machine  && filters.machine  !== "all" && filters.machine  !== "") p.machineId  = filters.machine;
      if (fromDate) p.fromDate = toISTDateParam(fromDate);
      if (toDate)   p.toDate   = toISTDateParam(toDate);
      const res = await api.get("/admin/sales", { params: p, signal: ctrl.signal });
      setData(res.data.data); setStats(res.data.stats || null);
      setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages, total: res.data.pagination.total });
    } catch (err: any) { if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") toast.error("Failed to fetch sales"); }
    finally { if (!ctrl.signal.aborted) setLoading(false); }
  }, [debouncedSearch, filters, fromDate, toDate, pageSize]);

  useEffect(() => { fetchSales(1); }, [fetchSales]);

  const handleExport = async () => {
    setExportDialog(false); toast.success("Download starting...");
    try {
      const p: Record<string, string> = {};
      if (debouncedSearch)                                                          p.search     = debouncedSearch;
      if (filters.customer && filters.customer !== "all" && filters.customer !== "") p.customerId = filters.customer;
      if (filters.category && filters.category !== "all" && filters.category !== "") p.category   = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") p.division   = filters.division;
      if (filters.machine  && filters.machine  !== "all" && filters.machine  !== "") p.machineId  = filters.machine;
      if (fromDate) p.fromDate = toISTDateParam(fromDate);
      if (toDate)   p.toDate   = toISTDateParam(toDate);
      const res = await api.get("/admin/sales/export", { params: p, responseType: "blob" });
      const url = URL.createObjectURL(res.data); const a = document.createElement("a");
      a.href = url; a.download = "sales_export.xlsx"; a.click(); URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  const columns: Column<Sale>[] = [
    { key: "_id",          label: "No.",          render: (_s, i) => <span className="font-medium">{(pagination.page - 1) * pageSize + i + 1}</span> },
    { key: "customerInfo", label: "Customer",     render: (s) => <div><p className="font-medium text-sm">{s.customerInfo.name}</p><p className="text-xs text-muted-foreground">{s.customerInfo.phone}</p><p className="text-xs text-muted-foreground">{s.customerInfo.email}</p></div> },
    { key: "machinesCount",label: "Machines",     render: (s) => <span className="font-medium">{s.machinesCount}</span> },
    { key: "grandTotal",   label: "Total Sold",   render: (s) => <span className="font-medium">₹{s.grandTotal.toLocaleString()}</span> },
    { key: "createdAt",    label: "Sold At",      render: (s) => { const { date, time } = formatDateTime(s.createdAt); return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>; } },
    { key: "actions", label: "Actions", sticky: true, render: (s) => (
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate(`/sell-machines/${s._id}`)}><Eye className="h-3 w-3" /></Button>
        {s.invoiceUrl
          ? <Button size="sm" variant="outline" className="text-xs h-7 text-green-600 border-green-300" onClick={() => window.open(s.invoiceUrl, "_blank")}><FileText className="h-3 w-3" /></Button>
          : <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setInvoiceDialog(s); setInvoiceForm({ companyId: s.companyInfo?.companyId ?? "", cgst: s.cgst?.percent != null ? String(s.cgst.percent) : "", sgst: s.sgst?.percent != null ? String(s.sgst.percent) : "", igst: s.igst?.percent != null ? String(s.igst.percent) : "" }); }}><FileText className="h-3 w-3" /></Button>
        }
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Sell Machines" description="Record and manage machine sales to customers" actionLabel="Sell Machine" actionIcon={ShoppingCart} onAction={() => { setInitialCustomerId(""); setDialogOpen(true); }}>
            <Button variant="outline" className="gap-2" onClick={() => setExportDialog(true)}><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Total Sales",          value: `₹${stats.totalSales.toLocaleString()}`,      icon: ShoppingCart, color: "blue"   },
                { label: "Total Machines Sold",  value: stats.totalMachinesSold,                       icon: Package,      color: "green"  },
                { label: "Avg Sale Value",        value: `₹${stats.avgSaleValue.toLocaleString()}`,    icon: ShoppingCart, color: "orange" },
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
              <Input placeholder="Search by customer, machine, model..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
            <SearchableSelect options={customerOptions} value={filters.customer ?? ""} onChange={(v) => setFilters(p => ({ ...p, customer: v }))} onSearchChange={fetchCustomers}  placeholder="Customer" searchPlaceholder="Search customers..."  className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={categoryOptions} value={filters.category ?? ""} onChange={(v) => setFilters(p => ({ ...p, category: v }))} onSearchChange={fetchCategories} placeholder="Category" searchPlaceholder="Search categories..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={divisionOptions} value={filters.division ?? ""} onChange={(v) => setFilters(p => ({ ...p, division: v }))} onSearchChange={fetchDivisions}  placeholder="Division" searchPlaceholder="Search divisions..."  className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={machineOptions}  value={filters.machine  ?? ""} onChange={(v) => setFilters(p => ({ ...p, machine:  v }))} onSearchChange={fetchMachines}   placeholder="Machine"  searchPlaceholder="Search machines..."   className="w-[160px] h-9 text-sm" />
          </div>

          <DataTable columns={columns} data={data} pageSize={999} />
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pageSize} onPageChange={fetchSales} />
        </>
      )}

      <SellMachineDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setInitialCustomerId(""); navigate("/sell-machines", { replace: true }); }} onSuccess={() => fetchSales(1)} initialCustomerId={initialCustomerId} />

      <Dialog open={!!invoiceDialog} onOpenChange={(o) => { if (!o) setInvoiceDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Generate Sales Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Company <span className="text-destructive">*</span></Label>
              <Select value={invoiceForm.companyId} onValueChange={(v) => setInvoiceForm(p => ({ ...p, companyId: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>{companies.filter(c => c._id).map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">CGST %</Label>
                <Input type="number" min={0} max={100} placeholder="0" className="h-9" value={invoiceForm.cgst} onChange={(e) => setInvoiceForm(p => ({ ...p, cgst: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">SGST %</Label>
                <Input type="number" min={0} max={100} placeholder="0" className="h-9" value={invoiceForm.sgst} onChange={(e) => setInvoiceForm(p => ({ ...p, sgst: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">IGST %</Label>
                <Input type="number" min={0} max={100} placeholder="0" className="h-9" value={invoiceForm.igst} onChange={(e) => setInvoiceForm(p => ({ ...p, igst: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialog(null)} disabled={generatingInvoice}>Cancel</Button>
            <Button onClick={handleGenerateInvoice} disabled={generatingInvoice} className="gap-2">
              <FileText className="h-4 w-4" />{generatingInvoice ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportDialog} onOpenChange={setExportDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Export Sales Data</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">Do you want to download all sales data as an Excel file?</p>
          <DialogFooter><Button variant="outline" onClick={() => setExportDialog(false)}>Cancel</Button><Button onClick={handleExport}>Yes, Download</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SellMachinesPage;
