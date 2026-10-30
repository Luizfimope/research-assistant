const cron=require('node-cron');
const db=require('./db');
const {today,previousDay,timezone,publicationDate,doi,escape,safeUrl}=require('./core');
const {searchArxiv}=require('./fetchers/arxiv');
const {searchPubmed}=require('./fetchers/pubmed');
const {searchJournal}=require('./fetchers/crossref');
const zotero=require('./zotero');
const mailer=require('./mailer');
const crypto=require('crypto');
const {screen}=require('./daily-relevance');
let running=false;
function saveArticle(a,entity,table,date){
 const evaluation=table==='topics'?screen(entity.name,a):{accepted:true,scope:'journal',version:1};
 if(!evaluation.accepted)return false;
 const status=table==='topics'?'matched':'journal';
 const normalized=doi(a.doi);
 const keys=[normalized&&'doi:'+normalized,a.pmid&&'pmid:'+a.pmid,a.url&&'url:'+a.url].filter(Boolean);
 if(!keys.length)return false;
 db.exec('BEGIN IMMEDIATE');
 try{
  const existing=keys.map(k=>db.prepare('SELECT article_id FROM identities WHERE identity=?').get(k)).find(Boolean);
  let id=existing?.article_id;
  if(!id){
   const info=db.prepare('INSERT OR IGNORE INTO articles(topic_id,journal_id,title,authors,abstract,url,doi,pmid,source,published_date,selected_date,relevance_status,relevance_json,keywords_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(table==='topics'?entity.id:null,table==='journals'?entity.id:null,a.title,a.authors||'',a.abstract||'',a.url||null,normalized,a.pmid||null,a.source,date,date,status,JSON.stringify(evaluation),JSON.stringify(a.keywords||[]));
   id=info.changes?Number(info.lastInsertRowid):db.prepare('SELECT id FROM articles WHERE url=?').get(a.url)?.id;
  }
  const old=db.prepare('SELECT * FROM articles WHERE id=?').get(id);
  if(old){
   const reassign=old.relevance_status!=='matched'&&old.relevance_status!=='journal';
   db.prepare('UPDATE articles SET abstract=?,doi=COALESCE(doi,?),pmid=COALESCE(pmid,?),keywords_json=?,relevance_status=?,relevance_json=?,topic_id=?,journal_id=?,selected_date=CASE WHEN sent_at IS NULL THEN COALESCE(selected_date,?) ELSE selected_date END WHERE id=?').run(a.abstract||old.abstract||'',normalized,a.pmid||null,JSON.stringify(a.keywords||JSON.parse(old.keywords_json||'[]')),status,JSON.stringify(evaluation),reassign?(table==='topics'?entity.id:null):old.topic_id,reassign?(table==='journals'?entity.id:null):old.journal_id,date,id);
  }
  for(const k of keys)db.prepare('INSERT OR IGNORE INTO identities VALUES(?,?)').run(k,id);
  db.exec('COMMIT');return !existing;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
async function runDailySearch(date=previousDay(),errors=[],screening=[]){
 for(const table of ['topics','journals'])for(const entity of db.prepare('SELECT * FROM '+table+' WHERE active=1').all()){
  const sources=table==='topics'?[['arXiv',searchArxiv],['PubMed',searchPubmed]]:[['Crossref',searchJournal]];
  for(const [name,search] of sources){
   const counts={topic:entity.name,source:name,checked:0,matched:0,notConfirmed:0,otherDate:0};
   try{for(const a of await search(entity.issn||entity.name,date)){
    counts.checked++;
    if(publicationDate(a.published_date)!==date){counts.otherDate++;continue;}
    if(table==='topics'&&!screen(entity.name,a).accepted){counts.notConfirmed++;continue;}
    counts.matched++;saveArticle(a,entity,table,date);
   }}
   catch(e){errors.push(name+': '+entity.name+' — '+e.message);}
   screening.push(counts);
  }
 }
 return summaryFor(date);
}
function summaryFor(date){
 const rows=db.prepare("SELECT a.*,COALESCE(t.name,j.name) AS group_name FROM articles a LEFT JOIN topics t ON t.id=a.topic_id LEFT JOIN journals j ON j.id=a.journal_id WHERE selected_date=? AND sent_at IS NULL AND relevance_status IN ('matched','journal')").all(date);
 const groups=new Map();for(const a of rows){if(!groups.has(a.group_name))groups.set(a.group_name,[]);groups.get(a.group_name).push(a);}
 return Array.from(groups,([groupName,newArticles])=>({groupName,newArticles}));
}
function buildNewsletterHtml(summary,date=previousDay()){
 return '<main><h1>Artigos publicados em '+escape(date)+'</h1>'+ (summary.length?summary.map(g=>'<h2>'+escape(g.groupName)+'</h2>'+g.newArticles.map(a=>'<article><a href="'+escape(safeUrl(a.url))+'">'+escape(a.title)+'</a><p>'+escape(a.authors)+' · '+escape(a.source)+'</p><p>'+escape((a.abstract||'').slice(0,320))+'</p></article>').join('')).join(''):'<p>Nenhum artigo novo com data de publicação confirmada para este dia.</p>')+'</main>';
}
async function syncZotero(errors){
 if(!zotero.isConnected())return;
 for(const a of db.prepare("SELECT * FROM articles WHERE zotero_synced=0 AND relevance_status IN ('matched','journal')").all()){
  try{
   if(!a.zotero_item_key){a.zotero_item_key=Array.from(crypto.randomBytes(8),b=>'23456789ABCDEFGHIJKLMNPQRSTUVWXYZ'[b%32]).join('');db.prepare('UPDATE articles SET zotero_item_key=? WHERE id=?').run(a.zotero_item_key,a.id);}
   await zotero.addArticle(a);db.prepare('UPDATE articles SET zotero_synced=1 WHERE id=?').run(a.id);
  }catch(e){errors.push('Zotero: '+e.message);}
 }
}
async function runDailyJob(){
 if(running)throw new Error('Já existe uma busca em andamento.');
 db.exec('BEGIN IMMEDIATE');
 try {
  const owner=db.prepare("SELECT value FROM settings WHERE key='job_pid'").get();
  if(owner){let alive=true;try{process.kill(Number(owner.value),0);}catch(e){if(e.code==='ESRCH')alive=false;}
   if(alive)throw new Error('Outra instância está executando uma busca.');
  }
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('job_pid',?)").run(String(process.pid));
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 running=true; const deliveryDate=today(),date=previousDay(),errors=[],screening=[];
 const run=db.prepare("INSERT INTO runs(date,status) VALUES(?,'running')").run(date);
 try{
  await runDailySearch(date,errors,screening);
  await syncZotero(errors);
  const summary=summaryFor(date),totalCount=summary.reduce((n,g)=>n+g.newArticles.length,0);
  let edition=db.prepare('SELECT * FROM newsletters WHERE date=?').get(deliveryDate);
  if(!edition?.sent){
   if(!edition||['pending','blocked','failed'].includes(edition.status)){
    db.prepare("INSERT INTO newsletters(date,publication_date,html,article_count,status) VALUES(?,?,?,?,'pending') ON CONFLICT(date) DO UPDATE SET publication_date=excluded.publication_date,html=excluded.html,article_count=excluded.article_count").run(deliveryDate,date,buildNewsletterHtml(summary,date),totalCount);
    edition=db.prepare('SELECT * FROM newsletters WHERE date=?').get(deliveryDate);
   }
   if(errors.some(e=>!e.startsWith('Zotero:'))){db.prepare("UPDATE newsletters SET status='blocked',last_error=? WHERE date=?").run('Busca incompleta; tente novamente',deliveryDate);}
   else if(['sending','uncertain'].includes(edition.status)){errors.push('E-mail: envio anterior sem confirmação; conferir servidor antes de autorizar nova tentativa.');}
   else{
    try{
     mailer.buildTransport().close(); // valida configuração antes de registrar uma tentativa de envio
     db.prepare("UPDATE newsletters SET status='sending',attempts=attempts+1,last_error=NULL WHERE date=?").run(deliveryDate);
     const info=await mailer.sendNewsletter(edition.html,edition.article_count,date);
     db.exec('BEGIN IMMEDIATE');
     try{db.prepare("UPDATE newsletters SET sent=1,status='sent',message_id=? WHERE date=?").run(info.messageId||'',deliveryDate);
     db.prepare("UPDATE articles SET sent_at=? WHERE selected_date=? AND sent_at IS NULL AND relevance_status IN ('matched','journal')").run(new Date().toISOString(),date);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    }catch(e){
     const status=db.prepare('SELECT status FROM newsletters WHERE date=?').get(deliveryDate).status==='sending'?'uncertain':'failed';
     const detail=e.code?String(e.code):e.message.startsWith('Configuração ausente:')?e.message:'Falha SMTP; verificar configuração e servidor';
     db.prepare('UPDATE newsletters SET status=?,last_error=? WHERE date=?').run(status,detail,deliveryDate);errors.push('E-mail: '+detail);
    }
   }
  }
  db.prepare("UPDATE runs SET finished_at=datetime('now'),status=?,detail=? WHERE id=?").run(errors.length?'partial':'ok',JSON.stringify({errors,screening}),Number(run.lastInsertRowid));
  console.log('[daily]',date,errors.length?'parcial':'concluído',totalCount+' pendentes');
  return {summary,totalCount,errors,screening,publicationDate:date,deliveryDate};
 }catch(e){db.prepare("UPDATE runs SET finished_at=datetime('now'),status='failed',detail=? WHERE id=?").run('Falha interna; consultar configuração',Number(run.lastInsertRowid));throw e;}
 finally{running=false;db.prepare("DELETE FROM settings WHERE key='job_pid'").run();}
}
function start(){
 if(process.env.DISABLE_AUTOMATION==='1')return;
 const schedule=process.env.CRON_SCHEDULE||'0 7 * * *';
 if(!cron.validate(schedule))throw new Error('CRON_SCHEDULE inválido');
 cron.schedule(schedule,()=>runIfDue().catch(e=>console.error('[daily]',e.message)),{timezone:timezone()});
 if(process.env.DISABLE_AUTOMATION!=='1'){runIfDue({startup:true}).catch(e=>console.error('[startup]',e.message));cron.schedule('*/15 * * * *',()=>runIfDue().catch(e=>console.error('[retry]',e.message)),{timezone:timezone()});}
 console.log('[scheduler]',schedule,timezone());
}
async function runIfDue({startup=false}={}){const edition=db.prepare('SELECT sent,status FROM newsletters WHERE date=?').get(today());const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:timezone(),hour:'2-digit',hourCycle:'h23'}).format(new Date()));if(!startup&&!edition&&hour<7)return {skipped:true,errors:[]};if(edition?.sent||['sending','uncertain'].includes(edition?.status))return {skipped:true,errors:[]};if(running)return {skipped:true,errors:[]};return runDailyJob();}
module.exports={start,runIfDue,runDailyJob,runDailySearch,buildNewsletterHtml,saveArticle,summaryFor,isRunning:()=>running};
