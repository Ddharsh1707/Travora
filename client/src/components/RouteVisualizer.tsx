import React from "react";
import { Plane, Train, MapPin, Calendar, Building2 } from "lucide-react";

interface RouteVisualizerProps {
  from: string;
  to: string;
  dates?: string;
  project?: string;
  type?: "FLIGHT" | "TRAIN" | "CAR" | "HOTEL" | string;
  status?: string;
  className?: string;
}

export function RouteVisualizer({
  from,
  to,
  dates,
  project,
  type = "FLIGHT",
  status,
  className = "",
}: RouteVisualizerProps) {
  const isTrain = type.toUpperCase().includes("TRAIN") || type.toUpperCase().includes("RAIL");
  const isHotel = type.toUpperCase().includes("HOTEL");

  return (
    <div className={`p-4 rounded-xl border border-[#E4E7EC] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151E2E] ${className}`}>
      {/* Route Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#F28C28]/10 text-[#D9761A] dark:text-[#F6A85A] border border-[#F28C28]/20">
            {isTrain ? <Train size={14} /> : <Plane size={14} />}
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]">
            {isTrain ? "Rail Journey" : isHotel ? "Lodging & Transit" : "Air Itinerary"}
          </span>
        </div>
        {status && (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F28C28]/10 text-[#D9761A] dark:text-[#F6A85A] border border-[#F28C28]/25">
            {status}
          </span>
        )}
      </div>

      {/* Origin -> Track -> Destination */}
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-[#667085] dark:text-[#94A3B8]">
            <MapPin size={12} className="shrink-0 text-[#F28C28]" />
            <span className="truncate">Departure</span>
          </div>
          <strong className="block text-base font-bold text-[#10243A] dark:text-[#F8FAFC] truncate mt-0.5">
            {from}
          </strong>
        </div>

        {/* SVG Animated Route Line */}
        <div className="flex-[1.5] flex flex-col items-center justify-center px-2">
          <div className="relative w-full flex items-center justify-center">
            {/* Dashed baseline track */}
            <div className="w-full h-[2px] border-b-2 border-dashed border-[#F28C28]/40 dark:border-[#F28C28]/50 relative" />
            
            {/* Center Vehicle Icon with glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-[#1E293B] border border-[#F28C28] flex items-center justify-center text-[#D9761A] dark:text-[#F6A85A] shadow-[0_0_12px_rgba(242, 140, 40,0.3)]">
              {isTrain ? <Train size={12} /> : <Plane size={12} className="rotate-45" />}
            </div>
          </div>
          <span className="text-[10px] font-medium text-[#667085] dark:text-[#94A3B8] mt-2">
            Non-stop corporate transit
          </span>
        </div>

        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5 text-xs text-[#667085] dark:text-[#94A3B8]">
            <span className="truncate">Destination</span>
            <MapPin size={12} className="shrink-0 text-[#D9761A]" />
          </div>
          <strong className="block text-base font-bold text-[#10243A] dark:text-[#F8FAFC] truncate mt-0.5">
            {to}
          </strong>
        </div>
      </div>

      {/* Route Footer Details */}
      {(dates || project) && (
        <div className="mt-3 pt-3 border-t border-[#E4E7EC]/70 dark:border-[#1E293B] flex flex-wrap items-center justify-between gap-2 text-xs text-[#667085] dark:text-[#94A3B8]">
          {dates && (
            <span className="flex items-center gap-1.5 font-medium">
              <Calendar size={13} className="text-[#F28C28]" />
              {dates}
            </span>
          )}
          {project && (
            <span className="flex items-center gap-1.5 font-medium">
              <Building2 size={13} className="text-[#667085] dark:text-[#94A3B8]" />
              {project}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
