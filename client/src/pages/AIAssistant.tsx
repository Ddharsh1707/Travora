import { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Plus, Trash2, ThumbsUp, ThumbsDown, Copy, Check, PanelRightClose, PanelRightOpen, TrendingUp, Plane, AlertCircle, Clock, ShieldCheck, ArrowRight, MessageSquare, Edit2 } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import {
  AuthUser,
  aiAssistantApi,
  AIConversationItem,
  AIMessageItem,
  AIChatResult
} from "../lib/api";

interface AIAssistantProps {
  user: AuthUser;
}

export function AIAssistant({ user }: AIAssistantProps) {
  const [conversations, setConversations] = useState<AIConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AIMessageItem[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [activeStructuredData, setActiveStructuredData] = useState<any | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<number, "THUMBS_UP" | "THUMBS_DOWN">>({});
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renamingText, setRenamingText] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isPrivileged =
    user.role === "ADMIN" ||
    user.role === "COMPANY_ADMIN" ||
    user.role === "PLATFORM_ADMIN" ||
    user.role === "TRAVEL_DESK" ||
    user.role === "APPROVER";

  const suggestionChips = isPrivileged
    ? [
        { label: "Executive Travel Spend Overview", prompt: "Please give me a complete executive spend overview including gross spend, credit notes, and net spend." },
        { label: "Project Spend Analysis", prompt: "Show travel expenditure broken down by project and cost centers." },
        { label: "Credit Notes & Refunds Audit", prompt: "List all ticket cancellation adjustments and credit notes applied to our travel ledger." },
        { label: "Popular Routes & Airlines", prompt: "What are our most frequently traveled city routes and preferred carriers?" },
        { label: "Pending Approvals", prompt: "Check all travel requests and employee expenses currently pending manager or desk approval." },
      ]
    : [
        { label: "My Travel Summary", prompt: "Summarize my past travel bookings, upcoming journeys, and total expenditures." },
        { label: "Popular Routes", prompt: "What are the common corporate flight routes and city pairs in our company?" },
        { label: "Corporate Travel Policy", prompt: "What are our company rules and budget limits for domestic and international travel?" },
      ];

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // When active conversation changes, load messages
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
      setActiveStructuredData(null);
    }
  }, [activeConversationId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const loadConversations = async () => {
    try {
      const res = await aiAssistantApi.getConversations();
      if (res && res.content) {
        setConversations(res.content);
        if (res.content.length > 0 && activeConversationId === null) {
          setActiveConversationId(res.content[0].id);
        }
      }
    } catch (err: any) {
      console.warn("Failed to load conversations", err);
    }
  };

  const loadMessages = async (convId: number) => {
    try {
      const res = await aiAssistantApi.getMessages(convId);
      setMessages(res || []);
      // Extract latest structured data if available
      if (res && res.length > 0) {
        for (let i = res.length - 1; i >= 0; i--) {
          if (res[i].structuredData) {
            try {
              const parsed = typeof res[i].structuredData === "string"
                ? JSON.parse(res[i].structuredData)
                : res[i].structuredData;
              setActiveStructuredData(parsed);
              break;
            } catch (e) {
              setActiveStructuredData(res[i].structuredData);
              break;
            }
          }
        }
      }
    } catch (err: any) {
      setErrorBanner("Failed to load conversation history.");
    }
  };

  const handleStartNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setActiveStructuredData(null);
    setErrorBanner(null);
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputPrompt).trim();
    if (!textToSend || isLoading) return;

    setInputPrompt("");
    setErrorBanner(null);
    setIsLoading(true);

    // Optimistically add user message
    const tempUserMsg: AIMessageItem = {
      id: Date.now(),
      conversationId: activeConversationId || 0,
      senderType: "USER",
      content: textToSend,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const result: AIChatResult = await aiAssistantApi.chat(textToSend, activeConversationId);

      // If this was a new conversation, update active id and refresh list
      if (!activeConversationId && result.conversationId) {
        setActiveConversationId(result.conversationId);
        loadConversations();
      }

      // Append assistant message
      const assistantMsg: AIMessageItem = {
        id: result.messageId || Date.now(),
        conversationId: result.conversationId,
        senderType: "ASSISTANT",
        content: result.answerText,
        structuredData: result.structuredData,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (result.structuredData) {
        setActiveStructuredData(result.structuredData);
      }
    } catch (err: any) {
      console.error("Chat error", err);
      setErrorBanner(err.message || "Failed to contact Trapple AI. Please verify API configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this conversation?")) return;
    try {
      await aiAssistantApi.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        handleStartNewChat();
      }
    } catch (err: any) {
      alert("Failed to delete conversation: " + err.message);
    }
  };

  const handleRenameSubmit = async (id: number) => {
    if (!renamingText.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      const updated = await aiAssistantApi.renameConversation(id, renamingText.trim());
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
    } catch (err) {
      console.warn("Failed to rename", err);
    } finally {
      setRenamingId(null);
    }
  };

  const handleCopyText = (text: string, msgId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleFeedback = async (msgId: number, rating: "THUMBS_UP" | "THUMBS_DOWN") => {
    try {
      await aiAssistantApi.sendFeedback(msgId, rating);
      setFeedbackState((prev) => ({ ...prev, [msgId]: rating }));
    } catch (e) {
      console.warn("Feedback failed", e);
    }
  };

  const formatCurrency = (val?: number | string) => {
    if (val === undefined || val === null) return "₹0";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "₹0";
    return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };

  return (
    <div className="flex h-[calc(100vh-4.5rem)] w-full overflow-hidden bg-slate-950 text-slate-100">
      {/* 1. Left Conversation Navigation Sidebar */}
      <div className="w-72 shrink-0 border-r border-slate-800 bg-slate-900/60 flex flex-col justify-between">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-white">Trapple AI</h2>
              <p className="text-xs text-slate-400 capitalize">{user.role?.toLowerCase().replace("_", " ")}</p>
            </div>
          </div>
          <button
            onClick={handleStartNewChat}
            title="Start new conversation"
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              No conversations yet. Ask your first question!
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const isRenaming = renamingId === conv.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`group relative flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition ${
                    isActive
                      ? "bg-emerald-500/15 border border-emerald-500/30 text-white font-medium"
                      : "hover:bg-slate-800/60 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <MessageSquare size={14} className={isActive ? "text-emerald-400" : "text-slate-500"} />
                    {isRenaming ? (
                      <input
                        type="text"
                        value={renamingText}
                        onChange={(e) => setRenamingText(e.target.value)}
                        onBlur={() => handleRenameSubmit(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameSubmit(conv.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white w-full outline-none"
                      />
                    ) : (
                      <span className="truncate">{conv.title}</span>
                    )}
                  </div>

                  {!isRenaming && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(conv.id);
                          setRenamingText(conv.title);
                        }}
                        className="p-1 hover:text-emerald-400 text-slate-400"
                        title="Rename"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        className="p-1 hover:text-red-400 text-slate-400"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* User / Tenant Isolation Context Pill */}
        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-400 bg-slate-900/80">
          <div className="flex items-center justify-between">
            <span className="truncate font-medium text-slate-300">{user.companyName || "Mahathi Infra"}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-emerald-400 font-mono">
              {user.companyCode || "MISPL"}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">Tenant-isolated corporate AI</div>
        </div>
      </div>

      {/* 2. Main Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden relative">
        {/* Top Chat Header */}
        <div className="h-14 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
              <Sparkles size={14} />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white flex items-center gap-2">
                Corporate Travel & Spend Assistant
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Decision 3 & 4 Verified
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-slate-800 hover:bg-slate-800/60 text-slate-300 hover:text-white transition"
              title={isDrawerOpen ? "Collapse Intelligence Panel" : "Expand Intelligence Panel"}
            >
              {isDrawerOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              <span className="hidden sm:inline">Context Drawer</span>
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {errorBanner && (
          <div className="mx-6 mt-3 p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button onClick={() => setErrorBanner(null)} className="text-red-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto py-12 text-center">
              <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <Sparkles size={28} />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                How can Trapple AI assist your travel operations today?
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-8">
                Ask questions regarding real corporate ledger spend, project allocations, credit notes, travel policies, or pending approvals.
              </p>

              {/* Suggestion Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                {suggestionChips.map((chip, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(chip.prompt)}
                    className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800/80 hover:border-slate-700 text-xs text-slate-200 transition text-left flex flex-col justify-between group"
                  >
                    <span className="font-medium text-emerald-400 flex items-center justify-between mb-1">
                      {chip.label}
                      <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition text-slate-400" />
                    </span>
                    <span className="text-[11px] text-slate-400 line-clamp-2">{chip.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.senderType === "USER";

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-3xl ${isUser ? "ml-auto justify-end" : "mr-auto justify-start"}`}
                >
                  {!isUser && (
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/30">
                      <Sparkles size={16} />
                    </div>
                  )}

                  <div className={`space-y-2 ${isUser ? "text-right" : "text-left"}`}>
                    <div
                      className={`inline-block p-4 rounded-2xl text-xs leading-relaxed max-w-xl text-left ${
                        isUser
                          ? "bg-emerald-600 text-white rounded-tr-sm"
                          : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm shadow-md"
                      }`}
                    >
                      {isUser ? (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      ) : (
                        <div className="prose prose-invert prose-xs max-w-none prose-p:leading-relaxed prose-headings:text-slate-100 prose-a:text-emerald-400 prose-code:text-emerald-300">
                          <Markdown>{msg.content}</Markdown>
                        </div>
                      )}
                    </div>

                    {!isUser && (
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 pl-1">
                        <button
                          onClick={() => handleCopyText(msg.content, msg.id)}
                          className="flex items-center gap-1 hover:text-slate-300 transition"
                          title="Copy response"
                        >
                          {copiedMsgId === msg.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          <span>{copiedMsgId === msg.id ? "Copied" : "Copy"}</span>
                        </button>

                        <button
                          onClick={() => handleFeedback(msg.id, "THUMBS_UP")}
                          className={`flex items-center gap-1 transition ${
                            feedbackState[msg.id] === "THUMBS_UP" ? "text-emerald-400" : "hover:text-slate-300"
                          }`}
                          title="Helpful response"
                        >
                          <ThumbsUp size={12} />
                        </button>

                        <button
                          onClick={() => handleFeedback(msg.id, "THUMBS_DOWN")}
                          className={`flex items-center gap-1 transition ${
                            feedbackState[msg.id] === "THUMBS_DOWN" ? "text-red-400" : "hover:text-slate-300"
                          }`}
                          title="Inaccurate or unhelpful"
                        >
                          <ThumbsDown size={12} />
                        </button>

                        <span className="text-[10px] text-slate-600">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="flex gap-3 mr-auto max-w-2xl">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <Sparkles size={16} className="animate-pulse" />
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl rounded-tl-sm flex items-center gap-3 text-xs text-slate-400">
                <div className="flex gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span>Querying company database & verifying ledger records...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 max-w-4xl mx-auto"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="Ask Trapple AI about company travel spend, project costs, routes, or approvals..."
                disabled={isLoading}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60 transition shadow-inner"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !inputPrompt.trim()}
              className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-medium text-xs flex items-center gap-2 transition shrink-0 shadow-lg shadow-emerald-950/50"
            >
              <span>Send</span>
              <Send size={14} />
            </button>
          </form>
          <div className="text-center text-[10px] text-slate-500 mt-2">
            Trapple AI responses are strictly grounded in your company's actual database records and comply with Decision 3 & 4.
          </div>
        </div>
      </div>

      {/* 3. Right Contextual Intelligence Drawer */}
      {isDrawerOpen && (
        <div className="w-80 shrink-0 border-l border-slate-800 bg-slate-900/40 flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <TrendingUp size={14} className="text-emerald-400" />
              Verified Intelligence
            </h3>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded"
              title="Close panel"
            >
              <PanelRightClose size={15} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeStructuredData ? (
              <>
                {/* Financial Overview Cards */}
                {(activeStructuredData.grossSpend !== undefined || activeStructuredData.netSpend !== undefined) && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Financial Spend Reconciliation
                    </div>

                    <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/80">
                      <div className="text-[10px] text-slate-400">Gross Spend</div>
                      <div className="text-base font-bold text-slate-200 mt-0.5">
                        {formatCurrency(activeStructuredData.grossSpend)}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-rose-900/40 bg-rose-950/20">
                      <div className="text-[10px] text-rose-400">Credit Notes & Refunds (Deduction)</div>
                      <div className="text-base font-bold text-rose-300 mt-0.5">
                        -{formatCurrency(activeStructuredData.creditNotes || activeStructuredData.totalCreditNotes || 0)}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/20">
                      <div className="text-[10px] text-emerald-400 font-medium">Net Corporate Spend</div>
                      <div className="text-lg font-bold text-emerald-300 mt-0.5">
                        {formatCurrency(activeStructuredData.netSpend)}
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5 pt-1">
                      <ShieldCheck size={12} className="text-emerald-400" />
                      <span>Decision 3: Gross minus Credit Notes</span>
                    </div>
                  </div>
                )}

                {/* Additional KPI metrics */}
                {activeStructuredData.totalBookings !== undefined && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/80">
                      <div className="text-[10px] text-slate-400">Total Bookings</div>
                      <div className="text-sm font-bold text-white mt-0.5">
                        {activeStructuredData.totalBookings}
                      </div>
                    </div>

                    {activeStructuredData.activeTravellers !== undefined && (
                      <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/80">
                        <div className="text-[10px] text-slate-400">Active Travellers</div>
                        <div className="text-sm font-bold text-white mt-0.5">
                          {activeStructuredData.activeTravellers}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Modal Split Breakdown */}
                {activeStructuredData.flightSpend !== undefined && (
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/80 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                      <Plane size={13} className="text-sky-400" />
                      <span>Modal Split</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Flights:</span>
                      <span className="font-medium text-slate-200">{formatCurrency(activeStructuredData.flightSpend)}</span>
                    </div>
                    {activeStructuredData.hotelSpend !== undefined && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Hotels:</span>
                        <span className="font-medium text-slate-200">{formatCurrency(activeStructuredData.hotelSpend)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Pending Approvals Summary */}
                {activeStructuredData.totalPendingTravelRequests !== undefined && (
                  <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/80 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                      <Clock size={13} className="text-amber-400" />
                      <span>Pending Workflows</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Travel Requests:</span>
                      <span className="font-bold text-amber-300">{activeStructuredData.totalPendingTravelRequests}</span>
                    </div>
                    {activeStructuredData.totalPendingExpenses !== undefined && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Expenses:</span>
                        <span className="font-bold text-amber-300">{activeStructuredData.totalPendingExpenses}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 px-4 text-slate-500 space-y-3">
                <div className="h-10 w-10 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-400">
                  <TrendingUp size={20} />
                </div>
                <div className="text-xs font-medium text-slate-400">No Active Data In View</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  When you ask Trapple AI questions regarding company spend, projects, or approvals, live data KPIs will appear here automatically.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

