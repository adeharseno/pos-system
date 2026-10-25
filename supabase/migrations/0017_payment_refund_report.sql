-- One SQL statement reads payments, refunds and current pending status from one snapshot.
create function public.payment_refund_report(p_from date, p_to date)
returns jsonb language sql stable security invoker
set search_path = pg_catalog, public
as $$
  with methods(method, ordering) as (values ('cash', 1), ('qris', 2), ('bank_transfer', 3)),
  completed as (
    select payment_method::text as method, count(*) as count, sum(total_amount) as amount
    from public.transactions
    where status = 'completed' and (
      (payment_method = 'cash' and business_date between p_from and p_to)
      or (payment_method <> 'cash'
        and payment_confirmed_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
        and payment_confirmed_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta')))
    group by payment_method
  ), refunds as (
    select refund_method::text as method, sum(refund_total) as amount
    from public.returns
    where source = 'customer' and business_date between p_from and p_to
    group by refund_method
  ), pending as (
    -- Current outstanding payments, grouped by their original business date.
    -- Historical pending states cannot be reconstructed after status changes.
    select payment_method::text as method, count(*) as count, sum(total_amount) as amount
    from public.transactions
    where status = 'pending_payment' and business_date between p_from and p_to
    group by payment_method
  )
  select jsonb_build_object('methods', jsonb_agg(jsonb_build_object(
    'method', m.method,
    'completedCount', coalesce(c.count, 0),
    'paymentsReceived', round(coalesce(c.amount, 0), 2)::text,
    'customerRefunds', round(coalesce(r.amount, 0), 2)::text,
    'netPayments', round(coalesce(c.amount, 0) - coalesce(r.amount, 0), 2)::text,
    'pendingCount', coalesce(p.count, 0),
    'pendingAmount', round(coalesce(p.amount, 0), 2)::text
  ) order by m.ordering))
  from methods m left join completed c on c.method = m.method
    left join refunds r on r.method = m.method
    left join pending p on p.method = m.method;
$$;

revoke all on function public.payment_refund_report(date, date) from public, anon, authenticated;
grant execute on function public.payment_refund_report(date, date) to service_role;
