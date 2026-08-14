import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Trash2, Search, X, Info, Package, Download, FileText, UserCircle, CreditCard, AlertCircle, Eye, Users } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Pagination } from "@/components/Pagination";
import api from "@/lib/axiosInterceptor";

const PRODUCT_CATEGORY_ID = import.meta.env.VITE_PRODUCT_CATEGORY_ID;
const TSS_CONTRACT_TYPE_ID = import.meta.env.VITE_TSS_CONTRACT_TYPE_ID;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerInfo { customerId: string | null; name: string; phone: string; email: string; address: string; zone: string; gstNumber: string; }
interface ContractTypeSnapshot { contractTypeId: string; name: string; code: string; freeService: boolean; freeParts: boolean; validFrom: string; validTo: string; }
interface SaleMachine {
  machineId: string; machineName: string; modelNumber: string; partCode: string; category: string; categoryId: string; division: string;
  quantity: number;
  sellingPriceWithGst: number; sellingPriceBase: number; gstAmountPerUnit: number; discountPercentage: number;
  netSellingPriceBase: number; netSellingPriceWithGst: number; netGstAmountPerUnit: number;
  sellingTotalBase: number; sellingTotalWithGst: number; gstAmountTotal: number;
  serialNumbers?: { serialNumber: string; contractType: ContractTypeSnapshot | null; pagesCategories?: { pagesCategoryId: string; pagesCategory: string; costPerPage: number }[] }[];
  partCodes?: { partCode: string; buyingPriceBase: number } | null;
}
interface Sale { _id: string; customerInfo: CustomerInfo; machines: SaleMachine[]; machinesCount: number; grandTotalBase: number; grandTotalWithGst: number; grandTotalGstAmount: number; currentPaymentStatus: string; paidAmount: number; remainingAmount: number; createdAt: string; invoiceUrl?: string; invoiceNumber?: string; companyInfo?: { companyId: string; name?: string } | null; cgst?: { percent: number; amount: number } | null; sgst?: { percent: number; amount: number } | null; igst?: { percent: number; amount: number } | null; }
interface Stats { totalSales: number; totalMachinesSold: number; avgSaleValue: number; }
interface Customer { _id: string; name: string; phone: string; email: string; }
interface Machine { _id: string; name: string; modelNumber: string; currentStock: number; category?: { _id: string; name: string }; }
interface ContractType { _id: string; name: string; code: string; freeService: boolean; freeParts: boolean; }
interface ActiveCompany { _id: string; name: string; }

interface PagesCategory { _id: string; name: string; }
interface PagesCategoryEntry { pagesCategoryId: string; pagesCategory: string; costPerPage: string; }

interface UnitRow {
  value: string;
  contractTypeId: string;
  validFrom: string;
  validTo: string;
  minCopies: string;
  pagesCategories: PagesCategoryEntry[];
}

interface Engineer { _id: string; name: string; engineerId?: string; }

