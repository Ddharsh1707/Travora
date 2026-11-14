-- =============================================================================
-- Temporary workforce, part 2: the upload People step
--
-- Builds on 20261115100000_workforce_model.sql. Nothing is dropped and no
-- existing trip, cost or person is changed by this file.
--
-- What changes when the travel desk uploads a sheet or PDF:
--  * A "Contractor / labour supplier" column, when the sheet has one, is kept
--    with each line (import_stage_v2 is widened in place, as
--    20261107000600_requests_admin_pdf.sql did for PDFs).
--  * Each person on the People step is checked against:
--      1. employee ID and exact name (unchanged),
--      2. spellings saved on earlier uploads (person_aliases),
--      3. possible matches: same name, matching initials ("R Kumar" and
--         "Ravi Kumar"), or one name inside the other. These are shown as
--         suggestions with the reason. Nobody is linked on a "possible" match.
--  * Nobody is added automatically while a possible match exists: the
--    person is left for someone to decide.
--  * "Add as a new person" now records what kind of worker they are:
--    temporary, contract, outsourced or unknown (the default). Only the
--    Travel Desk or the Director may add someone as a permanent employee.
--  * When the upload is saved:
--      - people it added get that worker type, the contractor named for them,
--        and the status imported_unverified (possible_duplicate when a
--        possible match had been shown);
--      - spellings a person linked to someone are remembered, so the next
--        upload recognises them.
--  * Duplicate protection, stored files and upload history are unchanged.
--
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Keep the contractor column with each uploaded line
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.import_stage_v2(text, text, jsonb, jsonb, boolean, text)'::regprocedure);
  if position('''contractor'', private.clean_text' in v_def) = 0 then
    v_def := replace(v_def,
      '''consultant'', private.clean_text(v_row ->> ''consultant'', 120),',
      '''consultant'', private.clean_text(v_row ->> ''consultant'', 120),'
        || chr(10) || '        ''contractor'', private.clean_text(v_row ->> ''contractor'', 200),');
    if position('''contractor'', private.clean_text' in v_def) = 0 then
      raise exception 'Could not update import_stage_v2 for contractors';
    end if;
    execute v_def;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. What the People step remembers per person
-- ---------------------------------------------------------------------------
alter table public.name_match_reviews
  add column if not exists candidates      jsonb not null default '[]'::jsonb,
  add column if not exists workforce_type  text,
  add column if not exists contractor_name text;

alter table public.name_match_reviews drop constraint if exists name_match_reviews_candidates_check;
alter table public.name_match_reviews add constraint name_match_reviews_candidates_check
  check (jsonb_typeof(candidates) = 'array');
alter table public.name_match_reviews drop constraint if exists name_match_reviews_workforce_type_check;
alter table public.name_match_reviews add constraint name_match_reviews_workforce_type_check
  check (workforce_type is null or workforce_type in
         ('permanent_employee', 'temporary_worker', 'contract_worker', 'outsourced_worker', 'unknown'));
alter table public.name_match_reviews drop constraint if exists name_match_reviews_contractor_name_check;
alter table public.name_match_reviews add constraint name_match_reviews_contractor_name_check
  check (contractor_name is null or char_length(btrim(contractor_name)) between 1 and 200);

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

-- The person someone was merged into (following a chain of merges).
create or replace function private.follow_merges(p_profile uuid)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_id uuid := p_profile;
  v_next uuid;
begin
  for i in 1..20 loop
    select merged_into into v_next from public.profiles where id = v_id;
    exit when v_next is null;
    v_id := v_next;
  end loop;
  return v_id;
end;
$$;

-- Why two name keys might be the same person, or null when they are not
-- comparable. Keys come from private.person_name_key (upper case, sorted
-- words). At least one full word (2+ letters) must be shared.
create or replace function private.name_match_reason(p_a text, p_b text)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  a text[] := string_to_array(coalesce(p_a, ''), ' ');
  b text[] := string_to_array(coalesce(p_b, ''), ' ');
  la text[];
  lb text[];
  short_side text[];
  long_side text[];
  w text;
begin
  if p_a is null or p_b is null or p_a = '' or p_b = '' then
    return null;
  end if;
  if p_a = p_b then
    return 'Same name';
  end if;
  if not exists (select 1 from unnest(a) x where char_length(x) >= 2 and x = any (b)) then
    return null;
  end if;
  la := array(select x from unnest(a) x where not x = any (b));
  lb := array(select x from unnest(b) x where not x = any (a));
  if cardinality(la) = 0 or cardinality(lb) = 0 then
    return 'One name is part of the other';
  end if;
  if cardinality(la) <= cardinality(lb) then
    short_side := la; long_side := lb;
  else
    short_side := lb; long_side := la;
  end if;
  foreach w in array short_side loop
    if char_length(w) <> 1 or not exists (select 1 from unnest(long_side) y where left(y, 1) = w) then
      return null;
    end if;
  end loop;
  return 'Initials match';
end;
$$;

-- Up to 5 people who might be this name, best first. Merged people are
-- replaced by who they became. Suggestions only: nothing is linked here.
create or replace function private.name_candidates(p_key text, p_exclude uuid default null)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with found as (
    select p.id, private.name_match_reason(p_key, private.person_name_key(p.full_name)) as reason, 'name' as via
      from public.profiles p
     where p.merged_into is null
    union all
    select private.follow_merges(a.profile_id),
           private.name_match_reason(p_key, a.alias_key), 'alias'
      from public.person_aliases a
     where a.company_id = private.default_company_id()
  ), best as (
    select distinct on (f.id) f.id, f.reason, f.via
      from found f
     where f.reason is not null and f.id is distinct from p_exclude
     order by f.id,
              case f.reason when 'Same name' then 1 when 'Initials match' then 2 else 3 end,
              case f.via when 'name' then 1 else 2 end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'profile_id', p.id, 'full_name', p.full_name, 'employee_id', p.employee_id,
           'workforce_type', p.workforce_type, 'active', p.active,
           'reason', case when b.via = 'alias' then b.reason || ' (saved spelling)' else b.reason end)
           order by case b.reason when 'Same name' then 1 when 'Initials match' then 2 else 3 end, p.full_name), '[]'::jsonb)
    from (select * from best order by case reason when 'Same name' then 1 when 'Initials match' then 2 else 3 end limit 5) b
    join public.profiles p on p.id = b.id
