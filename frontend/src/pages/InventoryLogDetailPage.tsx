import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, User, Package, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import api from "@/lib/axiosInterceptor";

interface LogMachine {
  machineName: string;
  modelNumber: string;
  category: string;
  division: string;
  quantity: number;
  serialNumbers?: string[];
  partCodes?: string[];
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
  createdAt: string;
}

const formatDateTime = (iso: string) => {
  // Add 5.5 hours to convert UTC to IST
  const d = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).toString().slice(2);
  const h = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = String(h % 12 || 12).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${h12}:${min} ${ampm}`;
};

const InventoryLogDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [log, setLog]         = useState<InventoryLogDetail | null>(null);
  const [loading, setLoading]  = useState(true);
  const [codesDialog, setCodesDialog] = useState<{ title: string; codes: string[] } | null>(null);

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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Action",   value: <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isPurchased ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{isPurchased ? "Purchased" : "Sold"}</span> },
          { label: "Machines", value: log.machinesCount },
          { label: "Date",     value: formatDateTime(log.createdAt) },
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
        {log.machines.map((machine, mi) => {
          const codes      = (machine.serialNumbers || []).length > 0 ? machine.serialNumbers! : (machine.partCodes || []);
          const isPartCodes = (machine.serialNumbers || []).length === 0 && (machine.partCodes || []).length > 0;
          return (
            <Card key={mi} className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span>{machine.machineName}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  {machine.category && <div><p className="text-muted-foreground text-xs">Category</p><p className="font-medium">{machine.category}</p></div>}
                  {machine.division && <div><p className="text-muted-foreground text-xs">Division</p><p className="font-medium">{machine.division}</p></div>}
                  <div><p className="text-muted-foreground text-xs">Qty Change</p><p className="font-bold text-sm">{isPurchased ? <span className="text-green-600">+{machine.quantity}</span> : <span className="text-red-600">-{machine.quantity}</span>}</p></div>
                  {codes.length > 0 && (
                    <div>
                      <p className="text-muted-foreground text-xs">{isPartCodes ? "Part Codes" : "Serial Numbers"}</p>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 mt-1"
                        onClick={() => setCodesDialog({ title: `${isPartCodes ? "Part Codes" : "Serial Numbers"} — ${machine.machineName}`, codes })}>
                        <Hash className="h-3.5 w-3.5" />{codes.length} {isPartCodes ? "Part Code" : "Serial Number"}{codes.length !== 1 ? "s" : ""}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Codes Dialog */}
      <Dialog open={!!codesDialog} onOpenChange={() => setCodesDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{codesDialog?.title}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            {codesDialog?.codes.map((code, idx) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted">
                <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                <span className="text-sm font-medium font-mono">{code}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryLogDetailPage;
