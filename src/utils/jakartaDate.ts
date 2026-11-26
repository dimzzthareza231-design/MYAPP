export function jakartaDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)?.value;
  const [year, month, day] = [part('year'), part('month'), part('day')];
  if (!year || !month || !day) throw new Error('Could not format the Jakarta calendar date.');
  return `${year}-${month}-${day}`;
}
