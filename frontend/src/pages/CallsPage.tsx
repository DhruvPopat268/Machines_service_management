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
import { Eye, UserPlus, PhoneCall, FolderOpen, UserCog, Loader, PauseCircle, CheckCircle, XCircle, Search, X, FileText, Send, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

const PRODUCT_CATEGORY_ID = import.meta.env.VITE_PRODUCT_CATEGORY_ID;

const CallsPage = ({ statusFilter, title = "All Service Calls", description = "Manage and track all service calls" }: CallsPageProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const getParam = (key: string) => searchParams.get(key) ?? "";

  const [data, setData]                     = useState<ServiceCall[]>([]);
  const [stats, setStats]                   = useState<CallStats | undefined>();
  const [pagination, setPagination]         = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading]               = useState(true);
  const limit       = Number(getParam("limit")) || 25;
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
    freeParts:           getParam("freeParts"),
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
  const [selectedSupportiveEngineerIds, setSelectedSupportiveEngineerIds] = useState<string[]>([]);
  const [assigning, setAssigning]           = useState(false);
  const [companies, setCompanies]           = useState<{ _id: string; name: string; isOnline?: boolean; distanceKm?: number; estimatedTimeMin?: number }[]>([]);
  const [assignEngineers, setAssignEngineers] = useState<{ _id: string; name: string; isOnline?: boolean; distanceKm?: number; estimatedTimeMin?: number }[]>([]);
  const [assignDialogLoading, setAssignDialogLoading] = useState(false);
  const [assignForm, setAssignForm]         = useState({ companyId: "", customerPORef: "" });

  const [cancelTarget, setCancelTarget] = useState<ServiceCall | null>(null);
  const [cancelling, setCancelling]     = useState(false);
  
  const [sendInvoiceTarget, setSendInvoiceTarget] = useState<ServiceCall | null>(null);
  const [sendingInvoice, setSendingInvoice]       = useState(false);

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

  // Pending (uncommitted) filter state — only applied on Apply click
  const [pendingSearch, setPendingSearch]           = useState(search);
  const [pendingSerial, setPendingSerial]           = useState(serialNumber);
  const [pendingFromDate, setPendingFromDate]       = useState(fromDate);
  const [pendingToDate, setPendingToDate]           = useState(toDate);
  const [pendingFilters, setPendingFilters]         = useState<Record<string, string>>(filters);

  // Sync pending state when URL params change (e.g. navigating from dashboard)
  useEffect(() => {
    setPendingSearch(search);
    setPendingSerial(serialNumber);
    setPendingFromDate(fromDate);
    setPendingToDate(toDate);
    setPendingFilters({
      callType:           getParam("callType"),
      status:             getParam("status"),
      customerName:       getParam("customerName"),
      engineerName:       getParam("engineerName"),
      machineName:        getParam("machineName"),
      partId:             getParam("partId"),
      category:           getParam("category"),
      division:           getParam("division"),
      problemTypeId:      getParam("problemTypeId"),
      contractTypeId:     getParam("contractTypeId"),
      contractTypeStatus: getParam("contractTypeStatus"),
      freeParts:          getParam("freeParts"),
    });
  }, [searchParams]);

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
        setMachines(allMachines.filter((m: any) => m.categoryId?.toString() === PRODUCT_CATEGORY_ID || m.category?._id?.toString() === PRODUCT_CATEGORY_ID));
        setParts(allMachines.filter((m: any) => m.categoryId?.toString() !== PRODUCT_CATEGORY_ID && m.category?._id?.toString() !== PRODUCT_CATEGORY_ID));
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
      if (!controller.signal.aborted) setMachines(res.data.data.filter((m: any) => m.categoryId?.toString() === PRODUCT_CATEGORY_ID || m.category?._id?.toString() === PRODUCT_CATEGORY_ID));
    } catch {}
  }, []);

  const fetchPartsOptions = useCallback(async (q: string) => {
    partsAbortRef.current?.abort();
    const controller = new AbortController();
    partsAbortRef.current = controller;
    try {
      const res = await api.get("/admin/machines", { params: { limit: 100, search: q }, signal: controller.signal });
      if (!controller.signal.aborted) setParts(res.data.data.filter((m: any) => m.categoryId?.toString() !== PRODUCT_CATEGORY_ID && m.category?._id?.toString() !== PRODUCT_CATEGORY_ID));
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
    setSelectedSupportiveEngineerIds((c as any).supportiveEngineers?.map((e: any) => e._id) || []);
    setAssignForm({ companyId: (c as any).companyInfo?.companyId ?? "", customerPORef: "" });
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

  const handleSendInvoice = async (call: ServiceCall) => {
    setSendingInvoice(true);
    try {
      await api.post(`/admin/service-calls/${call._id}/resend-invoice`);
      toast.success(`Invoice email sent successfully for call ${call.callId}`);
      setSendInvoiceTarget(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to send invoice email");
    } finally {
      setSendingInvoice(false);
    }
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
      if (filters.freeParts          && filters.freeParts          !== "all")        params.freeParts          = filters.freeParts;
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
    filters.contractTypeId, filters.contractTypeStatus, filters.freeParts,
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
      label: <span className="whitespace-normal leading-tight">Item<br />Model</span>,
      className: "w-[112px] max-w-[112px] whitespace-normal",
      render: (c) => c.machines.length > 0 ? c.machines.map((m, i) => <div key={i}>{m.modelNumber}{i < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}</div>) : "—",
    },
    {
      key: "serialNumber",
      label: <span className="whitespace-normal leading-tight">Item<br />Serial&nbsp;No</span>,
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
      className: "w-[250px] max-w-[250px]",
      render: (c) => c.machines.length > 0 ? c.machines.map((m, i) => {
        const parts = m.usedParts ?? [];
        return <div key={i}>{parts.length > 0 ? parts.map((p, j) => <div key={j}>{p.machineName} ({p.partCode}) (Qty: {p.quantity ?? 1}){j < parts.length - 1 ? "," : ""}</div>) : "—"}{i < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}</div>;
      }) : "—",
    },
    {
      key: "isFreeParts",
      label: "Is Free",
      render: (c) => c.machines.length > 0 ? c.machines.map((m, i) => {
        const parts = m.usedParts ?? [];
        return <div key={i}>{parts.length > 0 ? parts.map((p, j) => <div key={j}>{p.total === 0 ? <span className="text-green-600 text-xs font-medium">Yes</span> : <span className="text-red-500 text-xs">No</span>}{j < parts.length - 1 ? "," : ""}</div>) : "—"}{i < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}</div>;
      }) : "—",
    },
    {
      key: "buyingPriceBase",
      label: "Original Buying Price (Base)",
      render: (c) => c.machines.length > 0 ? c.machines.map((m, i) => {
        const parts = m.usedParts ?? [];
        return <div key={i}>{parts.length > 0 ? parts.map((p, j) => <div key={j}>₹{(p.buyingPriceBase ?? 0).toLocaleString()}{j < parts.length - 1 ? "," : ""}</div>) : "—"}{i < c.machines.length - 1 && <hr className="my-1 border-t border-border" />}</div>;
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
      key: "supportiveEngineers",
      label: "Supportive Engineers",
      render: (c) => {
        const list = (c as any).supportiveEngineers;
        if (!list?.length) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <div className="space-y-1">
            {list.map((e: any) => (
              <div key={e._id}>
                <span className="text-sm">{e.name}</span><br />
                <span className="text-xs text-muted-foreground">{e.phone}</span>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "note",
      label: "Admin Remarks",
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
      key: "engineerCompleteRemarks",
      label: "Engineer Remarks",
      className: "w-[120px] max-w-[120px]",
      render: (c) => {
        if (!(c as any).engineerCompleteRemarks) return "—";
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate w-[110px] cursor-default text-sm">{(c as any).engineerCompleteRemarks}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-pre-wrap">{(c as any).engineerCompleteRemarks}</TooltipContent>
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
          <Button size="sm" variant="outline" className="text-xs h-7" title="View" onClick={() => navigate(`/calls/${c._id}`)}
          ><Eye className="h-3 w-3" /></Button>
          {c.status === "Open" && (
            <Button size="sm" variant="outline" className="text-xs h-7" title="Assign Engineer" onClick={() => openAssignDialog(c)}
            ><UserCog className="h-3 w-3" /></Button>
          )}
          {c.invoiceUrl && (
            <Button size="sm" variant="outline" className="text-xs h-7 text-green-600 border-green-300" title="View Invoice" onClick={() => window.open(c.invoiceUrl, "_blank")}
            ><FileText className="h-3 w-3" /></Button>
          )}
          {c.status === "Completed" && c.invoiceUrl && (
            <Button size="sm" variant="outline" className="text-xs h-7 text-blue-600 border-blue-300" title="Send Invoice Email" onClick={() => setSendInvoiceTarget(c)}
            ><Send className="h-3 w-3" /></Button>
          )}
          {c.status !== "Completed" && c.status !== "Cancelled" && (
            <Button size="sm" variant="outline" className="text-xs h-7 text-red-600 border-red-300" title="Cancel Call" onClick={() => setCancelTarget(c)}
            ><XCircle className="h-3 w-3" /></Button>
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
          {/* Row 1: Search + Date Range */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by call ID, customer, mobile, engineer..." value={pendingSearch} onChange={(e) => setPendingSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="text-xs text-muted-foreground cursor-help group relative shrink-0">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-muted-foreground text-[10px] hover:bg-muted hover:border-foreground transition-colors">?</span>
                <div className="invisible group-hover:visible absolute top-full right-0 mt-2 w-48 bg-slate-900 text-white text-xs rounded-lg p-2 z-50 whitespace-normal">
                  <p className="font-semibold mb-1">Searchable fields:</p>
                  <ul className="text-[11px] space-y-0.5">
                    <li>• Call ID</li>
                    <li>• Customer Name</li>
                    <li>• Customer Phone</li>
                    <li>• Engineer Name</li>
                    <li>• Supportive Engineer Name</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label><Input type="date" value={pendingFromDate} onChange={(e) => setPendingFromDate(e.target.value)} className="h-9 text-sm w-40" /></div>
              <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label><Input type="date" value={pendingToDate} onChange={(e) => setPendingToDate(e.target.value)} className="h-9 text-sm w-40" /></div>
            </div>
          </div>

          {/* Rows 2–3: 13 filters in a 6-col grid */}
          <div className="grid grid-cols-6 gap-3">
            {!statusFilter && (
              <Select value={pendingFilters.callType || "all"} onValueChange={(v) => setPendingFilters(prev => ({ ...prev, callType: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Call Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {["Service-Call", "Installation", "Dis-Installation", "Counter-Reading", "Others"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {!statusFilter && (
              <Select value={pendingFilters.status || "all"} onValueChange={(v) => setPendingFilters(prev => ({ ...prev, status: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {["Open","Assigned","Travel Started","Reached Location","In Progress","On Hold","Completed","Cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <SearchableSelect options={customers.map(c => ({ label: c.name, value: c.name }))} value={pendingFilters.customerName ?? ""} onChange={(v) => setPendingFilters(prev => ({ ...prev, customerName: v }))} onSearchChange={fetchCustomerOptions} placeholder="Customer" searchPlaceholder="Search customers..." className="w-full h-9 text-sm" />
            <SearchableSelect options={engineers.map(e => ({ label: e.name, value: e.name }))} value={pendingFilters.engineerName ?? ""} onChange={(v) => setPendingFilters(prev => ({ ...prev, engineerName: v }))} onSearchChange={fetchEngineers} placeholder="Engineer" searchPlaceholder="Search engineers..." className="w-full h-9 text-sm" />
            <SearchableSelect options={machines.map(m => ({ label: m.name, value: m.name }))} value={pendingFilters.machineName ?? ""} onChange={(v) => setPendingFilters(prev => ({ ...prev, machineName: v }))} onSearchChange={fetchMachineOptions} placeholder="Item" searchPlaceholder="Search items..." className="w-full h-9 text-sm" />
            <SearchableSelect options={parts.map(p => ({ label: p.name, value: p._id }))} value={pendingFilters.partId ?? ""} onChange={(v) => setPendingFilters(prev => ({ ...prev, partId: v }))} onSearchChange={fetchPartsOptions} placeholder="Part" searchPlaceholder="Search parts..." className="w-full h-9 text-sm" />
            <Input placeholder="Serial number..." value={pendingSerial} onChange={(e) => setPendingSerial(e.target.value)} className="w-full h-9 text-sm" />
            <SearchableSelect options={categories.map(c => ({ label: c.name, value: c._id }))} value={pendingFilters.category ?? ""} onChange={(v) => setPendingFilters(prev => ({ ...prev, category: v }))} onSearchChange={fetchCategoryOptions} placeholder="Category" searchPlaceholder="Search categories..." className="w-full h-9 text-sm" />
            <SearchableSelect options={divisions.map(d => ({ label: d.name, value: d._id }))} value={pendingFilters.division ?? ""} onChange={(v) => setPendingFilters(prev => ({ ...prev, division: v }))} onSearchChange={fetchDivisionOptions} placeholder="Division" searchPlaceholder="Search divisions..." className="w-full h-9 text-sm" />
            <SearchableSelect options={problemTypes.map(p => ({ label: p.name, value: p._id }))} value={pendingFilters.problemTypeId ?? ""} onChange={(v) => setPendingFilters(prev => ({ ...prev, problemTypeId: v }))} onSearchChange={fetchProblemTypes} placeholder="Problem Type" searchPlaceholder="Search problem types..." className="w-full h-9 text-sm" />
            <SearchableSelect options={contractTypes.map(c => ({ label: c.name, value: c._id }))} value={pendingFilters.contractTypeId ?? ""} onChange={(v) => setPendingFilters(prev => ({ ...prev, contractTypeId: v }))} onSearchChange={fetchContractTypeOptions} placeholder="Contract Type" searchPlaceholder="Search contract types..." className="w-full h-9 text-sm" />
            <Select value={pendingFilters.contractTypeStatus || "all"} onValueChange={(v) => setPendingFilters(prev => ({ ...prev, contractTypeStatus: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Contract Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contract Status</SelectItem>
                <SelectItem value="Active">Active Contracts</SelectItem>
                <SelectItem value="Expired">Expired Contracts</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pendingFilters.freeParts || "all"} onValueChange={(v) => setPendingFilters(prev => ({ ...prev, freeParts: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Free Parts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Free Parts Used</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Records per page + Apply / Clear */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Total Records: <span className="font-semibold text-foreground">{pagination.total}</span>
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Records per page</Label>
              <Select value={String(limit)} onValueChange={(v) => updateParam("limit", v === "10" ? "" : v)}>
                <SelectTrigger className="w-[80px] h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              </div>
            </div>
            {(() => {
              const hasAny = !!pendingSearch || !!pendingSerial || !!pendingFromDate || !!pendingToDate ||
                Object.values(pendingFilters).some(v => v && v !== "all");
              return hasAny ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => {
                    setPendingSearch("");
                    setPendingSerial("");
                    setPendingFromDate("");
                    setPendingToDate("");
                    setPendingFilters({ callType: "", status: "", customerName: "", engineerName: "", machineName: "", partId: "", category: "", division: "", problemTypeId: "", contractTypeId: "", contractTypeStatus: "", freeParts: "" });
                    setSearchParams({}, { replace: true });
                  }}><X className="h-4 w-4 mr-1" /> Clear</Button>
                  <Button size="sm" className="h-9" onClick={() => {
                    setSearchParams(prev => {
                      const next = new URLSearchParams(prev);
                      const set = (k: string, v: string) => { if (v && v !== "all") next.set(k, v); else next.delete(k); };
                      set("search", pendingSearch);
                      set("serialNumber", pendingSerial);
                      set("fromDate", pendingFromDate);
                      set("toDate", pendingToDate);
                      Object.entries(pendingFilters).forEach(([k, v]) => set(k, v));
                      next.delete("page");
                      return next;
                    }, { replace: true });
                  }}>Apply Filters</Button>
                </div>
              ) : null;
            })()}
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
                  <Label className="text-sm">Company (for invoice) <span className="text-destructive">*</span></Label>
                  <Select value={assignForm.companyId} onValueChange={(v) => setAssignForm(p => ({ ...p, companyId: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {companies.filter(c => c._id).map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Customer PO/Ref No <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                  <Input
                    className="h-9 text-sm"
                    placeholder="Enter PO or reference number"
                    value={assignForm.customerPORef}
                    onChange={(e) => setAssignForm(p => ({ ...p, customerPORef: e.target.value }))}
                  />
                </div>


                <div className="space-y-2">
                  <Label>Select Engineer</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9">
                        {selectedEngineerId ? (
                          (() => {
                            const eng = assignEngineers.find(e => e._id === selectedEngineerId);
                            return eng ? (
                              <span className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${eng.isOnline ? "bg-green-500" : "bg-gray-300"}`} />
                                <span>{eng.name}</span>
                              </span>
                            ) : <span className="text-muted-foreground">Choose engineer</span>;
                          })()
                        ) : (
                          <span className="text-muted-foreground">Choose engineer</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start" onWheel={(e) => e.stopPropagation()}>
                      <Command>
                        <CommandInput placeholder="Search engineers..." />
                        <CommandList className="max-h-52">
                          <CommandEmpty>No engineers found.</CommandEmpty>
                          <CommandGroup>
                            {assignEngineers.map((e) => (
                              <CommandItem
                                key={e._id}
                                value={e.name}
                                onSelect={() => {
                                  setSelectedEngineerId(e._id);
                                  setSelectedSupportiveEngineerIds(prev => prev.filter(id => id !== e._id));
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedEngineerId === e._id ? "opacity-100" : "opacity-0")} />
                                <span className={`h-2 w-2 rounded-full shrink-0 mr-1.5 ${e.isOnline ? "bg-green-500" : "bg-gray-300"}`} />
                                <span className="flex-1">{e.name}</span>
                                {e.distanceKm != null && (
                                  <span className="ml-auto text-xs text-muted-foreground">{e.distanceKm} km{e.estimatedTimeMin != null ? ` · ${e.estimatedTimeMin} min` : ""}</span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Supportive Engineers <span className="text-muted-foreground font-normal text-xs">(Optional)</span></Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" disabled={!selectedEngineerId} className="w-full justify-between font-normal min-h-9 h-auto disabled:opacity-50 disabled:cursor-not-allowed">
                        {selectedSupportiveEngineerIds.length === 0 ? (
                          <span className="text-muted-foreground">Select supportive engineers...</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {selectedSupportiveEngineerIds.map((sid) => {
                              const eng = assignEngineers.find(e => e._id === sid);
                              return eng ? (
                                <Badge key={sid} variant="secondary" className="text-xs font-normal gap-1">
                                  {eng.name}
                                  <span
                                    role="button"
                                    className="cursor-pointer hover:text-destructive"
                                    onPointerDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSelectedSupportiveEngineerIds(prev => prev.filter(id => id !== sid));
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </span>
                                </Badge>
                              ) : null;
                            })}
                          </span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start" onWheel={(e) => e.stopPropagation()}>
                      <Command>
                        <CommandInput placeholder="Search engineers..." />
                        <CommandList className="max-h-52">
                          <CommandEmpty>No engineers found.</CommandEmpty>
                          <CommandGroup>
                            {assignEngineers.filter(e => e._id !== selectedEngineerId).map((e) => {
                              const checked = selectedSupportiveEngineerIds.includes(e._id);
                              return (
                                <CommandItem
                                  key={e._id}
                                  value={e.name}
                                  onSelect={() =>
                                    setSelectedSupportiveEngineerIds(prev =>
                                      checked ? prev.filter(id => id !== e._id) : [...prev, e._id]
                                    )
                                  }
                                >
                                  <Check className={cn("mr-2 h-4 w-4 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                                  <span className={`h-2 w-2 rounded-full shrink-0 mr-1.5 ${e.isOnline ? "bg-green-500" : "bg-gray-300"}`} />
                                  <span className="flex-1">{e.name}</span>
                                  {e.distanceKm != null && (
                                    <span className="ml-auto text-xs text-muted-foreground">{e.distanceKm} km{e.estimatedTimeMin != null ? ` · ${e.estimatedTimeMin} min` : ""}</span>
                                  )}
                                </CommandItem>
                              );
                            })}
                            {assignEngineers.filter(e => e._id !== selectedEngineerId).length === 0 && (
                              <p className="text-xs text-muted-foreground px-2 py-3 text-center">No other engineers available</p>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
                <Button
                  disabled={!selectedEngineerId || !assignForm.companyId || assigning || assignDialogLoading}
                  onClick={async () => {
                    if (!assignDialog) return;
                    setAssigning(true);
                    try {
                      await serviceCallsApi.assignEngineer(
                        assignDialog._id,
                        selectedEngineerId,
                        assignForm.companyId,
                        assignForm.customerPORef || undefined,
                        selectedSupportiveEngineerIds.length ? selectedSupportiveEngineerIds : undefined,
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

          <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Cancel Call — {cancelTarget?.callId}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground py-2">Are you sure you want to mark this call as cancelled? This action cannot be undone.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCancelTarget(null)}>No, Go Back</Button>
                <Button
                  variant="destructive"
                  disabled={cancelling}
                  onClick={async () => {
                    if (!cancelTarget) return;
                    setCancelling(true);
                    try {
                      await serviceCallsApi.updateCall(cancelTarget._id, { status: "Cancelled" });
                      toast.success(`Call ${cancelTarget.callId} marked as cancelled`);
                      setCancelTarget(null);
                      fetchCalls(pagination.page);
                    } catch (err: any) {
                      toast.error(err?.response?.data?.message || "Failed to cancel call");
                    } finally {
                      setCancelling(false);
                    }
                  }}
                >
                  {cancelling ? "Cancelling..." : "Yes, Cancel Call"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!sendInvoiceTarget} onOpenChange={() => setSendInvoiceTarget(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Send Invoice Email — {sendInvoiceTarget?.callId}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground py-2">Send the invoice email to {sendInvoiceTarget?.customerInfo?.email}? The email will include a download link to the invoice.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSendInvoiceTarget(null)}>Cancel</Button>
                <Button
                  variant="default"
                  disabled={sendingInvoice}
                  onClick={() => {
                    if (!sendInvoiceTarget) return;
                    handleSendInvoice(sendInvoiceTarget);
                  }}
                >
                  {sendingInvoice ? "Sending..." : "Send Invoice"}
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
