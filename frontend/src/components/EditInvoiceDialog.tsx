import React, { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Trash2, Plus, Search, AlertCircle, ArrowRight, CheckCircle2, History, Package, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import api from "@/lib/axiosInterceptor";
import { cn } from "@/lib/utils";

const PRODUCT_CATEGORY_ID = import.meta.env.VITE_PRODUCT_CATEGORY_ID;
const TSS_CONTRACT_TYPE_ID = import.meta.env.VITE_TSS_CONTRACT_TYPE_ID;

interface ContractType {
  _id: string;
  name: string;
  code: string;
  freeService: boolean;
  freeParts: boolean;
}

interface PagesCategory {
  _id: string;
  name: string;
}

interface UnitRow {
  serialNumber: string;
  contractTypeId: string;
  validFrom: string;
  validTo: string;
  department: string;
  minCopies: string;
  pagesCategories: { pagesCategoryId: string; pagesCategory: string; costPerPage: string }[];
}

interface EditItemEntry {
  machineId: string;
  machineName: string;
  modelNumber: string;
  partCode: string;
  isParts: boolean;
  quantity: number;
  sellingPriceWithGst: number | string;
  discountPercentage: number | string;
  availableSerials: string[];
  units: UnitRow[];
  originalSerials: string[];
  originalQuantity: number;
}

interface EditInvoiceDialogProps {
  saleId: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenAuditHistory?: (saleId: string) => void;
}

// ─── LocalSearchSelect Component for Serial Numbers ──────────────────────────
interface LocalSearchSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}

