-- =============================================================================
-- Tickets for approved travel requests
--
--  * documents.travel_request_id links an uploaded ticket to the request it
--    was booked for, so the employee sees it next to that request.
--  * Only the CEO, an Admin or the Travel Desk can attach a ticket, only to an
--    approved (or booked) request, and only in the folder of the employee who
--    sent that request.
--  * Employees already see every document in their own folder through the
--    existing documents_select policy (can_view_employee); nothing else is
--    opened up.
-- Safe to run more than once.
-- =============================================================================

alter table public.documents
  add column if not exists travel_request_id uuid references public.travel_requests (id) on delete set null;

create index if not exists documents_request_idx
  on public.documents (travel_request_id) where travel_request_id is not null;

create or replace function private.guard_document_request()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_employee uuid;
  v_status   text;
begin
  if new.travel_request_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.travel_request_id is not distinct from old.travel_request_id then
    return new;
  end if;
  if current_user = 'authenticated' and not private.is_staff() then
    raise exception 'Only the CEO, an Admin or the Travel Desk can add a ticket to a request' using errcode = '42501';
  end if;
  select r.employee_id, r.status::text into v_employee, v_status
    from public.travel_requests r where r.id = new.travel_request_id;
  if v_employee is null then
    raise exception 'That travel request was not found' using errcode = '22023';
  end if;
  if v_employee <> new.employee_id then
    raise exception 'The ticket must be filed under the employee who sent the request' using errcode = '22023';
  end if;
  if v_status not in ('approved', 'booked') then
    raise exception 'Tickets can only be added once the request is approved' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_request_guard on public.documents;
create trigger documents_request_guard
  before insert or update of travel_request_id on public.documents
  for each row execute function private.guard_document_request();

notify pgrst, 'reload schema';
