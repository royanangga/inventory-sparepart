'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, pool } from './db';
import { verify, makeToken, getUser } from './auth';
import { validMonth, monthRange } from './util';

const BAL = `SELECT i.stock_sep + COALESCE((SELECT SUM(CASE type WHEN 'IN' THEN qty ELSE -qty END) FROM movements WHERE item_id=i.id),0) AS bal FROM items i WHERE i.id=$1`;
const isLocked = async (wh, month) => (await q('SELECT 1 FROM period_locks WHERE warehouse_id=$1 AND month=$2', [wh, month])).length > 0;
const gudang = () => { const u = getUser(); return u && u.role === 'gudang' ? u : null; };
const refresh = () => ['/', '/mutasi', '/approval'].forEach((p) => revalidatePath(p));

export async function login(_prev, fd) {
  const [u] = await q('SELECT * FROM users WHERE username=$1', [String(fd.get('username') || '').trim().toLowerCase()]);
  if (!u || !verify(String(fd.get('password') || ''), u.password_hash)) return { error: 'Username atau password salah' };
  cookies().set('sess', makeToken({ id: u.id, u: u.username, name: u.name, role: u.role, wh: u.warehouse_id }),
    { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 43200 });
  redirect('/');
}
export async function logout() { cookies().delete('sess'); redirect('/login'); }

// Baca & validasi baris yang diubah dari tabel input bulanan: [{id, in, out}]
async function parseRows(u, fd, month) {
  let rows; try { rows = JSON.parse(String(fd.get('payload') || '[]')); } catch { return { error: 'Data tidak terbaca' }; }
  if (!Array.isArray(rows) || !rows.length) return { error: 'Tidak ada perubahan untuk disimpan' };
  if (rows.length > 5000) return { error: 'Terlalu banyak baris' };
  const [start, end] = monthRange(month);
  const ids = [...new Set(rows.map((r) => parseInt(r.id, 10)).filter(Boolean))];
  const info = Object.fromEntries((await q(`SELECT i.id, i.code, i.name, i.warehouse_id,
      i.stock_sep + COALESCE((SELECT SUM(CASE type WHEN 'IN' THEN qty ELSE -qty END) FROM movements WHERE item_id=i.id AND date<$2),0) AS open,
      COALESCE((SELECT SUM(qty) FROM movements WHERE item_id=i.id AND date>=$2 AND date<=$3 AND type='IN'),0) AS old_in,
      COALESCE((SELECT SUM(qty) FROM movements WHERE item_id=i.id AND date>=$2 AND date<=$3 AND type='OUT'),0) AS old_out
    FROM items i WHERE i.id=ANY($1)`, [ids, start, end])).map((x) => [x.id, x]));
  const list = [];
  for (const r of rows) {
    const it = info[parseInt(r.id, 10)], inn = Number(r.in), out = Number(r.out);
    if (!it || it.warehouse_id !== u.wh) return { error: 'Ada barang yang bukan milik gudang Anda' };
    if (!Number.isFinite(inn) || !Number.isFinite(out) || inn < 0 || out < 0) return { error: `Angka tidak valid pada ${it.code || it.name}` };
    if (it.open + inn - out < 0) return { error: `Saldo negatif pada ${it.code || ''} ${it.name || ''}` };
    list.push({ id: it.id, in: inn, out, info: it });
  }
  return { list };
}
// Ganti seluruh mutasi satu barang dalam satu bulan dengan satu baris Masuk + satu baris Keluar (tgl akhir bulan)
async function applyMonth(c, list, month, by, tag = '') {
  const [start, end] = monthRange(month);
  await c.query('DELETE FROM movements WHERE item_id=ANY($1) AND date>=$2 AND date<=$3', [list.map((x) => x.id), start, end]);
  const mv = { i: [], t: [], q: [] };
  for (const x of list) { if (x.in > 0) { mv.i.push(x.id); mv.t.push('IN'); mv.q.push(x.in); } if (x.out > 0) { mv.i.push(x.id); mv.t.push('OUT'); mv.q.push(x.out); } }
  if (mv.i.length) await c.query("INSERT INTO movements(item_id,date,type,qty,note,created_by) SELECT i,$4::date,t,q,$5,$6 FROM unnest($1::int[],$2::text[],$3::numeric[]) AS x(i,t,q)", [mv.i, mv.t, mv.q, end, 'Input bulanan' + tag, by]);
}

// ---- Gudang: simpan input bulanan selama bulan masih terbuka ----
export async function saveGrid(_prev, fd) {
  const u = gudang(), m = String(fd.get('month'));
  if (!u || !validMonth(m)) return { error: 'Tidak diizinkan' };
  if (await isLocked(u.wh, m)) return { error: `Bulan ${m} sudah dikunci. Ajukan perubahan ke Accounting.` };
  const r = await parseRows(u, fd, m); if (r.error) return r;
  await applyMonth(pool, r.list, m, u.u);
  refresh(); return { ok: `${r.list.length} baris tersimpan` };
}
export async function lockMonth(fd) {
  const u = gudang(), m = String(fd.get('month'));
  if (!u || !validMonth(m)) return;
  const r = await q('INSERT INTO period_locks(warehouse_id,month,locked_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING month', [u.wh, m, u.u]);
  if (r.length) await q("INSERT INTO period_events(warehouse_id,month,event,by_user) VALUES($1,$2,'LOCK',$3)", [u.wh, m, u.u]);
  refresh();
}

