// Row-Level Security tests. Connects to a Supabase (dev) database, builds two
// throwaway tenants inside ONE transaction, impersonates each user the way
// PostgREST does (role + JWT claims), asserts what they can and cannot touch,
// and ALWAYS rolls back. Never run against production data.
//
//   SUPABASE_DB_URL=postgresql://... npm run test:db
import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let passed = 0;
const failures = [];

async function as(userId, fn) {
  if (userId) {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
  } else {
    await client.query("set local role anon");
    await client.query("select set_config('request.jwt.claims', '', true)");
  }
  try {
    return await fn();
  } finally {
    await client.query("reset role");
  }
}

async function test(name, fn) {
  await client.query("savepoint t");
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
  await client.query("rollback to savepoint t");
}

const eq = (a, b, msg) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg ?? "expected"}: got ${x}, wanted ${y}`);
};

// A statement counts as denied if RLS raises 42501 or silently affects 0 rows.
async function denied(sql, params = []) {
  await client.query("savepoint d");
  try {
    const r = await client.query(sql, params);
    if (r.rowCount > 0) throw new Error(`was allowed (${r.rowCount} row(s)): ${sql.slice(0, 70)}`);
  } catch (e) {
    if (e.code !== "42501") {
      await client.query("rollback to savepoint d");
      throw e;
    }
  }
  await client.query("rollback to savepoint d");
}

const names = async (uid, table, col = "name") =>
  (await as(uid, () => client.query(`select ${col} from ${table} order by ${col}`))).rows.map((r) => r[col]);

await client.connect();
await client.query("begin");
try {
  const tag = randomBytes(3).toString("hex");
  const [uA, uB] = [randomUUID(), randomUUID()];
  const [oA, oB] = [randomUUID(), randomUUID()];
  const [pA, pB] = [randomUUID(), randomUUID()];
  const nameA = `T-A-${tag}`, nameB = `T-B-${tag}`;

  for (const [u, e] of [[uA, `a-${tag}@test.local`], [uB, `b-${tag}@test.local`]]) {
    await client.query(
      "insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)",
      [u, e],
    );
  }
  await client.query("insert into organizations (id, name) values ($1,$2),($3,$4)", [oA, nameA, oB, nameB]);
  await client.query("insert into memberships (user_id, org_id, role) values ($1,$2,'owner'),($3,$4,'owner')", [uA, oA, uB, oB]);

  // A third and fourth user in org A, for role testing: uC is an editor, uD a viewer.
  // uE has no membership at all yet - the one who accepts a fresh invite below.
  const [uC, uD, uE] = [randomUUID(), randomUUID(), randomUUID()];
  const emailE = `e-${tag}@test.local`;
  for (const [u, e] of [[uC, `c-${tag}@test.local`], [uD, `d-${tag}@test.local`], [uE, emailE]]) {
    await client.query(
      "insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)",
      [u, e],
    );
  }
  await client.query("insert into memberships (user_id, org_id, role) values ($1,$2,'editor'),($3,$2,'viewer')", [uC, oA, uD]);
  for (const [p, o, n] of [[pA, oA, `plant-a-${tag}`], [pB, oB, `plant-b-${tag}`]]) {
    await client.query(
      "insert into plants (id, org_id, name, api_key_hash) values ($1,$2,$3,$4)",
      [p, o, n, randomBytes(32).toString("hex")],
    );
    await client.query("insert into readings (plant_id, soil_pct) values ($1, 42)", [p]);
  }
  await client.query("insert into irrigation_config (plant_id) values ($1)", [pB]);

  const demo = (await client.query("select id from organizations where is_demo limit 1")).rows[0];

  console.log("\nStructure");
  await test("every table in public has row level security enabled", async () => {
    const r = await client.query(
      "select tablename from pg_tables where schemaname='public' and not rowsecurity",
    );
    eq(r.rows.map((x) => x.tablename), [], "tables without RLS");
  });

  console.log("\nRead isolation");
  await test("user A sees only their org and the demo org", async () => {
    const seen = (await names(uA, "organizations")).filter((n) => n.startsWith("T-") || n === "Campo Verde");
    eq(seen, ["Campo Verde", nameA].sort());
  });
  await test("user B sees only their org and the demo org", async () => {
    const seen = (await names(uB, "organizations")).filter((n) => n.startsWith("T-") || n === "Campo Verde");
    eq(seen, ["Campo Verde", nameB].sort());
  });
  await test("user A cannot see B's plants", async () => {
    eq((await names(uA, "plants")).filter((n) => n.startsWith("plant-")), [`plant-a-${tag}`]);
  });
  await test("user A cannot see B's readings", async () => {
    const r = await as(uA, () => client.query("select 1 from readings where plant_id = $1", [pB]));
    eq(r.rowCount, 0);
  });
  await test("user A cannot see B's irrigation config", async () => {
    const r = await as(uA, () => client.query("select 1 from irrigation_config where plant_id = $1", [pB]));
    eq(r.rowCount, 0);
  });
  await test("user A cannot see B's memberships", async () => {
    const r = await as(uA, () => client.query("select 1 from memberships where user_id = $1", [uB]));
    eq(r.rowCount, 0);
  });
  await test("plant_ingest_status view respects tenant isolation", async () => {
    const r = await as(uA, () => client.query("select name from plant_ingest_status where org_id = $1", [oB]));
    eq(r.rowCount, 0);
  });

  console.log("\nAnonymous access");
  await test("anon can read the demo org and its plants", async () => {
    const o = await as(null, () => client.query("select 1 from organizations where id = $1", [demo.id]));
    eq(o.rowCount, 1);
  });
  await test("anon cannot see real orgs, plants or readings", async () => {
    const o = await as(null, () => client.query("select 1 from organizations where id in ($1,$2)", [oA, oB]));
    const p = await as(null, () => client.query("select 1 from plants where id in ($1,$2)", [pA, pB]));
    const r = await as(null, () => client.query("select 1 from readings where plant_id in ($1,$2)", [pA, pB]));
    eq([o.rowCount, p.rowCount, r.rowCount], [0, 0, 0]);
  });

  console.log("\nWrite isolation");
  await test("A cannot add a plant to B's org", async () => {
    await as(uA, () => denied(
      "insert into plants (org_id, name, api_key_hash) values ($1,'x',$2)", [oB, randomBytes(8).toString("hex")],
    ));
  });
  await test("A cannot edit B's plant", async () => {
    await as(uA, () => denied("update plants set name = 'pwned' where id = $1", [pB]));
  });
  await test("A cannot write irrigation config for B's plant", async () => {
    await as(uA, () => denied("update irrigation_config set enabled = false where plant_id = $1", [pB]));
    await as(uA, () => denied("insert into irrigation_config (plant_id) values ($1)", [pB]));
  });
  await test("A cannot make themselves a member of B's org", async () => {
    await as(uA, () => denied("insert into memberships (user_id, org_id) values ($1,$2)", [uA, oB]));
  });
  await test("A cannot join the demo org", async () => {
    await as(uA, () => denied("insert into memberships (user_id, org_id) values ($1,$2)", [uA, demo.id]));
  });
  await test("A cannot add someone else as a member", async () => {
    await as(uA, () => denied("insert into memberships (user_id, org_id) values ($1,$2)", [uB, oA]));
  });
  await test("nobody can insert readings from the client, not even into their own plant", async () => {
    await as(uA, () => denied("insert into readings (plant_id, soil_pct) values ($1, 1)", [pA]));
  });
  await test("signed-in users cannot modify the demo org's data", async () => {
    const dp = (await client.query("select id from plants where org_id = $1 limit 1", [demo.id])).rows[0];
    await as(uA, () => denied("update plants set name = 'pwned' where id = $1", [dp.id]));
    await as(uA, () => denied("insert into irrigation_config (plant_id) values ($1)", [dp.id]));
    await as(null, () => denied("update plants set name = 'pwned' where id = $1", [dp.id]));
  });

  console.log("\nCavitation captures");
  const cap = async (plant, key) => (await client.query(
    `insert into cavitation_captures (plant_id, capture_key, ts, cls, t0_us, t1_us, y)
     values ($1,$2,now(),'burst',-100,100,'{1,2,3}') returning id`, [plant, key])).rows[0].id;
  const capA = await cap(pA, "20260921_120000_000_ch1_00001");
  const capB = await cap(pB, "20260921_120000_000_ch1_00001");
  await test("A sees own captures and none of B's", async () => {
    const r = await as(uA, () => client.query("select plant_id from cavitation_captures where id in ($1,$2)", [capA, capB]));
    eq(r.rows.map((x) => x.plant_id), [pA]);
  });
  await test("anon cannot see captures", async () => {
    const r = await as(null, () => client.query("select 1 from cavitation_captures where id in ($1,$2)", [capA, capB]));
    eq(r.rowCount, 0);
  });
  await test("cavitation_summary respects tenant isolation", async () => {
    const r = await as(uA, () => client.query("select plant_id from cavitation_summary where plant_id in ($1,$2)", [pA, pB]));
    eq(r.rows.map((x) => x.plant_id), [pA]);
  });
  await test("A can flag and annotate own capture", async () => {
    const r = await as(uA, () => client.query(
      "update cavitation_captures set flagged = true, flag_note = 'real', flagged_at = now() where id = $1", [capA]));
    eq(r.rowCount, 1);
  });
  await test("A cannot flag B's capture", async () => {
    await as(uA, () => denied("update cavitation_captures set flagged = true where id = $1", [capB]));
  });
  await test("A cannot edit trace or metrics, even on own capture", async () => {
    await as(uA, () => denied("update cavitation_captures set y = '{9}' where id = $1", [capA]));
    await as(uA, () => denied("update cavitation_captures set cls = 'weak' where id = $1", [capA]));
  });
  await test("nobody can insert or delete captures from the client", async () => {
    await as(uA, () => denied(
      `insert into cavitation_captures (plant_id, capture_key, ts, cls, t0_us, t1_us, y)
       values ($1,'20260921_130000_000_ch1_00002',now(),'burst',-1,1,'{1,2}')`, [pA]));
    await as(uA, () => denied("delete from cavitation_captures where id = $1", [capA]));
  });
  await test("A can read own full waveform files and not B's", async () => {
    for (const p of [pA, pB]) {
      await client.query(
        "insert into storage.objects (bucket_id, name) values ('cavitation-full', $1)", [`${p}/20260921_120000_000_ch1_00001.bin.gz`]);
    }
    const r = await as(uA, () => client.query("select name from storage.objects where bucket_id = 'cavitation-full'"));
    eq(r.rows.map((x) => x.name.split("/")[0]).filter((x) => x === pA || x === pB), [pA]);
  });
  await test("anon cannot read full waveform files, and nobody can write them from the client", async () => {
    await client.query("insert into storage.objects (bucket_id, name) values ('cavitation-full', $1)", [`${pA}/x.bin.gz`]);
    const r = await as(null, () => client.query("select 1 from storage.objects where bucket_id = 'cavitation-full'"));
    eq(r.rowCount, 0);
    await as(uA, () => denied("insert into storage.objects (bucket_id, name) values ('cavitation-full', $1)", [`${pA}/y.bin.gz`]));
    await as(uA, () => denied("delete from storage.objects where bucket_id = 'cavitation-full' and name = $1", [`${pA}/x.bin.gz`]));
  });
  await test("flag note is limited to 300 characters", async () => {
    await client.query("savepoint n");
    let failed = false;
    try {
      await as(uA, () => client.query("update cavitation_captures set flag_note = $2 where id = $1", [capA, "x".repeat(301)]));
    } catch { failed = true; }
    await client.query("rollback to savepoint n");
    eq(failed, true);
  });

  console.log("\nPositive controls");
  await test("A can save irrigation config for their own plant", async () => {
    const r = await as(uA, () => client.query(
      "insert into irrigation_config (plant_id, hour1) values ($1, 6) returning plant_id", [pA]));
    eq(r.rowCount, 1);
  });
  await test("a new user can create an org and become its member", async () => {
    const o = randomUUID();
    await as(uA, () => client.query("insert into organizations (id, name) values ($1,'fresh')", [o]));
    await as(uA, () => client.query("insert into memberships (user_id, org_id) values ($1,$2)", [uA, o]));
    const r = await as(uA, () => client.query("select 1 from organizations where id = $1", [o]));
    eq(r.rowCount, 1);
  });

  console.log("\nRoles and sharing");
  await test("editor can write irrigation config and flag captures, viewer cannot", async () => {
    const r1 = await as(uC, () => client.query(
      "update irrigation_config set hour1 = 7 where plant_id = $1", [pA]));
    eq(r1.rowCount, 1);
    const r2 = await as(uC, () => client.query(
      "update cavitation_captures set flagged = true where id = $1", [capA]));
    eq(r2.rowCount, 1);
    await as(uD, () => denied("update irrigation_config set hour1 = 9 where plant_id = $1", [pA]));
    await as(uD, () => denied("update cavitation_captures set flagged = false where id = $1", [capA]));
  });
  await test("viewer cannot add a plant either (tightened alongside editor)", async () => {
    await as(uD, () => denied(
      "insert into plants (org_id, name, api_key_hash) values ($1,'x',$2)", [oA, randomBytes(8).toString("hex")],
    ));
  });
  await test("memberships.role rejects anything outside owner/editor/viewer", async () => {
    await client.query("savepoint r");
    let failed = false;
    try {
      await client.query("update memberships set role = 'superadmin' where user_id = $1 and org_id = $2", [uC, oA]);
    } catch { failed = true; }
    await client.query("rollback to savepoint r");
    eq(failed, true);
  });

  await test("only the owner can see or create invitations for their org", async () => {
    await as(uC, () => denied(
      "insert into org_invitations (org_id, email, role, invited_by) values ($1,'x@test.local','editor',$2)", [oA, uC],
    ));
    const r = await as(uC, () => client.query("select 1 from org_invitations where org_id = $1", [oA]));
    eq(r.rowCount, 0);
  });
  await test("owner can invite, and the invitee accepts and becomes a real member", async () => {
    const inv = await as(uA, () => client.query(
      "insert into org_invitations (org_id, email, role, invited_by) values ($1,$2,'editor',$3) returning token",
      [oA, emailE, uA],
    ));
    const token = inv.rows[0].token;

    // Someone else's email can't accept it.
    await client.query("savepoint mismatch");
    let mismatched = false;
    try {
      await as(uD, () => client.query("select accept_org_invitation($1)", [token]));
    } catch (e) { mismatched = e.message.includes("invite_email_mismatch"); }
    await client.query("rollback to savepoint mismatch");
    eq(mismatched, true, "wrong-email accept should raise invite_email_mismatch");

    // The actual invitee accepts.
    await as(uE, () => client.query("select accept_org_invitation($1)", [token]));
    const role = await as(uE, () => client.query(
      "select role from memberships where user_id = $1 and org_id = $2", [uE, oA]));
    eq(role.rows[0]?.role, "editor");

    // Now shows up for anyone in the org, editor access included.
    const listed = await as(uC, () => client.query(
      "select 1 from list_org_members($1) where user_id = $2", [oA, uE]));
    eq(listed.rowCount, 1);
    const write = await as(uE, () => client.query(
      "update irrigation_config set hour1 = 6 where plant_id = $1", [pA]));
    eq(write.rowCount, 1);

    // A second accept of an already-accepted invite is rejected, not silently re-run.
    await client.query("savepoint reaccept");
    let reaccepted = false;
    try {
      await as(uE, () => client.query("select accept_org_invitation($1)", [token]));
    } catch (e) { reaccepted = e.message.includes("invite_not_pending"); }
    await client.query("rollback to savepoint reaccept");
    eq(reaccepted, true, "accepting a used invite should raise invite_not_pending");
  });
  await test("owner can change a member's role and remove one; nobody else can", async () => {
    await as(uC, () => denied("update memberships set role = 'viewer' where user_id = $1 and org_id = $2", [uD, oA]));
    await as(uC, () => denied("delete from memberships where user_id = $1 and org_id = $2", [uD, oA]));
    const upd = await as(uA, () => client.query(
      "update memberships set role = 'viewer' where user_id = $1 and org_id = $2 returning role", [uC, oA]));
    eq(upd.rows[0]?.role, "viewer");
    const del = await as(uA, () => client.query(
      "delete from memberships where user_id = $1 and org_id = $2", [uD, oA]));
    eq(del.rowCount, 1);
  });
  await test("nobody can delete or demote the owner, including the owner themself", async () => {
    await as(uA, () => denied("update memberships set role = 'editor' where user_id = $1 and org_id = $2", [uA, oA]));
    await as(uA, () => denied("delete from memberships where user_id = $1 and org_id = $2", [uA, oA]));
  });
} finally {
  await client.query("rollback");
  await client.end();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("Failed:\n - " + failures.join("\n - "));
  process.exit(1);
}
