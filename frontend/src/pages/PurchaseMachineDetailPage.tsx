import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Package, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import api from "@/lib/axiosInterceptor";

interface PurchaseVariant {
  attribute: string;
  name: string;
  value: string;
  quantity: number;
  price: number;
  discountedPrice: number | null;
  total: number;
  willAddToInventory: boolean;
  addedToInventory: boolean;
}

interface PurchaseMachineEntry {
  machineId: string;
  machineName: string;
  category: string;
  variants: PurchaseVariant[];
  machineTotalPurchased: number;
}

interface VendorInfo {
  vendorId: string | null;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  gstNumber: string;
}

interface PurchaseDetail {
  _id: string;
  vendorInfo: VendorInfo;
  machines: PurchaseMachineEntry[];
  grandTotal: number;
  machinesCount: number;
  totalVariants: number;
  createdAt: string;
  updatedAt: string;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} ${time}`;
};

const PurchaseMachineDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [addingSet, setAddingSet] = useState<Set<string>>(new Set());
  const [confirmTarget, setConfirmTarget] = useState<{ mi: number; vi: number } | null>(null);

  const handleConfirmAdd = async () => {
    if (!confirmTarget) return;
    const { mi, vi } = confirmTarget;
    setConfirmTarget(null);
    const key = `${mi}-${vi}`;
    setAddingSet((prev) => new Set(prev).add(key));
    try {
      await api.patch(`/admin/purchases/${id}/add-inventory`, {
        machines: [{ machineIndex: mi, variantIndexes: [vi] }],
      });
      setPurchase((prev) => {
        if (!prev) return prev;
        const machines = prev.machines.map((m, mIdx) =>
          mIdx !== mi ? m : {
            ...m,
            variants: m.variants.map((v, vIdx) =>
              vIdx !== vi ? v : { ...v, addedToInventory: true }
            ),
          }
        );
        return { ...prev, machines };
      });
      toast.success("Added to inventory");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to add to inventory");
    } finally {
      setAddingSet((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get(`/admin/purchases/${id}`);
        setPurchase(res.data.data);
      } catch (err: any) {
        toast.error(err.response?.data?.message || "Failed to fetch purchase details");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (loading) return <Spinner />;
  if (!purchase) return <div className="text-center py-12 text-muted-foreground">Purchase not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Details</h1>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Machines",       value: purchase.machinesCount },
          { label: "Total Variants", value: purchase.totalVariants },
          { label: "Total Purchased",    value: `₹${purchase.grandTotal.toLocaleString()}` },
          { label: "Purchased At",    value: formatDateTime(purchase.createdAt) },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vendor Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Vendor Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><p className="text-muted-foreground">Company</p><p className="font-medium">{purchase.vendorInfo.companyName}</p></div>
            <div><p className="text-muted-foreground">Name</p><p className="font-medium">{purchase.vendorInfo.name}</p></div>
            <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{purchase.vendorInfo.phone}</p></div>
            <div><p className="text-muted-foreground">Email</p><p className="font-medium">{purchase.vendorInfo.email}</p></div>
            {purchase.vendorInfo.gstNumber && (
              <div><p className="text-muted-foreground">GST No.</p><p className="font-medium">{purchase.vendorInfo.gstNumber}</p></div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Machines */}
      <div className="space-y-4">
        {purchase.machines.map((machine, mi) => (
          <Card key={mi} className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span>{machine.machineName}</span>
                {machine.category && <span className="text-xs font-normal text-muted-foreground">— {machine.category}</span>}
                <span className="ml-auto text-sm font-semibold">₹{machine.machineTotalPurchased.toLocaleString()}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="text-left font-medium pb-2 pr-4">Variant</th>
                    <th className="text-left font-medium pb-2 pr-4">Value</th>
                    <th className="text-right font-medium pb-2 pr-4">Qty</th>
                    <th className="text-right font-medium pb-2 pr-4">Price</th>
                    <th className="text-right font-medium pb-2 pr-4">Disc. Price</th>
                    <th className="text-right font-medium pb-2 pr-4">Total</th>
                    <th className="text-center font-medium pb-2 pr-4">Add to Inv.</th>
                    <th className="text-center font-medium pb-2">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {machine.variants.map((v, vi) => (
                    <tr key={vi} className="border-b last:border-0">
                      <td className="py-2 pr-4">{v.name}</td>
                      <td className="py-2 pr-4">{v.value}</td>
                      <td className="py-2 pr-4 text-right">{v.quantity}</td>
                      <td className="py-2 pr-4 text-right">₹{v.price.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">{v.discountedPrice !== null ? `₹${v.discountedPrice?.toLocaleString()}` : "—"}</td>
                      <td className="py-2 pr-4 text-right font-medium">₹{v.total.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${v.willAddToInventory ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                          {v.willAddToInventory ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        {!v.addedToInventory ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs gap-1"
                            disabled={addingSet.has(`${mi}-${vi}`)}
                            onClick={() => setConfirmTarget({ mi, vi })}
                          >
                            <PackagePlus className="h-3 w-3" />
                            {addingSet.has(`${mi}-${vi}`) ? "Adding..." : "Add to Inv."}
                          </Button>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${v.addedToInventory ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {v.addedToInventory ? "Done" : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>
      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add to Inventory?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget && purchase && (() => {
                const v = purchase.machines[confirmTarget.mi].variants[confirmTarget.vi];
                return `Are you sure you want to add "${v.name}: ${v.value}" (qty: ${v.quantity}) to inventory? This cannot be undone.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAdd}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PurchaseMachineDetailPage;
