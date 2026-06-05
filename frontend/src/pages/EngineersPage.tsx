import { useState, useEffect, useRef, useCallback } from "react";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/Pagination";
import { Search, X, UserCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import api from "@/lib/axiosInterceptor";

interface Engineer {
  _id: string;
  name: string;
  email: string;
  phone: string;
  engineerId?: string;
  profilePhoto?: string;
  engineerLocation?: { address: string; latitude?: number; longitude?: number };
  isOnline?: boolean;
  status: "Active" | "Inactive";
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const LIMIT = 10;

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const EngineersPage = () => {
  const [data, setData]             = useState<Engineer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEngineers = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await api.get("/admin/engineers", { params, signal: controller.signal });
      setData(res.data.data);
      setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages, total: res.data.pagination.total });
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch engineers");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchEngineers(1); }, [fetchEngineers]);

  const columns: Column<Engineer>[] = [
    { key: "no",    label: "No.",   render: (_u, i) => <span className="font-medium">{(pagination.page - 1) * LIMIT + i + 1}</span> },
    { key: "photo", label: "Photo", render: (u) => u.profilePhoto
      ? <img src={u.profilePhoto} alt={u.name} className="h-8 w-8 rounded-full object-cover" />
      : <UserCircle className="h-8 w-8 text-muted-foreground" />,
    },
    { key: "name",       label: "Name",        render: (u) => <span className="font-medium">{u.name}</span> },
    { key: "engineerId", label: "Engineer ID",  render: (u) => <span className="text-sm font-medium">{u.engineerId || "—"}</span> },
    { key: "email",      label: "Email",        render: (u) => <span className="text-sm">{u.email}</span> },
    { key: "phone",      label: "Phone",        render: (u) => <span className="text-sm">{u.phone || "—"}</span> },
    { key: "address",    label: "Address",      render: (u) => {
      const addr = u.engineerLocation?.address || "";
      if (!addr) return <span className="text-muted-foreground text-sm">—</span>;
      return (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-[180px] truncate block text-sm cursor-default">{addr}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-normal">{addr}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }},
    { key: "isOnline", label: "Online", render: (u) => (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.isOnline ? "text-green-600" : "text-muted-foreground"}`}>
        <span className={`h-2 w-2 rounded-full ${u.isOnline ? "bg-green-500" : "bg-gray-300"}`} />
        {u.isOnline ? "Online" : "Offline"}
      </span>
    )},
    { key: "status", label: "Status", render: (u) => (
      <span className={`text-sm font-medium ${u.status === "Active" ? "text-green-600" : "text-muted-foreground"}`}>{u.status}</span>
    )},
    { key: "lastLoginAt", label: "Last Login", render: (u) => u.lastLoginAt
      ? (() => { const { date, time } = formatDateTime(u.lastLoginAt!); return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>; })()
      : <span className="text-muted-foreground text-sm">Never</span>,
    },
    { key: "createdAt", label: "Created At", render: (u) => {
      const { date, time } = formatDateTime(u.createdAt);
      return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
    }},
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Engineers" description="Manage and monitor field engineers" />

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, email, phone, ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            {search && (
              <Button variant="outline" size="sm" onClick={() => setSearch("")} className="h-9">
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>

          <DataTable columns={columns} data={data} />
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={LIMIT} onPageChange={fetchEngineers} />
        </>
      )}
    </div>
  );
};

export default EngineersPage;
