// src/invoicePdf.js
// Generates a real PDF invoice using PDFKit. ESM (matches "type": "module" in package.json).
// Reads from the actual schema the frontend writes: top-level invoice_number/status/user_id,
// plus a `data` JSONB column holding the full invoice object in camelCase
// (billedTo, lineItems, total, dueDate, issuedAt, balanceDue, lateFeeApplied, etc.)

import PDFDocument from 'pdfkit';

const fmt = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0 });

export function generateInvoicePDF(invoiceRow) {
  const inv = invoiceRow.data || {}; // the nested object the HTML actually saves
  const invoiceNumber = invoiceRow.invoice_number || inv.invoiceNumber || invoiceRow.invoice_id;
  const status = invoiceRow.status || inv.status || 'ISSUED';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(24).font('Helvetica-Bold').fillColor('#00c8d4').text('TERRITORYX', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#888888').text('Africa Billboard Territory Platform', 50, 80);
    doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#00c8d4').lineWidth(1).stroke();

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#111111').text('INVOICE', 50, 115);
    doc.fontSize(12).fillColor('#555555').text(`#${invoiceNumber}`, 50, 140);

    const statusColor = status === 'PAID' ? '#22c55e' : status === 'OVERDUE' ? '#ef4444' : '#f59e0b';
    doc.fontSize(10).font('Helvetica-Bold').fillColor(statusColor).text(status, 450, 115, { align: 'right' });

    doc.fontSize(9).font('Helvetica').fillColor('#555555');
    if (inv.issuedAt) doc.text(`Issued: ${new Date(inv.issuedAt).toLocaleDateString()}`, 350, 140);
    if (inv.dueDate) doc.text(`Due: ${new Date(inv.dueDate).toLocaleDateString()}`, 350, 154);

    doc.fontSize(9).fillColor('#888888').text('BILLED TO', 50, 185);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111').text(inv.billedTo?.companyName || 'N/A', 50, 198);
    doc.fontSize(9).font('Helvetica').fillColor('#555555').text(inv.billedTo?.email || '', 50, 212);

    doc.fontSize(9).fillColor('#888888').text('TERRITORY', 350, 185);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111').text(inv.territoryName || '', 350, 198);

    const tableTop = 260;
    doc.moveTo(50, tableTop - 10).lineTo(545, tableTop - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#888888');
    doc.text('DESCRIPTION', 50, tableTop);
    doc.text('AMOUNT', 480, tableTop, { align: 'right' });
    doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).strokeColor('#e5e7eb').stroke();

    let y = tableTop + 22;
    (inv.lineItems || []).forEach((item) => {
      doc.fontSize(9).font('Helvetica').fillColor('#111111');
      doc.text(item.description || '', 50, y, { width: 350 });
      doc.text(fmt(item.amount), 480, y, { align: 'right' });
      y += 18;
    });

    doc.moveTo(350, y + 5).lineTo(545, y + 5).strokeColor('#e5e7eb').stroke();
    y += 14;
    doc.fontSize(9).fillColor('#555555').text('Subtotal', 350, y);
    doc.text(fmt(inv.subtotal ?? inv.total), 480, y, { align: 'right' });

    if (inv.lateFeeApplied > 0) {
      y += 14;
      doc.fillColor('#ef4444').text('Late Fee (1.5%)', 350, y);
      doc.text(fmt(inv.lateFeeApplied), 480, y, { align: 'right' });
    }

    y += 18;
    doc.moveTo(350, y).lineTo(545, y).strokeColor('#111111').lineWidth(1).stroke();
    y += 8;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111');
    doc.text('TOTAL', 350, y);
    doc.text(fmt(inv.total), 480, y, { align: 'right' });

    if (status !== 'PAID' && inv.balanceDue > 0) {
      y += 18;
      doc.fontSize(11).fillColor('#ef4444');
      doc.text('BALANCE DUE', 350, y);
      doc.text(fmt(inv.balanceDue), 480, y, { align: 'right' });
    }

    y += 40;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    y += 14;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#888888').text('PAYMENT INSTRUCTIONS', 50, y);
    y += 14;
    doc.fontSize(9).font('Helvetica').fillColor('#555555');
    doc.text('Bank: First National Bank', 50, y); y += 12;
    doc.text('Account: 1234567890', 50, y); y += 12;
    doc.text(`Reference: ${invoiceNumber}`, 50, y); y += 12;
    doc.text('Email: finance@territoryx.africa', 50, y);

    doc.fontSize(8).fillColor('#aaaaaa')
      .text('TerritoryX Africa Ltd · territoryx.africa · Generated ' + new Date().toISOString(), 50, 760, { align: 'center' });

    doc.end();
  });
}
