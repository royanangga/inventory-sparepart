'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const P = {
  '/dashboard': <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>,
  '/': <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  '/mutasi': <><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></>,
  '/approval': <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  '/rekon': <><path d="M12 3v18M5 7h14M5 7l-2 6a3 3 0 0 0 4 0L5 7Zm14 0-2 6a3 3 0 0 0 4 0l-2-6ZM8 21h8" /></>,
  '/price': <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.3" /></>,
};

export default function Nav({ items }) {
  const p = usePathname();
  return (
    <nav aria-label="Menu utama">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={p === i.href ? 'on' : ''} data-tip={i.label} aria-current={p === i.href ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{P[i.href]}</svg>
          <span className="sr">{i.label}</span>
          {i.badge > 0 && <span className="pill" aria-label={`${i.badge} menunggu`}>{i.badge}</span>}
        </Link>))}
    </nav>
  );
}
