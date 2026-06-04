import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Package, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import api from "@/lib/axiosInterceptor";

const PARTS_CATEGORY_ID = import.meta.env.VITE_PARTS_CATEGORY_ID;

interface SerialNumberEntry { serialNumber: string; status: "available" | "sold"; }
interface PartCodeEntry     { partCode: string;     status: "available" | "sold"; }

interface PurchaseMachineEntry {
  machineId: string;
  machineName: string;
  modelNumber: string;
  categoryId: string;
  category: string;
  division: string;
  quantity: number;
  buyingPrice: number;
  discountedBuyingPrice: number | null;
  sellingPrice: number | null;
  discountedSellingPrice: number | null;
  buyingTotal: number;
  serialNumbers?: SerialNumberEntry[];
  partCodes?: PartCodeEntry[];
}

interface VendorInfo { vendorId: string | null; name: string; companyName: string; phone: string; email: string; gstNumber: string; }

interface PurchaseDetail {
  _id: string;
  vendorInfo: VendorInfo;
  machines: PurchaseMachineEntry[];
  grandTotal: number;
  machinesCount: number;
  createdAt: string;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(2)} ${d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:true})}`;
};

const PurchaseMachineDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [codesDialog, setCodesDialog] = useState<{ title: string; items: Array<{ code: string; status: "available" | "sold" }> } | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get(`/admin/purchases/${id}`);
        setPurchase(res.data.data);
      } catch (err: any) { toast.error(err.response?.data?.message || "Failed to fetch purchase details"); }
      finally { setLoading(false); }
    };
    fetch();
  }, [id]);

  if (loading) return <Spinner />;
  if (!purchase) return <div className="text-center py-12 text-muted-foreground">Purchase not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold text-foreground">Purchase Details</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Machines",        value: purchase.machinesCount },
          { label: "Grand Total",     value: `₹${purchase.grandTotal.toLocaleString()}` },
          { label: "Purchased At",    value: formatDateTime(purchase.createdAt) },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="pt-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-semibold mt-1">{s.value}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Vendor Info</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><p className="text-muted-foreground">Company</p><p className="font-medium">{purchase.vendorInfo.companyName}</p></div>
            <div><p className="text-muted-foreground">Name</p><p className="font-medium">{purchase.vendorInfo.name}</p></div>
            <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{purchase.vendorInfo.phone}</p></div>
            <div><p className="text-muted-foreground">Email</p><p className="font-medium">{purchase.vendorInfo.email}</p></div>
            {purchase.vendorInfo.gstNumber && <div><p className="text-muted-foreground">GST No.</p><p className="font-medium">{purchase.vendorInfo.gstNumber}</p></div>}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {purchase.machines.map((m, mi) => {
          const isParts = m.categoryId === PARTS_CATEGORY_ID;
          const items   = isParts
            ? (m.partCodes || []).map(e => ({ code: e.partCode, status: e.status }))
            : (m.serialNumbers || []).map(e => ({ code: e.serialNumber, status: e.status }));
          const availableCount = items.filter(e => e.status === "available").length;
          const soldCount      = items.filter(e => e.status === "sold").length;
          return (
            <Card key={mi} className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span>{m.machineName}</span>
                  {m.modelNumber && <span className="text-xs font-normal text-muted-foreground">({m.modelNumber})</span>}
                  {m.category && <span className="text-xs font-normal text-muted-foreground">— {m.category}</span>}
                  <span className="ml-auto text-sm font-semibold">₹{m.buyingTotal.toLocaleString()}</span>
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
                          {soldCount > 0 && <span className="ml-1 text-red-500">({soldCount} sold)</span>}
                        </Button>
                      : <p className="font-medium">—</p>}
                  </div>
                  <div><p className="text-muted-foreground text-xs">Buying Price</p><p className="font-medium">₹{m.buyingPrice.toLocaleString()}</p></div>
                  {m.discountedBuyingPrice != null && <div><p className="text-muted-foreground text-xs">Disc. Buying Price</p><p className="font-medium">₹{m.discountedBuyingPrice.toLocaleString()}</p></div>}
                  {m.sellingPrice != null && <div><p className="text-muted-foreground text-xs">Selling Price</p><p className="font-medium">₹{m.sellingPrice.toLocaleString()}</p></div>}
                  {m.discountedSellingPrice != null && <div><p className="text-muted-foreground text-xs">Disc. Selling Price</p><p className="font-medium">₹{m.discountedSellingPrice.toLocaleString()}</p></div>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <p className="text-sm font-medium">Grand Total: <span className="text-lg font-bold text-green-600">₹{purchase.grandTotal.toLocaleString()}</span></p>
      </div>

      <Dialog open={!!codesDialog} onOpenChange={() => setCodesDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{codesDialog?.title}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {codesDialog?.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-md bg-muted">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                  <span className="text-sm font-medium font-mono">{item.code}</span>
                </div>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  item.status === "sold" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                }`}>
                  {item.status === "sold" ? "Sold" : "Available"}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseMachineDetailPage;
