'use client';
import ConfirmForm from '../ConfirmForm';
import { saveRate } from '../../lib/actions';
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 });
export default function RateForm({ code, rate, n }) {
  const build = (fd) => {
    const v = String(fd.get('rate') || '').trim();
    if (v === String(rate ?? '')) return null;
    return { title: `Ubah kurs kode ${code}?`, intro: `Nilai persediaan ${n} item dengan kode ini akan dihitung ulang.`, confirmText: 'Simpan kurs',
      rows: [{ label: `Kurs ${code} ke IDR`, from: rate == null ? 'belum diisi' : nf.format(rate), to: v === '' ? 'dikosongkan' : nf.format(Number(v)) }] };
  };
  return (
    <ConfirmForm action={saveRate} build={build} className="bar" style={{ margin: '8px 0 0' }}>
      <input type="hidden" name="code" value={code} /><span style={{ width: 90 }}>Kode {code}</span>
      <input name="rate" type="number" step="any" defaultValue={rate ?? ''} placeholder="kurs" aria-label={`Kurs kode ${code}`} /><span className="muted">{n} item</span><button>Simpan</button>
    </ConfirmForm>);
}
