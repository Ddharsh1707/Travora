import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { answerReport } from "../lib/assistantReport";
import type { RecordSet } from "../lib/data/assistant";

type Format = "xlsx" | "csv" | "pdf";

/** Excel, CSV and PDF buttons for one assistant answer and the records behind it. */
export function AnswerDownloads({ question, answer, records, className = "" }: { question: string; answer: string; records?: RecordSet[]; className?: string }) {
  const [busy, setBusy] = useState<Format | null>(null);
  const rows = (records ?? []).reduce((n, r) => n + r.rows.length, 0);

  const download = async (format: Format) => {
    setBusy(format);
    try {
      const doc = answerReport(question, answer, records ?? []);
      const files = await import("../lib/reportFiles");
      if (format === "xlsx") await files.downloadExcel(doc);
      else if (format === "pdf") await files.downloadPdf(doc);
      else files.downloadCsv(doc);
    } catch {
      toast.error("Could not make the file. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      <span className="inline-flex items-center gap-1 opacity-70"><Download size={11} /> {rows ? `Download (${rows} row${rows === 1 ? "" : "s"})` : "Download"}</span>
      {(["xlsx", "csv", "pdf"] as const).map((f) => (
        <button key={f} type="button" disabled={!!busy} onClick={() => download(f)}
          className="px-1.5 py-0.5 rounded border border-current/20 hover:border-emerald-400 hover:text-emerald-400 disabled:opacity-50 transition-colors"
          title={`Download this answer as ${f === "xlsx" ? "Excel" : f.toUpperCase()}`}>
          {busy === f ? "..." : f === "xlsx" ? "Excel" : f.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
