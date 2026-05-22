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
    problemTypeId?: string;
    problemType: string;
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

export const serviceCallsApi = {
  // Get all calls
  getAllCalls: async (): Promise<ServiceCall[]> => {
    const response = await api.get("/admin/service-calls/all");
    return response.data.data;
  },

  // Get calls by status
  getOpenCalls: async (): Promise<ServiceCall[]> => {
    const response = await api.get("/admin/service-calls/open");
    return response.data.data;
  },

  getAssignedCalls: async (): Promise<ServiceCall[]> => {
    const response = await api.get("/admin/service-calls/assigned");
    return response.data.data;
  },

  getInProgressCalls: async (): Promise<ServiceCall[]> => {
    const response = await api.get("/admin/service-calls/in-progress");
    return response.data.data;
  },

  getOnHoldCalls: async (): Promise<ServiceCall[]> => {
    const response = await api.get("/admin/service-calls/on-hold");
    return response.data.data;
  },

  getCompletedCalls: async (): Promise<ServiceCall[]> => {
    const response = await api.get("/admin/service-calls/completed");
    return response.data.data;
  },

  getCancelledCalls: async (): Promise<ServiceCall[]> => {
    const response = await api.get("/admin/service-calls/cancelled");
    return response.data.data;
  },

  // Get call detail
  getCallDetail: async (id: string): Promise<ServiceCall> => {
    const response = await api.get(`/admin/service-calls/${id}`);
    return response.data.data;
  },
};
