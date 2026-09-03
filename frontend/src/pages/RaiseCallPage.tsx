import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { SearchableSelect } from "@/components/SearchableSelect";
import { DataTable, Column } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import { X, Search, PhoneCall, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/axiosInterceptor";

interface DropdownOption { _id: string; name: string; }

interface ContractType { _id: string; name: string; }

interface CustomerMachine {
  customerInfo: { customerId: string; name: string; phone: string; email: string; address: string };
  machineId: string;
  machineName: string;
  modelNumber: string;
  categoryId: string;
  category: string;
  divisionId: string;
  division: string;
  images: string[];
  serialNumber: string;
  contractType: { name: string; validFrom: string; validTo: string };
  disInstalled: boolean;
}

const LIMIT = 10;

const RaiseCallPage = () => {
  const navigate = useNavigate();

  const [machines, setMachines] = useState<CustomerMachine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [customers, setCustomers]       = useState<DropdownOption[]>([]);
  const [categories, setCategories]     = useState<DropdownOption[]>([]);
  const [divisions, setDivisions]       = useState<DropdownOption[]>([]);
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);

  const [selectedCustomer, setSelectedCustomer]         = useState("");
  const [selectedCategory, setSelectedCategory]         = useState("");
  const [selectedDivision, setSelectedDivision]         = useState("");
  const [selectedContractType, setSelectedContractType] = useState("");
  const [selectedDisInstalled, setSelectedDisInstalled] = useState("");
  const [search, setSearch]           = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Renew contract state
  const [renewDialog, setRenewDialog]           = useState<CustomerMachine | null>(null);
  const [renewContractTypes, setRenewContractTypes] = useState<ContractType[]>([]);
  const [renewContractTypeId, setRenewContractTypeId] = useState("");
  const [renewValidFrom, setRenewValidFrom]     = useState("");
  const [renewValidTo, setRenewValidTo]         = useState("");
  const [renewing, setRenewing]                 = useState(false);

  // Add contract state
  const [addContractDialog, setAddContractDialog] = useState<CustomerMachine | null>(null);
  const [addContractTypeId, setAddContractTypeId] = useState("");
  const [addValidFrom, setAddValidFrom]           = useState("");
  const [addValidTo, setAddValidTo]               = useState("");
  const [adding, setAdding]                       = useState(false);

  const customerAbortRef = useRef<AbortController | null>(null);
  const categoryAbortRef = useRef<AbortController | null>(null);
  const divisionAbortRef = useRef<AbortController | null>(null);
  const contractTypeAbortRef = useRef<AbortController | null>(null);
  const abortRef         = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    Promise.all([
      api.get("/admin/customers", { params: { limit: 100 } }),
      api.get("/admin/machine-categories", { params: { limit: 100 } }),
      api.get("/admin/machine-divisions", { params: { limit: 100 } }),
      api.get("/admin/contract-types", { params: { limit: 100, status: "Active" } }),
    ]).then(([c, cat, div, ct]) => {
      setCustomers(c.data.data);
      setCategories(cat.data.data);
      setDivisions(div.data.data);
      setContractTypes(ct.data.data);
      setRenewContractTypes(ct.data.data);
    }).catch(() => {});
  }, []);

  const fetchCustomerOptions = useCallback(async (q: string) => {
    customerAbortRef.current?.abort();
    const ctrl = new AbortController();
    customerAbortRef.current = ctrl;
    try {
      const res = await api.get("/admin/customers", { params: { limit: 100, search: q }, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setCustomers(res.data.data);
    } catch {}
  }, []);

  const fetchCategoryOptions = useCallback(async (q: string) => {
    categoryAbortRef.current?.abort();
    const ctrl = new AbortController();
    categoryAbortRef.current = ctrl;
    try {
      const res = await api.get("/admin/machine-categories", { params: { limit: 100, search: q }, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setCategories(res.data.data);
    } catch {}
  }, []);

  const fetchDivisionOptions = useCallback(async (q: string) => {
    divisionAbortRef.current?.abort();
    const ctrl = new AbortController();
    divisionAbortRef.current = ctrl;
    try {
      const res = await api.get("/admin/machine-divisions", { params: { limit: 100, search: q }, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setDivisions(res.data.data);
    } catch {}
  }, []);

  const fetchContractTypeOptions = useCallback(async (q: string) => {
    contractTypeAbortRef.current?.abort();
    const ctrl = new AbortController();
    contractTypeAbortRef.current = ctrl;
    try {
      const res = await api.get("/admin/contract-types", { params: { limit: 100, search: q, status: "Active" }, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setContractTypes(res.data.data);
    } catch {}
  }, []);

  const fetchMachines = useCallback(async (page = 1) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
      if (selectedCustomer) params.customerId = selectedCustomer;
      if (debouncedSearch)  params.search = debouncedSearch;
      if (selectedCategory) params.category = selectedCategory;
      if (selectedDivision) params.division = selectedDivision;
      if (selectedContractType) params.contractTypeId = selectedContractType;
      if (selectedDisInstalled) params.disInstalled = selectedDisInstalled;

      const res = await api.get("/admin/service-calls/customer-machines", { params, signal: ctrl.signal });
      if (!ctrl.signal.aborted) {
        setMachines(res.data.data);
        setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages, total: res.data.pagination.total });
      }
    } catch (err: any) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
        toast.error("Failed to fetch machines");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [selectedCustomer, debouncedSearch, selectedCategory, selectedDivision, selectedContractType, selectedDisInstalled]);

  useEffect(() => { fetchMachines(1); }, [fetchMachines]);

  const hasFilters = selectedCustomer || selectedCategory || selectedDivision || selectedContractType || selectedDisInstalled || search;

  const clearFilters = () => {
    setSelectedCustomer("");
    setSelectedCategory("");
    setSelectedDivision("");
    setSelectedContractType("");
    setSelectedDisInstalled("");
    setSearch("");
  };

  const openRenewDialog = (m: CustomerMachine) => {
    setRenewDialog(m);
    setRenewContractTypeId("");
    setRenewValidFrom("");
    setRenewValidTo("");
  };

  const handleRenew = async () => {
    if (!renewDialog) return;
    if (!renewContractTypeId) { toast.error("Select a contract type"); return; }
    if (!renewValidFrom)      { toast.error("Select valid from date"); return; }
    if (!renewValidTo)        { toast.error("Select valid to date"); return; }
    if (renewValidTo <= renewValidFrom) { toast.error("Valid To must be after Valid From"); return; }
    setRenewing(true);
    try {
      await api.patch("/admin/sales/renew-contract", {
        serialNumber:      renewDialog.serialNumber,
        modelNumber:       renewDialog.modelNumber,
        newContractTypeId: renewContractTypeId,
        newValidFrom:      renewValidFrom,
        newValidTo:        renewValidTo,
      });
      toast.success("Contract renewed successfully");
      setRenewDialog(null);
      fetchMachines(pagination.page);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to renew contract");
    } finally {
      setRenewing(false);
    }
  };

  const openAddContractDialog = (m: CustomerMachine) => {
    setAddContractDialog(m);
    setAddContractTypeId("");
    setAddValidFrom("");
    setAddValidTo("");
  };

  const handleAddContract = async () => {
    if (!addContractDialog) return;
    if (!addContractTypeId) { toast.error("Select a contract type"); return; }
    if (!addValidFrom)      { toast.error("Select valid from date"); return; }
    if (!addValidTo)        { toast.error("Select valid to date"); return; }
    if (addValidTo <= addValidFrom) { toast.error("Valid To must be after Valid From"); return; }
    setAdding(true);
    try {
      await api.patch("/admin/sales/add-contract", {
        serialNumber:   addContractDialog.serialNumber,
        modelNumber:    addContractDialog.modelNumber,
        contractTypeId: addContractTypeId,
        validFrom:      addValidFrom,
        validTo:        addValidTo,
      });
      toast.success("Contract added successfully");
      setAddContractDialog(null);
      fetchMachines(pagination.page);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to add contract");
    } finally {
      setAdding(false);
    }
  };

  const columns: Column<CustomerMachine>[] = [
    {
      key: "no", label: "#",
      render: (_m, i) => <span className="font-medium text-foreground">{(pagination.page - 1) * LIMIT + i + 1}</span>,
    },
    {
      key: "customerInfo", label: "Customer Info",
      render: (m) => (
        <div>
          <p className="font-medium">{m.customerInfo?.name}</p>
          <p className="text-xs text-muted-foreground">{m.customerInfo?.phone}</p>
          <p className="text-xs text-muted-foreground">{m.customerInfo?.email}</p>
        </div>
      ),
    },
    {
      key: "machineName", label: "Machine Name",
      render: (m) => <span className="font-medium">{m.machineName}</span>,
    },
    {
      key: "modelNumber", label: "Model Number",
      render: (m) => <span className="font-mono text-sm">{m.modelNumber || "—"}</span>,
    },
    {
      key: "serialNumber", label: "Serial Number",
      render: (m) => <span>{m.serialNumber || "—"}</span>,
    },
    {
      key: "category", label: "Category",
      render: (m) => <span>{m.category || "—"}</span>,
    },
    {
      key: "division", label: "Division",
      render: (m) => <span>{m.division || "—"}</span>,
    },
    {
      key: "contractType", label: "Contract Type",
      render: (m) => {
        const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); nowIST.setHours(0, 0, 0, 0);
        const validToIST = m.contractType?.validTo ? new Date(new Date(m.contractType.validTo).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })) : null;
        const isExpired = validToIST ? nowIST > validToIST : false;
        return (
          <div>
            <span>{m.contractType?.name || "—"}</span>
            {m.contractType?.name && (
              <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${ isExpired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700" }`}>
                {isExpired ? "Expired" : "Active"}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "validFrom", label: "Valid From",
      render: (m) => m.contractType?.validFrom
        ? new Date(m.contractType.validFrom).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" })
        : "—",
    },
    {
      key: "validTo", label: "Valid To",
      render: (m) => m.contractType?.validTo
        ? new Date(m.contractType.validTo).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" })
        : "—",
    },
    {
      key: "disInstalled", label: "Dis-Installed",
      render: (m) => m.disInstalled
        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">Yes</span>
        : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">No</span>,
    },
    {
      key: "actions", label: "Actions",
      render: (m) => {
        const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); nowIST.setHours(0, 0, 0, 0);
        const validToIST = m.contractType?.validTo ? new Date(new Date(m.contractType.validTo).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })) : null;
        const isExpired = validToIST ? nowIST > validToIST : false;
        return (
          <div className="flex items-center gap-1">
            {!m.disInstalled && isExpired && (
              <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={() => openRenewDialog(m)}>
                <RefreshCw className="h-3.5 w-3.5" /> Renew Contract
              </Button>
            )}
            {!m.disInstalled && !m.contractType?.name && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-yellow-400 hover:bg-yellow-500 border-yellow-400 text-black" onClick={() => openAddContractDialog(m)}>
                <RefreshCw className="h-3.5 w-3.5" /> Add Contract
              </Button>
            )}
            {!m.disInstalled && (
              <Button size="sm" className="h-8 gap-1.5" onClick={() => navigate(`/calls/raise/detail?serialNumber=${encodeURIComponent(m.serialNumber)}&modelNumber=${encodeURIComponent(m.modelNumber)}`)}>
                <PhoneCall className="h-3.5 w-3.5" /> Raise Call
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Raise a Call" description="Select a machine by serial number to raise a service call" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by serial no, name or mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchableSelect
            options={customers.map(c => ({ label: c.name, value: c._id }))}
            value={selectedCustomer}
            onChange={setSelectedCustomer}
            onSearchChange={fetchCustomerOptions}
            placeholder="Customer"
            searchPlaceholder="Search customers..."
            className="w-[160px] h-9 text-sm"
          />
          <SearchableSelect
            options={categories.map(c => ({ label: c.name, value: c._id }))}
            value={selectedCategory}
            onChange={setSelectedCategory}
            onSearchChange={fetchCategoryOptions}
            placeholder="Category"
            searchPlaceholder="Search categories..."
            className="w-[160px] h-9 text-sm"
          />
          <SearchableSelect
            options={divisions.map(d => ({ label: d.name, value: d._id }))}
            value={selectedDivision}
            onChange={setSelectedDivision}
            onSearchChange={fetchDivisionOptions}
            placeholder="Division"
            searchPlaceholder="Search divisions..."
            className="w-[160px] h-9 text-sm"
          />
          <SearchableSelect
            options={contractTypes.map(ct => ({ label: ct.name, value: ct._id }))}
            value={selectedContractType}
            onChange={setSelectedContractType}
            onSearchChange={fetchContractTypeOptions}
            placeholder="Contract Type"
            searchPlaceholder="Search contract types..."
            className="w-[160px] h-9 text-sm"
          />
          <Select value={selectedDisInstalled} onValueChange={setSelectedDisInstalled}>
            <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Dis-Installed" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="false">No</SelectItem>
              <SelectItem value="true">Yes</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="h-9">
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

      {loading ? <Spinner /> : <DataTable columns={columns} data={machines} />}

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        pageSize={LIMIT}
        onPageChange={fetchMachines}
      />

      <Dialog open={!!renewDialog} onOpenChange={() => setRenewDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renew Contract — {renewDialog?.serialNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Contract Type</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={renewContractTypeId}
                onChange={e => setRenewContractTypeId(e.target.value)}
              >
                <option value="">Select contract type...</option>
                {renewContractTypes.map(ct => <option key={ct._id} value={ct._id}>{ct.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Valid From</Label>
              <Input type="date" value={renewValidFrom} onChange={e => setRenewValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valid To</Label>
              <Input type="date" value={renewValidTo} onChange={e => setRenewValidTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialog(null)}>Cancel</Button>
            <Button onClick={handleRenew} disabled={renewing}>
              {renewing ? "Renewing..." : "Renew"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addContractDialog} onOpenChange={() => setAddContractDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Contract — {addContractDialog?.serialNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Contract Type</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={addContractTypeId}
                onChange={e => setAddContractTypeId(e.target.value)}
              >
                <option value="">Select contract type...</option>
                {contractTypes.map(ct => <option key={ct._id} value={ct._id}>{ct.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Valid From</Label>
              <Input type="date" value={addValidFrom} onChange={e => setAddValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valid To</Label>
              <Input type="date" value={addValidTo} onChange={e => setAddValidTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContractDialog(null)}>Cancel</Button>
            <Button onClick={handleAddContract} disabled={adding}>
              {adding ? "Adding..." : "Add Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RaiseCallPage;
