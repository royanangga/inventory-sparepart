import Link from 'next/link';
import { requireUser } from '../../lib/auth';
import { thisMonth, validMonth } from '../../lib/util';
import { getRecon } from '../../lib/recon';
import { saveRecon } from '../../lib/actions';
import PeriodPicker from '../PeriodPicker';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rekonsiliasi Bulanan' };
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const f = (v) => (v < 0 ? `(${nf.format(-v)})` : nf.format(v));
const dc = (v) => (v > 0 ? 'Dr Persediaan / Cr Beban' : v < 0 ? 'Dr Beban / Cr Persediaan' : '—');

export default async function Rekon({ searchParams: sp = {} }) {
  requireUser('accounting');
  const m = validMonth(sp.m) ? sp.m : thisMonth();
  const { list, total: T } = await getRecon(m);
  const open = list.filter((w) => !w.locked_by), nop = T.nop;
  const posted = list.filter((w) => w.posted).length;
  return (
    <>
      <h1>Rekonsiliasi Bulanan — {m}</h1>
      <form className="bar"><PeriodPicker defaultValue={m} min="2026-10" max={thisMonth()} /><button>Tampilkan</button>
        <a className="pbtn" href={`/api/rekon?m=${m}`} style={{ marginLeft: 'auto' }}>Unduh Excel (jurnal + detail IN/OUT)</a></form>
      <div className="card"><b>Cara kerja.</b> Pembelian periode ini umumnya langsung dibebankan ke Beban, sedangkan sebagian part sudah benar masuk Persediaan di GL.
        Data <b>IN</b> aplikasi seharusnya ada di akun <b>Persediaan</b>; data <b>OUT</b> aplikasi seharusnya ada di akun <b>Beban</b>.
        Isi nilai yang <b>sudah tercatat di Persediaan GL</b> (debit pembelian = IN, kredit pemakaian = OUT), selisihnya menjadi jurnal penyesuaian.
        <div className="muted">Nilai aplikasi = qty × harga price master × kurs (harga terbaru saat ini).</div></div>
      {open.length > 0 && <p className="warn">Bulan {m} belum dikunci di: {open.map((w) => w.label).join(', ')}. Angka bisa berubah sampai gudang mengunci bulan.</p>}
      {nop > 0 && <p className="warn">{nop} baris barang bergerak tanpa harga/kurs — nilainya belum ikut terhitung. Lengkapi di Price Master.</p>}
      <div className="cards" style={{ marginBottom: 12 }}>
        <div className="card"><small>IN aplikasi (→ Persediaan)</small><b>{f(T.in_v)}</b><small>di GL Persediaan: {f(T.glIn)}</small></div>
        <div className="card"><small>OUT aplikasi (→ Beban)</small><b>{f(T.out_v)}</b><small>di GL Persediaan: {f(T.glOut)}</small></div>
        <div className="card"><small>Penyesuaian bersih ke Persediaan</small><b className={T.net < 0 ? 'warn' : ''}>{f(T.net)}</b><small>{dc(T.net)}</small></div>
        <div className="card"><small>Status posting</small><b>{posted} / {list.length} gudang</b></div>
      </div>
      <form action={saveRecon}>
        <input type="hidden" name="month" value={m} />
        <div className="wrap"><table>
          <thead><tr><th>Gudang</th><th>Kunci</th><th className="n">IN aplikasi</th><th className="n">IN di GL Persediaan</th><th className="n">Adj IN</th>
            <th className="n">OUT aplikasi</th><th className="n">OUT di GL Persediaan</th><th className="n">Adj OUT</th><th className="n">Penyesuaian bersih</th><th>No. jurnal</th><th>Diposting</th></tr></thead>
          <tbody>{list.map((w) => (
            <tr key={w.id}><td>{w.label}{w.nop > 0 && <div className="muted">{w.nop} baris tanpa harga</div>}</td>
              <td>{w.locked_by ? <span className="tag ok">Terkunci</span> : <span className="tag">Terbuka</span>}</td>
              <td className="n">{f(w.in_v)}</td>
              <td><input name={`in_${w.id}`} type="number" step="any" defaultValue={w.glIn} style={{ width: 130 }} aria-label={`IN di GL ${w.label}`} /></td>
              <td className="n"><b>{f(w.adjIn)}</b></td>
              <td className="n">{f(w.out_v)}</td>
              <td><input name={`out_${w.id}`} type="number" step="any" defaultValue={w.glOut} style={{ width: 130 }} aria-label={`OUT di GL ${w.label}`} /></td>
              <td className="n"><b>{f(w.adjOut)}</b></td>
              <td className="n"><b className={w.net < 0 ? 'warn' : ''}>{f(w.net)}</b><div className="muted">{dc(w.net)}</div></td>
              <td><input name={`ref_${w.id}`} defaultValue={w.je_ref || ''} placeholder="mis. JV-2610-001" style={{ width: 130 }} aria-label={`No. jurnal ${w.label}`} />
                <input type="hidden" name={`note_${w.id}`} value={w.note || ''} /></td>
              <td><label><input type="checkbox" name={`posted_${w.id}`} defaultChecked={w.posted} /> sudah</label>
                {w.saved && <div className="muted">{w.updated_by}</div>}</td></tr>))}
          </tbody>
          <tfoot><tr><td colSpan={2}>TOTAL</td><td className="n">{f(T.in_v)}</td><td className="n">{f(T.glIn)}</td><td className="n">{f(T.adjIn)}</td>
            <td className="n">{f(T.out_v)}</td><td className="n">{f(T.glOut)}</td><td className="n">{f(T.adjOut)}</td><td className="n">{f(T.net)}</td><td colSpan={2} /></tr></tfoot>
        </table></div>
        <div className="bar" style={{ marginTop: 12 }}><button>Simpan rekonsiliasi {m}</button><span className="muted">Adj = nilai aplikasi − nilai yang sudah ada di GL Persediaan. Angka dihitung ulang setelah disimpan.</span></div>
      </form>
      <h3>Draft jurnal penyesuaian {m}</h3>
      <div className="wrap"><table>
        <thead><tr><th>Gudang</th><th>Akun</th><th className="n">Debit</th><th className="n">Kredit</th><th>Dasar</th></tr></thead>
        <tbody>{list.filter((w) => w.net !== 0).flatMap((w) => {
          const a = Math.abs(w.net), dr = w.net > 0 ? 'Persediaan Sparepart' : 'Beban Sparepart', cr = w.net > 0 ? 'Beban Sparepart' : 'Persediaan Sparepart';
          const basis = `Adj IN ${f(w.adjIn)} − Adj OUT ${f(w.adjOut)}`;
          return [<tr key={`${w.id}d`}><td>{w.label}</td><td>{dr}</td><td className="n">{nf.format(a)}</td><td className="n" /><td className="muted">{basis}</td></tr>,
            <tr key={`${w.id}c`}><td /><td style={{ paddingLeft: 28 }}>{cr}</td><td className="n" /><td className="n">{nf.format(a)}</td><td /></tr>];
        })}
          {!list.some((w) => w.net !== 0) && <tr><td colSpan={5} className="muted">Tidak ada selisih — tidak perlu jurnal penyesuaian.</td></tr>}</tbody></table></div>
      <p className="muted">Nama akun di atas generik; sesuaikan dengan kode akun di chart of account perusahaan saat diposting.</p>
    </>
  );
}
