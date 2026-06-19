/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_AMAP_JSAPI_KEY?: string;
  readonly VITE_AMAP_JSCODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
