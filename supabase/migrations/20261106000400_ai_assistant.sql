-- =============================================================================
-- Phase 7: AI assistant
--
-- The ai-assistant Edge Function answers travel questions. The model never
-- touches the database: it can only ask for one of a fixed list of tools, and
-- each tool runs a fixed query with the USER'S OWN token, so RLS limits the
-- answer exactly as it limits the screens.
--
-- Conversations belong to one user (Phase 1 policies). The browser may create
-- and delete its own conversations but can never write messages; the function
-- stores each question and answer through ai_record_exchange(), which only the
-- server (service_role) may call.
-- =============================================================================

alter table public.ai_messages
  add column tools_used text[] not null default '{}'
    check (cardinality(tools_used) <= 20);

create or replace function public.ai_record_exchange(
  p_user uuid, p_conversation uuid, p_question text, p_answer text, p_tools text[]
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tools text[] := coalesce(p_tools, '{}');
begin
  if not exists (select 1 from public.ai_conversations where id = p_conversation and user_id = p_user) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if p_question is null or char_length(btrim(p_question)) = 0 or char_length(p_question) > 2000 then
    raise exception 'Invalid question' using errcode = '22023';
  end if;
  if p_answer is null or char_length(p_answer) > 20000 then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_tools) t where t !~ '^[a-z_]{1,60}$') or cardinality(v_tools) > 20 then
    raise exception 'Invalid tool list' using errcode = '22023';
  end if;

  insert into public.ai_messages (conversation_id, role, content, created_at)
  values (p_conversation, 'user', p_question, now());
  insert into public.ai_messages (conversation_id, role, content, tools_used, created_at)
  values (p_conversation, 'assistant', p_answer, v_tools, now() + interval '1 millisecond');

  update public.ai_conversations
     set title = coalesce(title, left(regexp_replace(btrim(p_question), '\s+', ' ', 'g'), 80))
   where id = p_conversation;

  -- Tool names and counts only: the question and answer stay out of the log.
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (p_user, 'ai_question', 'ai_conversations', p_conversation::text,
          jsonb_build_object('tools', to_jsonb(v_tools), 'question_chars', char_length(p_question)));
end;
$$;
revoke all on function public.ai_record_exchange(uuid, uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.ai_record_exchange(uuid, uuid, text, text, text[]) to service_role;

-- The browser may rename (title only) its own conversations.
create policy ai_conversations_update on public.ai_conversations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
revoke update on public.ai_conversations from authenticated;
grant update (title) on public.ai_conversations to authenticated;
