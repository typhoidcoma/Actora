/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AELORA_BASE_URL?: string
  readonly VITE_AELORA_MOCK?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
