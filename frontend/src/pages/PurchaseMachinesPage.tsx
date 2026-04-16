import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { machines, vendors, attributes as attributeOptions, machinePurchases as initialData, MachinePurchase, machineCategories } from "@/data/dummyData";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ShoppingBag, Upload, Download } from "lucide-react";
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
  vendorId: "",
  machineId: "",
  categoryId: "",
  addToInventory: true,
  variants: [emptyVariant()] as VariantForm[],
};

const PurchaseMachinesPage = () => {
  const { toast } = useToast();
  const location = useLocation();
  const [data, setData] = useState<MachinePurchase[]>(initialData);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [vendorSearch, setVendorSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const vendorId = params.get("vendorId");
    if (vendorId) {
      setForm((p) => ({ ...p, vendorId }));
      setDialog(true);
    }
  }, [location.search]);

  const selectedMachine = machines.find((m) => m.id === form.machineId);
  const activeVendors = vendors.filter((v) => v.status === "Active");
  const activeCategories = machineCategories.filter((c) => c.status === "Active");
  const activeMachines = machines.filter((m) => m.status === "Active" && (form.categoryId ? m.category === machineCategories.find((c) => c.id === form.categoryId)?.name : true));
  const availableAttributes = attributeOptions.filter((a) => a.status === "Active");

  const setField = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const updateVariant = (vi: number, key: keyof VariantForm, value: string) =>
    setForm((p) => ({ ...p, variants: p.variants.map((v, i) => i === vi ? { ...v, [key]: value } : v) }));

  const addVariant = () => setForm((p) => ({ ...p, variants: [...p.variants, emptyVariant()] }));
  const removeVariant = (vi: number) => setForm((p) => ({ ...p, variants: p.variants.filter((_, i) => i !== vi) }));

  const handleSubmit = () => {
    if (!form.vendorId || !form.machineId) {
      toast({ title: "Please select vendor and machine", variant: "destructive" });
      return;
    }
    const vendor = vendors.find((v) => v.id === form.vendorId)!;
    const machine = machines.find((m) => m.id === form.machineId)!;
    const newPurchase: MachinePurchase = {
      id: `MP-${String(data.length + 1).padStart(3, "0")}`,
      vendorId: form.vendorId,
      vendorName: vendor.companyName,
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
      addToInventory: form.addToInventory,
      createdAt: new Date().toISOString(),
    };
    setData((prev) => [newPurchase, ...prev]);
    toast({ title: "Purchase recorded successfully" });
    setDialog(false);
    setForm(emptyForm);
  };

  let filtered = [...data];
  if (filters.vendorName && filters.vendorName !== "all") filtered = filtered.filter((p) => p.vendorName === filters.vendorName);
  if (filters.machineCategory && filters.machineCategory !== "all") filtered = filtered.filter((p) => p.machineCategory === filters.machineCategory);
  if (filters.addToInventory && filters.addToInventory !== "all") filtered = filtered.filter((p) => String(p.addToInventory) === filters.addToInventory);
  if (fromDate && toDate) filtered = filtered.filter((p) => p.createdAt.slice(0, 10) >= fromDate && p.createdAt.slice(0, 10) <= toDate);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((p) => p.machineName.toLowerCase().includes(s) || p.vendorName.toLowerCase().includes(s) || p.machineModel.toLowerCase().includes(s));
  }

  const handleClear = () => { setSearch(""); setFilters({}); setFromDate(""); setToDate(""); };

  const vendorOptions = [...new Set(data.map((p) => p.vendorName))].map((v) => ({ label: v, value: v }));
  const allVendorOptions = activeVendors.map((v) => ({ label: `${v.companyName} — ${v.name}`, value: v.id }));
  const filteredVendorOptions = vendorOptions.filter((v) => v.label.toLowerCase().includes(vendorSearch.toLowerCase()));
  const categoryFilterOptions = [...new Set(data.map((p) => p.machineCategory))].map((v) => ({ label: v, value: v }));

  const columns: Column<MachinePurchase>[] = [
    { key: "id", label: "No.", render: (_p, i) => <span className="font-medium text-foreground">{i + 1}</span> },
    { key: "vendorName", label: "Vendor", render: (p) => <span className="font-medium">{p.vendorName}</span> },
    { key: "machineName", label: "Machine", render: (p) => <span className="font-medium">{p.machineName}</span> },
    { key: "machineModel", label: "Model", render: (p) => <span className="font-mono text-sm">{p.machineModel}</span> },
    { key: "machineCategory", label: "Category", render: (p) => <span className="text-sm">{p.machineCategory}</span> },
    {
      key: "variants", label: "Variants", render: (p) => (
        <div className="space-y-1">
          {p.variants.map((v, i) => (
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
      key: "addToInventory", label: "Added to Inventory", render: (p) => (
        <span className={p.addToInventory ? "text-green-600 text-sm font-medium" : "text-muted-foreground text-sm"}>
          {p.addToInventory ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "createdAt", label: "Purchased At", render: (p) => {
        const { date, time } = formatDateTime(p.createdAt);
        return <div><p className="text-sm">{date}</p><p className="text-xs text-muted-foreground">{time}</p></div>;
      },
    },
    {
      key: "actions", label: "Actions", render: (p) => !p.addToInventory ? (
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => {
          setData((prev) => prev.map((r) => r.id === p.id ? { ...r, addToInventory: true } : r));
          toast({ title: "Added to inventory", description: `${p.machineName} variants added to inventory` });
        }}>
          <Plus className="h-3 w-3" /> Add to Inventory
        </Button>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? <Spinner /> : (
        <>
          <PageHeader
            title="Purchase Machines"
            description="Record machine purchases from vendors"
            actionLabel="Purchase Machine"
            actionIcon={ShoppingBag}
            onAction={() => { setForm(emptyForm); setDialog(true); }}
          >
            <Button variant="outline" className="gap-2" disabled><Upload className="h-4 w-4" /> Import</Button>
            <Button variant="outline" className="gap-2" disabled><Download className="h-4 w-4" /> Export</Button>
          </PageHeader>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by machine name, model or vendor..."
            searchableFilters={[
              { key: "vendorName", placeholder: "Vendor", options: vendorOptions },
            ]}
            filters={[
              { key: "machineCategory", label: "Category", options: categoryFilterOptions },
              { key: "addToInventory", label: "Added to Inventory", options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }] },
            ]}
            filterValues={filters}
            onFilterChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))
            }
            showDateRange
            fromDate={fromDate}
            toDate={toDate}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onClear={() => { handleClear(); }}
          />
          <DataTable columns={columns} data={filtered} />
        </>
      )}

      <Dialog open={dialog} onOpenChange={(open) => { if (!open) { setDialog(false); setForm(emptyForm); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Purchase Machine</DialogTitle></DialogHeader>

          <div className="space-y-5 py-2">
            {/* Vendor */}
            <div className="space-y-2">
              <Label>Vendor <span className="text-destructive">*</span></Label>
              <SearchableSelect
                options={allVendorOptions}
                value={form.vendorId}
                onChange={(v) => setField("vendorId", v)}
                placeholder="Select vendor"
                searchPlaceholder="Search vendor..."
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

            {/* Add to Inventory toggle */}
            <div className="flex items-center justify-between border rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium">Add to Inventory</p>
                <p className="text-xs text-muted-foreground">Automatically update machine stock after purchase</p>
              </div>
              <Switch checked={form.addToInventory} onCheckedChange={(v) => setField("addToInventory", v)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(false); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={handleSubmit}>Record Purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseMachinesPage;