// ---- Accounting: buka kunci bulan ----
export async function unlockMonth(fd) {
  const u = getUser(); if (!u || u.role !== 'accounting') return;
  const wh = parseInt(fd.get('wh'), 10), m = String(fd.get('month')), reason = String(fd.get('reason') || '').trim();
  if (!wh || !/^\d{4}-\d{2}$/.test(m) || reason.length < 3) return;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const del = await c.query('DELETE FROM period_locks WHERE warehouse_id=$1 AND month=$2', [wh, m]);
    if (del.rowCount) {
      await c.query("UPDATE change_requests SET status='REJECTED', decided_by=$3, decided_at=now(), decision_note='Otomatis ditolak: bulan dibuka kuncinya oleh Accounting' WHERE warehouse_id=$1 AND month=$2 AND status='PENDING'", [wh, m, u.u]);
      await c.query("INSERT INTO period_events(warehouse_id,month,event,by_user,note) VALUES($1,$2,'UNLOCK',$3,$4)", [wh, m, u.u, reason]);
    }
    await c.query('COMMIT');
  } catch { await c.query('ROLLBACK'); } finally { c.release(); }
  refresh();
}

// ---- Gudang: ajukan koreksi setelah bulan terkunci ----
export async function requestGrid(_prev, fd) {
  const u = gudang(), m = String(fd.get('month')), reason = String(fd.get('reason') || '').trim();
  if (!u || !validMonth(m)) return { error: 'Tidak diizinkan' };
  if (reason.length < 5) return { error: 'Alasan perubahan wajib diisi' };
  if (!(await isLocked(u.wh, m))) return { error: `Bulan ${m} masih terbuka, simpan langsung tanpa approval` };
  const r = await parseRows(u, fd, m); if (r.error) return r;
  const dup = await q("SELECT item_id FROM change_requests WHERE status='PENDING' AND month=$1 AND action='SET' AND item_id=ANY($2)", [m, r.list.map((x) => x.id)]);
  if (dup.length) return { error: 'Ada barang yang masih menunggu approval, tunggu keputusan Accounting dulu' };
  for (const x of r.list) {
    await q("INSERT INTO change_requests(warehouse_id,month,action,item_id,new_in,new_out,snapshot,reason,requested_by) VALUES($1,$2,'SET',$3,$4,$5,$6,$7,$8)",
      [u.wh, m, x.id, x.in, x.out, JSON.stringify({ code: x.info.code, name: x.info.name, old_in: x.info.old_in, old_out: x.info.old_out }), reason, u.u]);
  }
  refresh(); return { ok: `${r.list.length} permintaan terkirim ke Accounting` };
}

// ---- Accounting: setujui / tolak ----
export async function decideRequest(_prev, fd) {
  const u = getUser(); if (!u || u.role !== 'accounting') return { error: 'Tidak diizinkan' };
  const id = parseInt(fd.get('id'), 10), approve = fd.get('decision') === 'APPROVE', note = String(fd.get('note') || '').trim();
  if (!approve && !note) return { error: 'Isi alasan penolakan' };
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [r] } = await c.query("SELECT * FROM change_requests WHERE id=$1 AND status='PENDING' FOR UPDATE", [id]);
    if (!r) { await c.query('ROLLBACK'); return { error: 'Permintaan tidak ditemukan atau sudah diproses' }; }
    if (approve) {
      const tag = ` [req #${r.id}]`;
      if (r.action === 'SET') await applyMonth(c, [{ id: r.item_id, in: Number(r.new_in), out: Number(r.new_out) }], r.month, r.requested_by, tag);
      else if (r.action === 'ADD') await c.query('INSERT INTO movements(item_id,date,type,qty,note,created_by) VALUES($1,$2,$3,$4,$5,$6)', [r.item_id, r.date, r.type, r.qty, (r.note || '') + tag, r.requested_by]);
      else {
        if (!(await c.query('SELECT 1 FROM movements WHERE id=$1', [r.movement_id])).rowCount) throw new Error('Mutasi asli sudah tidak ada');
        if (r.action === 'EDIT') await c.query('UPDATE movements SET type=$2,qty=$3,date=$4,note=$5 WHERE id=$1', [r.movement_id, r.type, r.qty, r.date, (r.note || '') + tag]);
        else await c.query('DELETE FROM movements WHERE id=$1', [r.movement_id]);
      }
      const bal = (await c.query(BAL, [r.item_id])).rows[0].bal;
      if (bal < 0) throw new Error(`Saldo barang akan negatif (${bal}), permintaan tidak bisa disetujui`);
    }
    await c.query('UPDATE change_requests SET status=$2, decided_by=$3, decided_at=now(), decision_note=$4 WHERE id=$1', [id, approve ? 'APPROVED' : 'REJECTED', u.u, note || null]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); return { error: e.message }; } finally { c.release(); }
  refresh(); return { ok: approve ? 'Disetujui dan sudah diterapkan' : 'Ditolak' };
}

export async function saveRate(fd) {
  const u = getUser(); if (!u || u.role !== 'accounting') return;
  const r = String(fd.get('rate') || '').trim();
  await q('INSERT INTO currency_rates(code,rate) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET rate=EXCLUDED.rate', [String(fd.get('code')), r === '' ? null : Number(r)]);
  revalidatePath('/price'); revalidatePath('/');
}
