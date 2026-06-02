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
import { ShoppingCart, Eye, Plus, Trash2, Search, X, Info, Package, Download } from "lucide-react";
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

interface Stats {
  totalSales: number;
  totalMachinesSold: number;
  totalVariantsSold: number;
  avgSaleValue: number;
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

interface SerialEntry {
  serialNumber: string;
  contractTypeId: string;
  contractType: string;
  freeService: boolean;
  freeParts: boolean;
  validFrom: string;
  validTo: string;
}

interface VariantRow {
  attributeId: string;
  attributeName: string;
  value: string;
  quantity: string;
  serialEntries: SerialEntry[];
  price: string;
  discountedPrice: string;
  availableStock: number;
}

interface ContractType {
  _id: string;
  name: string;
  code: string;
  freeService: boolean;
  freeParts: boolean;
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
  const [createCustomerDialog, setCreateCustomerDialog] = useState(false);
  const [customerForm, setCustomerForm]     = useState({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "" });
  const [contractTypes, setContractTypes]   = useState<ContractType[]>([]);
  const [serialNumberDialog, setSerialNumberDialog] = useState(false);
  const [currentSerialEdit, setCurrentSerialEdit] = useState<{ mi: number; vi: number; serialEntries: SerialEntry[] } | null>(null);
  const [checkingSerials, setCheckingSerials] = useState(false);
  const contractTypesAbortRef = useRef<AbortController | null>(null);
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

  const fetchCustomers = async () => {
    try {
      const r = await api.get("/admin/customers", { params: { status: "Active", limit: 100 } });
      setCustomers(r.data.data);
    } catch {
      toast.error("Failed to load customers");
    }
  };

  const fetchContractTypes = useCallback(async (searchQuery = "") => {
    contractTypesAbortRef.current?.abort();
    const controller = new AbortController();
    contractTypesAbortRef.current = controller;

    try {
      const params: Record<string, string> = { status: "Active", limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const r = await api.get("/admin/contract-types", { params, signal: controller.signal });
      if (!controller.signal.aborted) {
        setContractTypes(r.data.data);
      }
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        toast.error("Failed to load contract types");
      }
    }
  }, []);

  // sync customerId when initialCustomerId changes
  useEffect(() => { setCustomerId(initialCustomerId); }, [initialCustomerId]);

  // fetch active customers once on open
  useEffect(() => {
    if (!open) return;
    fetchCustomers();
    fetchContractTypes();
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
        serialEntries:   [],
        price:           "",
        discountedPrice: "",
        availableStock:  v.currentStock,
      }));
    
    if (variants.length === 0) {
      toast.error("This machine has no variants in stock");
      return;
    }
    
