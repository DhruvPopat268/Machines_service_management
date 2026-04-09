import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/StatsCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PhoneCall, AlertCircle, UserCog, Package, IndianRupee, Users } from "lucide-react";
import { serviceCalls, purchases, users, customers, machines } from "@/data/dummyData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Spinner from "@/components/Spinner";

const allMonthlyData = [
  { month: "Jan", calls: 18, resolved: 15, profit: 320000 },
  { month: "Feb", calls: 24, resolved: 20, profit: 510000 },
  { month: "Mar", calls: 30, resolved: 28, profit: 780000 },
  { month: "Apr", calls: 12, resolved: 4, profit: 210000 },
];

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dateMode, setDateMode] = useState<"all" | "custom">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const filteredCalls = dateMode === "custom" && fromDate && toDate
    ? serviceCalls.filter((c) => c.createdDate >= fromDate && c.createdDate <= toDate)
    : serviceCalls;

  const statusData = [
    { name: "Open", value: filteredCalls.filter((c) => c.status === "Open").length, color: "hsl(38, 92%, 50%)" },
    { name: "Assigned", value: filteredCalls.filter((c) => c.status === "Assigned").length, color: "hsl(199, 89%, 48%)" },
    { name: "In Progress", value: filteredCalls.filter((c) => c.status === "In Progress").length, color: "hsl(217, 91%, 50%)" },
    { name: "On Hold", value: filteredCalls.filter((c) => c.status === "On Hold").length, color: "hsl(38, 92%, 65%)" },
    { name: "Completed", value: filteredCalls.filter((c) => c.status === "Completed").length, color: "hsl(142, 71%, 45%)" },
    { name: "Cancelled", value: filteredCalls.filter((c) => c.status === "Cancelled").length, color: "hsl(0, 84%, 60%)" },
  ];

  const monthlyData = allMonthlyData;

  const totalProfit = dateMode === "custom" && fromDate && toDate
    ? purchases.filter((p) => p.purchaseDate >= fromDate && p.purchaseDate <= toDate).reduce((sum, p) => sum + p.price, 0)
    : purchases.reduce((sum, p) => sum + p.price, 0);

  const stats = [
    { label: "Total Revenue", value: `₹${totalProfit.toLocaleString()}`, icon: IndianRupee, colorClass: "text-success bg-success/10" },
    { label: "Total Calls", value: filteredCalls.length, icon: PhoneCall, colorClass: "text-primary bg-accent" },
    { label: "Completed Calls", value: filteredCalls.filter((c) => c.status === "Completed").length, icon: PhoneCall, colorClass: "text-success bg-success/10" },
    { label: "Active Engineers", value: users.filter((u) => u.role === "Engineer" && u.status === "Active").length, icon: UserCog, colorClass: "text-primary bg-accent" },
    { label: "Low Stock Machines", value: machines.filter((m) => m.stockStatus === "Low Stock" || m.stockStatus === "Out of Stock").length, icon: Package, colorClass: "text-destructive bg-destructive/10" },
  ];

  const callStats = [
    { label: "Open Calls", value: filteredCalls.filter((c) => c.status === "Open").length, icon: AlertCircle, colorClass: "text-warning bg-warning/10" },
    { label: "Assigned Calls", value: filteredCalls.filter((c) => c.status === "Assigned").length, icon: UserCog, colorClass: "text-info bg-info/10" },
    { label: "In Progress", value: filteredCalls.filter((c) => c.status === "In Progress").length, icon: PhoneCall, colorClass: "text-primary bg-accent" },
    { label: "On Hold", value: filteredCalls.filter((c) => c.status === "On Hold").length, icon: AlertCircle, colorClass: "text-warning bg-warning/10" },
    { label: "Cancelled", value: filteredCalls.filter((c) => c.status === "Cancelled").length, icon: AlertCircle, colorClass: "text-destructive bg-destructive/10" },
  ];

  const recentCalls = filteredCalls.slice(0, 5);

  const usersData = [
    { name: "Active", value: customers.filter((c) => c.status === "Active").length, fill: "hsl(142, 71%, 45%)" },
    { name: "Inactive", value: customers.filter((c) => c.status === "Inactive").length, fill: "hsl(0, 84%, 60%)" },
  ];

  const engineersData = [
    { name: "Active", value: users.filter((u) => u.role === "Engineer" && u.status === "Active").length, fill: "hsl(142, 71%, 45%)" },
    { name: "Inactive", value: users.filter((u) => u.role === "Engineer" && u.status === "Inactive").length, fill: "hsl(0, 84%, 60%)" },
  ];
  const totalEngineers = users.filter((u) => u.role === "Engineer").length;

  return (
    <div className="space-y-6">
      {loading && <Spinner />}
      {!loading && <>
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
          {stats.map((stat) => (
            <StatsCard key={stat.label} {...stat} />
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {callStats.map((stat) => (
            <StatsCard key={stat.label} {...stat} />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 xl:[grid-template-columns:30%_1fr_1fr]">
          <Card className="border-0 shadow-sm md:col-span-2 xl:col-span-1">
            <CardHeader><CardTitle className="text-lg">Calls by Status</CardTitle></CardHeader>
            <CardContent className="pr-0">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend align="right" verticalAlign="bottom" layout="vertical" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            {/* Reduce bottom padding of header */}
            <CardHeader className="pb-2">
              <CardTitle className="text-lg mb-0">
                Monthly Service Trends
              </CardTitle>
            </CardHeader>

            {/* Remove unnecessary padding */}
            <CardContent className="pt-0 pb-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={allMonthlyData}
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }} // 🔥 key change
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend align="right" verticalAlign="top" wrapperStyle={{ top: -5 }} /> {/* slight push up */}

                  <Bar
                    dataKey="calls"
                    fill="hsl(217, 91%, 50%)"
                    radius={[4, 4, 0, 0]}
                    name="Total Calls"
                  />
                  <Bar
                    dataKey="resolved"
                    fill="hsl(142, 71%, 45%)"
                    radius={[4, 4, 0, 0]}
                    name="Resolved"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            {/* Reduce header spacing */}
            <CardHeader className="pb-2">
              <CardTitle className="text-lg mb-0">
                Monthly Profit
              </CardTitle>
            </CardHeader>

            {/* Remove top padding */}
            <CardContent className="pt-0 pb-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={allMonthlyData}
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }} // 🔥 pull chart up
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis
                    className="text-xs"
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `₹${value.toLocaleString()}`,
                      "Profit",
                    ]}
                  />

                  {/* Move legend slightly up */}
                  <Legend align="right" verticalAlign="top" wrapperStyle={{ top: -5 }} />

                  <Bar
                    dataKey="profit"
                    fill="hsl(142, 71%, 45%)"
                    radius={[4, 4, 0, 0]}
                    name="Profit"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Customers Overview</CardTitle>
                <span className="text-sm font-semibold text-foreground">Total Customers: {customers.length}</span>
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

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Engineers Overview</CardTitle>
                <span className="text-sm font-semibold text-foreground">Total Engineers: {totalEngineers}</span>
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

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Recent Service Calls</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Call ID</th>
                      <th className="pb-3 font-medium">Customer</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Problem Type</th>
                      <th className="pb-3 font-medium">Engineer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCalls.map((call) => (
                      <tr key={call.id} className="border-b last:border-0">
                        <td className="py-3 font-medium text-foreground">{call.id}</td>
                        <td className="py-3">{call.customer}</td>
                        <td className="py-3"><StatusBadge status={call.status} /></td>
                        <td className="py-3">{call.problemType}</td>
                        <td className="py-3 text-muted-foreground">{call.engineer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
      }
    </div>
  );
};

export default Dashboard;
