const REQUIRED_ENV_VARS = [
  // Supabase
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",

  // Gemini
  "GEMINI_API_KEY",

  // Neo4j
  "NEO4J_URI",
  "NEO4J_USERNAME",
  "NEO4J_PASSWORD",

  // Tavily
  "TAVILY_API_KEY",

  // Render / Node
  "NODE_ENV",
] as const;

type RequiredEnvKey = (typeof REQUIRED_ENV_VARS)[number];

function requireEnv(key: RequiredEnvKey): string {
  const value = process.env[key];

  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable "${key}". ` +
        `Please set it in your environment (see .env.example) before starting the app.`
    );
  }

  return value;
}

/**
 * Accessor for all required environment variables.
 *
 * Importing this module will validate that all required environment
 * variables are present, causing the app to fail fast on startup if
 * anything is misconfigured.
 */
export const env: Record<RequiredEnvKey, string> = REQUIRED_ENV_VARS.reduce(
  (acc, key) => {
    acc[key] = requireEnv(key);
    return acc;
  },
  {} as Record<RequiredEnvKey, string>
);

