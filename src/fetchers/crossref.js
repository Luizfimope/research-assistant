const request=require('../http');
async function searchJournal(journal,date){
 const isIssn=/^\d{4}-\d{3}[\dXx]$/.test(journal.trim());
 const filters=['from-pub-date:'+date,'until-pub-date:'+date,'type:journal-article'];
 if(isIssn)filters.push('issn:'+journal.trim());
 let cursor='*'; const result=[];
 for(;;){
  const params=new URLSearchParams({filter:filters.join(','),rows:'200',cursor});
  if(!isIssn)params.set('query.container-title',journal);
  const json=await(await request('https://api.crossref.org/works?'+params)).json();
  const items=json.message?.items; if(!items)throw new Error('Crossref: resposta inválida');
  for(const d of items){
   if(!isIssn&&!(d['container-title']||[]).some(t=>t.toLowerCase()===journal.toLowerCase()))continue;
   const dates=[d['published-online'],d['published-print'],d.published].map(v=>v?.['date-parts']?.[0]).filter(v=>v?.length===3).map(v=>v.map((n,i)=>i?String(n).padStart(2,'0'):n).join('-')).sort();
   result.push({title:d.title?.[0]||'(sem título)',authors:(d.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(' ')).join(', '),abstract:(d.abstract||'').replace(/<[^>]+>/g,''),url:d.URL,doi:d.DOI,source:d['container-title']?.[0]||journal,published_date:dates[0]||null});
  }
  if(items.length<200)break;
  const next=json.message['next-cursor']; if(!next||next===cursor)throw new Error('Crossref: paginação incompleta'); cursor=next;
 }
 return result;
}
module.exports={searchJournal};
