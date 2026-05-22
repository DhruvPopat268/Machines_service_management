import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { serviceCallsApi, type ServiceCall } from "@/services/serviceCallsApi";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Eye, UserPlus, Edit, Upload, Download } from "lucide-react";
import { engineers } from "@/data/dummyData";
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
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [assignDialog, setAssignDialog] = useState<ServiceCall | null>(null);
  const [selectedEngineer, setSelectedEngineer] = useState("");

  // Fetch service calls based on status filter
  const { data: serviceCalls = [], isLoading } = useQuery({
    queryKey: ["serviceCalls", statusFilter],
    queryFn: async () => {
      if (!statusFilter) return serviceCallsApi.getAllCalls();
      if (statusFilter === "Open") return serviceCallsApi.getOpenCalls();
      if (statusFilter === "Assigned") return serviceCallsApi.getAssignedCalls();
      if (statusFilter === "In Progress") return serviceCallsApi.getInProgressCalls();
      if (statusFilter === "On Hold") return serviceCallsApi.getOnHoldCalls();
      if (statusFilter === "Completed") return serviceCallsApi.getCompletedCalls();
      if (statusFilter === "Cancelled") return serviceCallsApi.getCancelledCalls();
      return serviceCallsApi.getAllCalls();
    },
  });

  const handleClear = () => {
    setSearch("");
    setFilters({});
    setFromDate("");
    setToDate("");
  };

  let filtered = serviceCalls;
  if (fromDate && toDate) filtered = filtered.filter((c) => c.createdAt.slice(0, 10) >= fromDate && c.createdAt.slice(0, 10) <= toDate);
  if (filters.status && filters.status !== "all") filtered = filtered.filter((c) => c.status === filters.status);
  if (filters.problemType && filters.problemType !== "all") {
    filtered = filtered.filter((c) => c.machines.some(m => m.problemType === filters.problemType));
  }
  if (filters.division && filters.division !== "all") {
    filtered = filtered.filter((c) => c.machines.some(m => m.division === filters.division));
  }
  if (filters.category && filters.category !== "all") {
    filtered = filtered.filter((c) => c.machines.some(m => m.category === filters.category));
  }
  if (filters.engineer && filters.engineer !== "all") {
    filtered = filtered.filter((c) => c.engineerInfo?.name === filters.engineer);
  }
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((c) =>
      c.callId.toLowerCase().includes(s) || 
      c.customerInfo.name.toLowerCase().includes(s) || 
      c.machines.some(m => m.machineName.toLowerCase().includes(s) || m.issueDescription.toLowerCase().includes(s))
    );
  }

  const columns: Column<ServiceCall>[] = [
    { key: "no", label: "No.", render: (_c, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "callId", label: "Call ID", render: (c) => <span className="font-medium text-foreground">{c.callId}</span> },
    { key: "customer", label: "Customer", render: (c) => <span>{c.customerInfo.name}</span> },
    { 
      key: "machine", 
      label: "Machine", 
      render: (c) => (
        <div>
          {c.machines.map((m, i) => (
            <div key={i} className="text-sm">{m.machineName}</div>
          ))}
        </div>
      )
    },
    { 
      key: "division", 
      label: "Division", 
      render: (c) => (
        <div>
          {c.machines.map((m, i) => (
            <div key={i} className="text-sm">{m.division}</div>
          ))}
        </div>
      )
    },
    { 
      key: "category", 
      label: "Category", 
      render: (c) => (
        <div>
          {c.machines.map((m, i) => (
            <div key={i} className="text-sm">{m.category}</div>
          ))}
        </div>
      )
    },
    { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
    { 
      key: "engineer", 
      label: "Engineer", 
      render: (c) => (
        <span className={!c.engineerInfo ? "text-muted-foreground italic" : ""}>
          {c.engineerInfo?.name || "Unassigned"}
        </span>
      )
    },
    { 
      key: "problemType", 
      label: "Problem Type", 
      render: (c) => (
        <div>
          {c.machines.map((m, i) => (
            <div key={i} className="text-sm">{m.problemType || "N/A"}</div>
          ))}
        </div>
      )
    },
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
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setAssignDialog(c); setSelectedEngineer(c.engineerInfo?.name || ""); }}>
              <UserPlus className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const filterConfigs = statusFilter ? [] : [
    {
      key: "status", label: "Status",
      options: [{ label: "Open", value: "Open" }, { label: "Assigned", value: "Assigned" }, { label: "In Progress", value: "In Progress" }, { label: "On Hold", value: "On Hold" }, { label: "Completed", value: "Completed" }, { label: "Cancelled", value: "Cancelled" }],
    },
    {
      key: "problemType", label: "Problem Type",
      options: [{ label: "Mechanical Failure", value: "Mechanical Failure" }, { label: "Electrical Fault", value: "Electrical Fault" }, { label: "Software / Firmware", value: "Software / Firmware" }, { label: "Coolant System", value: "Coolant System" }, { label: "Calibration", value: "Calibration" }, { label: "Hydraulic System", value: "Hydraulic System" }, { label: "Noise / Vibration", value: "Noise / Vibration" }],
    },
    {
      key: "division", label: "Machine Division",
      options: [{ label: "CNC Division", value: "CNC Division" }, { label: "3D Printing Division", value: "3D Printing Division" }, { label: "Laser Division", value: "Laser Division" }, { label: "Welding Division", value: "Welding Division" }, { label: "Hydraulic Division", value: "Hydraulic Division" }],
    },
    {
      key: "category", label: "Machine Category",
      options: [{ label: "Heavy Machinery", value: "Heavy Machinery" }, { label: "Additive Manufacturing", value: "Additive Manufacturing" }, { label: "Cutting Machines", value: "Cutting Machines" }, { label: "Robotics", value: "Robotics" }, { label: "Sheet Metal", value: "Sheet Metal" }],
    },
    {
      key: "engineer", label: "Engineer",
      options: engineers.map((e) => ({ label: e.name, value: e.name })),
    },
  ];

  const statusFilterConfigs = statusFilter ? [
    {
      key: "problemType", label: "Problem Type",
      options: [{ label: "Mechanical Failure", value: "Mechanical Failure" }, { label: "Electrical Fault", value: "Electrical Fault" }, { label: "Software / Firmware", value: "Software / Firmware" }, { label: "Coolant System", value: "Coolant System" }, { label: "Calibration", value: "Calibration" }, { label: "Hydraulic System", value: "Hydraulic System" }, { label: "Noise / Vibration", value: "Noise / Vibration" }],
    },
    {
      key: "division", label: "Machine Division",
      options: [{ label: "CNC Division", value: "CNC Division" }, { label: "3D Printing Division", value: "3D Printing Division" }, { label: "Laser Division", value: "Laser Division" }, { label: "Welding Division", value: "Welding Division" }, { label: "Hydraulic Division", value: "Hydraulic Division" }],
    },
    {
      key: "category", label: "Machine Category",
      options: [{ label: "Heavy Machinery", value: "Heavy Machinery" }, { label: "Additive Manufacturing", value: "Additive Manufacturing" }, { label: "Cutting Machines", value: "Cutting Machines" }, { label: "Robotics", value: "Robotics" }, { label: "Sheet Metal", value: "Sheet Metal" }],
    },
    {
      key: "engineer", label: "Engineer",
      options: engineers.map((e) => ({ label: e.name, value: e.name })),
    },
  ] : [];

  return (
    <div className="space-y-6">
      {isLoading ? <Spinner /> : (
        <>
          <PageHeader title={title} description={description}>
            <Button variant="outline" className="gap-2" disabled><Upload className="h-4 w-4" /> Import</Button>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by call ID, customer, machine..."
            filters={statusFilter ? statusFilterConfigs : filterConfigs}
            filterValues={filters}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
            showDateRange
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onClear={handleClear}
          />
          <DataTable columns={columns} data={filtered} />

          <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Engineer — {assignDialog?.callId}</DialogTitle>
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
                <Button onClick={() => { toast({ title: "Engineer Assigned", description: `${selectedEngineer} assigned to ${assignDialog?.callId}` }); setAssignDialog(null); }}>
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
