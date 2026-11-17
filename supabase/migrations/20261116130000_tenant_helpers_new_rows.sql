-- =============================================================================
-- Fix: adding a person failed with "You don't have permission to do that"
--
-- Part 1 of the company separation (20261116100000_tenant_isolation.sql) made
-- private.can_view_employee and private.can_view_bulk_booking look the record
-- up to check its company. When a record is being created, Postgres checks the
-- "who can see it" rule against the new row before that row can be looked up,
-- so the check failed. That blocked "Add person" (the app asks for the new id
-- back) for the Director and the Travel Desk.
--
-- What this does: the two helpers now refuse a record only when it belongs to
-- ANOTHER company. A brand-new row is still kept to the caller's company by the
-- "same company only" rule (tenant_isolation) and the company stamp trigger,
-- and a record of another company is refused exactly as before.
--
-- Who can do what: unchanged.
-- Safe to run more than once.
-- =============================================================================

create or replace function private.can_view_employee(target_employee uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select target_employee is not null
     and private.current_app_role() is not null
     and not exists (select 1 from public.profiles t
                      where t.id = target_employee
                        and t.company_id is distinct from private.current_company_id())
     and (
       target_employee = private.current_profile_id()
       or private.is_staff()
       or private.approver_scope_includes(target_employee)
     )
$$;

create or replace function private.can_view_bulk_booking(target uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.current_app_role() is not null
     and not exists (select 1 from public.bulk_bookings b
                      where b.id = target
                        and b.company_id is distinct from private.current_company_id())
     and (
       private.is_staff()
       or exists (select 1 from public.bulk_booking_members m
                   where m.bulk_booking_id = target and private.can_view_employee(m.employee_id))
     )
$$;
