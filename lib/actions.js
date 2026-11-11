'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, pool } from './db';
import { verify, makeToken, getUser } from './auth';
import { today, thisMonth, validMonth } from './util';

const BAL = `SELECT i.stock_sep + COALESCE((SELECT SUM(CASE type WHEN 'IN' THEN qty ELSE -qty END) FROM movements WHERE item_id=i.id),0) AS bal FROM items i WHERE i.id=$1`;
const isLocked = async (wh, month) => (await q('SELECT 1 FROM period_locks WHERE warehouse_id=$1 AND month=$2', [wh, month])).length > 0;
const gudang = () => { const u = getUser(); return u && u.role === 'gudang' ? u : null; };
const itemId = (v) => parseInt(String(v || '').split('|')[0], 10);
const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d.slice(0, 7) >= '2026-10' && d <= today();
const refresh = () => ['/', '/mutasi', '/approval'].forEach((p) => revalidatePath(p));

export async function login(_prev, fd) {
  const [u] = await q('SELECT * FROM users WHERE username=$1', [String(fd.get('username') || '').trim().toLowerCase()]);
  if (!u || !verify(String(fd.get('password') || ''), u.password_hash)) return { error: 'Username atau password salah' };
  cookies().set('sess', makeToken({ id: u.id, u: u.username, name: u.name, role: u.role, wh: u.warehouse_id }),
    { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 43200 });
  redirect('/');
}
export async function logout() { cookies().delete('sess'); redirect('/login'); }

// ---- Gudang: input selama bulan masih terbuka ----
export async function addMovement(_prev, fd) {
  const u = gudang(); if (!u) return { error: 'Tidak diizinkan' };
  const id = itemId(fd.get('item')), type = String(fd.get('type')), qty = Number(fd.get('qty')), date = String(fd.get('date'));
  if (!id || !['IN', 'OUT'].includes(type) || !(qty > 0) || !okDate(date)) return { error: 'Data tidak valid (pilih barang dari daftar, tanggal tidak boleh di masa depan)' };
  const [it] = await q('SELECT warehouse_id FROM items WHERE id=$1', [id]);
  if (!it || it.warehouse_id !== u.wh) return { error: 'Barang bukan milik gudang Anda' };
  if (await isLocked(u.wh, date.slice(0, 7))) return { error: `Bulan ${date.slice(0, 7)} sudah dikunci. Ajukan perubahan ke Accounting.` };
  if (type === 'OUT') { const [{ bal }] = await q(BAL, [id]); if (qty > bal) return { error: `Saldo tidak cukup (saldo saat ini ${bal})` }; }
  await q('INSERT INTO movements(item_id,date,type,qty,note,created_by) VALUES($1,$2,$3,$4,$5,$6)', [id, date, type, qty, String(fd.get('note') || '').trim() || null, u.u]);
  refresh(); return { ok: `Tersimpan: ${type === 'IN' ? 'Masuk' : 'Keluar'} ${qty}` };
}
export async function deleteMovement(fd) {
  const u = gudang(); if (!u) return;
  const [m] = await q('SELECT m.date, i.warehouse_id FROM movements m JOIN items i ON i.id=m.item_id WHERE m.id=$1', [parseInt(fd.get('id'), 10)]);
  if (!m || m.warehouse_id !== u.wh || (await isLocked(u.wh, m.date.slice(0, 7)))) return;
  await q('DELETE FROM movements WHERE id=$1', [parseInt(fd.get('id'), 10)]); refresh();
}
export async function lockMonth(fd) {
  const u = gudang(); const m = String(fd.get('month'));
  if (!u || !validMonth(m)) return;
  await q('INSERT INTO period_locks(warehouse_id,month,locked_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [u.wh, m, u.u]); refresh();
}

// ---- Gudang: ajukan perubahan setelah bulan terkunci ----
export async function requestChange(_prev, fd) {
  const u = gudang(); if (!u) return { error: 'Tidak diizinkan' };
  const action = String(fd.get('action')), reason = String(fd.get('reason') || '').trim();
  if (!['ADD', 'EDIT', 'DELETE'].includes(action)) return { error: 'Jenis perubahan tidak valid' };
  if (reason.length < 5) return { error: 'Alasan perubahan wajib diisi' };
  let month, iid, mid = null, snap = null;
  if (action === 'ADD') {
    iid = itemId(fd.get('item'));
    const [it] = await q('SELECT warehouse_id, code, name FROM items WHERE id=$1', [iid]);
    if (!it || it.warehouse_id !== u.wh) return { error: 'Pilih barang dari daftar milik gudang Anda' };
    snap = { code: it.code, name: it.name }; month = String(fd.get('date')).slice(0, 7);
  } else {
    mid = itemId(fd.get('movement'));
    const [m] = await q('SELECT m.*, i.warehouse_id, i.code, i.name FROM movements m JOIN items i ON i.id=m.item_id WHERE m.id=$1', [mid]);
    if (!m || m.warehouse_id !== u.wh) return { error: 'Mutasi tidak ditemukan' };
    if ((await q("SELECT 1 FROM change_requests WHERE movement_id=$1 AND status='PENDING'", [mid])).length) return { error: 'Mutasi ini masih punya permintaan yang menunggu approval' };
    iid = m.item_id; month = m.date.slice(0, 7);
    snap = { code: m.code, name: m.name, type: m.type, qty: m.qty, date: m.date, note: m.note };
  }
  if (!(await isLocked(u.wh, month))) return { error: `Bulan ${month} masih terbuka, ubah langsung tanpa approval` };
  let type = null, qty = null, date = null, note = null;
  if (action !== 'DELETE') {
    type = String(fd.get('type')); qty = Number(fd.get('qty')); date = String(fd.get('date')); note = String(fd.get('note') || '').trim() || null;
    if (!['IN', 'OUT'].includes(type) || !(qty > 0) || !okDate(date) || date.slice(0, 7) !== month) return { error: `Data tidak valid; tanggal harus di dalam bulan ${month}` };
  }
  await q('INSERT INTO change_requests(warehouse_id,month,action,movement_id,item_id,type,qty,date,note,snapshot,reason,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [u.wh, month, action, mid, iid, type, qty, date, note, JSON.stringify(snap), reason, u.u]);
  refresh(); return { ok: 'Permintaan terkirim, menunggu approval Accounting' };
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
      if (r.action === 'ADD') await c.query('INSERT INTO movements(item_id,date,type,qty,note,created_by) VALUES($1,$2,$3,$4,$5,$6)', [r.item_id, r.date, r.type, r.qty, (r.note || '') + tag, r.requested_by]);
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
