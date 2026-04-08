import { useState, useEffect } from "react";
import { engineers as initialEngineers, serviceCalls } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { User } from "@/data/dummyData";
import Spinner from "@/components/Spinner";
import { useToast } from "@/hooks/use-toast";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const EngineersPage = () => {
  const { toast } = useToast();
  const [data, setData] = useState<User[]>(initialEngineers);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const toggleStatus = (id: string) => {
    setData((prev) => prev.map((u) => u.id === id ? { ...u, status: u.status === "Active" ? "Inactive" : "Active" } : u));
    toast({ title: "Status updated" });
  };
  const columns: Column<User>[] = [
    { key: "name", label: "Name", render: (u) => <span className="font-medium">{u.name}</span> },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    {
      key: "activeCalls", label: "Active Calls", render: (u) => {
        const count = serviceCalls.filter((c) => c.engineer === u.name && c.status !== "Completed").length;
        return <span className="font-medium">{count}</span>;
      },
    },
    {
      key: "completedCalls", label: "Completed", render: (u) => {
        const count = serviceCalls.filter((c) => c.engineer === u.name && c.status === "Completed").length;
        return <span className="font-medium text-success">{count}</span>;
      },
    },
    {
      key: "status", label: "Status", render: (u) => (
        <div className="flex items-center gap-2">
          <Switch checked={u.status === "Active"} onCheckedChange={() => toggleStatus(u.id)} />
          <span className={u.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
            {u.status}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt", label: "Created At", render: (u) => {
        const { date, time } = formatDateTime(u.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "updatedAt", label: "Updated At", render: (u) => {
        const { date, time } = formatDateTime(u.updatedAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Engineers" description="Manage and monitor field engineers" />
          <DataTable columns={columns} data={data} />
        </>
      )}
    </div>
  );
};

export default EngineersPage;
