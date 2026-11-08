import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, LogOut, X } from "lucide-react";
import { Link } from "wouter";
import { isRailLinkActive, railLinks, type RailEntry, type RailLink, type RailSection } from "../pages/travel/routes";

type Props = {
  sections: RailSection[];
  path: string;
  userName: string;
  userCode: string;
  roleLabel: string;
  onLogout: () => void;
  logo: ReactNode;
  /** "rail": slim desktop rail with fly-outs. "drawer": phone menu with drop-down arrows. */
  variant: "rail" | "drawer";
  onClose?: () => void;
};

const sectionActive = (s: RailSection, path: string) => s.entries.some((e) => railLinks(e).some((l) => isRailLinkActive(l, path)));
const entryActive = (e: RailEntry, path: string) => railLinks(e).some((l) => isRailLinkActive(l, path));
const directLink = (s: RailSection): RailLink | null => (s.entries.length === 1 && !("children" in s.entries[0]) ? s.entries[0] : null);

/**
 * The app menu as a slim icon rail (icon with its name under it). Pointing at
 * or tapping a section opens its pages in a fly-out beside the rail; entries
 * with an arrow open one more fly-out. On phones the same menu is a drawer
 * with drop-down arrows.
 */
export function NavRail(props: Props) {
  return props.variant === "drawer" ? <DrawerMenu {...props} /> : <Rail {...props} />;
}

