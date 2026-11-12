import { useState } from "react";
import { Mail, Building2, Phone, Plane, ShieldCheck, Save, CheckCircle2, Compass, HeartHandshake, CalendarDays, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { REGISTERED_EMPLOYEES, type AuthUser } from "../lib/api";
import type { Journey, UserProfile } from "../types";

export function Profile({ user, journeys = [] }: { user: AuthUser; journeys?: Journey[] }) {
  const regEmp = REGISTERED_EMPLOYEES.find(
    (e) => e.employeeNumber.toLowerCase() === String(user.employeeId || "").toLowerCase()
  );

  const defaultProfile: UserProfile = {
    id: String(user.id || "USR"),
    name: regEmp?.fullName || user.username || "Trapple Traveler",
    email: regEmp?.workEmail || `${user.username?.toLowerCase().replace(/\s+/g, ".") || "employee"}@mahathiinfra.com`,
    role: user.role,
    employeeId: user.employeeId || "EMP",
    department: regEmp?.department || "General Operations",
    designation: regEmp?.designation || "Employee",
    phone: "+91 98765 43210",
    officeLocation: "Corporate Headquarters, India",
    emergencyContact: {
      name: "Corporate Helpdesk",
      relation: "Internal Support",
      phone: "+91 98765 01234",
    },
    travelPreferences: {
      seatPreference: "Window",
      mealPreference: "Vegetarian",
      preferredAirlines: ["IndiGo", "Air India", "Vistara"],
      hotelLoyalty: "Corporate Member",
      frequentFlyerNo: "",
    },
  };

  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem(`trapple_profile_${user.id || user.username}`) || localStorage.getItem(`travora_profile_${user.id || user.username}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaultProfile;
  });

  const [seat, setSeat] = useState(profile.travelPreferences.seatPreference);
  const [meal, setMeal] = useState(profile.travelPreferences.mealPreference);
  const [frequentFlyer, setFrequentFlyer] = useState(profile.travelPreferences.frequentFlyerNo || "");
  const [hotelLoyalty, setHotelLoyalty] = useState(profile.travelPreferences.hotelLoyalty || "");
  const [phone, setPhone] = useState(profile.phone);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      ...profile,
      phone,
      travelPreferences: {
        ...profile.travelPreferences,
        seatPreference: seat as any,
        mealPreference: meal as any,
        frequentFlyerNo: frequentFlyer,
        hotelLoyalty,
      },
    };

    setProfile(updated);
    localStorage.setItem(`trapple_profile_${user.id || user.username}`, JSON.stringify(updated));
    setSavedSuccess(true);
    toast.success("Travel preferences updated successfully.");
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const upcomingTrips = journeys.filter((j) => j.status === "Approved" || j.status === "Booked").length;
  const pendingTrips = journeys.filter((j) => j.status === "Pending approval").length;
  const completedTrips = journeys.filter((j) => j.status === "Completed").length;

  return (
    <div className="page-stack animate-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Employee workspace</p>
          <h1>Profile & Travel Preferences</h1>
          <p className="page-description">
            Manage your personal profile, frequent flyer perks, meal choices, and seating preferences.
          </p>
        </div>
        <div className="heading-actions">
          <span className="preview-chip">
            <ShieldCheck size={13} /> Verified Corporate Account
          </span>
        </div>
      </div>

      {/* Hero Profile Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0F1A22] via-[#0F172A] to-[#15232D] text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-md border border-white/10">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F2A93B] to-[#E8961C] text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-teal-500/20">
            {(user.username || "TV").slice(0, 2).toUpperCase()}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-white">{profile.name}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F2A93B]/20 text-[#F6BC55] border border-[#F2A93B]/30">
                {profile.role}
              </span>
            </div>
            <p className="text-sm text-[#94A3B8]">
              {profile.designation} · {profile.department}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#E2E8F0] pt-1">
              <span className="flex items-center gap-1.5">
                <Building2 size={13} className="text-[#F2A93B]" /> {profile.officeLocation}
              </span>
              <span className="flex items-center gap-1.5">
                <Mail size={13} className="text-[#F2A93B]" /> {profile.email}
              </span>
            </div>
          </div>
        </div>

        <div className="flex md:flex-col items-center md:items-end gap-3 shrink-0">
          <div className="text-left md:text-right">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#98afaa] block">
              Employee ID
            </span>
            <strong className="text-lg font-mono text-white">{profile.employeeId}</strong>
          </div>
        </div>
      </div>

      {/* Travel Stats Quick Metrics */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon"><Compass size={18} /></span>
            <span className="stat-detail">Lifetime journeys</span>
          </div>
          <strong className="stat-value">{journeys.length}</strong>
          <span className="stat-label">Trips coordinated through Trapple</span>
        </div>

        <div className="stat-card stat-accent">
          <div className="stat-card-top">
            <span className="stat-icon"><CalendarDays size={18} /></span>
            <span className="stat-detail">Upcoming journeys</span>
          </div>
          <strong className="stat-value">{upcomingTrips}</strong>
          <span className="stat-label">Approved or scheduled to depart</span>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon"><Clock3 size={18} /></span>
            <span className="stat-detail">Pending requests</span>
          </div>
          <strong className="stat-value">{pendingTrips}</strong>
          <span className="stat-label">Awaiting manager or desk action</span>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-icon"><CheckCircle2 size={18} /></span>
            <span className="stat-detail">Completed journeys</span>
          </div>
          <strong className="stat-value">{completedTrips}</strong>
          <span className="stat-label">Concluded with full policy compliance</span>
        </div>
      </section>

      {/* Profile Edit Form & Preference Panels */}
      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Travel Preferences */}
          <div className="panel p-6 space-y-5">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">PERSONALIZED FLIGHT SETTINGS</span>
                <h2 className="section-heading">Travel Preferences</h2>
              </div>
              <Plane size={18} className="panel-icon text-[#F2A93B]" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="field">
                <span>Preferred Seating</span>
                <select value={seat} onChange={(e) => setSeat(e.target.value as any)}>
                  <option value="Window">Window Seat</option>
                  <option value="Aisle">Aisle Seat</option>
                  <option value="Middle">Middle Seat</option>
                  <option value="No preference">No preference</option>
                </select>
              </label>

              <label className="field">
                <span>Dietary / Meal Preference</span>
                <select value={meal} onChange={(e) => setMeal(e.target.value as any)}>
                  <option value="Vegetarian">Vegetarian (Asian / Indian)</option>
                  <option value="Non-Vegetarian">Non-Vegetarian (Standard)</option>
                  <option value="Vegan">Strict Vegan</option>
                  <option value="Gluten-Free">Gluten-Free</option>
                  <option value="Standard">Standard Airline Meal</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="field">
                <span>Frequent Flyer Number</span>
                <input
                  value={frequentFlyer}
                  onChange={(e) => setFrequentFlyer(e.target.value)}
                  placeholder="e.g. AI-982312 or SQ-49219"
                />
              </label>

              <label className="field">
                <span>Hotel Loyalty Program ID</span>
                <input
                  value={hotelLoyalty}
                  onChange={(e) => setHotelLoyalty(e.target.value)}
                  placeholder="e.g. Marriott Bonvoy / Taj InnerCircle"
                />
              </label>
            </div>

            <label className="field">
              <span>Primary Contact Phone</span>
              <div className="input-with-icon">
                <Phone size={16} />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </label>

            <div className="flex items-center justify-between pt-2">
              {savedSuccess ? (
                <span className="text-xs text-[#16A34A] flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 size={15} /> Changes saved to your profile
                </span>
              ) : (
                <span className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  Travel desk will automatically apply these preferences during booking.
                </span>
              )}
              <button type="submit" className="button button-primary flex items-center gap-2">
                <Save size={16} /> Save Preferences
              </button>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="panel p-6 space-y-4">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">SAFETY & DUTY OF CARE</span>
                <h2 className="section-heading">Emergency Contact</h2>
              </div>
              <HeartHandshake size={18} className="panel-icon text-red-500" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="admin-request-detail">
                <small>Contact Person</small>
                <strong>{profile.emergencyContact.name}</strong>
              </div>
              <div className="admin-request-detail">
                <small>Relationship</small>
                <strong>{profile.emergencyContact.relation}</strong>
              </div>
              <div className="admin-request-detail">
                <small>Emergency Phone</small>
                <strong>{profile.emergencyContact.phone}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Info & Corporate Policy */}
        <aside className="space-y-6">
          <div className="aside-card aside-dark p-6 space-y-4">
            <div className="flex items-center gap-2 text-[#F2A93B]">
              <ShieldCheck size={20} />
              <h3 className="font-bold text-white text-base">Duty of Care Active</h3>
            </div>
            <p className="text-xs text-[#E2E8F0] leading-relaxed">
              Trapple automatically registers all confirmed bookings with our 24/7 Corporate Medical & Travel Assistance helpline (International SOS).
            </p>
            <div className="pt-2 border-t border-white/10 text-[11px] text-[#94A3B8]">
              24/7 Hotline: +1 (800) 528-7474
            </div>
          </div>

          <div className="panel p-6 space-y-3">
            <span className="card-kicker">TRAVEL DOCUMENT STATUS</span>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-[#E4E7EC] dark:border-[#1E293B]">
                <span className="text-[#667085] dark:text-[#94A3B8]">Passport Validity:</span>
                <strong className="text-[#16A34A]">Valid (Exp: Nov 2031)</strong>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#E4E7EC] dark:border-[#1E293B]">
                <span className="text-[#667085] dark:text-[#94A3B8]">US B1/B2 Visa:</span>
                <strong className="text-[#16A34A]">Active (Exp: 2029)</strong>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#E4E7EC] dark:border-[#1E293B]">
                <span className="text-[#667085] dark:text-[#94A3B8]">Schengen Visa:</span>
                <strong className="text-[#F2A93B]">Eligible for auto-sponsor</strong>
              </div>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
