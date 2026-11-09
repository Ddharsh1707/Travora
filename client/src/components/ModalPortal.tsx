import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FIELDS = "input:not([type=hidden]):not([disabled]):not([type=checkbox]):not([type=radio]), select:not([disabled]), textarea:not([disabled])";

/**
 * Shows a pop-up form on top of the screen the user is looking at.
 *
 * Pages animate in with a CSS transform, and a transformed parent makes
 * `position: fixed` stick to the page instead of the screen. The form then
 * opened in the middle of a long page and people had to scroll to find it.
 * Rendering into <body> avoids that. It also stops the page behind from
 * scrolling and puts the cursor in the first field.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = document.body;
    const before = body.style.overflow;
    body.style.overflow = "hidden";
    const focusFirst = window.setTimeout(() => {
      const root = holder.current;
      if (!root || root.contains(document.activeElement)) return;
      const field = root.querySelector<HTMLElement>(FIELDS);
      const target = field ?? root.querySelector<HTMLElement>("button:not(.dialog-close), [href], [tabindex]:not([tabindex='-1'])");
      target?.focus({ preventScroll: true });
    }, 30);
    return () => {
      window.clearTimeout(focusFirst);
      body.style.overflow = before;
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(<div ref={holder} className="modal-portal">{children}</div>, document.body);
}
