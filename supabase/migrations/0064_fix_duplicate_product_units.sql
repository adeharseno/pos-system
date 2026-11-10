-- ==============================================================================
-- Migration 0064: Safe Product Unit Status Management (No Hard Delete / No FK Repoint)
-- ==============================================================================

BEGIN;

-- 1. Add is_active column to product_units if not exists (preserves full historical record)
ALTER TABLE public.product_units
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Nonaktifkan unit obsolete tanpa menghapus riwayat atau mengubah foreign key
-- AK MICROPORE 1 INCH (INT-00200):
-- Unit e1f0ae70-f7f6-45aa-a81b-faa20f3e5ec6 (obsolete ghost unit dari impor awal) dinonaktifkan
-- Unit 3b0bd2fb-1300-43f5-ba92-03466e3a4a93 (unit resmi kanonikal) ditetapkan aktif dengan harga Rp25.000 / Pcs
DO $$
DECLARE
  v_prod_id UUID := '55c53331-e2fe-4495-99ee-55042117e38f';
  v_canonical_unit UUID := '3b0bd2fb-1300-43f5-ba92-03466e3a4a93';
  v_obsolete_unit UUID := 'e1f0ae70-f7f6-45aa-a81b-faa20f3e5ec6';
  v_count integer;
  v_actual_prod_id uuid;
BEGIN
  -- Assertion 1: Verifikasi produk AK MICROPORE 1 INCH (INT-00200) ada
  SELECT count(*) INTO v_count FROM public.products WHERE id = v_prod_id AND sku = 'INT-00200';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Product AK MICROPORE 1 INCH (INT-00200, id=%) not found or count is %', v_prod_id, v_count;
  END IF;

  -- Assertion 2: Verifikasi unit kanonikal ada dan terelasi dengan produk ini
  SELECT product_id INTO v_actual_prod_id FROM public.product_units WHERE id = v_canonical_unit;
  IF v_actual_prod_id IS DISTINCT FROM v_prod_id THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Canonical unit % not found or does not belong to product %', v_canonical_unit, v_prod_id;
  END IF;

  -- Assertion 3: Verifikasi ghost unit usang ada dan terelasi dengan produk ini
  SELECT product_id INTO v_actual_prod_id FROM public.product_units WHERE id = v_obsolete_unit;
  IF v_actual_prod_id IS DISTINCT FROM v_prod_id THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Obsolete ghost unit % not found or does not belong to product %', v_obsolete_unit, v_prod_id;
  END IF;

  -- Tandai unit usang sebagai tidak aktif (riwayat transaksi dan purchasing tetap 100% utuh)
  UPDATE public.product_units
  SET is_active = false,
      is_base_unit = false,
      updated_at = now()
  WHERE id = v_obsolete_unit;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected 1 obsolete unit updated, got %', v_count;
  END IF;

  -- Pastikan unit kanonikal aktif dan memiliki harga jual resmi Rp25.000 / Pcs
  UPDATE public.product_units
  SET unit_name = 'Pcs',
      selling_price = 25000.00,
      is_base_unit = true,
      is_active = true,
      updated_at = now()
  WHERE id = v_canonical_unit;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected 1 canonical unit updated, got %', v_count;
  END IF;
END $$;

-- 3. Nonaktifkan unit sekunder duplikat untuk produk lain jika ada lebih dari 1 unit aktif
DO $$
DECLARE
  r RECORD;
  v_canonical_id UUID;
  v_obs_id UUID;
  v_remaining_multi integer;
BEGIN
  FOR r IN (
    SELECT product_id
    FROM public.product_units
    WHERE is_active = true
    GROUP BY product_id
    HAVING count(*) > 1
  ) LOOP
    -- Tentukan unit kanonikal: prioritas base unit, lalu nama tidak kosong, lalu created_at terawal
    SELECT id INTO v_canonical_id
    FROM public.product_units
    WHERE product_id = r.product_id AND is_active = true
    ORDER BY (is_base_unit = true) DESC, (unit_name <> '') DESC, created_at ASC
    LIMIT 1;

    -- Nonaktifkan unit sekunder (tanpa repoint FK, tanpa DELETE)
    FOR v_obs_id IN (
      SELECT id FROM public.product_units
      WHERE product_id = r.product_id AND id <> v_canonical_id AND is_active = true
    ) LOOP
      UPDATE public.product_units
      SET is_active = false,
          is_base_unit = false,
          updated_at = now()
      WHERE id = v_obs_id;
    END LOOP;
  END LOOP;

  -- Assertion 4: Verifikasi tidak ada lagi produk yang memiliki >1 unit aktif
  SELECT count(*) INTO v_remaining_multi
  FROM (
    SELECT product_id
    FROM public.product_units
    WHERE is_active = true
    GROUP BY product_id
    HAVING count(*) > 1
  ) sub;

  IF v_remaining_multi > 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Still found % products with multiple active units after migration 0064', v_remaining_multi;
  END IF;
