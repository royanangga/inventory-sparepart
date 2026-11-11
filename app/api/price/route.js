import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';
import { getUser } from '../../../lib/auth';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const u = getUser();
  if (!u || u.role !== 'accounting') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json();
  if (b.done) {
    await pool.query('INSERT INTO price_imports(filename,rows_read,items_loaded,conflicts,imported_by) VALUES($1,$2,$3,$4,$5)', [b.filename, b.rowsRead, b.items, b.conflicts, u.u]);
    await pool.query("INSERT INTO currency_rates(code) SELECT DISTINCT COALESCE(currency_code,'03') FROM price_master ON CONFLICT DO NOTHING");
    return NextResponse.json({ ok: 1 });
  }
  const r = b.rows || [];
  if (!r.length || r.length > 5000) return NextResponse.json({ error: 'bad chunk' }, { status: 400 });
  await pool.query(
    `INSERT INTO price_master(item_code,price,currency_code,unit_cls,trade_code,trade_name,start_date,conflict)
     SELECT * FROM unnest($1::text[],$2::numeric[],$3::text[],$4::text[],$5::text[],$6::text[],$7::date[],$8::boolean[])
     ON CONFLICT(item_code) DO UPDATE SET price=EXCLUDED.price, currency_code=EXCLUDED.currency_code, unit_cls=EXCLUDED.unit_cls,
       trade_code=EXCLUDED.trade_code, trade_name=EXCLUDED.trade_name, start_date=EXCLUDED.start_date, conflict=EXCLUDED.conflict, imported_at=now()
     WHERE EXCLUDED.start_date >= price_master.start_date`,
    [r.map((x) => x.c), r.map((x) => x.p), r.map((x) => x.cur), r.map((x) => x.u), r.map((x) => x.t), r.map((x) => x.tn), r.map((x) => x.d), r.map((x) => x.f)]);
  return NextResponse.json({ ok: r.length });
}
