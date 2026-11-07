import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import type { CellValue } from "../../lib/data/importParser";
import { analyzeSheet, columnLetter, type SheetInput } from "../../lib/data/workbook";

export type RowLink = { id: string; name: string; status?: string };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const isBlank = (v: CellValue | undefined) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** A cell as Excel would show it: dates as 01-Sep-2026, money with Indian grouping, long IDs untouched. */
export function cellText(v: CellValue | undefined, isMoney = false): string {
  if (isBlank(v)) return "";
  if (v instanceof Date) {
    const d = `${String(v.getUTCDate()).padStart(2, "0")}-${MON[v.getUTCMonth()]}-${v.getUTCFullYear()}`;
    const h = v.getUTCHours(), m = v.getUTCMinutes();
    return h || m ? `${d} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : d;
  }
  if (typeof v === "number") return isMoney ? money.format(v) : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return String(v);
}

type Prepared = {
  name: string; width: number; rows: CellValue[][]; headerRow: number; firstRow: number; lastRow: number;
  moneyCols: Set<number>; total: number | null; dataRows: number; spans: Map<string, number>; hidden: Set<string>;
};

function prepare(sheet: SheetInput): Prepared {
  const rows = sheet.rows.map((r) => r ?? []);
  let last = rows.length - 1;
  while (last >= 0 && !rows[last].some((c) => !isBlank(c))) last--;
  const used = rows.slice(0, last + 1);
  let width = 0;
  for (const r of used) for (let c = r.length - 1; c >= 0; c--) if (!isBlank(r[c])) { width = Math.max(width, c + 1); break; }
  const plan = analyzeSheet(sheet);
  const moneyCols = new Set(plan.columns.filter((c) => c.field === "amount").map((c) => c.index));
  let total: number | null = null;
  if (plan.status === "data" && moneyCols.size) {
    total = 0;
    for (let r = plan.firstRow - 1; r <= plan.lastRow - 1; r++) {
      for (const c of Array.from(moneyCols)) {
        const v = used[r]?.[c];
        const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
        if (Number.isFinite(n) && !(typeof v === "string" && !/\d/.test(v))) total += n;
      }
    }
    total = Math.round(total * 100) / 100;
  }
  // Merged cells: the top-left cell spans the columns, the rest are hidden (titles like "AIR TICKETS").
  const spans = new Map<string, number>();
  const hidden = new Set<string>();
  for (const m of sheet.merges) {
    if (m.r0 > last) continue;
    if (m.r0 === m.r1) {
      spans.set(`${m.r0}:${m.c0}`, Math.min(m.c1, width - 1) - m.c0 + 1);
      for (let c = m.c0 + 1; c <= m.c1; c++) hidden.add(`${m.r0}:${c}`);
    }
  }
  return { name: sheet.name, width, rows: used, headerRow: plan.headerRow, firstRow: plan.firstRow, lastRow: plan.lastRow, moneyCols, total, dataRows: plan.dataRows, spans, hidden };
}

/**
 * Shows an uploaded workbook (or the tables read from a PDF) the way it looks
 * in Excel: one tab per sheet, row numbers and column letters, the heading row
 * in bold, merged titles, and the total of the cost column. Rows that became a
 * trip show who they were matched to, with a link to that employee.
 */
export function WorkbookViewer({ sheets, links = {}, note }: { sheets: SheetInput[]; links?: Record<string, RowLink>; note?: string }) {
  const prepared = useMemo(() => sheets.map(prepare).filter((p) => p.width > 0), [sheets]);
  const empty = sheets.length - prepared.length;
  const [active, setActive] = useState(0);
  const [q, setQ] = useState("");
  const sheet = prepared[Math.min(active, prepared.length - 1)];
  const hasLinks = Object.keys(links).length > 0;

  if (!sheet) return <p className="text-sm opacity-70 p-4">This file has no filled sheets.</p>;
  const term = q.trim().toLowerCase();
  const visible = sheet.rows.map((r, i) => ({ r, i })).filter(({ r, i }) =>
    !term || i < sheet.headerRow || r.some((c) => cellText(c).toLowerCase().includes(term)) || (links[`${sheet.name}|${i + 1}`]?.name ?? "").toLowerCase().includes(term));
  const shown = visible.slice(0, 3000);

  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--line)" }} role="tablist" aria-label="Sheets">
        {prepared.map((p, i) => (
          <button key={p.name} type="button" role="tab" aria-selected={i === active}
            className={`px-3 py-2 text-xs font-semibold border-b-2 ${i === active ? "border-orange-500" : "border-transparent opacity-70 hover:opacity-100"}`}
            onClick={() => setActive(i)}>
            {p.name}{p.dataRows ? <span className="opacity-60 font-normal"> · {p.dataRows}</span> : null}
          </button>
        ))}
        {empty > 0 && <span className="text-xs opacity-60 px-2">{empty} empty sheet{empty === 1 ? "" : "s"} not shown</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="opacity-70">{sheet.rows.length} rows · {sheet.width} columns{sheet.total !== null ? <> · <strong>Total cost {money.format(sheet.total)}</strong></> : null}</span>
        {note && <span className="opacity-60">{note}</span>}
        <label className="ml-auto flex items-center gap-2 field m-0 min-w-[220px]">
          <span className="sr-only">Search this sheet</span>
          <Search size={13} className="opacity-60" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this sheet" />
        </label>
      </div>
      <div className="overflow-auto border rounded" style={{ borderColor: "var(--line)", maxHeight: "70vh" }}>
        <table className="workbook-grid text-xs" style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <thead>
            <tr>
              <th style={cornerStyle}></th>
              {hasLinks && <th style={{ ...letterStyle, minWidth: 150 }}>Matched employee</th>}
              {Array.from({ length: sheet.width }, (_, c) => <th key={c} style={letterStyle}>{columnLetter(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ r, i }) => {
              const isHeader = i + 1 === sheet.headerRow;
              const link = links[`${sheet.name}|${i + 1}`];
              return (
                <tr key={i} style={isHeader ? { background: "var(--surface-muted, rgba(29,78,137,.08))", fontWeight: 700 } : undefined}>
                  <td style={rowNumStyle}>{i + 1}</td>
                  {hasLinks && (
                    <td style={cellStyle}>
                      {link ? <Link href={`/travel/employees/${link.id}`} className="font-semibold underline">{link.name}</Link> : isHeader ? "Matched employee" : ""}
                    </td>
                  )}
                  {Array.from({ length: sheet.width }, (_, c) => {
                    const key = `${i}:${c}`;
                    if (sheet.hidden.has(key)) return null;
                    const span = sheet.spans.get(key);
                    const isMoney = sheet.moneyCols.has(c) && i + 1 >= sheet.firstRow;
                    return (
                      <td key={c} colSpan={span} style={{ ...cellStyle, textAlign: isMoney || (typeof r[c] === "number" && !isHeader) ? "right" : undefined, fontWeight: span ? 700 : undefined }}>
                        {cellText(r[c], isMoney)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {sheet.total !== null && !term && (
              <tr style={{ fontWeight: 700 }}>
                <td style={rowNumStyle}></td>
                {hasLinks && <td style={cellStyle}></td>}
                {Array.from({ length: sheet.width }, (_, c) => (
                  <td key={c} style={{ ...cellStyle, textAlign: "right" }}>{sheet.moneyCols.has(c) ? money.format(sheet.total ?? 0) : c === 0 ? "Total" : ""}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {visible.length > shown.length && <p className="text-xs opacity-60">Showing the first {shown.length} of {visible.length} rows. Search to find the rest.</p>}
    </div>
  );
}

const cellStyle: React.CSSProperties = { border: "1px solid var(--line)", padding: "4px 8px", whiteSpace: "nowrap", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "top" };
const letterStyle: React.CSSProperties = { ...cellStyle, position: "sticky", top: 0, zIndex: 1, background: "var(--surface)", color: "var(--ink-muted, #6b7280)", fontWeight: 600, textAlign: "center" };
const cornerStyle: React.CSSProperties = { ...letterStyle, left: 0, zIndex: 2, minWidth: 36 };
const rowNumStyle: React.CSSProperties = { ...cellStyle, position: "sticky", left: 0, background: "var(--surface)", color: "var(--ink-muted, #6b7280)", textAlign: "right", minWidth: 36 };
