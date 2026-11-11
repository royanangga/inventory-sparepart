'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { logout } from '../lib/actions';
export default function UserMenu({ name, role }) {
  const [open, setOpen] = useState(false), box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false), esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const ini = (name || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  return (
    <div className="um" ref={box}>
      <button type="button" className="um-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="av" aria-hidden="true">{ini}</span>
        <span className="um-t"><b>{name}</b><small>{role}</small></span>
        <i aria-hidden="true">▾</i>
      </button>
      {open && (
        <div className="um-pop" role="menu">
          <div className="um-h"><b>{name}</b><small>{role}</small></div>
          <Link href="/akun" role="menuitem" onClick={() => setOpen(false)}>Ganti password</Link>
          <form action={logout}><button role="menuitem" className="um-out">Keluar</button></form>
        </div>)}
    </div>
  );
}
