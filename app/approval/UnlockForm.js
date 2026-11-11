'use client';
import ConfirmForm from '../ConfirmForm';
import { unlockMonth } from '../../lib/actions';
export default function UnlockForm({ wh, whName, month }) {
  const build = (fd) => ({ title: `Buka kunci ${month}?`, intro: `Alasan: ${String(fd.get('reason') || '').trim()}`, confirmText: 'Buka kunci', tone: 'danger',
    rows: [{ label: `${whName} · ${month}`, from: 'Terkunci', to: 'Terbuka' }, { label: 'Permintaan yang menunggu', from: 'Menunggu approval', to: 'Otomatis ditolak' }] });
  return (
    <ConfirmForm action={unlockMonth} build={build} className="bar" style={{ margin: 0 }}>
      <input type="hidden" name="wh" value={wh} /><input type="hidden" name="month" value={month} />
      <input name="reason" placeholder="Alasan buka kunci (wajib)" required minLength={3} size={30} />
      <button>Buka kunci</button>
    </ConfirmForm>);
}
