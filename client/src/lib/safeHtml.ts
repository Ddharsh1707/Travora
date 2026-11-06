/**
 * Helpers for the few places that build HTML or open files in a new window.
 * Record values (names, PNRs, places) come from users and must never be
 * treated as markup.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_ATTACHMENT = /^data:(application\/pdf|image\/(png|jpe?g|webp|gif));base64,[A-Za-z0-9+/=\s]+$/i;

/** True only for base64 PDF / image data URLs, the formats bookings store. */
export function isSafeAttachment(dataUrl: unknown): dataUrl is string {
  return typeof dataUrl === "string" && SAFE_ATTACHMENT.test(dataUrl);
}

/**
 * Opens a stored attachment in a new tab. Builds the frame with DOM calls
 * instead of writing an HTML string, and refuses anything that is not a
 * PDF or image data URL (so a crafted value cannot inject markup or script).
 */
export function openAttachment(dataUrl: unknown, title: string): boolean {
  if (!isSafeAttachment(dataUrl)) return false;
  const w = window.open("");
  if (!w) return false;
  w.opener = null;
  w.document.title = title;
  const frame = w.document.createElement("iframe");
  frame.src = dataUrl;
  frame.setAttribute("style", "width:100vw;height:100vh;border:none;");
  w.document.body.style.margin = "0";
  w.document.body.appendChild(frame);
  return true;
}
