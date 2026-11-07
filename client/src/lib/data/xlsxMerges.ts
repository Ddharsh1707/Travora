/**
 * Reads merged-cell ranges from an .xlsx file (read-excel-file does not expose
 * them). A merged cost cell means one cost shared by several rows, so it must
 * be counted once, not treated as "missing" on the other rows.
 * Returns {} when anything looks unusual; the upload then works without merges.
 */
import { unzipSync, strFromU8 } from "fflate";
import type { Merge } from "./workbook";

const MAX_XML = 20 * 1024 * 1024;

function decodeRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/.exec(ref.trim().toUpperCase());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'") : "";
};

export function readMerges(bytes: Uint8Array): Record<string, Merge[]> {
  try {
    let total = 0;
    const files = unzipSync(bytes, {
      filter: (f) => {
        const ok = f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" || /^xl\/worksheets\/[^/]+\.xml$/.test(f.name);
        if (ok) total += f.originalSize;
        return ok && total < MAX_XML;
      },
    });
    const wb = files["xl/workbook.xml"];
    const rels = files["xl/_rels/workbook.xml.rels"];
    if (!wb || !rels) return {};
    const targets = new Map<string, string>();
    for (const tag of strFromU8(rels).match(/<Relationship\b[^>]*>/g) ?? []) {
      let t = attr(tag, "Target").replace(/^\/?xl\//, "").replace(/^\//, "");
      targets.set(attr(tag, "Id"), `xl/${t}`);
    }
    const out: Record<string, Merge[]> = {};
    for (const tag of strFromU8(wb).match(/<sheet\b[^>]*>/g) ?? []) {
      const name = attr(tag, "name");
      const path = targets.get(attr(tag, "r:id"));
      const xml = path ? files[path] : undefined;
      if (!name || !xml) continue;
      const merges: Merge[] = [];
      for (const m of strFromU8(xml).match(/<mergeCell\b[^>]*>/g) ?? []) {
        const [a, b] = attr(m, "ref").split(":");
        const s = decodeRef(a);
        const e = decodeRef(b ?? a);
        if (s && e && merges.length < 5000) merges.push({ r0: Math.min(s.r, e.r), c0: Math.min(s.c, e.c), r1: Math.max(s.r, e.r), c1: Math.max(s.c, e.c) });
      }
      out[name] = merges;
    }
    return out;
  } catch {
    return {};
  }
}
