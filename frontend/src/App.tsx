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
import EngineersPage from "./pages/EngineersPage";
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
import VendorsPage from "./pages/VendorsPage";
import TravelReimbursementsPage from "./pages/TravelReimbursementsPage";
import ProfilePage from "./pages/ProfilePage";
import { ProfileProvider } from "./context/ProfileContext";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route element={<ProfileProvider><AdminLayout /></ProfileProvider>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calls" element={<CallsPage />} />
            <Route path="/calls/raise/detail" element={<CustomerMachineDetailPage />} />
            <Route path="/calls/raise/machine" element={<CustomerOwnedMachinePage />} />
            <Route path="/calls/raise" element={<RaiseCallPage />} />
            <Route path="/calls/open" element={<CallsPage statusFilter="Open" title="Open Calls" description="Newly raised calls awaiting assignment" />} />
            <Route path="/calls/assigned" element={<CallsPage statusFilter="Assigned" title="Assigned Calls" description="Calls assigned to engineers" />} />
            <Route path="/calls/in-progress" element={<CallsPage statusFilter="In Progress" title="In Progress Calls" description="Calls currently being worked on" />} />
            <Route path="/calls/on-hold" element={<CallsPage statusFilter="On Hold" title="On Hold Calls" description="Calls paused pending parts or customer response" />} />
            <Route path="/calls/completed" element={<CallsPage statusFilter="Completed" title="Completed Calls" description="Resolved service calls" />} />
            <Route path="/calls/cancelled" element={<CallsPage statusFilter="Cancelled" title="Cancelled Calls" description="Calls cancelled by customer or admin" />} />
            <Route path="/calls/:id" element={<CallDetailsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/engineers" element={<EngineersPage />} />
            <Route path="/machines" element={<MachinesPage />} />
            <Route path="/machines/add" element={<AddMachineForm type="Machine" />} />
            <Route path="/machines/:id" element={<AddMachineForm type="Machine" mode="view" />} />
            <Route path="/machines/:id/edit" element={<AddMachineForm type="Machine" mode="edit" />} />
            <Route path="/inventory-logs" element={<InventoryLogsPage />} />
            <Route path="/inventory-logs/:id" element={<InventoryLogDetailPage />} />
            <Route path="/purchase-machines" element={<PurchaseMachinesPage />} />
            <Route path="/purchase-machines/:id" element={<PurchaseMachineDetailPage />} />
            <Route path="/sell-machines" element={<SellMachinesPage />} />
            <Route path="/sell-machines/:id" element={<SellMachineDetailPage />} />
            <Route path="/machine-divisions" element={<MachineDivisionsPage />} />
            <Route path="/machine-categories" element={<MachineCategoriesPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/problem-types" element={<ProblemTypesPage />} />
            <Route path="/contract-types" element={<ContractTypesPage />} />
            <Route path="/pages-categories" element={<PagesCategoriesPage />} />
            <Route path="/zones" element={<ZonesPage />} />
            <Route path="/vendors" element={<VendorsPage />} />
            <Route path="/reimbursements" element={<TravelReimbursementsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
