'use client';
import { useFormState } from 'react-dom';
import ConfirmForm from '../ConfirmForm';
import { decideRequest } from '../../lib/actions';
export default function Decision({ id, info }) {
  const [st, action] = useFormState(decideRequest, {});
  const build = (fd, v) => {
    const ok = v === 'APPROVE', note = String(fd.get('note') || '').trim();
    if (!ok && !note) return null; // server menampilkan pesan "Isi alasan penolakan"
    return ok
      ? { title: `Setujui permintaan #${id}?`, intro: `${info.kind}. Perubahan langsung diterapkan ke data stok.`, confirmText: 'Setujui', rows: [{ label: info.label, from: info.before, to: info.after }] }
      : { title: `Tolak permintaan #${id}?`, intro: `Alasan penolakan: ${note}`, confirmText: 'Tolak', tone: 'danger', rows: [{ label: info.label, from: 'Menunggu approval', to: 'Ditolak, data tidak berubah' }] };
  };
  return (
    <ConfirmForm action={action} build={build}>
      <input type="hidden" name="id" value={id} />
      <input name="note" placeholder="Catatan (wajib jika menolak)" style={{ width: 210 }} aria-label="Catatan keputusan" />
      <div className="bar" style={{ margin: '6px 0 0' }}>
        <button name="decision" value="APPROVE">Setujui</button>
        <button name="decision" value="REJECT" className="danger">Tolak</button>
      </div>
      {st?.error && <div className="err" role="alert">{st.error}</div>}
    </ConfirmForm>);
}
