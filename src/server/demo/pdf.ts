/** Tiny PDF writer for demo documents and demo floor plans (Latin text + vector graphics). */
function esc(s: string) {
  return s
    .replace(/[—–]/g, "-")
    .replace(/[ʻʼ‘’`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/×/g, "x")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7e]/g, "?");
}

export function simplePdf(opts: { title: string; lines?: string[]; graphics?: string; landscape?: boolean }): Buffer {
  const [w, h] = opts.landscape ? [842, 595] : [595, 842];
  const text = [
    "BT",
    "/F1 16 Tf",
    `40 ${h - 50} Td`,
    `(${esc(opts.title)}) Tj`,
    "/F1 10 Tf",
    ...(opts.lines ?? []).flatMap((l) => ["0 -18 Td", `(${esc(l)}) Tj`]),
    "ET",
  ].join("\n");
  const stream = `${opts.graphics ?? ""}\n${text}`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A simple floor plan (rooms, corridor, duct run) in landscape A4 user space. */
export function floorPlanGraphics(): string {
  const rooms = [
    [60, 330, 180, 170],
    [240, 330, 180, 170],
    [420, 330, 180, 170],
    [600, 330, 180, 170],
    [60, 90, 240, 180],
    [300, 90, 240, 180],
    [540, 90, 240, 180],
  ];
  const ops = ["0.6 w", "0.2 0.2 0.2 RG"];
  for (const [x, y, rw, rh] of rooms) ops.push(`${x} ${y} ${rw} ${rh} re S`);
  ops.push("1.2 w", "40 70 760 450 re S");
  // corridor
  ops.push("0.85 0.85 0.85 rg", "60 270 720 60 re f", "0 0 0 rg");
  // main duct run
  ops.push("0.1 0.4 0.8 RG", "3 w", "80 300 m 760 300 l S", "1.5 w");
  for (const x of [150, 330, 510, 690]) ops.push(`${x} 300 m ${x} 400 l S`, `${x} 300 m ${x} 200 l S`);
  return ops.join("\n");
}