interface MachineEntry {
  machine: Machine;
  quantity: string;
  sellingPriceWithGst: string;
  discountPercentage: string;
  availableCodes: string[];
  loadingCodes: boolean;
  units: UnitRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return {
    date: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`,
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
};
const toISTDateParam = (h: string) => { const [y, m, d] = h.split("-"); return `${d}/${m}/${String(y).slice(2)}`; };

// ─── Sell Dialog ──────────────────────────────────────────────────────────────

const SellMachineDialog = ({ open, onClose, onSuccess, initialCustomerId = "" }: { open: boolean; onClose: () => void; onSuccess: () => void; initialCustomerId?: string }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const customerAbortRef = useRef<AbortController | null>(null);
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
  const [machineSearch, setMachineSearch] = useState("");
  const [machineResults, setMachineResults] = useState<Machine[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [entries, setEntries] = useState<MachineEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createCustomerDialog, setCreateCustomerDialog] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "", profilePhoto: null as File | null });
  const [zones, setZones] = useState<{ label: string; value: string }[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const [activePagesCats, setActivePagesCats] = useState<PagesCategory[]>([]);
  const [totalGst, setTotalGst] = useState<number | null>(null);
  const [gstConfig, setGstConfig] = useState<{ cgst: number; sgst: number; igst: number } | null>(null);
  const [companies, setCompanies] = useState<{ _id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [processedByDialog, setProcessedByDialog] = useState(false);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [selectedEngineers, setSelectedEngineers] = useState<string[]>([]);
  const [engineerSearch, setEngineerSearch] = useState("");
  const [loadingEngineers, setLoadingEngineers] = useState(false);
  const [outstanding, setOutstanding] = useState<{ _id: string; invoiceNumber: string; grandTotalWithGst: number; paidAmount: number; remainingAmount: number; currentPaymentStatus: string }[]>([]);
  const [outstandingTotal, setOutstandingTotal] = useState(0);
  const [outstandingPopover, setOutstandingPopover] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"Unpaid" | "Paid" | "Partial-Paid">("Unpaid");
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Online" | "">("Cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const ctAbortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const machineInputRef = useRef<HTMLInputElement>(null);

  const fetchMachines = async (search = "") => {
    setSearching(true);
    try {
      const p: any = {}; if (search.trim()) p.search = search.trim();
      const r = await api.get("/admin/sales/available-machines", { params: p });
      setMachineResults(r.data.data);
    } catch { toast.error("Failed to load machines"); }
    finally { setSearching(false); }
  };

  const fetchCustomers = async (q = "") => {
    customerAbortRef.current?.abort();
    const ctrl = new AbortController(); customerAbortRef.current = ctrl;
    try {
      const p: any = { status: "Active", limit: 100 };
      if (q) p.search = q;
      const r = await api.get("/admin/customers", { params: p, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setCustomers(r.data.data);
    } catch { }
  };

  const fetchContractTypes = useCallback(async (q = "") => {
    ctAbortRef.current?.abort();
    const ctrl = new AbortController(); ctAbortRef.current = ctrl;
    try {
      const p: any = { status: "Active", limit: "100" }; if (q) p.search = q;
      const r = await api.get("/admin/contract-types", { params: p, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setContractTypes(r.data.data);
    } catch { }
  }, []);

  useEffect(() => { setCustomerId(initialCustomerId); }, [initialCustomerId]);
  const fetchZones = async () => {
    try {
      const r = await api.get("/admin/zones", { params: { status: "Active", limit: 100 } });
      setZones(r.data.data.map((z: any) => ({ label: `${z.name} (${z.code})`, value: z._id })));
    } catch { }
  };

  const fetchGstConfig = async () => {
    try {
      const r = await api.get("/admin/gst-config");
      if (r.data.data) {
        setTotalGst(r.data.data.totalGst ?? null);
        setGstConfig({ cgst: r.data.data.cgst || 0, sgst: r.data.data.sgst || 0, igst: r.data.data.igst || 0 });
      }
    } catch { }
  };

  const fetchCompanies = async () => {
    try { const r = await api.get("/admin/companies", { params: { status: "Active", limit: 100 } }); setCompanies(r.data.data); }
    catch { toast.error("Failed to load companies"); }
  };

  useEffect(() => {
    if (!customerId) { setOutstanding([]); setOutstandingTotal(0); return; }
    api.get(`/admin/sales/customer/${customerId}/outstanding-due`)
      .then(r => { setOutstanding(r.data.data); setOutstandingTotal(r.data.totalRemaining); })
      .catch(() => {});
  }, [customerId]);

  const fetchEngineers = async (q = "") => {
    setLoadingEngineers(true);
    try {
      const p: any = { limit: 100, status: "Active" };
      if (q) p.search = q;
      const r = await api.get("/admin/engineers", { params: p });
      setEngineers(r.data.data);
    } catch { toast.error("Failed to load engineers"); }
    finally { setLoadingEngineers(false); }
  };

  useEffect(() => { if (!open) return; fetchCustomers(); fetchContractTypes(); fetchMachines(); fetchActivePagesCats(); fetchZones(); fetchGstConfig(); fetchCompanies(); }, [open]);

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
    if (entries.find((e) => e.machine._id === machine._id)) { toast.info("Item already added"); return; }
    setEntries((prev) => [...prev, { machine, quantity: "", sellingPriceWithGst: "", discountPercentage: "", availableCodes: [], loadingCodes: false, units: [] }]);
    setMachineSearch(""); setDropdownOpen(false); machineInputRef.current?.blur();
  };

  const removeMachine = (id: string) => setEntries((prev) => prev.filter((e) => e.machine._id !== id));
  const updateEntry = (mi: number, field: keyof MachineEntry, value: any) =>
    setEntries((prev) => prev.map((e, i) => i !== mi ? e : { ...e, [field]: value }));

  const updateUnit = (mi: number, ui: number, field: keyof UnitRow, value: any) =>
    setEntries((prev) => prev.map((e, i) => {
      if (i !== mi) return e;
      const units = e.units.map((u, j) => j !== ui ? u : { ...u, [field]: value });
      return { ...e, units };
    }));

  const handleQtyChange = async (mi: number, val: string) => {
    const entry = entries[mi];
    const isParts = entry.machine.category?._id !== PRODUCT_CATEGORY_ID;
    const qty = Number(val) || 0;

    if (val !== "" && qty > entry.machine.currentStock) {
      toast.error(`Max available stock is ${entry.machine.currentStock}`); return;
    }

    // Reset units immediately
    setEntries((prev) => prev.map((e, i) => i !== mi ? e : { ...e, quantity: val, units: [], loadingCodes: qty > 0 }));

    if (qty <= 0) return;

    try {
      const res = await api.get("/admin/sales/available-codes", { params: { machineId: entry.machine._id } });
      const available: string[] = res.data.data;

      if (available.length === 0) {
        toast.error(`No available ${isParts ? "part codes" : "serial numbers"} in stock`);
        setEntries((prev) => prev.map((e, i) => i !== mi ? e : { ...e, quantity: "", loadingCodes: false }));
        return;
      }
      if (qty > available.length) {
        toast.error(`Max available quantity is ${available.length}. Please reduce the quantity.`);
        // For parts: just cap quantity, no units needed
        // For products: generate unit rows up to available length
        setEntries((prev) => prev.map((e, i) => i !== mi ? e : {
          ...e,
          quantity: String(available.length),
          loadingCodes: false,
          availableCodes: available,
          units: isParts ? [] : Array.from({ length: available.length }, () => ({ value: "", contractTypeId: "", validFrom: "", validTo: "", minCopies: "", pagesCategories: [] })),
        }));
        return;
      }

      setEntries((prev) => prev.map((e, i) => i !== mi ? e : {
        ...e,
        loadingCodes: false,
        availableCodes: available,
        // For parts: no unit rows needed, just store available codes for reference
        units: isParts ? [] : Array.from({ length: qty }, () => ({ value: "", contractTypeId: "", validFrom: "", validTo: "", minCopies: "", pagesCategories: [] })),
      }));
    } catch {
      toast.error("Failed to load available codes");
      setEntries((prev) => prev.map((e, i) => i !== mi ? e : { ...e, loadingCodes: false }));
    }
  };

  const handleSubmit = async () => {
    if (!customerId) { toast.error("Please select a customer"); return; }
    if (entries.length === 0) { toast.error("Please add at least one machine"); return; }

    for (const e of entries) {
      if (!e.quantity || Number(e.quantity) <= 0) { toast.error(`Enter quantity for ${e.machine.name}`); return; }
      if (!e.sellingPriceWithGst) { toast.error(`Enter selling price for ${e.machine.name}`); return; }
      const isParts = e.machine.category?._id !== PRODUCT_CATEGORY_ID;
      // For parts, qty + price is all that's needed — skip unit validation
      if (isParts) continue;
      const qty = Number(e.quantity);
      if (e.units.length !== qty) { toast.error(`Codes not loaded for ${e.machine.name}`); return; }
      for (let i = 0; i < qty; i++) {
        const u = e.units[i];
        if (!u.value.trim()) { toast.error(`Select serial number for ${e.machine.name} unit ${i + 1}`); return; }
        if (!u.contractTypeId) { toast.error(`Select contract type for ${e.machine.name} unit ${i + 1}`); return; }
        if (!u.validFrom) { toast.error(`Enter valid from for ${e.machine.name} unit ${i + 1}`); return; }
        if (!u.validTo) { toast.error(`Enter valid to for ${e.machine.name} unit ${i + 1}`); return; }
        if (u.validTo <= u.validFrom) { toast.error(`Valid To must be after Valid From for ${e.machine.name} unit ${i + 1}`); return; }
        if (u.contractTypeId === TSS_CONTRACT_TYPE_ID && u.pagesCategories.length === 0) {
          toast.error(`Add at least one pages category for ${e.machine.name} unit ${i + 1}`); return;
        }
        if (u.contractTypeId === TSS_CONTRACT_TYPE_ID) {
          for (let pi = 0; pi < u.pagesCategories.length; pi++) {
            const p = u.pagesCategories[pi];
            if (!p.pagesCategoryId) { toast.error(`Select pages category for ${e.machine.name} unit ${i + 1} entry ${pi + 1}`); return; }
            if (p.costPerPage === "" || isNaN(Number(p.costPerPage)) || Number(p.costPerPage) < 0) {
              toast.error(`Enter valid cost per page for ${e.machine.name} unit ${i + 1} entry ${pi + 1}`); return;
            }
          }
        }
      }
      const vals = e.units.map(u => u.value.trim().toUpperCase());
      if (new Set(vals).size !== vals.length) { toast.error(`Duplicate codes in ${e.machine.name}`); return; }
    }

    if (!companyId) { toast.error("Please select a company"); return; }
    if (sellingTotal > 0 && paymentStatus !== "Unpaid") {
      if (!paymentMethod) { toast.error("Please select a payment method"); return; }
      if (!paymentDate) { toast.error("Please select a payment date"); return; }
      if (paymentStatus === "Partial-Paid") {
        if (!paidAmount || Number(paidAmount) <= 0) { toast.error("Enter paid amount for Partial-Paid"); return; }
      }
    }

    const payload: any = {
      customerId,
      companyId,
      currentPaymentStatus: paymentStatus,
      ...(paymentStatus !== "Unpaid" && { paymentMethod, paymentDate }),
      ...(paymentStatus === "Partial-Paid" && { paidAmount: Number(paidAmount) }),
      machines: entries.map((e) => {
        const isParts = e.machine.category?._id !== PRODUCT_CATEGORY_ID;
        return {
          machineId: e.machine._id,
          quantity: Number(e.quantity),
          sellingPriceWithGst: Number(e.sellingPriceWithGst),
          discountPercentage: e.discountPercentage !== "" ? Number(e.discountPercentage) : undefined,
          ...(isParts
            ? { partCodes: [] }
            : { serialNumbers: e.units.map(u => ({
                serialNumber: u.value.trim(),
                contractTypeId: u.contractTypeId,
                validFrom: u.validFrom,
                validTo: u.validTo,
                minCopies: Number(u.minCopies) || 0,
                pagesCategories: u.pagesCategories.map(p => ({ ...p, costPerPage: Number(p.costPerPage) })),
              })) }),
        };
      }),
    };

    // open engineer selection dialog instead of submitting directly
    setProcessedByDialog(true);
    fetchEngineers();
  };

  const handleSaveAndSale = async () => {
    const payload: any = {
      customerId,
      companyId,
      currentPaymentStatus: paymentStatus,
      ...(paymentStatus !== "Unpaid" && { paymentMethod, paymentDate }),
      ...(paymentStatus === "Partial-Paid" && { paidAmount: Number(paidAmount) }),
      processedBy: selectedEngineers,
      machines: entries.map((e) => {
        const isParts = e.machine.category?._id !== PRODUCT_CATEGORY_ID;
        return {
          machineId: e.machine._id,
          quantity: Number(e.quantity),
          sellingPriceWithGst: Number(e.sellingPriceWithGst),
          discountPercentage: e.discountPercentage !== "" ? Number(e.discountPercentage) : undefined,
          ...(isParts
            ? { partCodes: [] }
            : { serialNumbers: e.units.map(u => ({
                serialNumber: u.value.trim(),
                contractTypeId: u.contractTypeId,
                validFrom: u.validFrom,
                validTo: u.validTo,
                minCopies: Number(u.minCopies) || 0,
                pagesCategories: u.pagesCategories.map(p => ({ ...p, costPerPage: Number(p.costPerPage) })),
              })) }),
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
      let payload: any;
      if (customerForm.profilePhoto) {
        const fd = new FormData();
        fd.append("name", customerForm.name);
        fd.append("phone", customerForm.phone);
        fd.append("email", customerForm.email);
        if (customerForm.address) fd.append("userLocation", JSON.stringify({ address: customerForm.address }));
        if (customerForm.zone) fd.append("zone", customerForm.zone);
        if (customerForm.gstNumber) fd.append("gstNumber", customerForm.gstNumber.toUpperCase());
        fd.append("status", "Active");
        fd.append("profilePhoto", customerForm.profilePhoto);
        payload = fd;
      } else {
        payload = { name: customerForm.name, phone: customerForm.phone, email: customerForm.email, address: customerForm.address, zone: customerForm.zone || undefined, gstNumber: customerForm.gstNumber || undefined, status: "Active" };
      }
      const res = await api.post("/admin/customers", payload);
      toast.success("Customer created successfully");
      await fetchCustomers();
      setCustomerId(res.data.data._id);
      setCreateCustomerDialog(false);
      setCustomerForm({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "", profilePhoto: null });
    } catch (err: any) { toast.error(err.response?.data?.message || "Failed to create customer"); }
    finally { setSubmitting(false); }
  };

  const handleClose = () => { setCustomerId(initialCustomerId); setCompanyId(""); setPaymentStatus("Unpaid"); setPaymentMethod("Cash"); setPaidAmount(""); setPaymentDate(new Date().toISOString().split("T")[0]); setMachineSearch(""); setMachineResults([]); setDropdownOpen(false); setEntries([]); setOutstanding([]); setOutstandingTotal(0); setOutstandingPopover(false); setProcessedByDialog(false); setSelectedEngineers([]); setEngineerSearch(""); onClose(); };

  const sellingTotal = entries.reduce((s, e) => {
    if (!e.quantity || !e.sellingPriceWithGst) return s;
    const discPct = Number(e.discountPercentage) || 0;
    const net = Number(e.sellingPriceWithGst) * (1 - discPct / 100);
    return s + net * Number(e.quantity);
  }, 0);

  useEffect(() => {
    if (sellingTotal === 0) {
      setPaymentStatus("Paid");
      setPaymentMethod("");
    } else if (paymentStatus === "Paid" && sellingTotal > 0) {
      // reset back to Unpaid only if it was auto-set (no method selected)
      if (!paymentMethod) setPaymentStatus("Unpaid");
    }
  }, [sellingTotal]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <div>
              <h2 className="text-lg font-semibold">Record Item Sale</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Select a customer and add items to record a sale</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {gstConfig && (
              <div className="text-right mr-[10px]">
                <p className="text-xs text-muted-foreground">Current GST</p>
                <p className="text-sm font-semibold">
                  CGST: {gstConfig.cgst}% | SGST: {gstConfig.sgst}% | IGST: {gstConfig.igst}%
                </p>
                <p className="text-xs font-medium text-blue-600 mt-1">
                  Total: {gstConfig.cgst + gstConfig.sgst + gstConfig.igst}%
                </p>
              </div>
            )}
          {customerId && outstandingTotal > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOutstandingPopover((p) => !p)}
                className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                Outstanding: ₹{outstandingTotal.toLocaleString()}
              </button>
              {outstandingPopover && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOutstandingPopover(false)} />
                  <div className="absolute right-0 top-9 z-50 w-[480px] rounded-lg border bg-background shadow-xl">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b">
                      <p className="text-sm font-semibold">Outstanding Dues</p>
                      <button type="button" onClick={() => setOutstandingPopover(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Invoice No</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Paid</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Remaining</th>
                            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {outstanding.map((o, idx) => (
                            <tr key={o._id} className="hover:bg-muted/20">
                              <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                              <td className="px-3 py-2 font-mono">{o.invoiceNumber || "—"}</td>
                              <td className="px-3 py-2 text-right">₹{o.grandTotalWithGst.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-green-600">₹{o.paidAmount.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-medium text-red-500">₹{o.remainingAmount.toLocaleString()}</td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ o.currentPaymentStatus === "Partial-Paid" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700" }`}>
                                  {o.currentPaymentStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/30">
                      <span className="text-xs text-muted-foreground">{outstanding.length} invoice{outstanding.length !== 1 ? "s" : ""}</span>
                      <span className="text-xs font-semibold text-red-600">Total Due: ₹{outstandingTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Body: two-panel */}
        <div className="flex flex-1 min-h-0">

          {/* Left panel — customer + machine search */}
          <div className="w-72 shrink-0 border-r flex flex-col bg-muted/30">
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">

              {/* Company */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company <span className="text-destructive">*</span></Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Customer */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer <span className="text-destructive">*</span></Label>
                  <button type="button" className="text-xs text-primary hover:underline flex items-center gap-1" onClick={() => setCreateCustomerDialog(true)}>
                    <Plus className="h-3 w-3" /> New
                  </button>
                </div>
                <SearchableSelect
                  options={customers.map((c) => ({ label: `${c.name} — ${c.phone}`, value: c._id }))}
                  value={customerId}
                  onChange={setCustomerId}
                  onSearchChange={fetchCustomers}
                  placeholder="Select customer"
                  searchPlaceholder="Search by name or mobile..."
                  className="h-9 text-sm bg-background"
                />
              </div>

              {/* Divider */}
              <div className="border-t" />

              {/* Machine search */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add Item</Label>
                <div className="relative" ref={wrapperRef}>
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input ref={machineInputRef} className="pl-8 h-9 text-sm bg-background" placeholder="Search by name..." value={machineSearch}
                    onChange={(e) => setMachineSearch(e.target.value)} onFocus={() => setDropdownOpen(true)} />
                  {dropdownOpen && (
                    <div className="absolute z-50 w-full border rounded-md bg-background shadow-lg divide-y max-h-56 overflow-y-auto mt-1">
                      {searching
                        ? <p className="text-xs text-muted-foreground px-3 py-2.5">Loading...</p>
                        : machineResults.length === 0
                          ? <p className="text-xs text-muted-foreground px-3 py-2.5">No items found</p>
                          : machineResults.map((m) => (
                            <button key={m._id} type="button"
                              className="w-full text-left px-3 py-2.5 hover:bg-muted flex items-center justify-between focus:bg-muted focus:outline-none"
                              onClick={() => addMachine(m)} onMouseDown={(e) => e.preventDefault()}>
                              <span className="text-sm font-medium">{m.name}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{m.category?.name}</span>
                                <span className="text-xs font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Stock: {m.currentStock}</span>
                              </div>
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
                <p className="text-sm font-medium">No items added yet</p>
                <p className="text-xs mt-1">Search and select items from the left panel</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {entries.map((entry, mi) => {
                  const isParts = entry.machine.category?._id !== PRODUCT_CATEGORY_ID;
                  const qty = Number(entry.quantity) || 0;
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
                        {/* Row 1: qty, selling price with gst */}
                        <div className="grid grid-cols-2 gap-3 items-end">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Qty <span className="text-destructive">*</span></Label>
                            <Input type="number" min={1} max={entry.machine.currentStock} className="h-8 text-sm" value={entry.quantity}
                              onChange={(e) => handleQtyChange(mi, e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">Selling Price (GST Incl.) / Qty</Label>
                            </div>
                            <Input type="number" min={0} className="h-8 text-sm" placeholder="0" value={entry.sellingPriceWithGst}
                              onChange={(e) => updateEntry(mi, "sellingPriceWithGst", e.target.value)} />
                          </div>
                        </div>

                        {/* Row 2: base price (auto), discount %, discount amount (auto), net price (auto) */}
                        {entry.sellingPriceWithGst !== "" && totalGst !== null && (() => {
                          const gstDivisor = 1 + totalGst / 100;
                          const priceWithGst = Number(entry.sellingPriceWithGst) || 0;
                          const priceBase = Math.round((priceWithGst / gstDivisor) * 100) / 100;
                          const discPct = Number(entry.discountPercentage) || 0;
                          const discountAmount = Math.round(priceBase * discPct / 100 * 100) / 100;
                          const netPriceBase = Math.round((priceBase - discountAmount) * 100) / 100;
                          const netPriceWithGst = Math.round(netPriceBase * (1 + totalGst / 100) * 100) / 100;
                          return (
                            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Selling Price (Base) / Qty</Label>
                                  <Input className="h-8 text-sm bg-muted/40" value={`₹${priceBase.toLocaleString()}`} readOnly />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Discount %</Label>
                                  <Input type="number" min={0} max={100} className="h-8 text-sm" placeholder="0"
                                    value={entry.discountPercentage}
                                    onChange={(e) => updateEntry(mi, "discountPercentage", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Discount Amount <span className="text-[10px] text-muted-foreground/60">/ Qty</span></Label>
                                  <Input className="h-8 text-sm bg-muted/40" value={`₹${discountAmount.toLocaleString()}`} readOnly />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Selling Net Price (Base) / Qty</Label>
                                  <Input className="h-8 text-sm bg-muted/40" value={`₹${netPriceBase.toLocaleString()}`} readOnly />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Selling Net Price (GST Incl.) / Qty</Label>
                                  <Input className="h-8 text-sm bg-muted/40 font-medium" value={`₹${netPriceWithGst.toLocaleString()}`} readOnly />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Total (GST Incl.)</Label>
                                  <Input className="h-8 text-sm bg-muted/40 font-semibold text-green-700" value={`₹${(Math.round(netPriceWithGst * (Number(entry.quantity) || 0) * 100) / 100).toLocaleString()}`} readOnly />
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Inline unit rows — only for products (not parts) */}
                        {!isParts && entry.loadingCodes && (
                          <p className="text-xs text-muted-foreground">Loading available codes...</p>
                        )}
                        {!isParts && !entry.loadingCodes && qty > 0 && entry.units.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {isParts ? "Part Codes" : "Serial Numbers"} ({qty})
                            </Label>
                            {entry.units.map((unit, ui) => {
                              const selectedVals = entry.units.map(u => u.value).filter(Boolean);
                              const codeOptions = entry.availableCodes.filter(c => c === unit.value || !selectedVals.includes(c));
                              return (
                                <div key={ui} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground">Unit {ui + 1}</p>
                                  {/* Code select + contract type + dates */}
                                  <div className={`grid gap-2 ${isParts ? "grid-cols-1" : "grid-cols-2 md:grid-cols-4"}`}>
                                    <div className="space-y-1">
                                      <Label className="text-[10px] text-muted-foreground">{isParts ? "Part Code" : "Serial No"} <span className="text-destructive">*</span></Label>
                                      <Select value={unit.value} onValueChange={(v) => updateUnit(mi, ui, "value", v)}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                        <SelectContent>
                                          {codeOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    {!isParts && (
                                      <>
                                        <div className="space-y-1">
                                          <Label className="text-[10px] text-muted-foreground">Contract Type <span className="text-destructive">*</span></Label>
                                          <SearchableSelect
                                            options={contractTypes.map((ct) => ({ label: `${ct.name} (${ct.code})`, value: ct._id }))}
                                            value={unit.contractTypeId}
                                            onChange={(v) => updateUnit(mi, ui, "contractTypeId", v)}
                                            onSearchChange={fetchContractTypes}
                                            placeholder="Select" searchPlaceholder="Search..."
                                            className="h-8 text-xs"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-[10px] text-muted-foreground">Valid From <span className="text-destructive">*</span></Label>
                                          <Input type="date" className="h-8 text-xs"
                                            value={unit.validFrom}
                                            disabled={!unit.contractTypeId}
                                            onChange={(e) => updateUnit(mi, ui, "validFrom", e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-[10px] text-muted-foreground">Valid To <span className="text-destructive">*</span></Label>
                                          <Input type="date" className="h-8 text-xs"
                                            value={unit.validTo}
                                            disabled={!unit.contractTypeId}
                                            onChange={(e) => updateUnit(mi, ui, "validTo", e.target.value)} />
                                        </div>
                                        {unit.contractTypeId === TSS_CONTRACT_TYPE_ID && (
                                          <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground">Min Copies</Label>
                                            <Input type="number" min={0} className="h-8 text-xs" placeholder="0"
                                              value={unit.minCopies}
                                              onChange={(e) => updateUnit(mi, ui, "minCopies", e.target.value)} />
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>

                                  {/* TSS pages category inline */}
                                  {!isParts && unit.contractTypeId === TSS_CONTRACT_TYPE_ID && (
                                    <div className="space-y-1.5 pt-1">
                                      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pages Categories</Label>
                                      {unit.pagesCategories.map((pc, pi) => {
                                        const usedIds = unit.pagesCategories.map(p => p.pagesCategoryId).filter(Boolean);
                                        const availableOpts = activePagesCats.filter(c => c._id === pc.pagesCategoryId || !usedIds.includes(c._id));
                                        return (
                                          <div key={pi} className="flex items-end gap-2 rounded-md border bg-background p-2">
                                            <div className="flex-1 space-y-1">
                                              <Label className="text-[10px] text-muted-foreground">Category <span className="text-destructive">*</span></Label>
                                              <Select
                                                value={pc.pagesCategoryId}
                                                onValueChange={(v) => {
                                                  const cat = activePagesCats.find(c => c._id === v);
                                                  const updated = unit.pagesCategories.map((p, idx) => idx !== pi ? p : { ...p, pagesCategoryId: v, pagesCategory: cat?.name ?? "" });
                                                  updateUnit(mi, ui, "pagesCategories", updated);
                                                }}
                                              >
                                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                                <SelectContent>{availableOpts.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                                              </Select>
                                            </div>
                                            <div className="w-28 space-y-1">
                                              <Label className="text-[10px] text-muted-foreground">Cost/Page <span className="text-destructive">*</span></Label>
                                              <Input type="number" min={0} className="h-7 text-xs" placeholder="0.00"
                                                value={pc.costPerPage}
                                                onChange={(e) => {
                                                  const updated = unit.pagesCategories.map((p, idx) => idx !== pi ? p : { ...p, costPerPage: e.target.value });
                                                  updateUnit(mi, ui, "pagesCategories", updated);
                                                }} />
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                              onClick={() => updateUnit(mi, ui, "pagesCategories", unit.pagesCategories.filter((_, idx) => idx !== pi))}>
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        );
                                      })}
                                      {unit.pagesCategories.length < activePagesCats.length && (
                                        <Button variant="outline" size="sm" className="w-full gap-1 text-xs h-7"
                                          onClick={() => updateUnit(mi, ui, "pagesCategories", [...unit.pagesCategories, { pagesCategoryId: "", pagesCategory: "", costPerPage: "" }])}>
                                          <Plus className="h-3 w-3" /> Add Pages Category
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer — payment + actions */}
            <div className="border-t shrink-0 bg-background">

              {/* Payment section */}
              {sellingTotal > 0 && (
              <div className="px-4 pt-3 pb-2 space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</Label>
                <div className="grid grid-cols-2 gap-2">
                  {/* Payment Status */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status <span className="text-destructive">*</span></Label>
                    <Select value={paymentStatus} onValueChange={(v: any) => { setPaymentStatus(v); if (v === "Unpaid") { setPaymentMethod("Cash"); setPaidAmount(""); } }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Unpaid">Unpaid</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Partial-Paid">Partial-Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Method {paymentStatus !== "Unpaid" && <span className="text-destructive">*</span>}</Label>
                    <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)} disabled={paymentStatus === "Unpaid"}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment Date */}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date {paymentStatus !== "Unpaid" && <span className="text-destructive">*</span>}</Label>
                    <Input type="date" className="h-8 text-xs" value={paymentDate} disabled={paymentStatus === "Unpaid"}
                      onChange={(e) => setPaymentDate(e.target.value)} />
                  </div>

                  {/* Paid Amount — only for Partial-Paid */}
                  {paymentStatus === "Partial-Paid" && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Paid Amount <span className="text-destructive">*</span></Label>
                      <Input type="number" min={0} className="h-8 text-xs" placeholder="0"
                        value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Grand total + actions */}
              <div className="border-t px-4 py-3 flex items-center justify-between gap-4">
                <span className="text-sm font-medium">
                  Net Total: <span className="text-base font-bold text-green-600">₹{sellingTotal.toLocaleString()}</span>
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                    <Plus className="h-4 w-4" />Record Sale
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Processed By — Engineer Selection Dialog */}
      <Dialog open={processedByDialog} onOpenChange={(o) => { if (!o) { setProcessedByDialog(false); setEngineerSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Processed By</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">Select engineers who processed this sale (optional)</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Search engineers..."
                value={engineerSearch}
                onChange={(e) => { setEngineerSearch(e.target.value); fetchEngineers(e.target.value); }}
              />
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
              {loadingEngineers ? (
                <p className="text-xs text-muted-foreground px-3 py-4 text-center">Loading...</p>
              ) : engineers.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-4 text-center">No engineers found</p>
              ) : engineers.map((eng) => {
                const checked = selectedEngineers.includes(eng._id);
                return (
                  <button
                    key={eng._id}
                    type="button"
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${checked ? "bg-primary/5" : ""}`}
                    onClick={() => setSelectedEngineers((prev) => checked ? prev.filter((id) => id !== eng._id) : [...prev, eng._id])}
                  >
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                      {checked && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{eng.name}</p>
                      {eng.engineerId && <p className="text-xs text-muted-foreground">{eng.engineerId}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedEngineers.length > 0 && (
              <p className="text-xs text-primary font-medium">{selectedEngineers.length} engineer{selectedEngineers.length > 1 ? "s" : ""} selected</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProcessedByDialog(false); setEngineerSearch(""); }} disabled={submitting}>Back</Button>
            <Button onClick={handleSaveAndSale} disabled={submitting} className="gap-2">
              <ShoppingCart className="h-4 w-4" />{submitting ? "Recording..." : "Save & Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Customer Dialog */}
      <Dialog open={createCustomerDialog} onOpenChange={(o) => { if (!o) { setCreateCustomerDialog(false); setCustomerForm({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "", profilePhoto: null }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Customer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Profile Photo</Label>
              <div className="flex items-center gap-3">
                {customerForm.profilePhoto
                  ? <img src={URL.createObjectURL(customerForm.profilePhoto)} alt="preview" className="h-12 w-12 rounded-full object-cover shrink-0" />
                  : <UserCircle className="h-12 w-12 text-muted-foreground shrink-0" />
                }
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => setCustomerForm((p) => ({ ...p, profilePhoto: e.target.files?.[0] ?? null }))} />
                <Button type="button" variant="outline" size="sm" onClick={() => photoRef.current?.click()}>
                  {customerForm.profilePhoto ? "Change Photo" : "Upload Photo"}
                </Button>
                {customerForm.profilePhoto && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setCustomerForm((p) => ({ ...p, profilePhoto: null })); if (photoRef.current) photoRef.current.value = ""; }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2"><Label>Name <span className="text-destructive">*</span></Label><Input placeholder="Customer name" value={customerForm.name} onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone <span className="text-destructive">*</span></Label><Input placeholder="e.g. 9800000000" value={customerForm.phone} onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email <span className="text-destructive">*</span></Label><Input type="email" placeholder="customer@example.com" value={customerForm.email} onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Address</Label><Input placeholder="Full address" value={customerForm.address} onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Zone</Label>
              <SearchableSelect options={zones} value={customerForm.zone} onChange={(v) => setCustomerForm((p) => ({ ...p, zone: v }))} placeholder="Select zone" searchPlaceholder="Search zones..." />
            </div>
            <div className="space-y-2"><Label>GST Number</Label><Input placeholder="e.g. 27AABCG1234A1Z5" value={customerForm.gstNumber} onChange={(e) => setCustomerForm((p) => ({ ...p, gstNumber: e.target.value.toUpperCase() }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateCustomerDialog(false); setCustomerForm({ name: "", phone: "", email: "", address: "", zone: "", gstNumber: "", profilePhoto: null }); }} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreateCustomer} disabled={submitting}>{submitting ? "Creating..." : "Create Customer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const SellMachinesPage = () => {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<Sale[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageSize] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportDialog, setExportDialog] = useState(false);
  const [initialCustomerId, setInitialCustomerId] = useState("");
  const [invoiceDialog, setInvoiceDialog] = useState<Sale | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<Sale | null>(null);
  const [receiptsDialog, setReceiptsDialog] = useState<Sale | null>(null);
  const [receipts, setReceipts] = useState<{ _id: string; amount: number; paymentMethod: string; paymentDate: string; receiptNumber: string; receiptUrl: string }[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ paidAmount: "", paymentMethod: "Cash", paymentDate: new Date().toISOString().split("T")[0] });
  const [addingPayment, setAddingPayment] = useState(false);
  const [companies, setCompanies] = useState<ActiveCompany[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({ companyId: "", cgst: "", sgst: "", igst: "" });
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<{ label: string; value: string }[]>([]);
  const [zoneOptions, setZoneOptions] = useState<{ label: string; value: string }[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [divisionOptions, setDivisionOptions] = useState<{ label: string; value: string }[]>([]);
  const [machineOptions, setMachineOptions] = useState<{ label: string; value: string }[]>([]);
  const [filterEngineers, setFilterEngineers] = useState<{ _id: string; name: string; engineerId?: string }[]>([]);
  const [selectedFilterEngineers, setSelectedFilterEngineers] = useState<string[]>([]);
  const [engineerFilterSearch, setEngineerFilterSearch] = useState("");
  const [engineerFilterOpen, setEngineerFilterOpen] = useState(false);
  const engineerFilterRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const customerAbortRef = useRef<AbortController | null>(null);
  const zoneAbortRef = useRef<AbortController | null>(null);
  const categoryAbortRef = useRef<AbortController | null>(null);
  const divisionAbortRef = useRef<AbortController | null>(null);
  const machineAbortRef = useRef<AbortController | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 500); return () => clearTimeout(t); }, [search]);
  useEffect(() => { const cid = searchParams.get("customerId"); if (cid) { setInitialCustomerId(cid); setDialogOpen(true); } }, [searchParams]);

  useEffect(() => {
    api.get("/admin/companies", { params: { status: "Active", limit: 100 } })
      .then(r => setCompanies(r.data.data))
      .catch(() => { });
  }, []);

  const fetchFilterEngineers = async (q = "") => {
    try {
      const p: any = { limit: 100, status: "Active" };
      if (q) p.search = q;
      const r = await api.get("/admin/engineers", { params: p });
      setFilterEngineers(r.data.data);
    } catch { }
  };

  useEffect(() => { fetchFilterEngineers(); }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (engineerFilterRef.current && !engineerFilterRef.current.contains(e.target as Node)) setEngineerFilterOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleAddPayment = async () => {
    if (!paymentDialog) return;
    if (!paymentForm.paidAmount || Number(paymentForm.paidAmount) <= 0) { toast.error("Enter a valid paid amount"); return; }
    if (!paymentForm.paymentMethod) { toast.error("Select a payment method"); return; }
    if (!paymentForm.paymentDate) { toast.error("Select a payment date"); return; }
    setAddingPayment(true);
    try {
      await api.post(`/admin/sales/${paymentDialog._id}/add-payment`, {
        paidAmount: Number(paymentForm.paidAmount),
        paymentMethod: paymentForm.paymentMethod,
        paymentDate: paymentForm.paymentDate,
      });
      toast.success("Payment recorded successfully");
      setPaymentDialog(null);
      setPaymentForm({ paidAmount: "", paymentMethod: "Cash", paymentDate: new Date().toISOString().split("T")[0] });
      fetchSales(pagination.page);
    } catch (err: any) { toast.error(err.response?.data?.message || "Failed to record payment"); }
    finally { setAddingPayment(false); }
  };

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
        const [cr, zr, catr, dr, mr] = await Promise.all([
          api.get("/admin/customers", { params: { limit: 10 } }),
          api.get("/admin/zones", { params: { status: "Active", limit: 100 } }),
          api.get("/admin/machine-categories", { params: { limit: 10 } }),
          api.get("/admin/machine-divisions", { params: { limit: 10 } }),
          api.get("/admin/machines", { params: { limit: 10 } }),
        ]);
        setCustomerOptions(cr.data.data.map((c: any) => ({ label: `${c.name} - ${c.phone}`, value: c._id })));
        setZoneOptions(zr.data.data.map((z: any) => ({ label: `${z.name} (${z.code})`, value: z._id })));
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
      } catch { }
    }, []);

  const fetchCustomers = mkSearch(setCustomerOptions, customerAbortRef, "/admin/customers", (c) => `${c.name} - ${c.phone}`);
  const fetchZones = mkSearch(setZoneOptions, zoneAbortRef, "/admin/zones", (z) => `${z.name} (${z.code})`);
  const fetchCategories = mkSearch(setCategoryOptions, categoryAbortRef, "/admin/machine-categories", (c) => c.name);
  const fetchDivisions = mkSearch(setDivisionOptions, divisionAbortRef, "/admin/machine-divisions", (d) => d.name);
  const fetchMachines = mkSearch(setMachineOptions, machineAbortRef, "/admin/machines", (m) => m.name);

  const fetchSales = useCallback(async (page = 1) => {
    abortRef.current?.abort(); const ctrl = new AbortController(); abortRef.current = ctrl;
    setLoading(true);
    try {
      const p: Record<string, string> = { page: String(page), limit: String(pageSize) };
      if (debouncedSearch) p.search = debouncedSearch;
      if (filters.customer && filters.customer !== "all" && filters.customer !== "") p.customerId = filters.customer;
      if (filters.zone && filters.zone !== "all" && filters.zone !== "") p.zoneId = filters.zone;
      if (filters.category && filters.category !== "all" && filters.category !== "") p.category = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") p.division = filters.division;
      if (filters.machine && filters.machine !== "all" && filters.machine !== "") p.machineId = filters.machine;
      if (filters.paymentStatus && filters.paymentStatus !== "all" && filters.paymentStatus !== "") p.paymentStatus = filters.paymentStatus;
      if (selectedFilterEngineers.length > 0) p.processedBy = selectedFilterEngineers.join(",");
      if (fromDate) p.fromDate = toISTDateParam(fromDate);
      if (toDate) p.toDate = toISTDateParam(toDate);
      const res = await api.get("/admin/sales", { params: p, signal: ctrl.signal });
      setData(res.data.data); setStats(res.data.stats || null);
      setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages, total: res.data.pagination.total });
    } catch (err: any) { if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") toast.error("Failed to fetch sales"); }
    finally { if (!ctrl.signal.aborted) setLoading(false); }
  }, [debouncedSearch, filters, fromDate, toDate, pageSize, selectedFilterEngineers]);

  useEffect(() => { fetchSales(1); }, [fetchSales]);

  const handleExport = async () => {
    setExportDialog(false); toast.success("Download starting...");
    try {
      const p: Record<string, string> = {};
      if (debouncedSearch) p.search = debouncedSearch;
      if (filters.customer && filters.customer !== "all" && filters.customer !== "") p.customerId = filters.customer;
      if (filters.zone && filters.zone !== "all" && filters.zone !== "") p.zoneId = filters.zone;
      if (filters.category && filters.category !== "all" && filters.category !== "") p.category = filters.category;
      if (filters.division && filters.division !== "all" && filters.division !== "") p.division = filters.division;
      if (filters.machine && filters.machine !== "all" && filters.machine !== "") p.machineId = filters.machine;
      if (selectedFilterEngineers.length > 0) p.processedBy = selectedFilterEngineers.join(",");
      if (fromDate) p.fromDate = toISTDateParam(fromDate);
      if (toDate) p.toDate = toISTDateParam(toDate);
      const res = await api.get("/admin/sales/export", { params: p, responseType: "blob" });
      const url = URL.createObjectURL(res.data); const a = document.createElement("a");
      a.href = url; a.download = "sales_export.xlsx"; a.click(); URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  const sep = (i: number, total: number) => i < total - 1 ? <hr className="my-1 border-t border-border" /> : null;

  const columns: Column<Sale>[] = [
    { key: "_id", label: "No.", render: (_s, i) => <span className="font-medium">{(pagination.page - 1) * pageSize + i + 1}</span> },
    { key: "customerInfo", label: "Customer", render: (s) => <div><p className="font-medium text-sm">{s.customerInfo.name}</p><p className="text-xs text-muted-foreground">{s.customerInfo.phone}</p><p className="text-xs text-muted-foreground">{s.customerInfo.email}</p></div> },
    { key: "machineName", label: "Machine", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>{m.machineName}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "category", label: "Category", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>{m.category || "—"}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "division", label: "Division", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>{m.division || "—"}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "modelNumber", label: "Model No", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>{m.modelNumber || "—"}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "quantity", label: "Qty", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>{m.quantity}{sep(i, s.machines.length)}</div>)}</div> },
    {
      key: "codes", label: "Serial No",
      render: (s) => (
        <div>
          {s.machines.map((m, i) => {
            const isParts = !!(m.partCodes?.partCode);
            if (isParts) return <div key={i}><span className="text-muted-foreground text-xs">—</span>{sep(i, s.machines.length)}</div>;
            const codes = (m.serialNumbers || []).map(e => e.serialNumber);
            return (
              <div key={i}>
                {codes.map((c, j) => <div key={j} className="font-mono text-xs">{c}</div>)}
                {sep(i, s.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "partCode", label: "Part Code",
      render: (s) => (
        <div>
          {s.machines.map((m, i) => {
            const isParts = !!(m.partCodes?.partCode);
            const code = isParts ? m.partCodes!.partCode : (m.partCode || "—");
            return (
              <div key={i}>
                <span className="font-mono text-xs">{code}</span>
                {sep(i, s.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "contractType", label: "Contract Type",
      render: (s) => (
        <div>
          {s.machines.map((m, i) => {
            const isParts = !!(m.partCodes?.partCode);
            if (isParts) return <div key={i}><span className="text-muted-foreground text-xs">—</span>{sep(i, s.machines.length)}</div>;
            return (
              <div key={i}>
                {(m.serialNumbers || []).map((sn, j) => <div key={j} className="text-xs">{sn.contractType?.name || "—"}</div>)}
                {sep(i, s.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "pagesCategories", label: "Pages Categories",
      render: (s) => (
        <div>
          {s.machines.map((m, i) => {
            const isParts = !!(m.partCodes?.partCode);
            if (isParts) return <div key={i}><span className="text-muted-foreground text-xs">—</span>{sep(i, s.machines.length)}</div>;
            const sns = m.serialNumbers || [];
            return (
              <div key={i}>
                {sns.map((sn, j) => {
                  const isTss = sn.contractType?.contractTypeId === import.meta.env.VITE_TSS_CONTRACT_TYPE_ID;
                  if (!isTss || !sn.pagesCategories?.length) return <div key={j} className="text-muted-foreground text-xs">—</div>;
                  return (
                    <div key={j} className="flex flex-col gap-0.5">
                      {sn.pagesCategories.map((pc: any, pi: number) => (
                        <span key={pi} className="text-xs"><span className="font-medium">{pc.pagesCategory}</span> <span className="text-muted-foreground">₹{pc.costPerPage}/pg</span></span>
                      ))}
                    </div>
                  );
                })}
                {sep(i, s.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "freeService", label: "Free Svc",
      render: (s) => (
        <div>
          {s.machines.map((m, i) => {
            const isParts = !!(m.partCodes?.partCode);
            if (isParts) return <div key={i}><span className="text-muted-foreground text-xs">—</span>{sep(i, s.machines.length)}</div>;
            return (
              <div key={i}>
                {(m.serialNumbers || []).map((sn, j) => <div key={j}>{sn.contractType ? (sn.contractType.freeService ? <span className="text-green-600 text-xs">Yes</span> : <span className="text-red-500 text-xs">No</span>) : "—"}</div>)}
                {sep(i, s.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "freeParts", label: "Free Parts",
      render: (s) => (
        <div>
          {s.machines.map((m, i) => {
            const isParts = !!(m.partCodes?.partCode);
            if (isParts) return <div key={i}><span className="text-muted-foreground text-xs">—</span>{sep(i, s.machines.length)}</div>;
            return (
              <div key={i}>
                {(m.serialNumbers || []).map((sn, j) => <div key={j}>{sn.contractType ? (sn.contractType.freeParts ? <span className="text-green-600 text-xs">Yes</span> : <span className="text-red-500 text-xs">No</span>) : "—"}</div>)}
                {sep(i, s.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "validFrom", label: "Valid From",
      render: (s) => (
        <div>
          {s.machines.map((m, i) => {
            const isParts = !!(m.partCodes?.partCode);
            if (isParts) return <div key={i}><span className="text-muted-foreground text-xs">—</span>{sep(i, s.machines.length)}</div>;
            return (
              <div key={i}>
                {(m.serialNumbers || []).map((sn, j) => <div key={j} className="text-xs">{sn.contractType?.validFrom ? new Date(sn.contractType.validFrom).toLocaleDateString("en-IN") : "—"}</div>)}
                {sep(i, s.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "validTo", label: "Valid To",
      render: (s) => (
        <div>
          {s.machines.map((m, i) => {
            const isParts = !!(m.partCodes?.partCode);
            if (isParts) return <div key={i}><span className="text-muted-foreground text-xs">—</span>{sep(i, s.machines.length)}</div>;
            return (
              <div key={i}>
                {(m.serialNumbers || []).map((sn, j) => <div key={j} className="text-xs">{sn.contractType?.validTo ? new Date(sn.contractType.validTo).toLocaleDateString("en-IN") : "—"}</div>)}
                {sep(i, s.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: "buyingPriceBase", label: "Buying Price (Base) / Qty",
      render: (s) => (
        <div>
          {s.machines.map((m, i) => {
            const isParts = !!(m.partCodes?.partCode);
            if (isParts) {
              const bp = m.partCodes?.buyingPriceBase;
              return (
                <div key={i}>
                  <div>₹{(bp || 0).toLocaleString()}</div>
                  {sep(i, s.machines.length)}
                </div>
              );
            }
            const prices = (m.serialNumbers || []).map(e => e.buyingPriceBase);
            const uniquePrices = [...new Set(prices)];
            return (
              <div key={i}>
                {uniquePrices.length > 0 ? (
                  uniquePrices.map((price, pi) => (
                    <div key={pi}>₹{(price || 0).toLocaleString()}</div>
                  ))
                ) : (
                  <div>—</div>
                )}
                {sep(i, s.machines.length)}
              </div>
            );
          })}
        </div>
      ),
    },
    { key: "sellingPriceBase", label: "Selling Price (Base) / Qty", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>₹{m.sellingPriceBase.toLocaleString()}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "gstAmountPerUnit", label: "GST Amt / Qty", render: (s) => { const gstPct = (s.cgst?.percent || 0) + (s.sgst?.percent || 0) + (s.igst?.percent || 0); return <div>{s.machines.map((m, i) => <div key={i}>₹{(m.gstAmountPerUnit || 0).toLocaleString()} ({gstPct}%){sep(i, s.machines.length)}</div>)}</div>; } },
    { key: "sellingPriceWithGst", label: "Selling Price (GST Incl.) / Qty", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>₹{m.sellingPriceWithGst.toLocaleString()}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "discountPercentage", label: "Disc. %", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>{m.discountPercentage > 0 ? `${m.discountPercentage}%` : "—"}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "netSellingPriceBase", label: "Selling Net Price (Base) / Qty", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>₹{m.netSellingPriceBase.toLocaleString()}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "netGstAmountPerUnit", label: "Net GST Amt / Qty", render: (s) => { const gstPct = (s.cgst?.percent || 0) + (s.sgst?.percent || 0) + (s.igst?.percent || 0); return <div>{s.machines.map((m, i) => <div key={i}>₹{(m.netGstAmountPerUnit || 0).toLocaleString()} ({gstPct}%){sep(i, s.machines.length)}</div>)}</div>; } },
    { key: "netSellingPriceWithGst", label: "Selling Net Price (GST Incl.) / Qty", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>₹{m.netSellingPriceWithGst.toLocaleString()}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "sellingTotalBase", label: "Total (Base) / Item", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>₹{m.sellingTotalBase.toLocaleString()}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "gstAmountTotal", label: "GST Amt Total / Item", render: (s) => { const gstPct = (s.cgst?.percent || 0) + (s.sgst?.percent || 0) + (s.igst?.percent || 0); return <div>{s.machines.map((m, i) => <div key={i}>₹{(m.gstAmountTotal || 0).toLocaleString()} ({gstPct}%){sep(i, s.machines.length)}</div>)}</div>; } },
    { key: "sellingTotalWithGst", label: "Total (GST Incl.) / Item", render: (s) => <div>{s.machines.map((m, i) => <div key={i}>₹{m.sellingTotalWithGst.toLocaleString()}{sep(i, s.machines.length)}</div>)}</div> },
    { key: "grandTotalBase", label: "Grand Total (Base)", render: (s) => <span className="font-medium">₹{s.grandTotalBase.toLocaleString()}</span> },
    { key: "grandTotalGstAmount", label: "Grand Total GST Amt", render: (s) => { const gstPct = (s.cgst?.percent || 0) + (s.sgst?.percent || 0) + (s.igst?.percent || 0); return <span>₹{(s.grandTotalGstAmount || 0).toLocaleString()} ({gstPct}%)</span>; } },
    { key: "grandTotalWithGst", label: "Grand Total (GST Incl.)", render: (s) => <span className="font-semibold">₹{s.grandTotalWithGst.toLocaleString()}</span> },
    { key: "currentPaymentStatus", label: "Payment", render: (s) => {
      const color = s.currentPaymentStatus === "Paid" ? "text-green-600 bg-green-50 border-green-200" : s.currentPaymentStatus === "Partial-Paid" ? "text-yellow-600 bg-yellow-50 border-yellow-200" : "text-red-600 bg-red-50 border-red-200";
      return <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${color}`}>{s.currentPaymentStatus}</span>;
    }},
    { key: "paidAmount", label: "Paid", render: (s) => <span className="text-green-600 font-medium">₹{s.paidAmount.toLocaleString()}</span> },
    { key: "remainingAmount", label: "Remaining", render: (s) => <span className={s.remainingAmount > 0 ? "text-red-500 font-medium" : "text-muted-foreground"}>₹{s.remainingAmount.toLocaleString()}</span> },
    { key: "createdAt", label: "Sold At", render: (s) => { const { date, time } = formatDateTime(s.createdAt); return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>; } },
    { key: "processedBy", label: "Processed By", render: (s) => {
      const list = (s as any).processedBy as { _id: string; name: string }[] | undefined;
      if (!list?.length) return <span className="text-muted-foreground text-xs">—</span>;
      return <div className="flex flex-col gap-0.5">{list.map((e) => <span key={e._id} className="text-xs">{e.name}</span>)}</div>;
    }},
    {
      key: "actions", label: "Actions", sticky: true, render: (s) => (
        <div className="flex items-center gap-1">
          {s.invoiceUrl
            ? <Button size="sm" variant="outline" className="text-xs h-7 text-green-600 border-green-300" onClick={() => window.open(s.invoiceUrl, "_blank")}><FileText className="h-3 w-3" /></Button>
            : <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setInvoiceDialog(s); setInvoiceForm({ companyId: s.companyInfo?.companyId ?? "", cgst: s.cgst?.percent != null ? String(s.cgst.percent) : "", sgst: s.sgst?.percent != null ? String(s.sgst.percent) : "", igst: s.igst?.percent != null ? String(s.igst.percent) : "" }); }}><FileText className="h-3 w-3" /></Button>
          }
          {s.currentPaymentStatus !== "Paid" && (
            <Button size="sm" variant="outline" className="text-xs h-7 text-blue-600 border-blue-300" onClick={() => { setPaymentDialog(s); setPaymentForm({ paidAmount: "", paymentMethod: "Cash", paymentDate: new Date().toISOString().split("T")[0] }); }}>
              <CreditCard className="h-3 w-3" />
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs h-7 text-purple-600 border-purple-300" onClick={async () => {
            setReceiptsDialog(s); setReceipts([]); setLoadingReceipts(true);
            try {
              const r = await api.get(`/admin/sales/${s._id}/payment-receipts`);
              setReceipts(r.data.data);
            } catch { toast.error("Failed to load receipts"); }
            finally { setLoadingReceipts(false); }
          }}>
            <Eye className="h-3 w-3" />
          </Button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Sell Items" description="Record and manage item sales to customers" actionLabel="Sell Item" actionIcon={ShoppingCart} onAction={() => { setInitialCustomerId(""); setDialogOpen(true); }}>
            <Button variant="outline" className="gap-2" onClick={() => setExportDialog(true)}><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Total Sales", value: `₹${stats.totalSales.toLocaleString()}`, icon: ShoppingCart, color: "blue" },
                { label: "Total Items Sold", value: stats.totalMachinesSold, icon: Package, color: "green" },
                { label: "Avg Sale Value", value: `₹${stats.avgSaleValue.toLocaleString()}`, icon: ShoppingCart, color: "orange" },
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
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by customer, item, model..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="text-xs text-muted-foreground cursor-help group relative shrink-0">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-muted-foreground text-[10px] hover:bg-muted hover:border-foreground transition-colors">?</span>
                <div className="invisible group-hover:visible absolute top-full right-0 mt-2 w-48 bg-slate-900 text-white text-xs rounded-lg p-2 z-50 whitespace-normal">
                  <p className="font-semibold mb-1">Searchable fields:</p>
                  <ul className="text-[11px] space-y-0.5">
                    <li>• Customer Name</li>
                    <li>• Customer Phone</li>
                    <li>• Machine Name</li>
                    <li>• Model Number</li>
                    <li>• Serial Number</li>
                    <li>• Part Code</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" /></div>
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" /></div>
              {(search || fromDate || toDate || Object.values(filters).some(v => v && v !== "all") || selectedFilterEngineers.length > 0) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); setSelectedFilterEngineers([]); }} className="h-9"><X className="h-4 w-4 mr-1" /> Clear</Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <SearchableSelect options={customerOptions} value={filters.customer ?? ""} onChange={(v) => setFilters(p => ({ ...p, customer: v }))} onSearchChange={fetchCustomers} placeholder="Customer" searchPlaceholder="Search customers..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={zoneOptions} value={filters.zone ?? ""} onChange={(v) => setFilters(p => ({ ...p, zone: v }))} onSearchChange={fetchZones} placeholder="Zone" searchPlaceholder="Search zones..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={categoryOptions} value={filters.category ?? ""} onChange={(v) => setFilters(p => ({ ...p, category: v }))} onSearchChange={fetchCategories} placeholder="Category" searchPlaceholder="Search categories..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={divisionOptions} value={filters.division ?? ""} onChange={(v) => setFilters(p => ({ ...p, division: v }))} onSearchChange={fetchDivisions} placeholder="Division" searchPlaceholder="Search divisions..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={machineOptions} value={filters.machine ?? ""} onChange={(v) => setFilters(p => ({ ...p, machine: v }))} onSearchChange={fetchMachines} placeholder="Item" searchPlaceholder="Search items..." className="w-[160px] h-9 text-sm" />
            <Select value={filters.paymentStatus ?? ""} onValueChange={(v) => setFilters(p => ({ ...p, paymentStatus: v }))}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder="Payment Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Unpaid">Unpaid</SelectItem>
                <SelectItem value="Partial-Paid">Partial-Paid</SelectItem>
              </SelectContent>
            </Select>

            {/* Processed By multi-select filter */}
            <div className="relative" ref={engineerFilterRef}>
              <button
                type="button"
                onClick={() => { setEngineerFilterOpen(p => !p); if (!engineerFilterOpen) { setEngineerFilterSearch(""); fetchFilterEngineers(""); } }}
                className="flex items-center justify-between w-[160px] h-9 px-3 rounded-md border border-input text-sm bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="truncate">{selectedFilterEngineers.length > 0 ? `Processed By (${selectedFilterEngineers.length})` : "Processed By"}</span>
                <svg className="h-4 w-4 opacity-50 shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {engineerFilterOpen && (
                <div className="absolute right-0 top-10 z-50 w-64 rounded-lg border bg-background shadow-xl">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        className="w-full pl-7 pr-2 py-1.5 text-xs border rounded-md bg-background outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Search engineers..."
                        value={engineerFilterSearch}
                        onChange={(e) => { setEngineerFilterSearch(e.target.value); fetchFilterEngineers(e.target.value); }}
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y">
                    {filterEngineers.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-3 py-3 text-center">No engineers found</p>
                    ) : filterEngineers.map((eng) => {
                      const checked = selectedFilterEngineers.includes(eng._id);
                      return (
                        <button
                          key={eng._id}
                          type="button"
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors ${checked ? "bg-primary/5" : ""}`}
                          onClick={() => setSelectedFilterEngineers(prev => checked ? prev.filter(id => id !== eng._id) : [...prev, eng._id])}
                        >
                          <div className={`h-3.5 w-3.5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                            {checked && <svg className="h-2 w-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          <div>
                            <p className="text-xs font-medium">{eng.name}</p>
                            {eng.engineerId && <p className="text-[10px] text-muted-foreground">{eng.engineerId}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {selectedFilterEngineers.length > 0 && (
                    <div className="px-3 py-2 border-t flex items-center justify-between">
                      <span className="text-xs text-primary font-medium">{selectedFilterEngineers.length} selected</span>
                      <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setSelectedFilterEngineers([])}>
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DataTable columns={columns} data={data} pageSize={999} />
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pageSize} onPageChange={fetchSales} />
        </>
      )}

      <SellMachineDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setInitialCustomerId(""); }} onSuccess={() => fetchSales(1)} initialCustomerId={initialCustomerId} />

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

      <Dialog open={!!paymentDialog} onOpenChange={(o) => { if (!o) { setPaymentDialog(null); setPaymentForm({ paidAmount: "", paymentMethod: "Cash", paymentDate: new Date().toISOString().split("T")[0] }); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Payment</DialogTitle></DialogHeader>
          {paymentDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm space-y-1">
                <p><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{paymentDialog.customerInfo.name}</span></p>
                <p><span className="text-muted-foreground">Remaining:</span> <span className="font-semibold text-red-500">₹{paymentDialog.remainingAmount.toLocaleString()}</span></p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Paid Amount <span className="text-destructive">*</span></Label>
                <Input type="number" min={0} max={paymentDialog.remainingAmount} placeholder="0" className="h-9"
                  value={paymentForm.paidAmount} onChange={(e) => setPaymentForm(p => ({ ...p, paidAmount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Payment Method <span className="text-destructive">*</span></Label>
                <Select value={paymentForm.paymentMethod} onValueChange={(v) => setPaymentForm(p => ({ ...p, paymentMethod: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Payment Date <span className="text-destructive">*</span></Label>
                <Input type="date" className="h-9" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaymentDialog(null); setPaymentForm({ paidAmount: "", paymentMethod: "Cash", paymentDate: new Date().toISOString().split("T")[0] }); }} disabled={addingPayment}>Cancel</Button>
            <Button onClick={handleAddPayment} disabled={addingPayment} className="gap-2">
              <CreditCard className="h-4 w-4" />{addingPayment ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiptsDialog} onOpenChange={(o) => { if (!o) { setReceiptsDialog(null); setReceipts([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Payment Receipts — {receiptsDialog?.invoiceNumber || receiptsDialog?._id}</DialogTitle></DialogHeader>
          {loadingReceipts ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
          ) : receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No payment receipts found</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">#</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Receipt No</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Method</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Payment Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {receipts.map((r, idx) => (
                    <tr key={r._id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground text-xs">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.receiptNumber || "—"}</td>
                      <td className="px-3 py-2 text-right font-medium">₹{r.amount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs">{r.paymentMethod}</td>
                      <td className="px-3 py-2 text-xs">{new Date(r.paymentDate).toLocaleDateString("en-IN")}</td>
                      <td className="px-3 py-2">
                        {r.receiptUrl
                          ? <Button size="sm" variant="outline" className="text-xs h-7 text-green-600 border-green-300 gap-1" onClick={() => window.open(r.receiptUrl, "_blank")}><Eye className="h-3 w-3" /> View</Button>
                          : <span className="text-xs text-muted-foreground">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => { setReceiptsDialog(null); setReceipts([]); }}>Close</Button></DialogFooter>
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
