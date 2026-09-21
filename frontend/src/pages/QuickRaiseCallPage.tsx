import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Label }      from "@/components/ui/label";
import { Badge }      from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Zap,
  Store,
  Building2,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Boxes,
  MapPin,
  Search,
  PhoneOutgoing,
  FileSignature,
  Plus,
  Trash2,
} from "lucide-react";
import api from "@/lib/axiosInterceptor";
import { quickRaiseCallApi, QRCVendor, QRCDummyPayload, QRCExistingPayload } from "@/services/quickRaiseCallApi";

const PRODUCT_CATEGORY_ID = import.meta.env.VITE_PRODUCT_CATEGORY_ID;
const TSS_CONTRACT_TYPE_ID = import.meta.env.VITE_TSS_CONTRACT_TYPE_ID;

interface PageCategoryRow {
  pagesCategoryId: string;
  pagesCategory: string;
  costPerPage: string;
}

const getTodayStr = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

const getOneYearLaterStr = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
};

// ── Google Maps helpers ──────────────────────────────────────────────────────
const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

let gmapsLoaded = false;
const loadGMaps = () =>
  new Promise<void>((resolve) => {
    if (gmapsLoaded || (window as any).google?.maps?.places) {
      gmapsLoaded = true;
      resolve();
      return;
    }
    if (!GMAPS_KEY) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => {
      gmapsLoaded = true;
      resolve();
    };
    script.onerror = () => {
      console.warn("Failed to load Google Maps SDK");
      resolve();
    };
    document.head.appendChild(script);
  });

interface GoogleSuggestion {
  place_id: string;
  description: string;
}

