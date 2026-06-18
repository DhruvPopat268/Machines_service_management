import {
  LayoutDashboard, Users, PhoneCall, Wrench, HardDrive, UserCog, ShieldCheck, ShieldHalf,
  ChevronDown, FileText, HardHat, MapPin, Layers, Tag, FileSignature, Truck, ShoppingBag, ShoppingCart, Receipt, PhoneOutgoing, LayoutList, Building2, BarChart2,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useProfile } from "@/context/ProfileContext";

const linkClass = "flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors";
const activeClass = "bg-sidebar-accent text-sidebar-primary font-semibold";
const labelClass = "flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md";

function SidebarLink({ to, icon: Icon, label, collapsed }: { to: string; icon: any; label: string; collapsed: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        {collapsed ? (
          <NavLink to={to} end className={linkClass} activeClassName={activeClass}>
            <Icon className="h-4 w-4 shrink-0" />
          </NavLink>
        ) : (
          <NavLink to={to} end className={labelClass} activeClassName="text-sidebar-primary font-semibold">
            <span className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </span>
          </NavLink>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NestedCollapsible({ label, icon: Icon, urls, items, collapsed }: {
  label: string; icon: any; urls: string[]; items: { title: string; url: string; icon: any }[]; collapsed: boolean;
}) {
  const location = useLocation();
  const isActive = urls.some((u) => location.pathname === u || location.pathname.startsWith(u + "/"));
  const [open, setOpen] = useState(isActive);

  if (collapsed) return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild>
            <NavLink to={item.url} end className={linkClass} activeClassName={activeClass}>
              <item.icon className="h-4 w-4 shrink-0" />
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors">
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <NavLink to={item.url} end className={cn(linkClass, "pl-8")} activeClassName={activeClass}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.title}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { hasPermission } = useProfile();

  // Inventory machine items filtered by permission
  const machineItems = [
    ...(hasPermission("machines-add")  ? [{ title: "Add Machine",   url: "/machines/add", icon: HardDrive }] : []),
    ...(hasPermission("machines-list") ? [{ title: "Machine List",  url: "/machines",     icon: HardDrive }] : []),
  ];

  const showInventorySection =
    hasPermission("machine-divisions") ||
    hasPermission("machine-categories") ||
    machineItems.length > 0 ||
    hasPermission("inventory-logs");

  const showSystemUsersSection =
    hasPermission("permissions") || hasPermission("roles") || hasPermission("system-users");

  const showEngineersSection =
    hasPermission("engineers") || hasPermission("engineer-performance");

  const showCustomersSection =
    hasPermission("problem-types") || hasPermission("customers");

  const showCallsSection =
    hasPermission("calls") || hasPermission("calls-raise");

  return (
    <Sidebar collapsible="offcanvas">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
          <Wrench className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-bold text-sidebar-accent-foreground">ServiceDesk Pro</p>
            <p className="text-xs text-sidebar-foreground/50">ERP System</p>
          </div>
        )}
      </div>

      <SidebarContent className="pt-2 overflow-y-auto scrollbar-none" style={{ overflowY: "auto" }}>

        {/* Dashboard */}
        {hasPermission("dashboard") && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/dashboard" end className={linkClass} activeClassName={activeClass}>
                      <LayoutDashboard className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Dashboard</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Company Management */}
        {hasPermission("companies") && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Company Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLink to="/companies" icon={Building2} label="Companies" collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Zone Management */}
        {hasPermission("zones") && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Zone Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLink to="/zones" icon={MapPin} label="Zones" collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Contracts Management */}
        {hasPermission("contract-types") && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Contracts Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLink to="/contract-types" icon={FileSignature} label="Contract Types" collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Pages Category */}
        {hasPermission("pages-categories") && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Pages Category Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLink to="/pages-categories" icon={LayoutList} label="Pages Categories" collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Vendor Management */}
        {hasPermission("vendors") && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Vendor Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLink to="/vendors" icon={Truck} label="Vendors" collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Inventory Management */}
        {showInventorySection && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Inventory Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <div className="space-y-0.5">
                <SidebarMenu>
                  {hasPermission("machine-divisions") && (
                    <SidebarLink to="/machine-divisions" icon={Layers} label="Machine Divisions" collapsed={collapsed} />
                  )}
                  {hasPermission("machine-categories") && (
                    <SidebarLink to="/machine-categories" icon={Tag} label="Machine Categories" collapsed={collapsed} />
                  )}
                </SidebarMenu>
                {machineItems.length > 0 && (
                  collapsed ? (
                    <SidebarMenu>
                      {machineItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild>
                            <NavLink to={item.url} end className={linkClass} activeClassName={activeClass}>
                              <item.icon className="h-4 w-4 shrink-0" />
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  ) : (
                    <NestedCollapsible
                      label="Machines" icon={HardDrive}
                      urls={["/machines", "/machines/add"]}
                      items={machineItems}
                      collapsed={false}
                    />
                  )
                )}
                <SidebarMenu>
                  {hasPermission("inventory-logs") && (
                    <SidebarLink to="/inventory-logs" icon={FileText} label="Inventory Logs" collapsed={collapsed} />
                  )}
                </SidebarMenu>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Purchase Management */}
        {hasPermission("purchase-machines") && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Purchase Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLink to="/purchase-machines" icon={ShoppingBag} label="Purchase Machines" collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Sells Management */}
        {hasPermission("sell-machines") && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Sells Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLink to="/sell-machines" icon={ShoppingCart} label="Sell Machines" collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Call Management */}
        {showCallsSection && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Call Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {hasPermission("calls") && (
                  <SidebarLink to="/calls" icon={PhoneCall} label="Calls" collapsed={collapsed} />
                )}
                {hasPermission("calls-raise") && (
                  <SidebarLink to="/calls/raise" icon={PhoneOutgoing} label="Raise a Call" collapsed={collapsed} />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Travel Reimbursements */}
        {hasPermission("reimbursements") && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Travel Reimbursements</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLink to="/reimbursements" icon={Receipt} label="Travel Reimbursements" collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Customers Management */}
        {showCustomersSection && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Customers Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {hasPermission("problem-types") && (
                  <SidebarLink to="/problem-types" icon={FileText} label="Problem Types" collapsed={collapsed} />
                )}
                {hasPermission("customers") && (
                  <SidebarLink to="/customers" icon={Users} label="Customers" collapsed={collapsed} />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* System Users Management */}
        {showSystemUsersSection && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">System Users Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {hasPermission("permissions") && (
                  <SidebarLink to="/permissions" icon={ShieldCheck} label="System Users Permissions" collapsed={collapsed} />
                )}
                {hasPermission("roles") && (
                  <SidebarLink to="/roles" icon={ShieldHalf} label="System Users Roles" collapsed={collapsed} />
                )}
                {hasPermission("system-users") && (
                  <SidebarLink to="/users" icon={UserCog} label="System Users" collapsed={collapsed} />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Engineers Management */}
        {showEngineersSection && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Engineers Management</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {hasPermission("engineers") && (
                  <SidebarLink to="/engineers" icon={HardHat} label="Engineers" collapsed={collapsed} />
                )}
                {hasPermission("engineer-performance") && (
                  <SidebarLink to="/engineers/performance" icon={BarChart2} label="Performance Reports" collapsed={collapsed} />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      </SidebarContent>
    </Sidebar>
  );
}
