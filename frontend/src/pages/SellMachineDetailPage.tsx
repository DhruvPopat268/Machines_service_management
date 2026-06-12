import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Package, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import api from "@/lib/axiosInterceptor";

const PARTS_CATEGORY_ID = import.meta.env.VITE_PARTS_CATEGORY_ID;

interface ContractTypeSnapshot {
  contractTypeId: string;
  name: string;
  code: string;
  freeService: boolean;
  freeParts: boolean;
  validFrom: string;
  validTo: string;
}

interface SerialNumberEntry {
  serialNumber: string;
  minCopies?: number;
  contractType: ContractTypeSnapshot | null;
  pagesCategories?: { pagesCategoryId: string; pagesCategory: string; costPerPage: number }[];
}

interface PartCodeEntry {
  partCode: string;
  contractType: ContractTypeSnapshot | null;
}

interface SaleMachineEntry {
  machineId: string;
  machineName: string;
  modelNumber: string;
  categoryId: string;
  category: string;
  divisionId: string;
  division: string;
  quantity: number;
  sellingPrice: number;
  discountedSellingPrice: number | null;
  sellingTotal: number;
  serialNumbers?: SerialNumberEntry[];
  partCodes?: PartCodeEntry[];
}

interface CustomerInfo {
  customerId: string | null;
  name: string;
  phone: string;
  email: string;
  address: string;
  zone: string;
  gstNumber: string;
}

interface SaleDetail {
  _id: string;
  customerInfo: CustomerInfo;
  machines: SaleMachineEntry[];
  grandTotal: number;
  machinesCount: number;
  createdAt: string;
  invoiceUrl?: string;
  invoiceNumber?: string;
  companyInfo?: { companyId: string; name?: string } | null;
  cgst?: { percent: number; amount: number } | null;
  sgst?: { percent: number; amount: number } | null;
  igst?: { percent: number; amount: number } | null;
  basicTotal?: number | null;
  invoiceGrandTotal?: number | null;
}

