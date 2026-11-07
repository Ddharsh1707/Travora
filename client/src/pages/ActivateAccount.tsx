import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Plane,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { usersApi, type TokenVerificationResult } from "@/lib/api";

export function ActivateAccount() {
  const [, setLocation] = useLocation();

  // Parse token from query parameter
  const [token, setToken] = useState<string>("");
  const [verifying, setVerifying] = useState<boolean>(true);
  const [tokenInfo, setTokenInfo] = useState<TokenVerificationResult | null>(null);

  // Form state
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tokenParam = searchParams.get("token") || "";
    setToken(tokenParam);

    if (!tokenParam.trim()) {
      setVerifying(false);
      setTokenInfo({
        valid: false,
        message: "No activation token was provided in the link. Please check your activation email or link.",
      });
      return;
    }

    usersApi
      .verifyToken(tokenParam)
      .then((res) => {
        setTokenInfo(res);
      })
      .catch((err) => {
        setTokenInfo({
          valid: false,
          message: err.message || "Failed to verify activation token.",
        });
      })
      .finally(() => {
        setVerifying(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setSubmitting(true);
    try {
      await usersApi.activate(token, password);
      setSuccess(true);
      toast.success("Account activated successfully! You can now sign in.");
    } catch (err: any) {
      setError(err.message || "Failed to activate account. The link may have expired.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page min-h-screen flex flex-col justify-center items-center p-4 bg-[#070D18]">
      {/* Brand Header */}
      <div className="login-brand mb-6 flex flex-col items-center text-center">
        <div className="brand-lockup flex items-center gap-2 mb-2">
          <span className="brand-mark w-9 h-9 rounded-xl bg-[#F28C28] flex items-center justify-center text-[#070D18] shadow-lg shadow-[#F28C28]/20">
            <Plane size={20} strokeWidth={2.4} />
          </span>
          <span className="brand-name text-2xl font-bold tracking-tight text-white">travora</span>
        </div>
        <span className="text-xs font-semibold text-[#94A3B8]">
          Corporate Travel & Expense Management · Account Setup
        </span>
      </div>

      <div className="w-full max-w-md bg-[#0F172A] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95">
        {verifying ? (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-3 text-[#94A3B8]">
            <Loader2 size={32} className="animate-spin text-[#F28C28]" />
            <p className="text-sm font-medium">Validating your activation link...</p>
          </div>
        ) : success ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 mx-auto">
              <CheckCircle2 size={30} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Password Set Successfully!</h2>
              <p className="text-xs text-[#94A3B8] mt-1.5">
                Your account is fully activated. You can now log into Travora with your work email and newly set password.
              </p>
            </div>

            <button
              type="button"
              className="button button-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 mt-4"
              onClick={() => setLocation("/login")}
            >
              <span>Proceed to Sign In</span>
              <ArrowRight size={16} />
            </button>
          </div>
        ) : !tokenInfo?.valid ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30 mx-auto">
              <AlertCircle size={30} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Invalid or Expired Link</h2>
              <p className="text-xs text-[#94A3B8] mt-1.5 leading-relaxed">
                {tokenInfo?.message || "This activation link is invalid, has already been used, or has expired."}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 text-xs text-[#CBD5E1] text-left space-y-1">
              <span className="font-semibold text-white block">Next Steps:</span>
              <p className="text-[11px] text-[#94A3B8]">
                Please contact your organization's Travel Desk or System Administrator to request a fresh activation link.
              </p>
            </div>

            <button
              type="button"
              className="button button-outline w-full py-2.5 text-xs text-[#94A3B8] hover:text-white"
              onClick={() => setLocation("/login")}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <div>
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[#F28C28]/20 text-[#F6A85A] flex items-center justify-center border border-[#F28C28]/30 mx-auto mb-3">
                <KeyRound size={22} />
              </div>
              <h2 className="text-xl font-bold text-white">Activate Your Account</h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                Welcome, <strong className="text-white">{tokenInfo.name}</strong>! Choose your password to complete setup for{" "}
                <span className="font-mono text-white">{tokenInfo.username}</span>.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                  New Password <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 pr-10 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F28C28]"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-white"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#CBD5E1] mb-1">
                  Confirm Password <span className="text-rose-400">*</span>
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#F28C28]"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 flex items-center gap-2 text-[11px] text-[#94A3B8]">
                <ShieldCheck size={14} className="text-[#F28C28] shrink-0" />
                <span>Choose a secure password not shared across other sites.</span>
              </div>

              <button
                type="submit"
                className="button button-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#F28C28]/20 mt-2"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Activating Account...</span>
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    <span>Set Password & Activate</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
