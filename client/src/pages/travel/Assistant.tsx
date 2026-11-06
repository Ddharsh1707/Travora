import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, MessageSquarePlus, Send, ShieldCheck, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import {
  EXAMPLE_QUESTIONS, MAX_QUESTION, ask, deleteConversation, getMessages, listConversations, questionError, toolSummary,
  type ChatMessage, type Conversation,
} from "../../lib/data/assistant";
import { ErrorNotice, Loading, PageHeader, formatDate } from "./common";

/**
 * Chat with the travel assistant. Answers only ever cover what this user may
 * see: the assistant looks things up with their own permissions.
 */
export default function Assistant({ canSeeOthers }: { canSeeOthers: boolean }) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(() => {
    listConversations().then((c) => { setConversations(c); setError(""); }).catch((err) => setError(err.message));
  }, []);
  useEffect(loadConversations, [loadConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages, asking]);

  const open = (id: string) => {
    setActiveId(id);
    setLoadingMessages(true);
    getMessages(id)
      .then((m) => setMessages(m))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoadingMessages(false));
  };

  const startNew = () => { setActiveId(null); setMessages([]); setQuestion(""); };

  const submit = async (text: string) => {
    const problem = questionError(text);
    if (problem) { toast.error(problem); return; }
    const q = text.trim();
    const now = new Date().toISOString();
    setMessages((m) => [...m, { id: `local-${now}`, role: "user", content: q, created_at: now }]);
    setQuestion("");
    setAsking(true);
    try {
      const res = await ask(q, activeId);
      setMessages((m) => [...m, { id: `local-a-${now}`, role: "assistant", content: res.answer, created_at: new Date().toISOString(), tools_used: res.tools }]);
      if (!activeId) { setActiveId(res.conversationId); loadConversations(); }
      if (!res.saved) toast.warning("The answer could not be saved to your history.");
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== `local-${now}`));
      setQuestion(q);
      toast.error(err instanceof Error ? err.message : "The assistant could not answer right now.");
    } finally {
      setAsking(false);
    }
  };

  const remove = async (c: Conversation) => {
    if (!window.confirm(`Delete "${c.title ?? "this conversation"}"? This cannot be undone.`)) return;
    try {
      await deleteConversation(c.id);
      if (activeId === c.id) startNew();
      loadConversations();
      toast.success("Conversation deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the conversation.");
    }
  };

  const examples = canSeeOthers ? [...EXAMPLE_QUESTIONS.team, EXAMPLE_QUESTIONS.self[0]] : EXAMPLE_QUESTIONS.self;

  return (
    <div className="page-stack animate-page">
      <PageHeader
        eyebrow="Travel"
        title="Ask the assistant"
        description="Ask about trips, travel spend, requests and approvals in plain words. It only sees what you are allowed to see, and it cannot book or change anything."
        actions={<button type="button" className="button button-ghost" onClick={startNew}><MessageSquarePlus size={15} /> New chat</button>}
      />
      {error && <ErrorNotice message={error} onRetry={loadConversations} />}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] items-start">
        <aside className="panel p-3 min-w-0" aria-label="Your conversations">
          <span className="card-kicker">Your conversations</span>
          {!conversations ? <Loading /> : conversations.length === 0 ? (
            <p className="text-xs opacity-70 mt-2">Nothing yet. Your questions are saved here, visible only to you.</p>
          ) : (
            <ul className="mt-2 grid gap-1 max-h-[50vh] overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id} className="flex items-center gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => open(c.id)}
                    className={`flex-1 min-w-0 text-left rounded-md px-2 py-1.5 text-sm hover:bg-black/5 ${activeId === c.id ? "bg-black/5 font-semibold" : ""}`}
                    aria-current={activeId === c.id ? "true" : undefined}
                  >
                    <span className="block truncate">{c.title ?? "Untitled"}</span>
                    <span className="block text-xs opacity-60">{formatDate(c.created_at)}</span>
                  </button>
                  <button type="button" className="icon-button" onClick={() => remove(c)} aria-label={`Delete ${c.title ?? "conversation"}`}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="panel p-4 min-w-0 flex flex-col gap-3" aria-label="Chat">
          <div className="flex flex-col gap-3 min-h-[240px] max-h-[60vh] overflow-y-auto" aria-live="polite">
            {loadingMessages ? <Loading /> : messages.length === 0 ? (
              <div className="grid gap-3">
                <p className="text-sm opacity-80 flex items-center gap-2"><ShieldCheck size={16} className="text-teal-600" /> Try one of these:</p>
                <div className="flex flex-wrap gap-2">
                  {examples.map((e) => (
                    <button key={e} type="button" className="button button-ghost text-left" disabled={asking} onClick={() => submit(e)}>{e}</button>
                  ))}
                </div>
              </div>
            ) : messages.map((m) => (
              <div key={m.id} className={`flex gap-2 min-w-0 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && <Bot size={18} className="mt-1 shrink-0 text-teal-600" aria-hidden />}
                <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] min-w-0 ${m.role === "user" ? "bg-teal-700 text-white" : "bg-black/5"}`}>
                  {/* Plain text only: answers are never rendered as HTML. */}
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  {m.role === "assistant" && toolSummary(m.tools_used) && (
                    <div className="text-xs opacity-60 mt-1">{toolSummary(m.tools_used)}</div>
                  )}
                </div>
                {m.role === "user" && <User size={18} className="mt-1 shrink-0 opacity-60" aria-hidden />}
              </div>
            ))}
            {asking && <div className="flex gap-2 text-sm opacity-70"><Bot size={18} className="text-teal-600" aria-hidden /> Looking that up…</div>}
            <div ref={endRef} />
          </div>

          <form
            className="flex gap-2 items-end"
            onSubmit={(e) => { e.preventDefault(); if (!asking) submit(question); }}
          >
            <label className="field flex-1 min-w-0">
              <span className="sr-only">Your question</span>
              <textarea
                value={question}
                maxLength={MAX_QUESTION}
                rows={2}
                style={{ minHeight: 56 }}
                placeholder="For example: who is travelling to Delhi next week?"
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!asking) submit(question); }
                }}
                disabled={asking}
              />
            </label>
            <button type="submit" className="button button-primary" disabled={asking || !question.trim()} aria-label="Ask">
              <Send size={15} /> <span className="hidden sm:inline">Ask</span>
            </button>
          </form>
          <p className="text-xs opacity-60">Answers come from the company's travel records. Check important figures in Reports before you rely on them.</p>
        </section>
      </div>
    </div>
  );
}
