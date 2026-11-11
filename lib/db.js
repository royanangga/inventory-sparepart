import pg from 'pg';
import schema from './schema';
pg.types.setTypeParser(1700, parseFloat); // numeric -> number
pg.types.setTypeParser(1082, (v) => v);   // date -> 'YYYY-MM-DD'
const g = globalThis;
export const pool = g._pgPool || (g._pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 5,
}));
// Skema idempotent dijalankan sekali per instance, jadi tabel baru otomatis dibuat tanpa langkah migrasi manual.
async function ensure() {
  if (!g._schemaReady) g._schemaReady = pool.query(schema).catch(async () => { await new Promise((r) => setTimeout(r, 300)); await pool.query(schema); }).catch((e) => { g._schemaReady = null; throw e; });
  return g._schemaReady;
}
export const q = async (text, params) => { await ensure(); return (await pool.query(text, params)).rows; };
