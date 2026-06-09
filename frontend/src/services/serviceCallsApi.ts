import api from "@/lib/axiosInterceptor";

export interface ServiceCall {
  _id: string;
  callId: string;
  customerInfo: {
    customerId: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    zone: string;
    gstNumber: string;
  };
  machines: Array<{
    variantId: string;
    machineId: string;
    machineName: string;
    modelNumber: string;
    serialNumber: string;
    divisionId: string;
    division: string;
    categoryId: string;
    category: string;
    attributeName: string;
    attributeValue: string;
    contractType: {
      contractTypeId: string;
      name: string;
      code: string;
      freeService: boolean;
      freeParts: boolean;
      validFrom: string;
      validTo: string;
    };
    issueDescription: string;
    problemTypeIds: string[];
    problemTypes: string[];
    images: string[];
    serviceCharge?: number;
    partsCharge?: number;
  }>;
  status: string;
  priority?: string;
  engineerInfo?: {
    _id: string;
    identityId: string;
    name: string;
    phone: string;
    email: string;
  };
  dates: {
    created: string;
    assigned?: string;
    inProgress?: string;
    onHold?: string;
    completed?: string;
    cancelled?: string;
  };
  note?: string;
  createdBy?: "Admin" | "Customer";
  totalServiceCharges?: number;
  totalPartsCharges?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CallStats {
  total: number;
  open: number;
  assigned: number;
  inProgress: number;
  onHold: number;
  completed: number;
  cancelled: number;
}

export interface CallsParams {
  status?: string;
  search?: string;
  problemTypeId?: string;
  serialNumber?: string;
  machineName?: string;
  customerName?: string;
  engineerName?: string;
  category?: string;
  division?: string;
  fromDate?: string;
  toDate?: string;
  contractTypeId?: string;
  contractTypeStatus?: string;
  page?: string;
  limit?: string;
}

export const engineersApi = {
  getActive: async (search?: string): Promise<{ _id: string; name: string; isOnline?: boolean }[]> => {
    const res = await api.get("/admin/engineers/active", { params: { limit: 100, ...(search && { search }) } });
    return res.data.data;
  },
};

export const companiesApi = {
  getAll: async (): Promise<{ _id: string; name: string; gstNumber?: string }[]> => {
    const res = await api.get("/admin/companies", { params: { limit: 100, status: "Active" } });
    return res.data.data;
  },
};

export const serviceCallsApi = {
  getCalls: async (params: CallsParams = {}): Promise<{ data: ServiceCall[]; stats?: CallStats; pagination: { total: number; page: number; limit: number; totalPages: number } }> => {
    const response = await api.get("/admin/service-calls", { params });
    return { data: response.data.data, stats: response.data.stats, pagination: response.data.pagination };
  },

  assignEngineer: async (id: string, engineerId: string): Promise<ServiceCall> => {
    const res = await api.patch(`/admin/service-calls/${id}/assign-engineer`, { engineerId });
    return res.data.data;
  },

  updateCall: async (id: string, payload: { note?: string; priority?: string; status?: string; companyId?: string | null }): Promise<ServiceCall> => {
    const res = await api.patch(`/admin/service-calls/${id}`, payload);
    return res.data.data;
  },

  getCallDetail: async (id: string): Promise<ServiceCall> => {
    const response = await api.get(`/admin/service-calls/${id}`);
    return response.data.data;
  },
};
