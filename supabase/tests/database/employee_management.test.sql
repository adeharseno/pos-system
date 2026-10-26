begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into employees(id,full_name,position) values
 ('31000000-0000-4000-8000-000000000001','Admin Uji','owner_admin'),
 ('31000000-0000-4000-8000-000000000002','Staf Uji','staf');
insert into auth.users(id,email) values
 ('31000000-0000-4000-8000-000000000003','admin-db@example.test'),
 ('31000000-0000-4000-8000-000000000004','conflict-db@example.test');
insert into user_profiles(id,employee_id,display_name) values
 ('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001','Admin Uji');
select ok(not has_table_privilege('authenticated','public.employee_invitations','SELECT'),'browser cannot read provisioning');
select ok(not has_function_privilege('anon','public.employee_admin_write(uuid,text,uuid,jsonb,text)','EXECUTE'),'anon cannot manage employees');
select throws_ok($$select employee_admin_read(null)$$,'P0001','FORBIDDEN','unverified administrator denied');
select lives_ok($$select employee_admin_write('31000000-0000-4000-8000-000000000003','create',null,
 '{"request_id":"31000000-0000-4000-8000-000000000005","full_name":"Pegawai Baru","position":"kasir"}','pegawai baru')$$,'create employee');
select lives_ok($$select employee_admin_write('31000000-0000-4000-8000-000000000003','create',null,
 '{"request_id":"31000000-0000-4000-8000-000000000005","full_name":"Pegawai Baru","position":"kasir"}','retry')$$,'create retry idempotent');
select is((select count(*)::int from employees where creation_request_id='31000000-0000-4000-8000-000000000005'),1,'no duplicate employee');
select throws_ok($$select employee_admin_write('31000000-0000-4000-8000-000000000003','create',null,
 '{"request_id":"31000000-0000-4000-8000-000000000005","full_name":"Berbeda"}','retry')$$,'P0001','REQUEST_CONFLICT','request reuse with new data denied');
select lives_ok($$select employee_admin_write('31000000-0000-4000-8000-000000000003','edit','31000000-0000-4000-8000-000000000002',
 '{"full_name":"Staf Diperbarui","phone":"081234"}','koreksi nama')$$,'edit employee information');
