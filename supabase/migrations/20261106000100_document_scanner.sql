-- =============================================================================
-- Phase 4: ticket / PDF scanner
--
-- Flow: a file is uploaded to the private bucket and a documents row is
-- created (Phase 1 policies). Travel Desk / Admin presses "Scan": the
-- document-extract Edge Function reads the file AS THE CALLER, pulls out the
-- text (or lets the model read the image when there is no text layer), asks
-- the model to fill a fixed JSON schema, checks every field in code, and saves
-- the result as a suggestion (extraction_status = 'extracted').
--
-- Nothing reaches travel_records until a person reviews the fields and calls
-- document_confirm(). That function validates everything again in the
-- database, detects duplicates, links the document and writes the audit log.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Rate limits for Edge Functions that cost money (scanner now, AI assistant
-- in Phase 7). The limits live HERE, not in the caller's request, so nobody
-- can raise their own quota.
-- ---------------------------------------------------------------------------
create table private.rate_limits (
  user_id       uuid not null,
  bucket        text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (user_id, bucket, window_start)
);
revoke all on private.rate_limits from public, anon, authenticated;

create or replace function public.consume_rate_limit(p_bucket text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
  v_window integer;
  v_start timestamptz;
  v_hits integer;
begin
  if v_uid is null or private.current_app_role() is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  case p_bucket
    when 'document_extract' then v_limit := 30; v_window := 3600;    -- 30 scans per hour
    when 'ai_assistant'     then v_limit := 50; v_window := 86400;   -- reserved for Phase 7
    else raise exception 'Unknown rate limit' using errcode = '22023';
  end case;

  v_start := to_timestamp(floor(extract(epoch from now()) / v_window) * v_window);
  insert into private.rate_limits as r (user_id, bucket, window_start, hits)
  values (v_uid, p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  delete from private.rate_limits
   where user_id = v_uid and bucket = p_bucket and window_start < v_start;

  return v_hits <= v_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Only document_confirm() may mark a document verified. A plain UPDATE from
-- the API cannot, and cannot rewrite a verified document's extraction.
-- ---------------------------------------------------------------------------
create or replace function private.guard_document_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if old.extraction_status = 'verified' and (
         new.extraction_status is distinct from old.extraction_status
         or new.extracted_data is distinct from old.extracted_data
         or new.travel_record_id is distinct from old.travel_record_id) then
      raise exception 'This document is already confirmed' using errcode = '42501';
    end if;
    if new.extraction_status = 'verified' and old.extraction_status is distinct from 'verified' then
      raise exception 'Use document_confirm to confirm a document' using errcode = '42501';
    end if;
  end if;
  if new.extracted_data is not null and octet_length(new.extracted_data::text) > 65536 then
    raise exception 'Extracted data is too large' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger documents_verification_guard
  before update on public.documents
  for each row execute function private.guard_document_verification();

-- ---------------------------------------------------------------------------
-- document_confirm: a person checked the fields; save the trip.
-- p_fields: object with string values for origin, destination,
--   departure_date (YYYY-MM-DD), return_date, provider, booking_reference,
--   ticket_number, amount, currency, booking_type, document_type.
-- If the same person already has a trip on that date with that PNR, the
-- document is attached to it instead of creating a second one.
-- Returns { "record_id": uuid, "created": boolean }.
-- ---------------------------------------------------------------------------
create or replace function public.document_confirm(p_document uuid, p_fields jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
  v_origin text; v_dest text; v_provider text; v_ref text; v_ticket text; v_currency text;
  v_raw text; v_dep date; v_ret date; v_amount numeric; v_type public.travel_type; v_doc_type public.document_type;
  v_record uuid;
  v_created boolean := false;
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'Invalid fields' using errcode = '22023';
  end if;

  select * into v_doc from public.documents where id = p_document for update;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if v_doc.extraction_status = 'verified' then
    raise exception 'This document is already confirmed' using errcode = '23505';
  end if;

  v_origin   := private.clean_text(p_fields ->> 'origin', 120);
  v_dest     := private.clean_text(p_fields ->> 'destination', 120);
  v_provider := private.clean_text(p_fields ->> 'provider', 120);
  v_ref      := upper(private.clean_text(p_fields ->> 'booking_reference', 64));
  v_ticket   := private.clean_text(p_fields ->> 'ticket_number', 64);
  v_currency := upper(coalesce(private.clean_text(p_fields ->> 'currency', 8), 'INR'));
  v_type     := private.map_booking_type(p_fields ->> 'booking_type');

  if v_origin is null or v_dest is null then
    raise exception 'From and To are required' using errcode = '22023';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a 3-letter code' using errcode = '22023';
  end if;

  v_raw := private.clean_text(p_fields ->> 'departure_date', 10);
  if v_raw is null or v_raw !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Travel date must be YYYY-MM-DD' using errcode = '22023';
  end if;
  begin
    v_dep := v_raw::date;
  exception when others then
    raise exception 'Travel date is not a real date' using errcode = '22023';
  end;

  v_raw := private.clean_text(p_fields ->> 'return_date', 10);
  if v_raw is not null then
    if v_raw !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Return date must be YYYY-MM-DD' using errcode = '22023';
    end if;
    begin
      v_ret := v_raw::date;
    exception when others then
      raise exception 'Return date is not a real date' using errcode = '22023';
    end;
    if v_ret < v_dep then
      raise exception 'Return date is before the travel date' using errcode = '22023';
    end if;
  end if;

  v_raw := private.clean_text(p_fields ->> 'amount', 32);
  if v_raw is not null then
    v_raw := regexp_replace(v_raw, '[^0-9.\-]', '', 'g');
    if v_raw !~ '^\d{1,10}(\.\d{1,2})?$' then
      raise exception 'Amount must be a positive number' using errcode = '22023';
    end if;
    v_amount := v_raw::numeric;
  end if;

  begin
    v_doc_type := coalesce(nullif(p_fields ->> 'document_type', ''), v_doc.document_type::text)::public.document_type;
  exception when others then
    v_doc_type := v_doc.document_type;
  end;

  if v_ref is not null then
    select id into v_record from public.travel_records
     where employee_id = v_doc.employee_id and departure_date = v_dep and booking_reference = v_ref;
  end if;

  if v_record is null then
    insert into public.travel_records (
      employee_id, booking_reference, origin, destination, departure_date, return_date,
      airline_or_provider, ticket_number, amount, currency, booking_type, source, created_by
    ) values (
      v_doc.employee_id, v_ref, v_origin, v_dest, v_dep, v_ret,
      v_provider, v_ticket, v_amount, v_currency, v_type, 'document', auth.uid()
    ) returning id into v_record;
    v_created := true;
  end if;

  update public.documents
     set travel_record_id = v_record,
         extraction_status = 'verified',
         document_type = v_doc_type,
         extracted_data = coalesce(extracted_data, '{}'::jsonb) || jsonb_build_object(
           'verified', jsonb_build_object(
             'origin', v_origin, 'destination', v_dest, 'departure_date', v_dep, 'return_date', v_ret,
             'provider', v_provider, 'booking_reference', v_ref, 'ticket_number', v_ticket,
             'amount', v_amount, 'currency', v_currency, 'booking_type', v_type),
           'verified_at', now(),
           'verified_by', auth.uid())
   where id = p_document;

  perform private.write_audit('document_confirmed', 'documents', p_document::text,
    jsonb_build_object('travel_record_id', v_record, 'created', v_created));

  return jsonb_build_object('record_id', v_record, 'created', v_created);
end;
$$;
revoke all on function public.document_confirm(uuid, jsonb) from public, anon;
grant execute on function public.document_confirm(uuid, jsonb) to authenticated;
