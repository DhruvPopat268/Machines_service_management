import { useState, useEffect } from "react";
import { users } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserPlus, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@/data/dummyData";
import Spinner from "@/components/Spinner";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

const UsersPage = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [addDialog, setAddDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const [data, setData] = useState<User[]>(users);

  const toggleStatus = (id: string) => {
    setData((prev) => prev.map((u) => u.id === id ? { ...u, status: u.status === "Active" ? "Inactive" : "Active" } : u));
    toast({ title: "Status updated" });
  };

  let filtered = [...data];
  if (filters.role && filters.role !== "all") filtered = filtered.filter((u) => u.role === filters.role);
  if (filters.status && filters.status !== "all") filtered = filtered.filter((u) => u.status === filters.status);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }

  const columns: Column<User>[] = [
    { key: "id", label: "ID", render: (u) => <span className="font-medium text-foreground">{u.id}</span> },
    { key: "name", label: "Name", render: (u) => <span className="font-medium">{u.name}</span> },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "role", label: "Role", render: (u) => <StatusBadge status={u.role} /> },
    {
      key: "status", label: "Status", render: (u) => (
        <div className="flex items-center gap-2">
          <Switch checked={u.status === "Active"} onCheckedChange={() => toggleStatus(u.id)} />
          <span className={u.status === "Active" ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>{u.status}</span>
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
    {
      key: "actions", label: "Actions", render: () => (
        <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Panel Users" description="Manage system users and roles" actionLabel="Add User" actionIcon={UserPlus} onAction={() => setAddDialog(true)} />
          <FilterBar
            searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search users..."
            filters={[
              { key: "role", label: "Role", options: [{ label: "Admin", value: "Admin" }, { label: "Engineer", value: "Engineer" }, { label: "Support", value: "Support" }] },
              { key: "status", label: "Status", options: [{ label: "Active", value: "Active" }, { label: "Inactive", value: "Inactive" }] },
            ]}
            filterValues={filters}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
          />
          <DataTable columns={columns} data={filtered} />
        </>
      )}

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Full Name</Label><Input placeholder="Enter name" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="Enter email" /></div>
            <div className="space-y-2"><Label>Phone</Label><Input placeholder="Enter phone" /></div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admin">Admin</SelectItem>
                  <SelectItem value="Engineer">Engineer</SelectItem>
                  <SelectItem value="Support">Support</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={() => { toast({ title: "User Added" }); setAddDialog(false); }}>Add User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
