-- =============================================================================
-- Trapple / Travora on Supabase — Phase 1: core schema
--
-- Design notes
--  * profiles.id is the employee's own id. profiles.user_id links to a login
--    (auth.users). It is nullable so the Travel Desk can import employees from
--    Excel before they have an account; the link is made when they are invited.
--  * Passwords never live in this schema. Supabase Auth stores them.
--  * Money is numeric(12,2) with a currency code. Dates are `date`.
--  * Every table gets RLS in the next migration. Nothing here grants access.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('employee', 'approver', 'travel_desk', 'admin');

create type public.request_status as enum (
  'pending', 'approved', 'rejected', 'cancelled', 'booked', 'completed'
);

create type public.travel_type as enum (
  'flight', 'train', 'bus', 'cab', 'hotel', 'multi_modal', 'other'
);

create type public.approval_status as enum ('approved', 'rejected');

create type public.document_type as enum (
  'flight_ticket', 'train_ticket', 'bus_ticket', 'hotel_voucher',
  'invoice', 'boarding_pass', 'bulk_booking', 'spreadsheet', 'other'
);

create type public.ai_message_role as enum ('user', 'assistant', 'tool');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per employee (with or without a login)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users (id) on delete set null,
  employee_id  text not null unique
               check (employee_id ~ '^[A-Za-z0-9._-]{2,32}$'),
  full_name    text not null check (char_length(btrim(full_name)) between 1 and 200),
  email        extensions.citext unique
               check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  department   text check (department is null or char_length(department) <= 120),
  designation  text check (designation is null or char_length(designation) <= 120),
  role         public.app_role not null default 'employee',
  manager_id   uuid references public.profiles (id) on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_not_own_manager check (manager_id is null or manager_id <> id)
);

create index profiles_manager_id_idx  on public.profiles (manager_id);
create index profiles_department_idx  on public.profiles (department);
create index profiles_role_idx        on public.profiles (role);
create index profiles_full_name_idx   on public.profiles (lower(full_name));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- travel_requests: what an employee asks for
-- ---------------------------------------------------------------------------
create table public.travel_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles (id) on delete restrict,
  origin          text not null check (char_length(btrim(origin)) between 1 and 120),
  destination     text not null check (char_length(btrim(destination)) between 1 and 120),
  departure_date  date not null,
  return_date     date,
  purpose         text not null check (char_length(btrim(purpose)) between 1 and 2000),
  travel_type     public.travel_type not null default 'flight',
  estimated_cost  numeric(12, 2) check (estimated_cost is null or estimated_cost >= 0),
  currency        char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status          public.request_status not null default 'pending',
  approver_id     uuid references public.profiles (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint travel_requests_dates check (return_date is null or return_date >= departure_date),
  constraint travel_requests_not_self_approver check (approver_id is null or approver_id <> employee_id)
);

create index travel_requests_employee_idx    on public.travel_requests (employee_id, departure_date desc);
create index travel_requests_approver_idx    on public.travel_requests (approver_id, status);
create index travel_requests_status_idx      on public.travel_requests (status);
create index travel_requests_departure_idx   on public.travel_requests (departure_date);
create index travel_requests_destination_idx on public.travel_requests (lower(destination));

create trigger travel_requests_set_updated_at
  before update on public.travel_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- travel_records: trips that were actually booked / travelled
-- ---------------------------------------------------------------------------
create table public.travel_records (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references public.profiles (id) on delete restrict,
  request_id           uuid references public.travel_requests (id) on delete set null,
  booking_reference    text check (booking_reference is null or char_length(booking_reference) <= 64),
  origin               text not null check (char_length(btrim(origin)) between 1 and 120),
  destination          text not null check (char_length(btrim(destination)) between 1 and 120),
  departure_date       date not null,
  return_date          date,
  airline_or_provider  text check (airline_or_provider is null or char_length(airline_or_provider) <= 120),
  ticket_number        text check (ticket_number is null or char_length(ticket_number) <= 64),
  amount               numeric(12, 2) check (amount is null or amount >= 0),
  currency             char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  booking_type         public.travel_type not null default 'flight',
  status               text not null default 'confirmed'
                       check (status in ('confirmed', 'cancelled', 'completed')),
  source               text not null default 'manual'
                       check (source in ('manual', 'import', 'document', 'bulk_booking', 'legacy')),
  created_by           uuid references auth.users (id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint travel_records_dates check (return_date is null or return_date >= departure_date)
);

create index travel_records_employee_idx    on public.travel_records (employee_id, departure_date desc);
create index travel_records_departure_idx   on public.travel_records (departure_date);
create index travel_records_destination_idx on public.travel_records (lower(destination));
create index travel_records_origin_idx      on public.travel_records (lower(origin));
create index travel_records_provider_idx    on public.travel_records (lower(airline_or_provider));
create index travel_records_booking_ref_idx on public.travel_records (booking_reference);
create index travel_records_ticket_idx      on public.travel_records (ticket_number);
create index travel_records_request_idx     on public.travel_records (request_id);
-- Duplicate guard used by imports: same person, same day, same PNR.
create unique index travel_records_dedupe_idx
  on public.travel_records (employee_id, departure_date, booking_reference)
  where booking_reference is not null;

create trigger travel_records_set_updated_at
  before update on public.travel_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- documents: metadata for files in the private Storage bucket
-- ---------------------------------------------------------------------------
create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.profiles (id) on delete restrict,
  travel_record_id   uuid references public.travel_records (id) on delete set null,
  document_type      public.document_type not null default 'other',
  storage_path       text not null unique
                     check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg|webp|csv|xlsx)$'),
  original_filename  text not null check (char_length(original_filename) between 1 and 255),
  mime_type          text not null check (mime_type in (
                       'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv',
                       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes         bigint check (size_bytes is null or (size_bytes > 0 and size_bytes <= 10485760)),
  extracted_data     jsonb,
  extraction_status  text not null default 'none'
                     check (extraction_status in ('none', 'pending', 'extracted', 'verified', 'failed')),
  uploaded_by        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now()
);

create index documents_employee_idx on public.documents (employee_id, created_at desc);
create index documents_record_idx   on public.documents (travel_record_id);

-- ---------------------------------------------------------------------------
-- approvals: one row per decision (history is kept, never overwritten)
-- ---------------------------------------------------------------------------
create table public.approvals (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.travel_requests (id) on delete cascade,
  approver_id  uuid not null references public.profiles (id) on delete restrict,
  status       public.approval_status not null,
  comments     text check (comments is null or char_length(comments) <= 2000),
  decided_at   timestamptz not null default now()
);

create index approvals_request_idx  on public.approvals (request_id, decided_at desc);
create index approvals_approver_idx on public.approvals (approver_id, decided_at desc);

-- ---------------------------------------------------------------------------
-- audit_logs: append-only. Written by triggers / security-definer functions.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  user_id      uuid,               -- auth.users id; no FK so logs survive user deletion
  action       text not null check (char_length(action) between 1 and 80),
  entity_type  text not null check (char_length(entity_type) between 1 and 80),
  entity_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_user_idx    on public.audit_logs (user_id, created_at desc);
create index audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- AI assistant history (Phase 7 uses these; created now so RLS is in place)
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title       text check (title is null or char_length(title) <= 200),
  created_at  timestamptz not null default now()
);

create index ai_conversations_user_idx on public.ai_conversations (user_id, created_at desc);

create table public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.ai_conversations (id) on delete cascade,
  role             public.ai_message_role not null,
  content          text not null check (char_length(content) <= 20000),
  created_at       timestamptz not null default now()
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