$$;

-- Finds or adds a contractor by name (same name in another case or spacing
-- is the same contractor). Returns null for an empty name.
create or replace function private.contractor_for(p_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_id uuid;
begin
  if v_name is null or private.alias_key(v_name) is null then
    return null;
  end if;
  select id into v_id from public.contractors
   where company_id = private.default_company_id() and name_key = private.alias_key(v_name);
  if v_id is null then
    insert into public.contractors (name) values (left(v_name, 200))
    on conflict (company_id, name_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.contractors
       where company_id = private.default_company_id() and name_key = private.alias_key(v_name);
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function private.follow_merges(uuid) from public, anon;
revoke all on function private.name_match_reason(text, text) from public, anon;
revoke all on function private.name_candidates(text, uuid) from public, anon;
revoke all on function private.contractor_for(text) from public, anon, authenticated;
grant execute on function private.follow_merges(uuid) to authenticated, service_role;
grant execute on function private.name_match_reason(text, text) to authenticated, service_role;
grant execute on function private.name_candidates(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Each new People step line: saved spellings, possible matches, contractor
-- ---------------------------------------------------------------------------
create or replace function private.prepare_name_review()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_alias uuid;
  v_type text;
  v_contractor text;
begin
  -- A suggestion pointing at a merged person points at who they became.
  if new.suggested_profile_id is not null then
    new.suggested_profile_id := private.follow_merges(new.suggested_profile_id);
  end if;
  if new.profile_id is not null then
    new.profile_id := private.follow_merges(new.profile_id);
  end if;

  -- A spelling someone linked on an earlier upload.
  if new.suggested_profile_id is null and new.name_key not like 'ID:%' then
    select private.follow_merges(a.profile_id) into v_alias
      from public.person_aliases a
     where a.company_id = private.default_company_id() and a.alias_key = new.name_key;
    if v_alias is not null then
      new.suggested_profile_id := v_alias;
      new.profile_id := v_alias;
      new.decision := 'link';
      new.match_reason := 'Spelling saved for this person on an earlier upload';
    end if;
  end if;

  -- Say what kind of person the suggestion is.
  if new.suggested_profile_id is not null and new.match_reason = 'Same name as an existing employee' then
    select workforce_type into v_type from public.profiles where id = new.suggested_profile_id;
    new.match_reason := case v_type
      when 'permanent_employee' then 'Same name as an existing employee'
      when 'temporary_worker'   then 'Same name as a known temporary worker'
      when 'contract_worker'    then 'Same name as a known contract worker'
      when 'outsourced_worker'  then 'Same name as a known outsourced worker'
      else 'Same name as a person from an earlier upload' end;
  end if;

  -- Possible matches for a person to look at.
  if new.name_key not like 'ID:%' then
    new.candidates := private.name_candidates(new.name_key, new.suggested_profile_id);
  end if;

  -- Never add someone automatically when they may already exist.
  if new.decision = 'create' and jsonb_array_length(new.candidates) > 0 then
    new.decision := 'pending';
  end if;

  -- The contractor the sheet names for this person, if any.
  if new.contractor_name is null then
    select mode() within group (order by ir.details ->> 'contractor') into v_contractor
      from public.import_rows ir
     where ir.batch_id = new.batch_id and ir.name_key = new.name_key
       and nullif(btrim(ir.details ->> 'contractor'), '') is not null;
    new.contractor_name := left(nullif(btrim(v_contractor), ''), 200);
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_name_review() from public, anon, authenticated;

drop trigger if exists name_match_reviews_prepare on public.name_match_reviews;
create trigger name_match_reviews_prepare
  before insert on public.name_match_reviews
  for each row execute function private.prepare_name_review();

-- ---------------------------------------------------------------------------
-- 5. People step decisions, now with the kind of worker and contractor.
-- p_decisions: [{"name_key": "...", "decision": "link|create|skip|pending",
--                "profile_id": "...", "workforce_type": "...", "contractor": "..."}]
-- ---------------------------------------------------------------------------
create or replace function public.name_match_decide(p_batch uuid, p_decisions jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_d jsonb;
  v_decision text;
  v_profile uuid;
  v_type text;
  v_contractor text;
  v_n integer := 0;
begin
  if not private.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.import_batches where id = p_batch and status = 'staged') then
    raise exception 'This upload is not waiting for review' using errcode = '22023';
  end if;
  if jsonb_typeof(p_decisions) <> 'array' or jsonb_array_length(p_decisions) > 5000 then
    raise exception 'Decisions are not valid' using errcode = '22023';
  end if;
  for v_d in select value from jsonb_array_elements(p_decisions) loop
    v_decision := lower(coalesce(v_d ->> 'decision', ''));
    if v_decision not in ('link', 'create', 'skip', 'pending') then
      raise exception 'Unknown decision "%"', left(v_decision, 20) using errcode = '22023';
    end if;
    v_profile := null;
    v_type := null;
    v_contractor := null;
    if v_decision = 'link' then
      v_profile := private.try_uuid(v_d ->> 'profile_id');
      if v_profile is null or not exists (select 1 from public.profiles where id = v_profile) then
        raise exception 'Choose the employee to link to' using errcode = '22023';
      end if;
      v_profile := private.follow_merges(v_profile);
    elsif v_decision = 'create' then
      v_type := lower(coalesce(nullif(btrim(v_d ->> 'workforce_type'), ''), 'unknown'));
      if v_type not in ('permanent_employee', 'temporary_worker', 'contract_worker', 'outsourced_worker', 'unknown') then
        raise exception 'Unknown kind of worker "%"', left(v_type, 30) using errcode = '22023';
      end if;
      if v_type <> 'unknown' and not private.can_manage_workforce() then
        raise exception 'Only the Travel Desk or the Director can say what kind of worker someone is'
          using errcode = '42501';
      end if;
      v_contractor := nullif(btrim(regexp_replace(coalesce(v_d ->> 'contractor', ''), '\s+', ' ', 'g')), '');
      if v_contractor is not null and char_length(v_contractor) > 200 then
        raise exception 'Contractor name is too long' using errcode = '22001';
      end if;
    end if;
    update public.name_match_reviews
       set decision = v_decision, profile_id = v_profile,
           workforce_type = v_type,
           contractor_name = case when v_decision = 'create' then coalesce(v_contractor, contractor_name)
                                  else contractor_name end,
           decided_by = auth.uid(), decided_at = now()
     where batch_id = p_batch and name_key = v_d ->> 'name_key';
    if found then v_n := v_n + 1; end if;
  end loop;
  perform private.write_audit('name_match_decided', 'import_batches', p_batch::text, jsonb_build_object('decisions', v_n));
  return v_n;
end;
$$;

revoke all on function public.name_match_decide(uuid, jsonb) from public, anon;
grant execute on function public.name_match_decide(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. When an upload is saved: classify the people it added, remember the
--    spellings people were linked by.
-- ---------------------------------------------------------------------------
create or replace function private.finish_import_people()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rev public.name_match_reviews;
  v_contractor uuid;
begin
  for v_rev in
    select * from public.name_match_reviews
     where batch_id = new.id and decision in ('create', 'link') and profile_id is not null
  loop
    v_contractor := private.contractor_for(v_rev.contractor_name);
    if v_rev.decision = 'create' then
      -- Only people this upload added (same transaction): an existing person
      -- with the same employee ID is never reclassified.
      update public.profiles p
         set workforce_type      = coalesce(v_rev.workforce_type, 'unknown'),
             verification_status = case when jsonb_array_length(v_rev.candidates) > 0
                                        then 'possible_duplicate' else 'imported_unverified' end,
             source              = 'import',
             contractor_id       = coalesce(p.contractor_id, v_contractor)
       where p.id = v_rev.profile_id and p.created_at = now() and p.user_id is null;
    else
      -- The sheet names a contractor for a known non-employee who has none yet.
      if v_contractor is not null then
        update public.profiles p set contractor_id = v_contractor
         where p.id = v_rev.profile_id and p.contractor_id is null
           and p.workforce_type in ('temporary_worker', 'contract_worker', 'outsourced_worker', 'unknown');
      end if;
      -- Remember this spelling for the next upload.
      if v_rev.name_key not like 'ID:%'
         and v_rev.name_key is distinct from
             (select private.person_name_key(p.full_name) from public.profiles p where p.id = v_rev.profile_id) then
        insert into public.person_aliases (profile_id, alias, source, import_batch_id, created_by)
        select v_rev.profile_id, left(n, 200), 'import_link', new.id, auth.uid()
          from unnest(coalesce(v_rev.raw_names, array[v_rev.display_name])) n
         where private.person_name_key(n) = v_rev.name_key
         limit 1
        on conflict (company_id, alias_key) do nothing;
      end if;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.finish_import_people() from public, anon, authenticated;

drop trigger if exists import_batches_finish_people on public.import_batches;
create trigger import_batches_finish_people
  after update of status on public.import_batches
  for each row
  when (new.status = 'committed' and old.status is distinct from 'committed')
  execute function private.finish_import_people();
