export interface Env {
  BUSINESSES: DurableObjectNamespace;
  DIRECTORY: DurableObjectNamespace;
  ASSETS: Fetcher;
  HUB_ADMIN_TOKEN: string;
  TOKEN_ENCRYPTION_KEY: string;
  PUBLIC_ORIGIN?: string;
  POSTIZ_ORIGIN?: string;
  FANVUE_CLIENT_ID?: string;
  FANVUE_CLIENT_SECRET?: string;
  FANVUE_API_VERSION: string;
}
