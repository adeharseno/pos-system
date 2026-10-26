begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select ok(not has_table_privilege('anon','public.permission_definitions','SELECT'),'anon cannot read definitions');
select ok(not has_table_privilege('authenticated','public.employee_permission_overrides','SELECT'),'browser cannot read overrides');
select ok(not has_table_privilege('service_role','public.employee_permission_overrides','INSERT'),'server must use audited override RPC');
select ok(not has_table_privilege('service_role','public.security_audit_events','UPDATE'),'audit cannot be rewritten by service role');
select ok(not has_function_privilege('authenticated','public.set_employee_permission_override(uuid,uuid,text,text,text)','EXECUTE'),'browser cannot manage permissions');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.permission_definitions'::regclass,'public.role_permissions'::regclass,'public.employee_permission_overrides'::regclass,'public.security_audit_events'::regclass)),'all permission tables use RLS');
select is((select count(*)::int from role_permissions where role='staf'),1,'staff preset remains dashboard only');
select ok(not exists(select 1 from role_permissions where role='kasir' and (permission_code like 'pricing.cost.%' or permission_code like 'pricing.margin.%' or permission_code like 'submissions.%' or permission_code like 'employees.%')),'cashier has no new sensitive or admin permissions');
insert into employees(id,full_name,position) values
('20000000-0000-4000-8000-000000000001','Test Owner','owner_admin'),
('20000000-0000-4000-8000-000000000002','Test Staff','staf');
insert into auth.users(id) values('20000000-0000-4000-8000-000000000003');
insert into user_profiles(id,employee_id,display_name) values('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Test Owner');
select throws_ok($$select set_employee_permission_override(null,'20000000-0000-4000-8000-000000000002','products.view','allow','test')$$,'P0001','FORBIDDEN','unknown actor denied');
select lives_ok($$select set_employee_permission_override('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','products.view','allow','test')$$,'owner can grant override');
select is((select effect from employee_permission_overrides where employee_id='20000000-0000-4000-8000-000000000002'),'allow','allow stored');
select is((select count(*)::int from security_audit_events where target_id='20000000-0000-4000-8000-000000000002'),1,'override audited atomically');
select lives_ok($$select set_employee_permission_override('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','products.view','deny','revoke')$$,'owner can deny override');
select is((get_employee_permissions('20000000-0000-4000-8000-000000000002','staf')->'overrides'->0->>'effect'),'deny','resolver reads current override');
select throws_ok($$select set_employee_permission_override('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','unknown.permission','allow','test')$$,'P0001','UNKNOWN_PERMISSION','unknown code denied');
select throws_ok($$select set_employee_permission_override('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','products.view','allow',' ')$$,'P0001','REASON_REQUIRED','reason required');
select lives_ok($$select set_employee_permission_override('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','products.view',null,'restore preset')$$,'override can be removed');
update employees set is_active=false where id='20000000-0000-4000-8000-000000000002';
select throws_ok($$select get_employee_permissions('20000000-0000-4000-8000-000000000002','staf')$$,'P0001','EMPLOYEE_INACTIVE_OR_CHANGED','inactive resolver denied');
-- Entire fixture and temporary access changes roll back at the end.
update employees set is_active=false where position='owner_admin' and id<>'20000000-0000-4000-8000-000000000001';
select throws_ok($$update employees set is_active=false where id='20000000-0000-4000-8000-000000000001'$$,'P0001','LAST_ACTIVE_OWNER','last owner deactivation denied');
select throws_ok($$update employees set position='kasir' where id='20000000-0000-4000-8000-000000000001'$$,'P0001','LAST_ACTIVE_OWNER','last owner demotion denied');
select throws_ok($$delete from employees where id='20000000-0000-4000-8000-000000000001'$$,'P0001','LAST_ACTIVE_OWNER','last owner deletion denied');
select * from finish();
rollback;