const LocalSearchSelect: React.FC<LocalSearchSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select serial...",
  searchPlaceholder = "Search serial...",
  className,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const valid = options.filter(Boolean);
    if (!searchQuery.trim()) return valid;
    return valid.filter((opt) => opt.toUpperCase().includes(searchQuery.toUpperCase()));
  }, [options, searchQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal h-8 text-xs bg-background", className)}
          disabled={disabled}
        >
          <span className="truncate font-mono">{value || placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 max-h-72 w-64"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-8 text-xs"
          />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty className="text-xs p-2 text-center text-muted-foreground">
              No serials found
            </CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className="text-xs font-mono py-1.5"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === opt ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const EditInvoiceDialog: React.FC<EditInvoiceDialogProps> = ({
  saleId,
  open,
  onClose,
  onSuccess,
  onOpenAuditHistory,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);

  // Original & Master data
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [originalTotal, setOriginalTotal] = useState(0);
  const [originalPaid, setOriginalPaid] = useState(0);

  // Customer
  const [customers, setCustomers] = useState<{ label: string; value: string }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPORef, setCustomerPORef] = useState("");

  // Invoice Fields
  const [invoiceDate, setInvoiceDate] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [otherCharges, setOtherCharges] = useState<number | string>(0);
  const [notes, setNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [editReason, setEditReason] = useState("");

  // Payment
  const [paymentStatus, setPaymentStatus] = useState<"Paid" | "Unpaid" | "Partial-Paid">("Unpaid");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paidAmount, setPaidAmount] = useState<number | string>(0);

  // Items
  const [items, setItems] = useState<EditItemEntry[]>([]);
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
  const [pagesCategories, setPagesCategories] = useState<PagesCategory[]>([]);
  const [gstConfig, setGstConfig] = useState<{ cgst: number; sgst: number; igst: number } | null>(null);

  // Add Item Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);
  const [searchDropdown, setSearchDropdown] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Load initial data
  useEffect(() => {
    if (open && saleId) {
      loadEditData(saleId);
    } else {
      resetState();
    }
  }, [open, saleId]);

  const resetState = () => {
    setItems([]);
    setInvoiceNumber("");
    setCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerPORef("");
    setShippingAddress("");
    setBillingAddress("");
    setOtherCharges(0);
    setNotes("");
    setTermsAndConditions("");
    setEditReason("");
    setConfirmModal(false);
    setLoading(true);
  };

  const loadEditData = async (id: string) => {
    setLoading(true);
    try {
      const [resEdit, resCt, resPc, resCust] = await Promise.all([
        api.get(`/admin/sales/${id}/edit-data`),
        api.get("/admin/contract-types", { params: { status: "Active", limit: 100 } }),
        api.get("/admin/pages-categories", { params: { status: "Active", limit: 100 } }),
        api.get("/admin/customers", { params: { status: "Active", limit: 100 } }),
      ]);

      const sale = resEdit.data.data.sale;
      const gst = resEdit.data.data.gstConfig;
      setGstConfig(gst);
      setContractTypes(resCt.data.data || []);
      setPagesCategories(resPc.data.data || []);
      setCustomers((resCust.data.data || []).map((c: any) => ({ label: `${c.name} (${c.phone})`, value: c._id })));

      setInvoiceNumber(sale.invoiceNumber || "");
      setOriginalTotal(sale.grandTotalWithGst || 0);
      setOriginalPaid(sale.paidAmount || 0);

      setCustomerId(sale.customerInfo?.customerId || "");
      setCustomerName(sale.customerInfo?.name || "");
      setCustomerPhone(sale.customerInfo?.phone || "");
      setCustomerPORef(sale.customerInfo?.customerPORef || "");

      const parsedInvDate = sale.invoiceDate
        ? new Date(sale.invoiceDate).toISOString().split("T")[0]
        : sale.createdAt
        ? new Date(sale.createdAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      setInvoiceDate(parsedInvDate);
      setShippingAddress(sale.shippingAddress || sale.customerInfo?.address || "");
      setBillingAddress(sale.billingAddress || sale.customerInfo?.address || "");
      setOtherCharges(sale.otherCharges || 0);
      setNotes(sale.notes || "");
      setTermsAndConditions(sale.termsAndConditions || "");
      setEditReason(sale.editReason || "");

      setPaymentStatus(sale.currentPaymentStatus || "Unpaid");
      setPaymentMethod(sale.paymentMethod || "Cash");
      setPaidAmount(sale.paidAmount || 0);

      // Build Item Entries
      const mappedItems: EditItemEntry[] = (sale.machines || []).map((m: any) => {
        const isParts = !m.serialNumbers || m.serialNumbers.length === 0;
        const origSerials = (m.serialNumbers || [])
          .map((s: any) => (typeof s === "string" ? s : s.serialNumber || ""))
          .filter(Boolean);

        const units: UnitRow[] = (m.serialNumbers || []).map((sn: any) => ({
          serialNumber: sn.serialNumber || (typeof sn === "string" ? sn : ""),
          contractTypeId: sn.contractType?.contractTypeId || "",
          validFrom: sn.contractType?.validFrom ? new Date(sn.contractType.validFrom).toISOString().split("T")[0] : "",
          validTo: sn.contractType?.validTo ? new Date(sn.contractType.validTo).toISOString().split("T")[0] : "",
          department: sn.department || "",
          minCopies: sn.minCopies ? String(sn.minCopies) : "",
          pagesCategories: (sn.pagesCategories || []).map((pc: any) => ({
            pagesCategoryId: pc.pagesCategoryId,
            pagesCategory: pc.pagesCategory,
            costPerPage: String(pc.costPerPage || 0),
          })),
        }));

        const availableSerials = [
          ...new Set([...origSerials, ...(m.selectableSerials || [])].filter(Boolean)),
        ];

        return {
          machineId: m.machineId,
          machineName: m.machineName,
          modelNumber: m.modelNumber || "",
          partCode: m.partCode || m.partCodes?.partCode || "",
          isParts,
          quantity: m.quantity || 1,
          sellingPriceWithGst: m.sellingPriceWithGst ?? 0,
          discountPercentage: m.discount?.percentage ?? 0,
          availableSerials,
          units,
          originalSerials: origSerials,
          originalQuantity: m.quantity || 1,
        };
      });

      setItems(mappedItems);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load invoice details");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  // Search available machines to add to invoice
  const handleSearchMachines = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchingItems(true);
    try {
      const res = await api.get("/admin/sales/available-machines", { params: { search: q.trim() } });
      setSearchResults(res.data.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchingItems(false);
    }
  };

  // Add new machine to items
  const handleAddMachine = async (mach: any) => {
    const isParts = mach.category?._id?.toString() !== PRODUCT_CATEGORY_ID;
    let availableSerials: string[] = [];

    if (!isParts) {
      try {
        const resCodes = await api.get("/admin/sales/available-codes", { params: { machineId: mach._id } });
        availableSerials = resCodes.data.data?.codes || [];
      } catch {
        availableSerials = [];
      }
    }

    const newItem: EditItemEntry = {
      machineId: mach._id,
      machineName: mach.name,
      modelNumber: mach.modelNumber || "",
      partCode: mach.partCode || "",
      isParts,
      quantity: 1,
      sellingPriceWithGst: "",
      discountPercentage: 0,
      availableSerials,
      units: isParts
        ? []
        : [
            {
              serialNumber: availableSerials[0] || "",
              contractTypeId: "",
              validFrom: "",
              validTo: "",
              department: "",
              minCopies: "",
              pagesCategories: [],
            },
          ],
      originalSerials: [],
      originalQuantity: 0,
    };

    setItems((prev) => [...prev, newItem]);
    setSearchQuery("");
    setSearchResults([]);
    setSearchDropdown(false);
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.error("Invoice must have at least one item");
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Change quantity
  const handleQuantityChange = (index: number, newQty: number) => {
    if (newQty <= 0) return;

    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.quantity = newQty;

      if (!item.isParts) {
        const currentUnits = [...item.units];
        if (newQty > currentUnits.length) {
          const diff = newQty - currentUnits.length;
          for (let i = 0; i < diff; i++) {
            currentUnits.push({
              serialNumber: "",
              contractTypeId: "",
              validFrom: "",
              validTo: "",
              department: "",
              minCopies: "",
              pagesCategories: [],
            });
          }
        } else if (newQty < currentUnits.length) {
          currentUnits.splice(newQty);
        }
        item.units = currentUnits;
      }

      updated[index] = item;
      return updated;
    });
  };

  // Change unit field
  const handleUnitFieldChange = (itemIdx: number, unitIdx: number, field: keyof UnitRow, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[itemIdx] };
      const units = [...item.units];
      units[unitIdx] = { ...units[unitIdx], [field]: value };
      item.units = units;
      updated[itemIdx] = item;
      return updated;
    });
  };

  // Financial Computations
  const totalGstRate = gstConfig ? (gstConfig.cgst || 0) + (gstConfig.sgst || 0) + (gstConfig.igst || 0) : 0;
  const gstDivisor = 1 + totalGstRate / 100;

  let grandTotalBase = 0;
  let grandTotalWithGst = 0;

  items.forEach((item) => {
    const priceWithGst = Number(item.sellingPriceWithGst) || 0;
    const discPct = Number(item.discountPercentage) || 0;
    const netPriceWithGst = priceWithGst * (1 - discPct / 100);
    const netBasePrice = netPriceWithGst / gstDivisor;

    grandTotalBase += netBasePrice * item.quantity;
    grandTotalWithGst += netPriceWithGst * item.quantity;
  });

  const parsedOtherCharges = Number(otherCharges) || 0;
  grandTotalWithGst = Math.round((grandTotalWithGst + parsedOtherCharges) * 100) / 100;
  grandTotalBase = Math.round(grandTotalBase * 100) / 100;
  const totalDiff = Math.round((grandTotalWithGst - originalTotal) * 100) / 100;

  // 100% Unit-Level Stock Diff Calculation for live preview
  const serialChangesSummary: {
    machineName: string;
    returned: string[];
    deducted: string[];
    qtyDiff: number;
    type: string;
  }[] = [];

  items.forEach((item) => {
    if (!item.isParts) {
      const currentSerials = item.units.map((u) => u.serialNumber.trim()).filter(Boolean);
      const origSerialsSet = new Set(item.originalSerials.map((s) => s.toUpperCase()));
      const currentSerialsSet = new Set(currentSerials.map((s) => s.toUpperCase()));

      const returned = item.originalSerials.filter((s) => !currentSerialsSet.has(s.toUpperCase()));
      const deducted = currentSerials.filter((s) => !origSerialsSet.has(s.toUpperCase()));
      const qtyDiff = item.quantity - item.originalQuantity;

      let type = "unchanged";
      if (item.originalQuantity === 0) type = "item_added";
      else if (returned.length > 0 && deducted.length > 0) type = "serial_swapped";
      else if (qtyDiff > 0) type = "quantity_increased";
      else if (qtyDiff < 0) type = "quantity_decreased";

      if (returned.length > 0 || deducted.length > 0 || qtyDiff !== 0) {
        serialChangesSummary.push({
          machineName: item.machineName,
          returned,
          deducted,
          qtyDiff,
          type,
        });
      }
    } else {
      const qtyDiff = item.quantity - item.originalQuantity;
      if (qtyDiff !== 0) {
        serialChangesSummary.push({
          machineName: item.machineName,
          returned: qtyDiff < 0 ? [`${Math.abs(qtyDiff)} units returned`] : [],
          deducted: qtyDiff > 0 ? [`${qtyDiff} units added`] : [],
          qtyDiff,
          type: item.originalQuantity === 0 ? "item_added" : qtyDiff > 0 ? "quantity_increased" : "quantity_decreased",
        });
      }
    }
  });

  // Validate before showing confirm dialog
  const handleValidateAndPromptConfirm = () => {
    if (!items.length) {
      toast.error("Invoice must have at least one item");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (Number(it.sellingPriceWithGst) < 0 || it.sellingPriceWithGst === "") {
        toast.error(`Item ${i + 1} (${it.machineName}): Please enter a valid selling price`);
        return;
      }
      if (!it.isParts) {
        for (let u = 0; u < it.units.length; u++) {
          if (!it.units[u].serialNumber.trim()) {
            toast.error(`Item ${i + 1} (${it.machineName}): Serial number for unit ${u + 1} is required`);
            return;
          }
        }
        const sns = it.units.map((u) => u.serialNumber.trim().toUpperCase());
        if (new Set(sns).size !== sns.length) {
          toast.error(`Item ${i + 1} (${it.machineName}): Duplicate serial numbers selected for this item`);
          return;
        }
      }
    }

    setConfirmModal(true);
  };

  // Submit Save
  const handleExecuteSave = async () => {
    if (!saleId) return;
    setSaving(true);
    try {
      const payload = {
        customerId: customerId || undefined,
        customerPORef,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
        shippingAddress,
        billingAddress,
        otherCharges: parsedOtherCharges,
        notes,
        termsAndConditions,
        editReason: editReason.trim() || "Invoice Edited",
        currentPaymentStatus: paymentStatus,
        paymentMethod,
        paidAmount: Number(paidAmount) || 0,
        machines: items.map((it) => ({
          machineId: it.machineId,
          quantity: it.quantity,
          sellingPriceWithGst: Number(it.sellingPriceWithGst),
          discountPercentage: Number(it.discountPercentage) || 0,
          serialNumbers: it.isParts
            ? []
            : it.units.map((u) => ({
                serialNumber: u.serialNumber.trim(),
                contractTypeId: u.contractTypeId || undefined,
                validFrom: u.validFrom ? new Date(u.validFrom) : undefined,
                validTo: u.validTo ? new Date(u.validTo) : undefined,
                department: u.department.trim() || undefined,
                minCopies: Number(u.minCopies) || 0,
                pagesCategories: u.pagesCategories.map((pc) => ({
                  pagesCategoryId: pc.pagesCategoryId,
                  costPerPage: Number(pc.costPerPage) || 0,
                })),
              })),
        })),
      };

      await api.put(`/admin/sales/${saleId}/edit`, payload);
      toast.success("Invoice updated successfully! Inventory logs and audit records updated.");
      setConfirmModal(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
        <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b bg-muted/40 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <span>Edit Invoice — <span className="font-mono text-primary">{invoiceNumber}</span></span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Update customer, items, serial numbers, stock, and pricing
                </p>
              </div>

              <div className="flex items-center gap-3">
                {onOpenAuditHistory && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-slate-700"
                    onClick={() => onOpenAuditHistory(saleId!)}
                  >
                    <History className="h-3.5 w-3.5" /> View Audit History
                  </Button>
                )}
                {gstConfig && (
                  <div className="text-right text-xs bg-background/80 px-2.5 py-1 rounded border">
                    <span className="text-muted-foreground">GST: </span>
                    <span className="font-semibold">{totalGstRate}%</span>
                    <span className="text-[11px] text-muted-foreground ml-1">
                      (C:{gstConfig.cgst}% S:{gstConfig.sgst}% I:{gstConfig.igst}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-24">
              <Spinner />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto flex divide-x min-h-0">
              {/* Left Panel: Invoice Details & Financials (w-80) */}
              <div className="w-80 shrink-0 p-4 space-y-4 overflow-y-auto bg-muted/10">
                {/* Live Stock & Difference Banner */}
                {serialChangesSummary.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3 space-y-2">
                    <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      Pending Inventory Adjustments
                    </p>
                    <div className="space-y-1.5 text-[11px]">
                      {serialChangesSummary.map((sc, i) => (
                        <div key={i} className="border-t border-amber-200/60 pt-1">
                          <p className="font-semibold text-amber-950">{sc.machineName}:</p>
                          {sc.returned.length > 0 && (
                            <p className="text-emerald-700 font-medium">
                              • Restock (+): {sc.returned.join(", ")}
                            </p>
                          )}
                          {sc.deducted.length > 0 && (
                            <p className="text-blue-700 font-medium">
                              • Sell (-): {sc.deducted.join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customer Information */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                    Customer Information
                  </Label>
                  <SearchableSelect
                    options={customers}
                    value={customerId}
                    onChange={setCustomerId}
                    placeholder="Change Customer..."
                    searchPlaceholder="Search customer..."
                    className="h-8 text-xs bg-background"
                  />
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">PO / Reference No</Label>
                    <Input
                      placeholder="e.g. PO-2024-001"
                      className="h-8 text-xs bg-background"
                      value={customerPORef}
                      onChange={(e) => setCustomerPORef(e.target.value)}
                    />
                  </div>
                </div>

                {/* Invoice Date & Charges */}
                <div className="space-y-3 border-t pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Invoice Date</Label>
                      <Input
                        type="date"
                        className="h-8 text-xs bg-background"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Other Charges (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        className="h-8 text-xs bg-background"
                        value={otherCharges}
                        onChange={(e) => setOtherCharges(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Fields */}
                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                    Payment Details
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Status</Label>
                      <Select
                        value={paymentStatus}
                        onValueChange={(v: "Paid" | "Unpaid" | "Partial-Paid") => {
                          setPaymentStatus(v);
                          if (v === "Paid") setPaidAmount(grandTotalWithGst);
                          else if (v === "Unpaid") setPaidAmount(0);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Paid">Paid</SelectItem>
                          <SelectItem value="Partial-Paid">Partial-Paid</SelectItem>
                          <SelectItem value="Unpaid">Unpaid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Method</Label>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="h-8 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Online">Online</SelectItem>
                          <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                          <SelectItem value="Cheque">Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {paymentStatus === "Partial-Paid" && (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Paid Amount (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        max={grandTotalWithGst}
                        className="h-8 text-xs bg-background"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Addresses & Notes */}
                <div className="space-y-2 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Shipping Address</Label>
                    <Textarea
                      rows={2}
                      className="text-xs bg-background resize-none"
                      placeholder="Shipping address..."
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Billing Address</Label>
                    <Textarea
                      rows={2}
                      className="text-xs bg-background resize-none"
                      placeholder="Billing address..."
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Reason for Edit <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      className="h-8 text-xs bg-background"
                      placeholder="e.g. Swapped machine serial number"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Main Panel: Items & Serials (flex-1) */}
              <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                {/* Add Item Search Bar */}
                <div className="flex items-center justify-between gap-4 bg-muted/20 p-3 rounded-lg border">
                  <div className="relative flex-1" ref={searchWrapRef}>
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Add another item (search machine name / model)..."
                      className="pl-8 h-9 text-xs bg-background"
                      value={searchQuery}
                      onChange={(e) => {
                        handleSearchMachines(e.target.value);
                        setSearchDropdown(true);
                      }}
                      onFocus={() => setSearchDropdown(true)}
                    />

                    {searchDropdown && searchResults.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-10 mt-1 border rounded-md bg-background shadow-xl divide-y max-h-56 overflow-y-auto">
                        {searchResults.map((m) => (
                          <button
                            key={m._id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 flex items-center justify-between"
                            onClick={() => handleAddMachine(m)}
                          >
                            <div>
                              <p className="font-semibold text-foreground">{m.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Model: {m.modelNumber || "—"} | Stock: {m.currentStock}
                              </p>
                            </div>
                            <Plus className="h-4 w-4 text-primary" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="text-xs text-muted-foreground font-medium">
                    Total Items: <strong>{items.length}</strong>
                  </span>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                  {items.map((item, itemIdx) => {
                    const price = Number(item.sellingPriceWithGst) || 0;
                    const disc = Number(item.discountPercentage) || 0;
                    const netUnit = price * (1 - disc / 100);
                    const itemTotal = netUnit * item.quantity;

                    return (
                      <div
                        key={itemIdx}
                        className="rounded-lg border bg-card p-4 shadow-sm space-y-4 hover:border-primary/40 transition-colors"
                      >
                        {/* Item Row Header */}
                        <div className="flex items-center justify-between border-b pb-3">
                          <div className="flex items-center gap-2">
                            <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                              {itemIdx + 1}
                            </span>
                            <div>
                              <h4 className="text-sm font-bold text-foreground">{item.machineName}</h4>
                              <p className="text-xs text-muted-foreground">
                                {item.modelNumber ? `Model: ${item.modelNumber}` : `Part Code: ${item.partCode}`}
                                <span className="ml-2 font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted">
                                  {item.isParts ? "Parts Item" : "Serialized Machine"}
                                </span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-xs text-muted-foreground block">Item Total</span>
                              <span className="text-sm font-bold text-foreground">
                                ₹{itemTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleRemoveItem(itemIdx)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Price, Discount & Quantity Inputs */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              Quantity <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              type="number"
                              min="1"
                              className="h-8 text-xs"
                              value={item.quantity}
                              onChange={(e) => handleQuantityChange(itemIdx, parseInt(e.target.value) || 1)}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              Price (GST Incl.) <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              className="h-8 text-xs"
                              value={item.sellingPriceWithGst}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItems((prev) => {
                                  const up = [...prev];
                                  up[itemIdx] = { ...up[itemIdx], sellingPriceWithGst: val };
                                  return up;
                                });
                              }}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Discount %</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="h-8 text-xs"
                              value={item.discountPercentage}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItems((prev) => {
                                  const up = [...prev];
                                  up[itemIdx] = { ...up[itemIdx], discountPercentage: val };
                                  return up;
                                });
                              }}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Net Unit Price</Label>
                            <div className="h-8 px-3 rounded-md bg-muted/40 border flex items-center text-xs font-semibold text-foreground">
                              ₹{netUnit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>

                        {/* Serial Numbers Selection (if serialized machine) */}
                        {!item.isParts && (
                          <div className="space-y-2 border-t pt-3">
                            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5 text-primary" />
                              Unit Serial Numbers ({item.units.length})
                            </Label>

                            <div className="space-y-2">
                              {item.units.map((unit, unitIdx) => {
                                const isOriginal = item.originalSerials.includes(unit.serialNumber);

                                return (
                                  <div
                                    key={unitIdx}
                                    className="p-2.5 rounded-md border bg-muted/20 space-y-2 text-xs"
                                  >
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      {/* Serial Number Combobox */}
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                          <Label className="text-[10px] text-muted-foreground">
                                            Unit {unitIdx + 1} Serial <span className="text-destructive">*</span>
                                          </Label>
                                          {isOriginal && (
                                            <span className="text-[9px] text-blue-600 bg-blue-50 px-1 rounded">
                                              Current
                                            </span>
                                          )}
                                        </div>
                                        <LocalSearchSelect
                                          options={item.availableSerials}
                                          value={unit.serialNumber}
                                          onChange={(val) =>
                                            handleUnitFieldChange(itemIdx, unitIdx, "serialNumber", val)
                                          }
                                          placeholder="Select serial..."
                                          searchPlaceholder="Search serial..."
                                          className="h-8 text-xs font-mono"
                                        />
                                      </div>

                                      {/* Contract Type (SearchableSelect - Safe, no empty string exception) */}
                                      <div className="space-y-1">
                                        <Label className="text-[10px] text-muted-foreground">Contract Type</Label>
                                        <SearchableSelect
                                          options={[
                                            { label: "None", value: "" },
                                            ...contractTypes.map((ct) => ({
                                              label: `${ct.name} (${ct.code})`,
                                              value: ct._id,
                                            })),
                                          ]}
                                          value={unit.contractTypeId}
                                          onChange={(val) =>
                                            handleUnitFieldChange(itemIdx, unitIdx, "contractTypeId", val)
                                          }
                                          placeholder="None"
                                          searchPlaceholder="Search contract..."
                                          className="h-8 text-xs bg-background"
                                        />
                                      </div>

                                      {/* Department */}
                                      <div className="space-y-1">
                                        <Label className="text-[10px] text-muted-foreground">Department</Label>
                                        <Input
                                          placeholder="e.g. Accounts"
                                          className="h-8 text-xs bg-background"
                                          value={unit.department}
                                          onChange={(e) =>
                                            handleUnitFieldChange(itemIdx, unitIdx, "department", e.target.value)
                                          }
                                        />
                                      </div>
                                    </div>

                                    {/* Contract Valid Dates if contract selected */}
                                    {unit.contractTypeId && (
                                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-muted">
                                        <div className="space-y-1">
                                          <Label className="text-[10px] text-muted-foreground">Valid From</Label>
                                          <Input
                                            type="date"
                                            className="h-8 text-xs bg-background"
                                            value={unit.validFrom}
                                            onChange={(e) =>
                                              handleUnitFieldChange(itemIdx, unitIdx, "validFrom", e.target.value)
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-[10px] text-muted-foreground">Valid To</Label>
                                          <Input
                                            type="date"
                                            className="h-8 text-xs bg-background"
                                            value={unit.validTo}
                                            onChange={(e) =>
                                              handleUnitFieldChange(itemIdx, unitIdx, "validTo", e.target.value)
                                            }
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Footer Bar */}
          <DialogFooter className="px-6 py-3.5 border-t bg-muted/40 shrink-0 flex items-center justify-between sm:justify-between">
            {/* Left Financial Summary */}
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px]">Previous Total</span>
                <span className="font-semibold line-through text-muted-foreground">
                  ₹{originalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground block text-[10px]">Revised Total (GST Incl.)</span>
                <span className="font-bold text-sm text-foreground">
                  ₹{grandTotalWithGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Difference</span>
                <span className={`font-semibold ${totalDiff >= 0 ? "text-blue-600" : "text-amber-600"}`}>
                  {totalDiff > 0 ? "+" : ""}₹{totalDiff.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Right Buttons */}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleValidateAndPromptConfirm} disabled={saving || loading} className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Save Invoice Changes
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <Dialog open={confirmModal} onOpenChange={setConfirmModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Invoice Edits</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm text-muted-foreground">
            <p>
              Are you sure you want to save changes to invoice <strong className="text-foreground">{invoiceNumber}</strong>?
            </p>

            {/* Inventory changes highlights */}
            {serialChangesSummary.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs text-amber-900">
                <p className="font-semibold flex items-center gap-1 text-amber-950">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  Inventory Impact:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  {serialChangesSummary.map((sc, idx) => (
                    <li key={idx}>
                      <strong>{sc.machineName}:</strong>
                      {sc.returned.length > 0 && ` ${sc.returned.join(", ")} will be Restocked (+).`}
                      {sc.deducted.length > 0 && ` ${sc.deducted.join(", ")} will be Sold (-).`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border p-3 bg-muted/20 text-xs space-y-1">
              <p>
                <span className="text-muted-foreground">Revised Grand Total:</span>{" "}
                <strong className="text-foreground">₹{grandTotalWithGst.toLocaleString()}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Reason:</span>{" "}
                <strong className="text-foreground">{editReason || "Invoice Edited"}</strong>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmModal(false)} disabled={saving}>
              Back
            </Button>
            <Button onClick={handleExecuteSave} disabled={saving}>
              {saving ? "Saving Changes..." : "Yes, Save & Update Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