select is((select full_name from employees where id='31000000-0000-4000-8000-000000000002'),'Staf Diperbarui','name updated');
select ok(exists(select 1 from security_audit_events where action='employee.edit' and actor_employee_id='31000000-0000-4000-8000-000000000001' and reason='koreksi nama'),'edit attributed to actor');
select throws_ok($$select set_employee_permission_override('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000002','permissions.manage','allow','test')$$,'P0001','PROTECTED_PERMISSION','admin permission cannot be delegated');
select throws_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','claim','31000000-0000-4000-8000-000000000002','conflict-db@example.test')$$,'P0001','EMAIL_CONFLICT','existing Auth email cannot be adopted');
create temporary table claim as select employee_invitation_command('31000000-0000-4000-8000-000000000003','claim','31000000-0000-4000-8000-000000000002','invite-db@example.test') as value;
select throws_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','claim','31000000-0000-4000-8000-000000000002','invite-db@example.test')$$,'P0001','INVITATION_BUSY','concurrent invitation excluded by live lease');
select throws_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','claim',(select id from employees where creation_request_id='31000000-0000-4000-8000-000000000005'),'invite-db@example.test')$$,'P0001','EMAIL_CONFLICT','same email cannot be reserved by two employees');
insert into auth.users(id,email) select (value->>'auth_user_id')::uuid,'invite-db@example.test' from claim;
select lives_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','link','31000000-0000-4000-8000-000000000002',null,(select (value->>'attempt_id')::uuid from claim))$$,'links only reserved Auth account');
select ok(not employee_account_access((select (value->>'auth_user_id')::uuid from claim)),'unaccepted account cannot access protected operations');
select lives_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','fail','31000000-0000-4000-8000-000000000002',null,(select (value->>'attempt_id')::uuid from claim),'DELIVERY_FAILED')$$,'delivery failure recorded');
select is((select status from employee_invitations where employee_id='31000000-0000-4000-8000-000000000002'),'retryable','delivery failure is recoverable');
create temporary table retry as select employee_invitation_command('31000000-0000-4000-8000-000000000003','claim','31000000-0000-4000-8000-000000000002','invite-db@example.test') as value;
select is((select value->>'auth_user_id' from retry),(select value->>'auth_user_id' from claim),'retry reuses reserved user');
select throws_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','sent','31000000-0000-4000-8000-000000000002',null,(select (value->>'attempt_id')::uuid from claim))$$,'P0001','INVITATION_STALE','stale worker cannot finish newer invitation');
select lives_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','sent','31000000-0000-4000-8000-000000000002',null,(select (value->>'attempt_id')::uuid from retry))$$,'successful delivery recorded');
select throws_ok($$select employee_invitation_accept((select (value->>'auth_user_id')::uuid from claim),true)$$,'P0001','INVITATION_STALE','cannot activate without verified email and password');
update auth.users set email_confirmed_at=clock_timestamp(),encrypted_password='fixture-hash-not-a-password' where id=(select (value->>'auth_user_id')::uuid from claim);
select lives_ok($$select employee_invitation_accept((select (value->>'auth_user_id')::uuid from claim),true)$$,'verified setup activates account');
select ok(employee_account_access((select (value->>'auth_user_id')::uuid from claim)),'accepted employee can use protected operations');
select lives_ok($$select employee_admin_write('31000000-0000-4000-8000-000000000003','access','31000000-0000-4000-8000-000000000002','{"is_active":false}','akses dihentikan')$$,'disable employee');
select ok(not employee_account_access((select (value->>'auth_user_id')::uuid from claim)),'disabled employee denied even with existing Auth identity');
select ok(exists(select 1 from security_audit_events where action='employee.access' and reason='akses dihentikan' and actor_employee_id='31000000-0000-4000-8000-000000000001'),'access audit has actor and reason');
select ok(not (employee_admin_read('31000000-0000-4000-8000-000000000003')::text ~ 'encrypted_password|token|raw_user_meta|cost_price|margin'),'employee response has no secrets or pricing');
update employees set is_active=false where position='owner_admin' and id<>'31000000-0000-4000-8000-000000000001';
select throws_ok($$delete from user_profiles where id='31000000-0000-4000-8000-000000000003'$$,'P0001','LAST_ACTIVE_OWNER','cannot unlink last usable Owner');
select throws_ok($$update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='31000000-0000-4000-8000-000000000003'$$,'P0001','LAST_ACTIVE_OWNER','cannot ban last usable Owner');
select throws_ok($$delete from auth.users where id='31000000-0000-4000-8000-000000000003'$$,'P0001','LAST_ACTIVE_OWNER','cannot delete last usable Owner Auth account');
select throws_ok($$select employee_admin_write('31000000-0000-4000-8000-000000000003','role','31000000-0000-4000-8000-000000000001','{"position":"kasir"}','ubah peran')$$,'P0001','LAST_ACTIVE_OWNER','cannot downgrade last usable Owner');
select throws_ok($$update user_profiles set employee_id=null where id='31000000-0000-4000-8000-000000000003'$$,'P0001','LAST_ACTIVE_OWNER','cannot reassign last usable Owner profile');
select lives_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','claim',
 (select id from employees where creation_request_id='31000000-0000-4000-8000-000000000005'),'second-db@example.test')$$,'second employee can reserve a different email');
update employee_invitations set lease_until=clock_timestamp()-interval '1 second'
 where email='second-db@example.test';
select lives_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','claim',
 (select id from employees where creation_request_id='31000000-0000-4000-8000-000000000005'),'second-db@example.test')$$,'expired worker lease permits recovery');
select lives_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','fail',
 (select id from employees where creation_request_id='31000000-0000-4000-8000-000000000005'),null,
 (select attempt_id from employee_invitations where email='second-db@example.test'),'EMAIL_CONFLICT')$$,'terminal conflict recorded safely');
select is((select status from employee_invitations where email='second-db@example.test'),'failed','terminal conflict is distinguished from retryable failure');
select throws_ok($$select employee_invitation_command('31000000-0000-4000-8000-000000000003','claim',
 (select id from employees where creation_request_id='31000000-0000-4000-8000-000000000005'),'second-db@example.test')$$,'P0001','EMAIL_CONFLICT','terminal conflict cannot adopt a different account on retry');
select * from finish();
rollback;
