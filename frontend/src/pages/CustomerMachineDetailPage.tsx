import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, X, ImagePlus, Trash2, ChevronsUpDown, Check, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import api from "@/lib/axiosInterceptor";

interface ContractType {
  contractTypeId: string; name: string; code: string;
  freeService: boolean; freeParts: boolean; validFrom: string; validTo: string;
}

interface MachineDetail {
  customerInfo: { customerId: string; name: string; phone: string; email: string; address: string; zone: string };
  machine: { machineId: string; machineName: string; modelNumber: string; category: string; division: string; images: string[] };
  variant: { _id: string; name: string; value: string; serialNumber: string; contractType: ContractType };
}

interface ProblemType { _id: string; name: string; }

interface MachineEntry {
  detail: MachineDetail;
  problemTypeIds: string[];
  issueDescription: string;
  images: File[];
  previewUrls: string[];
}

const CALL_TYPES = ["Service-Call", "Installation", "Deinstallation", "Counter-Reading", "Others"] as const;

interface LocationSuggestion { placeId: string; description: string; }

const loadGoogleMapsScript = (() => {
  let promise: Promise<void> | null = null;
  return () => {
    if (!promise) {
      promise = new Promise((resolve, reject) => {
        if ((window as any).google?.maps?.places) { resolve(); return; }
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places`;
        script.async = true;
        script.onload  = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google Maps"));
        document.head.appendChild(script);
      });
    }
    return promise;
  };
})();

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const CustomerMachineDetailPage = () => {
  const [searchParams] = useSearchParams();
  const navigate        = useNavigate();
  const initialSerial   = searchParams.get("serialNumber") || "";

  const [callType, setCallType]         = useState("Service-Call");
  const [serialInput, setSerialInput]   = useState("");
  const [searching, setSearching]       = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [problemTypes, setProblemTypes] = useState<ProblemType[]>([]);
  const [machines, setMachines]         = useState<MachineEntry[]>([]);

  const serialInputRef   = useRef<HTMLInputElement>(null);
  const addressInputRef  = useRef<HTMLInputElement>(null);
  const sessionTokenRef  = useRef<any>(null);
  const autocompleteRef  = useRef<any>(null);

  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [addressInput, setAddressInput]             = useState("");
  const [suggestions, setSuggestions]               = useState<LocationSuggestion[]>([]);
  const [customerLocation, setCustomerLocation]     = useState<{ address: string; latitude: number; longitude: number } | null>(null);
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false);

  // Customer info from first added machine
  const customerInfo = machines[0]?.detail?.customerInfo;
  const displayAddress = customerLocation?.address || customerInfo?.address || "—";

  // Load problem types once
  useEffect(() => {
    api.get("/admin/problem-types", { params: { limit: 100, status: "Active" } })
      .then(res => setProblemTypes(res.data.data))
      .catch(() => {});
  }, []);

  // Auto-load initial serial from URL
  useEffect(() => {
    if (!initialSerial) return;
    fetchAndAddMachine(initialSerial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load google maps when dialog opens
  useEffect(() => {
    if (!locationDialogOpen) { setSuggestions([]); setAddressInput(""); return; }
    loadGoogleMapsScript().then(() => {
      sessionTokenRef.current = new (window as any).google.maps.places.AutocompleteSessionToken();
      autocompleteRef.current = new (window as any).google.maps.places.AutocompleteService();
    }).catch(() => toast.error("Failed to load Google Maps"));
  }, [locationDialogOpen]);

  useEffect(() => {
    if (!autocompleteRef.current || !addressInput.trim()) { setSuggestions([]); return; }
    setFetchingSuggestions(true);
    const timer = setTimeout(() => {
      autocompleteRef.current.getPlacePredictions(
        { input: addressInput, sessionToken: sessionTokenRef.current, componentRestrictions: { country: "in" } },
        (predictions: any[], status: string) => {
          setFetchingSuggestions(false);
          if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && predictions)
            setSuggestions(predictions.map((p: any) => ({ placeId: p.place_id, description: p.description })));
          else
            setSuggestions([]);
        }
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [addressInput]);

  const selectSuggestion = (suggestion: LocationSuggestion) => {
    const geocoder = new (window as any).google.maps.Geocoder();
    geocoder.geocode({ placeId: suggestion.placeId }, (results: any[], status: string) => {
      if (status === "OK" && results[0]) {
        const loc = results[0].geometry.location;
        setCustomerLocation({ address: suggestion.description, latitude: loc.lat(), longitude: loc.lng() });
        setLocationDialogOpen(false);
      } else {
        toast.error("Failed to get location coordinates");
      }
    });
  };

  const fetchAndAddMachine = useCallback(async (sn: string) => {
    const trimmed = sn.trim();
    if (!trimmed) return;

    // Prevent duplicates
    if (machines.some(m => m.detail.variant.serialNumber === trimmed)) {
      toast.error("Machine already added");
      return;
    }

    setSearching(true);
    try {
      const res = await api.get("/admin/service-calls/customer-machines/detail", { params: { serialNumber: trimmed } });
      const detail: MachineDetail = res.data.data;

      // Ensure all machines belong to the same customer
      if (customerInfo && detail.customerInfo.customerId !== customerInfo.customerId) {
        toast.error("All machines must belong to the same customer");
        return;
      }

      setMachines(prev => [...prev, { detail, problemTypeIds: [], issueDescription: "", images: [], previewUrls: [] }]);
      setSerialInput("");
      // Set default location from customer info if not already set
      if (!customerLocation && detail.customerInfo?.address)
        setCustomerLocation(null); // keep null so backend uses customer.userLocation
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Machine not found");
    } finally {
      setSearching(false);
    }
  }, [machines, customerInfo]);

  const removeMachine = (idx: number) => {
    setMachines(prev => {
      const updated = [...prev];
      // Revoke preview URLs
      updated[idx].previewUrls.forEach(url => URL.revokeObjectURL(url));
      updated.splice(idx, 1);
      return updated;
    });
  };

  const updateEntry = <K extends keyof MachineEntry>(idx: number, key: K, value: MachineEntry[K]) => {
    setMachines(prev => prev.map((m, i) => i === idx ? { ...m, [key]: value } : m));
  };

  const [ptOpenIdx, setPtOpenIdx] = useState<number | null>(null);

  // Renew contract state
  const [contractTypes, setContractTypes]             = useState<{ _id: string; name: string }[]>([]);
  const [renewDialog, setRenewDialog]                 = useState<MachineEntry | null>(null);
  const [renewContractTypeId, setRenewContractTypeId] = useState("");
  const [renewValidFrom, setRenewValidFrom]           = useState("");
  const [renewValidTo, setRenewValidTo]               = useState("");
  const [renewing, setRenewing]                       = useState(false);

  useEffect(() => {
    api.get("/admin/contract-types", { params: { limit: 100, status: "Active" } })
      .then(res => setContractTypes(res.data.data))
      .catch(() => {});
  }, []);

  const openRenewDialog = (entry: MachineEntry) => {
    setRenewDialog(entry);
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
        serialNumber:      renewDialog.detail.variant.serialNumber,
        newContractTypeId: renewContractTypeId,
        newValidFrom:      renewValidFrom,
        newValidTo:        renewValidTo,
      });
      toast.success("Contract renewed successfully");
      // Refresh the machine detail
      const res = await api.get("/admin/service-calls/customer-machines/detail", { params: { serialNumber: renewDialog.detail.variant.serialNumber } });
      setMachines(prev => prev.map(m =>
        m.detail.variant.serialNumber === renewDialog.detail.variant.serialNumber
          ? { ...m, detail: res.data.data }
          : m
      ));
      setRenewDialog(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to renew contract");
    } finally {
      setRenewing(false);
    }
  };

  const toggleProblemType = (idx: number, ptId: string) => {
    setMachines(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const ids = m.problemTypeIds.includes(ptId)
        ? m.problemTypeIds.filter(id => id !== ptId)
        : [...m.problemTypeIds, ptId];
      return { ...m, problemTypeIds: ids };
    }));
  };

  const addImages = (idx: number, files: FileList | null) => {
    if (!files) return;
    const current = machines[idx].images.length;
    const allowed = Math.min(files.length, 5 - current);
    if (allowed <= 0) { toast.error("Maximum 5 images allowed per machine"); return; }
    const newFiles = Array.from(files).slice(0, allowed);
    const newUrls  = newFiles.map(f => URL.createObjectURL(f));
    setMachines(prev => prev.map((m, i) =>
      i === idx
        ? { ...m, images: [...m.images, ...newFiles], previewUrls: [...m.previewUrls, ...newUrls] }
        : m
    ));
    if (allowed < files.length) toast.warning(`Only ${allowed} image(s) added. Maximum 5 per machine.`);
  };

  const removeImage = (machineIdx: number, imgIdx: number) => {
    setMachines(prev => prev.map((m, i) => {
      if (i !== machineIdx) return m;
      URL.revokeObjectURL(m.previewUrls[imgIdx]);
      return {
        ...m,
        images:      m.images.filter((_, j) => j !== imgIdx),
        previewUrls: m.previewUrls.filter((_, j) => j !== imgIdx),
      };
    }));
  };

  const handleSubmit = async () => {
    if (machines.length === 0) { toast.error("Add at least one machine"); return; }

    for (let i = 0; i < machines.length; i++) {
      const m = machines[i];
      const isExpired = m.detail.variant.contractType?.validTo ? new Date() > new Date(m.detail.variant.contractType.validTo) : false;
      if (isExpired) {
        toast.error(`Machine ${i + 1} (${m.detail.variant.serialNumber}) has an expired contract. Please renew before raising a call.`);
        return;
      }
      if (!m.issueDescription.trim()) {
        toast.error(`Issue description is required for machine ${i + 1}`);
        return;
      }
    }

    setSubmitting(true);
    const fd = new FormData();
    fd.append("customerId", customerInfo!.customerId);
    fd.append("callType", callType);
    if (customerLocation) fd.append("customerLocation", JSON.stringify(customerLocation));

    const machinesPayload = machines.map(m => ({
      variantId:        m.detail.variant._id,
      serialNumber:     m.detail.variant.serialNumber,
      issueDescription: m.issueDescription.trim(),
      problemTypeIds:   m.problemTypeIds,
    }));
    fd.append("machines", JSON.stringify(machinesPayload));

    machines.forEach((m, i) => {
      m.images.forEach(file => fd.append(`images_${i}`, file));
    });

    try {
      await api.post("/admin/service-calls/raise", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Service call raised successfully");
      navigate("/calls");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to raise service call");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Raise a Service Call</h1>
          <p className="text-sm text-muted-foreground">Add machines by serial number and fill in issue details</p>
        </div>
      </div>

      {/* Customer Info (visible after first machine is added) */}
      {customerInfo && (
        <Card className="border-0 shadow-sm bg-muted/40">
          <CardContent className="pt-4 pb-4 px-0">
            <p className="text-xs text-muted-foreground mb-1">Customer</p>
            <p className="font-semibold">{customerInfo.name}</p>
            <p className="text-sm text-muted-foreground">{customerInfo.phone}</p>
          </CardContent>
        </Card>
      )}

      {/* Location Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="relative">
              <Input
                ref={addressInputRef}
                placeholder="Search address in India..."
                value={addressInput}
                onChange={e => setAddressInput(e.target.value)}
                autoFocus
              />
              {fetchingSuggestions && <p className="text-xs text-muted-foreground mt-1">Searching...</p>}
            </div>
            {suggestions.length > 0 && (
              <div className="border rounded-md overflow-hidden divide-y">
                {suggestions.map(s => (
                  <button
                    key={s.placeId}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => selectSuggestion(s)}
                  >
                    {s.description}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Call Type */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium w-24 shrink-0">Call Type <span className="text-red-500">*</span></label>
        <Select value={callType} onValueChange={setCallType}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CALL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Serial Number Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={serialInputRef}
            placeholder="Search by serial number..."
            value={serialInput}
            onChange={e => setSerialInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && fetchAndAddMachine(serialInput)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => fetchAndAddMachine(serialInput)} disabled={searching || !serialInput.trim()}>
          {searching ? <Spinner /> : "Add"}
        </Button>
      </div>

      {/* Machine Cards */}
      {machines.map((entry, idx) => {
        const { machine, variant } = entry.detail;
        const isExpired = variant.contractType?.validTo ? new Date() > new Date(variant.contractType.validTo) : false;

        return (
          <Card key={variant._id + idx} className="border shadow-sm">
            <CardContent className="pt-4 space-y-4">

              {/* Machine header row */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{machine.machineName}</p>
                  <p className="text-xs text-muted-foreground">
                    S/N: <span className="font-mono">{variant.serialNumber}</span>
                    {" · "}{machine.category}{" · "}{machine.division}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Variant: {variant.name} : {variant.value}
                    {" · "}Contract: {variant.contractType?.name}
                    {" "}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${isExpired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      {isExpired ? "Expired" : "Active"}
                    </span>
                    {" · "}Valid To: {formatDate(variant.contractType?.validTo)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeMachine(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {isExpired && (
                <div className="flex items-center justify-between rounded-md bg-red-50 border border-red-200 px-3 py-2">
                  <p className="text-xs text-red-700 font-medium">Contract expired — renew to raise a call</p>
                  <Button size="sm" variant="destructive" className="h-7 gap-1.5" onClick={() => openRenewDialog(entry)}>
                    <RefreshCw className="h-3 w-3" /> Renew Contract
                  </Button>
                </div>
              )}

              {/* Problem Types multiselect dropdown */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Problem Types</label>
                <Popover open={ptOpenIdx === idx} onOpenChange={open => setPtOpenIdx(open ? idx : null)}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal min-h-9 h-auto">
                      <div className="flex flex-wrap gap-1 py-0.5">
                        {entry.problemTypeIds.length === 0
                          ? <span className="text-muted-foreground">Select problem types...</span>
                          : entry.problemTypeIds.map(id => {
                              const pt = problemTypes.find(p => p._id === id);
                              return pt ? (
                                <Badge key={id} variant="secondary" className="text-xs gap-1">
                                  {pt.name}
                                  <span
                                    className="cursor-pointer hover:text-destructive"
                                    onPointerDown={e => { e.stopPropagation(); toggleProblemType(idx, id); }}
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </span>
                                </Badge>
                              ) : null;
                            })
                        }
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" style={{ width: "var(--radix-popover-trigger-width)" }} align="start">
                    <Command>
                      <CommandInput placeholder="Search problem types..." />
                      <CommandList>
                        <CommandEmpty>No problem types found.</CommandEmpty>
                        <CommandGroup>
                          {problemTypes.map(pt => (
                            <CommandItem key={pt._id} value={pt.name} onSelect={() => toggleProblemType(idx, pt._id)}>
                              <Check className={cn("mr-2 h-4 w-4", entry.problemTypeIds.includes(pt._id) ? "opacity-100" : "opacity-0")} />
                              {pt.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Issue Description */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Issue Description <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Describe the issue..."
                  value={entry.issueDescription}
                  onChange={e => updateEntry(idx, "issueDescription", e.target.value)}
                  rows={3}
                />
              </div>

              {/* Images */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Images</label>
                  <span className="text-xs text-muted-foreground">{entry.images.length}/5</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">Max 5 images allowed. If more are selected, only the first 5 will be added.</p>
                <div className="flex flex-wrap gap-2">
                  {entry.previewUrls.map((url, imgIdx) => (
                    <div key={imgIdx} className="relative w-20 h-20 rounded overflow-hidden border">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(idx, imgIdx)}
                        className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {entry.images.length < 5 && (
                    <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed rounded cursor-pointer text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[10px] mt-1">Add</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={e => addImages(idx, e.target.files)} />
                    </label>
                  )}
                </div>
              </div>

            </CardContent>
          </Card>
        );
      })}

      {/* Renew Contract Dialog */}
      <Dialog open={!!renewDialog} onOpenChange={() => setRenewDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renew Contract — {renewDialog?.detail.variant.serialNumber}</DialogTitle>
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
                {contractTypes.map(ct => <option key={ct._id} value={ct._id}>{ct.name}</option>)}
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

      {/* Empty state */}
      {machines.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          <p className="text-sm">No machines added yet.</p>
          <p className="text-xs mt-1">Search by serial number above to add a machine.</p>
        </div>
      )}

      {/* Submit */}
      {machines.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Service Location</p>
              <p className="text-sm font-medium leading-snug">{displayAddress}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Engineer will visit this location</p>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => setLocationDialogOpen(true)}>Change</Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting} className="min-w-32">
              {submitting ? <Spinner /> : "Raise Call"}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
};

export default CustomerMachineDetailPage;
