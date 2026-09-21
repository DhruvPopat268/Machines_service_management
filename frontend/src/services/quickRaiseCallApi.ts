import api from "@/lib/axiosInterceptor";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QRCVendorMachine {
  machineId:           string;
  machineName:         string;
  modelNumber:         string;
  partCode:            string;
  categoryId:          string;
  category:            string;
  divisionId:          string;
  division:            string;
  buyingPriceBase?:    number;
  buyingPriceWithGst?: number;
  availableSerials:    string[];
}

export interface QRCVendor {
  _id:                 string;
  name:                string;
  companyName:         string;
  phone:               string;
  email?:              string;
  address?:            string;
  status:              string;
  isDummy:             boolean;
  vendorType:          "Dummy Vendor" | "Real Vendor";
  availableStockCount: number;
  machines:            QRCVendorMachine[];
}

export interface QRCVendorsResponse {
  dummyVendorExists: boolean;
  totalVendors:      number;
  realVendorCount:   number;
  vendors:           QRCVendor[];
}

export interface QRCStatusResponse {
  dummyVendorExists:       boolean;
  dummyVendor:             QRCVendor | null;
  availablePurchasesCount: number;
  availablePurchases:      any[];
  saleExists:              boolean;
  sale:                    any | null;
  callExists:              boolean;
  latestCall:              any | null;
  recommendation:          string;
}

export interface QRCCustomerPayload {
  name:          string;
  phone:         string;
  email?:        string;
  address?:      string;
  zone?:         string;
  department?:   string;
  userLocation?: { address: string; latitude?: number; longitude?: number };
}

export interface QRCPageCategoryEntry {
  pagesCategoryId: string;
  pagesCategory?: string;
  costPerPage: number | string;
}

export interface QRCContractPayload {
  contractTypeId?: string;
  validFrom?: string;
  validTo?: string;
  minCopies?: number;
  pagesCategories?: QRCPageCategoryEntry[];
}

// Dummy mode payload
export interface QRCDummyPayload {
  mode:      "dummy";
  customer:  QRCCustomerPayload;
  machine:   { name: string; modelNumber?: string; partCode?: string; categoryId: string; divisionId: string; serialNumber: string };
  call?:     { issueDescription?: string; priority?: string; callType?: string; note?: string };
  contract?: QRCContractPayload;
}

// Existing mode payload
export interface QRCExistingPayload {
  mode:      "existing";
  customer:  QRCCustomerPayload;
  existing:  { vendorId: string; machineId: string; serialNumber: string; sellingPrice?: number; companyId?: string };
  call?:     { issueDescription?: string; priority?: string; callType?: string; note?: string };
  contract?: QRCContractPayload;
}

export interface QRCResult {
  mode:         string;
  vendor:       { _id: string; name: string; phone: string };
  customer:     { _id: string; name: string; phone: string };
  machine:      { _id: string; name: string; modelNumber?: string; partCode: string; serialNumber?: string };
  purchase:     { _id: string; invoiceNumber: string };
  sale:         { _id: string; invoiceNumber: string };
  serviceCall?: { _id: string; callId: string; status: string } | null;
}

// ── API functions ─────────────────────────────────────────────────────────────

export const quickRaiseCallApi = {
  /** GET /api/admin/quick-raise-call/vendors */
  getVendors: async (): Promise<QRCVendorsResponse> => {
    const res = await api.get("/admin/quick-raise-call/vendors");
    return res.data.data;
  },

  /** GET /api/admin/quick-raise-call/status?serialNumber=<sn> */
  getStatus: async (serialNumber: string): Promise<QRCStatusResponse> => {
    const res = await api.get("/admin/quick-raise-call/status", { params: { serialNumber } });
    return res.data.data;
  },

  /** GET /api/admin/quick-raise-call/check-model-serial?modelNumber=<mn>&serialNumber=<sn> */
  checkModelSerial: async (modelNumber: string, serialNumber: string): Promise<{ success: boolean; available: boolean; message: string }> => {
    const res = await api.get("/admin/quick-raise-call/check-model-serial", {
      params: { modelNumber, serialNumber },
    });
    return res.data;
  },

  /** POST /api/admin/quick-raise-call */
  raise: async (payload: QRCDummyPayload | QRCExistingPayload): Promise<QRCResult> => {
    const res = await api.post("/admin/quick-raise-call", payload);
    return res.data.data;
  },
};
