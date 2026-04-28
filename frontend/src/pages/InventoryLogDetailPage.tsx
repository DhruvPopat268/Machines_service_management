import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, User, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import api from "@/lib/axiosInterceptor";

interface LogVariant {
  name: string;
  value: string;
  qtyChange: string;
}

interface LogMachine {
  machineName: string;
  modelNumber: string;
  category: string;
  division: string;
  variants: LogVariant[];
}

interface VendorInfo {
  vendorId: string | null;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  gstNumber: string;
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

interface InventoryLogDetail {
  _id: string;
  action: "purchased" | "sold";
  vendorInfo?: VendorInfo;
  customerInfo?: CustomerInfo;
  machines: LogMachine[];
  machinesCount: number;
  totalVariants: number;
  createdAt: string;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} ${time}`;
};

const InventoryLogDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [log, setLog]       = useState<InventoryLogDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get(`/admin/inventory-logs/${id}`);
        setLog(res.data.data);
      } catch (err: any) {
        toast.error(err.response?.data?.message || "Failed to fetch log details");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (loading) return <Spinner />;
  if (!log) return <div className="text-center py-12 text-muted-foreground">Log not found</div>;

  const isPurchased = log.action === "purchased";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory Log Details</h1>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Action",         value: <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isPurchased ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{isPurchased ? "Purchased" : "Sold"}</span> },
          { label: "Machines",       value: log.machinesCount },
          { label: "Total Variants", value: log.totalVariants },
          { label: "Date",           value: formatDateTime(log.createdAt) },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vendor / Customer Info */}
      {isPurchased && log.vendorInfo && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Vendor Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div><p className="text-muted-foreground">Company</p><p className="font-medium">{log.vendorInfo.companyName}</p></div>
              <div><p className="text-muted-foreground">Name</p><p className="font-medium">{log.vendorInfo.name}</p></div>
              <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{log.vendorInfo.phone}</p></div>
              <div><p className="text-muted-foreground">Email</p><p className="font-medium">{log.vendorInfo.email}</p></div>
              {log.vendorInfo.gstNumber && (
                <div><p className="text-muted-foreground">GST No.</p><p className="font-medium">{log.vendorInfo.gstNumber}</p></div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!isPurchased && log.customerInfo && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Customer Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div><p className="text-muted-foreground">Name</p><p className="font-medium">{log.customerInfo.name}</p></div>
              <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{log.customerInfo.phone}</p></div>
              <div><p className="text-muted-foreground">Email</p><p className="font-medium">{log.customerInfo.email}</p></div>
              {log.customerInfo.zone && (
                <div><p className="text-muted-foreground">Zone</p><p className="font-medium">{log.customerInfo.zone}</p></div>
              )}
              {log.customerInfo.address && (
                <div><p className="text-muted-foreground">Address</p><p className="font-medium">{log.customerInfo.address}</p></div>
              )}
              {log.customerInfo.gstNumber && (
                <div><p className="text-muted-foreground">GST No.</p><p className="font-medium">{log.customerInfo.gstNumber}</p></div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Machines */}
      <div className="space-y-4">
        {log.machines.map((machine, mi) => (
          <Card key={mi} className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span>{machine.machineName}</span>
                {machine.modelNumber && <span className="text-xs font-normal text-muted-foreground">({machine.modelNumber})</span>}
                {machine.category && <span className="text-xs font-normal text-muted-foreground">— {machine.category}</span>}
                {machine.division && <span className="text-xs font-normal text-muted-foreground">/ {machine.division}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="text-left font-medium pb-2 pr-4">Attribute</th>
                    <th className="text-left font-medium pb-2 pr-4">Value</th>
                    <th className="text-right font-medium pb-2">Qty Change</th>
                  </tr>
                </thead>
                <tbody>
                  {machine.variants.map((v, vi) => (
                    <tr key={vi} className="border-b last:border-0">
                      <td className="py-2 pr-4">{v.name}</td>
                      <td className="py-2 pr-4">{v.value}</td>
                      <td className="py-2 text-right">
                        <span className={`font-medium ${v.qtyChange.startsWith("+") ? "text-green-600" : "text-red-600"}`}>
                          {v.qtyChange}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default InventoryLogDetailPage;
