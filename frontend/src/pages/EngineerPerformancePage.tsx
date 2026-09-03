import { useState, useEffect, useCallback, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { SearchableSelect } from "@/components/SearchableSelect";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import api from "@/lib/axiosInterceptor";

interface TimelineStep {
  label: string;
  date: string | null;
  meta?: string | null;
}

interface CallTimeline {
  callId: string;
  callType: string;
  status: string;
  priority: string;
  supportiveEngineers?: { _id: string; name: string }[];
  timeline: TimelineStep[];
}

interface EngineerInfo {
  _id: string;
  name: string;
  email: string;
  phone: string;
  engineerId: string;
  isOnline: boolean;
  status: string;
}

interface ReportData {
  engineer: EngineerInfo;
  calls: CallTimeline[];
}

const STATUS_COLUMNS = ["Assigned", "Travel Started", "Reached Location", "In Progress", "On Hold", "Completed", "Cancelled"];

interface FlatCall extends CallTimeline {
  engineerName: string;
}

const EngineerPerformancePage = () => {
  const [engineers, setEngineers]                   = useState<{ _id: string; name: string }[]>([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [callIdSearch, setCallIdSearch]             = useState("");
  const [allCalls, setAllCalls]                     = useState<FlatCall[]>([]);
  const [loading, setLoading]                       = useState(false);
  const [page, setPage]                             = useState(1);
  const [totalPages, setTotalPages]                 = useState(1);
  const [total, setTotal]                           = useState(0);
  const [limit, setLimit]                           = useState(10);
  const engAbortRef = useRef<AbortController | null>(null);

  const fetchEngineers = useCallback(async (q?: string) => {
    engAbortRef.current?.abort();
    const ctrl = new AbortController();
    engAbortRef.current = ctrl;
    try {
      const res = await api.get("/admin/engineers/active", { params: { limit: 100, ...(q && { search: q }) }, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setEngineers(res.data.data);
    } catch {}
  }, []);

  const loadAllEngineers = useCallback(async (p = 1, lim = 10) => {
    setLoading(true);
    try {
      const [engsRes, timelineRes] = await Promise.all([
        api.get("/admin/engineers/active", { params: { limit: 100 } }),
        api.get("/admin/engineers/call-timeline", { params: { page: p, limit: lim } }),
      ]);
      setEngineers(engsRes.data.data);
      setAllCalls(timelineRes.data.data);
      setTotalPages(timelineRes.data.pagination?.totalPages ?? 1);
      setTotal(timelineRes.data.pagination?.total ?? 0);
      setPage(p);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAllEngineers(1, 10); }, [loadAllEngineers]);

  useEffect(() => {
    if (!selectedEngineerId) return;
    setLoading(true);
    setPage(1);
    api.get(`/admin/engineers/${selectedEngineerId}/call-timeline`, { params: { page: 1, limit } })
      .then(res => {
        const data: ReportData = res.data.data;
        const enginName = engineers.find(e => e._id === selectedEngineerId)?.name ?? "";
        setAllCalls(data.calls.map(c => ({ ...c, engineerName: enginName })));
        setTotalPages(res.data.pagination?.totalPages ?? 1);
        setTotal(res.data.pagination?.total ?? 0);
      })
      .catch(err => toast.error(err?.response?.data?.message || "Failed to fetch report"))
      .finally(() => setLoading(false));
  }, [selectedEngineerId]);

  const handlePageChange = (p: number) => {
    if (selectedEngineerId) {
      setLoading(true);
      setPage(p);
      api.get(`/admin/engineers/${selectedEngineerId}/call-timeline`, { params: { page: p, limit } })
        .then(res => {
          const data: ReportData = res.data.data;
          const enginName = engineers.find(e => e._id === selectedEngineerId)?.name ?? "";
          setAllCalls(data.calls.map(c => ({ ...c, engineerName: enginName })));
          setTotalPages(res.data.pagination?.totalPages ?? 1);
          setTotal(res.data.pagination?.total ?? 0);
        })
        .catch(err => toast.error(err?.response?.data?.message || "Failed to fetch report"))
        .finally(() => setLoading(false));
    } else {
      loadAllEngineers(p, limit);
    }
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
    if (selectedEngineerId) {
      setLoading(true);
      api.get(`/admin/engineers/${selectedEngineerId}/call-timeline`, { params: { page: 1, limit: newLimit } })
        .then(res => {
          const data: ReportData = res.data.data;
          const enginName = engineers.find(e => e._id === selectedEngineerId)?.name ?? "";
          setAllCalls(data.calls.map(c => ({ ...c, engineerName: enginName })));
          setTotalPages(res.data.pagination?.totalPages ?? 1);
          setTotal(res.data.pagination?.total ?? 0);
        })
        .catch(err => toast.error(err?.response?.data?.message || "Failed to fetch report"))
        .finally(() => setLoading(false));
    } else {
      loadAllEngineers(1, newLimit);
    }
  };

  const handleClear = () => {
    setSelectedEngineerId("");
    setCallIdSearch("");
    loadAllEngineers(1, limit);
  };

  const displayCalls = allCalls.filter(c => {
    if (!callIdSearch.trim()) return true;
    const q = callIdSearch.trim().toLowerCase();
    return (
      c.callId.toLowerCase().includes(q) ||
      c.engineerName?.toLowerCase().includes(q) ||
      c.supportiveEngineers?.some(e => e.name.toLowerCase().includes(q))
    );
  });

  const hasFilters = !!selectedEngineerId || !!callIdSearch.trim();

  return (
    <div className="space-y-6">
      <PageHeader title="Engineer Performance" description="Per-call status timeline for each engineer" />

      <div className="space-y-6">
          {/* Row 1: Search (left) + Engineer filter (right) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by call ID or engineer..."
                  value={callIdSearch}
                  onChange={e => setCallIdSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {/* Tooltip */}
              <div className="text-xs text-muted-foreground cursor-help group relative shrink-0">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-muted-foreground text-[10px] hover:bg-muted hover:border-foreground transition-colors">?</span>
                <div className="invisible group-hover:visible absolute top-full right-0 mt-2 w-48 bg-slate-900 text-white text-xs rounded-lg p-2 z-50 whitespace-normal">
                  <p className="font-semibold mb-1">Searchable fields:</p>
                  <ul className="text-[11px] space-y-0.5">
                    <li>• Call ID</li>
                    <li>• Engineer Name</li>
                    <li>• Supportive Engineer Name</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Engineer dropdown filter on the right */}
            <SearchableSelect
              options={engineers.map(e => ({ label: e.name, value: e._id }))}
              value={selectedEngineerId}
              onChange={setSelectedEngineerId}
              onSearchChange={fetchEngineers}
              placeholder="Filter by engineer"
              searchPlaceholder="Search engineers..."
              className="w-[220px] h-9 text-sm"
            />
          </div>

          {/* Row 2: Total Records + Records per page (left) + Clear (right) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Total Records: <span className="font-semibold text-foreground">{total}</span>
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Records per page</Label>
                <Select value={String(limit)} onValueChange={(v) => handleLimitChange(Number(v))}>
                  <SelectTrigger className="w-[80px] h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {hasFilters && (
              <Button variant="outline" size="sm" className="h-9" onClick={handleClear}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>

      {loading ? <Spinner /> : (
        <>
          {displayCalls.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No calls found{callIdSearch ? ` matching "${callIdSearch}"` : ""}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Call ID</th>
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Type</th>
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Engineer</th>
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Supportive Engineers</th>
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">Status</th>
                    {STATUS_COLUMNS.map(col => (
                      <th key={col} className="h-10 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayCalls.map((call, idx) => {
                    const stepMap = Object.fromEntries(call.timeline.map(s => [s.label, s]));
                    return (
                      <tr key={call.callId + idx} className="border-b transition-colors hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{call.callId}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{call.callType}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{call.engineerName}</td>
                        <td className="px-4 py-3">
                          {call.supportiveEngineers?.length ? (
                            <div className="space-y-1">
                              {call.supportiveEngineers.map(e => (
                                <div key={e._id} className="text-sm whitespace-nowrap">{e.name}</div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={call.status} /></td>
                        {STATUS_COLUMNS.map(col => {
                          const step = stepMap[col];
                          return (
                            <td key={col} className="px-4 py-3 whitespace-nowrap">
                              {step?.date ? (
                                <div className="flex flex-col gap-0.5 text-xs">
                                  <span className="text-muted-foreground">{step.date}</span>
                                  {step.meta && <span className="text-orange-500">{step.meta}</span>}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={limit}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
};

export default EngineerPerformancePage;
