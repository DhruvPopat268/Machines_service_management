import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Package, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  contractType: ContractTypeSnapshot | null;
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
}

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
  const [codesDialog, setCodesDialog] = useState<{ title: string; items: Array<{ code: string; contractType: ContractTypeSnapshot | null }> } | null>(null);

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
  }, [id]);

  if (loading) return <Spinner />;
  if (!sale) return <div className="text-center py-12 text-muted-foreground">Sale not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sale Details</h1>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Machines",   value: sale.machinesCount },
          { label: "Total Sold", value: `₹${sale.grandTotal.toLocaleString()}` },
          { label: "Sold At",    value: formatDateTime(sale.createdAt) },
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
            ? (m.partCodes || []).map(e => ({ code: e.partCode, contractType: e.contractType }))
            : (m.serialNumbers || []).map(e => ({ code: e.serialNumber, contractType: e.contractType }));
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
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
                  <div><p className="text-muted-foreground text-xs">Quantity</p><p className="font-medium">{m.quantity}</p></div>
                  <div>
                    <p className="text-muted-foreground text-xs">{isParts ? "Part Codes" : "Serial Numbers"}</p>
                    {items.length > 0
                      ? <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 mt-1"
                          onClick={() => setCodesDialog({ title: `${isParts ? "Part Codes" : "Serial Numbers"} — ${m.machineName}`, items })}>
                          <Hash className="h-3.5 w-3.5" />{items.length} {isParts ? "Part Code" : "Serial Number"}{items.length !== 1 ? "s" : ""}
                        </Button>
                      : <p className="font-medium">—</p>}
                  </div>
                  <div><p className="text-muted-foreground text-xs">Selling Price</p><p className="font-medium">₹{m.sellingPrice.toLocaleString()}</p></div>
                  {m.discountedSellingPrice != null && <div><p className="text-muted-foreground text-xs">Disc. Selling Price</p><p className="font-medium">₹{m.discountedSellingPrice.toLocaleString()}</p></div>}
                  {m.division && <div><p className="text-muted-foreground text-xs">Division</p><p className="font-medium">{m.division}</p></div>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <p className="text-sm font-medium">Grand Total: <span className="text-lg font-bold text-green-600">₹{sale.grandTotal.toLocaleString()}</span></p>
      </div>

      {/* Codes Dialog */}
      <Dialog open={!!codesDialog} onOpenChange={() => setCodesDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{codesDialog?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {codesDialog?.items.map((item, idx) => (
              <div key={idx} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-medium">#{idx + 1}</span>
                  <span className="text-sm font-medium font-mono">{item.code}</span>
                </div>
                {item.contractType && (
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                    <div><p className="text-muted-foreground">Contract</p><p className="font-medium">{item.contractType.name} ({item.contractType.code})</p></div>
                    <div><p className="text-muted-foreground">Free Svc</p><span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${item.contractType.freeService ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{item.contractType.freeService ? "Yes" : "No"}</span></div>
                    <div><p className="text-muted-foreground">Free Parts</p><span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${item.contractType.freeParts ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{item.contractType.freeParts ? "Yes" : "No"}</span></div>
                    <div><p className="text-muted-foreground">Valid</p><p className="font-medium">{formatDate(item.contractType.validFrom)} → {formatDate(item.contractType.validTo)}</p></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SellMachineDetailPage;
