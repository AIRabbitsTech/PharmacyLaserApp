import type { Sale } from '../types';
import { formatDate, roundGrandTotal } from './helpers';
import { getPharmacyProfile } from '../hooks/usePharmacyProfile';

export function printInvoice(sales: Sale[]): void {
  if (sales.length === 0) return;

  const p = getPharmacyProfile();
  const first = sales[0];
  const grandTotal = sales.reduce((s, x) => s + x.total_amount, 0);
  const billDiscount = first.bill_discount ?? 0;
  const subtotal = parseFloat(
    sales.reduce((s, x) => s + x.quantity * x.selling_rate, 0).toFixed(2)
  );

  const rows = sales.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td style="text-align:left">${s.medicine_name}</td>
      <td>${s.batch_number || '-'}</td>
      <td>${s.expiry_date || '-'}</td>
      <td>${s.quantity}</td>
      <td>₹${s.mrp.toFixed(2)}</td>
      <td>${s.discount ? s.discount + '%' : '0%'}</td>
      <td>₹${s.selling_rate.toFixed(2)}</td>
      <td style="text-align:right">₹${(s.quantity * s.selling_rate).toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${first.invoice_number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 10px; }
    .header h1 { font-size: 20px; font-weight: bold; text-transform: uppercase; }
    .header p { font-size: 11px; color: #333; margin-top: 3px; }
    .license { font-size: 10px; color: #555; margin-top: 4px; }
    .meta { display: flex; justify-content: space-between; margin: 10px 0; }
    .meta-block { font-size: 11px; }
    .meta-block strong { display: block; font-size: 12px; }
    .divider { border-top: 1px solid #ccc; margin: 8px 0; }
    .double { border-top: 2px solid #111; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f0f0f0; border: 1px solid #ccc; padding: 5px 6px; font-size: 11px; text-align: center; }
    td { border: 1px solid #ddd; padding: 5px 6px; font-size: 11px; text-align: center; vertical-align: top; }
    .totals { margin-top: 10px; text-align: right; font-size: 12px; }
    .totals table { width: auto; margin-left: auto; }
    .totals td { border: none; padding: 2px 6px; }
    .grand { font-size: 14px; font-weight: bold; border-top: 2px solid #111 !important; }
    .footer { margin-top: 14px; border-top: 1px dashed #999; padding-top: 8px; font-size: 10px; color: #555; text-align: center; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold;
      background: ${first.payment_mode === 'Cash' ? '#dcfce7' : first.payment_mode === 'UPI' ? '#dbeafe' : '#ffedd5'};
      color: ${first.payment_mode === 'Cash' ? '#166534' : first.payment_mode === 'UPI' ? '#1e40af' : '#9a3412'}; }
    @media print { body { padding: 8px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${p.name}</h1>
    <p>${p.address}</p>
    ${p.phone || p.email ? `<p>${[p.phone, p.email].filter(Boolean).join(' | ')}</p>` : ''}
    ${p.gst ? `<p class="license">GSTIN: ${p.gst}</p>` : ''}
  </div>

  <div class="meta">
    <div class="meta-block">
      <strong>Invoice No: ${first.invoice_number}</strong>
      Date: ${formatDate(first.sale_date)}<br/>
      Payment: <span class="badge">${first.payment_mode}</span>
    </div>
    <div class="meta-block" style="text-align:right">
      ${first.customer_name ? `<strong>${first.customer_name}</strong>` : ''}
      ${first.mobile_number ? `<span>📞 ${first.mobile_number}</span>` : ''}
    </div>
  </div>

  <div class="divider double"></div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th style="text-align:left">Medicine</th>
        <th>Batch</th>
        <th>Expiry</th>
        <th>Qty</th>
        <th>MRP</th>
        <th>Disc</th>
        <th>Rate</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <table>
      ${billDiscount > 0 ? `
      <tr><td>Subtotal</td><td>₹${subtotal.toFixed(2)}</td></tr>
      <tr><td>Bill Discount (${billDiscount}%)</td><td>- ₹${(subtotal - grandTotal).toFixed(2)}</td></tr>` : ''}
      <tr class="grand"><td><strong>Grand Total</strong></td><td><strong>₹${roundGrandTotal(grandTotal)}</strong></td></tr>
    </table>
  </div>

  <div class="footer">
    ${p.dl1 ? `DL No.1: ${p.dl1}` : ''}${p.dl1 && p.dl2 ? '  |  ' : ''}${p.dl2 ? `DL No.2: ${p.dl2}` : ''}<br/>
    Thank you for your purchase!
  </div>

  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=850,height=650');
  if (!w) { alert('Please allow popups to print the invoice.'); return; }
  w.document.write(html);
  w.document.close();
}
