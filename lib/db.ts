import "server-only";
import postgres from "postgres";

const url = process.env.POSTGRES_URL;
if (!url) throw new Error("POSTGRES_URL is not set");

// Supabase transaction pooler (port 6543) does not support prepared statements.
export const sql = postgres(url, { prepare: false, max: 5 });
