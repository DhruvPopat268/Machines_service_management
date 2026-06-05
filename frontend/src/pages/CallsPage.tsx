import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { serviceCallsApi, engineersApi, type ServiceCall, type CallStats, type CallsParams } from "@/services/serviceCallsApi";
import { DataTable, Column } from "@/components/DataTable";
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
import { Eye, UserPlus, Download, PhoneCall, FolderOpen, UserCog, Loader, PauseCircle, CheckCircle, XCircle, Search, X } from "lucide-react";
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

  const columns: Column<ServiceCall>[] = [
    { key: "no",          label: "No.",            render: (_c, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "callId",      label: "Call ID",         render: (c) => <span className="font-medium text-foreground">{c.callId}</span> },
    { key: "callType",    label: "Call Type",       render: (c) => <span className="font-medium">{(c as any).callType || "—"}</span> },
    { key: "customer", label: "Customer", render: (c) => (
      <div>
        <p className="font-medium">{c.customerInfo.name}</p>
        <p className="text-xs text-muted-foreground">{c.customerInfo.phone}</p>
      </div>
    ) },
    { key: "totalMachines", label: "Total Machines", render: (c) => <span className="font-medium">{c.machines.length}</span> },
    { key: "status",      label: "Status",          render: (c) => <StatusBadge status={c.status} /> },
    { key: "engineer",    label: "Engineer",        render: (c) => <span className={!c.engineerInfo ? "text-muted-foreground italic" : ""}>{c.engineerInfo?.name || "Unassigned"}</span> },
    { key: "createdBy",   label: "Created By",      render: (c) => {
      const val = (c as any).createdBy || "Customer";
      return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ val === "Admin" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700" }`}>{val}</span>;
    } },
    {
      key: "createdAt", label: "Created At", render: (c) => {
        const { date, time } = formatDateTime(c.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (c) => {
        const { date, time } = formatDateTime(c.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); navigate(`/calls/${c._id}`); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {c.status === "Open" && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setAssignDialog(c); setSelectedEngineerId(c.engineerInfo?._id || ""); }}>
              <UserPlus className="h-4 w-4" />
            </Button>
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

          {/* Row 1: Search (left) + Date Range + Clear (right) */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by call ID, customer, mobile, engineer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm w-40" />
              </div>
              {(search || serialNumber || fromDate || toDate || Object.values(filters).some(v => v && v !== "all")) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setSerialNumber(""); setFilters({}); setFromDate(""); setToDate(""); }} className="h-9">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: Filters (right-aligned) */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {!statusFilter && (
              <Select value={filters.callType || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, callType: v }))}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Call Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {["Service-Call", "Installation", "Deinstallation", "Counter-Reading", "Others"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!statusFilter && (
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {["Open","Assigned","Travel Started","Reached Location","In Progress","On Hold","Completed","Cancelled"].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <SearchableSelect options={customers.map(c => ({ label: c.name, value: c.name }))} value={filters.customerName ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, customerName: v }))} onSearchChange={fetchCustomerOptions} placeholder="Customer" searchPlaceholder="Search customers..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={engineers.map(e => ({ label: e.name, value: e.name }))} value={filters.engineerName ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, engineerName: v }))} onSearchChange={fetchEngineers} placeholder="Engineer" searchPlaceholder="Search engineers..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={machines.map(m => ({ label: m.name, value: m.name }))} value={filters.machineName ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, machineName: v }))} onSearchChange={fetchMachineOptions} placeholder="Machine" searchPlaceholder="Search machines..." className="w-[160px] h-9 text-sm" />
            <div className="relative">
              <Input
                placeholder="Serial number..."
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-[160px] h-9 text-sm"
              />
            </div>
            <SearchableSelect options={categories.map(c => ({ label: c.name, value: c._id }))} value={filters.category ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, category: v }))} onSearchChange={fetchCategoryOptions} placeholder="Category" searchPlaceholder="Search categories..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={divisions.map(d => ({ label: d.name, value: d._id }))} value={filters.division ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, division: v }))} onSearchChange={fetchDivisionOptions} placeholder="Division" searchPlaceholder="Search divisions..." className="w-[160px] h-9 text-sm" />
            <SearchableSelect options={problemTypes.map(p => ({ label: p.name, value: p._id }))} value={filters.problemTypeId ?? ""} onChange={(v) => setFilters(prev => ({ ...prev, problemTypeId: v }))} onSearchChange={fetchProblemTypes} placeholder="Problem Type" searchPlaceholder="Search problem types..." className="w-[160px] h-9 text-sm" />
          </div>

          {/* Row 3: Contract Type filters */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SearchableSelect
              options={contractTypes.map(c => ({ label: c.name, value: c._id }))}
              value={filters.contractTypeId ?? ""}
              onChange={(v) => setFilters(prev => ({ ...prev, contractTypeId: v }))}
              onSearchChange={fetchContractTypeOptions}
              placeholder="Contract Type"
              searchPlaceholder="Search contract types..."
              className="w-[180px] h-9 text-sm"
            />
            <Select value={filters.contractTypeStatus || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, contractTypeStatus: v }))}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Contract Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contract Status</SelectItem>
                <SelectItem value="Active">Active Contracts</SelectItem>
                <SelectItem value="Expired">Expired Contracts</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable columns={columns} data={data} />

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
                <div className="space-y-2">
                  <Label>Select Engineer</Label>
                  <Select value={selectedEngineerId} onValueChange={setSelectedEngineerId}>
                    <SelectTrigger><SelectValue placeholder="Choose engineer" /></SelectTrigger>
                    <SelectContent>
                      {engineers.map((e) => (
                        <SelectItem key={e._id} value={e._id}>
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${e.isOnline ? "bg-green-500" : "bg-gray-300"}`} />
                            {e.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
                <Button
                  disabled={!selectedEngineerId || assigning}
                  onClick={async () => {
                    if (!assignDialog) return;
                    setAssigning(true);
                    try {
                      await serviceCallsApi.assignEngineer(assignDialog._id, selectedEngineerId);
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
