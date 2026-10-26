/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { Client } = require("pg");

// No employee fixtures or business data are changed: zero-row updates exercise
// the statement-level serialization trigger. Only its internal revision advances.
const connectionString = process.env.LOCAL_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!["127.0.0.1", "localhost"].includes(new URL(connectionString).hostname)) {
  throw new Error("REFUSING_NON_LOCAL_DATABASE");
}

(async () => {
  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  try {
    await first.connect();
    await second.connect();
    await first.query("begin");
    await first.query("update public.employees set is_active=is_active where false");
    await second.query("begin; set local lock_timeout='150ms'");
    await assert.rejects(
      second.query("update public.employees set is_active=is_active where false"),
      error => error.code === "55P03",
    );
    await second.query("rollback");
    await first.query("rollback");

    await second.query("begin isolation level repeatable read");
    await second.query("select revision from public.employee_access_guard");
    await first.query("begin");
    await first.query("update public.employees set is_active=is_active where false");
    await first.query("commit");
    await assert.rejects(
      second.query("update public.employees set is_active=is_active where false"),
      error => error.code === "40001",
    );
    console.log("PASS: concurrent access changes serialize; stale repeatable-read snapshots fail closed");
  } finally {
    await Promise.allSettled([first.query("rollback"), second.query("rollback")]);
    await Promise.allSettled([first.end(), second.end()]);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
