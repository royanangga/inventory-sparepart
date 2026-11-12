'use client';
import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateItem, itemHistory } from '../lib/actions';
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const lbl = (m) => `${BLN[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
const FIELDS = [['group_name', 'Kelompok'], ['part_no', 'Part No'], ['code', 'Kode'], ['name', 'Nama item'], ['spec', 'Spesifikasi'], ['machine', 'Mesin'], ['division', 'Divisi'], ['supplier', 'Supplier']];
const FL = Object.fromEntries(FIELDS);

function Save() { const { pending } = useFormStatus(); return <button disabled={pending}>{pending ? 'Menyimpan…' : 'Simpan perubahan'}</button>; }

function History({ item, month, acc }) {
  const [d, setD] = useState(null);
  useEffect(() => { let on = true; setD(null); itemHistory(item.id, month).then((r) => on && setD(r)).catch(() => on && setD({ error: 'Gagal memuat data' })); return () => { on = false; }; }, [item.id, month, item.name]);
  if (!d) return <p className="muted">Memuat…</p>;
  if (d.error) return <div className="err">{d.error}</div>;
  const hasAny = d.rows.some((r) => r.hasPrice);
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>Stok akhir per bulan, maksimal 12 bulan sampai {lbl(month)}. Data tersedia mulai stok akhir September 2026.</p>
      <div className="chg" style={{ maxHeight: '46vh' }}><table>
        <thead><tr><th>Bulan</th><th className="n">Stok awal</th><th className="n">Masuk</th><th className="n">Keluar</th><th className="n">Stok akhir</th>{acc && <><th className="n">Harga</th><th className="n">Nilai (IDR)</th></>}</tr></thead>
        <tbody>{d.rows.map((r) => (
          <tr key={r.month}><td>{lbl(r.month)}</td>
            <td className="n">{r.open == null ? '—' : nf.format(r.open)}</td><td className="n">{r.inn == null ? '—' : nf.format(r.inn)}</td><td className="n">{r.outt == null ? '—' : nf.format(r.outt)}</td>
            <td className="n"><b>{nf.format(r.close)}</b></td>
            {acc && <><td className="n">{r.price == null ? <span className="muted">—</span> : nf.format(r.price)}</td><td className="n">{r.value == null ? <span className="muted">—</span> : nf.format(r.value)}</td></>}
          </tr>))}</tbody></table></div>
      {acc && !hasAny && <p className="muted" style={{ margin: 0 }}>Belum ada harga di price master untuk bulan-bulan ini.</p>}
    </>);
}

function Edit({ item, acc, month }) {
  const [state, action] = useFormState(updateItem, {});
  const [edits, setEdits] = useState([]);
  useEffect(() => { let on = true; itemHistory(item.id, month).then((r) => on && setEdits(r.edits || [])).catch(() => {}); return () => { on = false; }; }, [item.id, month, state?.ok]);
  return (
    <>
      <form action={action} key={JSON.stringify(item)}>
        <input type="hidden" name="id" value={item.id} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0 14px' }}>
          {FIELDS.map(([k, t]) => (
            <label key={k} style={k === 'name' || k === 'spec' ? { gridColumn: '1/-1' } : undefined}>{t}{k === 'name' && ' *'}
              <input name={k} defaultValue={item[k] || ''} maxLength={200} required={k === 'name'} readOnly={k === 'code' && !acc} style={k === 'code' && !acc ? { background: '#f2f6f7' } : undefined} />
              {k === 'code' && (acc ? <small className="muted">Kode dipakai untuk mencocokkan harga di price master.</small> : <small className="muted">Kode hanya bisa diubah Accounting.</small>)}
            </label>))}
        </div>
        {state?.error && <div className="err">{state.error}</div>}
        {state?.ok && <div className="ok">{state.ok}</div>}
        <div className="dlg-a"><Save /></div>
      </form>
      {edits.length > 0 && <>
        <h3 style={{ margin: '4px 0 0', fontSize: 14 }}>Riwayat perubahan</h3>
        <div className="chg" style={{ maxHeight: '22vh' }}>{edits.map((e, i) => (
          <div key={i} style={{ padding: '8px 12px', borderTop: i ? '1px solid #edf1f3' : 0 }}>
            <small className="muted">{new Date(e.at).toLocaleString('id-ID')} · {e.by}</small>
            {Object.entries(e.changes).map(([k, v]) => <div key={k}><b>{FL[k] || k}</b>: <span className="chg-f">{v.from || '—'}</span> → <span className="chg-t">{v.to || '—'}</span></div>)}
          </div>))}</div></>}
    </>);
}

// Tombol pembuka (nama barang / tombol Edit) + dialog detail dengan dua tab: Stok bulanan & Edit info
export default function ItemDetail({ item, month, acc, tab: t0 = 'stok', className, children }) {
  const [open, setOpen] = useState(false), [tab, setTab] = useState(t0);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open]);
  return (
    <>
      <button type="button" className={className} onClick={() => { setTab(t0); setOpen(true); }}>{children}</button>
      {open && (
        <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dlg" role="dialog" aria-modal="true" aria-label="Detail barang" style={{ width: 'min(820px,100%)', overflow: 'auto' }}>
            <h2>{item.code || '—'} · {item.name}</h2>
            <p className="muted">{[item.group_name, item.spec, item.part_no && `Part No ${item.part_no}`, item.machine && `Mesin ${item.machine}`, item.division && `Divisi ${item.division}`, item.supplier && `Supplier ${item.supplier}`].filter(Boolean).join(' · ')}</p>
            <div className="bar" style={{ marginBottom: 0 }}>
              <button type="button" className={tab === 'stok' ? '' : 'ghost'} onClick={() => setTab('stok')}>Stok bulanan</button>
              <button type="button" className={tab === 'edit' ? '' : 'ghost'} onClick={() => setTab('edit')}>Edit informasi</button>
            </div>
            {tab === 'stok' ? <History item={item} month={month} acc={acc} /> : <Edit item={item} acc={acc} month={month} />}
            <div className="dlg-a"><button type="button" className="ghost" onClick={() => setOpen(false)}>Tutup</button></div>
          </div>
        </div>)}
    </>);
}
