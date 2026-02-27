import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

type Database = any;

let browserClient: SupabaseClient<Database> | undefined;

export function getBrowserSupabaseClient(): SupabaseClient<Database> {
  if (typeof window === "undefined") {
    throw new Error("getBrowserSupabaseClient must be called in the browser");
  }
  if (!browserClient) {
    browserClient = createClient<Database>(
      config.supabaseUrl(),
      config.supabaseAnonKey(),
    );
  }
  return browserClient;
}

export function getServiceSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    config.supabaseUrl(),
    config.supabaseServiceRoleKey(),
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

