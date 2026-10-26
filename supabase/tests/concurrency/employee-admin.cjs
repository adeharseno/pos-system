/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const connectionString = process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!['127.0.0.1','localhost'].includes(new URL(connectionString).hostname)) throw new Error('REFUSING_NON_LOCAL_DATABASE');
const employeeIds = [randomUUID(),randomUUID(),randomUUID(),randomUUID()];
const authIds = [randomUUID(),randomUUID()];
const requestId = randomUUID();
async function connection() {
  const c = new Client({connectionString}); await c.connect();
  await c.query("set lock_timeout='5s'; set statement_timeout='10s'"); return c;
}
async function race(queries) {
  const clients = await Promise.all(queries.map(connection));
  try { return await Promise.allSettled(queries.map((q,i)=>clients[i].query(q.text,q.values))); }
  finally { await Promise.all(clients.map(c=>c.end())); }
}
(async()=>{
  const c=await connection();
  try {
    await c.query('begin');
    for(let i=0;i<4;i++) await c.query('insert into public.employees(id,full_name,position) values($1,$2,$3)',[employeeIds[i],'Concurrency fixture',i<2?'owner_admin':'staf']);
    for(let i=0;i<2;i++) {
      await c.query('insert into auth.users(id,email) values($1,$2)',[authIds[i],`${authIds[i]}@example.test`]);
      await c.query('insert into public.user_profiles(id,employee_id,display_name) values($1,$2,$3)',[authIds[i],employeeIds[i],'Concurrency fixture']);
    }
    await c.query('commit');
    const create={text:"select public.employee_admin_write($1,'create',null,$2,'concurrency test') as id",values:[authIds[0],{request_id:requestId,full_name:'Idempotent fixture'}]};
    const creations=await race([create,create]);
    assert.ok(creations.every(r=>r.status==='fulfilled'));
    assert.equal(creations[0].value.rows[0].id,creations[1].value.rows[0].id);
    const email=`${randomUUID()}@example.test`;
    const invite=id=>({text:"select public.employee_invitation_command($1,'claim',$2,$3)",values:[authIds[0],id,email]});
    const invitations=await race([invite(employeeIds[2]),invite(employeeIds[2])]);
    assert.equal(invitations.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(invitations.find(r=>r.status==='rejected').reason.message,'INVITATION_BUSY');
    await assert.rejects(c.query(invite(employeeIds[3]).text,invite(employeeIds[3]).values),/EMAIL_CONFLICT/);
    // Two Owners attempt to disable each other. The loser must revalidate its actor.
    const disable=(actor,target)=>({text:"select public.employee_admin_write($1,'access',$2,'{\"is_active\":false}','concurrency test')",values:[actor,target]});
    const changes=await race([disable(authIds[0],employeeIds[1]),disable(authIds[1],employeeIds[0])]);
    assert.equal(changes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(changes.find(r=>r.status==='rejected').reason.message,'FORBIDDEN');
    console.log('PASS: duplicate creates, concurrent invitations, email reservations, and actor revalidation');
  } finally {
    await c.query('rollback');
    await c.query('begin');
    const created=await c.query('select id from public.employees where creation_request_id=$1',[requestId]);
    const ids=[...employeeIds,...created.rows.map(r=>r.id)];
    await c.query('delete from public.security_audit_events where target_id=any($1::text[]) or actor_employee_id=any($2::uuid[])',[ids,employeeIds]);
    await c.query('delete from public.employee_invitations where employee_id=any($1::uuid[])',[ids]);
    await c.query('delete from public.user_profiles where id=any($1::uuid[])',[authIds]);
    await c.query('delete from public.employees where id=any($1::uuid[])',[ids]);
    await c.query('delete from auth.users where id=any($1::uuid[])',[authIds]);
    await c.query('commit');
    await c.end();
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
