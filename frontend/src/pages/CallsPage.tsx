import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, UserPlus, Download, PhoneCall, FolderOpen, UserCog, Loader, PauseCircle, CheckCircle, XCircle, Search, X, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
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

const LIMIT = 10;

const CallsPage = ({ statusFilter, title = "All Service Calls", description = "Manage and track all service calls" }: CallsPageProps) => {
  const navigate = useNavigate();

  const [data, setData]                     = useState<ServiceCall[]>([]);
  const [stats, setStats]                   = useState<CallStats | undefined>();
  const [pagination, setPagination]         = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serialNumber, setSerialNumber]         = useState("");
  const [debouncedSerialNumber, setDebouncedSerialNumber] = useState("");
  const [filters, setFilters]               = useState<Record<string, string>>({});
  const [fromDate, setFromDate]             = useState("");
  const [toDate, setToDate]                 = useState("");
  const [assignDialog, setAssignDialog]     = useState<ServiceCall | null>(null);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [assigning, setAssigning]           = useState(false);
  const [companies, setCompanies]           = useState<{ _id: string; name: string; isOnline?: boolean; distanceKm?: number; estimatedTimeMin?: number }[]>([]);
  const [assignEngineers, setAssignEngineers] = useState<{ _id: string; name: string; isOnline?: boolean; distanceKm?: number; estimatedTimeMin?: number }[]>([]);
  const [assignDialogLoading, setAssignDialogLoading] = useState(false);
  const [assignForm, setAssignForm]         = useState({ companyId: "none", cgst: "", sgst: "", igst: "" });

  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  const toggleExpand = (id: string) => setExpandedCallId(prev => prev === id ? null : id);

  const formatDate = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`;
  };
  const [problemTypes, setProblemTypes]     = useState<DropdownOption[]>([]);
  const [machines, setMachines]             = useState<DropdownOption[]>([]);
  const [customers, setCustomers]           = useState<DropdownOption[]>([]);
  const [engineers, setEngineers]           = useState<DropdownOption[]>([]);
  const [categories, setCategories]         = useState<DropdownOption[]>([]);
  const [divisions, setDivisions]           = useState<DropdownOption[]>([]);
  const [contractTypes, setContractTypes]   = useState<DropdownOption[]>([]);

  const customerAbortRef  = useRef<AbortController | null>(null);
  const categoryAbortRef  = useRef<AbortController | null>(null);
  const divisionAbortRef  = useRef<AbortController | null>(null);
  const machineAbortRef   = useRef<AbortController | null>(null);
  const ptAbortRef        = useRef<AbortController | null>(null);
  const ctAbortRef        = useRef<AbortController | null>(null);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSerialNumber(serialNumber), 500);
    return () => clearTimeout(t);
  }, [serialNumber]);

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
        setMachines(mRes.data.data);
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
      if (!controller.signal.aborted) setMachines(res.data.data);
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
      const params: CallsParams = { page: String(page), limit: String(LIMIT) };
      if (statusFilter)                                                params.status       = statusFilter;
      if (debouncedSearch)                                             params.search       = debouncedSearch;
      if (filters.problemTypeId && filters.problemTypeId !== "all")     params.problemTypeId = filters.problemTypeId;
      if (filters.machineName  && filters.machineName  !== "all")     params.machineName  = filters.machineName;
      if (debouncedSerialNumber)                                         params.serialNumber = debouncedSerialNumber;
      if (filters.customerName && filters.customerName !== "all")     params.customerName = filters.customerName;
      if (filters.engineerName && filters.engineerName !== "all")     params.engineerName = filters.engineerName;
      if (filters.category     && filters.category     !== "all")     params.category     = filters.category;
      if (filters.division     && filters.division     !== "all")     params.division     = filters.division;
      if (!statusFilter && filters.callType && filters.callType !== "all")  params.callType     = filters.callType;
      if (!statusFilter && filters.status && filters.status !== "all") params.status      = filters.status;
      if (filters.contractTypeId   && filters.contractTypeId   !== "all") params.contractTypeId   = filters.contractTypeId;
      if (filters.contractTypeStatus && filters.contractTypeStatus !== "all") params.contractTypeStatus = filters.contractTypeStatus;
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
  }, [statusFilter, debouncedSearch, debouncedSerialNumber, filters, fromDate, toDate]);

  useEffect(() => { fetchCalls(1); }, [fetchCalls]);

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title={title} description={description}>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>

          {!statusFilter && stats && (
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
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setSerialNumber(""); setFilters({}); setFromDate(""); setToDate(""); }} className="h-9"><X className="h-4 w-4 mr-1" /> Clear</Button>
              )}
            </div>
          </div>

          {/* Row 2: Filters */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {!statusFilter && (
              <Select value={filters.callType || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, callType: v }))}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Call Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {["Service-Call", "Installation", "Deinstallation", "Counter-Reading", "Others"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {!statusFilter && (
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {["Open","Assigned","Travel Started","Reached Location","In Progress","On Hold","Completed","Cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <SearchableSelect options={customers.map(c => ({ label: c.name, value: c.name }))} value={filters.customerName ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, customerName: v }))} onSearchChange={fetchCustomerOptions} placeholder="Customer" searchPlaceholder="Search customers..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={engineers.map(e => ({ label: e.name, value: e.name }))} value={filters.engineerName ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, engineerName: v }))} onSearchChange={fetchEngineers} placeholder="Engineer" searchPlaceholder="Search engineers..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={machines.map(m => ({ label: m.name, value: m.name }))} value={filters.machineName ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, machineName: v }))} onSearchChange={fetchMachineOptions} placeholder="Machine" searchPlaceholder="Search machines..." className="w-[160px] h-9 text-sm" />
            <Input placeholder="Serial number..." value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={categories.map(c => ({ label: c.name, value: c._id }))} value={filters.category ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, category: v }))} onSearchChange={fetchCategoryOptions} placeholder="Category" searchPlaceholder="Search categories..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={divisions.map(d => ({ label: d.name, value: d._id }))} value={filters.division ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, division: v }))} onSearchChange={fetchDivisionOptions} placeholder="Division" searchPlaceholder="Search divisions..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={problemTypes.map(p => ({ label: p.name, value: p._id }))} value={filters.problemTypeId ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, problemTypeId: v }))} onSearchChange={fetchProblemTypes} placeholder="Problem Type" searchPlaceholder="Search problem types..." className="w-[160px] h-9 text-sm" />
          </div>

          {/* Row 3: Contract Type filters */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SearchableSelect options={contractTypes.map(c => ({ label: c.name, value: c._id }))} value={filters.contractTypeId ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, contractTypeId: v }))} onSearchChange={fetchContractTypeOptions} placeholder="Contract Type" searchPlaceholder="Search contract types..." className="w-[180px] h-9 text-sm" />
            <Select value={filters.contractTypeStatus || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, contractTypeStatus: v }))}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Contract Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contract Status</SelectItem>
                <SelectItem value="Active">Active Contracts</SelectItem>
                <SelectItem value="Expired">Expired Contracts</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Expandable Calls Table */}
          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-8" />
                  <TableHead className="font-semibold text-foreground/70 text-xs uppercase tracking-wider">No.</TableHead>
                  <TableHead className="font-semibold text-foreground/70 text-xs uppercase tracking-wider">Call ID</TableHead>
                  <TableHead className="font-semibold text-foreground/70 text-xs uppercase tracking-wider">Call Type</TableHead>
                  <TableHead className="font-semibold text-foreground/70 text-xs uppercase tracking-wider">Customer</TableHead>
                  <TableHead className="font-semibold text-foreground/70 text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="font-semibold text-foreground/70 text-xs uppercase tracking-wider">Engineer</TableHead>
                  <TableHead className="font-semibold text-foreground/70 text-xs uppercase tracking-wider sticky right-0 bg-muted shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No data found</TableCell></TableRow>
                ) : data.map((c, i) => {
                  const isExpanded = expandedCallId === c._id;
                  const callType = (c as any).callType;
                  const hasCounterReadings = (callType === "Counter-Reading" || callType === "Service-Call") && c.machines.some((m: any) => m.counterReadings?.length > 0 || m.serviceCallReadings?.length > 0);
                  const hasUsedParts = callType === "Service-Call" && c.machines.some((m: any) => m.usedParts?.length > 0);

                  return (
                    <>
                      <TableRow key={c._id} className="cursor-pointer hover:bg-muted/40" onClick={() => toggleExpand(c._id)}>
                        <TableCell className="w-8">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell><span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span></TableCell>
                        <TableCell><span className="font-medium text-foreground">{c.callId}</span></TableCell>
                        <TableCell><span className="font-medium">{callType || "—"}</span></TableCell>
                        <TableCell>
                          <p className="font-medium">{c.customerInfo.name}</p>
                          <p className="text-xs text-muted-foreground">{c.customerInfo.phone}</p>
                        </TableCell>
                        <TableCell><StatusBadge status={c.status} /></TableCell>
                        <TableCell><span className={!c.engineerInfo ? "text-muted-foreground italic" : ""}>{c.engineerInfo?.name || "Unassigned"}</span></TableCell>
                        <TableCell className="sticky right-0 bg-background shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]">
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/calls/${c._id}`)}><Eye className="h-4 w-4" /></Button>
                            {callType === "Service-Call" && c.status === "Completed" && (
                              (c as any).invoiceUrl
                                ? <Button variant="ghost" size="icon" className="h-8 w-8" title="View Invoice" onClick={() => window.open((c as any).invoiceUrl, "_blank")}><FileText className="h-4 w-4 text-green-500" /></Button>
                                : <Button variant="ghost" size="icon" className="h-8 w-8" title="Generate Invoice" onClick={async () => {
                                    const tab = window.open("", "_blank");
                                    try { const res = await serviceCallsApi.getInvoice(c._id); toast.success("Invoice generated"); if (tab) tab.location.href = res.invoiceUrl; else window.open(res.invoiceUrl, "_blank"); fetchCalls(pagination.page); }
                                    catch { toast.error("Failed to generate invoice"); if (tab) tab.close(); }
                                  }}><FileText className="h-4 w-4 text-muted-foreground" /></Button>
                            )}
                            {callType === "Counter-Reading" && c.status === "Completed" && (
                              (c as any).invoiceUrl
                                ? <Button variant="ghost" size="icon" className="h-8 w-8" title="View Invoice" onClick={() => window.open((c as any).invoiceUrl, "_blank")}><FileText className="h-4 w-4 text-green-500" /></Button>
                                : <Button variant="ghost" size="icon" className="h-8 w-8" title="Generate Invoice" onClick={async () => {
                                    const tab = window.open("", "_blank");
                                    try { const res = await serviceCallsApi.getCounterReadingInvoice(c._id); toast.success("Invoice generated"); if (tab) tab.location.href = res.invoiceUrl; else window.open(res.invoiceUrl, "_blank"); fetchCalls(pagination.page); }
                                    catch { toast.error("Failed to generate invoice"); if (tab) tab.close(); }
                                  }}><FileText className="h-4 w-4 text-muted-foreground" /></Button>
                            )}
                            {c.status === "Open" && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openAssignDialog(c)}><UserPlus className="h-4 w-4" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`${c._id}-expanded`}>
                          <TableCell colSpan={8} className="p-4 bg-blue-100 dark:bg-blue-900/30">
                            <div className="space-y-4">

                              {/* Machines — all call types */}
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Machines</p>
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/40">
                                      <TableHead className="text-xs">#</TableHead>
                                      <TableHead className="text-xs">Machine Name</TableHead>
                                      <TableHead className="text-xs">Serial No.</TableHead>
                                      <TableHead className="text-xs">Contract Type</TableHead>
                                      <TableHead className="text-xs">Contract Status</TableHead>
                                      <TableHead className="text-xs">Problem Types</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {c.machines.map((m: any, mi: number) => {
                                      const isExpired = m.contractType?.validTo ? new Date() > new Date(m.contractType.validTo) : false;
                                      return (
                                        <TableRow key={mi}>
                                          <TableCell className="text-xs">{mi + 1}</TableCell>
                                          <TableCell className="text-xs font-medium">{m.machineName}</TableCell>
                                          <TableCell className="text-xs font-mono">{m.serialNumber || "—"}</TableCell>
                                          <TableCell className="text-xs">{m.contractType?.name ? `${m.contractType.name} (${m.contractType.code})` : "—"}</TableCell>
                                          <TableCell className="text-xs">
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${isExpired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                              {isExpired ? "Expired" : "Active"}
                                            </span>
                                          </TableCell>
                                          <TableCell className="text-xs">{m.problemTypes?.filter(Boolean).join(", ") || "—"}</TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>

                              {/* Counter Readings — Service-Call & Counter-Reading */}
                              {hasCounterReadings && (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Counter Readings</p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/40">
                                        <TableHead className="text-xs">Machine</TableHead>
                                        <TableHead className="text-xs">Serial No.</TableHead>
                                        <TableHead className="text-xs">Pages Category</TableHead>
                                        <TableHead className="text-xs text-right">Last Reading</TableHead>
                                        <TableHead className="text-xs text-right">Current Reading</TableHead>
                                        <TableHead className="text-xs text-right">Diff</TableHead>
                                        {callType === "Counter-Reading" && <TableHead className="text-xs text-right">Charges (₹)</TableHead>}
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {c.machines.flatMap((m: any, mi: number) => {
                                        const readings = callType === "Counter-Reading"
                                          ? (m.counterReadings?.[0]?.categories || []).map((cat: any) => ({ ...cat, sn: m.counterReadings[0].serialNumber }))
                                          : (m.serviceCallReadings || []);
                                        return readings.map((cat: any, ci: number) => (
                                          <TableRow key={`${mi}-${ci}`}>
                                            <TableCell className="text-xs font-medium">{m.machineName}</TableCell>
                                            <TableCell className="text-xs font-mono">{m.serialNumber || "—"}</TableCell>
                                            <TableCell className="text-xs">{cat.pagesCategory}</TableCell>
                                            <TableCell className="text-xs text-right">{cat.lastReading}</TableCell>
                                            <TableCell className="text-xs text-right">{cat.currentReading}</TableCell>
                                            <TableCell className="text-xs text-right">{cat.diff}</TableCell>
                                            {callType === "Counter-Reading" && <TableCell className="text-xs text-right font-semibold">₹{cat.chargesInRupees}</TableCell>}
                                          </TableRow>
                                        ));
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}

                              {/* Parts Replaced — Service-Call only */}
                              {hasUsedParts && (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Parts Replaced</p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/40">
                                        <TableHead className="text-xs">Machine (Call)</TableHead>
                                        <TableHead className="text-xs">Part Code</TableHead>
                                        <TableHead className="text-xs">Part Name</TableHead>
                                        <TableHead className="text-xs text-right">Total (₹)</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {c.machines.flatMap((m: any, mi: number) =>
                                        (m.usedParts || []).map((part: any, pi: number) => (
                                          <TableRow key={`${mi}-${pi}`}>
                                            <TableCell className="text-xs">
                                              <p className="font-medium">{m.machineName}</p>
                                              <p className="font-mono text-[10px] text-muted-foreground">{m.serialNumber}</p>
                                            </TableCell>
                                            <TableCell className="text-xs font-mono">{part.partCode}</TableCell>
                                            <TableCell className="text-xs">{part.machineName}</TableCell>
                                            <TableCell className="text-xs text-right font-semibold">₹{part.total}</TableCell>
                                          </TableRow>
                                        ))
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}

                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={LIMIT}
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
