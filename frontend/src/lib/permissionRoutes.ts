// Ordered list of permission key → route, matching sidebar order
const PERMISSION_ROUTES: { key: string; path: string }[] = [
  { key: "dashboard",          path: "/dashboard" },
  { key: "companies",          path: "/companies" },
  { key: "zones",              path: "/zones" },
  { key: "contract-types",     path: "/contract-types" },
  { key: "pages-categories",   path: "/pages-categories" },
  { key: "vendors",            path: "/vendors" },
  { key: "machine-divisions",  path: "/machine-divisions" },
  { key: "machine-categories", path: "/machine-categories" },
  { key: "machines-add",       path: "/machines/add" },
  { key: "machines-list",      path: "/machines" },
  { key: "inventory-logs",     path: "/inventory-logs" },
  { key: "purchase-machines",  path: "/purchase-machines" },
  { key: "sell-machines",      path: "/sell-machines" },
  { key: "calls",              path: "/calls" },
  { key: "calls-raise",        path: "/calls/raise" },
  { key: "reimbursements",     path: "/reimbursements" },
  { key: "problem-types",      path: "/problem-types" },
  { key: "customers",          path: "/customers" },
  { key: "permissions",        path: "/permissions" },
  { key: "roles",              path: "/roles" },
  { key: "system-users",       path: "/users" },
  { key: "engineers",          path: "/engineers" },
  { key: "engineer-performance", path: "/engineers/performance" },
];

export const getFirstAllowedRoute = (permissions: string[], role: string): string => {
  if (role === "Admin") return "/dashboard";
  const match = PERMISSION_ROUTES.find((r) => permissions.includes(r.key));
  return match ? match.path : "/profile";
};
