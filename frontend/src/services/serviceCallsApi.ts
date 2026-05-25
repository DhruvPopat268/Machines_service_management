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
  }>;
  status: string;
  priority?: string;
  engineerInfo?: {
    engineerId: string;
    name: string;
  };
  dates: {
    created: string;
    assigned?: string;
    inProgress?: string;
    onHold?: string;
    completed?: string;
    cancelled?: string;
  };
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
  problemType?: string;
  machineName?: string;
  customerName?: string;
  engineerName?: string;
  category?: string;
  division?: string;
  fromDate?: string;
  toDate?: string;
  page?: string;
  limit?: string;
}

export const serviceCallsApi = {
  getCalls: async (params: CallsParams = {}): Promise<{ data: ServiceCall[]; stats?: CallStats; pagination: { total: number; page: number; limit: number; totalPages: number } }> => {
    const response = await api.get("/admin/service-calls", { params });
    return { data: response.data.data, stats: response.data.stats, pagination: response.data.pagination };
  },

  getCallDetail: async (id: string): Promise<ServiceCall> => {
    const response = await api.get(`/admin/service-calls/${id}`);
    return response.data.data;
  },
};
