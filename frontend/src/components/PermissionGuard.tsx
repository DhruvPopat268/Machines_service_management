import { Navigate } from "react-router-dom";
import { useProfile } from "@/context/ProfileContext";
import { getFirstAllowedRoute } from "@/lib/permissionRoutes";
import Spinner from "@/components/Spinner";

const PermissionGuard = ({ permKey, children }: { permKey: string; children: React.ReactNode }) => {
  const { profile, hasPermission } = useProfile();

  if (!profile) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  if (!hasPermission(permKey)) {
    const redirectTo = getFirstAllowedRoute(profile.permissions, profile.role);
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default PermissionGuard;