    setEntries((prev) => [...prev, { machine, variants }]);
    setMachineSearch("");
    setDropdownOpen(false);
    machineInputRef.current?.blur();
  };

  const removeMachine = (machineId: string) =>
    setEntries((prev) => prev.filter((e) => e.machine._id !== machineId));

  const openSerialNumberDialog = (mi: number, vi: number) => {
    const variant = entries[mi].variants[vi];
    const qty = Number(variant.quantity) || 0;
    const existing = variant.serialEntries;
    const entries_: SerialEntry[] = existing.length > 0
      ? [...existing]
      : Array.from({ length: qty }, () => ({ serialNumber: "", contractTypeId: "", contractType: "", freeService: false, freeParts: false, validFrom: "", validTo: "" }));
    setCurrentSerialEdit({ mi, vi, serialEntries: entries_ });
    setSerialNumberDialog(true);
  };

  const handleSerialNumberSave = async () => {
    if (!currentSerialEdit) return;
    const { mi, vi, serialEntries } = currentSerialEdit;

    for (let i = 0; i < serialEntries.length; i++) {
      const e = serialEntries[i];
      if (!e.serialNumber.trim()) { toast.error(`Fill serial number for entry ${i + 1}`); return; }
      if (!e.contractTypeId) { toast.error(`Select contract type for serial ${i + 1}`); return; }
      if (!e.validFrom || !e.validTo) { toast.error(`Enter dates for serial ${i + 1}`); return; }
      if (new Date(e.validTo) <= new Date(e.validFrom)) { toast.error(`Valid to must be after valid from for serial ${i + 1}`); return; }
    }

    const allSerials = serialEntries.map(e => e.serialNumber.trim());
    const unique = new Set(allSerials.map(s => s.toUpperCase()));
    if (unique.size !== allSerials.length) { toast.error("Duplicate serial numbers found"); return; }

    setCheckingSerials(true);
    try {
      await api.post("/admin/sales/check-serials", { serialNumbers: allSerials });
      setEntries(prev => prev.map((e, i) => i !== mi ? e : {
        ...e,
        variants: e.variants.map((v, j) => j !== vi ? v : {
          ...v,
          serialEntries: serialEntries.map(se => ({ ...se, serialNumber: se.serialNumber.trim() })),
        }),
      }));
      setSerialNumberDialog(false);
      setCurrentSerialEdit(null);
      toast.success("Serial numbers verified and saved");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Serial number check failed");
    } finally {
      setCheckingSerials(false);
    }
  };

  const updateVariant = (mi: number, vi: number, field: keyof VariantRow, value: string | boolean | string[]) => {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== mi) return e;
        return {
          ...e,
          variants: e.variants.map((v, j) => {
            if (j !== vi) return v;
            if (field === "quantity") return { ...v, quantity: value as string, serialEntries: [] };
            return { ...v, [field]: value };
          }),
        };
      })
    );
  };

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
        
        if (hasQty && hasPrice && v.serialEntries.length !== Number(v.quantity)) {
          toast.error(`Add ${v.quantity} serial numbers for ${entry.machine.name} — ${v.attributeName}: ${v.value}`);
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
        variants: e.variants
          .filter((v) => v.quantity !== "" && Number(v.quantity) > 0 && v.price !== "" && v.serialEntries.length > 0)
          .flatMap((v) =>
            v.serialEntries.map((se) => ({
              attribute:       v.attributeId,
              value:           v.value,
              quantity:        1,
              serialNumbers:   [{ serialNumber: se.serialNumber, contractTypeId: se.contractTypeId, validFrom: se.validFrom, validTo: se.validTo }],
              price:           Number(v.price),
              discountedPrice: v.discountedPrice !== "" ? Number(v.discountedPrice) : null,
            }))
          ),
      })).filter((m) => m.variants.length > 0),
    };

    if (payload.machines.length === 0) {
      toast.error("Please fill quantity, price, and serial entries for at least one variant");
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

  const handleCreateCustomer = async () => {
    if (!customerForm.name || !customerForm.phone || !customerForm.email) {
      toast.error("Name, phone and email are required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/admin/customers", { ...customerForm, status: "Active" });
      toast.success("Customer created successfully");
      await fetchCustomers();
      setCreateCustomerDialog(false);
      setCustomerForm({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "" });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create customer");
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
      <DialogContent className="max-w-[80vw] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Sell Machine</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2 flex-1 overflow-y-auto">
          {/* Customer */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs gap-1.5" 
                onClick={() => setCreateCustomerDialog(true)}
              >
                <Plus className="h-3 w-3" /> Create New Customer
              </Button>
            </div>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name} — {c.phone}
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
                <span>Variants with empty quantity or price will be skipped. Contract type, dates, and serial numbers are configured in the serial number popup. Free Service and Free Parts are auto-populated based on selected contract type. Stock will be automatically deducted.</span>
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
                            <th className="text-left font-medium pb-2 pr-3 w-48">Serial Numbers &amp; Contracts <span className="text-destructive">*</span></th>
                            <th className="text-left font-medium pb-2 pr-3 w-24">Price <span className="text-destructive">*</span></th>
                            <th className="text-left font-medium pb-2 pr-3 w-24">Disc. Price</th>
                            <th className="text-left font-medium pb-2 pr-3 w-24">Total</th>
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
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs w-48"
                                  onClick={() => openSerialNumberDialog(mi, vi)}
                                  disabled={!v.quantity || Number(v.quantity) === 0}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  {v.serialEntries.length > 0
                                    ? `${v.serialEntries.length}/${v.quantity} Added`
                                    : "Add Serial Nos & Contracts"}
                                </Button>
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
                              <td className="py-1.5 pr-3">
                                {v.quantity && v.price ? (
                                  <span className="text-xs font-medium text-foreground">
                                    ₹{((Number(v.discountedPrice) || Number(v.price)) * Number(v.quantity)).toLocaleString()}
                                  </span>
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

        <DialogFooter className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium">
            Net Total: <span className="text-base font-bold text-green-600">₹{
              entries.reduce((sum, e) =>
                sum + e.variants.reduce((vSum, v) =>
                  vSum + (v.quantity && v.price ? (Number(v.discountedPrice) || Number(v.price)) * Number(v.quantity) : 0)
                , 0)
              , 0).toLocaleString()
            }</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              <Plus className="h-4 w-4" />
              {submitting ? "Recording..." : "Record Sale"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Create Customer Dialog */}
      <Dialog open={createCustomerDialog} onOpenChange={(o) => { if (!o) { setCreateCustomerDialog(false); setCustomerForm({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "" }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Customer name" value={customerForm.name} onChange={(e) => setCustomerForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. 9800000000" value={customerForm.phone} onChange={(e) => setCustomerForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" placeholder="customer@example.com" value={customerForm.email} onChange={(e) => setCustomerForm((prev) => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input placeholder="Full address" value={customerForm.address} onChange={(e) => setCustomerForm((prev) => ({ ...prev, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Zone</Label>
              <Input placeholder="Zone/Area" value={customerForm.zone} onChange={(e) => setCustomerForm((prev) => ({ ...prev, zone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>GST Number</Label>
              <Input placeholder="e.g. 27AABCG1234A1Z5" value={customerForm.gstNumber} onChange={(e) => setCustomerForm((prev) => ({ ...prev, gstNumber: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateCustomerDialog(false); setCustomerForm({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "" }); }} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreateCustomer} disabled={submitting}>{submitting ? "Creating..." : "Create Customer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={serialNumberDialog} onOpenChange={(o) => { if (!o) { setSerialNumberDialog(false); setCurrentSerialEdit(null); } }}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Serial Numbers &amp; Contracts</DialogTitle>
            {currentSerialEdit && (
              <p className="text-sm text-muted-foreground mt-1">
                {entries[currentSerialEdit.mi].machine.name} — {entries[currentSerialEdit.mi].variants[currentSerialEdit.vi].attributeName}: {entries[currentSerialEdit.mi].variants[currentSerialEdit.vi].value}
              </p>
            )}
          </DialogHeader>
          {currentSerialEdit && (
            <div className="flex-1 overflow-auto py-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left font-medium pb-2 pr-3 w-8">#</th>
                    <th className="text-left font-medium pb-2 pr-3">Serial Number <span className="text-destructive">*</span></th>
                    <th className="text-left font-medium pb-2 pr-3 w-52">Contract Type <span className="text-destructive">*</span></th>
                    <th className="text-left font-medium pb-2 pr-3 w-36">Valid From <span className="text-destructive">*</span></th>
                    <th className="text-left font-medium pb-2 pr-3 w-36">Valid To <span className="text-destructive">*</span></th>
                    <th className="text-center font-medium pb-2 pr-3 w-24">Free Service</th>
                    <th className="text-center font-medium pb-2 w-24">Free Parts</th>
                  </tr>
                </thead>
                <tbody>
                  {currentSerialEdit.serialEntries.map((se, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground">{idx + 1}</td>
                      <td className="py-2 pr-3">
                        <Input
                          placeholder={`e.g. SN-${String(idx + 1).padStart(6, "0")}`}
                          value={se.serialNumber}
                          onChange={(e) => setCurrentSerialEdit(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.serialEntries];
                            updated[idx] = { ...updated[idx], serialNumber: e.target.value };
                            return { ...prev, serialEntries: updated };
                          })}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <SearchableSelect
                          options={contractTypes.map((ct) => ({ label: `${ct.name} (${ct.code})`, value: ct._id }))}
                          value={se.contractTypeId}
                          onChange={(val) => {
                            const selected = contractTypes.find(ct => ct._id === val);
                            setCurrentSerialEdit(prev => {
                              if (!prev) return prev;
                              const updated = [...prev.serialEntries];
                              updated[idx] = { ...updated[idx], contractTypeId: val, contractType: selected?.name ?? "", freeService: selected?.freeService ?? false, freeParts: selected?.freeParts ?? false };
                              return { ...prev, serialEntries: updated };
                            });
                          }}
                          onSearchChange={fetchContractTypes}
                          placeholder="Select contract"
                          searchPlaceholder="Search..."
                          className="h-7 text-xs w-52"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          type="date"
                          className="h-7 text-xs w-36"
                          value={se.validFrom}
                          disabled={!se.contractTypeId}
                          onChange={(e) => setCurrentSerialEdit(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.serialEntries];
                            updated[idx] = { ...updated[idx], validFrom: e.target.value };
                            return { ...prev, serialEntries: updated };
                          })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          type="date"
                          className="h-7 text-xs w-36"
                          value={se.validTo}
                          disabled={!se.contractTypeId}
                          onChange={(e) => setCurrentSerialEdit(prev => {
                            if (!prev) return prev;
                            const updated = [...prev.serialEntries];
                            updated[idx] = { ...updated[idx], validTo: e.target.value };
                            return { ...prev, serialEntries: updated };
                          })}
                        />
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${se.freeService ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {se.freeService ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${se.freeParts ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {se.freeParts ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSerialNumberDialog(false); setCurrentSerialEdit(null); }} disabled={checkingSerials}>Cancel</Button>
            <Button onClick={handleSerialNumberSave} disabled={checkingSerials}>{checkingSerials ? "Checking..." : "Save"}</Button>
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
  const [serialNumber, setSerialNumber]         = useState("");
  const [debouncedSerialNumber, setDebouncedSerialNumber] = useState("");
  const [filters, setFilters]                 = useState<Record<string, string>>({});
  const [fromDate, setFromDate]               = useState("");
  const [toDate, setToDate]                   = useState("");
  const [loading, setLoading]                 = useState(true);
  const [pageSize, setPageSize]               = useState(10);
  const [pagination, setPagination]           = useState({ page: 1, totalPages: 1, total: 0 });
  const [dialogOpen, setDialogOpen]           = useState(false);
  const [exportDialog, setExportDialog]       = useState(false);
  const [initialCustomerId, setInitialCustomerId] = useState("");
  const [customerOptions, setCustomerOptions] = useState<{ label: string; value: string }[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [divisionOptions, setDivisionOptions] = useState<{ label: string; value: string }[]>([]);
  const [machineOptions, setMachineOptions]   = useState<{ label: string; value: string }[]>([]);
  const customerAbortRef = useRef<AbortController | null>(null);
  const categoryAbortRef = useRef<AbortController | null>(null);
  const divisionAbortRef = useRef<AbortController | null>(null);
  const machineAbortRef = useRef<AbortController | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSerialNumber(serialNumber), 500);
    return () => clearTimeout(t);
  }, [serialNumber]);

  // auto-open dialog if customerId is in query params
  useEffect(() => {
    const cid = searchParams.get("customerId");
    if (cid) {
      setInitialCustomerId(cid);
      setDialogOpen(true);
    }
  }, [searchParams]);

  // Fetch filter options on mount
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [customerRes, categoryRes, divisionRes, machineRes] = await Promise.all([
          api.get("/admin/customers", { params: { limit: 10 } }),
          api.get("/admin/machine-categories", { params: { limit: 10 } }),
          api.get("/admin/machine-divisions", { params: { limit: 10 } }),
          api.get("/admin/machines", { params: { limit: 10 } }),
        ]);
        setCustomerOptions(customerRes.data.data.map((c: any) => ({ label: `${c.name} - ${c.phone}`, value: c._id })));
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
  const fetchCustomers = useCallback(async (searchQuery: string) => {
    customerAbortRef.current?.abort();
    const controller = new AbortController();
    customerAbortRef.current = controller;

    try {
      const params: Record<string, string> = { limit: "100" };
      if (searchQuery) params.search = searchQuery;
      const res = await api.get("/admin/customers", { params, signal: controller.signal });
      if (!controller.signal.aborted) {
        setCustomerOptions(res.data.data.map((c: any) => ({ label: `${c.name} - ${c.phone}`, value: c._id })));
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

  const handleExport = async () => {
    setExportDialog(false);
    toast.success("Download starting...");
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.customer && filters.customer !== "all" && filters.customer !== "") params.customerId = filters.customer;
      if (filters.category && filters.category !== "all" && filters.category !== "") params.category = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") params.division = filters.division;
      if (filters.machine && filters.machine !== "all" && filters.machine !== "") params.machineId = filters.machine;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/sales/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sales_export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  const abortRef = useRef<AbortController | null>(null);

  const fetchSales = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(pageSize) };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.customer && filters.customer !== "all" && filters.customer !== "") params.customerId = filters.customer;
      if (filters.category && filters.category !== "all" && filters.category !== "") params.category = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") params.division = filters.division;
      if (filters.machine && filters.machine !== "all" && filters.machine !== "") params.machineId = filters.machine;
      if (debouncedSerialNumber) params.serialNumber = debouncedSerialNumber;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await api.get("/admin/sales", { params, signal: controller.signal });
      setData(res.data.data);
      setStats(res.data.stats || null);
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
  }, [debouncedSearch, debouncedSerialNumber, filters, fromDate, toDate, pageSize]);

  useEffect(() => { fetchSales(1); }, [fetchSales]);

  const columns: Column<Sale>[] = [
    {
      key: "_id", label: "No.",
      render: (_s, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * pageSize + i + 1}</span>,
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
                      <p className="text-sm text-muted-foreground">Total Sales</p>
                      <p className="text-2xl font-bold mt-1">₹{stats.totalSales.toLocaleString()}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <ShoppingCart className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Machines Sold</p>
                      <p className="text-2xl font-bold mt-1">{stats.totalMachinesSold}</p>
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
                      <p className="text-sm text-muted-foreground">Total Variants Sold</p>
                      <p className="text-2xl font-bold mt-1">{stats.totalVariantsSold}</p>
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
                      <p className="text-sm text-muted-foreground">Avg Sale Value</p>
                      <p className="text-2xl font-bold mt-1">₹{stats.avgSaleValue.toLocaleString()}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                      <ShoppingCart className="h-6 w-6 text-orange-600" />
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
                placeholder="Search by customer, machine, model..."
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
              {(search || serialNumber || fromDate || toDate || Object.values(filters).some(v => v && v !== "all")) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setSerialNumber(""); setFilters({}); setFromDate(""); setToDate(""); }} className="h-9">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: Filters right-aligned */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SearchableSelect options={customerOptions} value={filters.customer ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, customer: v }))} onSearchChange={fetchCustomers} placeholder="Customer" searchPlaceholder="Search customers..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={categoryOptions} value={filters.category ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, category: v }))} onSearchChange={fetchCategories} placeholder="Category" searchPlaceholder="Search categories..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={divisionOptions} value={filters.division ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, division: v }))} onSearchChange={fetchDivisions} placeholder="Division" searchPlaceholder="Search divisions..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={machineOptions} value={filters.machine ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, machine: v }))} onSearchChange={fetchMachines} placeholder="Machine" searchPlaceholder="Search machines..." className="w-[160px] h-9 text-sm" />
            <Input
              placeholder="Serial number..."
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="w-[160px] h-9 text-sm"
            />
          </div>
          <div>
            <DataTable columns={columns} data={data} pageSize={999} />
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pageSize}
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

      {/* Export Confirm Dialog */}
      <Dialog open={exportDialog} onOpenChange={setExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Sales Data</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            Do you want to download all sales data as an Excel file?
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

export default SellMachinesPage;
