import { useState, useMemo } from "react";
import {
  FileText,
  CheckCircle2,
  TicketCheck,
  WalletCards,
  Clock,
  Filter,
  Sparkles,
} from "lucide-react";
import type { ActivityEvent, Journey } from "../types";
import type { AuthUser } from "../lib/api";

interface ActivityTimelineProps {
  journeys?: Journey[];
  user?: AuthUser;
}

export function ActivityTimeline({ journeys = [], user }: ActivityTimelineProps) {
  const [filter, setFilter] = useState<string>("ALL");

  // Derive dynamic activity events from the authenticated user's actual journeys
  const events = useMemo<ActivityEvent[]>(() => {
    if (!journeys || journeys.length === 0) return [];

    const list: ActivityEvent[] = [];
    journeys.forEach((journey) => {
      // 1. Request submission event
      list.push({
        id: `act-req-${journey.id}`,
        type: "request",
        actor: journey.passenger || user?.username || "You",
        role: "EMPLOYEE",
        action: "Submitted travel request",
        target: `${journey.destination} (${journey.from} → ${journey.to}) · ${journey.project}`,
        timestamp: journey.dates,
        badgeVariant: "warning",
      });

      // 2. Approver decision event
      if (journey.status === "Approved" || journey.status === "Booked") {
        list.push({
          id: `act-app-${journey.id}`,
          type: "approval",
          actor: journey.approverName || "Management Approver",
          role: "APPROVER",
          action: "Approved travel request",
          target: `${journey.destination} · ${journey.approvalComment || "Authorized for desk ticketing"}`,
          timestamp: journey.approvalDate ? new Date(journey.approvalDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "Approved",
          badgeVariant: "info",
        });
      }

      // 3. Desk Booking event
      if (journey.status === "Booked") {
        list.push({
          id: `act-bk-${journey.id}`,
          type: "booking",
          actor: "Travel Desk Operations",
          role: "TRAVEL_DESK",
          action: "Confirmed booking & issued ticket",
          target: `${journey.destination} · Ticket attached to your journey`,
          timestamp: "Confirmed",
          badgeVariant: "success",
        });
      }
    });

    return list;
  }, [journeys, user]);

  const filtered = events.filter((e) => filter === "ALL" || e.type === filter);

  const getIcon = (type: ActivityEvent["type"]) => {
    switch (type) {
      case "booking":
        return <TicketCheck size={16} className="text-[#F28C28]" />;
      case "approval":
        return <CheckCircle2 size={16} className="text-[#16A34A]" />;
      case "expense":
        return <WalletCards size={16} className="text-[#2563EB]" />;
      case "request":
        return <FileText size={16} className="text-[#F28C28]" />;
      default:
        return <Clock size={16} className="text-[#94A3B8]" />;
    }
  };

  return (
    <div className="panel p-6 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E7EC] dark:border-[#1E293B] shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="card-kicker">AUDIT & EVENT STREAM</span>
          <h2 className="section-heading">Activity Feed</h2>
        </div>

        {events.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <Filter size={13} className="text-[#94A3B8]" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-xs bg-transparent border border-[#E4E7EC] dark:border-[#1E293B] rounded-lg px-2 py-1 text-[#475467] dark:text-[#CBD5E1]"
            >
              <option value="ALL">All activities</option>
              <option value="booking">Bookings</option>
              <option value="approval">Approvals</option>
              <option value="expense">Expenses</option>
              <option value="request">Requests</option>
            </select>
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <div className="p-6 text-center rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] border border-dashed border-[#E4E7EC] dark:border-[#1E293B] space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-[#F28C28]/10 flex items-center justify-center text-[#D9761A] dark:text-[#F6A85A]">
            <Sparkles size={18} />
          </div>
          <strong className="block text-sm text-[#10243A] dark:text-[#F8FAFC]">
            No travel activity yet
          </strong>
          <p className="text-xs text-[#667085] dark:text-[#94A3B8] max-w-sm mx-auto">
            Your submitted travel requests, manager approvals, and ticket bookings will appear here in chronological order.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E4E7EC] dark:before:bg-[#1E293B]">
          {filtered.map((item) => (
            <div key={item.id} className="relative group">
              <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white dark:bg-[#111827] border-2 border-[#E4E7EC] dark:border-[#1E293B] flex items-center justify-center group-hover:border-[#F28C28] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F28C28]" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {getIcon(item.type)}
                    <strong className="text-[#10243A] dark:text-[#F8FAFC] font-semibold">
                      {item.actor}
                    </strong>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#F1F5F9] dark:bg-[#1E293B] text-[#475467] dark:text-[#CBD5E1]">
                      {item.role}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#94A3B8] flex items-center gap-1">
                    <Clock size={11} /> {item.timestamp}
                  </span>
                </div>

                <p className="text-xs text-[#475467] dark:text-[#94A3B8]">
                  {item.action}:{" "}
                  <span className="font-medium text-[#10243A] dark:text-[#F8FAFC]">{item.target}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
