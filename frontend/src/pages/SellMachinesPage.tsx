import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { machines, customers, attributes as attributeOptions, machineSales as initialData, MachineSale, machineCategories } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ShoppingCart, Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Spinner from "@/components/Spinner";
import { SearchableSelect } from "@/components/SearchableSelect";

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

interface VariantForm {
  attribute: string;
  price: string;
  discountedPrice: string;
  quantity: string;
}

const emptyVariant = (): VariantForm => ({ attribute: "", price: "", discountedPrice: "", quantity: "" });

const emptyForm = {
  customerId: "",
  categoryId: "",
  machineId: "",
  variants: [emptyVariant()] as VariantForm[],
};

const SellMachinesPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [data, setData] = useState<MachineSale[]>(initialData);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const customerId = params.get("customerId");
    if (customerId) {
      setForm((p) => ({ ...p, customerId }));
      setDialog(true);
    }
  }, [location.search]);

  const selectedMachine = machines.find((m) => m.id === form.machineId);
  const activeCustomers = customers.filter((c) => c.status === "Active");
  const activeCategories = machineCategories.filter((c) => c.status === "Active");
  const activeMachines = machines.filter((m) => m.status === "Active" && (form.categoryId ? m.category === machineCategories.find((c) => c.id === form.categoryId)?.name : true));
  const availableAttributes = attributeOptions.filter((a) => a.status === "Active");

  const setField = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const updateVariant = (vi: number, key: keyof VariantForm, value: string) =>
    setForm((p) => ({ ...p, variants: p.variants.map((v, i) => i === vi ? { ...v, [key]: value } : v) }));

  const addVariant = () => setForm((p) => ({ ...p, variants: [...p.variants, emptyVariant()] }));
  const removeVariant = (vi: number) => setForm((p) => ({ ...p, variants: p.variants.filter((_, i) => i !== vi) }));

  const handleSubmit = () => {
    if (!form.customerId || !form.machineId) {
      toast({ title: "Please select customer and machine", variant: "destructive" });
      return;
    }
    const customer = customers.find((c) => c.id === form.customerId)!;
    const machine = machines.find((m) => m.id === form.machineId)!;
    const newSale: MachineSale = {
      id: `MS-${String(data.length + 1).padStart(3, "0")}`,
      customerId: form.customerId,
      customerName: customer.name,
      machineId: form.machineId,
      machineName: machine.name,
      machineModel: machine.model,
      machineCategory: machine.category,
      variants: form.variants.map((v) => ({
        attribute: v.attribute,
        price: Number(v.price) || 0,
        discountedPrice: Number(v.discountedPrice) || 0,
        quantity: Number(v.quantity) || 0,
      })),
      createdAt: new Date().toISOString(),
    };
    setData((prev) => [newSale, ...prev]);
    toast({ title: "Sale recorded successfully" });
    setDialog(false);
    setForm(emptyForm);
  };

  let filtered = [...data];
  if (filters.customerName && filters.customerName !== "all") filtered = filtered.filter((s) => s.customerName === filters.customerName);
  if (filters.machineCategory && filters.machineCategory !== "all") filtered = filtered.filter((s) => s.machineCategory === filters.machineCategory);
  if (fromDate && toDate) filtered = filtered.filter((s) => s.createdAt.slice(0, 10) >= fromDate && s.createdAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((r) => r.machineName.toLowerCase().includes(s) || r.customerName.toLowerCase().includes(s) || r.machineModel.toLowerCase().includes(s));
  }

  const handleClear = () => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); };

  const customerOptions = [...new Set(data.map((s) => s.customerName))].map((v) => ({ label: v, value: v }));
  const categoryOptions = [...new Set(data.map((s) => s.machineCategory))].map((v) => ({ label: v, value: v }));
  const allCustomerOptions = activeCustomers.map((c) => ({ label: `${c.name} — ${c.contact}`, value: c.id }));

  const columns: Column<MachineSale>[] = [
    { key: "id", label: "No.", render: (_s, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "customerName", label: "Customer", render: (s) => <span className="font-medium">{s.customerName}</span> },
    { key: "machineName", label: "Machine", render: (s) => <span className="font-medium">{s.machineName}</span> },
    { key: "machineModel", label: "Model", render: (s) => <span className="font-mono text-sm">{s.machineModel}</span> },
    { key: "machineCategory", label: "Category", render: (s) => <span className="text-sm">{s.machineCategory}</span> },
    {
      key: "variants", label: "Variants", render: (s) => (
        <div className="space-y-1">
          {s.variants.map((v, i) => (
            <div key={i} className="text-xs flex items-center gap-2">
              {v.attribute && <span className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{v.attribute}</span>}
              <span className="font-medium">₹{v.price.toLocaleString()}</span>
              {v.discountedPrice > 0 && <span className="text-green-600">₹{v.discountedPrice.toLocaleString()}</span>}
              <span className="text-muted-foreground">× {v.quantity}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "createdAt", label: "Sold At", render: (s) => {
        const { date, time } = formatDateTime(s.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader
            title="Sell Machines"
            description="Record machine sales to customers"
            actionLabel="Sell Machine"
            actionIcon={ShoppingCart}
            onAction={() => { setForm(emptyForm); setDialog(true); }}
          >
            <Button variant="outline" className="gap-2" disabled><Upload className="h-4 w-4" /> Import</Button>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by machine name, model or customer..."
            searchableFilters={[
              { key: "customerName", placeholder: "Customer", options: customerOptions },
            ]}
            filters={[
              { key: "machineCategory", label: "Category", options: categoryOptions },
            ]}
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
        </>
      )}

      <Dialog open={dialog} onOpenChange={(open) => { if (!open) { setDialog(false); setForm(emptyForm); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Sell Machine</DialogTitle></DialogHeader>

          <div className="space-y-5 py-2">
            {/* Customer */}
            <div className="space-y-2">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <SearchableSelect
                options={allCustomerOptions}
                value={form.customerId}
                onChange={(v) => setField("customerId", v)}
                placeholder="Select customer"
                searchPlaceholder="Search customer..."
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v, machineId: "" }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {activeCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.categoryId && <p className="text-xs text-muted-foreground">Showing machines in selected category</p>}
            </div>

            {/* Machine */}
            <div className="space-y-2">
              <Label>Machine <span className="text-destructive">*</span></Label>
              <Select value={form.machineId} onValueChange={(v) => setField("machineId", v)}>
                <SelectTrigger><SelectValue placeholder="Select machine" /></SelectTrigger>
                <SelectContent>
                  {activeMachines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name} — {m.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMachine && (
                <p className="text-xs text-muted-foreground">{selectedMachine.division} · {selectedMachine.category}</p>
              )}
            </div>

            {/* Variants */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Variants</Label>
                <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Variant
                </Button>
              </div>
              {form.variants.map((variant, vi) => (
                <div key={vi} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Variant {vi + 1}</span>
                    {form.variants.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeVariant(vi)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Attribute</Label>
                      <Select value={variant.attribute} onValueChange={(v) => updateVariant(vi, "attribute", v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select attribute" /></SelectTrigger>
                        <SelectContent>
                          {availableAttributes.map((a) => (
                            <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Quantity</Label>
                      <Input type="number" placeholder="0" min={1} value={variant.quantity} onChange={(e) => updateVariant(vi, "quantity", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Price (₹) <span className="text-destructive">*</span></Label>
                      <Input type="number" placeholder="0" min={0} value={variant.price} onChange={(e) => updateVariant(vi, "price", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Discounted Price (₹)</Label>
                      <Input type="number" placeholder="0" min={0} value={variant.discountedPrice} onChange={(e) => updateVariant(vi, "discountedPrice", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(false); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleSubmit}>Record Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SellMachinesPage;
