import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/axiosInterceptor";

interface ProfileData {
  name: string;
  role: string;
  profilePhoto?: string;
  permissions: string[];
}

interface ProfileContextType {
  profile: ProfileData | null;
  hasPermission: (key: string) => boolean;
  refreshProfile: () => void;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  hasPermission: () => false,
  refreshProfile: () => {},
});

export const ProfileProvider = ({ children }: { children: React.ReactNode }) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const refreshProfile = useCallback(() => {
    api.get("/admin/system-users/me")
      .then(res => setProfile({
        name:         res.data.data.name,
        role:         res.data.data.role,
        profilePhoto: res.data.data.profilePhoto,
        permissions:  res.data.data.permissions ?? [],
      }))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshProfile(); }, []);

  const hasPermission = (key: string) => {
    if (!profile) return false;
    if (profile.role === "Admin") return true;
    return profile.permissions.includes(key);
  };

  return (
    <ProfileContext.Provider value={{ profile, hasPermission, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
