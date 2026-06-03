import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { saveAs } from "file-saver";

function parseAppealToParagraphs(text: string): Paragraph[] {
  const lines = text.split("\n");
  const paragraphs: Paragraph[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      paragraphs.push(new Paragraph({ children: [new TextRun("")], spacing: { after: 120 } }));
      continue;
    }
    const isHeading =
      /^RE:/i.test(line.trim()) ||
      /^NOTICE OF/i.test(line.trim()) ||
      (line.trim() === line.trim().toUpperCase() && line.trim().length > 4 && !/^\d/.test(line.trim()));
    if (isHeading) {
      paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: line.trim(), bold: true, size: 24, font: "Times New Roman" })]
      }));
      continue;
    }
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 120 },
      children: [new TextRun({ text: line, size: 24, font: "Times New Roman" })]
    }));
  }
  return paragraphs;
}

export async function exportAppealAsDocx(appealText: string, ticketNumber?: string): Promise<void> {
  const doc = new Document({
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: parseAppealToParagraphs(appealText)
    }]
  });
  const buffer = await Packer.toBlob(doc);
  saveAs(buffer, ticketNumber ? `appeal_${ticketNumber}.docx` : "appeal_letter.docx");
}

export async function exportAppealAsPdf(
  appealText: string,
  ticketNumber?: string
): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const margin = 72
  const pageWidth = 612
  const maxWidth = pageWidth - margin * 2
  const lineHeight = 16
  let y = margin

  const lines = appealText.split("\n")
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.trim() === "") { y += lineHeight * 0.6; continue }
    const isHeading = /^RE:/i.test(line.trim()) ||
      (line.trim() === line.trim().toUpperCase() && line.trim().length > 4 && !/^\d/.test(line.trim()))
    doc.setFont("Times", isHeading ? "bold" : "normal")
    doc.setFontSize(12)
    const wrapped = doc.splitTextToSize(line, maxWidth)
    for (const wline of wrapped) {
      if (y > 740) { doc.addPage(); y = margin }
      doc.text(wline, isHeading ? pageWidth / 2 : margin, y, isHeading ? { align: "center" } : undefined)
      y += lineHeight
    }
  }

  const filename = ticketNumber ? `appeal_${ticketNumber}.pdf` : "appeal_letter.pdf"
  doc.save(filename)
}
