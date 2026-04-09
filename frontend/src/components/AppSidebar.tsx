import {
  LayoutDashboard, Users, PhoneCall, Wrench, HardDrive, UserCog,
  ChevronDown, Package, ClipboardList, ShoppingCart, FileText, HardHat, MapPin, Layers, Tag, FileSignature, SlidersHorizontal,
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

const linkClass = "flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors";
const activeClass = "bg-sidebar-accent text-sidebar-primary font-semibold";

interface NavItem {
  title: string;
  url: string;
  icon: any;
}

interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
}

const singleItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
];

const zonesItem: NavItem = { title: "Zones", url: "/zones", icon: MapPin };

const callGroup: NavGroup = {
  label: "Calls",
  icon: PhoneCall,
  items: [
    { title: "All Calls", url: "/calls", icon: ClipboardList },
    { title: "Open Calls", url: "/calls/open", icon: ClipboardList },
    { title: "Assigned Calls", url: "/calls/assigned", icon: ClipboardList },
    { title: "In Progress", url: "/calls/in-progress", icon: ClipboardList },
    { title: "On Hold", url: "/calls/on-hold", icon: ClipboardList },
    { title: "Completed", url: "/calls/completed", icon: ClipboardList },
    { title: "Cancelled", url: "/calls/cancelled", icon: ClipboardList },
  ],
};

const problemTypesItem: NavItem = { title: "Problem Types", url: "/problem-types", icon: FileText };

const inventoryGroup: NavGroup = {
  label: "Inventory",
  icon: Package,
  items: [
    { title: "Machines", url: "/machines", icon: HardDrive },
    { title: "Add Machine", url: "/machines/add", icon: HardDrive },
    { title: "Inventory Logs", url: "/inventory-logs", icon: FileText },
  ],
};

const customerGroup: NavGroup = {
  label: "Customers",
  icon: ShoppingCart,
  items: [
    { title: "All Customers", url: "/customers", icon: Users },
    { title: "Purchases", url: "/purchases", icon: ShoppingCart },
  ],
};

const contractTypesItem: NavItem = { title: "Contract Types", url: "/contract-types", icon: FileSignature };

const usersItem: NavItem = { title: "Panel Users", url: "/users", icon: UserCog };
const engineersItem: NavItem = { title: "Engineers", url: "/engineers", icon: HardHat };

function NestedCollapsible({ label, icon: Icon, urls, items, collapsed, depth = 8 }: {
  label: string; icon: any; urls: string[]; items: NavItem[]; collapsed: boolean; depth?: number;
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

function InventorySection({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();

  if (collapsed) return (
    <SidebarMenu>
      {[
        { url: "/attributes", icon: SlidersHorizontal },
        { url: "/machine-divisions", icon: Layers }, { url: "/machine-categories", icon: Tag },
        { url: "/machines", icon: HardDrive }, { url: "/machines/add", icon: HardDrive },
        { url: "/inventory-logs", icon: FileText },
      ].map((item) => (
        <SidebarMenuItem key={item.url}>
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
    <div className="space-y-0.5">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <NavLink to="/attributes" end className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md" activeClassName="text-sidebar-primary font-semibold">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                <span>Attributes</span>
              </span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <NavLink to="/machine-divisions" end className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md" activeClassName="text-sidebar-primary font-semibold">
              <span className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span>Machine Divisions</span>
              </span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <NavLink to="/machine-categories" end className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md" activeClassName="text-sidebar-primary font-semibold">
              <span className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 shrink-0" />
                <span>Machine Categories</span>
              </span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <NestedCollapsible
        label="Machines" icon={HardDrive}
        urls={["/machines", "/machines/add"]}
        items={[{ title: "Add Machine", url: "/machines/add", icon: HardDrive }, { title: "Machine List", url: "/machines", icon: HardDrive }]}
        collapsed={false} depth={3}
      />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <NavLink to="/inventory-logs" end className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md" activeClassName="text-sidebar-primary font-semibold">
              <span className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>Inventory Logs</span>
              </span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
}

function CollapsibleNavGroup({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const location = useLocation();
  const isActive = group.items.some((item) => location.pathname === item.url || location.pathname.startsWith(item.url + "/"));
  const [open, setOpen] = useState(isActive);

  if (collapsed) {
    return (
      <SidebarMenu>
        {group.items.map((item) => (
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
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors">
        <span className="flex items-center gap-2">
          <group.icon className="h-3.5 w-3.5" />
          {group.label}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenu>
          {group.items.map((item) => (
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

  return (
    <Sidebar collapsible="icon">
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
      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {singleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={linkClass} activeClassName={activeClass}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Zone Management</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  {collapsed ? (
                    <NavLink to={zonesItem.url} end className={linkClass} activeClassName={activeClass}>
                      <zonesItem.icon className="h-4 w-4 shrink-0" />
                    </NavLink>
                  ) : (
                    <NavLink to={zonesItem.url} end className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md" activeClassName="text-sidebar-primary font-semibold">
                      <span className="flex items-center gap-2">
                        <zonesItem.icon className="h-3.5 w-3.5 shrink-0" />
                        {zonesItem.title}
                      </span>
                    </NavLink>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Contracts Management</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  {collapsed ? (
                    <NavLink to={contractTypesItem.url} end className={linkClass} activeClassName={activeClass}>
                      <contractTypesItem.icon className="h-4 w-4 shrink-0" />
                    </NavLink>
                  ) : (
                    <NavLink to={contractTypesItem.url} end className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md" activeClassName="text-sidebar-primary font-semibold">
                      <span className="flex items-center gap-2">
                        <contractTypesItem.icon className="h-3.5 w-3.5 shrink-0" />
                        {contractTypesItem.title}
                      </span>
                    </NavLink>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Inventory Management</SidebarGroupLabel>}
          <InventorySection collapsed={collapsed} />
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Call Management</SidebarGroupLabel>}
          <CollapsibleNavGroup group={callGroup} collapsed={collapsed} />
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Customers Management</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                { title: "Problem Types", url: "/problem-types", icon: FileText },
                { title: "Customers", url: "/customers", icon: Users },
                { title: "Purchases", url: "/purchases", icon: ShoppingCart },
              ].map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    {collapsed ? (
                      <NavLink to={item.url} end className={linkClass} activeClassName={activeClass}>
                        <item.icon className="h-4 w-4 shrink-0" />
                      </NavLink>
                    ) : (
                      <NavLink to={item.url} end className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md" activeClassName="text-sidebar-primary font-semibold">
                        <span className="flex items-center gap-2">
                          <item.icon className="h-3.5 w-3.5 shrink-0" />
                          {item.title}
                        </span>
                      </NavLink>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Panel Users Management</SidebarGroupLabel>}
        {[usersItem].map((item) => (
          <SidebarGroup key={item.title}>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md"
                      activeClassName="text-sidebar-primary font-semibold"
                    >
                      <span className="flex items-center gap-2">
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        {!collapsed && item.title}
                      </span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {!collapsed && <SidebarGroupLabel className="text-sidebar-foreground font-semibold text-xs tracking-wider px-3 py-1">Engineers Management</SidebarGroupLabel>}
        {[engineersItem].map((item) => (
          <SidebarGroup key={item.title}>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors rounded-md"
                      activeClassName="text-sidebar-primary font-semibold"
                    >
                      <span className="flex items-center gap-2">
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        {!collapsed && item.title}
                      </span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
