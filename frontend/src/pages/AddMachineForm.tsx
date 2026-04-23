import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, Plus, Trash2, ImagePlus, X, Pencil, Crown } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import api from "@/lib/axiosInterceptor";

interface Variant {
  attribute: string;
  value: string;
  lowStockThreshold: string;
}

interface CategoryOption  { _id: string; name: string; }
interface DivisionOption  { _id: string; name: string; }
interface AttributeOption { _id: string; name: string; }

type ImageItem = { preview: string; file?: File };

const emptyVariant = (): Variant => ({ attribute: "", value: "", lowStockThreshold: "" });

interface AddMachineFormProps {
  type: "Machine" | "Accessory";
  mode?: "add" | "edit" | "view";
}

const AddMachineForm = ({ type, mode = "add" }: AddMachineFormProps) => {
  const navigate   = useNavigate();
  const { id }     = useParams<{ id: string }>();
  const isEdit     = mode === "edit" && !!id;
  const isView     = mode === "view" && !!id;
  const isReadOnly = isView;

  const [categories,  setCategories]  = useState<CategoryOption[]>([]);
  const [divisions,   setDivisions]   = useState<DivisionOption[]>([]);
  const [attributes,  setAttributes]  = useState<AttributeOption[]>([]);
  const [submitting,  setSubmitting]  = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit || isView);

  const [form, setForm] = useState({
    name: "", modelNumber: "", serialNumber: "", category: "",
    division: "", hsnCode: "", gstPercentage: "", partCode: "",
    status: "Active" as "Active" | "Inactive", notes: "",
  });

  const [variants, setVariants] = useState<Variant[]>([emptyVariant()]);

  const [allImages,  setAllImages]  = useState<ImageItem[]>([]);
  const [dragIndex,  setDragIndex]  = useState<number | null>(null);

  const totalImageCount = allImages.length;

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [catRes, divRes, attrRes] = await Promise.all([
          api.get("/admin/machine-categories", { params: { limit: 100, status: "Active" } }),
          api.get("/admin/machine-divisions",  { params: { limit: 100, status: "Active" } }),
          api.get("/admin/attributes",         { params: { limit: 100, status: "Active" } }),
        ]);
        setCategories(catRes.data.data);
        setDivisions(divRes.data.data);
        setAttributes(attrRes.data.data);
      } catch {
        toast.error("Failed to load form options");
      }
    };
    fetchOptions();
  }, []);

  useEffect(() => {
    if (!isEdit && !isView) return;
    const fetchMachine = async () => {
      setLoadingData(true);
      try {
        const res = await api.get(`/admin/machines/${id}`);
        const m   = res.data.data;
        setForm({
          name:          m.name          ?? "",
          modelNumber:   m.modelNumber   ?? "",
          serialNumber:  m.serialNumber  ?? "",
          category:      m.category?._id ?? "",
          division:      m.division?._id ?? "",
          hsnCode:       m.hsnCode       ?? "",
          gstPercentage: m.gstPercentage != null ? String(m.gstPercentage) : "",
          partCode:      m.partCode      ?? "",
          status:        m.status        ?? "Active",
          notes:         m.notes         ?? "",
        });
        setAllImages((m.images ?? []).map((url: string) => ({ preview: url })));
        setVariants(
          m.variants?.length
            ? m.variants.map((v: any) => ({ attribute: v.attribute?._id ?? "", value: v.value ?? "", lowStockThreshold: v.lowStockThreshold != null ? String(v.lowStockThreshold) : "" }))
            : [emptyVariant()]
        );
      } catch {
        toast.error("Failed to load machine details");
      } finally {
        setLoadingData(false);
      }
    };
    fetchMachine();
  }, [id, isEdit, isView]);

  const setField = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files     = Array.from(e.target.files || []);
    const remaining = 5 - totalImageCount;
    if (remaining <= 0) return;
    setAllImages((prev) => [...prev, ...files.slice(0, remaining).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    e.target.value = "";
  };

  const removeImage = (idx: number) => {
    setAllImages((prev) => {
      if (!prev[idx].file) return prev.filter((_, i) => i !== idx); // existing URL
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const onDragStart = (idx: number) => setDragIndex(idx);
  const onDragOver  = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    setAllImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIndex(idx);
  };
  const onDragEnd = () => setDragIndex(null);

  const updateVariant = (vi: number, key: keyof Variant, value: string) =>
    setVariants((prev) => prev.map((v, i) => i === vi ? { ...v, [key]: value } : v));

  const addVariant    = () => setVariants((prev) => [...prev, emptyVariant()]);
  const removeVariant = (vi: number) => setVariants((prev) => prev.filter((_, i) => i !== vi));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.category)    return toast.error("Category is required");
    if (!form.division)    return toast.error("Division is required");
    const validVariants = variants.filter((v) => v.attribute && v.value.trim());
    if (validVariants.length === 0) return toast.error("At least one variant with attribute and value is required");

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name",          form.name.trim());
      fd.append("modelNumber",   form.modelNumber);
      fd.append("serialNumber",  form.serialNumber);
      fd.append("hsnCode",       form.hsnCode);
      fd.append("partCode",      form.partCode);
      fd.append("gstPercentage", form.gstPercentage);
      fd.append("category",      form.category);
      fd.append("division",      form.division);
      fd.append("status",        form.status);
      fd.append("notes",         form.notes);

      fd.append("variants", JSON.stringify(
        validVariants.map((v) => ({ attribute: v.attribute, value: v.value.trim(), lowStockThreshold: v.lowStockThreshold !== "" ? Number(v.lowStockThreshold) : -1 }))
      ));

      // split back: existing kept URLs (in order) and new files (in order)
      const existingImages = allImages.filter((img) => !img.file).map((img) => img.preview);
      const newFiles       = allImages.filter((img) => !!img.file).map((img) => img.file!);

      // imageOrder preserves full drag-drop order: existing URLs or "new:N" tokens for new files
      let newIdx = 0;
      const imageOrder = allImages.map((img) => img.file ? `new:${newIdx++}` : img.preview);

      newFiles.forEach((file) => fd.append("images", file));
      fd.append("imageOrder", JSON.stringify(imageOrder));

      if (isEdit) {
        fd.append("existingImages", JSON.stringify(existingImages));
        await api.patch(`/admin/machines/${id}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success("Machine updated successfully");
      } else {
        await api.post("/admin/machines", fd, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success("Machine added successfully");
      }
      navigate("/machines");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingData) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <PageHeader
            title={isEdit ? (form.name || "Edit Machine") : isView ? (form.name || "Machine Details") : `Add ${type}`}
            description={isEdit ? "Update machine details" : isView ? "View machine details" : `Add a new ${type.toLowerCase()} to inventory`}
          />
        </div>
        {isView && (
          <Button variant="outline" className="gap-2" onClick={() => navigate(`/machines/${id}/edit`)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Basic Information</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Name <span className="text-destructive">*</span></Label><Input placeholder="Machine name" value={form.name} onChange={(e) => setField("name", e.target.value)} required disabled={isReadOnly} /></div>
              <div className="space-y-2"><Label>Model Number</Label><Input placeholder="e.g. X200" value={form.modelNumber} onChange={(e) => setField("modelNumber", e.target.value)} disabled={isReadOnly} /></div>
              <div className="space-y-2"><Label>Serial Number</Label><Input placeholder="Unique serial number" value={form.serialNumber} onChange={(e) => setField("serialNumber", e.target.value)} disabled={isReadOnly} /></div>
              <div className="space-y-2"><Label>Part Code</Label><Input placeholder="e.g. MC-X200-001" value={form.partCode} onChange={(e) => setField("partCode", e.target.value)} disabled={isReadOnly} /></div>
              <div className="space-y-2"><Label>HSN Code</Label><Input placeholder="e.g. 84715000" value={form.hsnCode} onChange={(e) => setField("hsnCode", e.target.value)} disabled={isReadOnly} /></div>
              <div className="space-y-2"><Label>GST %</Label><Input type="number" placeholder="e.g. 18" min={0} max={100} value={form.gstPercentage} onChange={(e) => setField("gstPercentage", e.target.value)} disabled={isReadOnly} /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classification</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category <span className="text-destructive">*</span></Label>
                <Select value={form.category} onValueChange={(v) => setField("category", v)} disabled={isReadOnly}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Division</Label>
                <Select value={form.division} onValueChange={(v) => setField("division", v)} disabled={isReadOnly}>
                  <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                  <SelectContent>{divisions.map((d) => <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variants</p>
              {!isReadOnly && <Button type="button" variant="outline" size="sm" onClick={addVariant}><Plus className="h-3.5 w-3.5 mr-1" />Add Variant</Button>}
            </div>
            {variants.map((variant, vi) => (
              <div key={vi} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Variant {vi + 1}</span>
                  {variants.length > 1 && !isReadOnly && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeVariant(vi)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 items-start">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Attribute</Label>
                    <Select value={variant.attribute} onValueChange={(v) => updateVariant(vi, "attribute", v)} disabled={isReadOnly}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select attribute" /></SelectTrigger>
                      <SelectContent>{attributes.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Value</Label>
                    <Input className="h-9 text-sm" placeholder="e.g. Red, 500ml" value={variant.value} onChange={(e) => updateVariant(vi, "value", e.target.value)} disabled={isReadOnly} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Low Stock Threshold</Label>
                    <Input type="number" placeholder="e.g. 5 or -1 to disable" min={-1} value={variant.lowStockThreshold} onChange={(e) => updateVariant(vi, "lowStockThreshold", e.target.value)} disabled={isReadOnly} />
                    <p className="text-xs text-muted-foreground">Set <span className="font-medium text-foreground">0</span>+ for alerts · <span className="font-medium text-foreground">-1</span> to disable</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Images</p>
                {!isReadOnly && totalImageCount > 1 && <p className="text-xs text-muted-foreground">Drag to reorder · first image is primary</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                {allImages.map((img, idx) => (
                  <div
                    key={idx}
                    className={`relative h-24 w-24 rounded-lg overflow-hidden border-2 ${idx === 0 ? "border-yellow-400" : "border-transparent"} ${!isReadOnly ? "cursor-grab active:cursor-grabbing" : ""}`}
                    draggable={!isReadOnly}
                    onDragStart={() => onDragStart(idx)}
                    onDragOver={(e) => onDragOver(e, idx)}
                    onDragEnd={onDragEnd}
                  >
                    <img src={img.preview} alt="preview" className="h-full w-full object-cover" />
                    {idx === 0 && <div className="absolute top-1 left-1"><Crown className="h-3.5 w-3.5 text-yellow-400 drop-shadow" /></div>}
                    {!isReadOnly && (
                      <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80">
                        <X className="h-3 w-3 text-white" />
                      </button>
                    )}
                  </div>
                ))}
                {totalImageCount < 5 && !isReadOnly && (
                  <label className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-muted-foreground/60 transition-colors">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Add Image</span>
                    <input type="file" accept=".jpg,.jpeg,.png,.webp,.avif" multiple className="hidden" onChange={handleImageUpload} />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{totalImageCount}/5 images</p>
            </div>
            <div className="flex gap-4">
              <div className="space-y-2 w-3/4">
                <Label>Notes</Label>
                <Textarea placeholder="Any additional notes about this machine" value={form.notes} onChange={(e) => setField("notes", e.target.value)} disabled={isReadOnly} />
              </div>
              <div className="space-y-2 w-1/4">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v)} disabled={isReadOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {!isView && (
          <div className="flex gap-2 justify-end">
            <Button type="submit" disabled={submitting}>{submitting ? (isEdit ? "Saving..." : "Adding...") : (isEdit ? "Save Changes" : `Add ${type}`)}</Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        )}
      </form>
    </div>
  );
};

export default AddMachineForm;
