import pg from 'pg';
pg.types.setTypeParser(1700, parseFloat); // numeric -> number
pg.types.setTypeParser(1082, (v) => v);   // date -> 'YYYY-MM-DD'
const g = globalThis;
export const pool = g._pgPool || (g._pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 5,
}));
export const q = async (text, params) => (await pool.query(text, params)).rows;