const getLatLng = (placeId: string): Promise<{ latitude: number; longitude: number } | null> =>
  new Promise((resolve) => {
    try {
      if (!(window as any).google?.maps?.places) {
        resolve(null);
        return;
      }
      const map = new (window as any).google.maps.Map(document.createElement("div"));
      const service = new (window as any).google.maps.places.PlacesService(map);
      service.getDetails({ placeId, fields: ["geometry"] }, (place: any, status: string) => {
        if (status === "OK" && place?.geometry?.location) {
          resolve({
            latitude: place.geometry.location.lat(),
            longitude: place.geometry.location.lng(),
          });
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });

// ── Local helpers ────────────────────────────────────────────────────────────
interface DropdownOption {
  _id: string;
  name: string;
  code?: string;
}

interface ExistingCustomer {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  zone?: { _id: string; name: string; code?: string } | string;
  userLocation?: { address: string; latitude?: number; longitude?: number };
}

interface ExistingMachineOption {
  _id: string;
  name: string;
  modelNumber?: string;
  partCode?: string;
  category?: { _id: string; name: string } | string;
  division?: { _id: string; name: string } | string;
}

interface CompanyOption {
  _id: string;
  name: string;
}

interface ContractTypeOption {
  _id: string;
  name: string;
  code?: string;
}

const Step = ({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) => (
  <div className={`flex items-center gap-2 text-sm font-medium transition-colors ${active ? "text-primary" : done ? "text-green-600" : "text-muted-foreground"}`}>
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
      ${done   ? "bg-green-600 border-green-600 text-white"
      : active ? "bg-primary border-primary text-white"
               : "bg-background border-muted-foreground/30 text-muted-foreground"}`}
    >
      {done ? <CheckCircle2 size={14} /> : n}
    </div>
    <span>{label}</span>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const QuickRaiseCallPage = () => {
  const navigate = useNavigate();

  // ── Mode selection — only "dummy" mode is available (existing vendor hidden) ─
  const [mode, setMode] = useState<"" | "dummy" | "existing">("dummy");

  // ── Step tracker — start at Step 2 (Customer) since mode is pre-selected ──
  const [step, setStep] = useState(2);

  // ── Vendors list (for "existing" mode) ────────────────────────────────────
  const [vendors,        setVendors]        = useState<QRCVendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [selectedVendorId,  setSelectedVendorId]  = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [selectedSerial,    setSelectedSerial]    = useState("");

  // ── Companies list (for "existing" mode) ──────────────────────────────────
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  // ── Contract types (optional contract assignment) ──────────────────────────
  const [contractTypes, setContractTypes] = useState<ContractTypeOption[]>([]);
  const [selectedContractTypeId, setSelectedContractTypeId] = useState("");
  const [contractValidFrom, setContractValidFrom] = useState(getTodayStr());
  const [contractValidTo, setContractValidTo] = useState(getOneYearLaterStr());
  const [activePagesCats, setActivePagesCats] = useState<DropdownOption[]>([]);
  const [contractPagesCategories, setContractPagesCategories] = useState<PageCategoryRow[]>([]);
  const [contractMinCopies, setContractMinCopies] = useState<string>("0");

  // ── Duplicate Model + Serial Validation State ──────────────────────────────
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // ── Existing Customers (for dropdown quick-fill) ──────────────────────────
  const [existingCustomers, setExistingCustomers] = useState<ExistingCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // ── Zones list ─────────────────────────────────────────────────────────────
  const [zones, setZones] = useState<DropdownOption[]>([]);
  const [custZoneId, setCustZoneId] = useState("none");

  // ── Search filter for Quick Select Machine from Inventory ──────────────────
  const [machineSearch, setMachineSearch] = useState("");

  // ── Customer fields ────────────────────────────────────────────────────────
  const [custName,         setCustName]         = useState("");
  const [custPhone,        setCustPhone]        = useState("");
  const [custEmail,        setCustEmail]        = useState("");
  const [custDepartment,   setCustDepartment]   = useState("");
  const [custAddress,      setCustAddress]      = useState("");
  const [custUserLocation, setCustUserLocation] = useState<{ address: string; latitude?: number; longitude?: number } | null>(null);

  // ── Google Maps Autocomplete states ────────────────────────────────────────
  const [addressSuggestions, setAddressSuggestions] = useState<GoogleSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsBoxRef  = useRef<HTMLDivElement>(null);

  // ── Machine fields (dummy mode only) ──────────────────────────────────────
  const [existingSystemMachines, setExistingSystemMachines] = useState<ExistingMachineOption[]>([]);
  const [selectedExistingMachineId, setSelectedExistingMachineId] = useState("");
  const [machName,       setMachName]       = useState("");
  const [machModel,      setMachModel]      = useState("");
  const [machPartCode,   setMachPartCode]   = useState("");
  const [machSerial,     setMachSerial]     = useState("");
  const [machCategoryId, setMachCategoryId] = useState("");
  const [machDivisionId, setMachDivisionId] = useState("");

  // ── Existing mode — selling price (empty initially, compulsory) ───────────
  const [sellingPrice, setSellingPrice] = useState<string>("");

  // ── Confirmation popup state for Existing mode ─────────────────────────────
  const [confirmPriceDialogOpen, setConfirmPriceDialogOpen] = useState(false);

  // ── Dropdowns for categories & divisions ───────────────────────────────────
  const [categories, setCategories] = useState<DropdownOption[]>([]);
  const [divisions,  setDivisions]  = useState<DropdownOption[]>([]);

  // ── Submission ─────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  // ── Derived selection items for Existing Mode ──────────────────────────────
  const selectedVendor = vendors.find((v) => v._id === selectedVendorId) || null;
  const selectedMachine = selectedVendor?.machines.find((m) => m.machineId?.toString() === selectedMachineId) || null;
  const selectedCompany = companies.find((c) => c._id === selectedCompanyId) || null;

  // Real vendors list for Existing Mode (all active real vendors)
  const allRealVendors = vendors.filter((v) => !v.isDummy);
  const vendorsWithStock = vendors.filter((v) => !v.isDummy && v.availableStockCount > 0);

  // ── Load vendors list ──────────────────────────────────────────────────────
  useEffect(() => {
    setVendorsLoading(true);
    quickRaiseCallApi.getVendors()
      .then((data) => setVendors(data.vendors))
      .catch(() => toast.error("Failed to load vendors"))
      .finally(() => setVendorsLoading(false));
  }, []);

  // ── Load active companies ──────────────────────────────────────────────────
  useEffect(() => {
    api.get("/admin/companies", { params: { limit: 100, status: "Active" } })
      .then((res) => {
        const comps = res.data.data || [];
        setCompanies(comps);
        if (comps.length > 0) {
          setSelectedCompanyId(comps[0]._id);
        }
      })
      .catch(() => {});
  }, []);

  // ── Load active contract types ─────────────────────────────────────────────
  useEffect(() => {
    api.get("/admin/contract-types", { params: { limit: 100, status: "Active" } })
      .then((res) => {
        setContractTypes(res.data.data || []);
      })
      .catch(() => {});
  }, []);

  // ── Load active zones for customer ─────────────────────────────────────────
  useEffect(() => {
    api.get("/admin/zones", { params: { limit: 100, status: "Active" } })
      .then((res) => {
        setZones(res.data.data || []);
      })
      .catch(() => {});
  }, []);

  // ── Load active pages categories for TSS contracts ────────────────────────
  useEffect(() => {
    api.get("/admin/pages-categories/active")
      .then((res) => {
        setActivePagesCats(res.data.data || []);
      })
      .catch(() => {});
  }, []);

  // ── Helper to detect if selected contract is Total Service Support (TSS) ───
  const selectedContractType = contractTypes.find((c) => c._id === selectedContractTypeId) || null;
  const isTSS = Boolean(
    selectedContractTypeId &&
    selectedContractTypeId !== "none" &&
    (
      selectedContractTypeId === TSS_CONTRACT_TYPE_ID ||
      selectedContractType?.code?.toUpperCase() === "TSS" ||
      selectedContractType?.name?.toLowerCase().includes("total service support")
    )
  );

  const handleContractTypeChange = (newTypeId: string) => {
    setSelectedContractTypeId(newTypeId);
    if (newTypeId && newTypeId !== "none") {
      const ct = contractTypes.find((c) => c._id === newTypeId);
      const isTssChoice =
        newTypeId === TSS_CONTRACT_TYPE_ID ||
        ct?.code?.toUpperCase() === "TSS" ||
        ct?.name?.toLowerCase().includes("total service support");
      if (isTssChoice && contractPagesCategories.length === 0) {
        setContractPagesCategories([{ pagesCategoryId: "", pagesCategory: "", costPerPage: "" }]);
      }
    }
  };

  // ── Load existing customers for quick selection ───────────────────────────
  useEffect(() => {
    api.get("/admin/customers", { params: { limit: 100 } })
      .then((res) => {
        setExistingCustomers(res.data.data || []);
      })
      .catch(() => {});
  }, []);

  // ── Load categories (PRODUCT ONLY) + divisions + machines for dummy mode ───
  useEffect(() => {
    if (mode !== "dummy") return;
    Promise.all([
      api.get("/admin/machine-categories", { params: { limit: 200, status: "Active" } }),
      api.get("/admin/machine-divisions",  { params: { limit: 200, status: "Active" } }),
      api.get("/admin/machines",           { params: { limit: 2000, status: "Active" } }),
    ]).then(([catRes, divRes, machRes]) => {
      const allCats: DropdownOption[] = catRes.data.data || [];
      // Filter ONLY Product category
      const prodCats = allCats.filter(
        (c) => c._id === PRODUCT_CATEGORY_ID || c.name.toLowerCase() === "product"
      );
      const finalCats = prodCats.length > 0 ? prodCats : allCats;
      setCategories(finalCats);
      if (finalCats.length > 0) {
        setMachCategoryId(finalCats[0]._id);
      }

      setDivisions(divRes.data.data || []);

      const allSysMachines: ExistingMachineOption[] = machRes.data.data || [];
      const prodMachines = allSysMachines.filter((m) => {
        const catId = typeof m.category === "object" ? m.category?._id : m.category;
        const catName = typeof m.category === "object" ? m.category?.name : "";
        return catId === PRODUCT_CATEGORY_ID || catName?.toLowerCase() === "product";
      });
      setExistingSystemMachines(prodMachines.length > 0 ? prodMachines : allSysMachines);
    }).catch(() => toast.error("Failed to load categories/divisions"));
  }, [mode]);

  // Filtered system machines for Quick Select search
  const filteredSystemMachines = existingSystemMachines.filter((m) => {
    if (!machineSearch.trim()) return true;
    const q = machineSearch.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.modelNumber?.toLowerCase().includes(q) ||
      m.partCode?.toLowerCase().includes(q)
    );
  });

  // ── Real-time Model Number + Serial Number uniqueness check ───────────────
  useEffect(() => {
    const model = mode === "dummy" ? machModel.trim() : (selectedMachine?.modelNumber || "").trim();
    const serial = mode === "dummy" ? machSerial.trim() : selectedSerial.trim();

    if (!model || !serial) {
      setDuplicateWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingDuplicate(true);
      try {
        const res = await quickRaiseCallApi.checkModelSerial(model, serial);
        if (!res.available) {
          setDuplicateWarning(res.message);
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        setDuplicateWarning(null);
      } finally {
        setCheckingDuplicate(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [mode, machModel, machSerial, selectedMachine, selectedSerial]);

  // ── Close suggestions when clicking outside ────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsBoxRef.current && !suggestionsBoxRef.current.contains(e.target as Node)) {
        setShowAddressSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Google Maps address autocomplete handler ───────────────────────────────
  const fetchAddressSuggestions = (value: string) => {
    if (!GMAPS_KEY || value.trim().length < 3) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    addressDebounceRef.current = setTimeout(async () => {
      try {
        await loadGMaps();
        if (!(window as any).google?.maps?.places) {
          setAddressSuggestions([]);
          return;
        }
        const service = new (window as any).google.maps.places.AutocompleteService();
        service.getPlacePredictions(
          { input: value, language: "en", componentRestrictions: { country: "in" } },
          (predictions: any[], status: string) => {
            if (status === "OK" && predictions) {
              setAddressSuggestions(
                predictions.map((p: any) => ({ place_id: p.place_id, description: p.description }))
              );
              setShowAddressSuggestions(true);
            } else {
              setAddressSuggestions([]);
              setShowAddressSuggestions(false);
            }
          }
        );
      } catch {
        setAddressSuggestions([]);
      }
    }, 350);
  };

  const handleAddressChange = (value: string) => {
    setCustAddress(value);
    setCustUserLocation({ address: value });
    fetchAddressSuggestions(value);
  };

  const handleSuggestionClick = async (description: string, placeId: string) => {
    setCustAddress(description);
    setCustUserLocation({ address: description });
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    try {
      await loadGMaps();
      const coords = await getLatLng(placeId);
      if (coords) {
        setCustUserLocation({ address: description, ...coords });
        toast.success("Location mapped from Google Maps", { duration: 2000 });
      }
    } catch {
      // Coords optional
    }
  };

  // ── Auto-fill Customer from existing dropdown ──────────────────────────────
  const handleExistingCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const c = existingCustomers.find((x) => x._id === customerId);
    if (c) {
      setCustName(c.name || "");
      setCustPhone(c.phone || "");
      setCustEmail(c.email || "");
      const addr = c.userLocation?.address || c.address || "";
      setCustAddress(addr);
      setCustUserLocation(c.userLocation || (addr ? { address: addr } : null));
      const zid = typeof c.zone === "object" ? (c.zone as any)?._id : c.zone;
      setCustZoneId(zid || "none");
      toast.success(`Selected customer: ${c.name}`);
    }
  };

  // ── Auto-fill Machine from existing dropdown in dummy mode ─────────────────
  const handleExistingSystemMachineSelect = (machId: string) => {
    setSelectedExistingMachineId(machId);
    const m = existingSystemMachines.find((x) => x._id === machId);
    if (m) {
      setMachName(m.name || "");
      setMachModel(m.modelNumber || "");
      setMachPartCode(m.partCode || "");
      const catId = typeof m.category === "object" ? m.category?._id : m.category;
      const divId = typeof m.division === "object" ? m.division?._id : m.division;
      if (catId) setMachCategoryId(catId);
      if (divId) setMachDivisionId(divId);
    }
  };

  // ── Step validation ────────────────────────────────────────────────────────
  const canGoStep2 = mode !== "";
  const canGoStep3 =
    custName.trim() !== "" &&
    custPhone.trim().length === 10 &&
    custZoneId !== "" &&
    custZoneId !== "none";

  const canProceedDummy =
    machName.trim() !== "" &&
    machSerial.trim() !== "" &&
    machCategoryId !== "" &&
    machDivisionId !== "" &&
    !duplicateWarning;

  const canProceedExisting =
    selectedVendor !== null &&
    selectedMachine !== null &&
    selectedSerial !== "" &&
    sellingPrice.trim() !== "" &&
    !duplicateWarning;

  // ── Submit Dummy Mode -> redirect to Raise a Call ──────────────────────────
  const handleDummySubmit = async () => {
    if (!custZoneId || custZoneId === "none") {
      toast.error("Service Zone is required. Please select a valid Service Zone.");
      return;
    }

    if (!canProceedDummy) {
      if (duplicateWarning) {
        toast.error(duplicateWarning);
        return;
      }
      toast.error("Please fill in all required machine fields");
      return;
    }

    if (machModel.trim() && machSerial.trim()) {
      const check = await quickRaiseCallApi.checkModelSerial(machModel.trim(), machSerial.trim());
      if (!check.available) {
        toast.error(check.message);
        setDuplicateWarning(check.message);
        return;
      }
    }

    // Validate TSS contract requirements
    if (selectedContractTypeId && selectedContractTypeId !== "none" && isTSS) {
      if (contractPagesCategories.length === 0) {
        toast.error("Please add at least one Pages Category for Total Service Support (TSS) contract.");
        return;
      }
      for (let i = 0; i < contractPagesCategories.length; i++) {
        const row = contractPagesCategories[i];
        if (!row.pagesCategoryId) {
          toast.error(`Please select a Category for Pages Category #${i + 1}.`);
          return;
        }
        if (row.costPerPage === "" || isNaN(Number(row.costPerPage)) || Number(row.costPerPage) < 0) {
          toast.error(`Please enter a valid Cost/Page for "${row.pagesCategory || `Row #${i + 1}`}".`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const customerPayload: quickRaiseCallApi.QRCCustomerPayload = {
        name: custName.trim(),
        phone: custPhone.trim(),
        email: custEmail.trim() || undefined,
        address: custAddress.trim() || undefined,
        zone: custZoneId,
        department: custDepartment.trim() || undefined,
        userLocation: custUserLocation || (custAddress.trim() ? { address: custAddress.trim() } : undefined),
      };

      const contractPayload: quickRaiseCallApi.QRCContractPayload | undefined =
        selectedContractTypeId && selectedContractTypeId !== "none"
          ? {
              contractTypeId: selectedContractTypeId,
              validFrom: contractValidFrom || undefined,
              validTo: contractValidTo || undefined,
              ...(isTSS
                ? {
                    minCopies: Number(contractMinCopies) || 0,
                    pagesCategories: contractPagesCategories.map((p) => ({
                      pagesCategoryId: p.pagesCategoryId,
                      pagesCategory: p.pagesCategory,
                      costPerPage: Number(p.costPerPage) || 0,
                    })),
                  }
                : {}),
            }
          : undefined;

      const payload: QRCDummyPayload = {
        mode: "dummy",
        customer: customerPayload,
        machine: {
          name: machName.trim(),
          modelNumber: machModel.trim() || undefined,
          partCode: machPartCode.trim() || undefined,
          categoryId: machCategoryId,
          divisionId: machDivisionId,
          serialNumber: machSerial.trim(),
        },
        contract: contractPayload,
      };

      const res = await quickRaiseCallApi.raise(payload);
      toast.success("Machine registered successfully! Redirecting to Raise a Call...");

      const sn = res.machine?.serialNumber || machSerial.trim();
      const mn = res.machine?.modelNumber || machModel.trim();
      navigate(`/calls/raise/detail?serialNumber=${encodeURIComponent(sn)}&modelNumber=${encodeURIComponent(mn)}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Check Existing Mode & Prompt Confirmation Dialog ───────────────────────
  const handleExistingCheckAndPrompt = async () => {
    if (!custZoneId || custZoneId === "none") {
      toast.error("Service Zone is required. Please select a valid Service Zone.");
      return;
    }
    if (!selectedVendor || !selectedMachine || !selectedSerial) {
      toast.error("Please select Vendor, Machine, and Serial Number");
      return;
    }
    if (sellingPrice.trim() === "") {
      toast.error("Selling Price is required. You can enter 0 if free.");
      return;
    }
    if (isNaN(Number(sellingPrice)) || Number(sellingPrice) < 0) {
      toast.error("Please enter a valid positive number for Selling Price");
      return;
    }

    // Validate TSS contract requirements
    if (selectedContractTypeId && selectedContractTypeId !== "none" && isTSS) {
      if (contractPagesCategories.length === 0) {
        toast.error("Please add at least one Pages Category for Total Service Support (TSS) contract.");
        return;
      }
      for (let i = 0; i < contractPagesCategories.length; i++) {
        const row = contractPagesCategories[i];
        if (!row.pagesCategoryId) {
          toast.error(`Please select a Category for Pages Category #${i + 1}.`);
          return;
        }
        if (row.costPerPage === "" || isNaN(Number(row.costPerPage)) || Number(row.costPerPage) < 0) {
          toast.error(`Please enter a valid Cost/Page for "${row.pagesCategory || `Row #${i + 1}`}".`);
          return;
        }
      }
    }

    if (selectedMachine.modelNumber && selectedSerial) {
      const check = await quickRaiseCallApi.checkModelSerial(selectedMachine.modelNumber, selectedSerial);
      if (!check.available) {
        toast.error(check.message);
        setDuplicateWarning(check.message);
        return;
      }
    }

    setConfirmPriceDialogOpen(true);
  };

  // ── Submit Existing Mode -> redirect to Raise a Call ───────────────────────
  const handleExistingSubmit = async () => {
    if (!custZoneId || custZoneId === "none") {
      toast.error("Service Zone is required. Please select a valid Service Zone.");
      return;
    }
    setSubmitting(true);
    try {
      const customerPayload: quickRaiseCallApi.QRCCustomerPayload = {
        name: custName.trim(),
        phone: custPhone.trim(),
        email: custEmail.trim() || undefined,
        address: custAddress.trim() || undefined,
        zone: custZoneId,
        department: custDepartment.trim() || undefined,
        userLocation: custUserLocation || (custAddress.trim() ? { address: custAddress.trim() } : undefined),
      };

      const contractPayload: quickRaiseCallApi.QRCContractPayload | undefined =
        selectedContractTypeId && selectedContractTypeId !== "none"
          ? {
              contractTypeId: selectedContractTypeId,
              validFrom: contractValidFrom || undefined,
              validTo: contractValidTo || undefined,
              ...(isTSS
                ? {
                    minCopies: Number(contractMinCopies) || 0,
                    pagesCategories: contractPagesCategories.map((p) => ({
                      pagesCategoryId: p.pagesCategoryId,
                      pagesCategory: p.pagesCategory,
                      costPerPage: Number(p.costPerPage) || 0,
                    })),
                  }
                : {}),
            }
          : undefined;

      const payload: QRCExistingPayload = {
        mode: "existing",
        customer: customerPayload,
        existing: {
          vendorId: selectedVendor!._id,
          machineId: selectedMachine!.machineId,
          serialNumber: selectedSerial,
          sellingPrice: Number(sellingPrice) || 0,
          companyId: selectedCompanyId || undefined,
        },
        contract: contractPayload,
      };

      const res = await quickRaiseCallApi.raise(payload);
      setConfirmPriceDialogOpen(false);
      toast.success("Machine sold to customer successfully! Redirecting to Raise a Call...");

      const sn = res.machine?.serialNumber || selectedSerial;
      const mn = res.machine?.modelNumber || selectedMachine?.modelNumber || "";
      navigate(`/calls/raise/detail?serialNumber=${encodeURIComponent(sn)}&modelNumber=${encodeURIComponent(mn)}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render TSS Pages Categories UI (Matching Item Sale) ──────────────────
  const renderTssPagesCategories = () => {
    if (!isTSS) return null;
    return (
      <div className="space-y-3 pt-2">
        {/* Min Copies */}
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Min Copies</Label>
          <Input
            type="number"
            min={0}
            placeholder="0"
            value={contractMinCopies}
            onChange={(e) => setContractMinCopies(e.target.value)}
            className="h-8 text-xs bg-background max-w-[200px]"
          />
        </div>

        {/* PAGES CATEGORIES */}
        <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3">
          <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Pages Categories
          </Label>

          <div className="space-y-2">
            {contractPagesCategories.map((pc, pi) => {
              const usedIds = contractPagesCategories.map((p) => p.pagesCategoryId).filter(Boolean);
              const availableOpts = activePagesCats.filter(
                (c) => c._id === pc.pagesCategoryId || !usedIds.includes(c._id)
              );
              return (
                <div key={pi} className="flex items-end gap-2.5 rounded-md border bg-background p-2.5">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[11px] text-muted-foreground font-medium">
                      Category <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={pc.pagesCategoryId}
                      onValueChange={(v) => {
                        const cat = activePagesCats.find((c) => c._id === v);
                        const updated = contractPagesCategories.map((p, idx) =>
                          idx !== pi ? p : { ...p, pagesCategoryId: v, pagesCategory: cat?.name ?? "" }
                        );
                        setContractPagesCategories(updated);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableOpts.map((c) => (
                          <SelectItem key={c._id} value={c._id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-32 space-y-1">
                    <Label className="text-[11px] text-muted-foreground font-medium">
                      Cost/Page <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 text-xs bg-background"
                      placeholder="0.00"
                      value={pc.costPerPage}
                      onChange={(e) => {
                        const updated = contractPagesCategories.map((p, idx) =>
                          idx !== pi ? p : { ...p, costPerPage: e.target.value }
                        );
                        setContractPagesCategories(updated);
                      }}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() =>
                      setContractPagesCategories(contractPagesCategories.filter((_, idx) => idx !== pi))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          {contractPagesCategories.length < activePagesCats.length && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs h-8"
              onClick={() =>
                setContractPagesCategories([
                  ...contractPagesCategories,
                  { pagesCategoryId: "", pagesCategory: "", costPerPage: "" },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add Pages Category
            </Button>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const purchasePrice = selectedMachine?.buyingPriceWithGst || selectedMachine?.buyingPriceBase || 0;
  const selectedContractTypeObj = contractTypes.find((c) => c._id === selectedContractTypeId);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Quick Raise Call"
        description="Quick machine setup & sale — prepares customer & machine inventory, then redirects to Raise a Call"
      >
        <Button variant="outline" className="gap-2" onClick={() => navigate("/calls/raise")}>
          <PhoneOutgoing className="h-4 w-4" />
          Standard Raise Call
        </Button>
      </PageHeader>

      {/* ── Progress steps (2 visible steps — Mode is pre-selected) ── */}
      <div className="flex items-center gap-1 flex-wrap">
        <Step n={1} label="Customer Details" done={step > 2} active={step === 2} />
        <ChevronRight size={14} className="text-muted-foreground" />
        <Step n={2} label="Machine Details"  done={step > 3} active={step === 3} />
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-6 shadow-sm">

        {/* ═══════════════════════════════════════════════════════════════════
            STEP 1 — Mode (hidden — Auto/Dummy is pre-selected, opens at Step 2)
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Step 1 — Select Mode</h2>

            {/* Only Auto / Dummy Vendor is available */}
            <button
              type="button"
              onClick={() => { setMode("dummy"); setStep(2); }}
              className="relative text-left p-5 rounded-xl border-2 border-primary bg-primary/5 w-full transition-all"
            >
              <CheckCircle2 size={18} className="absolute top-3 right-3 text-primary" />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Zap size={20} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Auto / Dummy Vendor</p>
                  <Badge variant="secondary" className="text-[10px] mt-0.5">Recommended for new machines</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                System auto-creates a <strong>Dummy Vendor</strong>, registers the Product in inventory,
                creates a ₹0 purchase &amp; sale, optionally assigns contract, then redirects to Raise Call.
              </p>
            </button>

            <div className="flex justify-end pt-2">
              <Button onClick={() => { setMode("dummy"); setStep(2); }}>
                Next: Customer Details
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            STEP 2 — Customer Details
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Step 2 — Customer Details</h2>
                <p className="text-sm text-muted-foreground">
                  Select an existing customer or enter new customer information with Google Maps address.
                </p>
              </div>
            </div>

            {/* Quick Pick Existing Customer Dropdown */}
            {existingCustomers.length > 0 && (
              <div className="space-y-1.5 p-3.5 rounded-lg border bg-muted/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Search size={13} /> Quick Select Existing Customer (Optional)
                  </Label>
                  {selectedCustomerId && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        setSelectedCustomerId("");
                        setCustName("");
                        setCustPhone("");
                        setCustEmail("");
                        setCustAddress("");
                        setCustUserLocation(null);
                        setCustZoneId("none");
                      }}
                    >
                      Clear / New Customer
                    </button>
                  )}
                </div>
                <Select value={selectedCustomerId} onValueChange={handleExistingCustomerSelect}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Search or select existing customer..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {existingCustomers.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{c.name}</span>
                          <span className="text-muted-foreground font-mono">({c.phone})</span>
                          {c.email && <span className="text-muted-foreground text-xs">· {c.email}</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cust-name">Customer Name <span className="text-destructive">*</span></Label>
                <Input
                  id="cust-name"
                  placeholder="e.g. Rahul Sharma"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cust-phone">Phone Number <span className="text-destructive">*</span></Label>
                <Input
                  id="cust-phone"
                  placeholder="e.g. 9876543210"
                  value={custPhone}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) => setCustPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
                {custPhone.length > 0 && custPhone.length < 10 && (
                  <p className="text-[11px] text-destructive">Phone number must be exactly 10 digits ({10 - custPhone.length} more needed)</p>
                )}
                {custPhone.length === 10 && (
                  <p className="text-[11px] text-green-600">✓ Valid 10-digit number</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cust-email">Email Address <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="cust-email"
                  type="email"
                  placeholder="e.g. rahul@example.com"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cust-department">Department <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="cust-department"
                  placeholder="e.g. IT, Finance, Admin"
                  value={custDepartment}
                  onChange={(e) => setCustDepartment(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cust-zone">
                  Service Zone <span className="text-destructive">*</span>
                </Label>
                <Select value={custZoneId} onValueChange={setCustZoneId}>
                  <SelectTrigger id="cust-zone" className="h-10 text-sm bg-background">
                    <SelectValue placeholder="Select zone..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="none">-- No Zone --</SelectItem>
                    {zones.map((z) => (
                      <SelectItem key={z._id} value={z._id}>
                        {z.name} {z.code ? `(${z.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!custZoneId || custZoneId === "none") && (
                  <p className="text-[11px] text-destructive">
                    Service Zone is required. Please select an active zone.
                  </p>
                )}
              </div>

              {/* Address with Google Places Autocomplete */}
              <div className="space-y-1.5 sm:col-span-2 relative">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cust-address">
                    Address / Location <span className="text-muted-foreground text-xs">(Google Maps enabled)</span>
                  </Label>
                  {custUserLocation?.latitude && (
                    <Badge variant="outline" className="text-green-700 bg-green-50 border-green-300 text-[10px] gap-1">
                      <CheckCircle2 size={11} /> Coordinates Mapped
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="cust-address"
                    placeholder="Search area, locality, or landmark…"
                    value={custAddress}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    onFocus={() => addressSuggestions.length > 0 && setShowAddressSuggestions(true)}
                    autoComplete="off"
                  />
                  {showAddressSuggestions && addressSuggestions.length > 0 && (
                    <div
                      ref={suggestionsBoxRef}
                      className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto"
                    >
                      {addressSuggestions.map((s) => (
                        <button
                          key={s.place_id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-accent flex items-start gap-2 border-b last:border-b-0"
                          onClick={() => {
                            handleSuggestionClick(s.description, s.place_id);
                          }}
                        >
                          <MapPin size={14} className="mt-1 text-primary shrink-0" />
                          <span className="line-clamp-2">{s.description}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Powered by Google Places. Type an area, street, or landmark to search and auto-detect latitude/longitude.
                </p>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!canGoStep3}>
                Next: Machine Details
              </Button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            STEP 3 — Machine Details & Proceed
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Step 3 — Machine Details</h2>
              <p className="text-sm text-muted-foreground">
                {mode === "existing"
                  ? "Select Vendor, Machine, and Serial Number. Set selling price and optional contract."
                  : "Enter machine details (Category: Product). Set optional contract."}
              </p>
            </div>

            {/* Duplicate Model+Serial Warning Notice */}
            {duplicateWarning && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 animate-in fade-in">
                <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Duplicate Serial Number Detected</p>
                  <p>{duplicateWarning}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Note: Different models can use the same serial number, but the same model cannot have duplicate serial numbers.
                  </p>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                EXISTING MODE: Vendor, Machine, and Serial Number in DROPDOWNS
            ═══════════════════════════════════════════════════════════════ */}
            {mode === "existing" && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                  <Building2 size={15} className="mt-0.5 shrink-0" />
                  <span>
                    Select from <strong>Vendor</strong>, <strong>Machine</strong>, and <strong>Serial Number</strong>. Machine details and Purchase Price are displayed automatically.
                  </span>
                </div>

                {/* 1. VENDOR DROPDOWN */}
                <div className="space-y-1.5">
                  <Label htmlFor="qrc-vendor-select">
                    1. Vendor <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedVendorId}
                    onValueChange={(vid) => {
                      setSelectedVendorId(vid);
                      setSelectedMachineId("");
                      setSelectedSerial("");
                    }}
                  >
                    <SelectTrigger id="qrc-vendor-select" className="h-10 text-sm">
                      <SelectValue placeholder="Select vendor from list..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {allRealVendors.map((v) => (
                        <SelectItem key={v._id} value={v._id}>
                          <div className="flex items-center gap-2 py-0.5">
                            <span className="font-semibold">{v.name}</span>
                            {v.companyName && <span className="text-muted-foreground">({v.companyName})</span>}
                            <span
                              className={`text-xs ml-auto pl-2 font-mono ${
                                v.availableStockCount > 0
                                  ? "text-muted-foreground"
                                  : "text-amber-600 font-semibold"
                              }`}
                            >
                              {v.availableStockCount > 0
                                ? `${v.availableStockCount} in stock`
                                : "0 in stock"}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                      {allRealVendors.length === 0 && (
                        <div className="p-3 text-sm text-muted-foreground text-center">
                          No real vendors found in system.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedVendor && selectedVendor.availableStockCount === 0 && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 animate-in fade-in">
                      <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                      <span>
                        Vendor <strong>{selectedVendor.name}</strong> currently has 0 available product units in active purchases.
                        To use this vendor, please create a purchase for it first, or switch to <strong>Auto / Dummy Vendor Mode</strong>.
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. MACHINE DROPDOWN */}
                <div className="space-y-1.5">
                  <Label htmlFor="qrc-machine-select">
                    2. Machine (Product) <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedMachineId}
                    onValueChange={(mid) => {
                      setSelectedMachineId(mid);
                      setSelectedSerial("");
                    }}
                    disabled={!selectedVendor}
                  >
                    <SelectTrigger id="qrc-machine-select" className="h-10 text-sm" disabled={!selectedVendor}>
                      <SelectValue placeholder={selectedVendor ? "Select machine from list..." : "Choose a vendor first"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {selectedVendor?.machines.map((m) => (
                        <SelectItem key={m.machineId?.toString()} value={m.machineId?.toString()}>
                          <div className="flex items-center gap-2 py-0.5">
                            <span className="font-semibold">{m.machineName}</span>
                            {m.modelNumber && <span className="text-muted-foreground font-mono">({m.modelNumber})</span>}
                            <span className="text-xs text-muted-foreground">· Product / {m.division}</span>
                            <span className="text-xs text-muted-foreground ml-auto pl-2 font-mono">
                              ({m.availableSerials.length} available)
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                      {selectedVendor && selectedVendor.machines.length === 0 && (
                        <div className="p-3 text-sm text-muted-foreground text-center">
                          No product machines found with available stock for this vendor.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* 3. SERIAL NUMBER DROPDOWN */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="qrc-serial-select">
                      3. Serial Number <span className="text-destructive">*</span>
                    </Label>
                    {checkingDuplicate && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Loader2 size={11} className="animate-spin" /> Verifying uniqueness…
                      </span>
                    )}
                  </div>
                  <Select
                    value={selectedSerial}
                    onValueChange={setSelectedSerial}
                    disabled={!selectedMachine}
                  >
                    <SelectTrigger id="qrc-serial-select" className="h-10 text-sm" disabled={!selectedMachine}>
                      <SelectValue placeholder={selectedMachine ? "Select serial number from list..." : "Choose a machine first"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {selectedMachine?.availableSerials.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="font-mono font-medium">{s}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Machine Details Card (shown when machine and serial are selected) */}
                {selectedVendor && selectedMachine && selectedSerial && (
                  <div className="rounded-xl border bg-muted/20 p-4 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
                        <CheckCircle2 size={16} className="text-green-600" /> Machine Details
                      </h3>
                      <Badge variant="outline" className="font-mono text-xs">
                        SN: {selectedSerial}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Machine Name:</span>
                        <span className="font-semibold text-foreground text-sm">{selectedMachine.machineName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Model Number:</span>
                        <span className="font-mono font-medium text-foreground">{selectedMachine.modelNumber || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Part Code:</span>
                        <span className="font-mono text-foreground">{selectedMachine.partCode || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Category:</span>
                        <Badge variant="secondary" className="text-[10px] mt-0.5">Product</Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Division:</span>
                        <span className="font-medium text-foreground">{selectedMachine.division || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Vendor:</span>
                        <span className="font-medium text-foreground">{selectedVendor.name}</span>
                      </div>
                    </div>

                    {/* Purchase Price Display */}
                    <div className="pt-2 border-t flex items-center justify-between bg-background p-3 rounded-lg border">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground block">Purchase Price</span>
                        <span className="text-lg font-bold text-foreground">
                          ₹ {purchasePrice.toLocaleString()}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs">From Vendor Purchase</Badge>
                    </div>

                    {/* Company Selection */}
                    {companies.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <Label htmlFor="qrc-company-select" className="text-xs font-medium">
                          Select Company <span className="text-muted-foreground text-[11px]">(Billing entity)</span>
                        </Label>
                        <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                          <SelectTrigger id="qrc-company-select" className="h-9 text-sm bg-background">
                            <SelectValue placeholder="Select Company..." />
                          </SelectTrigger>
                          <SelectContent>
                            {companies.map((c) => (
                              <SelectItem key={c._id} value={c._id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Selling Price Input (starts empty, compulsory, 0 allowed) */}
                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="qrc-selling-price" className="text-xs font-semibold">
                        Selling Price (₹) <span className="text-destructive">*</span>{" "}
                        <span className="text-muted-foreground font-normal">(Compulsory — enter 0 if free)</span>
                      </Label>
                      <Input
                        id="qrc-selling-price"
                        type="number"
                        min={0}
                        placeholder="Enter selling price (e.g. 0)"
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(e.target.value)}
                        className="h-10 text-base font-semibold bg-background"
                      />
                      {sellingPrice.trim() !== "" && Number(sellingPrice) === 0 && (
                        <p className="text-xs text-orange-600 flex items-center gap-1 font-medium">
                          <AlertCircle size={12} /> Selling at ₹0 — invoice will be recorded as Paid with ₹0.
                        </p>
                      )}
                      {sellingPrice.trim() !== "" && Number(sellingPrice) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Sale will be recorded for ₹{Number(sellingPrice).toLocaleString()}.
                        </p>
                      )}
                    </div>

                    {/* Service Contract (Optional) */}
                    <div className="space-y-3 pt-3 border-t">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <FileSignature size={14} className="text-primary" /> Service Contract (Optional)
                        </Label>
                        {selectedContractTypeId && selectedContractTypeId !== "none" && (
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => setSelectedContractTypeId("")}
                          >
                            Remove Contract (Go without contract)
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Select
                          value={selectedContractTypeId}
                          onValueChange={handleContractTypeChange}
                        >
                          <SelectTrigger className="h-9 text-sm bg-background">
                            <SelectValue placeholder="-- No Contract (Go without contract) --" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">-- No Contract (Go without contract) --</SelectItem>
                            {contractTypes.map((ct) => (
                              <SelectItem key={ct._id} value={ct._id}>
                                {ct.name} {ct.code ? `(${ct.code})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedContractTypeId && selectedContractTypeId !== "none" && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border bg-background">
                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Valid From</Label>
                              <Input
                                type="date"
                                value={contractValidFrom}
                                onChange={(e) => setContractValidFrom(e.target.value)}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-medium">Valid To</Label>
                              <Input
                                type="date"
                                value={contractValidTo}
                                onChange={(e) => setContractValidTo(e.target.value)}
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                          {renderTssPagesCategories()}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                DUMMY / AUTO MODE
            ═══════════════════════════════════════════════════════════════ */}
            {mode === "dummy" && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
                  <Zap size={15} className="mt-0.5 shrink-0" />
                  <span>
                    Auto mode: Machine category is locked to <strong>Product</strong>. Pick an existing product from inventory or enter new details.
                  </span>
                </div>

                {/* Quick select existing machine dropdown */}
                {existingSystemMachines.length > 0 && (
                  <div className="space-y-2 p-3.5 rounded-lg border bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Search size={13} /> Quick Select Machine from Inventory ({existingSystemMachines.length} available)
                      </Label>
                      {selectedExistingMachineId && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            setSelectedExistingMachineId("");
                            setMachName("");
                            setMachModel("");
                            setMachPartCode("");
                          }}
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                    {existingSystemMachines.length > 8 && (
                      <Input
                        type="text"
                        placeholder="Search machine by name, model or part code…"
                        value={machineSearch}
                        onChange={(e) => setMachineSearch(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                    )}
                    <Select value={selectedExistingMachineId} onValueChange={handleExistingSystemMachineSelect}>
                      <SelectTrigger className="h-9 text-sm bg-background">
                        <SelectValue placeholder={`Pick machine (${filteredSystemMachines.length} shown)...`} />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {filteredSystemMachines.map((m) => (
                          <SelectItem key={m._id} value={m._id}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{m.name}</span>
                              {m.modelNumber && <span className="text-muted-foreground font-mono">({m.modelNumber})</span>}
                              {m.partCode && <span className="text-muted-foreground text-xs font-mono">[{m.partCode}]</span>}
                            </div>
                          </SelectItem>
                        ))}
                        {filteredSystemMachines.length === 0 && (
                          <div className="p-3 text-xs text-muted-foreground text-center">
                            No matching machines found.
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Machine Name <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g. Canon iR 2520"
                      value={machName}
                      onChange={(e) => setMachName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Model Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      placeholder="e.g. 2520"
                      value={machModel}
                      onChange={(e) => setMachModel(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Part Code <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      placeholder="e.g. CAN-2520"
                      value={machPartCode}
                      onChange={(e) => setMachPartCode(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Category <span className="text-destructive">*</span></Label>
                    <Select value={machCategoryId} onValueChange={setMachCategoryId}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Division <span className="text-destructive">*</span></Label>
                    <Select value={machDivisionId} onValueChange={setMachDivisionId}>
                      <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                      <SelectContent>
                        {divisions.map((d) => (
                          <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label>Serial Number <span className="text-destructive">*</span></Label>
                      {checkingDuplicate && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Loader2 size={11} className="animate-spin" /> Verifying uniqueness…
                        </span>
                      )}
                    </div>
                    <Input
                      placeholder="e.g. SN-ABC123"
                      value={machSerial}
                      onChange={(e) => setMachSerial(e.target.value)}
                    />
                  </div>
                </div>

                {/* Service Contract (Optional) in Dummy Mode */}
                <div className="space-y-3 pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <FileSignature size={14} className="text-primary" /> Service Contract (Optional)
                    </Label>
                    {selectedContractTypeId && selectedContractTypeId !== "none" && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => handleContractTypeChange("")}
                      >
                        Remove Contract (Go without contract)
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Select
                      value={selectedContractTypeId}
                      onValueChange={handleContractTypeChange}
                    >
                      <SelectTrigger className="h-9 text-sm bg-background">
                        <SelectValue placeholder="-- No Contract (Go without contract) --" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- No Contract (Go without contract) --</SelectItem>
                        {contractTypes.map((ct) => (
                          <SelectItem key={ct._id} value={ct._id}>
                            {ct.name} {ct.code ? `(${ct.code})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedContractTypeId && selectedContractTypeId !== "none" && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/20">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Valid From</Label>
                          <Input
                            type="date"
                            value={contractValidFrom}
                            onChange={(e) => setContractValidFrom(e.target.value)}
                            className="h-8 text-xs bg-background"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Valid To</Label>
                          <Input
                            type="date"
                            value={contractValidTo}
                            onChange={(e) => setContractValidTo(e.target.value)}
                            className="h-8 text-xs bg-background"
                          />
                        </div>
                      </div>
                      {renderTssPagesCategories()}
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep(2)}>Back to Customer</Button>
              {mode === "dummy" ? (
                <Button
                  onClick={handleDummySubmit}
                  disabled={!canProceedDummy || submitting}
                  className="min-w-[180px]"
                >
                  {submitting ? (
                    <><Loader2 size={15} className="animate-spin mr-2" /> Registering…</>
                  ) : (
                    <><PhoneOutgoing size={15} className="mr-2" /> Proceed to Raise Call</>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleExistingCheckAndPrompt}
                  disabled={!canProceedExisting || submitting}
                  className="min-w-[180px]"
                >
                  <PhoneOutgoing size={15} className="mr-2" /> Proceed to Raise Call
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CONFIRMATION POPUP FOR EXISTING VENDOR MODE
      ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={confirmPriceDialogOpen} onOpenChange={setConfirmPriceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle size={20} className="text-primary" /> Confirm Selling Price &amp; Details
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm py-2">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Machine:</span>
                <span className="font-semibold text-foreground">{selectedMachine?.machineName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model Number:</span>
                <span className="font-mono font-medium text-foreground">{selectedMachine?.modelNumber || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Serial Number:</span>
                <span className="font-mono font-medium text-foreground">{selectedSerial}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium text-foreground">{custName}</span>
              </div>
              {custZoneId && custZoneId !== "none" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Zone:</span>
                  <span className="font-medium text-foreground">
                    {zones.find((z) => z._id === custZoneId)?.name || custZoneId}
                  </span>
                </div>
              )}
              {selectedCompany && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing Company:</span>
                  <span className="font-medium text-foreground">{selectedCompany.name}</span>
                </div>
              )}
              {selectedContractTypeObj && selectedContractTypeId !== "none" && (
                <div className="flex flex-col gap-1 border-t pt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contract:</span>
                    <span className="font-medium text-foreground text-green-700">
                      {selectedContractTypeObj.name} ({contractValidFrom} to {contractValidTo})
                    </span>
                  </div>
                  {isTSS && contractPagesCategories.length > 0 && (
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                      <span className="font-medium">Pages:</span>
                      {contractPagesCategories.map((p, idx) => (
                        <span key={idx} className="bg-muted px-1.5 py-0.5 rounded font-mono">
                          {p.pagesCategory || "Category"}: ₹{p.costPerPage || 0}/page
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-background">
              <div>
                <span className="text-xs text-muted-foreground block">Purchase Price</span>
                <span className="text-base font-bold text-foreground">
                  ₹ {purchasePrice.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Selling Price</span>
                <span className="text-base font-bold text-primary">
                  ₹ {Number(sellingPrice || 0).toLocaleString()}
                </span>
              </div>
            </div>

            {Number(sellingPrice) === 0 ? (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                Selling price is <strong>₹0</strong>. Are you sure you want to proceed with this price or cancel?
              </div>
            ) : Number(sellingPrice) < purchasePrice ? (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                Selling price (₹{Number(sellingPrice).toLocaleString()}) is lower than purchase price (₹{purchasePrice.toLocaleString()}). Do you want to proceed with this price or cancel?
              </div>
            ) : (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                Do you want to proceed with Selling Price <strong>₹{Number(sellingPrice).toLocaleString()}</strong> to raise a service call, or cancel?
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmPriceDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleExistingSubmit} disabled={submitting}>
              {submitting ? (
                <><Loader2 size={14} className="animate-spin mr-1.5" /> Processing…</>
              ) : (
                "Proceed to Raise Call"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuickRaiseCallPage;
