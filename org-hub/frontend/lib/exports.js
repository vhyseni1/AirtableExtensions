// Export helpers: PNG screenshots (html2canvas), a crisp vector PDF drawn with
// jsPDF primitives, and CSV for the data grid.

import html2canvas from 'html2canvas';
import {jsPDF} from 'jspdf';

export function timestamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

export function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

export function downloadText(text, filename, mime = 'text/csv;charset=utf-8') {
    const blob = new Blob([text], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function renderChartCanvas(el, {scale = 2} = {}) {
    el.classList.add('exporting');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
        return await html2canvas(el, {
            scale,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            width: el.scrollWidth,
            height: el.scrollHeight,
            windowWidth: el.scrollWidth,
            windowHeight: el.scrollHeight,
        });
    } finally {
        el.classList.remove('exporting');
    }
}

export async function exportPNG(el, basename = 'org-chart') {
    const canvas = await renderChartCanvas(el, {scale: 3});
    downloadDataUrl(canvas.toDataURL('image/png'), `${basename}-${timestamp()}.png`);
}

// A single-page PDF holding a screenshot of the element, scaled to fit A4
// landscape. Used for the stacked tree, whose layout has no natural pagination.
export async function exportImagePDF(el, basename = 'org-chart') {
    const canvas = await renderChartCanvas(el, {scale: 2});
    const pdf = new jsPDF({orientation: 'landscape', unit: 'pt', format: 'a4'});
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const ratio = Math.min(
        (pageW - margin * 2) / canvas.width,
        (pageH - margin * 2) / canvas.height,
    );
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    pdf.addImage(
        canvas.toDataURL('image/png'), 'PNG',
        (pageW - w) / 2, (pageH - h) / 2, w, h,
    );
    pdf.save(`${basename}-${timestamp()}.pdf`);
}

// ── Vector PDF ───────────────────────────────────────────────────────────────
// Drawn with jsPDF vector primitives (not a screenshot), so text and borders
// stay razor-sharp at any zoom and every card has a true solid border.

const PDF_COLORS = {
    name: [15, 23, 42],
    title: [71, 85, 105],
    dept: [148, 163, 184],
    blue: [37, 99, 235],
    border: [148, 163, 184],     // solid report-card border
    borderFocus: [37, 99, 235],  // manager border
    divider: [226, 232, 240],
    page: [148, 163, 184],
    vacant: [180, 83, 9],        // amber "VACANT" marker
};

// Draw centered, wrapped text limited to maxLines; returns the y after the text.
function drawCenteredLines(pdf, text, cx, y, maxW, lh, maxLines) {
    if (!text) return y;
    const lines = pdf.splitTextToSize(String(text), maxW).slice(0, maxLines);
    lines.forEach((ln, i) => pdf.text(ln, cx, y + i * lh, {align: 'center'}));
    return y + lines.length * lh;
}

function drawPersonCard(pdf, x, y, w, h, card, isFocus) {
    const p = 8;
    const cx = x + w / 2;
    const innerW = w - p * 2;

    // White card with a true border (heavier + blue for managers, dashed grey
    // for vacant positions).
    pdf.setFillColor(255, 255, 255);
    if (card.vacant) {
        pdf.setDrawColor(...PDF_COLORS.dept);
        pdf.setLineWidth(isFocus ? 1.2 : 0.9);
        pdf.setLineDashPattern([3, 2], 0);
    } else if (isFocus) {
        pdf.setDrawColor(...PDF_COLORS.borderFocus);
        pdf.setLineWidth(1.4);
    } else {
        pdf.setDrawColor(...PDF_COLORS.border);
        pdf.setLineWidth(0.8);
    }
    pdf.roundedRect(x, y, w, h, 6, 6, 'FD');
    pdf.setLineDashPattern([], 0);
    if (isFocus && !card.vacant) {
        pdf.setFillColor(...PDF_COLORS.borderFocus);
        pdf.rect(x + 6, y, w - 12, 3, 'F');
    }

    let cy = y + 15;
    pdf.setFont('helvetica', card.vacant ? 'bolditalic' : 'bold');
    pdf.setFontSize(isFocus ? 9.6 : 8.8);
    pdf.setTextColor(...(card.vacant ? PDF_COLORS.title : PDF_COLORS.name));
    cy = drawCenteredLines(pdf, card.name, cx, cy, innerW, isFocus ? 11 : 10, 2);

    if (card.vacant) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.4);
        pdf.setTextColor(...PDF_COLORS.vacant);
        pdf.text('VACANT', cx, cy + 4, {align: 'center'});
        cy += 8;
    } else if (card.title) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(isFocus ? 7.8 : 7.6);
        pdf.setTextColor(...PDF_COLORS.title);
        cy = drawCenteredLines(pdf, card.title, cx, cy + 3, innerW, 9, 2);
    }
    if (card.dept) {
        pdf.setFontSize(7.2);
        pdf.setTextColor(...PDF_COLORS.dept);
        drawCenteredLines(pdf, card.dept, cx, cy + 2, innerW, 8, 1);
    }

    // Divider + the parenthesized team line pinned to the bottom.
    const footY = y + h - 8;
    pdf.setDrawColor(...PDF_COLORS.divider);
    pdf.setLineWidth(0.6);
    pdf.line(x + p, footY - 9, x + w - p, footY - 9);
    pdf.setFontSize(7.6);
    if (card.directs > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...PDF_COLORS.blue);
        const t = `(${card.directs} direct report${card.directs !== 1 ? 's' : ''} · ${card.total} total)`;
        pdf.text(pdf.splitTextToSize(t, innerW)[0], cx, footY, {align: 'center'});
    } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...PDF_COLORS.dept);
        pdf.text('(Individual contributor)', cx, footY, {align: 'center'});
    }
}

