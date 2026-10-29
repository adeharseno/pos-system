begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
insert into public.suppliers(id,name,contact_person,phone,address,license_number)
values ('fa000000-0000-4000-8000-000000000001','Pemasok Uji','Kontak Lama','081234','Alamat Uji','IZIN-UJI');
select is((select name from public.suppliers where id='fa000000-0000-4000-8000-000000000001'),'Pemasok Uji','supplier can be created');
update public.suppliers set name='Pemasok Baru',phone=null,address=null where id='fa000000-0000-4000-8000-000000000001';
select is((select name from public.suppliers where id='fa000000-0000-4000-8000-000000000001'),'Pemasok Baru','supplier contact data can be edited');
update public.suppliers set is_active=false where id='fa000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.suppliers where id='fa000000-0000-4000-8000-000000000001'),1,'soft deletion retains supplier identity for references');
select is((select count(*)::integer from public.suppliers where id='fa000000-0000-4000-8000-000000000001' and is_active),0,'deleted supplier is excluded from active list');
select is((select contact_person || ':' || license_number from public.suppliers where id='fa000000-0000-4000-8000-000000000001'),'Kontak Lama:IZIN-UJI','unmanaged existing fields are retained');
select * from finish();
rollback;
