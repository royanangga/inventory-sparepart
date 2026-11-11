// Jalankan sekali: npm run setup  (membuat tabel, mengisi data awal Sep/Okt 2026, membuat user)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { Pool } = require('pg');
try { process.loadEnvFile(path.join(__dirname, '..', '.env.local')); } catch {}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
const hash = (pw) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
const WH = [['SUNTER','Sunter','Gudang Sunter'],['KIIC-MT','KIIC','Gudang Maintenance KIIC'],['KIIC-ST','KIIC','Gudang Stamping KIIC'],['SC1','SC1','Gudang SC1'],['SC2','SC2','Gudang SC2']];
const USERS = [['accounting','Accounting','accounting',null],['gudang_sunter','Gudang Sunter','gudang','SUNTER'],['gudang_kiic_maint','Gudang Maintenance KIIC','gudang','KIIC-MT'],['gudang_kiic_stamping','Gudang Stamping KIIC','gudang','KIIC-ST'],['gudang_sc1','Gudang SC1','gudang','SC1'],['gudang_sc2','Gudang SC2','gudang','SC2']];
(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  for (const [c, p, n] of WH) await pool.query('INSERT INTO warehouses(code,plant,name) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING', [c, p, n]);
  const wid = Object.fromEntries((await pool.query('SELECT id,code FROM warehouses')).rows.map(r => [r.code, r.id]));
  await pool.query("INSERT INTO period_locks(warehouse_id,month,locked_by) SELECT id,'2026-10','setup' FROM warehouses ON CONFLICT DO NOTHING");
  console.log('\nUser baru (catat password, tidak ditampilkan lagi):');
  for (const [u, n, r, w] of USERS) {
    if ((await pool.query('SELECT 1 FROM users WHERE username=$1', [u])).rowCount) continue;
    const pw = process.env.INITIAL_PASSWORD || crypto.randomBytes(5).toString('hex');
    await pool.query('INSERT INTO users(username,name,password_hash,role,warehouse_id) VALUES($1,$2,$3,$4,$5)', [u, n, hash(pw), r, w ? wid[w] : null]);
    console.log(`  ${u.padEnd(22)} ${pw}`);
  }
  if ((await pool.query('SELECT count(*)::int c FROM items')).rows[0].c) { console.log('\nItem sudah ada, seed data dilewati.'); return pool.end(); }
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.json'), 'utf8'));
  const mv = { item: [], type: [], qty: [] };
  for (const s of seed) {
    const { rows } = await pool.query(
      'INSERT INTO items(warehouse_id,group_name,part_no,code,name,spec,machine,division,period,supplier,stock_sep) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
      [wid[s.w], s.g, s.pn || null, s.c || null, s.n || null, s.s || null, s.m || null, s.dv || null, s.pr || null, s.sp || null, s.so]);
    if (s.i > 0) { mv.item.push(rows[0].id); mv.type.push('IN'); mv.qty.push(s.i); }
    if (s.o > 0) { mv.item.push(rows[0].id); mv.type.push('OUT'); mv.qty.push(s.o); }
  }
  await pool.query("INSERT INTO movements(item_id,date,type,qty,note,created_by) SELECT i,'2026-10-31',t,q,'Total mutasi Oktober 2026 (import awal)','setup' FROM unnest($1::int[],$2::text[],$3::numeric[]) AS x(i,t,q)", [mv.item, mv.type, mv.qty]);
  console.log(`\nSeed selesai: ${seed.length} baris barang, ${mv.item.length} mutasi Oktober.`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
