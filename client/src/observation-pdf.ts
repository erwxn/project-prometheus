import { jsPDF } from 'jspdf';
import type { FireFeature } from './fire-data';

interface ReportOptions {
  source: string;
  scope: string;
  period: string;
  sensor: string;
  region: string;
  generatedAt?: Date;
}

/** Builds a paginated report of exactly the observations selected in the explorer. */
export function observationPdf(features: FireFeature[], options: ReportOptions) {
  const pdf = new jsPDF({ compress: true });
  const text = (value: string) => value.replace(/[^\x20-\x7e]/g, ' ');
  let y = 25;
  function line(value: string, size = 10) {
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(text(value), 174);
    for (const row of lines) {
      if (y > 275) { pdf.addPage(); y = 24; }
      pdf.text(row, 18, y);
      y += size * .48 + 2;
    }
  }
  pdf.setTextColor(38, 52, 60);
  pdf.setFont('helvetica', 'bold');
  line('Prometheus', 24);
  line('Hotspot observation report', 15);
  pdf.setFont('helvetica', 'normal');
  y += 6;
  line(`Generated: ${(options.generatedAt ?? new Date()).toISOString()}`);
  line(`Dataset: ${options.source}`);
  line(`Scope: ${options.scope}`);
  line(`Period: ${options.period}`);
  line(`Sensor: ${options.sensor}`);
  line(`Region: ${options.region}`);
  line(`Detections in this export: ${features.length.toLocaleString('en-US')}`);
  y += 5;
  line('Counts describe hotspot detections, not unique fires or burned area. FRP is in megawatts. Missing values are shown as N/A.');
  line('This report covers the loaded map selection only, including its time filter. It does not export the entire historical archive or establish complete satellite coverage.');
  y += 8;
  if (!features.length) line('No observations match the current selection.');
  const headings = () => {
    pdf.setFillColor(230, 237, 240);
    pdf.rect(18, y - 5, 174, 9, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    ['UTC / undated clock', 'Source', 'Lat / lon', 'Raw MW', 'Est. MW'].forEach((s, i) => pdf.text(s, [20, 70, 104, 153, 175][i], y));
    pdf.setFont('helvetica', 'normal');
    y += 10;
  };
  if (features.length) headings();
  for (const feature of features) {
    if (y > 272) { pdf.addPage(); y = 24; headings(); }
    const p = feature.properties;
    const frp = (v: number | null) => v !== null && Number.isFinite(v) ? v.toFixed(1) : 'N/A';
    const values = [p.observed_at_utc ? p.observed_at_utc.replace('T', ' ').slice(0, 16) : `Undated ${p.acq_time_utc}`, p.satellite, `${feature.geometry.coordinates[1].toFixed(3)} / ${feature.geometry.coordinates[0].toFixed(3)}`, frp(p.raw_frp), frp(p.normalized_frp)];
    pdf.setFontSize(8);
    values.forEach((v, i) => pdf.text(text(v), [20, 70, 104, 153, 175][i], y));
    y += 7;
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.setTextColor(85, 101, 108);
    pdf.text(`Prometheus | ${page} / ${pdf.getNumberOfPages()}`, 18, 289);
  }
  pdf.setProperties({ title: 'Prometheus hotspot observations', author: 'Prometheus' });
  return pdf;
}
