/** General Metro hours published by Metrorrey; these are not station departure times.
 * Source: https://www.metrorrey.mx/ (Preguntas frecuentes), reviewed 2026-10-24.
 */
export const metroHoursSource = 'https://www.metrorrey.mx/';

const metroDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Monterrey',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function localParts(date: Date) {
  const parts = metroDateFormatter.formatToParts(date);
  const value = (name: string) => Number(parts.find((part) => part.type === name)?.value);
  return { month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

export function getMetroServiceWindow(date: Date) {
  const { month, day } = localParts(date);
  const lateOpening = (month === 12 && day === 25) || (month === 1 && day === 1);
  const earlyClosing = month === 12 && (day === 24 || day === 31);
  return {
    opens: lateOpening ? '07:00' : '05:00',
    closes: earlyClosing ? '23:00' : '00:30',
    openingMinutes: lateOpening ? 420 : 300,
    closingMinutes: earlyClosing ? 1380 : 1470,
  };
}

export function isMetroOperatingHour(hour: string, date: Date) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hour);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return false;
  const time = hours * 60 + minutes;
  const window = getMetroServiceWindow(date);
  // The short after-midnight segment belongs to the previous service day.
  if (time < 30) {
    const previous = new Date(date.getTime() - 86400000);
    return getMetroServiceWindow(previous).closingMinutes > 1440;
  }
  return time >= window.openingMinutes && time < window.closingMinutes;
}

export function isMetroOperating(date: Date) {
  const { hour, minute } = localParts(date);
  return isMetroOperatingHour(`${hour}:${String(minute).padStart(2, '0')}`, date);
}

/** Next scheduled opening for an already closed service, including holiday rollover. */
export function getNextMetroOpening(date: Date) {
  const { hour, minute } = localParts(date);
  const window = getMetroServiceWindow(date);
  return hour * 60 + minute < window.openingMinutes
    ? window.opens
    : getMetroServiceWindow(new Date(date.getTime() + 86400000)).opens;
}

export function filterMetroForecast<T extends { hour: string }>(items: T[], date: Date) {
  let previousHour = localParts(date).hour;
  let forecastDate = date;
  return items.filter((item) => {
    const hour = Number(item.hour.split(':')[0]);
    if (hour < previousHour) forecastDate = new Date(forecastDate.getTime() + 86400000);
    previousHour = hour;
    return isMetroOperatingHour(item.hour, forecastDate);
  });
}
