export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export const AMAP_JSAPI_KEY = import.meta.env.VITE_AMAP_JSAPI_KEY ?? "";
export const AMAP_JSCODE = import.meta.env.VITE_AMAP_JSCODE ?? "";

if (!API_BASE_URL) {
  throw new Error("Missing VITE_API_BASE_URL");
}
