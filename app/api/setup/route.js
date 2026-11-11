// Setup sekali jalan dari browser: buka /api/setup?token=<SETUP_TOKEN>
import crypto from 'crypto';
import { pool } from '../../../lib/db';
import schema from '../../../lib/schema';
import seed from '../../../db/seed.json';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WH = [['SUNTER','Sunter','Gudang Sunter'],['KIIC-MT','KIIC','Gudang Maintenance KIIC'],['KIIC-ST','KIIC','Gudang Stamping KIIC'],['SC1','SC1','Gudang SC1'],['SC2','SC2','Gudang SC2']];
const USERS = [['accounting','Accounting','accounting',null],['gudang_sunter','Gudang Sunter','gudang','SUNTER'],['gudang_kiic_maint','Gudang Maintenance KIIC','gudang','KIIC-MT'],['gudang_kiic_stamping','Gudang Stamping KIIC','gudang','KIIC-ST'],['gudang_sc1','Gudang SC1','gudang','SC1'],['gudang_sc2','Gudang SC2','gudang','SC2']];
const hash = (pw) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
const text = (t, status = 200) => new Response(t, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req) {
  const token = process.env.SETUP_TOKEN, given = new URL(req.url).searchParams.get('token') || '';
  if (!token || given.length !== token.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token))) return text('Forbidden', 403);
  try {
    const out = [];
    await pool.query(schema);
    for (const [c, p, n] of WH) await pool.query('INSERT INTO warehouses(code,plant,name) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING', [c, p, n]);
    const wid = Object.fromEntries((await pool.query('SELECT id,code FROM warehouses')).rows.map((r) => [r.code, r.id]));
    out.push('USER BARU (catat password, tidak ditampilkan lagi):');
    for (const [u, n, r, w] of USERS) {
      if ((await pool.query('SELECT 1 FROM users WHERE username=$1', [u])).rowCount) continue;
      const pw = crypto.randomBytes(5).toString('hex');
      await pool.query('INSERT INTO users(username,name,password_hash,role,warehouse_id) VALUES($1,$2,$3,$4,$5)', [u, n, hash(pw), r, w ? wid[w] : null]);
      out.push(`  ${u.padEnd(22)} ${pw}`);
    }
    if ((await pool.query('SELECT count(*)::int c FROM items')).rows[0].c) out.push('\nItem sudah ada, seed data dilewati.');
    else {
      const N = seed.length, ids = seed.map((_, i) => i + 1), c = (k) => seed.map((s) => s[k] ?? null);
      await pool.query(
        `INSERT INTO items(id,warehouse_id,group_name,part_no,code,name,spec,machine,division,period,supplier,stock_sep)
         SELECT * FROM unnest($1::int[],$2::int[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::text[],$10::text[],$11::text[],$12::numeric[])`,
        [ids, seed.map((s) => wid[s.w]), c('g'), c('pn'), c('c'), c('n'), c('s'), c('m'), c('dv'), c('pr'), c('sp'), seed.map((s) => s.so || 0)]);
      await pool.query("SELECT setval(pg_get_serial_sequence('items','id'), $1)", [N]);
      const mv = { i: [], t: [], q: [] };
      seed.forEach((s, k) => { if (s.i > 0) { mv.i.push(k + 1); mv.t.push('IN'); mv.q.push(s.i); } if (s.o > 0) { mv.i.push(k + 1); mv.t.push('OUT'); mv.q.push(s.o); } });
      await pool.query("INSERT INTO movements(item_id,date,type,qty,note,created_by) SELECT i,'2026-10-31',t,q,'Total mutasi Oktober 2026 (import awal)','setup' FROM unnest($1::int[],$2::text[],$3::numeric[]) AS x(i,t,q)", [mv.i, mv.t, mv.q]);
      out.push(`\nSeed selesai: ${N} baris barang, ${mv.i.length} mutasi Oktober.`);
    }
    out.push('\nSelesai. Hapus environment variable SETUP_TOKEN di Vercel lalu Redeploy.');
    return text(out.join('\n'));
  } catch (e) { return text('Error: ' + e.message, 500); }
}
