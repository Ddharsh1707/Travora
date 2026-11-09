import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plane,
  Clock,
  ArrowRight,
  Sparkles,
  MapPin,
  CalendarDays,
  X,
} from "lucide-react";
import type { Journey } from "../types";
import ModalPortal from "./ModalPortal";

interface TravelCalendarProps {
  journeys: Journey[];
  onSelectJourney?: (journey: Journey) => void;
}

export function TravelCalendar({ journeys, onSelectJourney }: TravelCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayJourneys, setSelectedDayJourneys] = useState<{ date: string; trips: Journey[] } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // Parse journeys to date keys
  const journeyDateMap = useMemo(() => {
    const map = new Map<string, Journey[]>();
    for (const journey of journeys) {
      // dates is e.g. "12 Oct 2026" or "12 Oct 2026 – 16 Oct 2026"
      const dateParts = journey.dates.split("–").map((s) => s.trim());
      const startDate = new Date(dateParts[0]);
      if (!Number.isNaN(startDate.getTime())) {
        const key = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
        const existing = map.get(key) || [];
        existing.push(journey);
        map.set(key, existing);
      }
    }
    return map;
  }, [journeys]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Calendar stats for this month
  const thisMonthTrips = useMemo(() => {
    let count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (journeyDateMap.has(key)) {
        count += (journeyDateMap.get(key)?.length || 0);
      }
    }
    return count;
  }, [journeyDateMap, year, month, daysInMonth]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E7EC] dark:border-[#1E293B] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F2A93B]/10 text-[#E8961C] dark:text-[#F6BC55] flex items-center justify-center">
            <CalendarDays size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#0F1A22] dark:text-[#F8FAFC]">
              {monthNames[month]} {year}
            </h2>
            <p className="text-xs text-[#667085] dark:text-[#94A3B8]">
              {thisMonthTrips} scheduled {thisMonthTrips === 1 ? "journey" : "journeys"} in this month
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#F1F5F9] dark:bg-[#1E293B] text-[#0F1A22] dark:text-[#E2E8F0] hover:bg-[#E2E8F0] dark:hover:bg-[#334155] transition-colors"
          >
            Today
          </button>
          <div className="flex items-center border border-[#E4E7EC] dark:border-[#1E293B] rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 text-[#667085] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 text-[#667085] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E7EC] dark:border-[#1E293B] overflow-hidden shadow-sm">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 border-b border-[#E4E7EC] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0F172A] text-center text-xs font-bold text-[#667085] dark:text-[#94A3B8] uppercase tracking-wider py-3">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 auto-rows-fr gap-px bg-[#E4E7EC] dark:bg-[#1E293B]">
          {/* Empty cells before month starts */}
          {Array.from({ length: firstDayIndex }).map((_, index) => (
            <div key={`empty-${index}`} className="min-h-[96px] bg-[#F8FAFC] dark:bg-[#0B0F17]/50 p-2" />
          ))}

          {/* Month days */}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateKey === todayStr;
            const trips = journeyDateMap.get(dateKey) || [];

            return (
              <div
                key={dateKey}
                onClick={() => {
                  if (trips.length > 0) {
                    setSelectedDayJourneys({ date: dateKey, trips });
                  }
                }}
                className={`min-h-[96px] bg-white dark:bg-[#111827] p-2 transition-all flex flex-col justify-between ${
                  trips.length > 0
                    ? "cursor-pointer hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B]"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-semibold w-6 h-6 rounded-full ${
                      isToday
                        ? "bg-[#F2A93B] text-white font-bold shadow-sm"
                        : "text-[#0F1A22] dark:text-[#F8FAFC]"
                    }`}
                  >
                    {day}
                  </span>
                  {trips.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#F2A93B]/15 text-[#E8961C] dark:text-[#F6BC55]">
                      {trips.length} {trips.length === 1 ? "trip" : "trips"}
                    </span>
                  )}
                </div>

                {/* Trip Badges on Day */}
                <div className="space-y-1 mt-1">
                  {trips.slice(0, 2).map((trip) => {
                    const statusColors =
                      trip.status === "Approved" || trip.status === "Booked"
                        ? "bg-[#F2A93B]/15 text-[#E8961C] dark:text-[#F6BC55] border-[#F2A93B]/30"
                        : "bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] border-[#2563EB]/25";

                    return (
                      <div
                        key={trip.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectJourney) onSelectJourney(trip);
                        }}
                        className={`text-[10px] font-medium px-1.5 py-1 rounded border truncate flex items-center gap-1 ${statusColors} hover:opacity-80 transition-opacity`}
                        title={`${trip.destination} (${trip.status})`}
                      >
                        <Plane size={10} className="shrink-0" />
                        <span className="truncate">{trip.destination}</span>
                      </div>
                    );
                  })}
                  {trips.length > 2 && (
                    <span className="text-[9px] text-[#667085] dark:text-[#94A3B8] block text-center">
                      +{trips.length - 2} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Journeys Modal */}
      {selectedDayJourneys && (
        <ModalPortal><div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
          onClick={() => setSelectedDayJourneys(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-[#111827] rounded-2xl shadow-xl border border-[#E4E7EC] dark:border-[#1E293B] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E4E7EC] dark:border-[#1E293B] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#F2A93B]">
                  SCHEDULED TRAVEL
                </span>
                <h3 className="text-lg font-bold text-[#0F1A22] dark:text-[#F8FAFC]">
                  Trips on {selectedDayJourneys.date}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDayJourneys(null)}
                className="text-[#667085] hover:text-[#0F1A22] dark:hover:text-white"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {selectedDayJourneys.trips.map((trip) => (
                <div
                  key={trip.id}
                  className="p-3.5 rounded-xl border border-[#E4E7EC] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151E2E] space-y-2 hover:border-[#F2A93B] transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedDayJourneys(null);
                    if (onSelectJourney) onSelectJourney(trip);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-sm text-[#0F1A22] dark:text-[#F8FAFC]">
                      {trip.destination}
                    </strong>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F2A93B]/20 text-[#E8961C] dark:text-[#F6BC55]">
                      {trip.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#667085] dark:text-[#94A3B8]">
                    <span>{trip.from}</span>
                    <ArrowRight size={12} />
                    <span>{trip.to}</span>
                  </div>
                  <div className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                    Project: {trip.project} · {trip.tripType}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSelectedDayJourneys(null)}
              className="w-full py-2.5 rounded-xl bg-[#F2A93B] text-white font-semibold text-sm hover:bg-[#E8961C] transition-colors shadow-sm"
            >
              Close
            </button>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}
