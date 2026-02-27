type RequiredEnv =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "SUPABASE_DB_PASSWORD"
  | "GEMINI_API_KEY";

function readEnv(name: RequiredEnv): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  supabaseUrl: () => readEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseDbPassword: () => readEnv("SUPABASE_DB_PASSWORD"),
  geminiApiKey: () => readEnv("GEMINI_API_KEY"),
};

