// Small valid PDF with distinct content and dimensions on each page.
// No network, personal data, document scripts or external dependencies.
export function examplePdf() {
    const labels = ['Archive nationale - page 1', 'Patrimoine culturel - page 2', 'Fin du document - page 3'];
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    labels.forEach((label, index) => {
        const width = 400 + index * 50;
        const stream = `BT /F1 20 Tf 30 80 Td (${label}) Tj ET`;
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`);
        objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((object, index) => { const offset = pdf.length; pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; return offset; });
    const start = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    return new TextEncoder().encode(pdf);
}
