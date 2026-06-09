import { useState, useEffect, useCallback, useRef } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { StatsCard } from "@/components/StatsCard";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { X, Clock, CheckCircle } from "lucide-react";
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
  purpose: string;
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
  const [stats, setStats]             = useState({ pendingReimbursementKm: 0, paidReimbursementKm: 0 });
  const [loading, setLoading]         = useState(true);
  const [engineerId, setEngineerId]   = useState("");
  const [status, setStatus]           = useState("");
  const [purpose, setPurpose]         = useState("");
  const [fromDate, setFromDate]       = useState("");
  const [toDate, setToDate]           = useState("");
  const [engineers, setEngineers]     = useState<{ _id: string; name: string }[]>([]);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [marking, setMarking]         = useState(false);

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
      if (purpose)    params.purpose    = purpose;
      if (fromDate)   params.fromDate   = fromDate;
      if (toDate)     params.toDate     = toDate;

      const res = await api.get("/admin/reimbursements", { params, signal: controller.signal });
      setData(res.data.data);
      setStats(res.data.stats);
      setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages, total: res.data.pagination.total });
      setSelected(new Set());
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch reimbursements");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [engineerId, status, purpose, fromDate, toDate]);

  useEffect(() => { fetchData(1); }, [fetchData]);

  const hasFilters = engineerId || status || purpose || fromDate || toDate;

  const pendingData  = data.filter(r => r.status === "Pending");
  const allPendingSelected = pendingData.length > 0 && pendingData.every(r => selected.has(r._id));

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingData.map(r => r._id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleMarkAsPaid = async () => {
    setMarking(true);
    try {
      await api.patch("/admin/reimbursements/mark-paid", { ids: [...selected] });
      toast.success(`${selected.size} reimbursement${selected.size > 1 ? "s" : ""} marked as paid`);
      fetchData(pagination.page);
    } catch {
      toast.error("Failed to mark as paid");
    } finally {
      setMarking(false);
      setConfirmOpen(false);
    }
  };

  const columns: Column<Reimbursement>[] = [
    {
      key: "select",
      label: "",
      className: "w-10 text-center",
      render: (r) => r.status === "Pending" ? (
        <div className="flex items-center justify-center">
          <Checkbox checked={selected.has(r._id)} onCheckedChange={() => toggleOne(r._id)} onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null,
    },
    { key: "no",          label: "No.",      render: (_, i) => <span className="font-medium">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "callId",      label: "Call ID",   render: (r) => <span className="font-medium text-foreground">{r.callId?.callId}</span> },
    { key: "purpose",     label: "Purpose",   render: (r) => <Badge variant="outline" className="text-xs">{r.purpose}</Badge> },
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

          <div className="grid grid-cols-2 gap-4">
            <StatsCard label="Pending Reimbursement (km)" value={`${stats.pendingReimbursementKm} km`} icon={Clock}        colorClass="text-yellow-600 bg-yellow-50" />
            <StatsCard label="Paid Reimbursement (km)"    value={`${stats.paidReimbursementKm} km`}    icon={CheckCircle} colorClass="text-green-600 bg-green-50" />
          </div>

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
              <Label className="text-xs text-muted-foreground">Purpose</Label>
              <Select value={purpose || "all"} onValueChange={(v) => setPurpose(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Purposes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Purposes</SelectItem>
                  <SelectItem value="Service Call">Service Call</SelectItem>
                  <SelectItem value="Go To Office">Go To Office</SelectItem>
                  <SelectItem value="Go To Home">Go To Home</SelectItem>
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
              <Button variant="outline" size="sm" className="h-9" onClick={() => { setEngineerId(""); setStatus(""); setPurpose(""); setFromDate(""); setToDate(""); }}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {pendingData.length > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox checked={allPendingSelected} onCheckedChange={toggleSelectAll} />
                  <span className="text-sm text-muted-foreground">
                    {allPendingSelected ? "Deselect all" : "Select all pending"}
                  </span>
                </div>
              )}
            </div>
            {selected.size > 0 && (
              <Button size="sm" onClick={() => setConfirmOpen(true)}>
                Mark As Paid ({selected.size})
              </Button>
            )}
          </div>

          <DataTable columns={columns} data={data} />

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Mark as Paid</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to mark {selected.size} reimbursement{selected.size > 1 ? "s" : ""} as paid? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={marking}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleMarkAsPaid} disabled={marking}>
                  {marking ? "Marking..." : "Yes, Mark as Paid"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
