-- =============================================================================
-- Tickets with several passengers: adding a passenger who is not in the app
--
-- Builds on 20261115120000_workforce_import.sql. Adds one function; no table
-- or row is changed.
--
-- A group ticket (for example a train ticket for four people) is saved as a
-- group booking: one trip per passenger, the fare split across them. Each
-- passenger already in the app is matched by name in the browser. For a
-- passenger who is not, the upload calls workforce_add_person():
--  * the travel desk, the Travel Desk and the Director may call it;
--  * only the Travel Desk and the Director may say what kind of worker the
--    person is; anyone else adds them as unknown (as on the upload People step);
--  * if exactly one person already has that name, that person is returned and
--    nobody new is added;
--  * otherwise a person is added with an ID like NEW-1A2B3C4D, no login, and
--    the status imported_unverified, or possible_duplicate when someone on file
--    has a similar name (same rules as uploads);
--  * the contractor, when given, is found or added;
--  * written to the audit log.
--
-- Safe to run more than once.
-- =============================================================================

create or replace function public.workforce_add_person(p_name text, p_type text default 'unknown', p_contractor text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_key text;
  v_type text := lower(coalesce(nullif(btrim(p_type), ''), 'unknown'));
  v_same uuid[];
  v_code text;
  v_id uuid;
  v_candidates jsonb;
begin
  if not private.is_staff() then
    raise exception 'Only the travel desk, the Travel Desk or the Director can add people from a ticket' using errcode = '42501';
  end if;
  if v_type not in ('permanent_employee', 'temporary_worker', 'contract_worker', 'outsourced_worker', 'unknown') then
    raise exception 'Unknown kind of worker "%"', left(v_type, 30) using errcode = '22023';
  end if;
  if v_type <> 'unknown' and not private.can_manage_workforce() then
    raise exception 'Only the Travel Desk or the Director can say what kind of worker someone is' using errcode = '42501';
  end if;
  v_key := private.person_name_key(v_name);
  if v_name is null or v_key is null or char_length(v_name) > 200 then
    raise exception 'The passenger name could not be read' using errcode = '22023';
  end if;

  -- Already in the app under exactly this name (or a saved spelling): use them.
  select array_agg(distinct x.id) into v_same
    from (
      select p.id from public.profiles p
       where p.merged_into is null and private.person_name_key(p.full_name) = v_key
      union
      select private.follow_merges(a.profile_id) from public.person_aliases a
       where a.company_id = private.default_company_id() and a.alias_key = v_key
    ) x;
  if cardinality(v_same) = 1 then
    return v_same[1];
  end if;
  if cardinality(v_same) > 1 then
    raise exception 'More than one person is called %. Choose who it is.', v_name using errcode = '22023';
  end if;

  v_candidates := private.name_candidates(v_key, null);
  v_code := 'NEW-' || upper(substr(md5(v_key || clock_timestamp()::text), 1, 8));
  insert into public.profiles (employee_id, full_name, workforce_type, verification_status, source, contractor_id)
  values (v_code, left(v_name, 200), v_type,
          case when jsonb_array_length(v_candidates) > 0 then 'possible_duplicate' else 'imported_unverified' end,
          'import',
          case when v_type = 'permanent_employee' then null else private.contractor_for(p_contractor) end)
  returning id into v_id;

  perform private.write_audit('workforce_person_added', 'profiles', v_id::text,
    jsonb_build_object('from', 'ticket', 'workforce_type', v_type, 'possible_matches', jsonb_array_length(v_candidates)));
  return v_id;
end;
$$;

revoke all on function public.workforce_add_person(text, text, text) from public, anon;
grant execute on function public.workforce_add_person(text, text, text) to authenticated;
