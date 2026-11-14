-- =============================================================================
-- Temporary workforce, part 3: looking after people
--
-- Builds on 20261115100000_workforce_model.sql and
-- 20261115120000_workforce_import.sql. No existing row is changed by this
-- file; it only adds checked functions.
--
-- Reading (travel desk, Travel Desk and Director):
--  * workforce_list(filters, limit, offset): the worker directory, with trips,
--    first and last travel dates and recorded travel spend.
--  * workforce_detail(person): one person, with contractor, project, aliases,
--    trips (with costs), expenses, documents and merge history.
--
-- Changing (Travel Desk and Director only, who have the same powers since
-- 20261108000400_travel_desk_full_access.sql; private.can_manage_person() is
-- still checked, so any future limit on managing leaders applies here too):
--  * workforce_set_type, workforce_verify, workforce_alias_add,
--    workforce_alias_remove, workforce_set_contractor, workforce_set_project.
--  * workforce_merge / workforce_unmerge: two records of the same person.
--  * Marking someone inactive stays admin_set_active().
--
-- Money rules (used here and by the analytics in a later part):
--  * Costs come from cost_lines when a trip has them, otherwise from the
--    trip's own amount (scanned tickets and trips entered by hand).
--  * Gross = positive recorded amounts; credits = negative ones (refunds);
--    net = gross + credits. Each currency is kept apart; only the company's
--    base currency is added up. A blank cost is counted as missing, never
--    as 0. A 0 fare is kept as a zero-fare line.
--  * Cancelled trips are left out of spend and counted separately, as the
--    existing dashboards do.
--
-- Merging never deletes a trip, cost or document. It moves trips (with their
-- costs) and expense claims to the person kept, saves the old name as a
-- spelling of them, and records exactly what moved so it can be undone.
-- Documents stay where they are (their files live in the person's folder) and
-- are shown on the person kept. A person with a login, travel requests or
-- group bookings cannot be merged away.
--
-- Every change is written to the audit log.
-- Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Money per trip and currency, from authoritative records only
-- ---------------------------------------------------------------------------
create or replace function private.trip_money()
returns table (
  travel_record_id uuid, employee_id uuid, departure_date date, status text, project_id uuid,
  booking_type text, currency text, gross numeric, credits numeric,
  recorded_lines integer, zero_lines integer, missing_lines integer
)
language sql stable security invoker
set search_path = ''
as $$
  select r.id, r.employee_id, r.departure_date, r.status, r.project_id, r.booking_type::text, c.currency::text,
         coalesce(sum(c.amount) filter (where c.amount_state = 'recorded' and c.amount > 0), 0),
         coalesce(sum(c.amount) filter (where c.amount_state = 'recorded' and c.amount < 0), 0),
         (count(*) filter (where c.amount_state = 'recorded'))::integer,
         (count(*) filter (where c.amount_state = 'zero'))::integer,
         (count(*) filter (where c.amount_state = 'missing'))::integer
    from public.travel_records r
    join public.cost_lines c on c.travel_record_id = r.id
   group by r.id, c.currency
  union all
  select r.id, r.employee_id, r.departure_date, r.status, r.project_id, r.booking_type::text, r.currency::text,
         case when r.amount > 0 then r.amount else 0 end,
         0::numeric,
         (r.amount is not null and r.amount <> 0)::integer,
         (r.amount = 0)::integer,
         (r.amount is null)::integer
    from public.travel_records r
   where not exists (select 1 from public.cost_lines c where c.travel_record_id = r.id)
$$;

revoke all on function private.trip_money() from public, anon;
grant execute on function private.trip_money() to authenticated, service_role;

create or replace function private.require_workforce_viewer()
returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if not private.can_view_workforce() then
    raise exception 'Only the travel desk, the Travel Desk and the Director can see the workforce' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_workforce_manager(p_profile uuid)
returns public.profiles
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_p public.profiles;
begin
  if not private.can_manage_workforce() then
    raise exception 'Only the Travel Desk or the Director can change workforce records' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = p_profile;
  if not found then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  if not private.can_manage_person(p_profile) then
    raise exception 'You cannot change this person''s record' using errcode = '42501';
  end if;
  if v_p.merged_into is not null then
    raise exception 'This record was merged into another person. Open that person instead, or undo the merge.' using errcode = '22023';
  end if;
  return v_p;
end;
$$;

revoke all on function private.require_workforce_viewer() from public, anon;
revoke all on function private.require_workforce_manager(uuid) from public, anon;
grant execute on function private.require_workforce_viewer() to authenticated, service_role;
grant execute on function private.require_workforce_manager(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Worker directory
-- filters: {"type": "...", "status": "...", "contractor": uuid|"none",
--           "project": uuid|"none", "q": "name or code", "include_inactive": true,
--           "include_merged": true, "sort": "name|spend|trips|last_trip"}
-- ---------------------------------------------------------------------------
create or replace function public.workforce_list(p_filters jsonb default '{}'::jsonb, p_limit integer default 200, p_offset integer default 0)
returns table (
  id uuid, full_name text, employee_id text, department text, workforce_type text, verification_status text,
  source text, active boolean, has_login boolean, contractor_id uuid, contractor_name text,
  project_id uuid, project_name text, merged_into uuid, alias_count integer,
  trips integer, cancelled_trips integer, first_trip date, last_trip date,
  currency text, gross numeric, credits numeric, net numeric, missing_cost_lines integer, other_currency_trips integer,
  total_count bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_cur text := private.base_currency();
  v_q text := nullif(btrim(left(coalesce(f ->> 'q', ''), 80)), '');
begin
  perform private.require_workforce_viewer();
  return query
  with money as (
    select m.employee_id,
           count(distinct m.travel_record_id) filter (where m.status <> 'cancelled')::integer as trips,
           count(distinct m.travel_record_id) filter (where m.status = 'cancelled')::integer as cancelled_trips,
           min(m.departure_date) as first_trip,
           max(m.departure_date) as last_trip,
           coalesce(sum(m.gross) filter (where m.status <> 'cancelled' and m.currency = v_cur), 0) as gross,
           coalesce(sum(m.credits) filter (where m.status <> 'cancelled' and m.currency = v_cur), 0) as credits,
           coalesce(sum(m.missing_lines) filter (where m.status <> 'cancelled'), 0)::integer as missing,
           count(distinct m.travel_record_id) filter (where m.status <> 'cancelled' and m.currency <> v_cur)::integer as other_cur
      from private.trip_money() m
     group by m.employee_id
  ), people as (
    select p.*, c.name as c_name, pj.name as pj_name,
           (select count(*) from public.person_aliases a where a.profile_id = p.id)::integer as aliases,
           coalesce(mo.trips, 0) as mo_trips, coalesce(mo.cancelled_trips, 0) as mo_cancelled,
           mo.first_trip, mo.last_trip,
           coalesce(mo.gross, 0) as mo_gross, coalesce(mo.credits, 0) as mo_credits,
           coalesce(mo.missing, 0) as mo_missing, coalesce(mo.other_cur, 0) as mo_other
      from public.profiles p
      left join public.contractors c on c.id = p.contractor_id
      left join public.projects pj on pj.id = p.primary_project_id
      left join money mo on mo.employee_id = p.id
     where (coalesce(f ->> 'type', '') = '' or p.workforce_type = f ->> 'type'
            or (f ->> 'type' = 'non_permanent' and p.workforce_type <> 'permanent_employee'))
       and (coalesce(f ->> 'status', '') = '' or p.verification_status = f ->> 'status')
       and (coalesce(f ->> 'contractor', '') = ''
            or (f ->> 'contractor' = 'none' and p.contractor_id is null)
            or p.contractor_id = private.try_uuid(f ->> 'contractor'))
       and (coalesce(f ->> 'project', '') = ''
            or (f ->> 'project' = 'none' and p.primary_project_id is null)
            or p.primary_project_id = private.try_uuid(f ->> 'project'))
       and (coalesce((f ->> 'include_inactive')::boolean, false) or p.active)
       and (coalesce((f ->> 'include_merged')::boolean, false) or p.merged_into is null)
       and (v_q is null or p.full_name ilike '%' || v_q || '%' or p.employee_id ilike '%' || v_q || '%'
            or exists (select 1 from public.person_aliases a where a.profile_id = p.id and a.alias ilike '%' || v_q || '%'))
  )
  select pe.id, pe.full_name, pe.employee_id, pe.department, pe.workforce_type, pe.verification_status,
         pe.source, pe.active, pe.user_id is not null, pe.contractor_id, pe.c_name,
         pe.primary_project_id, pe.pj_name, pe.merged_into, pe.aliases,
         pe.mo_trips, pe.mo_cancelled, pe.first_trip, pe.last_trip,
         v_cur, pe.mo_gross, pe.mo_credits, pe.mo_gross + pe.mo_credits, pe.mo_missing, pe.mo_other,
         count(*) over ()
    from people pe
   order by
     case when f ->> 'sort' = 'spend' then pe.mo_gross + pe.mo_credits end desc nulls last,
     case when f ->> 'sort' = 'trips' then pe.mo_trips end desc nulls last,
     case when f ->> 'sort' = 'last_trip' then pe.last_trip end desc nulls last,
     lower(pe.full_name), pe.id
   limit greatest(1, least(coalesce(p_limit, 200), 1000))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- One person
-- ---------------------------------------------------------------------------
create or replace function public.workforce_detail(p_profile uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_p public.profiles;
  v_cur text := private.base_currency();
  v_ids uuid[];
begin
  perform private.require_workforce_viewer();
  select * into v_p from public.profiles where id = p_profile;
  if not found then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;
  -- This person plus everyone merged into them (their documents stay filed under the old record).
  with recursive m as (
    select v_p.id as id
    union
    select p.id from public.profiles p join m on p.merged_into = m.id
  )
  select array_agg(id) into v_ids from m;

  return jsonb_build_object(
    'person', jsonb_build_object(
      'id', v_p.id, 'full_name', v_p.full_name, 'employee_id', v_p.employee_id, 'department', v_p.department,
      'designation', v_p.designation, 'email', v_p.email, 'workforce_type', v_p.workforce_type,
      'verification_status', v_p.verification_status, 'source', v_p.source, 'active', v_p.active,
      'has_login', v_p.user_id is not null, 'work_location', v_p.work_location, 'contact_phone', v_p.contact_phone,
      'merged_into', v_p.merged_into, 'created_at', v_p.created_at,
      'can_manage', private.can_manage_workforce() and private.can_manage_person(v_p.id)),
    'contractor', (select jsonb_build_object('id', c.id, 'name', c.name) from public.contractors c where c.id = v_p.contractor_id),
    'project', (select jsonb_build_object('id', pj.id, 'name', pj.name) from public.projects pj where pj.id = v_p.primary_project_id),
    'base_currency', v_cur,
    'aliases', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'alias', a.alias, 'source', a.source, 'created_at', a.created_at)
                                          order by a.created_at)
                           from public.person_aliases a where a.profile_id = v_p.id), '[]'::jsonb),
    'trips', coalesce((select jsonb_agg(t order by (t ->> 'departure_date') desc) from (
        select jsonb_build_object(
                 'id', r.id, 'departure_date', r.departure_date, 'return_date', r.return_date,
                 'origin', r.origin, 'destination', r.destination, 'booking_type', r.booking_type,
                 'provider', r.airline_or_provider, 'booking_reference', r.booking_reference, 'status', r.status,
                 'source', r.source, 'project_id', r.project_id, 'project_name', coalesce(pj.name, r.project_raw),
                 'import_batch_id', r.import_batch_id, 'source_sheet', r.source_sheet, 'source_row', r.source_row,
                 'money', coalesce((select jsonb_agg(jsonb_build_object('currency', m.currency, 'gross', m.gross, 'credits', m.credits,
                                                                         'net', m.gross + m.credits, 'zero_lines', m.zero_lines,
                                                                         'missing_lines', m.missing_lines))
                                      from private.trip_money() m where m.travel_record_id = r.id), '[]'::jsonb)) as t
          from public.travel_records r
          left join public.projects pj on pj.id = r.project_id
         where r.employee_id = v_p.id
         order by r.departure_date desc
         limit 1000) x), '[]'::jsonb),
    'totals', (select jsonb_build_object(
                 'trips', count(distinct m.travel_record_id) filter (where m.status <> 'cancelled'),
                 'cancelled_trips', count(distinct m.travel_record_id) filter (where m.status = 'cancelled'),
                 'first_trip', min(m.departure_date), 'last_trip', max(m.departure_date),
                 'gross', coalesce(sum(m.gross) filter (where m.status <> 'cancelled' and m.currency = v_cur), 0),
                 'credits', coalesce(sum(m.credits) filter (where m.status <> 'cancelled' and m.currency = v_cur), 0),
                 'net', coalesce(sum(m.gross + m.credits) filter (where m.status <> 'cancelled' and m.currency = v_cur), 0),
                 'missing_cost_lines', coalesce(sum(m.missing_lines) filter (where m.status <> 'cancelled'), 0),
                 'zero_fare_lines', coalesce(sum(m.zero_lines) filter (where m.status <> 'cancelled'), 0),
                 'other_currencies', coalesce((select jsonb_agg(jsonb_build_object('currency', o.currency, 'net', o.net))
                                                 from (select m2.currency, sum(m2.gross + m2.credits) as net
                                                         from private.trip_money() m2
                                                        where m2.employee_id = v_p.id and m2.status <> 'cancelled' and m2.currency <> v_cur
                                                        group by m2.currency) o), '[]'::jsonb))
               from private.trip_money() m where m.employee_id = v_p.id),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', e.id, 'expense_date', e.expense_date, 'category', e.category, 'description', e.description,
                   'amount', e.amount, 'currency', e.currency, 'status', e.status) order by e.expense_date desc)
                   from public.expenses e where e.employee_id = v_p.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', d.id, 'original_filename', d.original_filename, 'document_type', d.document_type,
                   'storage_path', d.storage_path, 'created_at', d.created_at, 'travel_record_id', d.travel_record_id,
                   'filed_under', d.employee_id) order by d.created_at desc)
                   from public.documents d where d.employee_id = any (v_ids)), '[]'::jsonb),
    'upload_batches', coalesce((select jsonb_agg(distinct r.import_batch_id) from public.travel_records r
                                 where r.employee_id = v_p.id and r.import_batch_id is not null), '[]'::jsonb),
    'merges', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', g.id, 'from_profile', g.from_profile, 'into_profile', g.into_profile,
                   'from_name', pf.full_name, 'into_name', pi.full_name, 'evidence', g.evidence,
                   'moved', g.moved, 'merged_at', g.merged_at, 'reversed_at', g.reversed_at) order by g.merged_at desc)
                   from public.identity_merges g
                   join public.profiles pf on pf.id = g.from_profile
                   join public.profiles pi on pi.id = g.into_profile
                  where g.from_profile = v_p.id or g.into_profile = v_p.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at, 'metadata', l.metadata)
                                          order by l.created_at desc)
                           from (select * from public.audit_logs l
                                  where l.entity_type = 'profiles' and l.entity_id = v_p.id::text
                                    and l.action like 'workforce_%'
                                  order by l.created_at desc limit 100) l), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Changes to one person
