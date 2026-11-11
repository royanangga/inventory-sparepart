'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q } from './db';
import { verify, makeToken, getUser } from './auth';

export async function login(_prev, fd) {
  const [u] = await q('SELECT * FROM users WHERE username=$1', [String(fd.get('username') || '').trim().toLowerCase()]);
  if (!u || !verify(String(fd.get('password') || ''), u.password_hash)) return { error: 'Username atau password salah' };
  cookies().set('sess', makeToken({ id: u.id, u: u.username, name: u.name, role: u.role, wh: u.warehouse_id }),
    { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 43200 });
  redirect('/');
}
export async function logout() { cookies().delete('sess'); redirect('/login'); }

export async function addMovement(_prev, fd) {
  const u = getUser();
  if (!u || u.role !== 'gudang') return { error: 'Tidak diizinkan' };
  const itemId = parseInt(String(fd.get('item')).split('|')[0], 10);
  const type = String(fd.get('type')), qty = Number(fd.get('qty')), date = String(fd.get('date'));
  if (!itemId || !['IN', 'OUT'].includes(type) || !(qty > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Data tidak valid, pilih barang dari daftar' };
  const [it] = await q(`SELECT i.warehouse_id, i.stock_sep + COALESCE((SELECT SUM(CASE type WHEN 'IN' THEN qty ELSE -qty END) FROM movements WHERE item_id=i.id),0) AS bal FROM items i WHERE i.id=$1`, [itemId]);
  if (!it || it.warehouse_id !== u.wh) return { error: 'Barang bukan milik gudang Anda' };
  if (type === 'OUT' && qty > it.bal) return { error: `Saldo tidak cukup (saldo saat ini ${it.bal})` };
  await q('INSERT INTO movements(item_id,date,type,qty,note,created_by) VALUES($1,$2,$3,$4,$5,$6)', [itemId, date, type, qty, String(fd.get('note') || '').trim() || null, u.u]);
  revalidatePath('/'); revalidatePath('/mutasi');
  return { ok: `Tersimpan: ${type === 'IN' ? 'Masuk' : 'Keluar'} ${qty}` };
}

export async function saveRate(fd) {
  const u = getUser(); if (!u || u.role !== 'accounting') return;
  const r = String(fd.get('rate') || '').trim();
  await q('INSERT INTO currency_rates(code,rate) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET rate=EXCLUDED.rate', [String(fd.get('code')), r === '' ? null : Number(r)]);
  revalidatePath('/price'); revalidatePath('/');
}