interface ActiveCompany { _id: string; name: string; }

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} ${time}`;
};

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const SellMachineDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoiceDialog, setInvoiceDialog] = useState(false);
  const [companies, setCompanies] = useState<ActiveCompany[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({ companyId: "", cgst: "", sgst: "", igst: "" });
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get(`/admin/sales/${id}`);
        setSale(res.data.data);
      } catch (err: any) {
        toast.error(err.response?.data?.message || "Failed to fetch sale details");
      } finally {
        setLoading(false);
      }
    };
    fetch();
    api.get("/admin/companies", { params: { status: "Active", limit: 100 } })
      .then(r => setCompanies(r.data.data))
      .catch(() => {});
  }, [id]);

  const handleGenerateInvoice = async () => {
    if (!invoiceForm.companyId) { toast.error("Please select a company"); return; }
    if (invoiceForm.cgst === "" || invoiceForm.sgst === "" || invoiceForm.igst === "") { toast.error("Enter all tax fields (use 0 if not applicable)"); return; }
    setGeneratingInvoice(true);
    const tab = window.open("", "_blank");
    try {
      const res = await api.post(`/admin/sales/${id}/generate-invoice`, {
        companyId: invoiceForm.companyId,
        cgst: Number(invoiceForm.cgst),
        sgst: Number(invoiceForm.sgst),
        igst: Number(invoiceForm.igst),
      });
      toast.success("Invoice generated");
      if (tab) tab.location.href = res.data.invoiceUrl; else window.open(res.data.invoiceUrl, "_blank");
      setInvoiceDialog(false);
      setSale(prev => prev ? { ...prev, invoiceUrl: res.data.invoiceUrl, invoiceNumber: res.data.invoiceNumber } : prev);
    } catch (err: any) { toast.error(err.response?.data?.message || "Failed to generate invoice"); if (tab) tab.close(); }
    finally { setGeneratingInvoice(false); }
  };

  if (loading) return <Spinner />;
  if (!sale) return <div className="text-center py-12 text-muted-foreground">Sale not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Sale Details</h1>
          {sale.invoiceNumber && <p className="text-xs text-muted-foreground mt-0.5">Invoice: {sale.invoiceNumber}</p>}
        </div>
        {sale.invoiceUrl
          ? <Button variant="outline" className="gap-2" onClick={() => window.open(sale.invoiceUrl, "_blank")}><ExternalLink className="h-4 w-4" /> View Invoice</Button>
          : <Button variant="outline" className="gap-2" onClick={() => { setInvoiceForm({ companyId: sale.companyInfo?.companyId ?? "", cgst: sale.cgst?.percent != null ? String(sale.cgst.percent) : "", sgst: sale.sgst?.percent != null ? String(sale.sgst.percent) : "", igst: sale.igst?.percent != null ? String(sale.igst.percent) : "" }); setInvoiceDialog(true); }}><FileText className="h-4 w-4" /> Generate Invoice</Button>
        }
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Machines",        value: sale.machinesCount },
          { label: "Basic Total",      value: `₹${(sale.basicTotal ?? sale.grandTotal).toLocaleString()}` },
          { label: "Invoice Total",    value: `₹${(sale.invoiceGrandTotal ?? sale.grandTotal).toLocaleString()}` },
          { label: "Sold At",          value: formatDateTime(sale.createdAt) },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Customer Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> Customer Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><p className="text-muted-foreground">Name</p><p className="font-medium">{sale.customerInfo.name}</p></div>
            <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{sale.customerInfo.phone}</p></div>
            <div><p className="text-muted-foreground">Email</p><p className="font-medium">{sale.customerInfo.email}</p></div>
            {sale.customerInfo.address && (
              <div><p className="text-muted-foreground">Address</p><p className="font-medium">{sale.customerInfo.address}</p></div>
            )}
            {sale.customerInfo.zone && (
              <div><p className="text-muted-foreground">Zone</p><p className="font-medium">{sale.customerInfo.zone}</p></div>
            )}
            {sale.customerInfo.gstNumber && (
              <div><p className="text-muted-foreground">GST No.</p><p className="font-medium">{sale.customerInfo.gstNumber}</p></div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Machines */}
      <div className="space-y-4">
        {sale.machines.map((m, mi) => {
          const isParts = m.categoryId === PARTS_CATEGORY_ID;
          const items   = isParts
            ? (m.partCodes || []).map(e => ({ code: e.partCode, contractType: e.contractType, pagesCategories: undefined }))
            : (m.serialNumbers || []).map(e => ({ code: e.serialNumber, minCopies: e.minCopies, contractType: e.contractType, pagesCategories: e.pagesCategories }));
          return (
            <Card key={mi} className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span>{m.machineName}</span>
                  {m.modelNumber && <span className="text-xs font-normal text-muted-foreground">({m.modelNumber})</span>}
                  {m.category && <span className="text-xs font-normal text-muted-foreground">— {m.category}</span>}
                  <span className="ml-auto text-sm font-semibold">₹{m.sellingTotal.toLocaleString()}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Price summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-muted-foreground text-xs">Quantity</p><p className="font-medium">{m.quantity}</p></div>
                  <div><p className="text-muted-foreground text-xs">Selling Price</p><p className="font-medium">₹{m.sellingPrice.toLocaleString()}</p></div>
                  {m.discountedSellingPrice != null && <div><p className="text-muted-foreground text-xs">Disc. Selling Price</p><p className="font-medium">₹{m.discountedSellingPrice.toLocaleString()}</p></div>}
                  {m.division && <div><p className="text-muted-foreground text-xs">Division</p><p className="font-medium">{m.division}</p></div>}
                </div>

                {/* Inline codes table */}
                {items.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b">
                          <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-10">#</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{isParts ? "Part Code" : "Serial Number"}</th>
                          {!isParts && (
                            <>
                              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Contract Type</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Free Svc</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Free Parts</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Valid From</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Valid To</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Pages Categories</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-muted/20">
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{idx + 1}</td>
                            <td className="px-3 py-2.5 font-mono font-medium text-sm">{item.code}</td>
                            {!isParts && (
                              <>
                                <td className="px-3 py-2.5 text-xs">
                                  {item.contractType
                                    ? <span className="font-medium">{item.contractType.name} <span className="text-muted-foreground">({item.contractType.code})</span></span>
                                    : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  {item.contractType != null
                                    ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${item.contractType.freeService ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{item.contractType.freeService ? "Yes" : "No"}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  {item.contractType != null
                                    ? <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${item.contractType.freeParts ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{item.contractType.freeParts ? "Yes" : "No"}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-xs">{item.contractType ? formatDate(item.contractType.validFrom) : "—"}</td>
                                <td className="px-3 py-2.5 text-xs">{item.contractType ? formatDate(item.contractType.validTo) : "—"}</td>
                                <td className="px-3 py-2.5">
                                  {item.pagesCategories && item.pagesCategories.length > 0
                                    ? <div className="flex flex-col gap-0.5">{item.pagesCategories.map((pc, pi) => (
                                        <span key={pi} className="text-xs"><span className="font-medium">{pc.pagesCategory}</span> <span className="text-muted-foreground">₹{pc.costPerPage}/pg</span></span>
                                      ))}
                                      {item.minCopies ? <span className="text-xs text-blue-600">Min: {item.minCopies} copies</span> : null}
                                    </div>
                                    : item.minCopies
                                      ? <span className="text-xs text-blue-600">Min: {item.minCopies} copies</span>
                                      : <span className="text-muted-foreground text-xs">—</span>}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <div className="w-72 text-sm space-y-2 border rounded-lg p-4 bg-muted/20">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Basic Total</span>
            <span className="font-medium">₹{(sale.basicTotal ?? sale.grandTotal).toLocaleString()}</span>
          </div>
          {(sale.cgst?.percent ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">CGST ({sale.cgst!.percent}%)</span>
              <span className="font-medium">₹{sale.cgst!.amount.toLocaleString()}</span>
            </div>
          )}
          {(sale.sgst?.percent ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">SGST ({sale.sgst!.percent}%)</span>
              <span className="font-medium">₹{sale.sgst!.amount.toLocaleString()}</span>
            </div>
          )}
          {(sale.igst?.percent ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IGST ({sale.igst!.percent}%)</span>
              <span className="font-medium">₹{sale.igst!.amount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2">
            <span className="font-semibold">Grand Total</span>
            <span className="text-lg font-bold text-green-600">₹{(sale.invoiceGrandTotal ?? sale.grandTotal).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <Dialog open={invoiceDialog} onOpenChange={(o) => { if (!o) setInvoiceDialog(false); }}>
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
            <Button variant="outline" onClick={() => setInvoiceDialog(false)} disabled={generatingInvoice}>Cancel</Button>
            <Button onClick={handleGenerateInvoice} disabled={generatingInvoice} className="gap-2">
              <FileText className="h-4 w-4" />{generatingInvoice ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default SellMachineDetailPage;
