-- Extend the existing payment lifecycle without changing checkout or refunds.
-- Compare the new value as text because PostgreSQL does not allow a newly
-- added enum value to be used directly until the migration commits.
alter type public.payment_method add value if not exists 'bank_transfer';

alter table public.transactions drop constraint chk_transaction_payment_shape;
alter table public.transactions add constraint chk_transaction_payment_shape check (
  (
    payment_method = 'cash'
    and status in ('completed', 'voided')
    and cash_received is not null and cash_received >= total_amount
    and cash_change is not null and cash_change = cash_received - total_amount
    and payment_confirmed_at is not null and payment_confirmed_by is not null
  )
  or (
    (payment_method = 'qris' or payment_method::text = 'bank_transfer')
    and cash_received is null and cash_change is null
    and (
      (status = 'pending_payment' and payment_confirmed_at is null and payment_confirmed_by is null)
      or (status = 'completed' and payment_confirmed_at is not null and payment_confirmed_by is not null)
      or status = 'voided'
    )
  )
);

-- As with QRIS, a confirmed transfer cannot be voided directly.
alter table public.transactions add constraint chk_bank_transfer_void_must_be_unconfirmed check (
  not (payment_method::text = 'bank_transfer' and status = 'voided' and payment_confirmed_at is not null)
);
