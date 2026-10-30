const request=require('../http');
const {publicationDate}=require('../core');
const {planSearch}=require('../relevance');
const {parseArticles}=require('../review-pubmed');
const EUTILS='https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const pause=()=>new Promise(resolve=>setTimeout(resolve,350));
async function searchPubmed(topic,date){
 const ids=[];const term=planSearch(topic).pubmedQuery;
 for(let start=0;;start+=200){
  const query=new URLSearchParams({db:'pubmed',term,retmax:'200',retstart:String(start),datetype:'pdat',mindate:date,maxdate:date,retmode:'json'});
  const json=await(await request(EUTILS+'/esearch.fcgi?'+query)).json();
  if(json.error||!json.esearchresult)throw new Error('PubMed: resposta inválida');
  const batch=json.esearchresult.idlist||[];ids.push(...batch);
  if(ids.length>=Number(json.esearchresult.count||0))break;
  if(!batch.length||start>=9800)throw new Error('PubMed: paginação incompleta ou mais de 10000 resultados; refine o tema');
  await pause();
 }
 const articles=[];
 for(let offset=0;offset<ids.length;offset+=100){
  await pause();
  const response=await request(EUTILS+'/efetch.fcgi',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({db:'pubmed',id:ids.slice(offset,offset+100).join(','),retmode:'xml'}).toString()});
  for(const work of await parseArticles(await response.text())){
   const parts=work.published?.['date-parts']?.[0]||[];
   const published=parts.map((v,i)=>i?String(v).padStart(2,'0'):v).join('-');
   const exactDates=(work._publicationDates||[published]).map(publicationDate).filter(Boolean).sort();
   articles.push({title:work.title[0],authors:work.author.map(a=>[a.given,a.family].filter(Boolean).join(' ')).join(', '),abstract:work.abstract,keywords:work.subject||[],url:'https://pubmed.ncbi.nlm.nih.gov/'+work.pmid+'/',pmid:work.pmid,doi:work.DOI,source:'PubMed',published_date:exactDates[0]||null});
  }
 }
 return articles;
}
module.exports={searchPubmed};
