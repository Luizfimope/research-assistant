const request=require('./http');
const {parseStringPromise}=require('xml2js');
const {clean,assess}=require('./relevance');
const {doi}=require('./core');
const base='https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const list=value=>value==null?[]:Array.isArray(value)?value:[value];
function text(value){return value==null?'':typeof value==='string'?value:typeof value==='number'?String(value):value.$$?value.$$.map(text).join(''):value._!=null?String(value._):Object.entries(value).filter(([key])=>key!=='$'&&key!=='#name').map(([,v])=>Array.isArray(v)?v.map(text).join(' '):text(v)).join(' ');}
function date(value) {
  if(!value?.Year)return null;
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month=Number(text(value.Month))||months.indexOf(text(value.Month))+1;
  return text(value.Year)+(month?'-'+String(month).padStart(2,'0'):'')+(value.Day?'-'+text(value.Day).padStart(2,'0'):'');
}
async function parseArticles(xml) {
  const parsed=await parseStringPromise(xml,{explicitArray:false,explicitChildren:true,preserveChildrenOrder:true,charsAsChildren:true,includeWhiteChars:true});
  if(!Object.hasOwn(parsed,'PubmedArticleSet'))throw new Error('PubMed: resposta XML inválida.');
  return list(parsed.PubmedArticleSet?.PubmedArticle).map(record=>{
    const citation=record.MedlineCitation,article=citation?.Article||{},pmid=text(citation?.PMID);
    const identifier=list(record.PubmedData?.ArticleIdList?.ArticleId).find(id=>id.$?.IdType==='doi');
    const dates=[...list(article.ArticleDate).map(date),date(article.Journal?.JournalIssue?.PubDate)].filter(Boolean).sort();
    const medlineYear=/\d{4}/.exec(text(article.Journal?.JournalIssue?.PubDate?.MedlineDate))?.[0];
    return {DOI:doi(text(identifier)),pmid,title:[clean(text(article.ArticleTitle))],abstract:clean(text(article.Abstract)),author:list(article.AuthorList?.Author).map(a=>({given:text(a.ForeName||a.Initials),family:text(a.LastName||a.CollectiveName)})),published:{'date-parts':[(dates[0]||medlineYear||'').split('-').filter(Boolean).map(Number)]},_publicationDates:dates,'container-title':[text(article.Journal?.Title)],subject:list(citation?.KeywordList).flatMap(k=>list(k.Keyword).map(text)),_source:'PubMed',_pubmedEvidence:true};
  }).filter(w=>w.pmid);
}
async function searchPubmedReview(options, plan, progress=()=>{}) {
  const budget=Math.min(1000,Math.max(options.limit*3,100));
  const query=new URLSearchParams({db:'pubmed',term:plan.pubmedQuery,datetype:'pdat',mindate:options.startYear+'/01/01',maxdate:options.endYear+'/12/31',sort:'relevance',retmode:'json',retmax:String(budget)});
  const search=await(await request(base+'/esearch.fcgi?'+query)).json();
  if(!search.esearchresult || search.error)throw new Error('PubMed: resposta inválida.');
  const ids=search.esearchresult.idlist||[],works=[];let checked=0;
  for(let i=0;i<ids.length&&works.length<options.limit;i+=100){
    progress(`PubMed: verificando títulos e resumos (${i}/${ids.length})…`);
    await new Promise(resolve=>setTimeout(resolve,350));
    const response=await request(base+'/efetch.fcgi',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({db:'pubmed',id:ids.slice(i,i+100).join(','),retmode:'xml'}).toString()});
    for(const work of await parseArticles(await response.text())){checked++;const match=assess(work,plan);if(match.accepted)works.push({...work,_relevance:match});}
  }
  return {works,total:Number(search.esearchresult.count||0),checked,limited:checked<Number(search.esearchresult.count||0)};
}
module.exports={parseArticles,searchPubmedReview};
