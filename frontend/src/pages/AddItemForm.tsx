import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, Plus, Trash2, ImagePlus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { machineCategories, machineDivisions, attributes as attributeOptions } from "@/data/dummyData";

const contractTypes = [
  { id: "CT-001", name: "Warranty", code: "WTY" },
  { id: "CT-002", name: "Comprehensive Maintenance Contract", code: "CMC" },
  { id: "CT-003", name: "Non-Comprehensive Maintenance Contract", code: "NCMC" },
  { id: "CT-004", name: "On-Call Service", code: "OCS" },
  { id: "CT-005", name: "Parts Only Contract", code: "POC" },
];

interface Variant {
  attributes: { attributeId: string }[];
  price: string;
  discountedPrice: string;
  stock: string;
}

const emptyVariant = (): Variant => ({
  attributes: [{ attributeId: "" }],
  price: "",
  discountedPrice: "",
  stock: "",
});

interface AddItemFormProps {
  type: "Machine" | "Accessory";
}

const AddItemForm = ({ type }: AddItemFormProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "", modelNumber: "", serialNumber: "",
    category: "", division: "", contractType: "",
    hsnCode: "", gstPercentage: "", partCode: "",
    status: "true", notes: "",
  });
  const [variants, setVariants] = useState<Variant[]>([emptyVariant()]);

  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImages((prev) => {
      const remaining = 5 - prev.length;
      if (remaining <= 0) return prev;
      const newImages = files.slice(0, remaining).map((file) => ({ file, preview: URL.createObjectURL(file) }));
      return [...prev, ...newImages];
    });
    e.target.value = "";
  };

  const removeImage = (idx: number) => {
    setImages((prev) => { URL.revokeObjectURL(prev[idx].preview); return prev.filter((_, i) => i !== idx); });
  };

  const setField = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const updateVariant = (vi: number, key: keyof Variant, value: string) =>
    setVariants((prev) => prev.map((v, i) => i === vi ? { ...v, [key]: value } : v));

  const updateAttr = (vi: number, ai: number, value: string) =>
    setVariants((prev) => prev.map((v, i) => i !== vi ? v : {
      ...v,
      attributes: v.attributes.map((a, j) => j === ai ? { attributeId: value } : a),
    }));

  const addAttr = (vi: number) =>
    setVariants((prev) => prev.map((v, i) => i === vi ? { ...v, attributes: [...v.attributes, { attributeId: "" }] } : v));

  const removeAttr = (vi: number, ai: number) =>
    setVariants((prev) => prev.map((v, i) => i !== vi ? v : { ...v, attributes: v.attributes.filter((_, j) => j !== ai) }));

  const addVariant = () => setVariants((prev) => [...prev, emptyVariant()]);
  const removeVariant = (vi: number) => setVariants((prev) => prev.filter((_, i) => i !== vi));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: `${type} Added`, description: `New ${type.toLowerCase()} has been added to inventory` });
    navigate("/machines");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <PageHeader title={`Add ${type}`} description={`Add a new ${type.toLowerCase()} to inventory`} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Basic Info */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Basic Information</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Name <span className="text-destructive">*</span></Label><Input placeholder="Machine name" value={form.name} onChange={(e) => setField("name", e.target.value)} required /></div>
              <div className="space-y-2"><Label>Model Number</Label><Input placeholder="e.g. X200" value={form.modelNumber} onChange={(e) => setField("modelNumber", e.target.value)} /></div>
              <div className="space-y-2"><Label>Serial Number</Label><Input placeholder="Unique serial number" value={form.serialNumber} onChange={(e) => setField("serialNumber", e.target.value)} /></div>
              <div className="space-y-2"><Label>Part Code</Label><Input placeholder="e.g. MC-X200-001" value={form.partCode} onChange={(e) => setField("partCode", e.target.value)} /></div>
              <div className="space-y-2"><Label>HSN Code</Label><Input placeholder="e.g. 84715000" value={form.hsnCode} onChange={(e) => setField("hsnCode", e.target.value)} /></div>
              <div className="space-y-2"><Label>GST %</Label><Input type="number" placeholder="e.g. 18" min={0} max={100} value={form.gstPercentage} onChange={(e) => setField("gstPercentage", e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>

        {/* Classification */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classification</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Category <span className="text-destructive">*</span></Label>
                <Select value={form.category} onValueChange={(v) => setField("category", v)} required>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {machineCategories.filter((c) => c.status === "Active").map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Division</Label>
                <Select value={form.division} onValueChange={(v) => setField("division", v)}>
                  <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                  <SelectContent>
                    {machineDivisions.filter((d) => d.status === "Active").map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contract Type</Label>
                <Select value={form.contractType} onValueChange={(v) => setField("contractType", v)}>
                  <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
                  <SelectContent>
                    {contractTypes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Variants */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variants</p>
              <Button type="button" variant="outline" size="sm" onClick={addVariant}><Plus className="h-3.5 w-3.5 mr-1" />Add Variant</Button>
            </div>

            {variants.map((variant, vi) => (
              <div key={vi} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Variant {vi + 1}</span>
                  {variants.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeVariant(vi)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {/* All variant fields in one row */}
                <div className="grid grid-cols-4 gap-3 items-end">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Attribute</Label>
                    <Select value={variant.attributes[0]?.attributeId} onValueChange={(v) => updateAttr(vi, 0, v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select attribute" /></SelectTrigger>
                      <SelectContent>
                        {attributeOptions.filter((a) => a.status === "Active").map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label className="text-xs">Price (₹) <span className="text-destructive">*</span></Label><Input type="number" placeholder="0" min={0} value={variant.price} onChange={(e) => updateVariant(vi, "price", e.target.value)} required /></div>
                  <div className="space-y-2"><Label className="text-xs">Discounted Price (₹)</Label><Input type="number" placeholder="0" min={0} value={variant.discountedPrice} onChange={(e) => updateVariant(vi, "discountedPrice", e.target.value)} /></div>
                  <div className="space-y-2"><Label className="text-xs">Stock (Qty)</Label><Input type="number" placeholder="0" min={0} value={variant.stock} onChange={(e) => updateVariant(vi, "stock", e.target.value)} /></div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Images & Status */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Images</p>
                <div className="flex flex-wrap gap-3">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative h-24 w-24 rounded-lg overflow-hidden border">
                      <img src={img.preview} alt="preview" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80">
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {images.length < 5 && (
                    <label className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-muted-foreground/60 transition-colors">
                      <ImagePlus className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Add Image</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                    </label>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{images.length}/5 images</p>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Any additional notes about this machine" value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit">Add {type}</Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </form>
    </div>
  );
};

export default AddItemForm;
