import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { initDatabaseTables } from "./init";

// Persistent SQLite database file in workspace
const DB_FILE = "file:notary_funds.db";

let rawClient: Client | null = null;

export function getRawClient(): Client {
  if (!rawClient) {
    rawClient = createClient({ url: DB_FILE });
  }
  return rawClient;
}

export const db = drizzle(getRawClient(), { schema });

// Ensure tables and essential office accounts exist
let isInitialized = false;
export async function ensureDbInitialized() {
  if (!isInitialized) {
    await initDatabaseTables(getRawClient());
    isInitialized = true;
  }
}
