import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRoute = error.config?.url?.includes("/admin/users/login");
    if (error.response?.status === 401 && !isLoginRoute) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;