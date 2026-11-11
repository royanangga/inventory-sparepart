'use client';
import { memo, useCallback, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { saveGrid, requestGrid } from '../../lib/actions';
import ConfirmForm from '../ConfirmForm';
import Pager from '../Pager';
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const parse = (s) => { const t = String(s ?? '').trim().replace(',', '.'); return t === '' ? 0 : Number(t); };

const Row = memo(function Row({ r, v, onChange, locked, show }) {
  if (!show) return null;
  const inn = parse(v.in), out = parse(v.out), nan = Number.isNaN(inn) || Number.isNaN(out) || inn < 0 || out < 0;
  const bal = r.open + (nan ? 0 : inn - out), bad = nan || bal < 0, changed = !nan && (inn !== r.inn || out !== r.outt);
  return (
    <tr style={changed ? { background: '#fffbe6' } : undefined}>
      <td>{r.group}</td><td>{r.code || <span className="warn">—</span>}</td><td>{r.name}</td><td>{r.spec}</td>
      <td className="n">{nf.format(r.open)}</td>
      <td className="n"><input value={v.in} onChange={(e) => onChange(r.id, 'in', e.target.value)} inputMode="decimal" disabled={r.pend} style={{ width: 80, textAlign: 'right' }} /></td>
      <td className="n"><input value={v.out} onChange={(e) => onChange(r.id, 'out', e.target.value)} inputMode="decimal" disabled={r.pend} style={{ width: 80, textAlign: 'right' }} /></td>
      <td className="n" style={bad ? { color: '#b3261e' } : undefined}><b>{nan ? '?' : nf.format(bal)}</b>{r.pend && <div className="muted">menunggu approval</div>}</td>
    </tr>
  );
});

export default function Grid({ rows, month, prev, locked }) {
  const init = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, { in: r.inn ? String(r.inn) : '', out: r.outt ? String(r.outt) : '' }])), [rows]);
  const [vals, setVals] = useState(init);
  const [filter, setFilter] = useState('');
  const [pg, setPg] = useState(1), [ps, setPs] = useState(50);
  const [state, action] = useFormState(locked ? requestGrid : saveGrid, {});
  const onChange = useCallback((id, k, val) => setVals((p) => ({ ...p, [id]: { ...p[id], [k]: val } })), []);
  const { changed, invalid } = useMemo(() => {
    const changed = []; let invalid = 0;
    for (const r of rows) {
      if (r.pend) continue;
      const v = vals[r.id], inn = parse(v.in), out = parse(v.out);
      if (Number.isNaN(inn) || Number.isNaN(out) || inn < 0 || out < 0 || r.open + inn - out < 0) { invalid++; continue; }
      if (inn !== r.inn || out !== r.outt) changed.push({ id: r.id, in: inn, out });
    }
    return { changed, invalid };
  }, [rows, vals]);
  const f = filter.trim().toLowerCase();
  const list = rows.filter((r) => !f || `${r.code || ''} ${r.name || ''} ${r.spec || ''} ${r.group || ''}`.toLowerCase().includes(f));
  const cur = Math.min(pg, Math.max(1, Math.ceil(list.length / ps))), view = list.slice((cur - 1) * ps, cur * ps);
  const total = rows.reduce((a, r) => { const v = vals[r.id], i = parse(v.in), o = parse(v.out); return a + r.open + (Number.isNaN(i) ? 0 : i) - (Number.isNaN(o) ? 0 : o); }, 0);
  const build = (fd) => {
    if (!changed.length) return null;
    const by = new Map(rows.map((r) => [r.id, r]));
    const list = changed.map((c) => { const r = by.get(c.id); return { label: `${r.code || '-'} ${r.name || ''}`.trim(), from: `Masuk ${nf.format(r.inn)} · Keluar ${nf.format(r.outt)}`, to: `Masuk ${nf.format(c.in)} · Keluar ${nf.format(c.out)}` }; });
    return locked
      ? { title: `Ajukan ${list.length} perubahan ke Accounting?`, intro: `Alasan: ${String(fd.get('reason') || '').trim()}. Data baru berlaku setelah disetujui.`, rows: list, confirmText: 'Ajukan perubahan' }
      : { title: `Simpan ${list.length} perubahan mutasi ${month}?`, intro: 'Jumlah Masuk/Keluar lama akan diganti dengan nilai baru berikut.', rows: list, confirmText: 'Simpan' };
  };
  return (
    <ConfirmForm action={action} build={build}>
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="payload" value={JSON.stringify(changed)} />
      <div className="bar">
        <input value={filter} onChange={(e) => { setFilter(e.target.value); setPg(1); }} placeholder="Cari kode / item / spesifikasi (tidak menghapus isian)" size={46} />
        {locked && <input name="reason" placeholder="Alasan perubahan (wajib)" size={44} required />}
        <button disabled={!changed.length || invalid > 0}>{locked ? 'Ajukan perubahan' : 'Simpan'} ({changed.length} baris diubah)</button>
        <span className="muted">Total saldo: <b>{nf.format(total)}</b></span>
      </div>
      {invalid > 0 && <div className="err">{invalid} baris tidak valid (angka salah atau saldo negatif), perbaiki dulu.</div>}
      {state?.error && <div className="err">{state.error}</div>}
      {state?.ok && <div className="ok">{state.ok}</div>}
      <div className="wrap" style={{ maxHeight: '70vh' }}><table>
        <thead><tr><th>Kelompok</th><th>Kode</th><th>Item</th><th>Spesifikasi</th><th className="n">Stok akhir {prev}</th><th className="n">Masuk (+)</th><th className="n">Keluar (−)</th><th className="n">Saldo</th></tr></thead>
        <tbody>{view.map((r) => <Row key={r.id} r={r} v={vals[r.id]} onChange={onChange} locked={locked} show />)}</tbody>
      </table></div>
      <Pager page={cur} size={ps} total={list.length} onPage={setPg} onSize={(n) => { setPs(n); setPg(1); }} />
    </ConfirmForm>
  );
}
