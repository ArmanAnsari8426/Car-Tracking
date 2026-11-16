import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Reads DATABASE_URL from .env (local) or from the environment (Neon / Vercel).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
