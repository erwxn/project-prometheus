import { jsPDF } from 'jspdf';
import type { ArchiveQuery, ArchiveSummary } from './archive-model';

/** Builds a report from whole-selection aggregates, independently of map pages. */
export function archivePdf(summary: ArchiveSummary, comparison: ArchiveSummary | null, query: ArchiveQuery) {
  const pdf = new jsPDF({ compress: true });
  let y = 24;
  function line(value: string, size = 10) {
    pdf.setFontSize(size);
    const rows: string[] = pdf.splitTextToSize(value.replace(/[^\x20-\x7e]/g, ' '), 174);
    for (const row of rows) {
      if (y > 274) { pdf.addPage(); y = 24; }
      pdf.text(row, 18, y);
      y += size * .48 + 2;
    }
  }
  function heading(value: string) {
    if (y > 255) { pdf.addPage(); y = 24; }
    y += 5;
    pdf.setFont('helvetica', 'bold');
    line(value, 14);
    pdf.setFont('helvetica', 'normal');
  }
  const number = (value: number) => value.toLocaleString('en-US');
  const power = (sum: number, count: number) => count ? `${(sum / count).toFixed(2)} MW` : 'N/A';
  pdf.setTextColor(38, 52, 60);
  pdf.setFont('helvetica', 'bold');
  line('Prometheus', 24);
  line('Historical fire archive report', 16);
  pdf.setFont('helvetica', 'normal');
  y += 6;
  line(`Generated: ${new Date().toISOString()}`);
  line(`Satellite: ${query.platform}`);
  line(`Applied period: ${query.startDate} to ${query.endDate} (UTC, inclusive)`);
  line(`Region: ${query.area ? JSON.stringify(query.area.geometry) : 'All locations'}`);
  line('Scope: entire applied archive selection, independently of loaded map pages, viewport, or playback.');
  line('Source: local raw NASA FIRMS MODIS/VIIRS archive. These are not harmonized estimates. Satellite coverage is unknown; missing records do not establish zero activity. Counts are detections, not unique fires or burned area.');
  heading('Selection summary');
  const t = summary.totals;
  line(`Indexed detections: ${number(t.count)}`);
  line(`Observed active days: ${number(summary.daily.length)}`);
  line(`Mean FRP: ${power(t.frpSum, t.frpCount)} (${number(t.frpCount)} readings)`);
  line(`Maximum FRP: ${t.maxFrp === null ? 'N/A' : `${t.maxFrp.toFixed(2)} MW`}`);
  line(`Recorded bounds: ${t.first || 'N/A'} to ${t.last || 'N/A'} (not coverage guarantees)`);
  if (!t.count) line('No recorded observations match the applied selection.');
  function buckets(title: string, values: ArchiveSummary['daily']) {
    heading(title);
    line('Period | Detections | Mean FRP (MW) | FRP readings');
    for (const b of values) line(`${b.date} | ${number(b.count)} | ${power(b.frpSum, b.frpCount)} | ${number(b.frpCount)}`);
    if (!values.length) line('No recorded observations.');
  }
  buckets('Monthly activity', summary.monthly);
  buckets('Daily activity', summary.daily);
  if (comparison) {
    buckets('Comparison years', comparison.yearly);
    line(comparison.baselineReason || 'Comparisons describe recorded observations; coverage is unknown.');
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.text(`Prometheus archive | ${page} / ${pdf.getNumberOfPages()}`, 18, 289);
  }
  pdf.setProperties({ title: 'Prometheus historical fire archive report', author: 'Prometheus' });
  return pdf;
}
