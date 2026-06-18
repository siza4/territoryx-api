// src/pdf/invoicePdf.js
// Generates a real PDF invoice using PDFKit.
// No Puppeteer/Chrome needed — works on any Node.js server.

const PDFDocument = require('pdfkit');

const fmt = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });

function generateInvoicePdf(invoice, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  // Pipe directly to HTTP response
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
  doc.pipe(res);

  // ── Header ──
  doc.fontSize(24).font('Helvetica-Bold').fillColor('#00c8d4').text('TERRITORYX', 50, 50);
  doc.fontSize(10).font('Helvetica').fillColor('#888888').text('Africa Billboard Territory Platform', 50, 80);

  doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#00c8d4').lineWidth(1).stroke();

  // ── Invoice number + status ──
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#111111').text(`INVOICE`, 50, 115);
  doc.fontSize(12).fillColor('#555555').text(`#${invoice.invoice_number}`, 50, 140);

  const statusColor = invoice.status === 'PAID' ? '#22c55e' : invoice.status === 'OVERDUE' ? '#ef4444' : '#f59e0b';
  doc.fontSize(10).font('Helvetica-Bold').fillColor(statusColor)
     .text(invoice.status, 450, 115, { align: 'right' });

  // ── Dates ──
  doc.fontSize(9).font('Helvetica').fillColor('#555555');
  doc.text(`Issued: ${new Date(invoice.created_at).toLocaleDateString()}`, 350, 140);
  doc.text(`Due: ${new Date(invoice.due_date).toLocaleDateString()}`, 350, 154);

  // ── Bill To ──
  doc.fontSize(9).fillColor('#888888').text('BILLED TO', 50, 185);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111').text(invoice.billed_to_company, 50, 198);
  doc.fontSize(9).font('Helvetica').fillColor('#555555').text(invoice.billed_to_email || '', 50, 212);

  // ── Territory ──
  doc.fontSize(9).fillColor('#888888').text('TERRITORY', 350, 185);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111').text(invoice.territory_name || '', 350, 198);
  doc.fontSize(9).font('Helvetica').fillColor('#555555').text(invoice.epoch_name || '', 350, 212);

  // ── Line items table ──
  const tableTop = 260;
  doc.moveTo(50, tableTop - 10).lineTo(545, tableTop - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#888888');
  doc.text('DESCRIPTION', 50, tableTop);
  doc.text('AMOUNT', 480, tableTop, { align: 'right' });
  doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).strokeColor('#e5e7eb').stroke();

  let y = tableTop + 22;
  const items = invoice.line_items || [];
  items.forEach(item => {
    doc.fontSize(9).font('Helvetica').fillColor('#111111');
    doc.text(item.description, 50, y, { width: 350 });
    doc.text(fmt(item.amount), 480, y, { align: 'right' });
    y += 18;
  });

  // ── Totals ──
  doc.moveTo(350, y + 5).lineTo(545, y + 5).strokeColor('#e5e7eb').stroke();
  y += 14;
  doc.fontSize(9).fillColor('#555555').text('Subtotal', 350, y);
  doc.text(fmt(invoice.subtotal || invoice.total), 480, y, { align: 'right' });

  if (invoice.late_fee_applied > 0) {
    y += 14;
    doc.fillColor('#ef4444').text('Late Fee (1.5%)', 350, y);
    doc.text(fmt(invoice.late_fee_applied), 480, y, { align: 'right' });
  }

  y += 18;
  doc.moveTo(350, y).lineTo(545, y).strokeColor('#111111').lineWidth(1).stroke();
  y += 8;
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#111111');
  doc.text('TOTAL', 350, y);
  doc.text(fmt(invoice.total), 480, y, { align: 'right' });

  if (invoice.status !== 'PAID' && invoice.balance_due > 0) {
    y += 18;
    doc.fontSize(11).fillColor('#ef4444');
    doc.text('BALANCE DUE', 350, y);
    doc.text(fmt(invoice.balance_due), 480, y, { align: 'right' });
  }

  // ── Payment instructions ──
  y += 40;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  y += 14;
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#888888').text('PAYMENT INSTRUCTIONS', 50, y);
  y += 14;
  doc.fontSize(9).font('Helvetica').fillColor('#555555');
  doc.text('Bank: First National Bank', 50, y); y += 12;
  doc.text('Account: 1234567890', 50, y); y += 12;
  doc.text(`Reference: ${invoice.invoice_number}`, 50, y); y += 12;
  doc.text('Email: finance@territoryx.africa', 50, y);

  // ── Footer ──
  doc.fontSize(8).fillColor('#aaaaaa')
     .text('TerritoryX Africa Ltd · territoryx.africa · Generated ' + new Date().toISOString(), 50, 760, { align: 'center' });

  doc.end();
}

module.exports = { generateInvoicePdf };
