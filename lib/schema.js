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
`;
