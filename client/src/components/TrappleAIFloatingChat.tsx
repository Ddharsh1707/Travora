import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Sparkles,
  Send,
  Plus,
  Minus,
  X,
  Maximize2,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  AlertCircle,
  CornerDownLeft,
  Bot,
  RotateCcw
} from "lucide-react";
import { Streamdown } from "streamdown";
import {
  AuthUser,
  Role,
  aiAssistantApi,
  AIMessageItem,
  AIChatResult
} from "../lib/api";
import { isSupabaseEnabled } from "../lib/supabase";
import { ask as askSupabase, getMessages as getSupabaseMessages, listConversations, type RecordSet } from "../lib/data/assistant";
import { AnswerDownloads } from "./AnswerDownloads";

/** One chat bubble. Supabase answers carry the records behind them, for downloads. */
type ChatItem = Omit<AIMessageItem, "id" | "conversationId"> & { id: number | string; conversationId: number | string; records?: RecordSet[] };

interface TrappleAIFloatingChatProps {
  user: AuthUser;
  role: Role;
  currentPath: string;
}

const HIDE_KEY = "trapple-ai-launcher-hidden";

export function TrappleAIFloatingChat({ user, role, currentPath }: TrappleAIFloatingChatProps) {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  // The small X on the launcher hides it; "Ask AI" in the top bar brings it back.
  const [isHidden, setIsHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
  });
  const setHidden = (hide: boolean) => {
    setIsHidden(hide);
    try { if (hide) localStorage.setItem(HIDE_KEY, "1"); else localStorage.removeItem(HIDE_KEY); } catch { /* storage blocked */ }
  };
  const [activeConversationId, setActiveConversationId] = useState<number | string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<number | string | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, "THUMBS_UP" | "THUMBS_DOWN">>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isPrivileged =
    role === "ADMIN" ||
    role === "COMPANY_ADMIN" ||
    role === "PLATFORM_ADMIN" ||
    role === "TRAVEL_DESK" ||
    role === "APPROVER";

  // Derive human-readable current module name from current path
  const getModuleName = (path: string) => {
    if (path.includes("spend-reports")) return "Travel Spend Reports";
    if (path.includes("excel-import")) return "Excel Import & History";
    if (path.includes("users")) return "User Management";
    if (path.includes("bookings")) return "Booking Desk";
    if (path.includes("bulk-bookings")) return "Bulk & Group Bookings";
    if (path.includes("cancellations")) return "Cancellations";
    if (path.includes("expenses")) return "Expense Management";
    if (path.includes("journeys")) return "My Journeys";
    if (path.includes("calendar")) return "Travel Calendar";
    if (path.includes("plan-trip")) return "Trip Planner";
    if (path.includes("approvals")) return "Approvals";
    if (path.includes("reports")) return "Reports";
    if (path === "/employee" || path === "/approver" || path === "/travel-desk" || path === "/admin") return "Dashboard Overview";
    return "Operations Workspace";
  };

  const currentModule = getModuleName(currentPath);

  // Suggestion prompts tailored to user role and current view
  const isDirectorOrDesk = role === "ADMIN" || role === "COMPANY_ADMIN" || role === "PLATFORM_ADMIN";
  const suggestionChips = isSupabaseEnabled && isDirectorOrDesk
    ? [
        { label: "Company overview this month", prompt: "Give me a company overview for this month: employees, requests, tickets and spend." },
        { label: "Pending travel requests", prompt: "List all pending travel requests with employee, route, date and estimated cost." },
        { label: "Top spenders this financial year", prompt: "Who spent the most this financial year, claims and trips together? Show the top 10." },
        { label: "Spend by project", prompt: "Show total spend by project this financial year." },
        { label: "Approved requests without a ticket", prompt: "Which approved travel requests do not have a ticket attached yet?" },
        { label: "Employees without a login", prompt: "List current employees who do not have a login yet." },
        { label: "Excel uploads this month", prompt: "Which Excel sheets were uploaded this month and what did they add?" },
      ]
    : isPrivileged
    ? [
        { label: "Executive Net Spend", prompt: "What is our company total net spend, gross spend, and credit notes deducted?" },
        { label: "Project Spend Analysis", prompt: "Show travel expenditure allocated across projects and cost centers." },
        { label: "Credit Notes & Refunds", prompt: "List ticket cancellation credit notes and refund amounts in our ledger." },
        { label: "Top Routes & Carriers", prompt: "What are our most frequent airline flight routes and carriers?" },
        { label: "Pending Approvals", prompt: "Are there any travel requests or employee expenses awaiting sign-off?" },
      ]
    : [
        { label: "My Travel Summary", prompt: "Summarize my corporate travel history, upcoming trips, and total spend." },
        { label: "Corporate Travel Policy", prompt: "What are our company rules and budget limits for flights and hotels?" },
        { label: "Popular Routes", prompt: "What are the common corporate flight sectors in our organization?" },
      ];

  // Listen for global custom event to open chat (e.g. from CommandPalette)
  useEffect(() => {
    const handleOpen = () => {
      setIsHidden(false);
      try { localStorage.removeItem(HIDE_KEY); } catch { /* storage blocked */ }
      setIsOpen(true);
      setIsMinimized(false);
    };
    window.addEventListener("open-trapple-ai", handleOpen);
    return () => window.removeEventListener("open-trapple-ai", handleOpen);
  }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen, isMinimized]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen, isMinimized]);

  // Auto load recent conversation if empty
  useEffect(() => {
    if (isOpen && messages.length === 0 && !activeConversationId) {
      loadLatestConversation();
    }
  }, [isOpen]);

  const loadLatestConversation = async () => {
    if (isSupabaseEnabled) {
      try {
        const convs = await listConversations();
        if (convs.length > 0) {
          setActiveConversationId(convs[0].id);
          const msgs = await getSupabaseMessages(convs[0].id);
          setMessages(msgs.map((m) => ({ id: m.id, conversationId: convs[0].id, senderType: m.role === "user" ? "USER" : "ASSISTANT", content: m.content, createdAt: m.created_at })));
        }
      } catch {
        // No earlier conversations, or not signed in yet.
      }
      return;
    }
    try {
      const res = await aiAssistantApi.getConversations(0, 1);
      if (res && res.content && res.content.length > 0) {
        const latest = res.content[0];
        setActiveConversationId(latest.id);
        const msgs = await aiAssistantApi.getMessages(latest.id);
        setMessages(msgs || []);
      }
    } catch {
      // Clean fallback if no prior conversations
    }
  };

  const handleStartNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setErrorBanner(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputPrompt).trim();
    if (!textToSend || isLoading) return;

    setInputPrompt("");
    setErrorBanner(null);
    setIsLoading(true);

    // Optimistically add user message to feed
    const tempUserMsg: ChatItem = {
      id: Date.now(),
      conversationId: activeConversationId || 0,
      senderType: "USER",
      content: textToSend,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    if (isSupabaseEnabled) {
      try {
        const res = await askSupabase(textToSend, typeof activeConversationId === "string" ? activeConversationId : null);
        setActiveConversationId(res.conversationId);
        setMessages((prev) => [...prev, {
          id: `a-${Date.now()}`, conversationId: res.conversationId, senderType: "ASSISTANT", content: res.answer, createdAt: new Date().toISOString(), records: res.records,
        }]);
      } catch (err: unknown) {
        setErrorBanner(err instanceof Error ? err.message : "Unable to reach Trapple AI assistant. Please try again.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const clientContext = {
        currentPage: currentPath,
        currentModule: currentModule,
        userRole: role,
        username: user.username,
      };

      const result: AIChatResult = await aiAssistantApi.chat(
        textToSend,
        typeof activeConversationId === "number" ? activeConversationId : null,
        clientContext
      );

      if (!activeConversationId && result.conversationId) {
        setActiveConversationId(result.conversationId);
      }

      const assistantMsg: ChatItem = {
        id: result.messageId || Date.now(),
        conversationId: result.conversationId,
        senderType: "ASSISTANT",
        content: result.answerText,
        structuredData: result.structuredData,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setErrorBanner(err.message || "Unable to reach Trapple AI assistant. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyText = (text: string, msgId: number | string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleFeedback = async (msgId: number | string, rating: "THUMBS_UP" | "THUMBS_DOWN") => {
    try {
      if (typeof msgId === "number" && !isSupabaseEnabled) await aiAssistantApi.sendFeedback(msgId, rating);
      setFeedbackState((prev) => ({ ...prev, [msgId]: rating }));
    } catch (e) {
      console.warn("Feedback submission error", e);
    }
  };

  const formatINR = (val?: number | string) => {
    if (val === undefined || val === null) return "₹0.00";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "₹0.00";
    return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const rolePrefix = role.toLowerCase().replace("_", "-");
  const fullPageUrl = isSupabaseEnabled ? "/travel/assistant" : `/${role === "ADMIN" || role === "COMPANY_ADMIN" || role === "PLATFORM_ADMIN" ? "admin" : rolePrefix}/ai-assistant`;

  // 1. MINIMIZED FLOATING BAR STATE
  if (isOpen && isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-slate-900/95 dark:bg-slate-900 border border-slate-700/80 shadow-2xl text-slate-100 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 hover:text-emerald-400 transition-colors cursor-pointer text-left"
        >
          <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Sparkles size={13} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <span className="text-xs font-semibold">Trapple AI</span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">({messages.length} messages)</span>
        </button>
        <div className="w-px h-4 bg-slate-700" />
        <button
          onClick={() => setIsMinimized(false)}
          title="Restore chat window"
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <Maximize2 size={13} />
        </button>
        <button
          onClick={() => {
            setIsMinimized(false);
            setIsOpen(false);
          }}
          title="Close chat"
          className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  // 2. OPEN FLOATING CHAT PANEL
  if (isOpen) {
    return (
      <div
        className="fixed bottom-6 right-6 z-50 w-[440px] max-w-[calc(100vw-1.5rem)] h-[620px] max-h-[calc(100vh-4.5rem)] max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-14 max-sm:w-auto max-sm:h-auto rounded-2xl bg-slate-950/95 dark:bg-slate-900 border border-slate-800 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden text-slate-100 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-label="Trapple AI Assistant Chat"
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-sm shrink-0">
              <Sparkles size={16} />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white tracking-tight">Trapple AI</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  {role.replace("_", " ")}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Context: {currentModule}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 text-slate-400">
            <button
              onClick={handleStartNewChat}
              title="New Conversation"
              className="p-1.5 rounded-lg hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Plus size={15} />
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                setLocation(fullPageUrl);
              }}
              title="Expand to Full Page Analysis"
              className="p-1.5 rounded-lg hover:text-white hover:bg-slate-800 transition-colors hidden sm:inline-flex"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={() => setIsMinimized(true)}
              title="Minimize"
              className="p-1.5 rounded-lg hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Minus size={15} />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              title="Close"
              className="p-1.5 rounded-lg hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Panel Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {errorBanner && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs">
              <AlertCircle size={15} className="shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1 text-[11.5px] leading-relaxed">{errorBanner}</div>
              <button
                onClick={() => setErrorBanner(null)}
                className="text-red-400 hover:text-red-200 p-0.5"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Empty Conversation Welcome State */}
          {messages.length === 0 && !isLoading && (
            <div className="py-4 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 text-center space-y-2">
                <div className="inline-flex p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-1">
                  <Bot size={22} />
                </div>
                <h4 className="text-sm font-semibold text-white">
                  Welcome, {user.username}!
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  {isSupabaseEnabled && isDirectorOrDesk
                    ? "Ask anything about employees, travel requests, tickets, trips, expense claims, projects and Excel uploads. Every answer can be downloaded as Excel, CSV or PDF."
                    : "I can analyze your corporate travel spend, query company booking ledgers, inspect travel policies, and verify credit note refunds."}
                </p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-[10.5px] text-slate-300 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Screen: {currentModule}</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block px-1">
                  Suggested Questions
                </span>
                <div className="flex flex-col gap-1.5">
                  {suggestionChips.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(chip.prompt)}
                      className="text-left px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-white transition-all text-xs group flex items-center justify-between"
                    >
                      <span className="truncate pr-2">{chip.label}</span>
                      <Sparkles size={12} className="text-emerald-400 opacity-60 group-hover:opacity-100 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Message Stream */}
          {messages.map((msg, idx) => {
            const isUser = msg.senderType === "USER";
            const askedFor = isUser ? "" : [...messages.slice(0, idx)].reverse().find((m) => m.senderType === "USER")?.content ?? "Question";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    isUser
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-xs shadow-md"
                      : "bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-xs shadow-sm"
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className="prose prose-invert prose-xs max-w-none text-slate-200 prose-headings:text-white prose-a:text-emerald-400 prose-strong:text-white prose-table:text-xs">
                      <Streamdown>{msg.content}</Streamdown>

                      {/* Decision 3 Financial KPI Badge if structuredData exists */}
                      {msg.structuredData && (msg.structuredData.netSpend !== undefined || msg.structuredData.totalNetCost !== undefined) && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-400">Net Spend (Dec 3):</span>
                          <span className="text-emerald-400 font-bold">
                            {formatINR(msg.structuredData.netSpend ?? msg.structuredData.totalNetCost)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isUser && isSupabaseEnabled && (
                  <AnswerDownloads question={askedFor} answer={msg.content} records={msg.records} className="mt-1 px-1 text-[10px] text-slate-400" />
                )}

                {/* Assistant Message Actions */}
                {!isUser && (
                  <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-500">
                    <button
                      onClick={() => handleCopyText(msg.content, msg.id)}
                      title="Copy response"
                      className="p-1 rounded hover:text-slate-300 transition-colors"
                    >
                      {copiedMsgId === msg.id ? (
                        <Check size={11} className="text-emerald-400" />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                    <button
                      onClick={() => handleFeedback(msg.id, "THUMBS_UP")}
                      title="Helpful"
                      className={`p-1 rounded transition-colors ${
                        feedbackState[msg.id] === "THUMBS_UP"
                          ? "text-emerald-400 font-bold"
                          : "hover:text-slate-300"
                      }`}
                    >
                      <ThumbsUp size={11} />
                    </button>
                    <button
                      onClick={() => handleFeedback(msg.id, "THUMBS_DOWN")}
                      title="Not helpful"
                      className={`p-1 rounded transition-colors ${
                        feedbackState[msg.id] === "THUMBS_DOWN"
                          ? "text-red-400 font-bold"
                          : "hover:text-slate-300"
                      }`}
                    >
                      <ThumbsDown size={11} />
                    </button>
                    <span className="text-[9px] text-slate-600 ml-1">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Assistant Loading / Typing Indicator */}
          {isLoading && (
            <div className="flex items-start gap-2 text-xs text-slate-400">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={12} className="animate-spin" />
              </div>
              <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-xs bg-slate-900 border border-slate-800 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                </div>
                <span className="text-[11px] text-slate-400">Analyzing travel records...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/90 shrink-0">
          <div className="relative flex items-end gap-2 bg-slate-950/80 rounded-xl border border-slate-800 focus-within:border-emerald-500/60 transition-colors p-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Trapple AI about spend, flights, policies..."
              disabled={isLoading}
              className="w-full bg-transparent resize-none outline-none text-xs text-slate-100 placeholder:text-slate-500 max-h-24 py-1 px-1 scrollbar-none"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputPrompt.trim() || isLoading}
              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white disabled:text-slate-600 transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed"
              title="Send message (Enter)"
            >
              <Send size={14} />
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1 text-[9.5px] text-slate-500">
            <span>Press Enter to send, Shift+Enter for newline</span>
            <span className="font-mono">Encrypted & Isolated</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. FLOATING LAUNCHER BUTTON (Bottom-Right Trigger), with a small X to hide it
  if (isHidden) return null;
  return (
    <div className="fixed bottom-6 right-6 z-40 ai-launcher-wrap">
    <button
      onClick={() => setIsOpen(true)}
      className="group flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white shadow-xl hover:shadow-2xl hover:shadow-emerald-500/10 border border-slate-700/80 hover:border-emerald-500/50 backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:ring-offset-2 focus:ring-offset-slate-950"
      aria-label="Ask Trapple AI Assistant"
      title="Ask Trapple AI (Corporate Travel & Spend Assistant)"
    >
      <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
        <Sparkles size={14} className="transition-transform group-hover:rotate-12 group-hover:scale-110" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500" />
      </div>
      <span className="text-xs font-semibold tracking-wide text-slate-100 group-hover:text-emerald-300 transition-colors">
        Ask Trapple AI
      </span>
    </button>
    <button
      type="button"
      onClick={() => setHidden(true)}
      className="ai-launcher-close absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full bg-slate-700 hover:bg-red-500 text-white border border-slate-900 shadow-md transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
      aria-label="Hide Trapple AI button"
      title="Hide (open it again from Ask AI in the top bar)"
    >
      <X size={11} strokeWidth={3} />
    </button>
    </div>
  );
}

