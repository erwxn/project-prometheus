import { jsPDF } from 'jspdf';
import type { ActivityMetric } from './analytics-model';
import type { ArchiveBucket, ArchiveQuery, ArchiveSummary } from './archive-model';
import type { TrendGrouping } from './historical-chart';

export interface ArchivePdfOptions {
  grouping?: TrendGrouping;
  metric?: ActivityMetric;
  comparisonYears?: number[];
  generatedAt?: string;
}

type RGB = [number, number, number];
const navy: RGB = [23, 44, 58];
const blue: RGB = [54, 95, 118];
const teal: RGB = [39, 117, 105];
const plum: RGB = [139, 79, 118];
const gold: RGB = [154, 100, 29];
const ink: RGB = [38, 52, 60];
const muted: RGB = [91, 108, 118];
const pale: RGB = [239, 243, 242];
const grid: RGB = [210, 219, 221];
const white: RGB = [255, 255, 255];
const seriesColors: RGB[] = [blue, plum, teal, gold, [81, 81, 163], [156, 59, 59], [75, 111, 42]];

const number = (value: number) => value.toLocaleString('en-US');
const meanFrp = (bucket: ArchiveBucket) => bucket.frpCount ? bucket.frpSum / bucket.frpCount : null;
const metricValue = (bucket: ArchiveBucket | undefined, metric: ActivityMetric) => !bucket ? null : metric === 'detections' ? bucket.count : meanFrp(bucket);
const metricUnit = (metric: ActivityMetric) => metric === 'detections' ? 'detections' : 'MW';
const metricTitle = (metric: ActivityMetric) => metric === 'detections' ? 'Hotspot detections' : 'Mean FRP';
const safe = (value: string) => value.replace(/[^\x20-\x7e]/g, ' ');
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

