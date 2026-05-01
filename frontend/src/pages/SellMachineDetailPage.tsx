import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import api from "@/lib/axiosInterceptor";

interface ContractTypeSnapshot {
  contractTypeId: string;
  name: string;
  code: string;
  freeService: boolean;
  freeParts: boolean;
  validFrom: string;
  validTo: string;
}

interface SaleVariant {
  attribute: string;
  name: string;
  value: string;
  quantity: number;
  price: number;
  discountedPrice: number | null;
  total: number;
  contractType: ContractTypeSnapshot;
  deductedFromInventory: boolean;
}

interface SaleMachineEntry {
  machineId: string;
  machineName: string;
  category: string;
  variants: SaleVariant[];
  machineTotalSold: number;
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

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const getContractTypeBadge = (code: string) => {
  const types: Record<string, { color: string }> = {
    OUT: { color: "bg-blue-100 text-blue-700" },
    RNT: { color: "bg-purple-100 text-purple-700" },
    LSE: { color: "bg-orange-100 text-orange-700" },
  };
  
  return types[code] || types.OUT;
};

const SellMachineDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Machines",       value: sale.machinesCount },
          { label: "Total Variants", value: sale.totalVariants },
          { label: "Total Sold",     value: `₹${sale.grandTotal.toLocaleString()}` },
          { label: "Sold At",        value: formatDateTime(sale.createdAt) },
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
        {sale.machines.map((machine, mi) => (
          <Card key={mi} className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span>{machine.machineName}</span>
                {machine.category && <span className="text-xs font-normal text-muted-foreground">— {machine.category}</span>}
                <span className="ml-auto text-sm font-semibold">₹{machine.machineTotalSold.toLocaleString()}</span>
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
                    <th className="text-center font-medium pb-2 pr-4">Contract</th>
                    <th className="text-center font-medium pb-2 pr-4">Free Service</th>
                    <th className="text-center font-medium pb-2 pr-4">Free Parts</th>
                    <th className="text-center font-medium pb-2 pr-4">Valid From</th>
                    <th className="text-center font-medium pb-2 pr-4">Valid To</th>
                    <th className="text-center font-medium pb-2">Stock Deducted</th>
                  </tr>
                </thead>
                <tbody>
                  {machine.variants.map((v, vi) => {
                    const contractBadge = getContractTypeBadge(v.contractType.code);
                    return (
                      <tr key={vi} className="border-b last:border-0">
                        <td className="py-2 pr-4">{v.name}</td>
                        <td className="py-2 pr-4">{v.value}</td>
                        <td className="py-2 pr-4 text-right">{v.quantity}</td>
                        <td className="py-2 pr-4 text-right">₹{v.price.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{v.discountedPrice !== null ? `₹${v.discountedPrice?.toLocaleString()}` : "—"}</td>
                        <td className="py-2 pr-4 text-right font-medium">₹{v.total.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${contractBadge.color}`}>
                            {v.contractType.name}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${v.contractType.freeService ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {v.contractType.freeService ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${v.contractType.freeParts ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {v.contractType.freeParts ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-center text-xs">{formatDate(v.contractType.validFrom)}</td>
                        <td className="py-2 pr-4 text-center text-xs">{formatDate(v.contractType.validTo)}</td>
                        <td className="py-2 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${v.deductedFromInventory ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {v.deductedFromInventory ? "Yes" : "No"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SellMachineDetailPage;
