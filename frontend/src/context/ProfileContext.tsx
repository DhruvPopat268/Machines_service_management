import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/axiosInterceptor";

interface ProfileData {
  name: string;
  role: string;
  profilePhoto?: string;
}

interface ProfileContextType {
  profile: ProfileData | null;
  refreshProfile: () => void;
}

const ProfileContext = createContext<ProfileContextType>({ profile: null, refreshProfile: () => {} });

export const ProfileProvider = ({ children }: { children: React.ReactNode }) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const refreshProfile = useCallback(() => {
    api.get("/admin/system-users/me")
      .then(res => setProfile({
        name:         res.data.data.name,
        role:         res.data.data.role,
        profilePhoto: res.data.data.profilePhoto,
      }))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshProfile(); }, []);

  return (
    <ProfileContext.Provider value={{ profile, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
