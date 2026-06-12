import { useState, useEffect, useCallback, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { SearchableSelect } from "@/components/SearchableSelect";
import { StatusBadge } from "@/components/StatusBadge";
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
  const [engineers, setEngineers]               = useState<{ _id: string; name: string }[]>([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [callIdSearch, setCallIdSearch]         = useState("");
  const [allCalls, setAllCalls]                 = useState<FlatCall[]>([]);
  const [loading, setLoading]                   = useState(false);
  const [page, setPage]                         = useState(1);
  const [totalPages, setTotalPages]             = useState(1);
  const [limit, setLimit]                       = useState(10);
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
      setPage(p);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: load all
  useEffect(() => { loadAllEngineers(1, 10); }, [loadAllEngineers]);

  // When engineer selected, fetch from backend
  useEffect(() => {
    if (!selectedEngineerId) { return; }
    setLoading(true);
    setPage(1);
    api.get(`/admin/engineers/${selectedEngineerId}/call-timeline`, { params: { page: 1, limit } })
      .then(res => {
        const data: ReportData = res.data.data;
        const enginName = engineers.find(e => e._id === selectedEngineerId)?.name ?? "";
        setAllCalls(data.calls.map(c => ({ ...c, engineerName: enginName })));
        setTotalPages(res.data.pagination?.totalPages ?? 1);
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
        })
        .catch(err => toast.error(err?.response?.data?.message || "Failed to fetch report"))
        .finally(() => setLoading(false));
    } else {
      loadAllEngineers(1, newLimit);
    }
  };

  const displayCalls = allCalls.filter(c =>
    !callIdSearch.trim() || c.callId.toLowerCase().includes(callIdSearch.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Engineer Performance" description="Per-call status timeline for each engineer" />

      {/* Rows per page */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Rows per page:
          <select
            value={limit}
            onChange={e => handleLimitChange(Number(e.target.value))}
            className="h-9 px-2 border rounded-md text-sm bg-background"
          >
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Call ID..."
              value={callIdSearch}
              onChange={e => setCallIdSearch(e.target.value)}
              className="pl-9 w-[200px] h-9 text-sm"
            />
          </div>
          {(selectedEngineerId || callIdSearch) && (
            <button className="h-9 px-3 text-sm flex items-center gap-1 border rounded-md hover:bg-muted/40 transition-colors"
              onClick={() => { setSelectedEngineerId(""); setCallIdSearch(""); loadAllEngineers(1, limit); }}>
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
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

      {loading && <Spinner />}

      {!loading && (
        <>
{/* Calls table */}
          {displayCalls.length === 0
            ? <div className="text-center py-10 text-muted-foreground text-sm">No calls found{callIdSearch ? ` matching "${callIdSearch}"` : ""}</div>
            : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Call ID</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Engineer</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                      {STATUS_COLUMNS.map(col => (
                        <th key={col} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayCalls.map((call, idx) => {
                      const stepMap = Object.fromEntries(call.timeline.map(s => [s.label, s]));
                      return (
                        <tr key={call.callId + idx} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{call.callId}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{call.callType}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{call.engineerName}</td>
                          <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={call.status} /></td>
                          {STATUS_COLUMNS.map(col => {
                            const step = stepMap[col];
                            return (
                              <td key={col} className="px-3 py-2 whitespace-nowrap">
                                {step?.date
                                  ? (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-muted-foreground">{step.date}</span>
                                      {step.meta && <span className="text-orange-500">{step.meta}</span>}
                                    </div>
                                  )
                                  : <span className="text-muted-foreground/30">—</span>
                                }
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                className="h-8 px-3 text-sm border rounded-md hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1 || loading}
              >Previous</button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <button
                className="h-8 px-3 text-sm border rounded-md hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages || loading}
              >Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EngineerPerformancePage;
