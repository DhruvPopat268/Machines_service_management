import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { serviceCallsApi, engineersApi, type ServiceCall, type CallStats, type CallsParams } from "@/services/serviceCallsApi";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { StatsCard } from "@/components/StatsCard";
import { Pagination } from "@/components/Pagination";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, Column } from "@/components/DataTable";
import { Eye, UserPlus, Download, PhoneCall, FolderOpen, UserCog, Loader, PauseCircle, CheckCircle, XCircle, Search, X, FileText } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import api from "@/lib/axiosInterceptor";

interface CallsPageProps {
  statusFilter?: string;
  title?: string;
  description?: string;
}

interface DropdownOption { _id: string; name: string; isOnline?: boolean; }

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const PARTS_CATEGORY_ID = import.meta.env.VITE_PARTS_CATEGORY_ID;

const CallsPage = ({ statusFilter, title = "All Service Calls", description = "Manage and track all service calls" }: CallsPageProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const getParam = (key: string) => searchParams.get(key) ?? "";

  const [data, setData]                     = useState<ServiceCall[]>([]);
  const [stats, setStats]                   = useState<CallStats | undefined>();
  const [pagination, setPagination]         = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading]               = useState(true);
  const limit       = Number(getParam("limit")) || 10;
  const showStats   = getParam("showStats")   !== "false";
  const showFilters  = getParam("showFilters")  !== "false";

  const setShowStats   = (v: boolean) => updateParam("showStats",   v ? "" : "false");
  const setShowFilters = (v: boolean) => updateParam("showFilters", v ? "" : "false");

  const search           = getParam("search");
  const serialNumber     = getParam("serialNumber");
  const fromDate         = getParam("fromDate");
  const toDate           = getParam("toDate");

  const filters: Record<string, string> = {
    callType:            getParam("callType"),
    status:              getParam("status"),
    customerName:        getParam("customerName"),
    engineerName:        getParam("engineerName"),
    machineName:         getParam("machineName"),
    partId:              getParam("partId"),
    category:            getParam("category"),
    division:            getParam("division"),
    problemTypeId:       getParam("problemTypeId"),
    contractTypeId:      getParam("contractTypeId"),
    contractTypeStatus:  getParam("contractTypeStatus"),
  };

  const setSearch       = (v: string) => updateParam("search", v);
  const setSerialNumber = (v: string) => updateParam("serialNumber", v);
  const setFromDate     = (v: string) => updateParam("fromDate", v);
  const setToDate       = (v: string) => updateParam("toDate", v);

  const updateParam = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  const setFilters = (updater: (prev: Record<string, string>) => Record<string, string>) => {
    const updated = updater(filters);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(updated).forEach(([k, v]) => {
        if (v && v !== "all") next.set(k, v); else next.delete(k);
      });
      return next;
    }, { replace: true });
  };
  const [assignDialog, setAssignDialog]     = useState<ServiceCall | null>(null);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [assigning, setAssigning]           = useState(false);
  const [companies, setCompanies]           = useState<{ _id: string; name: string; isOnline?: boolean; distanceKm?: number; estimatedTimeMin?: number }[]>([]);
  const [assignEngineers, setAssignEngineers] = useState<{ _id: string; name: string; isOnline?: boolean; distanceKm?: number; estimatedTimeMin?: number }[]>([]);
  const [assignDialogLoading, setAssignDialogLoading] = useState(false);
  const [assignForm, setAssignForm]         = useState({ companyId: "none", cgst: "", sgst: "", igst: "" });

  const [problemTypes, setProblemTypes]     = useState<DropdownOption[]>([]);
  const [machines, setMachines]             = useState<DropdownOption[]>([]);
  const [parts, setParts]                   = useState<DropdownOption[]>([]);
  const [customers, setCustomers]           = useState<DropdownOption[]>([]);
  const [engineers, setEngineers]           = useState<DropdownOption[]>([]);
  const [categories, setCategories]         = useState<DropdownOption[]>([]);
  const [divisions, setDivisions]           = useState<DropdownOption[]>([]);
  const [contractTypes, setContractTypes]   = useState<DropdownOption[]>([]);

  const customerAbortRef  = useRef<AbortController | null>(null);
  const categoryAbortRef  = useRef<AbortController | null>(null);
  const divisionAbortRef  = useRef<AbortController | null>(null);
  const machineAbortRef   = useRef<AbortController | null>(null);
  const partsAbortRef     = useRef<AbortController | null>(null);
  const ptAbortRef        = useRef<AbortController | null>(null);
  const ctAbortRef        = useRef<AbortController | null>(null);

  const [debouncedSearch, setDebouncedSearch]             = useState(search);
  const [debouncedSerialNumber, setDebouncedSerialNumber] = useState(serialNumber);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 500);        return () => clearTimeout(t); }, [search]);
  useEffect(() => { const t = setTimeout(() => setDebouncedSerialNumber(serialNumber), 500); return () => clearTimeout(t); }, [serialNumber]);

  // fetch filter dropdown options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [ptRes, mRes, cRes, catRes, divRes, engData, ctRes] = await Promise.all([
          api.get("/admin/problem-types", { params: { limit: 100 } }),
          api.get("/admin/machines", { params: { limit: 100 } }),
          api.get("/admin/customers", { params: { limit: 100 } }),
          api.get("/admin/machine-categories", { params: { limit: 100 } }),
          api.get("/admin/machine-divisions", { params: { limit: 100 } }),
          engineersApi.getActive(),
          api.get("/admin/contract-types/active"),
        ]);
        setProblemTypes(ptRes.data.data);
        const allMachines = mRes.data.data;
        setMachines(allMachines.filter((m: any) => m.categoryId?.toString() !== PARTS_CATEGORY_ID && m.category?._id?.toString() !== PARTS_CATEGORY_ID));
        setParts(allMachines.filter((m: any) => m.categoryId?.toString() === PARTS_CATEGORY_ID || m.category?._id?.toString() === PARTS_CATEGORY_ID));
        setCustomers(cRes.data.data);
        setCategories(catRes.data.data);
        setDivisions(divRes.data.data);
        setEngineers(engData);
        setContractTypes(ctRes.data.data);
      } catch {
        // silently fail
      }
    };
    fetchOptions();
  }, []);

  const fetchProblemTypes = useCallback(async (q: string) => {
    ptAbortRef.current?.abort();
    const controller = new AbortController();
    ptAbortRef.current = controller;
    try {
      const res = await api.get("/admin/problem-types", { params: { limit: 100, search: q }, signal: controller.signal });
      if (!controller.signal.aborted) setProblemTypes(res.data.data);
    } catch {}
  }, []);

  const fetchMachineOptions = useCallback(async (q: string) => {
    machineAbortRef.current?.abort();
    const controller = new AbortController();
    machineAbortRef.current = controller;
    try {
      const res = await api.get("/admin/machines", { params: { limit: 100, search: q }, signal: controller.signal });
      if (!controller.signal.aborted) setMachines(res.data.data.filter((m: any) => m.categoryId?.toString() !== PARTS_CATEGORY_ID && m.category?._id?.toString() !== PARTS_CATEGORY_ID));
    } catch {}
  }, []);

  const fetchPartsOptions = useCallback(async (q: string) => {
    partsAbortRef.current?.abort();
    const controller = new AbortController();
    partsAbortRef.current = controller;
    try {
      const res = await api.get("/admin/machines", { params: { limit: 100, search: q, category: PARTS_CATEGORY_ID }, signal: controller.signal });
      if (!controller.signal.aborted) setParts(res.data.data);
    } catch {}
  }, []);

  const fetchCustomerOptions = useCallback(async (q: string) => {
    customerAbortRef.current?.abort();
    const controller = new AbortController();
    customerAbortRef.current = controller;
    try {
      const res = await api.get("/admin/customers", { params: { limit: 100, search: q }, signal: controller.signal });
      if (!controller.signal.aborted) setCustomers(res.data.data);
    } catch {}
  }, []);

  const fetchEngineers = useCallback(async (q: string) => {
    try {
      const data = await engineersApi.getActive(q);
      setEngineers(data);
    } catch {}
  }, []);

  const fetchCategoryOptions = useCallback(async (q: string) => {
    categoryAbortRef.current?.abort();
    const controller = new AbortController();
    categoryAbortRef.current = controller;
    try {
      const res = await api.get("/admin/machine-categories", { params: { limit: 100, search: q }, signal: controller.signal });
      if (!controller.signal.aborted) setCategories(res.data.data);
    } catch {}
  }, []);

  const fetchDivisionOptions = useCallback(async (q: string) => {
    divisionAbortRef.current?.abort();
    const controller = new AbortController();
    divisionAbortRef.current = controller;
    try {
      const res = await api.get("/admin/machine-divisions", { params: { limit: 100, search: q }, signal: controller.signal });
      if (!controller.signal.aborted) setDivisions(res.data.data);
    } catch {}
  }, []);

  const fetchContractTypeOptions = useCallback(async (q: string) => {
    ctAbortRef.current?.abort();
    const controller = new AbortController();
    ctAbortRef.current = controller;
    try {
      const res = await api.get("/admin/contract-types", { params: { limit: 100, search: q, status: "Active" }, signal: controller.signal });
      if (!controller.signal.aborted) setContractTypes(res.data.data);
    } catch {}
  }, []);

  const openAssignDialog = async (c: ServiceCall) => {
    setAssignDialog(c);
    setSelectedEngineerId(c.engineerInfo?._id || "");
    setAssignForm({ companyId: (c as any).companyInfo?.companyId ?? "none", cgst: (c as any).cgst?.percent != null ? String((c as any).cgst.percent) : "", sgst: (c as any).sgst?.percent != null ? String((c as any).sgst.percent) : "", igst: (c as any).igst?.percent != null ? String((c as any).igst.percent) : "" });
    setAssignDialogLoading(true);
    try {
      const [engData, compRes] = await Promise.all([
        engineersApi.getActive(undefined, c._id),
        api.get("/admin/companies", { params: { status: "Active", limit: 100 } }),
      ]);
      setAssignEngineers(engData);
      setCompanies(compRes.data.data);
    } catch {}
    finally { setAssignDialogLoading(false); }
  };

  const abortRef = useRef<AbortController | null>(null);

  const toISTDateParam = (htmlDate: string) => {
    const [yyyy, mm, dd] = htmlDate.split("-");
    return `${dd}/${mm}/${String(yyyy).slice(2)}`;
  };

  const fetchCalls = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params: CallsParams = { page: String(page), limit: String(limit) };
      if (statusFilter)                                                              params.status             = statusFilter;
      if (debouncedSearch)                                                           params.search             = debouncedSearch;
      if (filters.problemTypeId && filters.problemTypeId !== "all")                  params.problemTypeId      = filters.problemTypeId;
      if (filters.machineName   && filters.machineName   !== "all")                  params.machineName        = filters.machineName;
      if (filters.partId         && filters.partId         !== "all")                  params.partId             = filters.partId;
      if (debouncedSerialNumber)                                                     params.serialNumber       = debouncedSerialNumber;
      if (filters.customerName  && filters.customerName  !== "all")                  params.customerName       = filters.customerName;
      if (filters.engineerName  && filters.engineerName  !== "all")                  params.engineerName       = filters.engineerName;
      if (filters.category      && filters.category      !== "all")                  params.category           = filters.category;
      if (filters.division      && filters.division      !== "all")                  params.division           = filters.division;
      if (!statusFilter && filters.callType && filters.callType !== "all")           params.callType           = filters.callType;
      if (!statusFilter && filters.status   && filters.status   !== "all")           params.status             = filters.status;
      if (filters.contractTypeId     && filters.contractTypeId     !== "all")        params.contractTypeId     = filters.contractTypeId;
      if (filters.contractTypeStatus && filters.contractTypeStatus !== "all")        params.contractTypeStatus = filters.contractTypeStatus;
      if (fromDate) params.fromDate = toISTDateParam(fromDate);
      if (toDate)   params.toDate   = toISTDateParam(toDate);

      const res = await serviceCallsApi.getCalls(params);
      setData(res.data);
      setPagination({ page: res.pagination.page, totalPages: res.pagination.totalPages, total: res.pagination.total });
      if (res.stats) setStats(res.stats);
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch calls");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [
    statusFilter, debouncedSearch, debouncedSerialNumber, fromDate, toDate, limit,
    filters.callType, filters.status, filters.customerName, filters.engineerName,
    filters.machineName, filters.partId, filters.category, filters.division, filters.problemTypeId,
    filters.contractTypeId, filters.contractTypeStatus,
  ]);

  const highlightText = (text: string, search: string) => {
  if (!search) return text;

  const regex = new RegExp(`(${search})`, "gi");
  return text.split(regex).map((part, idx) =>
    part.toLowerCase() === search.toLowerCase() ? (
      <mark key={idx} className="bg-yellow-200 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
};

  useEffect(() => { fetchCalls(1); }, [fetchCalls]);

  const columns: Column<ServiceCall>[] = [
    {
      key: "callId",
      label: "Call ID",
      render: (c) => (
        <button className="text-primary underline underline-offset-2 font-medium" onClick={() => navigate(`/calls/${c._id}`)}>{c.callId}</button>
      ),
    },
    {
      key: "callType",
      label: "Call Type",
      render: (c) => (c as any).callType || "—",
    },
    {
      key: "createdAt",
      label: "Date / Time",
      render: (c) => {
        const { date, time } = formatDateTime(c.createdAt);
        return <span>{date}<br /><span className="text-xs text-muted-foreground">{time}</span></span>;
      },
    },
    {
      key: "customerName",
      label: "Customer",
      render: (c) => <span>{c.customerInfo.name}<br /><span className="text-xs text-muted-foreground">{c.customerInfo.phone}</span></span>,
    },
    {
      key: "zone",
      label: "Zone",
      render: (c) => c.customerInfo.zone || "—",
    },
    {
      key: "modelNumber",
      label: <span className="whitespace-normal leading-tight">Machine<br />Model</span>,
      className: "w-[112px] max-w-[112px] whitespace-normal",
      render: (c) => c.machines.length > 0 ? c.machines.map((m, i) => <div key={i}>{m.modelNumber}{i < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}</div>) : "—",
    },
    {
      key: "serialNumber",
      label: <span className="whitespace-normal leading-tight">Machine<br />Serial&nbsp;No</span>,
      className: "w-[170px] max-w-[170px] whitespace-normal",
      render: (c) => c.machines.length > 0 ? c.machines.map((m, i) => <div key={i} className="whitespace-nowrap">{highlightText(m.serialNumber, serialNumber)}{i < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}</div>) : "—",
    },
    {
      key: "contractType",
      label: "Contract Type",
      render: (c) => c.machines.length > 0 ? c.machines.map((m, i) => {
        const isActive = m.contractType?.validTo ? new Date(m.contractType.validTo) >= new Date() : null;
        return <div key={i} className="flex items-center gap-1.5">{isActive !== null && <span className={`h-2 w-2 rounded-full shrink-0 ${isActive ? "bg-green-500" : "bg-red-500"}`} />}{m.contractType?.name || "—"}{i < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}</div>;
      }) : "—",
    },
    {
      key: "usedParts",
      label: "Parts Replaced",
      className: "w-[154px] max-w-[154px]",
      render: (c) => c.machines.length > 0 ? c.machines.map((m, i) => {
        const parts = m.usedParts ?? [];
        return <div key={i}>{parts.length > 0 ? parts.map((p, j) => <div key={j}>{p.machineName} ({p.partCode}){j < parts.length - 1 ? "," : ""}</div>) : "—"}{i < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}</div>;
      }) : "—",
    },
    {
      key: "problemTypes",
      label: "Problem Types",
      className: "w-[140px] max-w-[140px]",
      render: (c) => c.machines.length > 0 ? c.machines.map((m, i) => <div key={i}>{m.problemTypes.map((p, j) => <div key={j}>{p}{j < m.problemTypes.length - 1 ? "," : ""}</div>)}{i < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}</div>) : "—",
    },
    {
      key: "counterReadings",
      label: "Counter Readings",
      render: (c) => {
        const hasReadings = c.machines.some(m => (m.serviceCallReadings?.length ?? 0) > 0 || (m.counterReadings?.[0]?.categories?.length ?? 0) > 0);
        if (!hasReadings) return "—";
        return (
          <div>
            {c.machines.map((m, mi) => {
              const rows = c.callType === "Service-Call"
                ? (m.serviceCallReadings ?? [])
                : (m.counterReadings?.[0]?.categories ?? []);
              if (!rows.length) return mi < c.machines.length - 1 ? <div key={mi}>—<hr className="my-1 border-t border-border" /></div> : <div key={mi}>—</div>;
              return (
                <div key={mi}>
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pr-2 font-normal">Category</th>
                        <th className="text-right pr-2 font-normal">Last</th>
                        <th className="text-right pr-2 font-normal">Current</th>
                        <th className="text-right font-normal">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, ri) => (
                        <tr key={ri}>
                          <td className="pr-2">{r.pagesCategory}</td>
                          <td className="text-right pr-2">{r.lastReading}</td>
                          <td className="text-right pr-2">{r.currentReading}</td>
                          <td className="text-right">{r.diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {mi < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      key: "engineer",
      label: "Engineer",
      render: (c) => c.engineerInfo ? (
        <span>{c.engineerInfo.name}<br /><span className="text-xs text-muted-foreground">{c.engineerInfo.phone}</span></span>
      ) : <span className="text-muted-foreground text-xs">Unassigned</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "note",
      label: "Remarks",
      className: "w-[120px] max-w-[120px]",
      render: (c) => {
        if (!(c as any).note) return "—";
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate w-[110px] cursor-default text-sm">{(c as any).note}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-pre-wrap">{(c as any).note}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      sticky: true,
      render: (c) => (
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" title="View" onClick={() => navigate(`/calls/${c._id}`)}
          ><Eye className="h-4 w-4" /></Button>
          {c.status === "Open" && (
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Assign Engineer" onClick={() => openAssignDialog(c)}
            ><UserCog className="h-4 w-4" /></Button>
          )}
          {c.invoiceUrl && (
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Invoice" onClick={() => window.open(c.invoiceUrl, "_blank")}
            ><FileText className="h-4 w-4" /></Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title={title} description={description}>
            {!statusFilter && stats && (
              <Button variant="outline" className="gap-2" onClick={() => setShowStats(!showStats)}>
                {showStats ? "Hide Stats" : "Show Stats"}
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => setShowFilters(!showFilters)}>
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>

          {!statusFilter && stats && showStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatsCard label="Total Calls"  value={stats.total}      icon={PhoneCall}    colorClass="text-primary bg-accent" />
              <StatsCard label="Open"         value={stats.open}       icon={FolderOpen}   colorClass="text-orange-500 bg-orange-50" />
              <StatsCard label="Assigned"     value={stats.assigned}   icon={UserPlus}     colorClass="text-blue-500 bg-blue-50" />
              <StatsCard label="In Progress"  value={stats.inProgress} icon={Loader}       colorClass="text-indigo-500 bg-indigo-50" />
              <StatsCard label="On Hold"      value={stats.onHold}     icon={PauseCircle}  colorClass="text-yellow-500 bg-yellow-50" />
              <StatsCard label="Completed"    value={stats.completed}  icon={CheckCircle}  colorClass="text-green-500 bg-green-50" />
              <StatsCard label="Cancelled"    value={stats.cancelled}  icon={XCircle}      colorClass="text-red-500 bg-red-50" />
            </div>
          )}

          {showFilters && (
          <div className="space-y-6">
          {/* Row 1: Search + Date Range + Clear */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by call ID, customer, mobile, engineer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" /></div>
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" /></div>
              {(search || serialNumber || fromDate || toDate || Object.values(filters).some(v => v && v !== "all")) && (
                <Button variant="outline" size="sm" onClick={() => setSearchParams({}, { replace: true })} className="h-9"><X className="h-4 w-4 mr-1" /> Clear</Button>
              )}
            </div>
          </div>

          {/* Rows 2–3: 12 filters in a 6-col grid */}
          <div className="grid grid-cols-6 gap-3">
            {!statusFilter && (
              <Select value={filters.callType || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, callType: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Call Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {["Service-Call", "Installation", "Deinstallation", "Counter-Reading", "Others"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {!statusFilter && (
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {["Open","Assigned","Travel Started","Reached Location","In Progress","On Hold","Completed","Cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <SearchableSelect options={customers.map(c => ({ label: c.name, value: c.name }))} value={filters.customerName ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, customerName: v }))} onSearchChange={fetchCustomerOptions} placeholder="Customer" searchPlaceholder="Search customers..." className="w-full h-9 text-sm" />
            <SearchableSelect options={engineers.map(e => ({ label: e.name, value: e.name }))} value={filters.engineerName ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, engineerName: v }))} onSearchChange={fetchEngineers} placeholder="Engineer" searchPlaceholder="Search engineers..." className="w-full h-9 text-sm" />
            <SearchableSelect options={machines.map(m => ({ label: m.name, value: m.name }))} value={filters.machineName ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, machineName: v }))} onSearchChange={fetchMachineOptions} placeholder="Machine" searchPlaceholder="Search machines..." className="w-full h-9 text-sm" />
            <SearchableSelect options={parts.map(p => ({ label: p.name, value: p._id }))} value={filters.partId ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, partId: v }))} onSearchChange={fetchPartsOptions} placeholder="Part" searchPlaceholder="Search parts..." className="w-full h-9 text-sm" />
            <Input placeholder="Serial number..." value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="w-full h-9 text-sm" />
            <SearchableSelect options={categories.map(c => ({ label: c.name, value: c._id }))} value={filters.category ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, category: v }))} onSearchChange={fetchCategoryOptions} placeholder="Category" searchPlaceholder="Search categories..." className="w-full h-9 text-sm" />
            <SearchableSelect options={divisions.map(d => ({ label: d.name, value: d._id }))} value={filters.division ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, division: v }))} onSearchChange={fetchDivisionOptions} placeholder="Division" searchPlaceholder="Search divisions..." className="w-full h-9 text-sm" />
            <SearchableSelect options={problemTypes.map(p => ({ label: p.name, value: p._id }))} value={filters.problemTypeId ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, problemTypeId: v }))} onSearchChange={fetchProblemTypes} placeholder="Problem Type" searchPlaceholder="Search problem types..." className="w-full h-9 text-sm" />
            <SearchableSelect options={contractTypes.map(c => ({ label: c.name, value: c._id }))} value={filters.contractTypeId ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, contractTypeId: v }))} onSearchChange={fetchContractTypeOptions} placeholder="Contract Type" searchPlaceholder="Search contract types..." className="w-full h-9 text-sm" />
            <Select value={filters.contractTypeStatus || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, contractTypeStatus: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Contract Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contract Status</SelectItem>
                <SelectItem value="Active">Active Contracts</SelectItem>
                <SelectItem value="Expired">Expired Contracts</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Records per page */}
          <div className="flex items-center justify-end gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Records per page</Label>
            <Select value={String(limit)} onValueChange={(v) => updateParam("limit", v === "10" ? "" : v)}>
              <SelectTrigger className="w-[80px] h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          </div>
          )}

          <DataTable columns={columns} data={data} pageSize={999} />

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={limit}
            onPageChange={fetchCalls}
          />

          <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Engineer — {assignDialog?.callId}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {assignDialogLoading ? (
                  <div className="flex justify-center py-6"><Spinner /></div>
                ) : (
                <>
                <div className="space-y-2">
                  <Label className="text-sm">Company (for invoice)</Label>
                  <Select value={assignForm.companyId} onValueChange={(v) => setAssignForm(p => ({ ...p, companyId: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select company (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No company</SelectItem>
                      {companies.filter(c => c._id).map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">CGST %</Label>
                    <Input type="number" min={0} max={100} placeholder="0" className="h-9" value={assignForm.cgst} onChange={(e) => setAssignForm(p => ({ ...p, cgst: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">SGST %</Label>
                    <Input type="number" min={0} max={100} placeholder="0" className="h-9" value={assignForm.sgst} onChange={(e) => setAssignForm(p => ({ ...p, sgst: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">IGST %</Label>
                    <Input type="number" min={0} max={100} placeholder="0" className="h-9" value={assignForm.igst} onChange={(e) => setAssignForm(p => ({ ...p, igst: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Select Engineer</Label>
                  <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
                    <SelectTrigger><SelectValue placeholder="Choose engineer" /></SelectTrigger>
                    <SelectContent>
                      {assignEngineers.map((e) => (
                        <SelectItem key={e._id} value={e._id}>
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${e.isOnline ? "bg-green-500" : "bg-gray-300"}`} />
                            <span>{e.name}</span>
                            {e.distanceKm != null && (
                              <span className="ml-auto text-xs text-muted-foreground">{e.distanceKm} km{e.estimatedTimeMin != null ? ` · ${e.estimatedTimeMin} min` : ""}</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
                <Button
                  disabled={!selectedEngineerId || assigning || assignDialogLoading}
                  onClick={async () => {
                    if (!assignDialog) return;
                    setAssigning(true);
                    try {
                      await serviceCallsApi.assignEngineer(
                        assignDialog._id,
                        selectedEngineerId,
                        assignForm.companyId !== "none" ? assignForm.companyId : undefined,
                        assignForm.cgst !== "" ? Number(assignForm.cgst) : undefined,
                        assignForm.sgst !== "" ? Number(assignForm.sgst) : undefined,
                        assignForm.igst !== "" ? Number(assignForm.igst) : undefined,
                      );
                      toast.success(`Engineer assigned to ${assignDialog.callId}`);
                      setAssignDialog(null);
                      fetchCalls(pagination.page);
                    } catch {
                      toast.error("Failed to assign engineer");
                    } finally {
                      setAssigning(false);
                    }
                  }}
                >
                  {assigning ? "Assigning..." : "Assign"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};

export default CallsPage;