END $$;

-- 4. Hardening RPC: confirm_initial_product_unit
-- Deterministik: hanya mengupdate unit tunggal yang kosong, menolak kondisi ambigu
CREATE OR REPLACE FUNCTION public.confirm_initial_product_unit(
  p_employee_id uuid, p_product_id uuid, p_unit_name text,
  p_selling_price numeric, p_expected_stock integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE 
  v_product public.products%rowtype; 
  v_actual bigint; 
  v_unit_id uuid;
  v_unit_count integer;
  v_existing_name text;
  v_clean_unit text := btrim(coalesce(p_unit_name, ''));
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=p_employee_id AND is_active AND position='owner_admin')
    THEN RAISE EXCEPTION 'INVALID_EMPLOYEE'; END IF;
  IF v_clean_unit = '' OR p_selling_price IS NULL OR p_selling_price < 0
     OR p_expected_stock IS NULL OR p_expected_stock < 0 THEN RAISE EXCEPTION 'INVALID_UNIT_CONFIRMATION'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_product_id::text, 240047));
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF v_product.unit_confirmed THEN RAISE EXCEPTION 'UNIT_ALREADY_CONFIRMED'; END IF;
  SELECT coalesce(sum(quantity), 0) INTO v_actual FROM public.product_batches WHERE product_id=p_product_id;
  IF v_actual <> p_expected_stock THEN RAISE EXCEPTION 'STOCK_CONFIRMATION_MISMATCH'; END IF;

  -- Pemeriksaan deterministik jumlah unit aktif
  SELECT count(*) INTO v_unit_count
  FROM public.product_units
  WHERE product_id = p_product_id AND is_active = true;

  IF v_unit_count = 1 THEN
    SELECT id, unit_name INTO v_unit_id, v_existing_name
    FROM public.product_units
    WHERE product_id = p_product_id AND is_active = true;

    -- Update jika nama kosong atau nama sama (idempotent deterministik)
    IF v_existing_name = '' OR v_existing_name IS NULL OR lower(btrim(v_existing_name)) = lower(v_clean_unit) THEN
      UPDATE public.product_units
      SET unit_name = v_clean_unit,
          conversion_to_base = 1,
          selling_price = p_selling_price,
          is_base_unit = true,
          is_active = true,
          updated_at = now()
      WHERE id = v_unit_id;
    ELSE
      -- Jika sudah memiliki nama yang berbeda, tolak agar tidak menimpa unit yang salah
      RAISE EXCEPTION 'AMBIGUOUS_UNIT_CONFIRMATION: existing unit % differs from %', v_existing_name, v_clean_unit;
    END IF;
  ELSIF v_unit_count = 0 THEN
    -- Belum ada unit sama sekali, buat baru
    INSERT INTO public.product_units(product_id, unit_name, conversion_to_base, selling_price, is_base_unit, is_active)
    VALUES(p_product_id, v_clean_unit, 1, p_selling_price, true, true)
    RETURNING id INTO v_unit_id;
  ELSE
    -- Lebih dari 1 unit aktif: kondisi ambigu, tolak operasi konfirmasi otomatis
    RAISE EXCEPTION 'AMBIGUOUS_UNIT_CONFIRMATION: product has % active units', v_unit_count;
  END IF;

  UPDATE public.products 
  SET base_unit = v_clean_unit, unit_confirmed = true, updated_at = now() 
  WHERE id = p_product_id;

  RETURN jsonb_build_object('product_id', p_product_id, 'product_unit_id', v_unit_id, 'stock_confirmed', v_actual);
END; $$;

REVOKE ALL ON FUNCTION public.confirm_initial_product_unit(uuid,uuid,text,numeric,integer) FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirm_initial_product_unit(uuid,uuid,text,numeric,integer) TO service_role;

-- 5. Constraint unik case-insensitive hanya untuk unit aktif
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_units_active_name
ON public.product_units(product_id, lower(btrim(unit_name)))
WHERE is_active = true AND unit_name <> '';

COMMIT;
