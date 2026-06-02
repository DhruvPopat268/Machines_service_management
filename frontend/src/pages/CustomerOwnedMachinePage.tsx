import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Package, FileText, PhoneCall, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import api from "@/lib/axiosInterceptor";

interface ContractTypeInfo {
  contractTypeId: string; name: string; code: string;
  freeService: boolean; freeParts: boolean; validFrom: string; validTo: string;
}

interface MachineDetail {
  customerInfo: {
    customerId: string; name: string; phone: string; email: string;
    address: string; zone: string; gstNumber: string;
  };
  machine: {
    machineId: string; machineName: string; modelNumber: string;
    categoryId: string; category: string; divisionId: string; division: string; images: string[];
  };
  variant: {
    _id: string; name: string; value: string; serialNumber: string;
    contractType: ContractTypeInfo;
  };
  createdAt: string;
  updatedAt: string;
}

interface ContractTypeOption { _id: string; name: string; }

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const InfoRow = ({ label, value }: { label: string; value?: string | boolean }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-medium text-sm mt-0.5">{value === true ? "Yes" : value === false ? "No" : value || "—"}</p>
  </div>
);

const CustomerOwnedMachinePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const serialNumber = searchParams.get("serialNumber") || "";

  const [detail, setDetail]   = useState<MachineDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Renew contract state
  const [contractTypes, setContractTypes]             = useState<ContractTypeOption[]>([]);
  const [renewOpen, setRenewOpen]                     = useState(false);
  const [renewContractTypeId, setRenewContractTypeId] = useState("");
  const [renewValidFrom, setRenewValidFrom]           = useState("");
  const [renewValidTo, setRenewValidTo]               = useState("");
  const [renewing, setRenewing]                       = useState(false);

  const fetchDetail = () => {
    if (!serialNumber) { setLoading(false); return; }
    setLoading(true);
    api.get("/admin/service-calls/customer-machines/detail", { params: { serialNumber } })
      .then(res => setDetail(res.data.data))
      .catch(err => toast.error(err?.response?.data?.message || "Failed to fetch machine details"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDetail(); }, [serialNumber]);

  useEffect(() => {
    api.get("/admin/contract-types", { params: { limit: 100, status: "Active" } })
      .then(res => setContractTypes(res.data.data))
      .catch(() => {});
  }, []);

  const openRenewDialog = () => {
    setRenewContractTypeId("");
    setRenewValidFrom("");
    setRenewValidTo("");
    setRenewOpen(true);
  };

  const handleRenew = async () => {
    if (!renewContractTypeId) { toast.error("Select a contract type"); return; }
    if (!renewValidFrom)      { toast.error("Select valid from date"); return; }
    if (!renewValidTo)        { toast.error("Select valid to date"); return; }
    if (renewValidTo <= renewValidFrom) { toast.error("Valid To must be after Valid From"); return; }
    setRenewing(true);
    try {
      await api.patch("/admin/sales/renew-contract", {
        serialNumber:      serialNumber,
        newContractTypeId: renewContractTypeId,
        newValidFrom:      renewValidFrom,
        newValidTo:        renewValidTo,
      });
      toast.success("Contract renewed successfully");
      setRenewOpen(false);
      fetchDetail();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to renew contract");
    } finally {
      setRenewing(false);
    }
  };

  if (loading) return <div className="space-y-6"><Spinner /></div>;
  if (!detail) return <div className="text-center py-12 text-muted-foreground">Machine not found</div>;

  const { customerInfo, machine, variant } = detail;
  const ct = variant.contractType;
  const isExpired = ct?.validTo ? new Date() > new Date(ct.validTo) : false;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Machine Detail</h1>
            <p className="text-muted-foreground text-sm mt-1">Serial No: {variant.serialNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExpired && (
            <Button variant="destructive" className="gap-2" onClick={openRenewDialog}>
              <RefreshCw className="h-4 w-4" /> Renew Contract
            </Button>
          )}
          <Button className="gap-2" onClick={() => navigate(`/calls/raise/detail?serialNumber=${encodeURIComponent(serialNumber)}`)}>
            <PhoneCall className="h-4 w-4" /> Raise Call
          </Button>
        </div>
      </div>

      {/* Customer Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> Customer Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <InfoRow label="Name"    value={customerInfo.name} />
            <InfoRow label="Phone"   value={customerInfo.phone} />
            <InfoRow label="Email"   value={customerInfo.email} />
            <InfoRow label="Zone"    value={customerInfo.zone} />
            <InfoRow label="GST No." value={customerInfo.gstNumber} />
            {customerInfo.address && <InfoRow label="Address" value={customerInfo.address} />}
          </div>
        </CardContent>
      </Card>

      {/* Machine Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Machine Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <InfoRow label="Machine Name"  value={machine.machineName} />
            <InfoRow label="Model Number"  value={machine.modelNumber} />
            <InfoRow label="Category"      value={machine.category} />
            <InfoRow label="Division"      value={machine.division} />
            <InfoRow label="Variant"       value={`${variant.name} : ${variant.value}`} />
            <InfoRow label="Serial Number" value={variant.serialNumber} />
          </div>
        </CardContent>
      </Card>

      {/* Contract Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Contract Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <InfoRow label="Contract Type" value={ct?.name} />
            <InfoRow label="Code"          value={ct?.code} />
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-0.5 ${isExpired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                {isExpired ? "Expired" : "Active"}
              </span>
            </div>
            <InfoRow label="Free Service" value={ct?.freeService} />
            <InfoRow label="Free Parts"   value={ct?.freeParts} />
            <InfoRow label="Valid From"   value={formatDate(ct?.validFrom)} />
            <InfoRow label="Valid To"     value={formatDate(ct?.validTo)} />
          </div>
        </CardContent>
      </Card>

      {/* Renew Contract Dialog */}
      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renew Contract — {variant.serialNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Contract Type</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={renewContractTypeId}
                onChange={e => setRenewContractTypeId(e.target.value)}
              >
                <option value="">Select contract type...</option>
                {contractTypes.map(ct => <option key={ct._id} value={ct._id}>{ct.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Valid From</Label>
              <Input type="date" value={renewValidFrom} onChange={e => setRenewValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valid To</Label>
              <Input type="date" value={renewValidTo} onChange={e => setRenewValidTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewOpen(false)}>Cancel</Button>
            <Button onClick={handleRenew} disabled={renewing}>
              {renewing ? "Renewing..." : "Renew"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default CustomerOwnedMachinePage;
