-- Premium Car Rental DMCC payment voucher database.
-- Apply this file in the Supabase SQL editor for:
-- https://ewmjnknbcohixqptshoc.supabase.co
--
-- This schema is additive and preserves existing voucher data. It creates the
-- recipient directory, payment vouchers, print/PDF event history, audit log,
-- indexes, triggers, constraints, and RLS policies required by PCR/pcr_receipt.html.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create sequence if not exists public.pcr_payment_voucher_number_seq start with 1 increment by 1;

create or replace function public.pcr_normalize_text(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.pcr_display_text(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g');
$$;

create or replace function public.pcr_generate_voucher_number()
returns text
language plpgsql
as $$
declare
  next_value bigint;
begin
  next_value := nextval('public.pcr_payment_voucher_number_seq');
  return 'PV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(next_value::text, 5, '0');
end;
$$;

create or replace function public.pcr_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.pcr_recipients (
  id uuid primary key default gen_random_uuid(),
  recipient_name text not null,
  normalized_name text not null unique,
  recipient_type text not null default 'other' check (recipient_type in ('customer', 'staff', 'other')),
  company text,
  source text not null default 'manual',
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pcr_recipients_name_nonempty check (length(public.pcr_display_text(recipient_name)) > 0)
);

create table if not exists public.pcr_payment_vouchers (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.pcr_recipients(id) on delete set null,
  voucher_number text not null default public.pcr_generate_voucher_number(),
  voucher_date date not null default current_date,
  amount numeric(18,2) not null check (amount >= 0),
  amount_words text not null,
  currency text not null default 'AED' check (currency in ('AED', 'SAR', 'PKR', 'USD', 'BTC')),
  company text,
  paid_to text not null,
  payment_method text not null check (payment_method in ('Cash', 'Cheque', 'Card', 'Bank Transfer')),
  description text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now(),
  deleted_by text,
  deleted_at timestamptz,
  print_count integer not null default 0 check (print_count >= 0),
  last_printed_at timestamptz,
  pdf_download_count integer not null default 0 check (pdf_download_count >= 0),
  last_pdf_downloaded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint pcr_payment_vouchers_number_unique unique (voucher_number),
  constraint pcr_payment_vouchers_paid_to_nonempty check (length(public.pcr_display_text(paid_to)) > 0),
  constraint pcr_payment_vouchers_words_nonempty check (length(public.pcr_display_text(amount_words)) > 0)
);

create table if not exists public.pcr_voucher_print_events (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.pcr_payment_vouchers(id) on delete cascade,
  event_type text not null check (event_type in ('preview', 'print', 'pdf')),
  performed_by text,
  performed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.pcr_voucher_audit_events (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid,
  event_type text not null check (event_type in ('created', 'updated', 'deleted', 'restored', 'removed')),
  actor text,
  old_data jsonb,
  new_data jsonb,
  event_at timestamptz not null default now()
);

create or replace function public.pcr_prepare_recipient()
returns trigger
language plpgsql
as $$
begin
  new.recipient_name := public.pcr_display_text(new.recipient_name);
  new.normalized_name := public.pcr_normalize_text(new.recipient_name);

  if new.normalized_name = '' then
    raise exception 'Recipient name is required.';
  end if;

  if new.recipient_type is null or new.recipient_type = '' then
    new.recipient_type := 'other';
  end if;

  return new;
end;
$$;

create or replace function public.pcr_link_voucher_recipient()
returns trigger
language plpgsql
as $$
declare
  normalized text;
  matched_recipient_id uuid;
begin
  new.paid_to := public.pcr_display_text(new.paid_to);
  normalized := public.pcr_normalize_text(new.paid_to);

  if normalized = '' then
    raise exception 'Paid To is required.';
  end if;

  if new.recipient_id is null then
    insert into public.pcr_recipients (
      recipient_name,
      normalized_name,
      recipient_type,
      source,
      usage_count,
      last_used_at,
      created_by
    )
    values (
      new.paid_to,
      normalized,
      'other',
      'voucher',
      1,
      now(),
      new.created_by
    )
    on conflict (normalized_name) do update
      set usage_count = public.pcr_recipients.usage_count + 1,
          last_used_at = now(),
          is_active = true,
          updated_at = now()
    returning id into matched_recipient_id;

    new.recipient_id := matched_recipient_id;
  else
    update public.pcr_recipients
      set usage_count = usage_count + 1,
          last_used_at = now(),
          is_active = true,
          updated_at = now()
      where id = new.recipient_id;
  end if;

  return new;
end;
$$;

create or replace function public.pcr_log_voucher_audit()
returns trigger
language plpgsql
as $$
declare
  audit_type text;
  audit_actor text;
begin
  if tg_op = 'INSERT' then
    audit_type := 'created';
    audit_actor := new.created_by;
    insert into public.pcr_voucher_audit_events(voucher_id, event_type, actor, new_data)
    values (new.id, audit_type, audit_actor, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      audit_type := 'deleted';
      audit_actor := coalesce(new.deleted_by, new.updated_by, new.created_by);
    elsif old.deleted_at is not null and new.deleted_at is null then
      audit_type := 'restored';
      audit_actor := coalesce(new.updated_by, new.created_by);
    else
      audit_type := 'updated';
      audit_actor := coalesce(new.updated_by, new.created_by);
    end if;

    insert into public.pcr_voucher_audit_events(voucher_id, event_type, actor, old_data, new_data)
    values (new.id, audit_type, audit_actor, to_jsonb(old), to_jsonb(new));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.pcr_voucher_audit_events(voucher_id, event_type, actor, old_data)
    values (old.id, 'removed', coalesce(old.deleted_by, old.updated_by, old.created_by), to_jsonb(old));
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_pcr_recipients_prepare on public.pcr_recipients;
create trigger trg_pcr_recipients_prepare
before insert or update on public.pcr_recipients
for each row execute function public.pcr_prepare_recipient();

drop trigger if exists trg_pcr_recipients_updated_at on public.pcr_recipients;
create trigger trg_pcr_recipients_updated_at
before update on public.pcr_recipients
for each row execute function public.pcr_set_updated_at();

drop trigger if exists trg_pcr_vouchers_link_recipient on public.pcr_payment_vouchers;
create trigger trg_pcr_vouchers_link_recipient
before insert or update of paid_to, recipient_id on public.pcr_payment_vouchers
for each row execute function public.pcr_link_voucher_recipient();

drop trigger if exists trg_pcr_vouchers_updated_at on public.pcr_payment_vouchers;
create trigger trg_pcr_vouchers_updated_at
before update on public.pcr_payment_vouchers
for each row execute function public.pcr_set_updated_at();

drop trigger if exists trg_pcr_vouchers_audit_insert on public.pcr_payment_vouchers;
create trigger trg_pcr_vouchers_audit_insert
after insert on public.pcr_payment_vouchers
for each row execute function public.pcr_log_voucher_audit();

drop trigger if exists trg_pcr_vouchers_audit_update on public.pcr_payment_vouchers;
create trigger trg_pcr_vouchers_audit_update
after update on public.pcr_payment_vouchers
for each row execute function public.pcr_log_voucher_audit();

drop trigger if exists trg_pcr_vouchers_audit_delete on public.pcr_payment_vouchers;
create trigger trg_pcr_vouchers_audit_delete
after delete on public.pcr_payment_vouchers
for each row execute function public.pcr_log_voucher_audit();

create index if not exists pcr_recipients_type_idx on public.pcr_recipients(recipient_type);
create index if not exists pcr_recipients_last_used_idx on public.pcr_recipients(last_used_at desc nulls last);
create index if not exists pcr_recipients_name_trgm_idx on public.pcr_recipients using gin (recipient_name gin_trgm_ops);

create index if not exists pcr_vouchers_date_idx on public.pcr_payment_vouchers(voucher_date desc);
create index if not exists pcr_vouchers_created_idx on public.pcr_payment_vouchers(created_at desc);
create index if not exists pcr_vouchers_recipient_idx on public.pcr_payment_vouchers(recipient_id);
create index if not exists pcr_vouchers_method_idx on public.pcr_payment_vouchers(payment_method);
create index if not exists pcr_vouchers_deleted_idx on public.pcr_payment_vouchers(deleted_at);
create index if not exists pcr_vouchers_paid_to_trgm_idx on public.pcr_payment_vouchers using gin (paid_to gin_trgm_ops);

create index if not exists pcr_print_events_voucher_idx on public.pcr_voucher_print_events(voucher_id);
create index if not exists pcr_print_events_time_idx on public.pcr_voucher_print_events(performed_at desc);
create index if not exists pcr_audit_events_voucher_idx on public.pcr_voucher_audit_events(voucher_id);
create index if not exists pcr_audit_events_time_idx on public.pcr_voucher_audit_events(event_at desc);

alter table public.pcr_recipients enable row level security;
alter table public.pcr_payment_vouchers enable row level security;
alter table public.pcr_voucher_print_events enable row level security;
alter table public.pcr_voucher_audit_events enable row level security;

drop policy if exists pcr_recipients_read on public.pcr_recipients;
drop policy if exists pcr_recipients_insert on public.pcr_recipients;
drop policy if exists pcr_recipients_update on public.pcr_recipients;
drop policy if exists pcr_recipients_delete on public.pcr_recipients;
create policy pcr_recipients_read on public.pcr_recipients for select to anon, authenticated using (true);
create policy pcr_recipients_insert on public.pcr_recipients for insert to anon, authenticated with check (true);
create policy pcr_recipients_update on public.pcr_recipients for update to anon, authenticated using (true) with check (true);
create policy pcr_recipients_delete on public.pcr_recipients for delete to anon, authenticated using (true);

drop policy if exists pcr_vouchers_read on public.pcr_payment_vouchers;
drop policy if exists pcr_vouchers_insert on public.pcr_payment_vouchers;
drop policy if exists pcr_vouchers_update on public.pcr_payment_vouchers;
drop policy if exists pcr_vouchers_delete on public.pcr_payment_vouchers;
create policy pcr_vouchers_read on public.pcr_payment_vouchers for select to anon, authenticated using (true);
create policy pcr_vouchers_insert on public.pcr_payment_vouchers for insert to anon, authenticated with check (true);
create policy pcr_vouchers_update on public.pcr_payment_vouchers for update to anon, authenticated using (true) with check (true);
create policy pcr_vouchers_delete on public.pcr_payment_vouchers for delete to anon, authenticated using (true);

drop policy if exists pcr_print_events_read on public.pcr_voucher_print_events;
drop policy if exists pcr_print_events_insert on public.pcr_voucher_print_events;
drop policy if exists pcr_print_events_update on public.pcr_voucher_print_events;
drop policy if exists pcr_print_events_delete on public.pcr_voucher_print_events;
create policy pcr_print_events_read on public.pcr_voucher_print_events for select to anon, authenticated using (true);
create policy pcr_print_events_insert on public.pcr_voucher_print_events for insert to anon, authenticated with check (true);
create policy pcr_print_events_update on public.pcr_voucher_print_events for update to anon, authenticated using (true) with check (true);
create policy pcr_print_events_delete on public.pcr_voucher_print_events for delete to anon, authenticated using (true);

drop policy if exists pcr_audit_events_read on public.pcr_voucher_audit_events;
drop policy if exists pcr_audit_events_insert on public.pcr_voucher_audit_events;
drop policy if exists pcr_audit_events_update on public.pcr_voucher_audit_events;
drop policy if exists pcr_audit_events_delete on public.pcr_voucher_audit_events;
create policy pcr_audit_events_read on public.pcr_voucher_audit_events for select to anon, authenticated using (true);
create policy pcr_audit_events_insert on public.pcr_voucher_audit_events for insert to anon, authenticated with check (true);
create policy pcr_audit_events_update on public.pcr_voucher_audit_events for update to anon, authenticated using (true) with check (true);
create policy pcr_audit_events_delete on public.pcr_voucher_audit_events for delete to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant usage, select, update on sequence public.pcr_payment_voucher_number_seq to anon, authenticated;
grant select, insert, update, delete on public.pcr_recipients to anon, authenticated;
grant select, insert, update, delete on public.pcr_payment_vouchers to anon, authenticated;
grant select, insert, update, delete on public.pcr_voucher_print_events to anon, authenticated;
grant select, insert, update, delete on public.pcr_voucher_audit_events to anon, authenticated;
grant execute on function public.pcr_normalize_text(text) to anon, authenticated;
grant execute on function public.pcr_display_text(text) to anon, authenticated;
grant execute on function public.pcr_generate_voucher_number() to anon, authenticated;
