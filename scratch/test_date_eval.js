const now = new Date();
console.log("Current System Date UTC:", now.toISOString());
console.log("toISOString().split('T')[0]:", now.toISOString().split('T')[0]);

const nyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
console.log("America/New_York Date:", nyFormatter.format(now));

const ecFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
console.log("America/Guayaquil Date:", ecFormatter.format(now));