/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_INTERACTION_SPACE: string
  readonly VITE_INTERACTION_ENVIRONMENT: string
  readonly VITE_INTERACTION_ACCESS_TOKEN: string
  readonly VITE_IP_DISCOVERY_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
