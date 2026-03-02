import axios, { AxiosError, type AxiosResponse } from "axios"

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
})

axiosInstance.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => Promise.reject(error)
)

axiosInstance.interceptors.response.use(
  <T>(response: AxiosResponse<{ data: T }>) => {
    return response
  },
  <T>(error: AxiosError<{ data: T }>) => {
    return Promise.reject(error.response?.data)
  }
)

export default axiosInstance

// ----------------------------------------------------------------------

export const endpoints = {}
