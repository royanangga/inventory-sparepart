'use client';
import { useFormState } from 'react-dom';
import { login } from '../../lib/actions';
export default function Login() {
  const [st, action] = useFormState(login, {});
  return (
    <section className="login-wrap">
      <form action={action} className="card login" aria-labelledby="lt">
        <p className="brand-mark" aria-hidden="true">IS</p>
        <h1 id="lt">Masuk ke Inventory Sparepart</h1>
        <p className="muted">Gunakan akun gudang atau Accounting Anda.</p>
        <label>Username<input name="username" autoComplete="username" autoFocus required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {st?.error && <div className="err" role="alert">{st.error}</div>}
        <button style={{ width: '100%' }}>Masuk</button>
      </form>
    </section>
  );
}
