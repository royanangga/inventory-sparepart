'use client';
import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import ConfirmForm from '../ConfirmForm';
import { changePassword } from '../../lib/actions';
export default function PasswordForm({ username }) {
  const [st, action] = useFormState(changePassword, {});
  const [n, setN] = useState(0);
  useEffect(() => { if (st?.ok) setN((x) => x + 1); }, [st]); // kosongkan isian setelah berhasil
  const build = (fd) => {
    const cur = String(fd.get('current') || ''), nw = String(fd.get('next') || ''), cf = String(fd.get('confirm') || '');
    if (!cur || nw.length < 8 || nw !== cf || nw === cur) return null; // server menampilkan pesan kesalahan
    return { title: 'Ganti password akun ini?', intro: 'Gunakan password baru saat Anda masuk berikutnya.', confirmText: 'Ganti password',
      rows: [{ label: `Password akun ${username}`, from: 'Password saat ini', to: `Password baru (${nw.length} karakter, disembunyikan)` }] };
  };
  return (
    <ConfirmForm key={n} action={action} build={build} className="card pw" aria-label="Form ganti password">
      <label>Password saat ini<input name="current" type="password" autoComplete="current-password" required /></label>
      <label>Password baru<input name="next" type="password" autoComplete="new-password" minLength={8} required /><small className="muted">Minimal 8 karakter, berbeda dari password lama.</small></label>
      <label>Ulangi password baru<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
      {st?.error && <div className="err" role="alert">{st.error}</div>}
      {st?.ok && <div className="ok" role="status">{st.ok}</div>}
      <button>Simpan password baru</button>
    </ConfirmForm>
  );
}
