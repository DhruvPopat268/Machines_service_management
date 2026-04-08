import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { serviceCalls } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Eye, UserPlus, Edit } from "lucide-react";
import { engineers, type ServiceCall } from "@/data/dummyData";
import { useToast } from "@/hooks/use-toast";
import Spinner from "@/components/Spinner";

interface CallsPageProps {
  statusFilter?: string;
  title?: string;
  description?: string;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const CallsPage = ({ statusFilter, title = "All Service Calls", description = "Manage and track all service calls" }: CallsPageProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [assignDialog, setAssignDialog] = useState<ServiceCall | null>(null);
  const [selectedEngineer, setSelectedEngineer] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  let filtered = serviceCalls;
  if (statusFilter) filtered = filtered.filter((c) => c.status === statusFilter);
  if (filters.status && filters.status !== "all") filtered = filtered.filter((c) => c.status === filters.status);
  if (filters.priority && filters.priority !== "all") filtered = filtered.filter((c) => c.priority === filters.priority);
  if (filters.engineer && filters.engineer !== "all") filtered = filtered.filter((c) => c.engineer === filters.engineer);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((c) =>
      c.id.toLowerCase().includes(s) || c.customer.toLowerCase().includes(s) || c.machine.toLowerCase().includes(s) || c.issue.toLowerCase().includes(s)
    );
  }

  const columns: Column<ServiceCall>[] = [
    { key: "id", label: "Call ID", render: (c) => <span className="font-medium text-foreground">{c.id}</span> },
    { key: "customer", label: "Customer" },
    { key: "machine", label: "Machine" },
    { key: "issue", label: "Issue", render: (c) => <span className="max-w-[200px] truncate block">{c.issue}</span> },
    { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
    { key: "engineer", label: "Engineer", render: (c) => <span className={c.engineer === "Unassigned" ? "text-muted-foreground italic" : ""}>{c.engineer}</span> },
    { key: "priority", label: "Priority", render: (c) => <StatusBadge status={c.priority} /> },
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); navigate(`/calls/${c.id}`); }}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setAssignDialog(c); setSelectedEngineer(c.engineer !== "Unassigned" ? c.engineer : ""); }}>
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const filterConfigs = statusFilter ? [] : [
    {
      key: "status", label: "Status",
      options: [      { label: "Open", value: "Open" }, { label: "Assigned", value: "Assigned" }, { label: "In Progress", value: "In Progress" }, { label: "On Hold", value: "On Hold" }, { label: "Completed", value: "Completed" }, { label: "Cancelled", value: "Cancelled" }],
    },
    {
      key: "priority", label: "Priority",
      options: [{ label: "Low", value: "Low" }, { label: "Medium", value: "Medium" }, { label: "High", value: "High" }, { label: "Critical", value: "Critical" }],
    },
    {
      key: "engineer", label: "Engineer",
      options: engineers.map((e) => ({ label: e.name, value: e.name })),
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title={title} description={description} />
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by ID, customer, machine..."
            filters={filterConfigs}
            filterValues={filters}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
          />
          <DataTable columns={columns} data={filtered} onRowClick={(c) => navigate(`/calls/${c.id}`)} />

          <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Engineer — {assignDialog?.id}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Select Engineer</Label>
                  <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
                    <SelectTrigger><SelectValue placeholder="Choose engineer" /></SelectTrigger>
                    <SelectContent>
                      {engineers.map((e) => (
                        <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
                <Button onClick={() => { toast({ title: "Engineer Assigned", description: `${selectedEngineer} assigned to ${assignDialog?.id}` }); setAssignDialog(null); }}>
                  Assign
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
