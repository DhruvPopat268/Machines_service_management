import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import { UserCircle, User, Building2, Lock, X, Eye, EyeOff, Navigation } from "lucide-react";
import api from "@/lib/axiosInterceptor";
import { useProfile } from "@/context/ProfileContext";
import { cn } from "@/lib/utils";

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
let gmapsLoaded = false;
const loadGMaps = () => new Promise<void>((resolve) => {
  if (gmapsLoaded || (window as any).google?.maps) { gmapsLoaded = true; resolve(); return; }
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places`;
  s.async = true;
  s.onload = () => { gmapsLoaded = true; resolve(); };
  document.head.appendChild(s);
});

const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GMAPS_KEY}`);
  const data = await res.json();
  return data.results?.[0]?.formatted_address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
};

interface SystemUser {
  _id: string; name: string; email: string; phone: string;
  role: string; status: string; engineerId?: string; profilePhoto?: string;
  officeLocation?: { address?: string; latitude?: number; longitude?: number };
  lastLoginAt: string | null;
  lastActivityAt: string | null;
}

type Section = "profile" | "office" | "security";

const NAV: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "profile",  label: "Update Profile",    icon: <User className="h-4 w-4" /> },
  { key: "office",   label: "Office Location",   icon: <Building2 className="h-4 w-4" /> },
  { key: "security", label: "Security Settings", icon: <Lock className="h-4 w-4" /> },
];

const formatIST = (iso: string) => {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
};


interface Suggestion { place_id: string; description: string; }