function Rail({ sections, path, userName, userCode, roleLabel, onLogout, logo }: Props) {
  const [open, setOpen] = useState<{ key: string; top: number } | null>(null);
  const [sub, setSub] = useState<{ label: string; top: number; left: number } | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const railRef = useRef<HTMLElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const close = useCallback(() => { cancelClose(); setOpen(null); setSub(null); }, []);
  const closeSoon = () => { cancelClose(); closeTimer.current = window.setTimeout(close, 180); };

  useEffect(() => close(), [path, close]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!railRef.current?.contains(t) && !flyRef.current?.contains(t)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, close]);
  useEffect(() => () => cancelClose(), []);

  const openFor = (s: RailSection, el: HTMLElement) => {
    cancelClose();
    const top = Math.min(el.getBoundingClientRect().top, window.innerHeight - 60 - s.entries.length * 40);
    setOpen((o) => (o?.key === s.key ? o : { key: s.key, top: Math.max(8, top) }));
    setSub(null);
  };

  const subAt = (label: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { label, top: r.top - 6, left: r.right };
  };

  const current = open ? sections.find((s) => s.key === open.key) : undefined;
  const subEntry = current?.entries.find((e) => "children" in e && e.label === sub?.label) as { label: string; children: RailLink[] } | undefined;
  const initials = (userName || "Trapple").slice(0, 2).toUpperCase();

  return (
    <aside className="nav-rail" ref={railRef} aria-label="Main menu">
      <div className="nav-rail-logo">{logo}</div>
      <nav className="nav-rail-items">
        {sections.map((s) => {
          const active = sectionActive(s, path);
          const direct = directLink(s);
          const isOpen = open?.key === s.key;
          const body = (
            <>
              <span className="nav-rail-icon">{s.icon}</span>
              <span className="nav-rail-label">{s.label}</span>
            </>
          );
          return direct ? (
            <Link
              key={s.key}
              href={direct.href}
              className={`nav-rail-item ${active ? "active" : ""}`}
              title={direct.label}
              aria-current={active ? "page" : undefined}
              onMouseEnter={close}
            >
              {body}
            </Link>
          ) : (
            <button
              key={s.key}
              type="button"
              className={`nav-rail-item ${active ? "active" : ""} ${isOpen ? "open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onMouseEnter={(e) => openFor(s, e.currentTarget)}
              onMouseLeave={closeSoon}
              onFocus={(e) => openFor(s, e.currentTarget)}
              onClick={(e) => (isOpen ? close() : openFor(s, e.currentTarget))}
            >
              {body}
              <ChevronRight size={11} className="nav-rail-caret" aria-hidden="true" />
            </button>
          );
        })}
      </nav>
      <div className="nav-rail-foot">
        <span className="nav-rail-avatar" title={`${userName} · ${roleLabel}${userCode ? ` · ${userCode}` : ""}`}>{initials}</span>
        <span className="nav-rail-role">{roleLabel}</span>
        <button type="button" className="nav-rail-logout" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
      </div>

      {current && open && createPortal(
        <div ref={flyRef} className="nav-flyout-layer" onMouseEnter={cancelClose} onMouseLeave={closeSoon}>
          <div className="nav-flyout" role="menu" aria-label={current.label} style={{ top: open.top }}>
            <div className="nav-flyout-title">{current.label}</div>
            {current.entries.map((e) => {
              const active = entryActive(e, path);
              if ("children" in e) {
                const expanded = sub?.label === e.label;
                return (
                  <button
                    key={e.label}
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={expanded}
                    className={`nav-flyout-item ${active ? "active" : ""} ${expanded ? "open" : ""}`}
                    onMouseEnter={(ev) => setSub(subAt(e.label, ev.currentTarget))}
                    onFocus={(ev) => setSub(subAt(e.label, ev.currentTarget))}
                    onClick={(ev) => setSub(expanded ? null : subAt(e.label, ev.currentTarget))}
                  >
                    <span>{e.label}</span>
                    <ChevronRight size={14} />
                  </button>
                );
              }
              return (
                <Link key={e.href} href={e.href} role="menuitem" className={`nav-flyout-item ${active ? "active" : ""}`} onMouseEnter={() => setSub(null)} onClick={close}>
                  <span>{e.label}</span>
                </Link>
              );
            })}
          </div>
          {subEntry && sub && (
            <div className="nav-flyout nav-flyout-sub" role="menu" aria-label={subEntry.label} style={{ top: sub.top, left: sub.left }}>
              {subEntry.children.map((l) => (
                <Link key={l.href} href={l.href} role="menuitem" className={`nav-flyout-item ${isRailLinkActive(l, path) ? "active" : ""}`} onClick={close}>
                  <span>{l.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </aside>
  );
}

function DrawerMenu({ sections, path, userName, userCode, roleLabel, onLogout, logo, onClose }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(sections.filter((s) => sectionActive(s, path)).flatMap((s) => [
    s.key,
    ...s.entries.filter((e) => "children" in e && entryActive(e, path)).map((e) => `${s.key}/${e.label}`),
  ])));
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const initials = (userName || "Trapple").slice(0, 2).toUpperCase();

  const linkRow = (l: RailLink, depth: number) => (
    <Link key={l.href} href={l.href} onClick={onClose} className={`nav-drawer-link depth-${depth} ${isRailLinkActive(l, path) ? "active" : ""}`}>{l.label}</Link>
  );

  return (
    <aside className="nav-drawer" aria-label="Main menu">
      <div className="nav-drawer-top">
        {logo}
        <button type="button" className="nav-drawer-close" aria-label="Close navigation" onClick={onClose}><X size={18} /></button>
      </div>
      <nav className="nav-drawer-items">
        {sections.map((s) => {
          const direct = directLink(s);
          const active = sectionActive(s, path);
          if (direct) {
            return (
              <Link key={s.key} href={direct.href} onClick={onClose} className={`nav-drawer-section ${active ? "active" : ""}`}>
                <span className="nav-rail-icon">{s.icon}</span><span className="flex-1">{direct.label}</span>
              </Link>
            );
          }
          const isOpen = open.has(s.key);
          return (
            <div key={s.key}>
              <button type="button" className={`nav-drawer-section ${active ? "active" : ""}`} aria-expanded={isOpen} onClick={() => toggle(s.key)}>
                <span className="nav-rail-icon">{s.icon}</span><span className="flex-1 text-left">{s.label}</span>
                <ChevronDown size={15} className={`nav-drawer-caret ${isOpen ? "open" : ""}`} />
              </button>
              {isOpen && (
                <div className="nav-drawer-sub">
                  {s.entries.map((e) => {
                    if (!("children" in e)) return linkRow(e, 1);
                    const k = `${s.key}/${e.label}`;
                    const subOpen = open.has(k);
                    return (
                      <div key={k}>
                        <button type="button" className={`nav-drawer-link depth-1 ${entryActive(e, path) ? "active-parent" : ""}`} aria-expanded={subOpen} onClick={() => toggle(k)}>
                          <span className="flex-1 text-left">{e.label}</span>
                          <ChevronDown size={14} className={`nav-drawer-caret ${subOpen ? "open" : ""}`} />
                        </button>
                        {subOpen && e.children.map((l) => linkRow(l, 2))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="nav-drawer-foot">
        <span className="nav-rail-avatar">{initials}</span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate">{userName}</strong>
          <span className="block truncate text-[11px] opacity-60">{roleLabel}{userCode ? ` · ${userCode}` : ""}</span>
        </span>
        <button type="button" className="nav-rail-logout" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
      </div>
    </aside>
  );
}
