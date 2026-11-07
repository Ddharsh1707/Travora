import { cellText, generatedText, pdfSafe, reportToCsv, sheetName, type ReportDoc } from "./reportDoc";

/** Turns a built report into a CSV, Excel or PDF download. */

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(doc: ReportDoc) {
  // The byte-order mark lets Excel open the file as UTF-8 (names, the rupee sign).
  save(new Blob(["﻿", reportToCsv(doc)], { type: "text/csv;charset=utf-8" }), `${doc.fileName}.csv`);
}

const MONEY_FORMAT = "#,##0";

export async function downloadExcel(doc: ReportDoc) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const about: (string | number)[][] = [
    [doc.title], [doc.subtitle], [],
    ["Generated", generatedText(doc.generatedAt)],
    ["Covers", doc.scope],
    ...doc.filters.map(([k, v]) => [k, v]),
    [], ["Headline numbers"], ...doc.highlights.map((h) => [h.label, h.value]),
    [], ["How this was calculated"], ...doc.methodology.map((m) => [m]),
    [], ["Data completeness"], ...doc.completeness.map((m) => [m]),
    [], ["Sheets in this file"], ...doc.sections.map((s) => [s.title, s.note ?? ""]),
  ];
  const aboutSheet = XLSX.utils.aoa_to_sheet(about);
  aboutSheet["!cols"] = [{ wch: 34 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, aboutSheet, sheetName("About this report", used));

  for (const s of doc.sections) {
    const rows: (string | number | null)[][] = [s.columns.map((c) => c.label), ...s.rows, ...(s.total ? [s.total] : [])];
    const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((v) => (v == null ? "" : v))));
    s.columns.forEach((c, ci) => {
      if (c.kind !== "money") return;
      for (let ri = 1; ri < rows.length; ri++) {
        const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
        if (cell && cell.t === "n") cell.z = MONEY_FORMAT;
      }
    });
    ws["!cols"] = s.columns.map((c, ci) => ({ wch: Math.min(48, Math.max(c.label.length + 2, ...rows.slice(1).map((r) => String(r[ci] ?? "").length + 2))) }));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, s.rows.length), c: s.columns.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, sheetName(s.title, used));
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  save(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${doc.fileName}.xlsx`);
}

const INK: [number, number, number] = [23, 37, 61];
const SAFFRON: [number, number, number] = [234, 118, 0];
const SOFT: [number, number, number] = [100, 116, 139];

export async function downloadPdf(doc: ReportDoc) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const M = 36;
  const t = (s: string) => pdfSafe(s);
  const lastY = () => (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? M;
  const ensure = (y: number, need: number) => {
    if (y + need > pdf.internal.pageSize.getHeight() - 40) { pdf.addPage(); return M; }
    return y;
  };

  // Title block
  pdf.setFillColor(...SAFFRON);
  pdf.rect(0, 0, W, 6, "F");
  pdf.setTextColor(...SOFT).setFont("helvetica", "bold").setFontSize(8).text("TRAPPLE · BUSINESS INTELLIGENCE".replace("·", "-"), M, M);
  pdf.setTextColor(...INK).setFontSize(20).text(t(doc.title), M, M + 22);
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(...SOFT).text(t(doc.subtitle), M, M + 38);
  const meta = [`Generated ${generatedText(doc.generatedAt)}`, `Covers ${doc.scope}`, ...doc.filters.map(([k, v]) => `${k}: ${v}`)].map(t).join("   |   ");
  pdf.setFontSize(8).text(pdf.splitTextToSize(meta, W - 2 * M), M, M + 52);

  // Headline numbers as a strip of boxes
  let y = M + 74;
  const boxW = (W - 2 * M - 5 * 8) / 6;
  doc.highlights.slice(0, 6).forEach((h, i) => {
    const x = M + i * (boxW + 8);
    pdf.setDrawColor(226, 232, 240).setFillColor(248, 250, 252).roundedRect(x, y, boxW, 44, 4, 4, "FD");
    pdf.setFontSize(7).setTextColor(...SOFT).text(t(h.label.toUpperCase()), x + 8, y + 14);
    pdf.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK).text(pdf.splitTextToSize(t(h.value), boxW - 16)[0], x + 8, y + 32);
    pdf.setFont("helvetica", "normal");
  });
  y += 62;

  for (const s of doc.sections) {
    y = ensure(y, 70);
    pdf.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK).text(t(s.title), M, y);
    y += 6;
    if (s.note) {
      const lines = pdf.splitTextToSize(t(s.note), W - 2 * M);
      pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...SOFT).text(lines, M, y + 9);
      y += 9 * lines.length + 2;
    }
    const right = s.columns.map((c) => c.kind !== "text");
    autoTable(pdf, {
      startY: y + 4,
      margin: { left: M, right: M },
      head: [s.columns.map((c) => t(c.label))],
      body: s.rows.length ? s.rows.map((r) => r.map((v, i) => t(cellText(v, s.columns[i].kind, doc.currency)))) : [[{ content: "No rows for these filters.", colSpan: s.columns.length }]],
      foot: s.total ? [s.total.map((v, i) => t(v == null ? "" : cellText(v, s.columns[i].kind, doc.currency)))] : undefined,
      showFoot: "lastPage",
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.5, textColor: INK },
      headStyles: { fillColor: INK, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: Object.fromEntries(right.map((r, i) => [i, { halign: r ? "right" : "left" }])),
      didParseCell: (d) => { if (d.section !== "body" && right[d.column.index]) d.cell.styles.halign = "right"; },
    });
    y = lastY() + 22;
  }

  const notes = (title: string, lines: string[]) => {
    y = ensure(y, 60);
    pdf.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK).text(title, M, y);
    y += 14;
    pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(...INK);
    for (const l of lines) {
      const wrapped = pdf.splitTextToSize(t(l), W - 2 * M - 12);
      y = ensure(y, 12 * wrapped.length);
      pdf.text("-", M, y);
      pdf.text(wrapped, M + 10, y);
      y += 12 * wrapped.length + 2;
    }
    y += 12;
  };
  notes("Data completeness", doc.completeness);
  notes("How this was calculated", doc.methodology);

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7).setTextColor(...SOFT);
    const H = pdf.internal.pageSize.getHeight();
    pdf.text(t(`${doc.title} - ${doc.subtitle}`), M, H - 18);
    pdf.text(`Page ${p} of ${pages}`, W - M, H - 18, { align: "right" });
  }
  pdf.save(`${doc.fileName}.pdf`);
}
