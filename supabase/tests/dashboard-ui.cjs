/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only authenticated HTTP checks. Uses an existing local owner account.
const assert = require('node:assert/strict');
const { createServerClient } = require('@supabase/ssr');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const base = process.env.DASHBOARD_TEST_URL || 'http://localhost:3000';
  for (const target of [url, base]) {
    assert.ok(['localhost', '127.0.0.1'].includes(new URL(target).hostname), 'REFUSING_NON_LOCAL_TARGET');
  }
  assert.ok(process.env.DASHBOARD_TEST_EMAIL && process.env.DASHBOARD_TEST_PASSWORD, 'Provide local owner test credentials through environment variables');
  let cookies = [];
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false },
    cookies: { getAll: () => cookies, setAll: values => { cookies = values; } },
  });
  const login = await client.auth.signInWithPassword({ email: process.env.DASHBOARD_TEST_EMAIL, password: process.env.DASHBOARD_TEST_PASSWORD });
  assert.ifError(login.error);
  const cookie = cookies.map(value => `${value.name}=${value.value}`).join('; ');
  const read = path => fetch(`${base}${path}`, { headers: { cookie } }).then(response => response.text());
  function metric(html, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = html.match(new RegExp('<h2[^>]*>' + escaped + '</h2><p[^>]*>([^<]*)</p>'));
    assert.ok(match, `Missing metric ${label}`);
    return match[1];
  }
  try {
    for (const query of ['period=today', 'period=week', 'period=month', 'period=custom&from=2026-01-01&to=2026-01-31']) {
      const [dashboard, reports] = await Promise.all([read(`/dashboard?${query}`), read(`/reports?${query}`)]);
      assert.ok(dashboard.includes('Ringkasan Penjualan'), 'Owner dashboard renders');
      assert.ok(!dashboard.includes('Data belum dapat dimuat'), 'Dashboard data loaded');
      for (const label of ['Penjualan Bersih', 'Jumlah Transaksi', 'Laba Kotor']) {
        const actual = metric(dashboard, label), expected = metric(reports, label);
        assert.equal(actual === 'Tidak berlaku' ? '\u2014' : actual, expected, `${query}: ${label}`);
      }
      assert.equal(metric(dashboard, 'Total Retur'), metric(reports, 'Total Retur (sebelum pajak)'));
      for (const title of ['Penjualan Bulanan', 'Produk Terlaris']) assert.ok(dashboard.includes(title));
      for (const removed of ['HPP Bersih', 'Margin Laba Kotor', 'Pajak Bersih', 'Metode Pembayaran', 'Tren Penjualan', 'Periode terpilih', 'Waktu Indonesia Barat', 'Tambah Produk']) assert.ok(!dashboard.includes(removed), removed + ' should be absent');
      assert.ok(!dashboard.includes('>Retur</a>'), 'No sidebar return link');
      assert.ok(!dashboard.includes('Sesi kasir ditutup'), 'No drawer status badge');
      assert.ok(dashboard.includes('Apotek Cipayung Farma'));
      assert.ok(dashboard.includes('Menu akun'));
      assert.ok(!dashboard.includes('Tindakan cepat'), 'Dashboard quick-action container removed');
      assert.match(dashboard, /aria-current="page"[^>]*href="\/dashboard"/, 'Beranda is active in sidebar');
      assert.ok(!dashboard.includes('>Keluar</button>'), 'Logout stays inside the collapsed profile dropdown');
      console.log(`${query}: 4 metrics match /reports; simplified dashboard and navigation render`);
    }
    const invalid = await read('/dashboard?period=custom&from=2026-02-30&to=2026-03-01');
    assert.ok(invalid.includes('Tanggal atau tahun tidak valid'));
    const empty = await read('/dashboard?period=custom&from=2089-01-01&to=2089-01-01&year=2089');
    assert.ok(empty.includes('Belum ada transaksi selesai'));
    assert.ok(!empty.includes('Data dashboard belum dapat dimuat'));
    const unauth = await fetch(`${base}/dashboard`, { redirect: 'manual' }).then(response => response.text());
    assert.ok(unauth.includes('NEXT_REDIRECT') && unauth.includes('/login'));
    console.log('Invalid range, empty state and unauthenticated redirect checks passed');
  } finally {
    await client.auth.signOut();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