function periods(start: string, end: string, grouping: TrendGrouping): string[] {
  if (!start || !end || start > end) return [];
  const result: string[] = [];
  if (grouping === 'daily') {
    for (let time = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`); time <= last; time += 86_400_000) result.push(isoDay(time));
    return result;
  }
  let year = Number(start.slice(0, 4)), month = grouping === 'monthly' ? Number(start.slice(5, 7)) : 1;
  const endYear = Number(end.slice(0, 4)), endMonth = grouping === 'monthly' ? Number(end.slice(5, 7)) : 1;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(grouping === 'monthly' ? `${year}-${String(month).padStart(2, '0')}` : String(year));
    if (grouping === 'yearly') year++;
    else if (++month === 13) { month = 1; year++; }
  }
  return result;
}

function regionLabel(query: ArchiveQuery): string {
  if (!query.area) return 'All indexed locations';
  const coordinates = query.area.geometry.coordinates[0];
  const lng = coordinates.map(point => point[0]), lat = coordinates.map(point => point[1]);
  const bounds = `${Math.min(...lng).toFixed(3)}, ${Math.min(...lat).toFixed(3)} to ${Math.max(...lng).toFixed(3)}, ${Math.max(...lat).toFixed(3)}`;
  if (query.area.properties.kind === 'radius') return `Radius selection (${query.area.properties.radiusKm ?? 25} km), bounds ${bounds}`;
  return `${query.area.properties.kind === 'rectangle' ? 'Bounding box' : `Polygon (${Math.max(0, coordinates.length - 1)} vertices)`}: ${bounds}`;
}

/** Builds a vector report from whole-selection aggregates, independently of map pages. */
export function archivePdf(summary: ArchiveSummary, comparison: ArchiveSummary | null, query: ArchiveQuery, options: ArchivePdfOptions = {}) {
  const pdf = new jsPDF({ compress: true, unit: 'mm', format: 'a4' });
  const grouping = options.grouping ?? 'monthly';
  const metric = options.metric ?? 'detections';
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const margin = 16;
  let y = 20;

  const pageWidth = () => pdf.internal.pageSize.getWidth();
  const pageHeight = () => pdf.internal.pageSize.getHeight();
  const fill = (color: RGB) => pdf.setFillColor(...color);
  const stroke = (color: RGB) => pdf.setDrawColor(...color);
  const textColor = (color: RGB) => pdf.setTextColor(...color);
  const newPage = () => { pdf.addPage(); y = 20; };
  const ensure = (height: number) => { if (y + height > pageHeight() - 18) newPage(); };
  const write = (value: string, size = 9, color: RGB = ink, width = pageWidth() - margin * 2, style: 'normal' | 'bold' = 'normal') => {
    pdf.setFont('helvetica', style); pdf.setFontSize(size); textColor(color);
    const lines: string[] = pdf.splitTextToSize(safe(value), width);
    ensure(lines.length * (size * .42 + 1.4));
    for (const line of lines) { pdf.text(line, margin, y); y += size * .42 + 1.4; }
  };
  function sectionTitle(value: string) {
    ensure(18); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); textColor(navy); pdf.text(safe(value), margin, y); y += 3;
    fill(gold); pdf.rect(margin, y, 18, 1.2, 'F'); y += 9;
  }
  const pageHeader = (eyebrow: string, title: string) => {
    fill(navy); pdf.rect(0, 0, pageWidth(), 13, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); textColor(white); pdf.text('PROJECT PROMETHEUS  /  NASA FIRMS ARCHIVE', margin, 8.2);
    y = 25; pdf.setFontSize(7); textColor(gold); pdf.text(eyebrow.toUpperCase(), margin, y); y += 8;
    pdf.setFontSize(19); textColor(navy); pdf.text(title, margin, y); y += 11;
  };

  function drawKpis() {
    const values = [
      ['Recorded detections', number(summary.totals.count), 'Indexed matches in the selection'],
      ['Active observation days', number(summary.daily.length), 'UTC days containing records'],
      ['Mean available FRP', summary.totals.frpCount ? `${meanFrp(summary.totals)!.toFixed(2)} MW` : 'N/A', `${number(summary.totals.frpCount)} valid readings`],
      ['Maximum FRP', summary.totals.maxFrp === null ? 'N/A' : `${summary.totals.maxFrp.toFixed(2)} MW`, 'Maximum recorded reading'],
    ];
    const gap = 5, cardWidth = (pageWidth() - margin * 2 - gap) / 2, cardHeight = 28;
    values.forEach(([label, value, note], index) => {
      const x = margin + (index % 2) * (cardWidth + gap), top = y + Math.floor(index / 2) * (cardHeight + gap);
      fill(pale); stroke(grid); pdf.roundedRect(x, top, cardWidth, cardHeight, 2, 2, 'FD');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); textColor(muted); pdf.text(label.toUpperCase(), x + 5, top + 7);
      pdf.setFontSize(16); textColor(navy); pdf.text(value, x + 5, top + 17);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); textColor(muted); pdf.text(note, x + 5, top + 23);
    });
    y += (cardHeight + gap) * 2 + 5;
  }

  function drawChart(title: string, labels: string[], chartSeries: { label: string; values: (number | null)[]; color: RGB; dash?: number[] }[], unit: string, bar = false) {
    sectionTitle(title);
    const chartX = margin + 15, chartY = y + 4, chartW = pageWidth() - margin * 2 - 20, chartH = 82;
    const values = chartSeries.flatMap(series => series.values.filter((value): value is number => value !== null));
    if (!values.length) { write('No recorded activity values are available for this visualization.', 10, muted); return; }
    const maximum = Math.max(...values, 1), step = maximum / 4;
    stroke(grid); textColor(muted); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    for (let tick = 0; tick <= 4; tick++) {
      const chartLineY = chartY + chartH - tick / 4 * chartH;
      pdf.line(chartX, chartLineY, chartX + chartW, chartLineY);
      const tickValue = step * tick;
      pdf.text(metric === 'detections' ? number(Math.round(tickValue)) : tickValue.toFixed(1), chartX - 3, chartLineY + 2, { align: 'right' });
    }
    const x = (index: number) => chartX + index / Math.max(1, labels.length - 1) * chartW;
    const valueY = (value: number) => chartY + chartH - value / maximum * chartH;
    chartSeries.forEach((series, seriesIndex) => {
      stroke(series.color); fill(series.color); pdf.setLineWidth(.65); pdf.setLineDashPattern(series.dash ?? [], 0);
      if (bar) {
        const slot = chartW / Math.max(1, labels.length), width = Math.min(18, slot * .65 / chartSeries.length);
        series.values.forEach((value, index) => {
          if (value === null) return;
          const center = chartX + slot * (index + .5) + (seriesIndex - (chartSeries.length - 1) / 2) * width;
          pdf.rect(center - width * .4, valueY(value), width * .8, chartY + chartH - valueY(value), 'F');
        });
      } else {
        let previous: [number, number] | null = null;
        series.values.forEach((value, index) => {
          if (value === null) { previous = null; return; }
          const point: [number, number] = [x(index), valueY(value)];
          if (previous) pdf.line(previous[0], previous[1], point[0], point[1]);
          pdf.circle(point[0], point[1], labels.length > 100 ? .35 : .8, 'F'); previous = point;
        });
      }
      pdf.setLineDashPattern([], 0);
    });
    const tickIndexes = [...new Set(Array.from({ length: Math.min(7, labels.length) }, (_, index) => Math.round(index * (labels.length - 1) / Math.max(1, Math.min(7, labels.length) - 1))))];
    pdf.setFontSize(6.5); textColor(muted);
    tickIndexes.forEach((index, position) => pdf.text(labels[index], bar ? chartX + chartW / labels.length * (index + .5) : x(index), chartY + chartH + 5, { align: position === 0 ? 'left' : position === tickIndexes.length - 1 ? 'right' : 'center' }));
    pdf.text(`Y: ${unit}`, chartX, chartY - 3); pdf.text(`X: UTC ${grouping === 'daily' ? 'date' : grouping === 'monthly' ? 'month' : 'year'}`, chartX + chartW, chartY + chartH + 10, { align: 'right' });
    y = chartY + chartH + 17;
    chartSeries.forEach(series => {
      fill(series.color); pdf.rect(margin, y - 3, 7, 1.5, 'F'); pdf.setFontSize(7); textColor(ink); pdf.text(safe(series.label), margin + 10, y); y += 5;
    });
  }

  function drawCalendar(year: number) {
    pageHeader('Recorded daily activity', `Burning activity calendar - ${year}`);
    write(`${metricTitle(metric)} by UTC day. Filled cells contain recorded detections; hatched cells have no indexed records and therefore represent unknown coverage, not known zero fire activity.`, 9, muted);
    y += 5;
    const start = Date.UTC(year, 0, 1), end = Date.UTC(year, 11, 31), offset = (new Date(start).getUTCDay() + 6) % 7;
    const lookup = new Map(summary.daily.filter(bucket => bucket.date.startsWith(`${year}-`)).map(bucket => [bucket.date, bucket]));
    const recorded = [...lookup.values()].map(bucket => metricValue(bucket, metric)).filter((value): value is number => value !== null && value > 0).sort((a, b) => a - b);
    const quantiles = [.25, .5, .75, 1].map(q => recorded[Math.max(0, Math.ceil(recorded.length * q) - 1)] ?? 0);
    const colors: RGB[] = [[224, 235, 237], [170, 203, 213], [112, 163, 181], [54, 111, 137], [23, 68, 92]];
    const cell = 2.85, gap = .55, left = margin + 10, top = y + 9;
    pdf.setFontSize(6); textColor(muted);
    for (let month = 0; month < 12; month++) {
      const first = Date.UTC(year, month, 1), week = Math.floor(((first - start) / 86_400_000 + offset) / 7);
      pdf.text(new Date(first).toLocaleString('en', { month: 'short', timeZone: 'UTC' }), left + week * (cell + gap), top - 3);
    }
    for (let time = start; time <= end; time += 86_400_000) {
      const dayIndex = Math.round((time - start) / 86_400_000), position = dayIndex + offset, week = Math.floor(position / 7), weekday = position % 7;
      const x = left + week * (cell + gap), cellY = top + weekday * (cell + gap), bucket = lookup.get(isoDay(time)), value = metricValue(bucket, metric);
      if (value === null) {
        fill(white); stroke(grid); pdf.rect(x, cellY, cell, cell, 'FD'); pdf.setLineWidth(.18); pdf.line(x, cellY + cell, x + cell, cellY);
      } else {
        const level = value <= 0 ? 0 : Math.min(4, quantiles.findIndex(limit => value <= limit) + 1);
        fill(colors[level]); stroke(white); pdf.rect(x, cellY, cell, cell, 'FD');
      }
    }
    y = top + 7 * (cell + gap) + 12;
    pdf.setFontSize(7); textColor(ink); pdf.text(`${metricTitle(metric)} (${metricUnit(metric)})`, margin, y); y += 6;
    const legend = ['Known zero', ...quantiles.map(limit => `<= ${metric === 'detections' ? number(Math.round(limit)) : limit.toFixed(1)}`)];
    legend.forEach((label, index) => { fill(colors[index]); pdf.rect(margin + index * 31, y - 3, 5, 3, 'F'); pdf.text(label, margin + index * 31 + 7, y); });
    y += 8; stroke(grid); pdf.rect(margin, y - 3, 5, 3); pdf.line(margin, y, margin + 5, y - 3); pdf.text('Unknown / no indexed record', margin + 7, y); y += 10;
    write(`Recorded active days in ${year}: ${number(lookup.size)}. Calendar cells are derived from the same whole-selection daily aggregates as the dashboard.`, 8, muted);
  }

  function drawTable(title: string, values: ArchiveBucket[], limit?: number) {
    sectionTitle(title);
    const rows = limit ? values.slice(0, limit) : values;
    const widths = [38, 42, 43, 39], headers = ['UTC period', 'Detections', 'Mean FRP (MW)', 'FRP readings'];
    const header = () => {
      fill(navy); pdf.rect(margin, y - 5, widths.reduce((sum, value) => sum + value, 0), 8, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); textColor(white); let x = margin;
      headers.forEach((value, index) => { pdf.text(value, x + 2, y); x += widths[index]; }); y += 7;
    };
    header();
    if (!rows.length) { write('No recorded observations.', 8, muted); return; }
    rows.forEach((bucket, index) => {
      if (y > pageHeight() - 22) { newPage(); header(); }
      if (index % 2 === 0) { fill(pale); pdf.rect(margin, y - 4.5, widths.reduce((sum, value) => sum + value, 0), 7, 'F'); }
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); textColor(ink); let x = margin;
      const values = [bucket.date, number(bucket.count), bucket.frpCount ? meanFrp(bucket)!.toFixed(3) : 'Unavailable', number(bucket.frpCount)];
      values.forEach((value, column) => { pdf.text(value, x + 2, y); x += widths[column]; }); y += 7;
    });
    if (limit && values.length > limit) write(`${number(values.length - limit)} additional rows are represented in the charts and aggregate totals but omitted from this compact appendix table.`, 7, muted);
  }

  pageHeader('Historical fire analytics report', 'Executive summary');
  write(`Generated ${generatedAt} UTC`, 8, muted); y += 2;
  write(`Satellite / product: ${query.platform}`, 10, navy, undefined, 'bold');
  write(`Selected period: ${query.startDate} to ${query.endDate} (UTC, inclusive)`);
  write(`Geographic scope: ${regionLabel(query)}`);
  write('Report scope: the entire applied archive selection, independently of loaded map pages, viewport pagination, or playback.', 8, muted);
  y += 5; drawKpis();
  write('Scientific interpretation', 10, navy, undefined, 'bold');
  write('Source: local raw NASA FIRMS MODIS/VIIRS archive. Counts are recorded satellite detections, not unique fires or burned area. Satellite coverage is unknown, so missing records do not establish zero activity. Products are not harmonized unless explicitly stated.', 8, muted);
  if (!summary.totals.count) write('No recorded observations match the applied selection. The report retains provenance and empty-state information but omits empty visual sections.', 9, gold, undefined, 'bold');

  if (summary.totals.count) {
    newPage(); pageHeader('Whole-selection aggregate', 'Historical fire activity');
    const activityBuckets = summary[grouping];
    const keys = periods(query.startDate, query.endDate, grouping);
    const lookup = new Map(activityBuckets.map(bucket => [bucket.date, bucket]));
    drawChart(`${grouping[0].toUpperCase()}${grouping.slice(1)} ${metricTitle(metric).toLowerCase()}`, keys, [{ label: `${query.platform} - recorded observations`, values: keys.map(key => metricValue(lookup.get(key), metric)), color: blue }], metricUnit(metric), grouping === 'yearly');
    write('Gaps indicate periods with no indexed observations. Because archive coverage is not established, gaps are not plotted as zero.', 8, muted);
  }

  if (comparison?.monthly.length) {
    newPage(); pageHeader('Descriptive comparison', 'Historical year comparison');
    const inferredYears = [...new Set(comparison.monthly.map(bucket => Number(bucket.date.slice(0, 4))))].sort((a, b) => a - b);
    const selectedYears = (options.comparisonYears?.length ? options.comparisonYears : inferredYears).filter(year => inferredYears.includes(year));
    const monthLabels = Array.from({ length: 12 }, (_, month) => new Date(Date.UTC(2025, month, 1)).toLocaleString('en', { month: 'short', timeZone: 'UTC' }));
    const lookup = new Map(comparison.monthly.map(bucket => [bucket.date, bucket]));
    drawChart('Monthly recorded observations by comparison year', monthLabels, selectedYears.map((year, index) => ({ label: `${year} - descriptive recorded observations`, values: Array.from({ length: 12 }, (_, month) => metricValue(lookup.get(`${year}-${String(month + 1).padStart(2, '0')}`), metric)), color: seriesColors[index % seriesColors.length], dash: index % 3 === 1 ? [2, 1.5] : index % 3 === 2 ? [.6, 1.4] : undefined })), metricUnit(metric));
    write(comparison.baselineReason || 'This chart is descriptive. Coverage and product comparability have not been established, so no validated anomaly is calculated.', 8, muted);
    const methods = [...new Set(comparison.daily.flatMap(bucket => bucket.methods))];
    if (methods.length) write(`Processing evidence in selected observations: ${methods.join(', ')}.`, 8, muted);
  }

  if (summary.totals.count) periods(query.startDate, query.endDate, 'yearly').map(Number).forEach(year => { newPage(); drawCalendar(year); });

  newPage(); pageHeader('Appendix', 'Detailed aggregate data');
  drawTable('Monthly activity', summary.monthly);
  drawTable('Daily activity', summary.daily, 400);
  if (comparison?.yearly.length) drawTable('Comparison-year totals', comparison.yearly);
  ensure(65);
  sectionTitle('Methodology and provenance');
  write(`Applied satellite: ${query.platform}. Applied UTC period: ${query.startDate} through ${query.endDate}, inclusive. Geographic scope: ${regionLabel(query)}. Trend grouping: ${grouping}. Activity metric: ${metricTitle(metric)}.`, 8, muted);
  write('FRP means use the sum of available FRP readings divided by the valid FRP sample count. Missing FRP values are excluded from the denominator. No dates, zero-activity periods, coverage claims, baselines, or anomalies are manufactured.', 8, muted);
  write('The geographic map is intentionally omitted because the interactive map is paginated and a reliable whole-selection static map image is not available. Including the visible markers would misrepresent the applied aggregate selection.', 8, muted);

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); stroke(grid); pdf.line(margin, pageHeight() - 12, pageWidth() - margin, pageHeight() - 12);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); textColor(muted);
    pdf.text('Prometheus historical fire analytics - NASA FIRMS recorded observations', margin, pageHeight() - 7);
    pdf.text(`${page} / ${pages}`, pageWidth() - margin, pageHeight() - 7, { align: 'right' });
  }
  pdf.setProperties({ title: 'Prometheus historical fire analytics report', author: 'Project Prometheus', subject: 'Whole-selection NASA FIRMS archive analytics' });
  return pdf;
}
