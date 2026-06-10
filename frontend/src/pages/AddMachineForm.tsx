import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, Plus, ImagePlus, X, Pencil, Crown } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import api from "@/lib/axiosInterceptor";

interface CategoryOption { _id: string; name: string; }
interface DivisionOption  { _id: string; name: string; }

type ImageItem = { preview: string; file?: File };

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
  const [submitting,  setSubmitting]  = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit || isView);

  const [form, setForm] = useState({
    name: "", modelNumber: "", category: "",
    division: "", hsnCode: "", lowStockThreshold: "",
    status: "Active" as "Active" | "Inactive", notes: "",
  });

  const [allImages, setAllImages] = useState<ImageItem[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [categoryDialog, setCategoryDialog] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", status: "Active" as "Active" | "Inactive" });
  const [divisionDialog, setDivisionDialog] = useState(false);
  const [divisionForm, setDivisionForm] = useState({ name: "", description: "", status: "Active" as "Active" | "Inactive" });
  const [creatingNew, setCreatingNew] = useState(false);

  const totalImageCount = allImages.length;

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [catRes, divRes] = await Promise.all([
          api.get("/admin/machine-categories", { params: { limit: 100, status: "Active" } }),
          api.get("/admin/machine-divisions",  { params: { limit: 100, status: "Active" } }),
        ]);
        setCategories(catRes.data.data);
        setDivisions(divRes.data.data);
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
          name:              m.name              ?? "",
          modelNumber:       m.modelNumber       ?? "",
          category:          m.category?._id     ?? "",
          division:          m.division?._id     ?? "",
          hsnCode:           m.hsnCode           ?? "",
          lowStockThreshold: m.lowStockThreshold != null ? String(m.lowStockThreshold) : "",
          status:            m.status            ?? "Active",
          notes:             m.notes             ?? "",
        });
        setAllImages((m.images ?? []).map((url: string) => ({ preview: url })));
      } catch {
        toast.error("Failed to load machine details");
      } finally {
        setLoadingData(false);
      }
    };
    fetchMachine();
  }, [id, isEdit, isView]);

  const setField = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleCreateCategory = async () => {
    if (!categoryForm.name.trim()) return toast.error("Category name is required");
    setCreatingNew(true);
    try {
      const res = await api.post("/admin/machine-categories", categoryForm);
      toast.success("Category created successfully");
      setCategories((prev) => [...prev, res.data.data]);
      setCategoryDialog(false);
      setCategoryForm({ name: "", description: "", status: "Active" });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create category");
    } finally {
      setCreatingNew(false);
    }
  };

  const handleCreateDivision = async () => {
    if (!divisionForm.name.trim()) return toast.error("Division name is required");
    setCreatingNew(true);
    try {
      const res = await api.post("/admin/machine-divisions", divisionForm);
      toast.success("Division created successfully");
      setDivisions((prev) => [...prev, res.data.data]);
      setDivisionDialog(false);
      setDivisionForm({ name: "", description: "", status: "Active" });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create division");
    } finally {
      setCreatingNew(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files     = Array.from(e.target.files || []);
    const remaining = 5 - totalImageCount;
    if (remaining <= 0) return;
    setAllImages((prev) => [...prev, ...files.slice(0, remaining).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    e.target.value = "";
  };

  const removeImage = (idx: number) => {
    setAllImages((prev) => {
      if (!prev[idx].file) return prev.filter((_, i) => i !== idx);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.category)    return toast.error("Category is required");
    if (!form.division)    return toast.error("Division is required");
    if (allImages.length === 0) return toast.error("At least one image is required");

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name",              form.name.trim());
      fd.append("modelNumber",       form.modelNumber);
      fd.append("hsnCode",           form.hsnCode);
      fd.append("lowStockThreshold", form.lowStockThreshold !== "" ? form.lowStockThreshold : "-1");
      fd.append("category",          form.category);
      fd.append("division",          form.division);
      fd.append("status",            form.status);
      fd.append("notes",             form.notes);

      const existingImages = allImages.filter((img) => !img.file).map((img) => img.preview);
      const newFiles       = allImages.filter((img) => !!img.file).map((img) => img.file!);

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
              <div className="space-y-2"><Label>Model Number <span className="text-destructive">*</span></Label><Input placeholder="e.g. X200" value={form.modelNumber} onChange={(e) => setField("modelNumber", e.target.value)} disabled={isReadOnly} /></div>
              <div className="space-y-2"><Label>HSN Code</Label><Input placeholder="e.g. 84715000" value={form.hsnCode} onChange={(e) => setField("hsnCode", e.target.value)} disabled={isReadOnly} /></div>
              <div className="space-y-2">
                <Label>Low Stock Threshold</Label>
                <Input type="number" placeholder="e.g. 5 or -1 to disable" min={-1} value={form.lowStockThreshold} onChange={(e) => setField("lowStockThreshold", e.target.value)} disabled={isReadOnly} />
                <p className="text-xs text-muted-foreground">Set <span className="font-medium text-foreground">0</span>+ for alerts · <span className="font-medium text-foreground">-1</span> to disable</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classification</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  {!isReadOnly && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCategoryDialog(true)}><Plus className="h-3 w-3 mr-1" />Create New</Button>}
                </div>
                <Select value={form.category} onValueChange={(v) => setField("category", v)} disabled={isReadOnly}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Division <span className="text-destructive">*</span></Label>
                  {!isReadOnly && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDivisionDialog(true)}><Plus className="h-3 w-3 mr-1" />Create New</Button>}
                </div>
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

      {/* Create Category Dialog */}
      <Dialog open={categoryDialog} onOpenChange={(open) => { if (!open) { setCategoryDialog(false); setCategoryForm({ name: "", description: "", status: "Active" }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Category</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Category Name <span className="text-destructive">*</span></Label><Input placeholder="e.g. Heavy Machinery" value={categoryForm.name} onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Types of machines in this category" value={categoryForm.description} onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={categoryForm.status} onValueChange={(v) => setCategoryForm((p) => ({ ...p, status: v as "Active" | "Inactive" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCategoryDialog(false); setCategoryForm({ name: "", description: "", status: "Active" }); }}>Cancel</Button>
            <Button onClick={handleCreateCategory} disabled={creatingNew}>{creatingNew ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Division Dialog */}
      <Dialog open={divisionDialog} onOpenChange={(open) => { if (!open) { setDivisionDialog(false); setDivisionForm({ name: "", description: "", status: "Active" }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Division</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Division Name <span className="text-destructive">*</span></Label><Input placeholder="e.g. CNC Division" value={divisionForm.name} onChange={(e) => setDivisionForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Types of machines covered by this division" value={divisionForm.description} onChange={(e) => setDivisionForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={divisionForm.status} onValueChange={(v) => setDivisionForm((p) => ({ ...p, status: v as "Active" | "Inactive" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDivisionDialog(false); setDivisionForm({ name: "", description: "", status: "Active" }); }}>Cancel</Button>
            <Button onClick={handleCreateDivision} disabled={creatingNew}>{creatingNew ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AddMachineForm;
