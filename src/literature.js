const db = require('./db');
const request = require('./http');
const { doi, today } = require('./core');
const {clean,planSearch,assess}=require('./relevance');
const {searchPubmedReview}=require('./review-pubmed');

function validate(input) {
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  const startYear = Number(input.startYear), endYear = Number(input.endYear);
  const limit = Number(input.limit ?? 100);
  if (topic.length < 2 || topic.length > 300) throw new Error('Informe um tema entre 2 e 300 caracteres.');
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < 1800 || endYear > Number(today().slice(0,4)) || startYear > endYear) throw new Error('Informe um intervalo válido entre 1800 e o ano atual.');
  if (!Number.isInteger(limit) || limit < 10 || limit > 500) throw new Error('Escolha entre 10 e 500 artigos.');
  planSearch(topic,input.concepts);
  return { topic, startYear, endYear, limit, ...(input.concepts ? {concepts:input.concepts} : {}) };
}
function workDate(work) {
  return [work['published-online'], work['published-print'], work.published].map(x => x?.['date-parts']?.[0]).filter(x => x?.length && Number.isInteger(x[0])).map(x => x.map((v,i) => i ? String(v).padStart(2,'0') : v).join('-')).sort()[0] || null;
}
function buildGraph(works, options) {
  const nodes = new Map(), links = new Map();
  let withoutDOI = 0, withoutReferences = 0, unlinkedReferences = 0, omittedLinks = 0;
  const seeds = [];
  for (const w of works) {
    const articleDoi=doi(w.DOI),id=articleDoi || (w.pmid ? 'pmid:'+w.pmid : null), date = workDate(w), year = Number(date?.slice(0,4));
    if(!articleDoi)withoutDOI++;
    if (!id) continue;
    if (!date || year < options.startYear || year > options.endYear || nodes.has(id)) continue;
    nodes.set(id, {id, doi:articleDoi,pmid:w.pmid || null,title:clean(w.title?.[0] || id),authors:(w.author || []).map(a => [a.given,a.family].filter(Boolean).join(' ')).join(', '),date,year,journal:clean(w['container-title']?.[0] || ''),abstract:clean(w.abstract),url:articleDoi?'https://doi.org/'+articleDoi:'https://pubmed.ncbi.nlm.nih.gov/'+w.pmid+'/',citations:Number(w['is-referenced-by-count'] || 0),external:false,source:w._source || 'Crossref',relevance:w._relevance || null});
    seeds.push(w);
  }
  for (const w of seeds) {
    const source = doi(w.DOI) || 'pmid:'+w.pmid;
    if (!w.reference?.length) withoutReferences++;
    for (const ref of w.reference || []) {
      const target = doi(ref.DOI);
      if (!target) { unlinkedReferences++; continue; }
      if (source === target || links.has(source+'\n'+target)) continue;
      if (links.size >= 4000 || (!nodes.has(target) && nodes.size >= 1500)) { omittedLinks++; continue; }
      if (!nodes.has(target)) nodes.set(target,{id:target,doi:target,title:clean(ref['article-title'] || ref.unstructured || target), authors:clean(ref.author || ''),year:Number(ref.year) || null,date:ref.year || null,journal:clean(ref['journal-title'] || ''),abstract:'',url:'https://doi.org/'+target,external:true});
      links.set(source+'\n'+target, {source,target,evidence:'Crossref reference DOI'});
    }
  }
  return {nodes:[...nodes.values()],links:[...links.values()],stats:{articles:seeds.length,externalReferences:nodes.size-seeds.length,connections:links.size,withoutDOI,withoutReferences,unlinkedReferences,omittedLinks},source:'Crossref',referenceDepth:1};
}
async function searchCrossref(options,plan,progress){
 const candidates=[],seen=new Set();let cursor='*',total=0,matching=0;
 const budget=Math.min(2000,Math.max(200,options.limit*5));
 while(candidates.length<budget&&matching<options.limit){
  const rows=Math.min(100,budget-candidates.length);
  const params=new URLSearchParams({'query.bibliographic':plan.crossrefQuery,filter:'from-pub-date:'+options.startYear+'-01-01,until-pub-date:'+options.endYear+'-12-31,type:journal-article',sort:'score',order:'desc',rows:String(rows),cursor});
  progress('Crossref: avaliando conceitos em '+candidates.length+' candidatos…');
  const json=await(await request('https://api.crossref.org/works?'+params)).json();
  if(!Array.isArray(json.message?.items))throw new Error('Resposta inválida da Crossref.');
  total=Number(json.message['total-results']||0);let added=0;
  for(const w of json.message.items){const key=doi(w.DOI);if(key&&!seen.has(key)){seen.add(key);const relevance=assess(w,plan);candidates.push({...w,_source:'Crossref',_relevance:relevance});if(relevance.accepted)matching++;added++;}}
  if(json.message.items.length<rows||!json.message['next-cursor']||!added)break;
  if(cursor===json.message['next-cursor'])throw new Error('Crossref: paginação interrompida.');
  cursor=json.message['next-cursor'];await new Promise(resolve=>setTimeout(resolve,200));
 }
 return {candidates,total,checked:candidates.length,limited:candidates.length<total};
}
async function searchLiterature(options, progress = () => {}) {
 const plan=planSearch(options.topic,options.concepts),warnings=[],sources=[];
 let crossref={candidates:[],total:0,checked:0,limited:false},pubmed={works:[],total:0,checked:0,limited:false};
 progress('PubMed: buscando a interseção dos conceitos obrigatórios…');
 try{pubmed=await searchPubmedReview(options,plan,progress);sources.push('PubMed');}catch(error){warnings.push('PubMed indisponível; a busca nesta base não foi concluída.');}
 try{crossref=await searchCrossref(options,plan,progress);sources.push('Crossref');}catch(error){warnings.push('Crossref indisponível; a busca nesta base não foi concluída.');}
 if(!sources.length)throw new Error('As bases científicas estão indisponíveis. Tente novamente.');
 const candidates=new Map(crossref.candidates.map(w=>[doi(w.DOI),w])),accepted=new Map();
 for(const work of pubmed.works){
  const key=doi(work.DOI)||'pmid:'+work.pmid,cross=candidates.get(doi(work.DOI));
  accepted.set(key,{...(cross||{}),...work,reference:cross?.reference||[],_source:cross?'PubMed + Crossref':'PubMed'});
 }
 for(const work of crossref.candidates.filter(w=>w._relevance.accepted)){
  const key=doi(work.DOI);if(!accepted.has(key))accepted.set(key,work);
 }
 const all=[...accepted.values()].filter(w=>{const year=Number(workDate(w)?.slice(0,4));return year>=options.startYear&&year<=options.endYear;}).sort((a,b)=>(b._relevance?.score||0)-(a._relevance?.score||0));
 const selected=all.slice(0,options.limit);let enriched=0,enrichmentFailed=0;
 // Bounded enrichment: discovery is separate from citation metadata retrieval.
 for(const work of selected.filter(w=>w.DOI&&!w.reference?.length&&w._pubmedEvidence).slice(0,15)){
  progress('Recuperando referências dos artigos confirmados ('+(++enriched)+'/15)…');
  try{const json=await(await request('https://api.crossref.org/works/'+encodeURIComponent(doi(work.DOI)))).json();if(doi(json.message?.DOI)===doi(work.DOI))work.reference=json.message.reference||[];}catch{enrichmentFailed++;}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 if(enrichmentFailed)warnings.push('Não foi possível recuperar referências de '+enrichmentFailed+' artigo(s).');
 if(!all.length)warnings.push('Nenhum artigo confirmou todos os conceitos nos metadados consultados. Ajuste os sinônimos; a lista não será preenchida com resultados parciais.');
 progress('Organizando os artigos compatíveis e o mapa de referências…');
 const graph=buildGraph(selected,options);
 const checked=pubmed.checked+crossref.checked;
 return {...graph,source:sources.join(' + '),query:options,plan,algorithmVersion:2,totalMatches:all.length,limited:all.length>options.limit||pubmed.limited||crossref.limited,retrievedAt:new Date().toISOString(),warnings,screening:{checked,rejectedCrossref:crossref.candidates.filter(w=>!w._relevance.accepted).length,accepted:all.length,sourceCounts:{pubmed:pubmed.total,crossref:crossref.total},enrichedReferences:enriched}};
}
function recoverInterrupted() {
  for (const row of db.prepare("SELECT id,owner_pid FROM literature_reviews WHERE status='running'").all()) {
    let alive=false; if(row.owner_pid) { try {process.kill(row.owner_pid,0);alive=true;} catch {} }
    if (!alive) db.prepare("UPDATE literature_reviews SET status='failed',error='Busca interrompida. Inicie uma nova revisão.',finished_at=datetime('now') WHERE id=?").run(row.id);
  }
}
function createReview(input) {
  const options = validate(input);
  recoverInterrupted();
  db.exec('BEGIN IMMEDIATE');
  let id;
  try {
    if(db.prepare("SELECT id FROM literature_reviews WHERE status='running'").get()) throw new Error('Uma revisão já está em andamento. Aguarde a conclusão.');
    id=Number(db.prepare("INSERT INTO literature_reviews(topic,start_year,end_year,result_limit,owner_pid,progress) VALUES(?,?,?,?,?,?)").run(options.topic,options.startYear,options.endYear,options.limit,process.pid,'Iniciando busca…').lastInsertRowid);
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  setImmediate(async()=>{
    try {
      const result=await searchLiterature(options,message=>db.prepare('UPDATE literature_reviews SET progress=? WHERE id=?').run(message,id));
      db.prepare("UPDATE literature_reviews SET result_json=?,status='complete',progress='Concluída',finished_at=datetime('now') WHERE id=?").run(JSON.stringify(result),id);
    } catch(error) {
      const safeMessage = error.message.startsWith('HTTP ') ? error.message : 'Não foi possível concluir a consulta. Verifique a conexão ou refine o tema e tente novamente.';
      db.prepare("UPDATE literature_reviews SET status='failed',error=?,finished_at=datetime('now') WHERE id=?").run(safeMessage,id);
    }
  });
  return id;
}
function listReviews() {recoverInterrupted();return db.prepare("SELECT id,topic,start_year,end_year,result_limit,status,progress,error,created_at,CASE WHEN result_json IS NOT NULL THEN json_extract(result_json,'$.algorithmVersion') END AS algorithm_version FROM literature_reviews ORDER BY id DESC LIMIT 30").all();}
function getReview(id) {
  recoverInterrupted();
  const row=db.prepare('SELECT * FROM literature_reviews WHERE id=?').get(id);
  if(!row) return null;
  const {result_json,owner_pid,...rest}=row;
  return {...rest,result:result_json ? JSON.parse(result_json) : null};
}
module.exports={validate,workDate,buildGraph,searchLiterature,createReview,listReviews,getReview};
