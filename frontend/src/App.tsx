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
import CallDetailsPage from "./pages/CallDetailsPage";
import MachinesPage from "./pages/MachinesPage";
import AddItemForm from "./pages/AddItemForm";
import InventoryLogsPage from "./pages/InventoryLogsPage";
import AttributesPage from "./pages/AttributesPage";
import MachineDivisionsPage from "./pages/MachineDivisionsPage";
import MachineCategoriesPage from "./pages/MachineCategoriesPage";
import CustomersPage from "./pages/CustomersPage";
import PurchasesPage from "./pages/PurchasesPage";
import ProblemTypesPage from "./pages/ProblemTypesPage";
import ContractTypesPage from "./pages/ContractTypesPage";
import ZonesPage from "./pages/ZonesPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calls" element={<CallsPage />} />
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
            <Route path="/machines/add" element={<AddItemForm type="Machine" />} />
            <Route path="/inventory-logs" element={<InventoryLogsPage />} />
            <Route path="/attributes" element={<AttributesPage />} />
            <Route path="/machine-divisions" element={<MachineDivisionsPage />} />
            <Route path="/machine-categories" element={<MachineCategoriesPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/purchases" element={<PurchasesPage />} />
            <Route path="/problem-types" element={<ProblemTypesPage />} />
            <Route path="/contract-types" element={<ContractTypesPage />} />
            <Route path="/zones" element={<ZonesPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