-- ---------------------------------------------------------------------------
create or replace function public.workforce_set_type(p_profile uuid, p_type text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_p public.profiles := private.require_workforce_manager(p_profile);
  v_type text := lower(btrim(coalesce(p_type, '')));
begin
  if v_type not in ('permanent_employee', 'temporary_worker', 'contract_worker', 'outsourced_worker', 'unknown') then
    raise exception 'Choose what kind of worker this is' using errcode = '22023';
  end if;
  if v_type <> 'permanent_employee' and v_p.user_id is not null then
    raise exception 'This person has a login. Only permanent employees can have one, so they stay a permanent employee.'
      using errcode = '22023';
  end if;
  if v_type = v_p.workforce_type then
    return;
  end if;
  update public.profiles set workforce_type = v_type where id = p_profile;
  perform private.write_audit('workforce_type_changed', 'profiles', p_profile::text,
    jsonb_build_object('from', v_p.workforce_type, 'to', v_type));
end;
$$;

create or replace function public.workforce_verify(p_profile uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_p public.profiles := private.require_workforce_manager(p_profile);
begin
  if v_p.verification_status = 'verified' then
    return;
  end if;
  update public.profiles set verification_status = 'verified' where id = p_profile;
  perform private.write_audit('workforce_verified', 'profiles', p_profile::text,
    jsonb_build_object('from', v_p.verification_status));
end;
$$;

create or replace function public.workforce_alias_add(p_profile uuid, p_alias text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_p public.profiles := private.require_workforce_manager(p_profile);
  v_alias text := nullif(btrim(regexp_replace(coalesce(p_alias, ''), '\s+', ' ', 'g')), '');
  v_key text := private.person_name_key(v_alias);
  v_owner uuid;
  v_id uuid;
begin
  if v_alias is null or v_key is null or char_length(v_alias) > 200 then
    raise exception 'Type the other spelling of the name' using errcode = '22023';
  end if;
  if v_key = private.person_name_key(v_p.full_name) then
    raise exception 'That is already this person''s name' using errcode = '22023';
  end if;
  select profile_id into v_owner from public.person_aliases
   where company_id = private.default_company_id() and alias_key = v_key;
  if v_owner = p_profile then
    raise exception 'This spelling is already saved for this person' using errcode = '22023';
  elsif v_owner is not null then
    raise exception 'This spelling already belongs to someone else. Merge the two people if they are the same person.'
      using errcode = '22023';
  end if;
  insert into public.person_aliases (profile_id, alias, source) values (p_profile, v_alias, 'manual')
  returning id into v_id;
  perform private.write_audit('workforce_alias_added', 'profiles', p_profile::text, jsonb_build_object('alias_id', v_id));
  return v_id;
end;
$$;

create or replace function public.workforce_alias_remove(p_alias uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if not private.can_manage_workforce() then
    raise exception 'Only the Travel Desk or the Director can change workforce records' using errcode = '42501';
  end if;
  select profile_id into v_profile from public.person_aliases where id = p_alias;
  if v_profile is null then
    raise exception 'Spelling not found' using errcode = 'P0002';
  end if;
  perform private.require_workforce_manager(v_profile);
  delete from public.person_aliases where id = p_alias;
  perform private.write_audit('workforce_alias_removed', 'profiles', v_profile::text, jsonb_build_object('alias_id', p_alias));
end;
$$;

-- Empty name clears the contractor.
create or replace function public.workforce_set_contractor(p_profile uuid, p_contractor text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_p public.profiles := private.require_workforce_manager(p_profile);
  v_name text := nullif(btrim(regexp_replace(coalesce(p_contractor, ''), '\s+', ' ', 'g')), '');
  v_id uuid;
begin
  if v_name is not null and char_length(v_name) > 200 then
    raise exception 'Contractor name is too long' using errcode = '22001';
  end if;
  if v_name is not null and v_p.workforce_type = 'permanent_employee' then
    raise exception 'Permanent employees have no contractor. Change the kind of worker first.' using errcode = '22023';
  end if;
  v_id := private.contractor_for(v_name);
  if v_id is not distinct from v_p.contractor_id then
    return v_id;
  end if;
  update public.profiles set contractor_id = v_id where id = p_profile;
  perform private.write_audit('workforce_contractor_set', 'profiles', p_profile::text,
    jsonb_build_object('from', v_p.contractor_id, 'to', v_id));
  return v_id;
end;
$$;

-- A project only on evidence: the note is required and kept in the audit log.
create or replace function public.workforce_set_project(p_profile uuid, p_project uuid, p_evidence text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_p public.profiles := private.require_workforce_manager(p_profile);
  v_note text := nullif(btrim(coalesce(p_evidence, '')), '');
begin
  if p_project is not null then
    if not exists (select 1 from public.projects where id = p_project) then
      raise exception 'Project not found' using errcode = 'P0002';
    end if;
    if v_note is null or char_length(v_note) < 3 then
      raise exception 'Say why this person belongs to the project (for example the work order or the sheet)' using errcode = '22023';
    end if;
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22001';
  end if;
  if p_project is not distinct from v_p.primary_project_id then
    return;
  end if;
  update public.profiles set primary_project_id = p_project where id = p_profile;
  perform private.write_audit('workforce_project_set', 'profiles', p_profile::text,
    jsonb_build_object('from', v_p.primary_project_id, 'to', p_project, 'evidence', v_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Merge two records of the same person into p_into
-- ---------------------------------------------------------------------------
create or replace function public.workforce_merge(p_from uuid, p_into uuid, p_evidence text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_from public.profiles;
  v_into public.profiles;
  v_note text := nullif(btrim(coalesce(p_evidence, '')), '');
  v_conflicts integer;
  v_trips uuid[];
  v_expenses uuid[];
  v_aliases uuid[];
  v_documents uuid[];
  v_new_alias uuid;
  v_merge uuid;
begin
  if not private.can_manage_workforce() then
    raise exception 'Only the Travel Desk or the Director can change workforce records' using errcode = '42501';
  end if;
  if p_from is null or p_into is null or p_from = p_into then
    raise exception 'Choose two different people' using errcode = '22023';
  end if;
  v_from := private.require_workforce_manager(p_from);
  v_into := private.require_workforce_manager(p_into);
  if v_note is null or char_length(v_note) < 3 then
    raise exception 'Say why these are the same person (for example the same phone number or ID card)' using errcode = '22023';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the note under 2000 characters' using errcode = '22001';
  end if;
  if v_from.user_id is not null then
    raise exception '% has a login and cannot be merged away. Merge the other record into them instead.', v_from.full_name
      using errcode = '22023';
  end if;
  if exists (select 1 from public.travel_requests where employee_id = p_from) then
    raise exception '% has travel requests and cannot be merged away. Merge the other record into them instead.', v_from.full_name
      using errcode = '22023';
  end if;
  if exists (select 1 from public.bulk_booking_members where employee_id = p_from) then
    raise exception '% is on a group booking and cannot be merged away. Merge the other record into them instead.', v_from.full_name
      using errcode = '22023';
  end if;

  -- The same booking (date and PNR) on both people: a person must decide.
  select count(*) into v_conflicts
    from public.travel_records a
    join public.travel_records b
      on b.employee_id = p_into and b.departure_date = a.departure_date and b.booking_reference = a.booking_reference
   where a.employee_id = p_from and a.booking_reference is not null;
  if v_conflicts > 0 then
    raise exception 'Both people have % booking(s) with the same date and PNR. Check those trips before merging.', v_conflicts
      using errcode = '23505';
  end if;

  -- Lock the two people in a fixed order so two merges cannot cross.
  perform 1 from public.profiles where id in (p_from, p_into) order by id for update;

  select coalesce(array_agg(id), '{}') into v_trips from public.travel_records where employee_id = p_from;
  select coalesce(array_agg(id), '{}') into v_expenses from public.expenses where employee_id = p_from;
  select coalesce(array_agg(id), '{}') into v_aliases from public.person_aliases where profile_id = p_from;
  select coalesce(array_agg(id), '{}') into v_documents from public.documents where employee_id = p_from;

  update public.travel_records set employee_id = p_into where id = any (v_trips);
  update public.expenses set employee_id = p_into where id = any (v_expenses);
  update public.person_aliases set profile_id = p_into where id = any (v_aliases);

  -- The old name becomes a spelling of the person kept.
  if private.person_name_key(v_from.full_name) is not null
     and private.person_name_key(v_from.full_name) is distinct from private.person_name_key(v_into.full_name) then
    insert into public.person_aliases (profile_id, alias, source)
    values (p_into, left(v_from.full_name, 200), 'merge')
    on conflict (company_id, alias_key) do nothing
    returning id into v_new_alias;
  end if;

  update public.profiles
     set merged_into = p_into, verification_status = 'merged', active = false
   where id = p_from;

  insert into public.identity_merges (from_profile, into_profile, moved, evidence)
  values (p_from, p_into,
          jsonb_build_object(
            'travel_records', to_jsonb(v_trips),
            'expenses', to_jsonb(v_expenses),
            'aliases', to_jsonb(v_aliases),
            'alias_added', v_new_alias,
            'documents_kept', to_jsonb(v_documents),
            'previous', jsonb_build_object('verification_status', v_from.verification_status, 'active', v_from.active)),
          v_note)
  returning id into v_merge;

  perform private.write_audit('workforce_merged', 'profiles', p_from::text,
    jsonb_build_object('merge_id', v_merge, 'into', p_into, 'trips', cardinality(v_trips), 'expenses', cardinality(v_expenses)));
  perform private.write_audit('workforce_merged', 'profiles', p_into::text,
    jsonb_build_object('merge_id', v_merge, 'from', p_from, 'trips', cardinality(v_trips), 'expenses', cardinality(v_expenses)));
  return v_merge;
end;
$$;

-- Undo a merge: what moved goes back, the old record comes back as it was.
create or replace function public.workforce_unmerge(p_merge uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_m public.identity_merges;
  v_from public.profiles;
  v_conflicts integer;
begin
  if not private.can_manage_workforce() then
    raise exception 'Only the Travel Desk or the Director can change workforce records' using errcode = '42501';
  end if;
  select * into v_m from public.identity_merges where id = p_merge for update;
  if not found then
    raise exception 'Merge not found' using errcode = 'P0002';
  end if;
  if v_m.reversed_at is not null then
    raise exception 'This merge was already undone' using errcode = '22023';
  end if;
  if not private.can_manage_person(v_m.from_profile) or not private.can_manage_person(v_m.into_profile) then
    raise exception 'You cannot change these people''s records' using errcode = '42501';
  end if;
  select * into v_from from public.profiles where id = v_m.from_profile for update;
  if v_from.merged_into is distinct from v_m.into_profile then
    raise exception 'This record has changed since the merge, so it cannot be undone automatically' using errcode = '22023';
  end if;

  -- Moving the trips back must not collide with a booking the old record has now.
  select count(*) into v_conflicts
    from public.travel_records a
    join public.travel_records b
      on b.employee_id = v_m.from_profile and b.departure_date = a.departure_date and b.booking_reference = a.booking_reference
   where a.id in (select (x)::uuid from jsonb_array_elements_text(v_m.moved -> 'travel_records') x)
     and a.booking_reference is not null;
  if v_conflicts > 0 then
    raise exception 'Some trips cannot be moved back because the same booking is recorded twice' using errcode = '23505';
  end if;

  update public.travel_records set employee_id = v_m.from_profile
   where employee_id = v_m.into_profile
     and id in (select (x)::uuid from jsonb_array_elements_text(v_m.moved -> 'travel_records') x);
  update public.expenses set employee_id = v_m.from_profile
   where employee_id = v_m.into_profile
     and id in (select (x)::uuid from jsonb_array_elements_text(v_m.moved -> 'expenses') x);
  update public.person_aliases set profile_id = v_m.from_profile
   where profile_id = v_m.into_profile
     and id in (select (x)::uuid from jsonb_array_elements_text(v_m.moved -> 'aliases') x);
  if v_m.moved ->> 'alias_added' is not null then
    delete from public.person_aliases where id = (v_m.moved ->> 'alias_added')::uuid;
  end if;

  update public.profiles
     set merged_into = null,
         verification_status = coalesce(v_m.moved -> 'previous' ->> 'verification_status', 'imported_unverified'),
         active = coalesce((v_m.moved -> 'previous' ->> 'active')::boolean, true)
   where id = v_m.from_profile;

  update public.identity_merges set reversed_at = now(), reversed_by = auth.uid() where id = p_merge;

  perform private.write_audit('workforce_unmerged', 'profiles', v_m.from_profile::text,
    jsonb_build_object('merge_id', p_merge, 'into', v_m.into_profile));
  perform private.write_audit('workforce_unmerged', 'profiles', v_m.into_profile::text,
    jsonb_build_object('merge_id', p_merge, 'from', v_m.from_profile));
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.workforce_list(jsonb, integer, integer) from public, anon;
revoke all on function public.workforce_detail(uuid) from public, anon;
revoke all on function public.workforce_set_type(uuid, text) from public, anon;
revoke all on function public.workforce_verify(uuid) from public, anon;
revoke all on function public.workforce_alias_add(uuid, text) from public, anon;
revoke all on function public.workforce_alias_remove(uuid) from public, anon;
revoke all on function public.workforce_set_contractor(uuid, text) from public, anon;
revoke all on function public.workforce_set_project(uuid, uuid, text) from public, anon;
revoke all on function public.workforce_merge(uuid, uuid, text) from public, anon;
revoke all on function public.workforce_unmerge(uuid) from public, anon;
grant execute on function public.workforce_list(jsonb, integer, integer) to authenticated;
grant execute on function public.workforce_detail(uuid) to authenticated;
grant execute on function public.workforce_set_type(uuid, text) to authenticated;
grant execute on function public.workforce_verify(uuid) to authenticated;
grant execute on function public.workforce_alias_add(uuid, text) to authenticated;
grant execute on function public.workforce_alias_remove(uuid) to authenticated;
grant execute on function public.workforce_set_contractor(uuid, text) to authenticated;
grant execute on function public.workforce_set_project(uuid, uuid, text) to authenticated;
grant execute on function public.workforce_merge(uuid, uuid, text) to authenticated;
grant execute on function public.workforce_unmerge(uuid) to authenticated;