// Banner header used by org-filter sections (org name + position count).
function drawOrgBanner(pdf, x, y, w, h, name, count) {
    pdf.setFillColor(239, 246, 255);
    pdf.setDrawColor(...PDF_COLORS.borderFocus);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(x, y, w, h, 5, 5, 'FD');
    pdf.setFillColor(...PDF_COLORS.borderFocus);
    pdf.rect(x, y + 4, 4, h - 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(...PDF_COLORS.name);
    pdf.text(pdf.splitTextToSize(String(name), w - 170)[0], x + 14, y + h / 2 + 4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...PDF_COLORS.title);
    pdf.text(`${count} position${count !== 1 ? 's' : ''}`, x + w - 12, y + h / 2 + 4, {align: 'right'});
}

// sections: [{kind:'manager'|'org', header, reports:[card,...]}].
// Each section starts on a new page; its header (manager card, or org banner)
// repeats on top of each of its pages; footer reads "Page x / y".
export function exportVectorPDF(sections, basename = 'org-chart') {
    const pdf = new jsPDF({orientation: 'landscape', unit: 'pt', format: 'a4'});
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const footer = 18;
    const headerGap = 14;
    const colGap = 12;
    const rowGap = 12;
    const availW = pageW - margin * 2;

    const targetCardW = 150;
    const cols = Math.max(1, Math.min(6, Math.floor((availW + colGap) / (targetCardW + colGap))));
    const cardW = (availW - (cols - 1) * colGap) / cols;
    const cardH = 88;
    const mgrW = Math.min(2 * cardW + colGap, availW);
    const orgHeaderH = 38;

    const headerHFor = sec => (sec.kind === 'org' ? orgHeaderH : cardH);
    const rowsPerPageFor = sec => {
        const avail = pageH - margin - footer - (margin + headerHFor(sec) + headerGap);
        return Math.max(1, Math.floor((avail + rowGap) / (cardH + rowGap)));
    };
    const pagesFor = sec =>
        Math.max(1, Math.ceil(Math.ceil(sec.reports.length / cols) / rowsPerPageFor(sec)) || 1);
    const totalPages = sections.reduce((s, sec) => s + pagesFor(sec), 0);

    let pageIndex = 0;
    sections.forEach(sec => {
        const headerH = headerHFor(sec);
        const gridTop = margin + headerH + headerGap;
        const rowsPerPage = rowsPerPageFor(sec);
        const rowsTotal = Math.ceil(sec.reports.length / cols);
        const nPages = pagesFor(sec);
        for (let pg = 0; pg < nPages; pg++) {
            if (pageIndex > 0) pdf.addPage();
            if (sec.kind === 'org') {
                drawOrgBanner(pdf, margin, margin, availW, orgHeaderH, sec.header.name, sec.header.count);
            } else {
                drawPersonCard(pdf, margin + (availW - mgrW) / 2, margin, mgrW, cardH, sec.header, true);
            }

            const startRow = pg * rowsPerPage;
            const endRow = Math.min(rowsTotal, startRow + rowsPerPage);
            for (let row = startRow; row < endRow; row++) {
                const y = gridTop + (row - startRow) * (cardH + rowGap);
                for (let c = 0; c < cols; c++) {
                    const idx = row * cols + c;
                    if (idx >= sec.reports.length) break;
                    const x = margin + c * (cardW + colGap);
                    drawPersonCard(pdf, x, y, cardW, cardH, sec.reports[idx], false);
                }
            }

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(...PDF_COLORS.page);
            pdf.text(`Page ${pageIndex + 1} / ${totalPages}`, pageW - margin - 64, pageH - margin / 2);
            pageIndex++;
        }
    });

    pdf.save(`${basename}-${timestamp()}.pdf`);
}

// Every .slide inside `deckEl`, one per PDF page at the slide's own 16:9
// geometry. Each slide is captured at its natural size rather than the zoomed
// on-screen size, so the export is resolution-independent of the viewer's zoom.
export async function exportSlidesPDF(deckEl, slide, basename = 'deck') {
    if (!deckEl) return;
    const slides = [...deckEl.querySelectorAll('.slide')];
    if (!slides.length) throw new Error('No slides to export.');

    const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [slide.width, slide.height],
    });

    // The deck is displayed scaled down; html2canvas would otherwise capture
    // that scale. Neutralise it for the duration of the export.
    const prevZoom = deckEl.style.getPropertyValue('--slide-zoom');
    deckEl.style.setProperty('--slide-zoom', '1');
    try {
        for (let i = 0; i < slides.length; i++) {
            const el = slides[i];
            el.classList.add('exporting');
            // Two frames: one for the class to apply, one for layout to settle.
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            let canvas;
            try {
                canvas = await html2canvas(el, {
                    scale: 2,
                    backgroundColor: '#ffffff',
                    useCORS: true,
                    logging: false,
                    width: slide.width,
                    height: slide.height,
                    windowWidth: slide.width,
                    windowHeight: slide.height,
                });
            } finally {
                el.classList.remove('exporting');
            }
            if (i > 0) pdf.addPage([slide.width, slide.height], 'landscape');
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, slide.width, slide.height);
        }
    } finally {
        if (prevZoom) deckEl.style.setProperty('--slide-zoom', prevZoom);
        else deckEl.style.removeProperty('--slide-zoom');
    }

    pdf.save(`${basename}-${timestamp()}.pdf`);
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function csvCell(value) {
    const s = value == null ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers, rows) {
    const lines = [headers.map(csvCell).join(',')];
    rows.forEach(row => lines.push(row.map(csvCell).join(',')));
    return lines.join('\r\n');
}
