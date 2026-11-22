// The importer maps one source section to one PDF page. Reject overflow before
// PDFKit can add a page and invalidate every following manifest reference.
export function assertSectionFits(doc: PDFKit.PDFDocument, text: string, id: string, page: number) {
  const width = doc.page.width - doc.x - doc.page.margins.right;
  const height = doc.heightOfString(text, { width, align: "left", lineGap: 5 });
  if (doc.y + height > 678) {
    throw new Error(`${id}: раздел на странице ${page} не помещается; сократите или разделите текст.`);
  }
}
