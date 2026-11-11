'use client';
const SIZES = [25, 50, 100, 200];
const win = (cur, n) => { const s = new Set([1, n, cur - 1, cur, cur + 1]); const a = [...s].filter((x) => x >= 1 && x <= n).sort((x, y) => x - y); return a.flatMap((x, i) => (i && x - a[i - 1] > 1 ? ['…', x] : [x])); };
export default function Pager({ page, size, total, onPage, onSize }) {
  const n = Math.max(1, Math.ceil(total / size)), a = total ? (page - 1) * size + 1 : 0, b = Math.min(page * size, total);
  return (
    <nav className="pager" aria-label="Halaman tabel">
      <span className="muted">Menampilkan {a}–{b} dari {total} baris</span>
      <span className="pg">
        <button type="button" className="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
        {win(page, n).map((x, i) => x === '…' ? <span key={i} className="muted">…</span> : <button type="button" key={x} className={x === page ? 'cur' : 'ghost'} aria-current={x === page ? 'page' : undefined} onClick={() => onPage(x)}>{x}</button>)}
        <button type="button" className="ghost" disabled={page >= n} onClick={() => onPage(page + 1)}>Berikutnya</button>
      </span>
      <label className="ps">Baris per halaman <select value={size} onChange={(e) => onSize(+e.target.value)}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></label>
    </nav>);
}
