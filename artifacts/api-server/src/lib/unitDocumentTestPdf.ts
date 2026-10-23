/** Small text PDF fixture; no storage or AI provider needed in route tests. */
export function unitDocumentTestPdf(lines: string[], pageCount = 1) {
  const stream = `BT /F1 12 Tf 40 760 Td ${lines.map((line, index) =>
    `${index ? "0 -20 Td " : ""}(${line.replace(/[\\()]/g, value => `\\${value}`)}) Tj`).join("\n")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [3 0 R ${Array.from({ length: pageCount - 1 }, (_, i) => `${i + 6} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  for (let page = 1; page < pageCount; page++) objects.push(objects[2]);
  let content = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(content);
}
