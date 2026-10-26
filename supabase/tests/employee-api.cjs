/* eslint-disable @typescript-eslint/no-require-imports */
// Local integration only. Auth emails go exclusively to Docker Mailpit using .test recipients.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const appUrl = process.env.LOCAL_APP_URL || 'http://127.0.0.1:3101';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
for (const url of [appUrl,supabaseUrl]) if (!['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw new Error('REFUSING_NON_LOCAL_SERVICE');
const smtpEnv = JSON.parse(execFileSync('docker',['inspect','supabase_auth_pos-system'],{encoding:'utf8'}))[0].Config.Env;
assert.ok(smtpEnv.some(v=>/^GOTRUE_SMTP_HOST=supabase_inbucket/.test(v)),'test requires local Mailpit SMTP');
const admin = createClient(supabaseUrl,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const c = new Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});
const employeeIds=[],authIds=[];
const password='Fixture-Only-Password-123!';
async function fixture(role) {
  const id=randomUUID(), email=`${id}@example.test`;
  const user=await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert.ifError(user.error); authIds.push(user.data.user.id); employeeIds.push(id);
  await c.query('insert into public.employees(id,full_name,position) values($1,$2,$3)',[id,'API fixture',role]);
  await c.query('insert into public.user_profiles(id,employee_id,display_name) values($1,$2,$3)',[user.data.user.id,id,'API fixture']);
  const cookies=new Map();
  const client=createServerClient(supabaseUrl,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(row=>cookies.set(row.name,row.value))}});
  const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);
  return {id,cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')};
}
async function request(path,method='GET',body,cookie='',extraHeaders={}) {
  const res=await fetch(appUrl+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...extraHeaders},body:body?JSON.stringify(body):undefined,redirect:'manual'});
  const value=await res.json();return {res,value};
}
(async()=>{
  await c.connect();
  try {
    const owner=await fixture('owner_admin'), staff=await fixture('staf');
    assert.equal((await request('/api/employees')).res.status,401);
    assert.equal((await request('/api/employees','GET',undefined,staff.cookie)).res.status,403);
    assert.equal((await request('/api/employees','POST',{},staff.cookie)).res.status,403);
    assert.equal((await request('/api/employees','POST',{},owner.cookie,{Origin:'https://evil.example.test'})).res.status,403);
    const employeePage=await fetch(appUrl+'/employees',{headers:{Cookie:owner.cookie},redirect:'manual'});
    assert.equal(employeePage.status,200);
    assert.match(await employeePage.text(),/Karyawan/);
    const staffPage=await fetch(appUrl+'/employees',{headers:{Cookie:staff.cookie},redirect:'manual'});
    if (staffPage.status === 307) assert.match(staffPage.headers.get('location'),/dashboard/);
    else {
      // App Router may stream a redirect after the protected loading boundary.
      assert.equal(staffPage.status,200);
      assert.match(await staffPage.text(),/NEXT_REDIRECT;replace;\/dashboard;307|content="0;url=\/dashboard"/);
    }
    const invalidLink=await fetch(appUrl+'/auth/invite?token_hash=invalid-fixture-link',{redirect:'manual'});
    assert.equal(invalidLink.status,303);
    assert.match(invalidLink.headers.get('location'),/\/auth\/activate\?status=invalid$/);
    assert.ok(!invalidLink.headers.get('location').includes('token_hash'));
    const invalidPage=await fetch(appUrl+'/auth/activate?status=ready');
    assert.match(await invalidPage.text(),/Undangan Tidak Berlaku/,'query parameter cannot bypass missing setup session');
    const payload={request_id:randomUUID(),full_name:'Provisioning fixture',position:'kasir',reason:'API test'};
    const created=await request('/api/employees','POST',payload,owner.cookie);
    assert.equal(created.res.status,201,JSON.stringify(created.value));
    assert.match(created.res.headers.get('Cache-Control'),/no-store/);
    const id=created.value.data.employee_id;employeeIds.push(id);
    assert.equal((await request('/api/employees','POST',payload,owner.cookie)).value.data.employee_id,id);
    assert.equal((await request(`/api/employees/${id}`,'PATCH',{full_name:'Updated fixture',reason:'edit'},owner.cookie)).res.status,200);
    assert.equal((await request(`/api/employees/${id}`,'PATCH',{position:'owner_admin',reason:'forged'},owner.cookie)).res.status,400);
    assert.equal((await request(`/api/employees/${id}/permissions`,'PATCH',{permission:'permissions.manage',effect:'allow',reason:'test'},owner.cookie)).res.status,403);
    assert.equal((await request(`/api/employees/${id}/permissions`,'PATCH',{permission:'products.view',effect:'deny',reason:'test'},owner.cookie)).res.status,200);
    const email=`${id}@example.test`;
    const invited=await request(`/api/employees/${id}/invite`,'POST',{email},owner.cookie);
    assert.equal(invited.res.status,200,JSON.stringify(invited.value));
    const account=(await c.query('select auth_user_id from public.employee_invitations where employee_id=$1',[id])).rows[0].auth_user_id;authIds.push(account);
    const detail=await request(`/api/employees/${id}`,'GET',undefined,owner.cookie);
    assert.equal(detail.value.data.account_status,'invited');
    assert.ok(!JSON.stringify(detail.value).match(/encrypted_password|access_token|refresh_token|cost_price|margin/));
    // Generate a local test token without sending another email. Never print tokens.
    const link=await admin.auth.admin.generateLink({type:'invite',email});assert.ifError(link.error);
    const accepted=await request('/api/auth/invitations/accept','POST',{token_hash:link.data.properties.hashed_token});
    assert.equal(accepted.res.status,200,JSON.stringify(accepted.value));
    let setupCookie=accepted.res.headers.getSetCookie().map(row=>row.split(';')[0]).join('; ');
    assert.ok(setupCookie);
    const recoveryLink=await admin.auth.admin.generateLink({type:'recovery',email});assert.ifError(recoveryLink.error);
    const callback=await fetch(appUrl+'/auth/invite?type=recovery&token_hash='+encodeURIComponent(recoveryLink.data.properties.hashed_token),{redirect:'manual'});
    assert.equal(callback.status,303);
    assert.match(callback.headers.get('location'),/\/auth\/activate\?status=ready$/);
    assert.ok(!callback.headers.get('location').includes('token_hash'));
    setupCookie=callback.headers.getSetCookie().map(row=>row.split(';')[0]).join('; ');
    const activationPage=await fetch(appUrl+'/auth/activate?status=ready',{headers:{Cookie:setupCookie}});
    const activationHtml=await activationPage.text();
    assert.match(activationHtml,/Aktivasi Akun Karyawan/);
    assert.match(activationHtml,/Kata sandi baru/);
    assert.ok(!activationHtml.includes(recoveryLink.data.properties.hashed_token));
    assert.equal((await request('/api/products?q=test','GET',undefined,setupCookie)).res.status,403,'unaccepted setup session cannot access POS');
    const setup=await request('/api/auth/invitations/password','POST',{password},setupCookie);
    assert.equal(setup.res.status,200,JSON.stringify(setup.value));
    assert.equal((await request(`/api/employees/${id}`,'GET',undefined,owner.cookie)).value.data.account_status,'active');
    assert.equal((await request('/api/products?q=test','GET',undefined,setupCookie)).res.status,200,'legacy cashier behavior preserved');
    assert.equal((await request(`/api/employees/${id}/access`,'PATCH',{is_active:false,reason:'disable test'},owner.cookie)).res.status,200);
    assert.equal((await request('/api/products?q=test','GET',undefined,setupCookie)).res.status,403,'disabled existing session denied');
    console.log('PASS: employee page authorization, clean invitation redirects, activation UI, CRUD, overrides, local Auth setup, and session revocation');
  } finally {
    await c.query('begin');
    // Recover fixture UUIDs even if external creation succeeded but delivery failed.
    const pendingUsers=await c.query('select auth_user_id from public.employee_invitations where employee_id=any($1::uuid[])',[employeeIds]);
    authIds.push(...pendingUsers.rows.map(row=>row.auth_user_id));
    await c.query('delete from public.security_audit_events where target_id=any($1::text[]) or actor_employee_id=any($2::uuid[])',[employeeIds,employeeIds]);
    await c.query('delete from public.employee_permission_overrides where employee_id=any($1::uuid[])',[employeeIds]);
    await c.query('delete from public.employee_invitations where employee_id=any($1::uuid[])',[employeeIds]);
    await c.query('delete from public.user_profiles where employee_id=any($1::uuid[])',[employeeIds]);
    await c.query('delete from public.employees where id=any($1::uuid[])',[employeeIds]);
    await c.query('delete from auth.users where id=any($1::uuid[])',[authIds]);
    await c.query('commit');await c.end();
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
