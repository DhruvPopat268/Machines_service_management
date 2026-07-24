import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/StatsCard";
import { PhoneCall, AlertCircle, UserCog, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Spinner from "@/components/Spinner";
import api from "@/lib/axiosInterceptor";

interface ExpiryItem { machineName: string; modelNumber: string; serialNumber: string; contractType: string; validFrom: string; validTo: string; }
interface ExpiryCustomer { customerId: string | null; name: string; email: string; phone: string; expired: ExpiryItem[]; expiringSoon: ExpiryItem[]; }

const DONUT_COLORS = [
  "hsl(217, 91%, 50%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)",
  "hsl(280, 70%, 55%)", "hsl(0, 84%, 60%)",  "hsl(199, 89%, 48%)",
  "hsl(160, 60%, 45%)", "hsl(45, 93%, 47%)",
];

interface DashboardStats {
  totalCalls: number; completedCalls: number; openCalls: number; assignedCalls: number;
  inProgressCalls: number; onHoldCalls: number; cancelledCalls: number;
  activeEngineers: number; activeCustomers: number; lowStockMachines: number;
}

interface FreePart { machineId: string; machineName: string; modelNumber: string; freeCount: number; percentage: number; }
interface FreePartsContractType { contractTypeId: string; contractTypeName: string; contractTypeCode: string; totalFreeParts: number; parts: FreePart[]; }


const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dateMode, setDateMode] = useState<"all" | "custom">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [viewMode, setViewMode] = useState<"both" | "service" | "account">("both");

  const [expiryData, setExpiryData]       = useState<ExpiryCustomer[]>([]);
  const [expiryPage, setExpiryPage]       = useState(0);
  const [expiryOpen, setExpiryOpen]       = useState(false);
  const [expiryLoading, setExpiryLoading] = useState(true);

  const [stats, setStats]               = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [zoneStats, setZoneStats]             = useState<{ zone: string; count: number }[]>([]);
  const [freeParts, setFreeParts]             = useState<FreePartsContractType[]>([]);
  const [totalEngineers, setTotalEngineers]   = useState(0);
  const [inactiveEngineers, setInactiveEngineers] = useState(0);
  const [totalCustomers, setTotalCustomers]   = useState(0);
  const [inactiveCustomers, setInactiveCustomers] = useState(0);
  const [callTypeStats, setCallTypeStats]     = useState<{ type: string; total: number; completed: number }[]>([]);
  const [callStatusStats, setCallStatusStats] = useState<{ status: string; count: number }[]>([]);
  const [monthlyStats, setMonthlyStats]       = useState<{ month: string; total: number; completed: number }[]>([]);
  const [chartsLoading, setChartsLoading]     = useState(true);

  const now = new Date();
  const [monthlyEndYear,  setMonthlyEndYear]  = useState(now.getFullYear());
  const [monthlyEndMonth, setMonthlyEndMonth] = useState(now.getMonth() + 1);
  const isCurrentMonthWindow = monthlyEndYear > now.getFullYear() || (monthlyEndYear === now.getFullYear() && monthlyEndMonth >= (now.getMonth() + 1));

  const shiftMonth = (dir: 1 | -1) => {
    const totalMonths = monthlyEndYear * 12 + (monthlyEndMonth - 1) + dir * 4;
    const newYear  = Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    setMonthlyEndYear(newYear);
    setMonthlyEndMonth(newMonth);
  };

  useEffect(() => {
    setStatsLoading(true);
    const params: Record<string, string> = {};
    if (dateMode === "custom" && fromDate) params.from = fromDate;
    if (dateMode === "custom" && toDate)   params.to   = toDate;
    api.get("/admin/dashboard/stats", { params })
      .then(r => setStats(r.data.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [dateMode, fromDate, toDate]);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    api.get("/admin/sales/contract-expiry-status")
      .then(r => { setExpiryData(r.data.data); if (r.data.data.length > 0) setExpiryOpen(true); })
      .catch(() => {})
      .finally(() => setExpiryLoading(false));
  }, []);

  useEffect(() => {
    setChartsLoading(true);
    const params: Record<string, string> = {
      mYear:  String(monthlyEndYear),
      mMonth: String(monthlyEndMonth),
    };
    if (dateMode === "custom" && fromDate) params.from = fromDate;
    if (dateMode === "custom" && toDate)   params.to   = toDate;
    api.get("/admin/dashboard/charts", { params })
      .then(r => {
        const d = r.data.data;
        setCallTypeStats(d.callTypeStats     ?? []);
        setCallStatusStats(d.callStatusStats ?? []);
        setFreeParts(d.freeParts             ?? []);
        setMonthlyStats(d.monthlyStats       ?? []);
        setZoneStats(d.zoneStats             ?? []);
        setTotalEngineers(d.totalEngineers   ?? 0);
        setInactiveEngineers(d.inactiveEngineers ?? 0);
        setTotalCustomers(d.totalCustomers   ?? 0);
        setInactiveCustomers(d.inactiveCustomers ?? 0);
      })
      .catch(() => {})
      .finally(() => setChartsLoading(false));
  }, [dateMode, fromDate, toDate, monthlyEndYear, monthlyEndMonth]);



  const CALL_TYPE_ORDER = ["Service-Call", "Counter-Reading", "Installation", "Dis-Installation", "Others"];
  const callTypeData = [...callTypeStats]
    .sort((a, b) => CALL_TYPE_ORDER.indexOf(a.type) - CALL_TYPE_ORDER.indexOf(b.type))
    .map(c => ({
      ...c,
      type: c.type.replace("Service-Call", "Service").replace("Dis-Installation", "Dis-Install").replace("Counter-Reading", "Counter"),
    }));

  const STATUS_COLORS: Record<string, string> = {
    "Open":             "hsl(38, 92%, 50%)",
    "Assigned":         "hsl(199, 89%, 48%)",
    "Travel Started":   "hsl(280, 70%, 55%)",
    "Reached Location": "hsl(45, 93%, 47%)",
    "In Progress":      "hsl(217, 91%, 50%)",
    "On Hold":          "hsl(38, 92%, 65%)",
    "Completed":        "hsl(142, 71%, 45%)",
    "Cancelled":        "hsl(0, 84%, 60%)",
  };
  const statusData = callStatusStats
    .filter(s => s.count > 0)
    .map(s => ({ name: s.status, value: s.count, color: STATUS_COLORS[s.status] ?? "hsl(0,0%,60%)" }));

const serviceStats = [
    { label: "Total Calls",       value: stats?.totalCalls       ?? 0, icon: PhoneCall,   colorClass: "text-primary bg-accent" },
    { label: "Completed Calls",   value: stats?.completedCalls   ?? 0, icon: PhoneCall,   colorClass: "text-success bg-success/10" },
    { label: "Active Engineers",  value: stats?.activeEngineers  ?? 0, icon: UserCog,     colorClass: "text-primary bg-accent" },
    { label: "Active Customers",  value: stats?.activeCustomers  ?? 0, icon: UserCog,     colorClass: "text-success bg-success/10" },
    { label: "Low Stock Machines",value: stats?.lowStockMachines ?? 0, icon: Package,     colorClass: "text-destructive bg-destructive/10" },
  ];

  const allStats = serviceStats;

  const callStats = [
    { label: "Open Calls",    value: stats?.openCalls        ?? 0, icon: AlertCircle, colorClass: "text-warning bg-warning/10" },
    { label: "Assigned Calls",value: stats?.assignedCalls    ?? 0, icon: UserCog,     colorClass: "text-info bg-info/10" },
    { label: "In Progress",   value: stats?.inProgressCalls  ?? 0, icon: PhoneCall,   colorClass: "text-primary bg-accent" },
    { label: "On Hold",       value: stats?.onHoldCalls      ?? 0, icon: AlertCircle, colorClass: "text-warning bg-warning/10" },
    { label: "Cancelled",     value: stats?.cancelledCalls   ?? 0, icon: AlertCircle, colorClass: "text-destructive bg-destructive/10" },
  ];

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const currentExpiry = expiryData[expiryPage];

  const usersData = [
    { name: "Active",   value: stats?.activeCustomers ?? 0,  fill: "hsl(142, 71%, 45%)" },
    { name: "Inactive", value: inactiveCustomers,            fill: "hsl(0, 84%, 60%)" },
  ];

  const engineersData = [
    { name: "Active",   value: stats?.activeEngineers ?? 0,  fill: "hsl(142, 71%, 45%)" },
    { name: "Inactive", value: inactiveEngineers,            fill: "hsl(0, 84%, 60%)" },
  ];

  return (
    <div className="space-y-6">
      {loading && <Spinner />}
      {!loading && <>
        {/* Contract Expiry Dialog */}
        <Dialog open={expiryOpen} onOpenChange={setExpiryOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between pr-6">
                <div>
                  <DialogTitle>Contract Expiry Alerts</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{expiryData.length} customer{expiryData.length > 1 ? "s" : ""} with expiring contracts</p>
                </div>
                <div className="flex items-center gap-2">
                  <button disabled={expiryPage === 0} onClick={() => setExpiryPage(p => p - 1)}
                    className="h-7 w-7 rounded-md border flex items-center justify-center disabled:opacity-40 hover:bg-muted">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-muted-foreground">{expiryPage + 1} / {expiryData.length}</span>
                  <button disabled={expiryPage === expiryData.length - 1} onClick={() => setExpiryPage(p => p + 1)}
                    className="h-7 w-7 rounded-md border flex items-center justify-center disabled:opacity-40 hover:bg-muted">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 space-y-4 pr-1">
              {currentExpiry && <>
              {/* Customer info */}
              <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-4 py-3">
                <div className="flex-1">
                  <p className="font-semibold text-sm">{currentExpiry.name}</p>
                  <p className="text-xs text-muted-foreground">{currentExpiry.email} · {currentExpiry.phone}</p>
                </div>
                <div className="flex gap-2">
                  {currentExpiry.expired.length > 0 && <span className="text-[11px] font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{currentExpiry.expired.length} Expired</span>}
                  {currentExpiry.expiringSoon.length > 0 && <span className="text-[11px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{currentExpiry.expiringSoon.length} Expiring Soon</span>}
                </div>
              </div>

              {/* Expired */}
              {currentExpiry.expired.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 overflow-hidden">
                  <p className="px-4 py-2 text-xs font-bold text-red-700 uppercase tracking-wide border-b border-red-200">🔴 Expired</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-red-100 text-red-800">
                        <th className="text-left px-4 py-2 font-semibold">Machine</th>
                        <th className="text-left px-4 py-2 font-semibold">Serial No.</th>
                        <th className="text-left px-4 py-2 font-semibold">Contract Type</th>
                        <th className="text-left px-4 py-2 font-semibold">Valid From</th>
                        <th className="text-left px-4 py-2 font-semibold">Valid To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100">
                      {currentExpiry.expired.map((item, i) => (
                        <tr key={i} className="bg-white">
                          <td className="px-4 py-2">{item.machineName}</td>
                          <td className="px-4 py-2 font-mono">{item.serialNumber}</td>
                          <td className="px-4 py-2">{item.contractType}</td>
                          <td className="px-4 py-2">{fmtDate(item.validFrom)}</td>
                          <td className="px-4 py-2 text-red-600 font-medium">{fmtDate(item.validTo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Expiring Soon */}
              {currentExpiry.expiringSoon.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                  <p className="px-4 py-2 text-xs font-bold text-amber-700 uppercase tracking-wide border-b border-amber-200">🟡 Expiring Soon</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-amber-100 text-amber-800">
                        <th className="text-left px-4 py-2 font-semibold">Machine</th>
                        <th className="text-left px-4 py-2 font-semibold">Serial No.</th>
                        <th className="text-left px-4 py-2 font-semibold">Contract Type</th>
                        <th className="text-left px-4 py-2 font-semibold">Valid From</th>
                        <th className="text-left px-4 py-2 font-semibold">Valid To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {currentExpiry.expiringSoon.map((item, i) => (
                        <tr key={i} className="bg-white">
                          <td className="px-4 py-2">{item.machineName}</td>
                          <td className="px-4 py-2 font-mono">{item.serialNumber}</td>
                          <td className="px-4 py-2">{item.contractType}</td>
                          <td className="px-4 py-2">{fmtDate(item.validFrom)}</td>
                          <td className="px-4 py-2 text-amber-600 font-medium">{fmtDate(item.validTo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </>}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button variant="outline" onClick={() => setExpiryOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col gap-3">
          <div className="flex items-center bg-muted rounded-lg p-1 w-fit">
            {(["both", "service", "account"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  viewMode === mode ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "both" ? "Both" : mode === "service" ? "Service" : "Account"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground text-sm">Overview of your service operations</p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-3">
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                onClick={() => setDateMode("all")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${dateMode === "all" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                All
              </button>
              <button
                onClick={() => setDateMode("custom")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${dateMode === "custom" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Custom Dates
              </button>
            </div>
            {dateMode === "custom" && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-sm w-36" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-sm w-36" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {statsLoading
            ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)
            : allStats.map((stat) => <StatsCard key={stat.label} {...stat} />)
          }
        </div>

        {(viewMode === "both" || viewMode === "service") && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {statsLoading
              ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)
              : callStats.map((stat) => <StatsCard key={stat.label} {...stat} />)
            }
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 xl:[grid-template-columns:30%_1fr_1fr]">
          {/* Calls by Call Type */}
          {(viewMode === "both" || viewMode === "service") && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg mb-0">Calls by Call Type</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-0">
              {chartsLoading
                ? <div className="h-[250px] flex items-center justify-center"><Spinner /></div>
                : <ResponsiveContainer width="100%" height={250}>
                <BarChart data={callTypeData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="type" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend align="right" verticalAlign="top" wrapperStyle={{ top: -5 }} />
                  <Bar dataKey="total" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} name="Total" />
                  <Bar dataKey="completed" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} name="Completed" />
                </BarChart>
              </ResponsiveContainer>}
            </CardContent>
          </Card>
          )}

          {/* Calls by Status - service */}
          {(viewMode === "both" || viewMode === "service") && (
          <Card className="border-0 shadow-sm md:col-span-2 xl:col-span-1">
            <CardHeader><CardTitle className="text-lg">Calls by Status</CardTitle></CardHeader>
            <CardContent className="pr-0">
              {chartsLoading
                ? <div className="h-[250px] flex items-center justify-center"><Spinner /></div>
                : <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend align="right" verticalAlign="bottom" layout="vertical" />
                </PieChart>
              </ResponsiveContainer>}
            </CardContent>
          </Card>
          )}

          {(viewMode === "both" || viewMode === "service") && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg mb-0">Monthly Service Trends</CardTitle>
                <div className="flex items-center gap-1">
                  <button onClick={() => shiftMonth(-1)}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-muted-foreground w-28 text-center">
                    {monthlyStats[0]?.month} – {monthlyStats[3]?.month}
                  </span>
                  <button onClick={() => shiftMonth(1)} disabled={isCurrentMonthWindow}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted disabled:opacity-40">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-0">
              {chartsLoading
                ? <div className="h-[250px] flex items-center justify-center"><Spinner /></div>
                : <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyStats} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend align="right" verticalAlign="top" wrapperStyle={{ top: -5 }} />
                  <Bar dataKey="total"     fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} name="Total Calls" />
                  <Bar dataKey="completed" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} name="Completed" />
                </BarChart>
              </ResponsiveContainer>}
            </CardContent>
          </Card>
          )}


        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {(viewMode === "both" || viewMode === "service") && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg mb-0">Calls by Zone</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={zoneStats} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="zone" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(280, 70%, 55%)" radius={[4, 4, 0, 0]} name="Total Calls" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          )}

          {(viewMode === "both" || viewMode === "service") && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Customers Overview</CardTitle>
                <span className="text-sm font-semibold text-foreground">Total: {totalCustomers}</span>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={usersData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                    {usersData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip />
                  <Legend align="right" verticalAlign="bottom" layout="vertical" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          )}

          {(viewMode === "both" || viewMode === "service") && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Engineers Overview</CardTitle>
                <span className="text-sm font-semibold text-foreground">Total: {totalEngineers}</span>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={engineersData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                    {engineersData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip />
                  <Legend align="right" verticalAlign="bottom" layout="vertical" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          )}
        </div>

        {(viewMode === "both" || viewMode === "service") && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Free Materials Usage Overview</h2>
              <p className="text-sm text-muted-foreground">Parts given free per contract type</p>
            </div>

            {chartsLoading ? (
              <div className="flex items-center justify-center h-40"><Spinner /></div>
            ) : freeParts.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  No free parts data found
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {freeParts.map((ct) => (
                  <Card key={ct.contractTypeId?.toString()} className="border-0 shadow-sm">
                    <CardHeader className="pb-0">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{ct.contractTypeName}</CardTitle>
                        <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                          {ct.totalFreeParts} free part{ct.totalFreeParts !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={ct.parts}
                            cx="50%" cy="50%"
                            innerRadius={55} outerRadius={85}
                            paddingAngle={3}
                            dataKey="freeCount"
                            nameKey="machineName"
                            label={({ percentage }) => `${percentage}%`}
                            labelLine={false}
                            style={{ cursor: "pointer" }}
                            onClick={(entry) => {
                              const params = new URLSearchParams({
                                partId:         entry.machineId,
                                contractTypeId: ct.contractTypeId,
                                freeParts:      "yes",
                              });
                              navigate(`/calls?${params.toString()}`);
                            }}
                          >
                            {ct.parts.map((_, i) => (
                              <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number, _: string, entry: any) => [
                              `${value} (${entry.payload.percentage}%)`,
                              entry.payload.machineName,
                            ]}
                          />
                          <Legend
                            layout="vertical"
                            align="right"
                            verticalAlign="middle"
                            formatter={(value) => <span className="text-xs">{value}</span>}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </>
      }
    </div>
  );
};

export default Dashboard;