const getLatLng = (placeId: string): Promise<{ lat: number; lng: number } | null> =>
  new Promise((resolve) => {
    const map     = new (window as any).google.maps.Map(document.createElement("div"));
    const service = new (window as any).google.maps.places.PlacesService(map);
    service.getDetails({ placeId, fields: ["geometry"] }, (place: any, status: string) => {
      if (status === "OK" && place?.geometry?.location)
        resolve({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
      else resolve(null);
    });
  });

const OfficeMap = ({ initialCoords, onPick, moveRef }: {
  initialCoords: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number, address: string) => void;
  moveRef: React.MutableRefObject<((lat: number, lng: number) => void) | null>;
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGMaps().then(() => {
      if (cancelled || !mapRef.current) return;
      const center = initialCoords ?? { lat: 20.5937, lng: 78.9629 };
      const map = new (window as any).google.maps.Map(mapRef.current, {
        center, zoom: initialCoords ? 15 : 5,
        streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
      });
      const marker = new (window as any).google.maps.Marker({ position: center, map, draggable: true });

      const pick = async (lat: number, lng: number) => {
        try   { onPick(lat, lng, await reverseGeocode(lat, lng)); }
        catch { onPick(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`); }
      };

      // expose move function so address autocomplete can pan + move marker
      moveRef.current = (lat: number, lng: number) => {
        marker.setPosition({ lat, lng });
        map.panTo({ lat, lng });
        map.setZoom(16);
      };

      marker.addListener("dragend", (e: any) => pick(e.latLng.lat(), e.latLng.lng()));
      map.addListener("click", (e: any) => { marker.setPosition(e.latLng); pick(e.latLng.lat(), e.latLng.lng()); });
      if (initialCoords) pick(initialCoords.lat, initialCoords.lng);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="relative rounded-md overflow-hidden border" style={{ height: 280 }}>
      {!ready && <div className="absolute inset-0 flex items-center justify-center bg-muted z-10"><Spinner /></div>}
      <div ref={mapRef} className="h-full w-full" />
    </div>
  );
};

// ─── Address autocomplete field ───────────────────────────────────────────────
const AddressAutocomplete = ({ value, onChange, onSelect }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (address: string, lat: number, lng: number) => void;
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [show, setShow]               = useState(false);
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef                    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetch = (val: string) => {
    if (!GMAPS_KEY || val.trim().length < 3) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await loadGMaps();
        const svc = new (window as any).google.maps.places.AutocompleteService();
        svc.getPlacePredictions(
          { input: val, language: "en", componentRestrictions: { country: "in" } },
          (preds: any[], status: string) => {
            if (status === "OK" && preds) {
              setSuggestions(preds.map((p: any) => ({ place_id: p.place_id, description: p.description })));
              setShow(true);
            } else setSuggestions([]);
          }
        );
      } catch { setSuggestions([]); }
    }, 400);
  };

  const handleSelect = async (s: Suggestion) => {
    onChange(s.description);
    setSuggestions([]); setShow(false);
    try {
      await loadGMaps();
      const coords = await getLatLng(s.place_id);
      if (coords) onSelect(s.description, coords.lat, coords.lng);
    } catch {}
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); fetch(e.target.value); }}
        onFocus={() => suggestions.length > 0 && setShow(true)}
        placeholder="Start typing an address..."
        autoComplete="off"
      />
      {show && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-52 overflow-y-auto">
          {suggestions.map(s => (
            <button
              key={s.place_id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
            >
              {s.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const ProfilePage = () => {
  const [user, setUser]       = useState<SystemUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive]   = useState<Section>("profile");

  // per-section submitting
  const { refreshProfile } = useProfile();
  const [subProfile,  setSubProfile]  = useState(false);
  const [subOffice,   setSubOffice]   = useState(false);
  const [subSecurity, setSubSecurity] = useState(false);

  // profile form
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const photoRef          = useRef<HTMLInputElement>(null);

  // office form
  const [officeAddress, setOfficeAddress] = useState("");
  const [officeLat, setOfficeLat]         = useState("");
  const [officeLng, setOfficeLng]         = useState("");
  const [officeCoords, setOfficeCoords]   = useState<{ lat: number; lng: number } | null>(null);
  const moveMarkerRef                     = useRef<((lat: number, lng: number) => void) | null>(null);

  // security form
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCur, setShowCur]       = useState(false);
  const [showNew, setShowNew]       = useState(false);
  const [showCon, setShowCon]       = useState(false);

  // section refs for scroll
  const sectionRefs: Record<Section, React.RefObject<HTMLDivElement>> = {
    profile:  useRef<HTMLDivElement>(null),
    office:   useRef<HTMLDivElement>(null),
    security: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    api.get("/admin/system-users/me")
      .then(res => {
        const u: SystemUser = res.data.data;
        setUser(u); setName(u.name); setEmail(u.email); setPhone(u.phone);
        if (u.officeLocation) {
          setOfficeAddress(u.officeLocation.address || "");
          setOfficeLat(u.officeLocation.latitude?.toString() || "");
          setOfficeLng(u.officeLocation.longitude?.toString() || "");
          if (u.officeLocation.latitude && u.officeLocation.longitude)
            setOfficeCoords({ lat: u.officeLocation.latitude, lng: u.officeLocation.longitude });
        }
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  // IntersectionObserver — highlight nav as sections scroll into view
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    (Object.keys(sectionRefs) as Section[]).forEach((key) => {
      const el = sectionRefs[key].current;
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActive(key); },
        { threshold: 0.4 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach(o => o.disconnect());
  }, [loading]);

  const scrollTo = (key: Section) => {
    setActive(key);
    sectionRefs[key].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleMapPick = (lat: number, lng: number, address: string) => {
    setOfficeCoords({ lat, lng });
    setOfficeAddress(address);
    setOfficeLat(lat.toFixed(6));
    setOfficeLng(lng.toFixed(6));
  };

  const handleAddressSelect = (address: string, lat: number, lng: number) => {
    setOfficeCoords({ lat, lng });
    setOfficeAddress(address);
    setOfficeLat(lat.toFixed(6));
    setOfficeLng(lng.toFixed(6));
    moveMarkerRef.current?.(lat, lng);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try   { handleMapPick(lat, lng, await reverseGeocode(lat, lng)); }
        catch { handleMapPick(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`); }
      },
      () => toast.error("Could not get current location")
    );
  };

  const handleSaveProfile = async () => {
    setSubProfile(true);
    try {
      let payload: any;
      if (photo) {
        const fd = new FormData();
        fd.append("name", name); fd.append("email", email); fd.append("phone", phone);
        fd.append("profilePhoto", photo);
        payload = fd;
      } else {
        payload = { name, email, phone };
      }
      const res = await api.patch("/admin/system-users/me", payload);
      setUser(res.data.data); setPhoto(null); refreshProfile();
      if (photoRef.current) photoRef.current.value = "";
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update profile");
    } finally { setSubProfile(false); }
  };

  const handleSaveOffice = async () => {
    if (!officeCoords) return toast.error("Please pick a location on the map");
    setSubOffice(true);
    try {
      const res = await api.patch("/admin/system-users/me", {
        officeLocation: { address: officeAddress, latitude: officeCoords.lat, longitude: officeCoords.lng },
      });
      setUser(res.data.data);
      toast.success("Office location saved");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save location");
    } finally { setSubOffice(false); }
  };

  const handleSaveSecurity = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) return toast.error("All password fields are required");
    if (newPwd.length < 6)                      return toast.error("New password must be at least 6 characters");
    if (newPwd !== confirmPwd)                   return toast.error("Passwords do not match");
    setSubSecurity(true);
    try {
      await api.patch("/admin/system-users/me/change-password", { currentPassword: currentPwd, newPassword: newPwd });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      toast.success("Password changed successfully");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to change password");
    } finally { setSubSecurity(false); }
  };

  if (loading) return <Spinner />;
  if (!user)   return <p className="text-muted-foreground text-sm">Profile not found.</p>;

  const avatarSrc = photo ? URL.createObjectURL(photo) : user.profilePhoto;

  return (
    <div className="flex gap-6 h-[calc(100vh-7rem)] overflow-hidden">

      {/* ── Left nav (sticky) ── */}
      <div className="w-72 shrink-0 space-y-3 h-full overflow-y-auto">

        {/* Avatar + identity */}
        <Card className="border-0 shadow-sm">
          <CardContent className="py-5 flex flex-col items-center gap-2 text-center">
            <div className="relative">
              {avatarSrc
                ? <img src={avatarSrc} alt={user.name} className="h-16 w-16 rounded-full object-cover border-2 border-border" />
                : <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center border-2 border-border"><UserCircle className="h-8 w-8 text-muted-foreground" /></div>
              }
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              <button
                onClick={() => photoRef.current?.click()}
                className="absolute bottom-0 right-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background hover:bg-primary/90 transition-colors"
                title="Change photo"
              >
                <User className="h-2.5 w-2.5" />
              </button>
            </div>
            {photo && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate max-w-[110px]">{photo.name}</span>
                <button onClick={() => { setPhoto(null); if (photoRef.current) photoRef.current.value = ""; }}>
                  <X className="h-3 w-3 hover:text-destructive" />
                </button>
              </div>
            )}
            <div>
              <p className="font-semibold text-sm">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.role === "Admin" ? "Administrator" : user.role}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <StatusBadge status={user.role} />
              <StatusBadge status={user.status} />
            </div>
            {user.engineerId && <p className="text-xs text-muted-foreground">ID: {user.engineerId}</p>}
            <Separator className="my-1" />
            <div className="w-full space-y-1 text-left">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Last Login</span>
                <span className="font-medium">{user.lastLoginAt ? formatIST(user.lastLoginAt) : "Never"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Last Activity</span>
                <span className="font-medium">{user.lastActivityAt ? formatIST(user.lastActivityAt) : "Never"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nav */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-2 space-y-0.5">
            {NAV.filter(n => n.key !== "office" || user.role === "Admin").map(n => (
              <button
                key={n.key}
                onClick={() => scrollTo(n.key)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors text-left",
                  active === n.key
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {n.icon}{n.label}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Right: all sections always visible ── */}
      <div className="flex-1 min-w-0 space-y-4 h-full overflow-y-auto pr-1">

        {/* Update Profile */}
        <div ref={sectionRefs.profile}>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <User className="h-4 w-4" /> Personal Information
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </CardContent>
            <div className="px-6 pb-5 flex justify-end">
              <Button onClick={handleSaveProfile} disabled={subProfile} className="px-8">
                {subProfile ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </Card>
        </div>

        {/* Office Location */}
        {user.role === "Admin" && (
        <div ref={sectionRefs.office}>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Office Location
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-1.5">
                <Label>Address</Label>
                <AddressAutocomplete
                  value={officeAddress}
                  onChange={setOfficeAddress}
                  onSelect={handleAddressSelect}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Latitude</Label>
                  <Input value={officeLat} readOnly className="bg-muted/40 cursor-default" />
                </div>
                <div className="space-y-1.5">
                  <Label>Longitude</Label>
                  <Input value={officeLng} readOnly className="bg-muted/40 cursor-default" />
                </div>
              </div>
              <OfficeMap initialCoords={officeCoords} onPick={handleMapPick} moveRef={moveMarkerRef} />
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleUseCurrentLocation}>
                <Navigation className="h-3.5 w-3.5" /> Use Current Location
              </Button>
            </CardContent>
            <div className="px-6 pb-5 flex justify-end">
              <Button onClick={handleSaveOffice} disabled={subOffice} className="px-8">
                {subOffice ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </Card>
        </div>
        )}

        {/* Security Settings */}
        <div ref={sectionRefs.security}>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Lock className="h-4 w-4" /> Change Password
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4 space-y-3">
              {([
                { label: "Current Password", value: currentPwd, set: setCurrentPwd, show: showCur, toggle: () => setShowCur(p => !p) },
                { label: "New Password",     value: newPwd,     set: setNewPwd,     show: showNew, toggle: () => setShowNew(p => !p) },
                { label: "Confirm Password", value: confirmPwd, set: setConfirmPwd, show: showCon, toggle: () => setShowCon(p => !p) },
              ] as const).map(({ label, value, set, show, toggle }) => (
                <div key={label} className="space-y-1.5">
                  <Label>{label}</Label>
                  <div className="relative">
                    <Input type={show ? "text" : "password"} value={value} onChange={(e) => set(e.target.value)} placeholder="••••••••" />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={toggle}>
                      {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
            <div className="px-6 pb-5 flex justify-end">
              <Button onClick={handleSaveSecurity} disabled={subSecurity} className="px-8">
                {subSecurity ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
};

export default ProfilePage;
