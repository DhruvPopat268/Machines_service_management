import { useState, useEffect, useCallback, useRef } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import api from "@/lib/axiosInterceptor";
import { engineersApi } from "@/services/serviceCallsApi";

interface Reimbursement {
  _id: string;
  callId: { _id: string; callId: string };
  engineerInfo: { _id: string; identityId: string; name: string; phone: string };
  customerInfo: { name: string; phone: string; address: string };
  travelDate: string;
  travelFrom: { address: string; latitude: number; longitude: number };
  travelTo: { address: string; latitude: number; longitude: number };
  travelledKm: number;
  status: string;
  createdAt: string;
}

const LIMIT = 10;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
};

const TravelReimbursementsPage = () => {
  const [data, setData]               = useState<Reimbursement[]>([]);
  const [pagination, setPagination]   = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading]         = useState(true);
  const [engineerId, setEngineerId]   = useState("");
  const [status, setStatus]           = useState("");
  const [fromDate, setFromDate]       = useState("");
  const [toDate, setToDate]           = useState("");
  const [engineers, setEngineers]     = useState<{ _id: string; name: string }[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    engineersApi.getActive().then(setEngineers).catch(() => {});
  }, []);

  const fetchData = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (engineerId) params.engineerId = engineerId;
      if (status)     params.status     = status;
      if (fromDate)   params.fromDate   = fromDate;
      if (toDate)     params.toDate     = toDate;

      const res = await api.get("/admin/reimbursements", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages, total: res.data.pagination.total });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch reimbursements");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [engineerId, status, fromDate, toDate]);

  useEffect(() => { fetchData(1); }, [fetchData]);

  const hasFilters = engineerId || status || fromDate || toDate;

  const columns: Column<Reimbursement>[] = [
    { key: "no",          label: "No.",      render: (_, i) => <span className="font-medium">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "callId",      label: "Call ID",   render: (r) => <span className="font-medium text-foreground">{r.callId?.callId}</span> },
    { key: "engineer",    label: "Engineer", render: (r) => (
      <div>
        <p className="font-medium">{r.engineerInfo.name}</p>
        <p className="text-xs text-muted-foreground">{r.engineerInfo.phone}</p>
      </div>
    )},
    { key: "customer",    label: "Customer", render: (r) => (
      <div>
        <p className="font-medium">{r.customerInfo.name}</p>
        <p className="text-xs text-muted-foreground">{r.customerInfo.phone}</p>
      </div>
    )},
    { key: "travelFrom",  label: "Travel From",  render: (r) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-sm block max-w-[120px] truncate cursor-default">{r.travelFrom.address}</span>
        </TooltipTrigger>
        <TooltipContent><p className="max-w-xs">{r.travelFrom.address}</p></TooltipContent>
      </Tooltip>
    )},
    { key: "travelTo",    label: "Travel To",    render: (r) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-sm block max-w-[120px] truncate cursor-default">{r.travelTo.address}</span>
        </TooltipTrigger>
        <TooltipContent><p className="max-w-xs">{r.travelTo.address}</p></TooltipContent>
      </Tooltip>
    )},
    { key: "travelledKm", label: "Distance (km)", render: (r) => <span className="font-medium">{r.travelledKm} km</span> },
    { key: "status",      label: "Status",       render: (r) => <StatusBadge status={r.status} /> },
    { key: "travelDate",  label: "Travel Date",  render: (r) => <span>{formatDate(r.travelDate)}</span> },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Travel Reimbursements" description="Track engineer travel reimbursement records" />

          <div className="flex flex-wrap items-end justify-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Engineer</Label>
              <Select value={engineerId || "all"} onValueChange={(v) => setEngineerId(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Engineers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Engineers</SelectItem>
                  {engineers.map(e => <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" />
            </div>

            {hasFilters && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => { setEngineerId(""); setStatus(""); setFromDate(""); setToDate(""); }}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>

          <DataTable columns={columns} data={data} />

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={LIMIT}
            onPageChange={fetchData}
          />
        </>
      )}
    </div>
  );
};

export default TravelReimbursementsPage;
