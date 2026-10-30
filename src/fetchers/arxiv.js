const fetch = require('../http');
const xml2js = require('xml2js');

const {planSearch}=require('../relevance');
let previousRequest=0;
// Search complete phrases in title/abstract, with AND between required concepts.
async function searchArxiv(topic, date, maxResults = 200) {
  const query = encodeURIComponent(`(${planSearch(topic).arxivQuery}) AND submittedDate:[${date.replace(/-/g, "")}0000 TO ${date.replace(/-/g, "")}2359]`);
  const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;

  const wait=Math.max(0,3100-(Date.now()-previousRequest));
  if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
  previousRequest=Date.now();
  const res = await fetch(url);
  const xml = await res.text();
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

  const entries = parsed.feed.entry
    ? (Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry])
    : [];
  if(entries.some(entry=>String(entry.id||'').includes('/api/errors')))throw new Error('arXiv recusou a consulta; refine o tema.');

  if (Number(parsed.feed['opensearch:totalResults'] || 0) > maxResults) throw new Error('arXiv: mais de 200 resultados; refine o tema');

  return entries
    .filter(e => e.published?.slice(0,10) === date)
    .map(e => ({
      title: (e.title || '').replace(/\s+/g, ' ').trim(),
      authors: Array.isArray(e.author)
        ? e.author.map(a => a.name).join(', ')
        : (e.author ? e.author.name : ''),
      abstract: (e.summary || '').replace(/\s+/g, ' ').trim(),
      url: e.id,
      doi: e['arxiv:doi'] ? (e['arxiv:doi']._ || e['arxiv:doi']) : null,
      source: 'arXiv',
      published_date: e.published
    }));
}

module.exports = { searchArxiv };
