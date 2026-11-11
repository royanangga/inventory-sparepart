'use client';
import { useEffect, useRef } from 'react';
export default function ConfirmDialog({ open, title, intro, rows = [], tone = 'primary', confirmText = 'Ya, lanjutkan', onConfirm, onCancel }) {
  const ok = useRef(null), cancel = useRef(onCancel); cancel.current = onCancel;
  useEffect(() => {
    if (!open) return;
    ok.current?.focus();
    const k = (e) => e.key === 'Escape' && cancel.current();
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="ov" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
        <h2 id="dlg-t">{title}</h2>
        {intro && <p className="muted">{intro}</p>}
        {rows.length > 0 && (
          <div className="chg" role="table" aria-label="Rincian perubahan">
            <div className="chg-h" role="row"><span>Data</span><span>Semula</span><span /><span>Menjadi</span></div>
            {rows.map((r, i) => (
              <div key={i} className="chg-r" role="row">
                <span className="chg-l">{r.label}</span><span className="chg-f">{r.from ?? '—'}</span><i aria-hidden="true">›</i><span className="chg-t">{r.to ?? '—'}</span>
              </div>))}
          </div>)}
        <div className="dlg-a">
          <button type="button" className="ghost" onClick={onCancel}>Batal</button>
          <button type="button" ref={ok} className={tone === 'danger' ? 'danger' : ''} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
