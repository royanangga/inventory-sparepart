'use client';
import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { priceOptions, choosePrice } from '../lib/actions';
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 });
const dt = (v) => (v ? String(v).slice(0, 10) : '—');
const Apply = ({ disabled }) => { const { pending } = useFormStatus(); return <button disabled={disabled || pending}>{pending ? 'Menyimpan…' : 'Terapkan harga'}</button>; };

function Body({ code, month, price }) {
  const [d, setD] = useState(null), [sel, setSel] = useState(null);
  const [state, action] = useFormState(choosePrice, {});
  useEffect(() => {
    let on = true;
    priceOptions(code, month).then((r) => { if (on) { setD(r); setSel(r.selId ?? null); } }).catch(() => on && setD({ error: 'Gagal memuat opsi harga' }));
    return () => { on = false; };
  }, [code, month, price, state?.ok]);
  if (!d) return <p className="muted">Memuat…</p>;
  if (d.error) return <div className="err">{d.error}</div>;
  const cur = d.current;
  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <input type="hidden" name="code" value={code} /><input type="hidden" name="month" value={month} />
      <p className="muted" style={{ margin: 0 }}>Harga berlaku untuk <b>semua baris barang berkode {code}</b> (semua gudang) pada periode {month}, dan dipakai di nilai persediaan, laporan, dan rekonsiliasi.</p>
      {cur && <div className="card" style={{ margin: 0, padding: 12 }}>
        Dipakai sekarang: <b>{nf.format(cur.price)}</b> · {cur.trade_name || '—'} · {dt(cur.start_date)}{' '}
        {cur.manual ? <span className="tag">manual</span> : <span className="tag ok">otomatis</span>}
        {cur.manual && d.override && <div className="muted">Dipilih {d.override.by}, {new Date(d.override.at).toLocaleString('id-ID')} — {d.override.reason}</div>}
      </div>}
      {d.postedPlants.length > 0 && <div className="err">Rekonsiliasi plant {d.postedPlants.join(', ')} periode {month} sudah ditandai diposting. Perubahan harga mengubah nilai jurnalnya, periksa ulang di menu Rekonsiliasi.</div>}
      {d.legacy && <p className="muted" style={{ margin: 0 }}>Opsi harga lain belum tersimpan untuk periode ini. Upload ulang price master periode {month} (menu Price Master) agar semua harga per supplier muncul di sini.</p>}
      {!d.legacy && (
        <div className="chg" style={{ maxHeight: '38vh' }}><table>
          <thead><tr><th /><th className="n">Harga</th><th>Supplier</th><th>Start date</th><th>Last update</th><th /></tr></thead>
          <tbody>
            <tr><td><input type="radio" name="cid" value="auto" checked={sel === 'auto'} onChange={() => setSel('auto')} aria-label="Otomatis" style={{ padding: 0, minHeight: 0 }} /></td>
              <td colSpan={4}><b>Otomatis</b> <span className="muted">— Start_Date terbaru{d.auto ? ` (${nf.format(d.auto.price)})` : ''}</span></td><td /></tr>
            {d.options.map((o) => (
              <tr key={o.id}>
                <td><input type="radio" name="cid" value={o.id} checked={sel === o.id} onChange={() => setSel(o.id)} aria-label={`Harga ${o.price}`} style={{ padding: 0, minHeight: 0 }} /></td>
                <td className="n"><b>{nf.format(o.price)}</b>{o.cur !== '03' && <div className="muted">kurs {o.cur}</div>}</td>
                <td>{o.trade_name || o.trade_code || '—'}</td><td>{dt(o.start_date)}</td><td>{dt(o.last_update)}</td>
                <td>{o.isAuto && <span className="tag ok">otomatis</span>} {o.isCurrent && <span className="tag">dipakai</span>}</td>
              </tr>))}
          </tbody></table></div>)}
      {!d.legacy && <>
        <label style={{ margin: 0 }}>Alasan (wajib)<input name="reason" placeholder="mis. harga PO terakhir / kontrak supplier" maxLength={200} required /></label>
        {state?.error && <div className="err">{state.error}</div>}
        {state?.ok && <div className="ok">{state.ok}</div>}
        <div className="dlg-a" style={{ marginTop: 0 }}><Apply disabled={sel == null || (sel === d.selId)} /></div></>}
      {d.log.length > 0 && <details><summary className="muted">Riwayat perubahan harga ({d.log.length})</summary>
        {d.log.map((l, i) => <div key={i} style={{ padding: '4px 0' }}><small className="muted">{new Date(l.at).toLocaleString('id-ID')} · {l.by_user}</small><div>{l.action === 'SET' ? 'Pilih manual' : 'Kembali ke otomatis'}: {l.old_price == null ? '—' : nf.format(l.old_price)} → <b>{l.new_price == null ? '—' : nf.format(l.new_price)}</b> · {l.reason}</div></div>)}</details>}
    </form>);
}

// Harga di tabel stok (khusus Accounting): klik untuk melihat opsi harga lain dari price master dan memilih harga manual
export default function PriceOptions({ code, month, price, className, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open]);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title="Lihat / ubah harga">{children}</button>
      {open && (
        <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dlg" role="dialog" aria-modal="true" aria-label="Pilih harga" style={{ width: 'min(760px,100%)', overflow: 'auto', textAlign: 'left' }}>
            <h2>Harga {code} — {month}</h2>
            <Body code={code} month={month} price={price} />
            <div className="dlg-a"><button type="button" className="ghost" onClick={() => setOpen(false)}>Tutup</button></div>
          </div>
        </div>)}
    </>);
}
