const timezone = () => process.env.TIMEZONE || 'America/Sao_Paulo';
function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone(), year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
}
function previousDay(now = new Date()) {
  const date = new Date(today(now) + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
function publicationDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T)/.exec(s);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pub = /^(\d{4}) ([A-Z][a-z]{2}) (\d{1,2})$/.exec(s);
  const parts = iso ? [+iso[1], +iso[2], +iso[3]] : pub ? [+pub[1], months.indexOf(pub[2])+1, +pub[3]] : null;
  if (!parts) return null;
  const [y,m,d] = parts;
  const date = new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : null;
}
const doi = value => String(value || '').trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i,'').toLowerCase() || null;
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => /^https?:\/\//i.test(value || '') ? value : '#';
module.exports = { today, previousDay, timezone, publicationDate, doi, escape, safeUrl };
