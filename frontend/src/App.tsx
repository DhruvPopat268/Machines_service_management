import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AdminLayout from "./components/AdminLayout";
import Dashboard from "./pages/Dashboard";
import UsersPage from "./pages/UsersPage";
import PermissionsPage from "./pages/PermissionsPage";
import RolesPage from "./pages/RolesPage";
import EngineersPage from "./pages/EngineersPage";
import EngineerPerformancePage from "./pages/EngineerPerformancePage";
import CallsPage from "./pages/CallsPage";
import RaiseCallPage from "./pages/RaiseCallPage";
import CustomerMachineDetailPage from "./pages/CustomerMachineDetailPage";
import CustomerOwnedMachinePage from "./pages/CustomerOwnedMachinePage";
import CallDetailsPage from "./pages/CallDetailsPage";
import MachinesPage from "./pages/MachinesPage";
import AddMachineForm from "./pages/AddMachineForm";
import InventoryLogsPage from "./pages/InventoryLogsPage";
import InventoryLogDetailPage from "./pages/InventoryLogDetailPage";
import MachineDivisionsPage from "./pages/MachineDivisionsPage";
import MachineCategoriesPage from "./pages/MachineCategoriesPage";
import CustomersPage from "./pages/CustomersPage";
import ProblemTypesPage from "./pages/ProblemTypesPage";
import PurchaseMachinesPage from "./pages/PurchaseMachinesPage";
import PurchaseMachineDetailPage from "./pages/PurchaseMachineDetailPage";
import SellMachinesPage from "./pages/SellMachinesPage";
import SellMachineDetailPage from "./pages/SellMachineDetailPage";
import ContractTypesPage from "./pages/ContractTypesPage";
import PagesCategoriesPage from "./pages/PagesCategoriesPage";
import ZonesPage from "./pages/ZonesPage";
import CompaniesPage from "./pages/CompaniesPage";
import VendorsPage from "./pages/VendorsPage";
import TravelReimbursementsPage from "./pages/TravelReimbursementsPage";
import ProfilePage from "./pages/ProfilePage";
import { ProfileProvider } from "./context/ProfileContext";
import PermissionGuard from "./components/PermissionGuard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const G = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <PermissionGuard permKey={k}>{children}</PermissionGuard>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route element={<ProfileProvider><AdminLayout /></ProfileProvider>}>
            <Route path="/dashboard"          element={<G k="dashboard"><Dashboard /></G>} />

            <Route path="/calls"              element={<G k="calls"><CallsPage /></G>} />
            <Route path="/calls/open"         element={<G k="calls"><CallsPage statusFilter="Open" title="Open Calls" description="Newly raised calls awaiting assignment" /></G>} />
            <Route path="/calls/assigned"     element={<G k="calls"><CallsPage statusFilter="Assigned" title="Assigned Calls" description="Calls assigned to engineers" /></G>} />
            <Route path="/calls/in-progress"  element={<G k="calls"><CallsPage statusFilter="In Progress" title="In Progress Calls" description="Calls currently being worked on" /></G>} />
            <Route path="/calls/on-hold"      element={<G k="calls"><CallsPage statusFilter="On Hold" title="On Hold Calls" description="Calls paused pending parts or customer response" /></G>} />
            <Route path="/calls/completed"    element={<G k="calls"><CallsPage statusFilter="Completed" title="Completed Calls" description="Resolved service calls" /></G>} />
            <Route path="/calls/cancelled"    element={<G k="calls"><CallsPage statusFilter="Cancelled" title="Cancelled Calls" description="Calls cancelled by customer or admin" /></G>} />
            <Route path="/calls/raise/detail" element={<G k="calls-raise"><CustomerMachineDetailPage /></G>} />
            <Route path="/calls/raise/machine"element={<G k="calls-raise"><CustomerOwnedMachinePage /></G>} />
            <Route path="/calls/raise"        element={<G k="calls-raise"><RaiseCallPage /></G>} />
            <Route path="/calls/:id"          element={<G k="calls"><CallDetailsPage /></G>} />

            <Route path="/machines"           element={<G k="machines-list"><MachinesPage /></G>} />
            <Route path="/machines/add"       element={<G k="machines-add"><AddMachineForm type="Machine" /></G>} />
            <Route path="/machines/:id"       element={<G k="machines-list"><AddMachineForm type="Machine" mode="view" /></G>} />
            <Route path="/machines/:id/edit"  element={<G k="machines-list"><AddMachineForm type="Machine" mode="edit" /></G>} />

            <Route path="/inventory-logs"     element={<G k="inventory-logs"><InventoryLogsPage /></G>} />
            <Route path="/inventory-logs/:id" element={<G k="inventory-logs"><InventoryLogDetailPage /></G>} />

            <Route path="/purchase-machines"      element={<G k="purchase-machines"><PurchaseMachinesPage /></G>} />
            <Route path="/purchase-machines/:id"  element={<G k="purchase-machines"><PurchaseMachineDetailPage /></G>} />

            <Route path="/sell-machines"      element={<G k="sell-machines"><SellMachinesPage /></G>} />
            <Route path="/sell-machines/:id"  element={<G k="sell-machines"><SellMachineDetailPage /></G>} />

            <Route path="/machine-divisions"  element={<G k="machine-divisions"><MachineDivisionsPage /></G>} />
            <Route path="/machine-categories" element={<G k="machine-categories"><MachineCategoriesPage /></G>} />

            <Route path="/customers"          element={<G k="customers"><CustomersPage /></G>} />
            <Route path="/problem-types"      element={<G k="problem-types"><ProblemTypesPage /></G>} />
            <Route path="/contract-types"     element={<G k="contract-types"><ContractTypesPage /></G>} />
            <Route path="/pages-categories"   element={<G k="pages-categories"><PagesCategoriesPage /></G>} />
            <Route path="/companies"          element={<G k="companies"><CompaniesPage /></G>} />
            <Route path="/zones"              element={<G k="zones"><ZonesPage /></G>} />
            <Route path="/vendors"            element={<G k="vendors"><VendorsPage /></G>} />
            <Route path="/reimbursements"     element={<G k="reimbursements"><TravelReimbursementsPage /></G>} />

            <Route path="/users"              element={<G k="system-users"><UsersPage /></G>} />
            <Route path="/permissions"        element={<G k="permissions"><PermissionsPage /></G>} />
            <Route path="/roles"              element={<G k="roles"><RolesPage /></G>} />

            <Route path="/engineers"          element={<G k="engineers"><EngineersPage /></G>} />
            <Route path="/engineers/performance" element={<G k="engineer-performance"><EngineerPerformancePage /></G>} />

            <Route path="/profile"            element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
