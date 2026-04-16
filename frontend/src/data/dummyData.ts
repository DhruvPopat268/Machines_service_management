export interface ServiceCall {
  id: string;
  customer: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  machine: string;
  machineModel: string;
  machineSerial: string;
  machineDivision: string;
  machineCategory: string;
  partCode: string;
  hsnCode: string;
  gstPercentage: number;
  contractType: string;
  issue: string;
  problemType: string;
  status: "Open" | "Assigned" | "In Progress" | "On Hold" | "Completed" | "Cancelled";
  engineer: string;
  createdDate: string;
  assignedDate?: string;
  startedDate?: string;
  completedDate?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Engineer" | "Support";
  status: "Active" | "Inactive";
  phone: string;
  joinedDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface MachineVariant {
  attribute: string;
  lowStockThreshold: number;
}

export interface Machine {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  price: number;
  quantity: number;
  description: string;
  division: string;
  category: string;
  stockStatus: "In Stock" | "Low Stock" | "Out of Stock";
  status: "Active" | "Inactive";
  variants: MachineVariant[];
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Accessory {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  price: number;
  quantity: number;
  description: string;
  stockStatus: "In Stock" | "Low Stock" | "Out of Stock";
}

export interface InventoryLog {
  id: string;
  itemName: string;
  attribute?: string;
  model?: string;
  division?: string;
  category?: string;
  type: "Machine" | "Accessory";
  action: "Added" | "Removed" | "Updated" | "Sold";
  quantityChange: number;
  createdAt: string;
  performedBy: string;
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  email: string;
  address: string;
  zone?: string;
  gstNumber?: string;
  totalPurchases: number;
  status: "Active" | "Inactive";
  joinedAt: string;
  lastPurchasedAt: string;
}

export const serviceCalls: ServiceCall[] = [
  { id: "SC-1001", customer: "Acme Corp", customerEmail: "contact@acme.com", customerPhone: "+91 9876543210", customerAddress: "123 Industrial Area, Mumbai", machine: "CNC Lathe X200", machineModel: "X200", machineSerial: "CLX200-0045", machineDivision: "CNC Division", machineCategory: "Heavy Machinery", partCode: "MC-X200-001", hsnCode: "84715000", gstPercentage: 18, contractType: "Warranty", issue: "Spindle motor overheating after 2 hours of operation", problemType: "Mechanical Failure", status: "Open", engineer: "Unassigned", createdDate: "2026-04-07", notes: ["Customer reported issue at 9 AM"], createdAt: "2026-04-07T09:00:00", updatedAt: "2026-04-07T09:00:00" },
  { id: "SC-1002", customer: "Beta Industries", customerEmail: "info@beta.com", customerPhone: "+91 9876543211", customerAddress: "456 Tech Park, Delhi", machine: "3D Printer Pro", machineModel: "PP-500", machineSerial: "3DP500-0102", machineDivision: "3D Printing Division", machineCategory: "Additive Manufacturing", partCode: "MC-PP500-002", hsnCode: "84775000", gstPercentage: 18, contractType: "Comprehensive Maintenance Contract", issue: "Print bed not leveling correctly", problemType: "Calibration", status: "Assigned", engineer: "Raj Kumar", createdDate: "2026-04-06", assignedDate: "2026-04-06", notes: ["Assigned to Raj Kumar", "Parts ordered"], createdAt: "2026-04-06T10:30:00", updatedAt: "2026-04-06T14:15:00" },
  { id: "SC-1003", customer: "Gamma Ltd", customerEmail: "support@gamma.com", customerPhone: "+91 9876543212", customerAddress: "789 Sector 5, Bangalore", machine: "Laser Cutter Z5", machineModel: "Z5", machineSerial: "LCZ5-0078", machineDivision: "Laser Division", machineCategory: "Cutting Machines", partCode: "MC-Z5-003", hsnCode: "84561000", gstPercentage: 12, contractType: "Non-Comprehensive Maintenance Contract", issue: "Laser beam misalignment causing uneven cuts", problemType: "Calibration", status: "In Progress", engineer: "Priya Singh", createdDate: "2026-04-05", assignedDate: "2026-04-05", startedDate: "2026-04-06", notes: ["Engineer on site", "Calibration in progress"], createdAt: "2026-04-05T08:00:00", updatedAt: "2026-04-06T11:00:00" },
  { id: "SC-1004", customer: "Delta Mfg", customerEmail: "ops@delta.com", customerPhone: "+91 9876543213", customerAddress: "321 MIDC, Pune", machine: "CNC Mill M400", machineModel: "M400", machineSerial: "CNM400-0231", machineDivision: "CNC Division", machineCategory: "Heavy Machinery", partCode: "MC-M400-004", hsnCode: "84715000", gstPercentage: 18, contractType: "Warranty", issue: "Coolant system leak detected", problemType: "Coolant System", status: "Completed", engineer: "Amit Patel", createdDate: "2026-04-03", assignedDate: "2026-04-03", startedDate: "2026-04-04", completedDate: "2026-04-06", notes: ["Issue resolved", "Replaced coolant hose"], createdAt: "2026-04-03T07:45:00", updatedAt: "2026-04-06T17:30:00" },
  { id: "SC-1005", customer: "Echo Systems", customerEmail: "help@echo.com", customerPhone: "+91 9876543214", customerAddress: "654 IT Hub, Hyderabad", machine: "Welding Robot W1", machineModel: "W1", machineSerial: "WRW1-0019", machineDivision: "Welding Division", machineCategory: "Robotics", partCode: "MC-W1-005", hsnCode: "84799000", gstPercentage: 18, contractType: "On-Call Service", issue: "Robotic arm not responding to commands", problemType: "Electrical Fault", status: "Open", engineer: "Unassigned", createdDate: "2026-04-07", notes: [], createdAt: "2026-04-07T11:20:00", updatedAt: "2026-04-07T11:20:00" },
  { id: "SC-1006", customer: "Foxtrot Inc", customerEmail: "admin@foxtrot.com", customerPhone: "+91 9876543215", customerAddress: "987 Phase 2, Chennai", machine: "CNC Router R300", machineModel: "R300", machineSerial: "CNR300-0055", machineDivision: "CNC Division", machineCategory: "Heavy Machinery", partCode: "MC-R300-006", hsnCode: "84715000", gstPercentage: 18, contractType: "Comprehensive Maintenance Contract", issue: "Unusual noise during operation", problemType: "Noise / Vibration", status: "Assigned", engineer: "Sneha Reddy", createdDate: "2026-04-06", assignedDate: "2026-04-07", notes: ["Scheduled for tomorrow"], createdAt: "2026-04-06T13:00:00", updatedAt: "2026-04-07T09:30:00" },
  { id: "SC-1007", customer: "Golf Enterprises", customerEmail: "info@golf.com", customerPhone: "+91 9876543216", customerAddress: "111 Industrial Estate, Ahmedabad", machine: "Plasma Cutter P100", machineModel: "P100", machineSerial: "PCP100-0032", machineDivision: "Laser Division", machineCategory: "Cutting Machines", partCode: "MC-P100-007", hsnCode: "84561000", gstPercentage: 12, contractType: "Parts Only Contract", issue: "Power supply fluctuation", problemType: "Electrical Fault", status: "On Hold", engineer: "Raj Kumar", createdDate: "2026-04-04", assignedDate: "2026-04-04", startedDate: "2026-04-05", notes: ["Waiting for spare part delivery"], createdAt: "2026-04-04T08:30:00", updatedAt: "2026-04-05T16:00:00" },
  { id: "SC-1008", customer: "Hotel Corp", customerEmail: "tech@hotel.com", customerPhone: "+91 9876543217", customerAddress: "222 SEZ, Jaipur", machine: "Press Brake B200", machineModel: "B200", machineSerial: "PBB200-0088", machineDivision: "Hydraulic Division", machineCategory: "Sheet Metal", partCode: "MC-B200-008", hsnCode: "84622900", gstPercentage: 18, contractType: "Non-Comprehensive Maintenance Contract", issue: "Hydraulic cylinder leaking", problemType: "Hydraulic System", status: "Completed", engineer: "Priya Singh", createdDate: "2026-04-01", assignedDate: "2026-04-01", startedDate: "2026-04-02", completedDate: "2026-04-04", notes: ["Cylinder replaced"], createdAt: "2026-04-01T10:00:00", updatedAt: "2026-04-04T15:45:00" },
  { id: "SC-1009", customer: "India Tech", customerEmail: "support@india.com", customerPhone: "+91 9876543218", customerAddress: "333 Tech City, Noida", machine: "EDM Machine E50", machineModel: "E50", machineSerial: "EDME50-0014", machineDivision: "CNC Division", machineCategory: "Heavy Machinery", partCode: "MC-E50-009", hsnCode: "84715000", gstPercentage: 18, contractType: "On-Call Service", issue: "Wire feed mechanism jammed", problemType: "Mechanical Failure", status: "Open", engineer: "Unassigned", createdDate: "2026-04-07", notes: [], createdAt: "2026-04-07T14:10:00", updatedAt: "2026-04-07T14:10:00" },
  { id: "SC-1010", customer: "Juliet Ltd", customerEmail: "ops@juliet.com", customerPhone: "+91 9876543219", customerAddress: "444 Industrial Zone, Lucknow", machine: "Grinding Machine G100", machineModel: "G100", machineSerial: "GMG100-0067", machineDivision: "CNC Division", machineCategory: "Heavy Machinery", partCode: "MC-G100-010", hsnCode: "84604000", gstPercentage: 18, contractType: "Warranty", issue: "Wheel spindle vibration at high RPM", problemType: "Noise / Vibration", status: "Cancelled", engineer: "Amit Patel", createdDate: "2026-04-05", assignedDate: "2026-04-06", notes: ["Customer cancelled the request"], createdAt: "2026-04-05T09:00:00", updatedAt: "2026-04-06T12:00:00" },
  { id: "SC-1011", customer: "Kilo Mfg", customerEmail: "mfg@kilo.com", customerPhone: "+91 9876543220", customerAddress: "555 GIDC, Surat", machine: "CNC Lathe X200", machineModel: "X200", machineSerial: "CLX200-0098", machineDivision: "CNC Division", machineCategory: "Heavy Machinery", partCode: "MC-X200-011", hsnCode: "84715000", gstPercentage: 18, contractType: "Comprehensive Maintenance Contract", issue: "Tool changer malfunction", problemType: "Mechanical Failure", status: "In Progress", engineer: "Sneha Reddy", createdDate: "2026-04-03", assignedDate: "2026-04-03", startedDate: "2026-04-04", notes: ["Replacement part on the way"], createdAt: "2026-04-03T11:30:00", updatedAt: "2026-04-04T08:00:00" },
  { id: "SC-1012", customer: "Lima Corp", customerEmail: "admin@lima.com", customerPhone: "+91 9876543221", customerAddress: "666 Phase 3, Vadodara", machine: "3D Printer Pro", machineModel: "PP-500", machineSerial: "3DP500-0155", machineDivision: "3D Printing Division", machineCategory: "Additive Manufacturing", partCode: "MC-PP500-012", hsnCode: "84775000", gstPercentage: 18, contractType: "Parts Only Contract", issue: "Filament not extruding properly", problemType: "Mechanical Failure", status: "Cancelled", engineer: "Raj Kumar", createdDate: "2026-03-28", assignedDate: "2026-03-28", startedDate: "2026-03-29", completedDate: "2026-04-01", notes: ["Customer requested cancellation"], createdAt: "2026-03-28T15:00:00", updatedAt: "2026-04-01T10:20:00" },
];

export const users: User[] = [
  { id: "U-001", name: "Arjun Sharma", email: "arjun@servicedesk.com", role: "Admin", status: "Active", phone: "+91 9000000001", joinedDate: "2024-01-15", createdAt: "2024-01-15T09:00:00", updatedAt: "2025-03-10T11:30:00" },
  { id: "U-002", name: "Raj Kumar", email: "raj@servicedesk.com", role: "Engineer", status: "Active", phone: "+91 9000000002", joinedDate: "2024-03-10", createdAt: "2024-03-10T10:00:00", updatedAt: "2025-01-20T14:00:00" },
  { id: "U-003", name: "Priya Singh", email: "priya@servicedesk.com", role: "Engineer", status: "Active", phone: "+91 9000000003", joinedDate: "2024-02-20", createdAt: "2024-02-20T08:30:00", updatedAt: "2025-02-15T09:45:00" },
  { id: "U-004", name: "Amit Patel", email: "amit@servicedesk.com", role: "Engineer", status: "Active", phone: "+91 9000000004", joinedDate: "2024-06-01", createdAt: "2024-06-01T11:15:00", updatedAt: "2025-04-01T10:00:00" },
  { id: "U-005", name: "Sneha Reddy", email: "sneha@servicedesk.com", role: "Engineer", status: "Active", phone: "+91 9000000005", joinedDate: "2025-01-12", createdAt: "2025-01-12T09:30:00", updatedAt: "2025-03-28T16:20:00" },
  { id: "U-006", name: "Vikram Mehta", email: "vikram@servicedesk.com", role: "Support", status: "Active", phone: "+91 9000000006", joinedDate: "2024-08-05", createdAt: "2024-08-05T13:00:00", updatedAt: "2025-02-10T12:30:00" },
  { id: "U-007", name: "Neha Gupta", email: "neha@servicedesk.com", role: "Support", status: "Inactive", phone: "+91 9000000007", joinedDate: "2024-05-15", createdAt: "2024-05-15T10:45:00", updatedAt: "2024-11-30T15:00:00" },
  { id: "U-008", name: "Ravi Verma", email: "ravi@servicedesk.com", role: "Admin", status: "Active", phone: "+91 9000000008", joinedDate: "2023-11-20", createdAt: "2023-11-20T08:00:00", updatedAt: "2025-01-05T09:15:00" },
];

export const machines: Machine[] = [
  { id: "M-001", name: "CNC Lathe X200", model: "X200", serialNumber: "CLX200-0045", price: 2500000, quantity: 5, description: "High-precision CNC lathe for industrial manufacturing", division: "CNC Division", category: "Heavy Machinery", stockStatus: "In Stock", status: "Active", variants: [{ attribute: "Color", lowStockThreshold: 2 }, { attribute: "Voltage", lowStockThreshold: 1 }], images: ["https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?w=400&q=80", "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=400&q=80"], createdAt: "2026-01-10T08:00:00", updatedAt: "2026-03-15T10:30:00" },
  { id: "M-002", name: "3D Printer Pro", model: "PP-500", serialNumber: "3DP500-0102", price: 850000, quantity: 12, description: "Industrial grade 3D printer with multi-material support", division: "3D Printing Division", category: "Additive Manufacturing", stockStatus: "In Stock", status: "Active", variants: [{ attribute: "Color", lowStockThreshold: 5 }], images: ["https://images.unsplash.com/photo-1631544822344-5b5e5e5e5e5e?w=400&q=80", "https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=400&q=80"], createdAt: "2026-01-12T09:30:00", updatedAt: "2026-03-20T14:00:00" },
  { id: "M-003", name: "Laser Cutter Z5", model: "Z5", serialNumber: "LCZ5-0078", price: 3200000, quantity: 2, description: "High-power fiber laser cutting machine", division: "Laser Division", category: "Cutting Machines", stockStatus: "Low Stock", status: "Active", variants: [{ attribute: "Spindle Speed", lowStockThreshold: 3 }], images: ["https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80"], createdAt: "2026-01-15T11:00:00", updatedAt: "2026-04-01T09:15:00" },
  { id: "M-004", name: "CNC Mill M400", model: "M400", serialNumber: "CNM400-0231", price: 4500000, quantity: 3, description: "5-axis CNC milling machine", division: "CNC Division", category: "Heavy Machinery", stockStatus: "In Stock", status: "Active", variants: [{ attribute: "Power (kW)", lowStockThreshold: 2 }, { attribute: "Voltage", lowStockThreshold: 1 }], images: ["https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&q=80", "https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?w=400&q=80"], createdAt: "2026-01-18T13:45:00", updatedAt: "2026-04-03T11:20:00" },
  { id: "M-005", name: "Welding Robot W1", model: "W1", serialNumber: "WRW1-0019", price: 6000000, quantity: 0, description: "Automated welding robot with AI guidance", division: "Welding Division", category: "Robotics", stockStatus: "Out of Stock", status: "Inactive", variants: [{ attribute: "Power (kW)", lowStockThreshold: -1 }], images: ["https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&q=80"], createdAt: "2026-02-01T10:00:00", updatedAt: "2026-04-05T16:45:00" },
  { id: "M-006", name: "Press Brake B200", model: "B200", serialNumber: "PBB200-0088", price: 1800000, quantity: 7, description: "Hydraulic press brake for sheet metal bending", division: "Hydraulic Division", category: "Sheet Metal", stockStatus: "In Stock", status: "Active", variants: [{ attribute: "Color", lowStockThreshold: 3 }, { attribute: "Voltage", lowStockThreshold: 2 }], images: ["https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=400&q=80"], createdAt: "2026-02-05T14:30:00", updatedAt: "2026-03-28T12:00:00" },
];

export const accessories: Accessory[] = [
  { id: "A-001", name: "Drill Bit Set", model: "DBS-100", serialNumber: "DBS100-001", price: 15000, quantity: 50, description: "HSS drill bit set for CNC machines", stockStatus: "In Stock" },
  { id: "A-002", name: "Coolant Filter", model: "CF-200", serialNumber: "CF200-001", price: 8500, quantity: 3, description: "Replacement coolant filter", stockStatus: "Low Stock" },
  { id: "A-003", name: "Tool Holder", model: "TH-BT40", serialNumber: "THBT40-001", price: 12000, quantity: 25, description: "BT40 tool holder for CNC mills", stockStatus: "In Stock" },
  { id: "A-004", name: "Laser Lens", model: "LL-50W", serialNumber: "LL50W-001", price: 35000, quantity: 0, description: "Replacement lens for laser cutters", stockStatus: "Out of Stock" },
  { id: "A-005", name: "Welding Wire Spool", model: "WW-MIG", serialNumber: "WWMIG-001", price: 4500, quantity: 100, description: "MIG welding wire 1.2mm", stockStatus: "In Stock" },
];

const machineLogEntries: InventoryLog[] = machines.map((m, i) => ({
  id: `IL-${String(i + 1).padStart(3, "0")}`,
  itemName: m.name,
  attribute: m.variants?.[i % (m.variants?.length || 1)]?.attribute,
  model: m.model,
  division: m.division,
  category: m.category,
  type: "Machine" as const,
  action: (i % 4 === 0 ? "Added" : i % 4 === 1 ? "Sold" : i % 4 === 2 ? "Removed" : "Updated") as InventoryLog["action"],
  quantityChange: i % 4 === 0 ? 2 : i % 4 === 1 ? -1 : i % 4 === 2 ? -2 : 0,
  createdAt: m.updatedAt,
  performedBy: users[i % users.length].name,
}));

export const inventoryLogs: InventoryLog[] = [
  ...machineLogEntries,

];

export const customers: Customer[] = [
  { id: "C-001", name: "Acme Corp", contact: "+91 9876543210", email: "contact@acme.com", address: "123 Industrial Area, Mumbai", zone: "West Zone", gstNumber: "27AABCA1234A1Z5", totalPurchases: 5, status: "Active", joinedAt: "2024-11-10T09:00:00", lastPurchasedAt: "2025-07-20T14:30:00" },
  { id: "C-002", name: "Beta Industries", contact: "+91 9876543211", email: "info@beta.com", address: "456 Tech Park, Delhi", zone: "North Zone", gstNumber: "07AABCB5678B2Z6", totalPurchases: 3, status: "Active", joinedAt: "2024-12-05T10:30:00", lastPurchasedAt: "2025-03-10T11:00:00" },
  { id: "C-003", name: "Gamma Ltd", contact: "+91 9876543212", email: "support@gamma.com", address: "789 Sector 5, Bangalore", zone: "South Zone", gstNumber: "29AABCG9012C3Z7", totalPurchases: 7, status: "Active", joinedAt: "2023-08-20T08:15:00", lastPurchasedAt: "2024-06-12T16:45:00" },
  { id: "C-004", name: "Delta Mfg", contact: "+91 9876543213", email: "ops@delta.com", address: "321 MIDC, Pune", zone: "West Zone", gstNumber: "27AABCD3456D4Z8", totalPurchases: 2, status: "Active", joinedAt: "2025-01-15T11:00:00", lastPurchasedAt: "2025-09-01T09:30:00" },
  { id: "C-005", name: "Echo Systems", contact: "+91 9876543214", email: "help@echo.com", address: "654 IT Hub, Hyderabad", zone: "South Zone", gstNumber: "36AABCE7890E5Z9", totalPurchases: 4, status: "Inactive", joinedAt: "2025-03-22T13:45:00", lastPurchasedAt: "2025-11-20T10:15:00" },
  { id: "C-006", name: "Foxtrot Inc", contact: "+91 9876543215", email: "admin@foxtrot.com", address: "987 Phase 2, Chennai", zone: "South Zone", gstNumber: "33AABCF2345F6Z1", totalPurchases: 1, status: "Active", joinedAt: "2025-06-01T14:00:00", lastPurchasedAt: "2025-08-14T12:00:00" },
];

export const engineers = users.filter((u) => u.role === "Engineer" && u.status === "Active");

export interface MachinePurchaseVariant {
  attribute: string;
  price: number;
  discountedPrice: number;
  quantity: number;
}

export interface MachinePurchase {
  id: string;
  vendorId: string;
  vendorName: string;
  machineId: string;
  machineName: string;
  machineModel: string;
  machineCategory: string;
  variants: MachinePurchaseVariant[];
  addToInventory: boolean;
  createdAt: string;
}

export const machinePurchases: MachinePurchase[] = [
  { id: "MP-001", vendorId: "VN-001", vendorName: "Gupta Machinery Pvt Ltd", machineId: "M-001", machineName: "CNC Lathe X200", machineModel: "X200", machineCategory: "Heavy Machinery", variants: [{ attribute: "Color", price: 2500000, discountedPrice: 2300000, quantity: 2 }, { attribute: "Voltage", price: 2550000, discountedPrice: 2350000, quantity: 3 }], addToInventory: true, createdAt: "2026-02-10T10:00:00" },
  { id: "MP-002", vendorId: "VN-003", vendorName: "Sharma CNC Solutions", machineId: "M-004", machineName: "CNC Mill M400", machineModel: "M400", machineCategory: "Heavy Machinery", variants: [{ attribute: "Power (kW)", price: 4500000, discountedPrice: 4200000, quantity: 1 }], addToInventory: true, createdAt: "2026-02-18T14:30:00" },
  { id: "MP-003", vendorId: "VN-002", vendorName: "Mehta Tools & Equipments", machineId: "M-003", machineName: "Laser Cutter Z5", machineModel: "Z5", machineCategory: "Cutting Machines", variants: [{ attribute: "Spindle Speed", price: 3200000, discountedPrice: 3000000, quantity: 2 }], addToInventory: false, createdAt: "2026-03-05T09:15:00" },
  { id: "MP-004", vendorId: "VN-005", vendorName: "Verma Hydraulics Ltd", machineId: "M-006", machineName: "Press Brake B200", machineModel: "B200", machineCategory: "Sheet Metal", variants: [{ attribute: "Color", price: 1800000, discountedPrice: 1700000, quantity: 4 }, { attribute: "Voltage", price: 1850000, discountedPrice: 1750000, quantity: 3 }], addToInventory: true, createdAt: "2026-03-20T11:45:00" },
  { id: "MP-005", vendorId: "VN-006", vendorName: "Nair Robotics & Automation", machineId: "M-005", machineName: "Welding Robot W1", machineModel: "W1", machineCategory: "Robotics", variants: [{ attribute: "Power (kW)", price: 6000000, discountedPrice: 5800000, quantity: 1 }], addToInventory: false, createdAt: "2026-04-01T08:00:00" },
];

export interface Vendor {
  id: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  gstNumber: string;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}

export const vendors: Vendor[] = [
  { id: "VN-001", name: "Ramesh Gupta", companyName: "Gupta Machinery Pvt Ltd", phone: "+91 9812345670", email: "ramesh@guptamachinery.com", address: "12 Industrial Estate, Mumbai", gstNumber: "27AABCG1234A1Z5", status: "Active", createdAt: "2026-01-10T09:00:00", updatedAt: "2026-03-15T11:00:00" },
  { id: "VN-002", name: "Suresh Mehta", companyName: "Mehta Tools & Equipments", phone: "+91 9823456781", email: "suresh@mehtatools.com", address: "45 MIDC Phase 2, Pune", gstNumber: "27AABCM5678B2Z6", status: "Active", createdAt: "2026-01-15T10:30:00", updatedAt: "2026-03-20T14:00:00" },
  { id: "VN-003", name: "Kavita Sharma", companyName: "Sharma CNC Solutions", phone: "+91 9834567892", email: "kavita@sharmacnc.com", address: "78 Tech Park, Bangalore", gstNumber: "29AABCS9012C3Z7", status: "Active", createdAt: "2026-01-20T08:15:00", updatedAt: "2026-04-01T09:30:00" },
  { id: "VN-004", name: "Deepak Joshi", companyName: "Joshi Laser Systems", phone: "+91 9845678903", email: "deepak@joshilaser.com", address: "23 Sector 5, Delhi", gstNumber: "07AABCJ3456D4Z8", status: "Inactive", createdAt: "2026-02-01T11:00:00", updatedAt: "2026-03-28T16:00:00" },
  { id: "VN-005", name: "Anita Verma", companyName: "Verma Hydraulics Ltd", phone: "+91 9856789014", email: "anita@vermahydraulics.com", address: "56 GIDC, Ahmedabad", gstNumber: "24AABCV7890E5Z9", status: "Active", createdAt: "2026-02-10T13:45:00", updatedAt: "2026-04-05T10:15:00" },
  { id: "VN-006", name: "Prakash Nair", companyName: "Nair Robotics & Automation", phone: "+91 9867890125", email: "prakash@nairrobotics.com", address: "89 IT Hub, Chennai", gstNumber: "33AABCN2345F6Z1", status: "Active", createdAt: "2026-02-18T09:00:00", updatedAt: "2026-04-03T12:30:00" },
];

export interface MachineSaleVariant {
  attribute: string;
  price: number;
  discountedPrice: number;
  quantity: number;
}

export interface MachineSale {
  id: string;
  customerId: string;
  customerName: string;
  machineId: string;
  machineName: string;
  machineModel: string;
  machineCategory: string;
  variants: MachineSaleVariant[];
  createdAt: string;
}

export const machineSales: MachineSale[] = [
  { id: "MS-001", customerId: "C-001", customerName: "Acme Corp", machineId: "M-001", machineName: "CNC Lathe X200", machineModel: "X200", machineCategory: "Heavy Machinery", variants: [{ attribute: "Color", price: 2500000, discountedPrice: 2300000, quantity: 1 }], createdAt: "2026-02-15T11:00:00" },
  { id: "MS-002", customerId: "C-002", customerName: "Beta Industries", machineId: "M-003", machineName: "Laser Cutter Z5", machineModel: "Z5", machineCategory: "Cutting Machines", variants: [{ attribute: "Spindle Speed", price: 3200000, discountedPrice: 3000000, quantity: 1 }], createdAt: "2026-03-10T09:30:00" },
  { id: "MS-003", customerId: "C-003", customerName: "Gamma Ltd", machineId: "M-004", machineName: "CNC Mill M400", machineModel: "M400", machineCategory: "Heavy Machinery", variants: [{ attribute: "Power (kW)", price: 4500000, discountedPrice: 4200000, quantity: 2 }, { attribute: "Voltage", price: 4550000, discountedPrice: 4250000, quantity: 1 }], createdAt: "2026-03-22T14:00:00" },
  { id: "MS-004", customerId: "C-004", customerName: "Delta Mfg", machineId: "M-006", machineName: "Press Brake B200", machineModel: "B200", machineCategory: "Sheet Metal", variants: [{ attribute: "Color", price: 1800000, discountedPrice: 1700000, quantity: 3 }], createdAt: "2026-04-02T10:15:00" },
];

export interface MachineDivision {
  id: string;
  name: string;
  description: string;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}

export const machineDivisions: MachineDivision[] = [
  { id: "MD-001", name: "CNC Division", description: "All CNC lathes, mills, and routers", status: "Active", createdAt: "2026-01-15T08:30:00", updatedAt: "2026-03-18T10:00:00" },
  { id: "MD-002", name: "Laser Division", description: "Laser cutting and engraving machines", status: "Active", createdAt: "2026-01-16T09:00:00", updatedAt: "2026-03-20T11:30:00" },
  { id: "MD-003", name: "3D Printing Division", description: "Industrial 3D printers and related equipment", status: "Active", createdAt: "2026-01-17T10:15:00", updatedAt: "2026-04-01T09:00:00" },
  { id: "MD-004", name: "Welding Division", description: "Welding robots and manual welding machines", status: "Active", createdAt: "2026-01-18T11:00:00", updatedAt: "2026-03-22T14:45:00" },
  { id: "MD-005", name: "Hydraulic Division", description: "Press brakes and hydraulic machinery", status: "Inactive", createdAt: "2026-02-01T13:30:00", updatedAt: "2026-03-30T16:00:00" },
];

export interface MachineCategory {
  id: string;
  name: string;
  description: string;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}

export const machineCategories: MachineCategory[] = [
  { id: "MC-001", name: "Heavy Machinery", description: "Large industrial machines above 5 tons", status: "Active", createdAt: "2026-01-20T08:00:00", updatedAt: "2026-03-15T09:30:00" },
  { id: "MC-002", name: "Light Machinery", description: "Compact machines suitable for small workshops", status: "Active", createdAt: "2026-01-21T09:30:00", updatedAt: "2026-03-16T11:00:00" },
  { id: "MC-003", name: "Precision Machinery", description: "High-accuracy machines for tight tolerances", status: "Active", createdAt: "2026-01-22T10:45:00", updatedAt: "2026-04-02T14:20:00" },
  { id: "MC-004", name: "Automated Machinery", description: "CNC and robotic automated equipment", status: "Active", createdAt: "2026-01-23T11:15:00", updatedAt: "2026-04-03T10:10:00" },
  { id: "MC-005", name: "Manual Machinery", description: "Operator-driven non-automated machines", status: "Inactive", createdAt: "2026-02-05T14:00:00", updatedAt: "2026-03-28T15:45:00" },
];

export interface Zone {
  id: string;
  name: string;
  code: string;
  description: string;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}

export const zones: Zone[] = [
  { id: "Z-001", name: "North Zone", code: "NZ", description: "Covers northern region including Delhi, Punjab, Haryana", status: "Active", createdAt: "2026-01-10T09:30:00", updatedAt: "2026-03-15T14:20:00" },
  { id: "Z-002", name: "South Zone", code: "SZ", description: "Covers southern region including Bangalore, Chennai, Hyderabad", status: "Active", createdAt: "2026-01-12T11:00:00", updatedAt: "2026-04-01T10:45:00" },
  { id: "Z-003", name: "East Zone", code: "EZ", description: "Covers eastern region including Kolkata, Bhubaneswar", status: "Active", createdAt: "2026-01-15T08:15:00", updatedAt: "2026-02-20T16:30:00" },
  { id: "Z-004", name: "West Zone", code: "WZ", description: "Covers western region including Mumbai, Pune, Ahmedabad", status: "Active", createdAt: "2026-01-18T13:45:00", updatedAt: "2026-04-05T09:10:00" },
  { id: "Z-005", name: "Central Zone", code: "CZ", description: "Covers central region including Nagpur, Bhopal, Indore", status: "Inactive", createdAt: "2026-02-01T10:00:00", updatedAt: "2026-03-28T11:55:00" },
];

export interface ProblemType {
  id: string;
  name: string;
  description: string;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}

export interface ContractType {
  id: string;
  name: string;
  code: string;
  description: string;
  isServiceFree: boolean;
  isPartsFree: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Attribute {
  id: string;
  name: string;
  description: string;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}

export const attributes: Attribute[] = [
  { id: "AT-001", name: "Color", description: "Color variant of the machine", status: "Active", createdAt: "2026-01-05T08:00:00", updatedAt: "2026-03-10T11:30:00" },
  { id: "AT-002", name: "Voltage", description: "Operating voltage specification", status: "Active", createdAt: "2026-01-06T09:00:00", updatedAt: "2026-03-11T10:00:00" },
  { id: "AT-003", name: "Power (kW)", description: "Power output in kilowatts", status: "Active", createdAt: "2026-01-07T10:00:00", updatedAt: "2026-03-12T09:00:00" },
  { id: "AT-004", name: "Spindle Speed", description: "Maximum spindle speed in RPM", status: "Active", createdAt: "2026-01-08T11:00:00", updatedAt: "2026-03-13T14:00:00" },
  { id: "AT-005", name: "Bed Size", description: "Working bed dimensions", status: "Inactive", createdAt: "2026-01-09T12:00:00", updatedAt: "2026-03-14T15:00:00" },
];

export const problemTypes: ProblemType[] = [
  { id: "PT-001", name: "Mechanical Failure", description: "Issues related to mechanical parts like gears, bearings, or spindles", status: "Active", createdAt: "2026-01-05T08:00:00", updatedAt: "2026-03-10T11:30:00" },
  { id: "PT-002", name: "Electrical Fault", description: "Power supply, wiring, or electrical component failures", status: "Active", createdAt: "2026-01-06T09:15:00", updatedAt: "2026-03-12T14:00:00" },
  { id: "PT-003", name: "Software / Firmware", description: "CNC program errors, firmware bugs, or control panel issues", status: "Active", createdAt: "2026-01-07T10:00:00", updatedAt: "2026-02-28T09:45:00" },
  { id: "PT-004", name: "Coolant System", description: "Coolant leaks, blockages, or pump failures", status: "Active", createdAt: "2026-01-08T11:30:00", updatedAt: "2026-03-20T16:10:00" },
  { id: "PT-005", name: "Calibration", description: "Misalignment, leveling, or precision calibration issues", status: "Active", createdAt: "2026-01-09T13:00:00", updatedAt: "2026-04-01T08:20:00" },
  { id: "PT-006", name: "Hydraulic System", description: "Hydraulic pressure loss, cylinder leaks, or valve failures", status: "Active", createdAt: "2026-01-10T14:45:00", updatedAt: "2026-03-25T10:00:00" },
  { id: "PT-007", name: "Noise / Vibration", description: "Unusual sounds or excessive vibration during operation", status: "Active", createdAt: "2026-01-11T15:30:00", updatedAt: "2026-04-02T13:15:00" },
  { id: "PT-008", name: "Preventive Maintenance", description: "Scheduled maintenance and inspection visits", status: "Inactive", createdAt: "2026-01-12T16:00:00", updatedAt: "2026-02-15T17:00:00" },
];
