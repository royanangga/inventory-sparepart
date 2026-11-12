'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, pool } from './db';
import { verify, hash, makeToken, getUser } from './auth';
import { validMonth, monthRange } from './util';

const BAL = `SELECT i.stock_sep + COALESCE((SELECT SUM(CASE type WHEN 'IN' THEN qty ELSE -qty END) FROM movements WHERE item_id=i.id),0) AS bal FROM items i WHERE i.id=$1`;
const isLocked = async (wh, month) => (await q('SELECT 1 FROM period_locks WHERE warehouse_id=$1 AND month=$2', [wh, month])).length > 0;
const gudang = () => { const u = getUser(); return u && u.role === 'gudang' ? u : null; };
const refresh = () => ['/', '/dashboard', '/mutasi', '/approval'].forEach((p) => revalidatePath(p));

export async function login(_prev, fd) {
  const [u] = await q('SELECT * FROM users WHERE username=$1', [String(fd.get('username') || '').trim().toLowerCase()]);
  if (!u || !verify(String(fd.get('password') || ''), u.password_hash)) return { error: 'Username atau password salah' };
  cookies().set('sess', makeToken({ id: u.id, u: u.username, name: u.name, role: u.role, wh: u.warehouse_id }),
    { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 43200 });
  redirect('/dashboard');
}
// ---- Semua user: ganti password sendiri ----
export async function changePassword(_prev, fd) {
  const u = getUser(); if (!u) return { error: 'Sesi berakhir, silakan masuk lagi' };
  const cur = String(fd.get('current') || ''), nw = String(fd.get('next') || ''), cf = String(fd.get('confirm') || '');
  const [row] = await q('SELECT password_hash FROM users WHERE id=$1', [u.id]);
  if (!row || !verify(cur, row.password_hash)) return { error: 'Password saat ini salah' };
  if (nw.length < 8) return { error: 'Password baru minimal 8 karakter' };
  if (nw !== cf) return { error: 'Konfirmasi password tidak sama' };
  if (nw === cur) return { error: 'Password baru harus berbeda dari password lama' };
  await q('UPDATE users SET password_hash=$2 WHERE id=$1', [u.id, hash(nw)]);
  return { ok: 'Password berhasil diganti. Gunakan password baru saat masuk berikutnya.' };
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

// ---- Accounting: simpan data GL & status posting rekonsiliasi bulanan (per plant) ----
export async function saveRecon(fd) {
  const u = getUser(); if (!u || u.role !== 'accounting') return;
  const m = String(fd.get('month')); if (!validMonth(m)) return;
  const num = (k) => { const v = Number(String(fd.get(k) || '0').replace(/[^0-9.\-]/g, '')); return Number.isFinite(v) ? v : 0; };
  for (const w of await q('SELECT DISTINCT plant FROM warehouses')) {
    const k = w.plant;
    await q(`INSERT INTO recon_plant(month,plant,gl_in,je_ref,note,posted,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT(month,plant) DO UPDATE SET gl_in=EXCLUDED.gl_in, je_ref=EXCLUDED.je_ref, note=EXCLUDED.note,
      posted=EXCLUDED.posted, updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [m, k, num(`in_${k}`), String(fd.get(`ref_${k}`) || '').trim() || null, String(fd.get(`note_${k}`) || '').trim() || null, fd.get(`posted_${k}`) === 'on', u.u]);
  }
  revalidatePath('/rekon');
}

// ---- Detail barang: edit informasi (Accounting semua gudang, Gudang hanya gudangnya; kode hanya Accounting) ----
const ITEM_FIELDS = ['group_name', 'part_no', 'code', 'name', 'spec', 'machine', 'division', 'supplier'];
export async function updateItem(_prev, fd) {
  const u = getUser(); if (!u) return { error: 'Sesi berakhir, silakan masuk lagi' };
  const id = parseInt(fd.get('id'), 10); if (!id) return { error: 'Barang tidak valid' };
  const [it] = await q('SELECT * FROM items WHERE id=$1', [id]);
  const acc = u.role === 'accounting';
  if (!it || (!acc && it.warehouse_id !== u.wh)) return { error: 'Tidak diizinkan' };
  const f = (k) => String(fd.get(k) ?? '').trim().replace(/\s+/g, ' ').slice(0, 200) || null;
  const next = Object.fromEntries(ITEM_FIELDS.map((k) => [k, k === 'code' && !acc ? (it.code || null) : f(k)]));
  if (!next.name) return { error: 'Nama item wajib diisi' };
  const diff = ITEM_FIELDS.filter((k) => (it[k] || null) !== next[k]);
  if (!diff.length) return { error: 'Tidak ada perubahan untuk disimpan' };
  await q(`UPDATE items SET ${ITEM_FIELDS.map((k, i) => `${k}=$${i + 2}`).join(', ')} WHERE id=$1`, [id, ...ITEM_FIELDS.map((k) => next[k])]);
  await q('INSERT INTO item_edits(item_id,by_user,changes) VALUES($1,$2,$3)', [id, u.u, JSON.stringify(Object.fromEntries(diff.map((k) => [k, { from: it[k] || null, to: next[k] }])))]);
  refresh(); return { ok: 'Informasi barang tersimpan' };
}

// ---- Detail barang: stok per bulan (maks. 12 bulan terakhir sampai periode yang dipilih) + riwayat edit ----
export async function itemHistory(id, month) {
  const u = getUser(); if (!u) return { error: 'Sesi berakhir, silakan masuk lagi' };
  const acc = u.role === 'accounting';
  const [it] = await q('SELECT id, warehouse_id, code, stock_sep FROM items WHERE id=$1', [parseInt(id, 10) || 0]);
  if (!it || (!acc && it.warehouse_id !== u.wh)) return { error: 'Tidak diizinkan' };
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') && month >= '2026-10' ? month : '2026-10';
  const [y, mo] = m.split('-').map(Number), next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
  const mv = Object.fromEntries((await q(`SELECT to_char(date,'YYYY-MM') mo,
      SUM(CASE WHEN type='IN' THEN qty ELSE 0 END) inn, SUM(CASE WHEN type='OUT' THEN qty ELSE 0 END) outt
    FROM movements WHERE item_id=$1 AND date<$2 GROUP BY 1`, [it.id, next])).map((r) => [r.mo, r]));
  const months = []; // semua bulan sejak 2026-10 sampai periode terpilih
  for (let yy = 2026, mm = 10; `${yy}-${String(mm).padStart(2, '0')}` <= m; mm === 12 ? (yy++, mm = 1) : mm++) months.push(`${yy}-${String(mm).padStart(2, '0')}`);
  let bal = Number(it.stock_sep);
  const all = months.map((k) => { const inn = Number(mv[k]?.inn || 0), outt = Number(mv[k]?.outt || 0), open = bal; bal = open + inn - outt; return { month: k, open, inn, outt, close: bal }; });
  const rows = all.slice(-12);
  if (rows[0]?.month === '2026-10') rows.unshift({ month: '2026-09', open: null, inn: null, outt: null, close: Number(it.stock_sep) });
  let prices = {};
  if (acc && it.code) {
    for (const p of await q(`SELECT p.month, p.price, COALESCE(p.currency_code,'03') cur, cr.rate FROM price_effective p
        LEFT JOIN currency_rates cr ON cr.code=COALESCE(p.currency_code,'03') WHERE p.item_code=$1 AND p.month=ANY($2)`, [it.code, rows.map((r) => r.month)]))
      prices[p.month] = p.rate == null ? { price: p.price, val: null } : { price: p.price, val: p.price * p.rate };
  }
  for (const r of rows) { const p = prices[r.month]; r.price = p ? p.price : null; r.value = p && p.val != null ? r.close * p.val : null; r.hasPrice = !!p; }
  const edits = await q('SELECT by_user, changes, at FROM item_edits WHERE item_id=$1 ORDER BY at DESC LIMIT 8', [it.id]);
  return { rows, edits: edits.map((e) => ({ by: e.by_user, changes: e.changes, at: new Date(e.at).toISOString() })), acc };
}

// ---- Accounting: pilih harga lain dari price master (harga manual) ----
const samePrice = (a, b) => !!a && !!b && Number(a.price) === Number(b.price) && (a.currency_code || null) === (b.currency_code || null)
  && (a.trade_code || null) === (b.trade_code || null) && (a.start_date || null) === (b.start_date || null);
const okMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '') && m >= '2026-10';

export async function priceOptions(code, month) {
  const u = getUser(); if (!u || u.role !== 'accounting') return { error: 'Tidak diizinkan' };
  const m = String(month || ''), k = String(code || '');
  if (!okMonth(m) || !k) return { error: 'Data tidak valid' };
  const [cur] = await q('SELECT * FROM price_effective WHERE month=$1 AND item_code=$2', [m, k]);
  const [auto] = await q('SELECT * FROM price_master WHERE month=$1 AND item_code=$2', [m, k]);
  const cands = await q(`SELECT c.id, c.price, c.currency_code, COALESCE(c.currency_code,'03') cur, c.trade_code, c.trade_name, c.start_date, c.last_update, cr.rate
    FROM price_candidates c LEFT JOIN currency_rates cr ON cr.code=COALESCE(c.currency_code,'03')
    WHERE c.month=$1 AND c.item_code=$2 ORDER BY c.start_date DESC, c.last_update DESC NULLS LAST, c.id`, [m, k]);
  const options = cands.map((c) => ({ id: c.id, price: c.price, cur: c.cur, rate: c.rate, trade_code: c.trade_code, trade_name: c.trade_name, start_date: c.start_date, last_update: c.last_update, isAuto: samePrice(c, auto), isCurrent: samePrice(c, cur) }));
  const [ov] = await q('SELECT reason, set_by, set_at FROM price_override WHERE month=$1 AND item_code=$2', [m, k]);
  const log = await q('SELECT action, old_price, new_price, old_trade, new_trade, reason, by_user, at FROM price_override_log WHERE month=$1 AND item_code=$2 ORDER BY id DESC LIMIT 5', [m, k]);
  const posted = await q(`SELECT DISTINCT w.plant FROM items i JOIN warehouses w ON w.id=i.warehouse_id JOIN recon_plant r ON r.plant=w.plant AND r.month=$1 AND r.posted WHERE i.code=$2`, [m, k]);
  const selId = cur?.manual ? (options.find((o) => o.isCurrent)?.id ?? null) : 'auto';
  return {
    options, selId, legacy: !cands.length, postedPlants: posted.map((x) => x.plant),
    auto: auto ? { price: auto.price, trade_name: auto.trade_name, start_date: auto.start_date } : null,
    current: cur ? { price: cur.price, trade_name: cur.trade_name, start_date: cur.start_date, manual: cur.manual } : null,
    override: ov ? { reason: ov.reason, by: ov.set_by, at: new Date(ov.set_at).toISOString() } : null,
    log: log.map((l) => ({ ...l, at: new Date(l.at).toISOString() })),
  };
}

export async function choosePrice(_prev, fd) {
  const u = getUser(); if (!u || u.role !== 'accounting') return { error: 'Tidak diizinkan' };
  const code = String(fd.get('code') || ''), m = String(fd.get('month') || ''), cid = String(fd.get('cid') || ''), reason = String(fd.get('reason') || '').trim();
  if (!code || !okMonth(m)) return { error: 'Data tidak valid' };
  if (!cid) return { error: 'Pilih salah satu harga' };
  if (reason.length < 3) return { error: 'Alasan wajib diisi (minimal 3 karakter)' };
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const old = (await c.query('SELECT * FROM price_effective WHERE month=$1 AND item_code=$2', [m, code])).rows[0];
    const auto = (await c.query('SELECT * FROM price_master WHERE month=$1 AND item_code=$2', [m, code])).rows[0];
    let nw = auto, manual = false;
    if (cid !== 'auto') {
      const cand = (await c.query('SELECT * FROM price_candidates WHERE id=$1 AND month=$2 AND item_code=$3', [parseInt(cid, 10) || 0, m, code])).rows[0];
      if (!cand) { await c.query('ROLLBACK'); return { error: 'Opsi harga tidak ditemukan, tutup lalu buka lagi dialog ini' }; }
      nw = cand; manual = !samePrice(cand, auto);
    }
    if (old && nw && samePrice(old, nw) && !!old.manual === manual) { await c.query('ROLLBACK'); return { error: 'Harga yang dipilih sudah dipakai' }; }
    if (manual) {
      await c.query(`INSERT INTO price_override(month,item_code,price,currency_code,unit_cls,trade_code,trade_name,start_date,reason,set_by,set_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
        ON CONFLICT(month,item_code) DO UPDATE SET price=EXCLUDED.price, currency_code=EXCLUDED.currency_code, unit_cls=EXCLUDED.unit_cls, trade_code=EXCLUDED.trade_code,
          trade_name=EXCLUDED.trade_name, start_date=EXCLUDED.start_date, reason=EXCLUDED.reason, set_by=EXCLUDED.set_by, set_at=now()`,
        [m, code, nw.price, nw.currency_code, nw.unit_cls, nw.trade_code, nw.trade_name, nw.start_date, reason, u.u]);
      await c.query("INSERT INTO currency_rates(code) VALUES($1) ON CONFLICT DO NOTHING", [nw.currency_code || '03']);
    } else await c.query('DELETE FROM price_override WHERE month=$1 AND item_code=$2', [m, code]);
    await c.query('INSERT INTO price_override_log(month,item_code,action,old_price,new_price,old_trade,new_trade,reason,by_user) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [m, code, manual ? 'SET' : 'RESET', old?.price ?? null, nw?.price ?? null, old?.trade_name ?? null, nw?.trade_name ?? null, reason, u.u]);
    await c.query('COMMIT');
    refresh(); ['/price', '/rekon'].forEach((p) => revalidatePath(p));
    return { ok: manual ? 'Harga manual tersimpan' : 'Harga dikembalikan ke otomatis (Start_Date terbaru)' };
  } catch { await c.query('ROLLBACK'); return { error: 'Gagal menyimpan, coba lagi' }; } finally { c.release(); }
}
