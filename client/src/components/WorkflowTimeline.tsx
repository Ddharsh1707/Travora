import React from "react";
import { Check, Clock, ShieldCheck, TicketCheck, AlertCircle } from "lucide-react";

interface WorkflowTimelineProps {
  status: "Pending approval" | "Approved" | "Booked" | "Completed" | "Cancelled" | string;
  approverName?: string;
  approvalDate?: string;
  bookingReference?: string;
  className?: string;
}

export function WorkflowTimeline({
  status,
  approverName,
  approvalDate,
  bookingReference,
  className = "",
}: WorkflowTimelineProps) {
  const isCancelled = status === "Cancelled" || status === "Rejected";

  const getStepState = (stepIndex: number): "completed" | "current" | "upcoming" | "failed" => {
    if (isCancelled) {
      if (stepIndex === 0) return "completed";
      if (stepIndex === 1) return "failed";
      return "upcoming";
    }

    switch (status) {
      case "Pending approval":
        return stepIndex === 0 ? "completed" : stepIndex === 1 ? "current" : "upcoming";
      case "Approved":
        return stepIndex <= 1 ? "completed" : stepIndex === 2 ? "current" : "upcoming";
      case "Booked":
        return stepIndex <= 2 ? "completed" : stepIndex === 3 ? "current" : "upcoming";
      case "Completed":
        return "completed";
      default:
        return stepIndex === 0 ? "completed" : "upcoming";
    }
  };

  const steps = [
    {
      title: "Request Submitted",
      description: "Employee itinerary drafted & logged",
      icon: Clock,
    },
    {
      title: isCancelled ? "Request Rejected" : "Approver Sign-Off",
      description: isCancelled
        ? "Trip request was rejected"
        : approverName
        ? `Authorized by ${approverName}`
        : "Pending designated manager review",
      icon: isCancelled ? AlertCircle : ShieldCheck,
    },
    {
      title: "Travel Desk Ticketing",
      description: bookingReference
        ? `Confirmed PNR: ${bookingReference}`
        : "Ticketing & reservation fulfillment",
      icon: TicketCheck,
    },
    {
      title: "Journey Complete",
      description: status === "Completed" ? "Trip finished with zero policy flags" : "Departure & safe return",
      icon: Check,
    },
  ];

  return (
    <div className={`py-3 ${className}`}>
      <div className="flex items-center justify-between relative">
        {/* Background Connecting Line */}
        <div className="absolute top-4 left-6 right-6 h-[2px] bg-[#E4E7EC] dark:bg-[#1E293B] -z-0" />

        {steps.map((step, idx) => {
          const state = getStepState(idx);
          const StepIcon = step.icon;

          return (
            <div key={step.title} className="flex flex-col items-center flex-1 z-10 text-center px-1">
              {/* Step Circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 text-xs font-bold ${
                  state === "completed"
                    ? "bg-[#16A34A] text-white shadow-[0_0_12px_rgba(22,163,74,0.35)]"
                    : state === "current"
                    ? "bg-[#F2A93B] text-white ring-4 ring-[#F2A93B]/20 shadow-[0_0_14px_rgba(242, 169, 59,0.4)] animate-pulse"
                    : state === "failed"
                    ? "bg-[#DC2626] text-white shadow-[0_0_12px_rgba(220,38,38,0.35)]"
                    : "bg-white dark:bg-[#111827] border-2 border-[#E4E7EC] dark:border-[#334155] text-[#667085] dark:text-[#94A3B8]"
                }`}
              >
                {state === "completed" ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  <StepIcon size={14} />
                )}
              </div>

              {/* Title & Description */}
              <span
                className={`mt-2 text-xs font-bold truncate max-w-[120px] ${
                  state === "completed" || state === "current"
                    ? "text-[#0F1A22] dark:text-[#F8FAFC]"
                    : state === "failed"
                    ? "text-[#DC2626]"
                    : "text-[#667085] dark:text-[#94A3B8]"
                }`}
              >
                {step.title}
              </span>
              <span className="text-[10px] text-[#667085] dark:text-[#94A3B8] max-w-[120px] truncate hidden sm:block mt-0.5">
                {step.description}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
