export function comparisonMonth(date: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) return null;
  const month = date.slice(0, 7);
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { startDate: `${month}-01`, endDate: end.toISOString().slice(0, 10) };
}
