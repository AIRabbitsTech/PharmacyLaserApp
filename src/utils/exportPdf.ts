import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Sale } from '../types';
import { formatDate, formatCurrency, formatGrandTotal } from './helpers';

export function exportToPdf(
  sales: Sale[],
  summary: { total: number; cash: number; upi: number; credit: number },
  dateLabel: string,
  filename: string = 'pharmacy-report'
): void {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

  // Header
  doc.setFontSize(18);
  doc.setTextColor(30, 64, 175);
  doc.text('Pharmacy Sales Report', 14, 18);

  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Period: ${dateLabel}`, 14, 26);
  doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 14, 32);

  // Summary boxes
  doc.setFontSize(10);
  const summaryItems = [
    { label: 'Total Sales', value: formatGrandTotal(summary.total), color: [30, 64, 175] as [number, number, number] },
    { label: 'Cash', value: formatGrandTotal(summary.cash), color: [22, 163, 74] as [number, number, number] },
    { label: 'UPI', value: formatGrandTotal(summary.upi), color: [37, 99, 235] as [number, number, number] },
    { label: 'Credit', value: formatGrandTotal(summary.credit), color: [234, 88, 12] as [number, number, number] },
    { label: 'Transactions', value: String(sales.length), color: [107, 114, 128] as [number, number, number] },
  ];

  let xPos = 14;
  summaryItems.forEach((item) => {
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(xPos, 38, 50, 18, 2, 2, 'F');
    doc.setTextColor(...item.color);
    doc.setFontSize(8);
    doc.text(item.label, xPos + 3, 44);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, xPos + 3, 52);
    doc.setFont('helvetica', 'normal');
    xPos += 54;
  });

  // Table
  const rows = sales.map((s) => [
    formatDate(s.sale_date),
    s.invoice_number,
    s.medicine_name,
    s.quantity,
    formatCurrency(s.mrp),
    formatCurrency(s.selling_rate),
    formatGrandTotal(s.quantity * s.selling_rate),
    s.payment_mode,
    s.customer_name || '-',
  ]);

  autoTable(doc, {
    startY: 62,
    head: [['Date', 'Invoice', 'Medicine', 'Qty', 'MRP', 'Rate', 'Total', 'Payment', 'Customer']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      2: { cellWidth: 50 },
      3: { cellWidth: 12 },
      4: { cellWidth: 22 },
      5: { cellWidth: 22 },
      6: { cellWidth: 26 },
      7: { cellWidth: 20 },
      8: { cellWidth: 35 },
    },
  });

  doc.save(`${filename}.pdf`);
}
