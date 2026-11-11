export default `CREATE TABLE IF NOT EXISTS warehouses (id serial PRIMARY KEY, code text UNIQUE NOT NULL, plant text NOT NULL, name text NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY, username text UNIQUE NOT NULL, name text, password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('accounting','gudang')), warehouse_id int REFERENCES warehouses(id));
-- satu baris = satu baris di sheet Excel (kode barang bisa muncul lebih dari satu kali, mis. sisi R/L atau beda mesin)
CREATE TABLE IF NOT EXISTS items (
  id serial PRIMARY KEY, warehouse_id int NOT NULL REFERENCES warehouses(id), group_name text, part_no text,
  code text, name text, spec text, machine text, division text, period text, supplier text,
  stock_sep numeric NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS items_wh ON items(warehouse_id);
CREATE INDEX IF NOT EXISTS items_code ON items(code);
CREATE TABLE IF NOT EXISTS movements (
  id serial PRIMARY KEY, item_id int NOT NULL REFERENCES items(id), date date NOT NULL,
  type text NOT NULL CHECK (type IN ('IN','OUT')), qty numeric NOT NULL CHECK (qty > 0),
  note text, created_by text, created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS mov_item ON movements(item_id, date);
CREATE TABLE IF NOT EXISTS price_master (
  item_code text PRIMARY KEY, price numeric NOT NULL, currency_code text, unit_cls text, trade_code text,
  trade_name text, start_date date NOT NULL, conflict boolean DEFAULT false, imported_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS price_imports (
  id serial PRIMARY KEY, filename text, rows_read int, items_loaded int, conflicts int, imported_by text, at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS currency_rates (code text PRIMARY KEY, rate numeric);
INSERT INTO currency_rates(code, rate) VALUES ('03', 1) ON CONFLICT DO NOTHING;
-- Kunci bulanan per gudang: ada baris = bulan itu terkunci
CREATE TABLE IF NOT EXISTS period_locks (
  warehouse_id int NOT NULL REFERENCES warehouses(id), month text NOT NULL, locked_by text, locked_at timestamptz DEFAULT now(),
  PRIMARY KEY (warehouse_id, month));
INSERT INTO period_locks(warehouse_id, month, locked_by) SELECT id, '2026-10', 'setup' FROM warehouses ON CONFLICT DO NOTHING;
-- Permintaan perubahan setelah bulan terkunci (menunggu approval Accounting)
CREATE TABLE IF NOT EXISTS change_requests (
  id serial PRIMARY KEY, warehouse_id int NOT NULL REFERENCES warehouses(id), month text NOT NULL,
  action text NOT NULL CHECK (action IN ('ADD','EDIT','DELETE')),
  movement_id int REFERENCES movements(id) ON DELETE SET NULL, item_id int REFERENCES items(id),
  type text, qty numeric, date date, note text, snapshot jsonb, reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  requested_by text, requested_at timestamptz DEFAULT now(), decided_by text, decided_at timestamptz, decision_note text);
CREATE INDEX IF NOT EXISTS cr_status ON change_requests(status);
-- Format input bulanan: satu permintaan = koreksi total Masuk/Keluar satu barang dalam satu bulan
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS new_in numeric;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS new_out numeric;
ALTER TABLE change_requests DROP CONSTRAINT IF EXISTS change_requests_action_check;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cr_action_chk') THEN
  ALTER TABLE change_requests ADD CONSTRAINT cr_action_chk CHECK (action IN ('ADD','EDIT','DELETE','SET')); END IF; END $$;
-- Riwayat kunci / buka kunci bulan
CREATE TABLE IF NOT EXISTS period_events (
  id serial PRIMARY KEY, warehouse_id int NOT NULL REFERENCES warehouses(id), month text NOT NULL,
  event text NOT NULL, by_user text, note text, at timestamptz DEFAULT now());
`;
