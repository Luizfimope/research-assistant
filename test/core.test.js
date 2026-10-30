process.env.DB_PATH=':memory:';
process.env.TIMEZONE='America/Sao_Paulo';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../src/core');
let found=[],failure=false,sends=0,mailFailure=false,delay;
for(const [file,name] of [['arxiv','searchArxiv'],['pubmed','searchPubmed'],['crossref','searchJournal']]){
 const filename=require.resolve('../src/fetchers/'+file);
 require.cache[filename]={id:filename,filename,loaded:true,exports:{[name]:async()=>{if(delay)await delay;if(failure)throw new Error('source offline');return found;}}};
}
const db=require('../src/db');
const mailer=require('../src/mailer');
mailer.buildTransport=()=>({close(){}});
mailer.sendNewsletter=async()=>{sends++;if(mailFailure)throw new Error('socket timeout');return {messageId:'test-id'};};
const scheduler=require('../src/scheduler');
const date=core.previousDay();
function reset(){db.exec('DELETE FROM identities;DELETE FROM articles;DELETE FROM topics;DELETE FROM journals;DELETE FROM newsletters;DELETE FROM runs;DELETE FROM settings;');db.prepare('INSERT INTO topics(name) VALUES(?)').run('test');found=[];failure=false;sends=0;mailFailure=false;delay=null;}
const article=(extra={})=>({title:'Test A <unsafe>',authors:'Author',url:'https://example.org/paper',doi:'10.1/ABC',source:'test',published_date:date,...extra});
test('date precision and timezone',()=>{
 assert.equal(core.today(new Date('2026-10-30T01:00:00Z')),'2026-10-29');
 assert.equal(core.publicationDate('2026 Oct 3'),'2026-10-03');
 for(const value of ['2026','2026-10','2026 Feb','2026-02-30','2026 Oct 1-3'])assert.equal(core.publicationDate(value),null);
 assert.equal(core.doi('https://doi.org/10.1/ABC'),'10.1/abc');
});
test('strict publication filter, global persistent identifiers, single send',async()=>{
 reset();found=[article(),article({url:'https://other.org',doi:'https://doi.org/10.1/abc'}),article({url:'https://old.org',doi:'10.1/old',published_date:'2001-01-01'}),article({url:'https://unknown.org',doi:'10.1/unknown',published_date:null})];
 await scheduler.runDailyJob();await scheduler.runDailyJob();
 assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,1);assert.equal(sends,1);
 assert.equal(db.prepare('SELECT sent FROM newsletters').get().sent,1);
 assert.match(db.prepare('SELECT html FROM newsletters').get().html,/&lt;unsafe&gt;/);
 const edition=db.prepare('SELECT date,publication_date FROM newsletters').get();
 assert.equal(edition.date,core.today());assert.equal(edition.publication_date,date);
 await scheduler.runIfDue({startup:true});assert.equal(sends,1);
});
test('PMID matches across URLs and enriches DOI identity',()=>{
 reset();const entity=db.prepare('SELECT * FROM topics').get();
 scheduler.saveArticle(article({doi:null,pmid:'123'}),entity,'topics',date);
 scheduler.saveArticle(article({url:'https://second.org',doi:'10.1/new',pmid:'123'}),entity,'topics',date);
 scheduler.saveArticle(article({url:'https://third.org',doi:'10.1/new'}),entity,'topics',date);
 assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,1);
});
test('search failure blocks misleading email; retry includes saved articles',async()=>{
 reset();found=[article()];failure=true;await scheduler.runDailyJob();assert.equal(sends,0);
 assert.equal(db.prepare('SELECT status FROM newsletters').get().status,'blocked');
 failure=false;await scheduler.runDailyJob();assert.equal(sends,1);assert.equal(db.prepare('SELECT article_count FROM newsletters').get().article_count,1);
});
test('ambiguous SMTP failure preserves edition and does not resend',async()=>{
 reset();found=[article()];mailFailure=true;await scheduler.runDailyJob();const before=db.prepare('SELECT html FROM newsletters').get().html;
 mailFailure=false;await scheduler.runDailyJob();assert.equal(sends,1);assert.equal(db.prepare('SELECT status FROM newsletters').get().status,'uncertain');assert.equal(db.prepare('SELECT html FROM newsletters').get().html,before);
});
test('concurrent manual and scheduled job is rejected',async()=>{
 reset();let release;delay=new Promise(resolve=>release=resolve);const first=scheduler.runDailyJob();
 await assert.rejects(scheduler.runDailyJob(),/andamento/);release();await first;
});
test('newsletter escapes HTML and unsafe links',()=>{
 const html=scheduler.buildNewsletterHtml([{groupName:'<script>',newArticles:[article({url:'javascript:alert(1)'})]}],date);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('javascript:'));assert.ok(html.includes('href="#"'));
});

test('daily topics reject the exact unrelated physics and marine-computing examples',async()=>{
 reset();db.prepare('UPDATE topics SET name=?').run('marine mamals');
 found=[article({title:'Surface Conditioning for Zero-Shot Multivariate Correction in a Marine Biogeochemistry Emulator',url:'https://example.org/emulator',doi:'10.1234/emulator'}),article({title:'Marine mammal health in cetaceans',url:'https://example.org/mammals',doi:'10.1234/mammals'})];
 const screening=[];await scheduler.runDailySearch(date,[],screening);
 assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,1);assert.equal(db.prepare('SELECT relevance_status FROM articles').get().relevance_status,'matched');assert.ok(screening.every(s=>s.notConfirmed===1&&s.matched===1));
 reset();db.prepare('UPDATE topics SET name=?').run('Sea turtle');
 found=[article({title:'Proton GTMDs and Wigner Distributions in the Chiral Quark Soliton Model: Orbital Angular Momentum and Spin-Orbit Correlation with Sea Quarks',url:'https://example.org/quarks',doi:'10.1234/quarks'}),article({title:'Stability-Performance Trade-off in Maritime Integrated Sensing, Communication, and Computation',url:'https://example.org/maritime',doi:'10.1234/maritime'}),article({title:'Sea turtle conservation and Caretta caretta health',url:'https://example.org/turtle',doi:'10.1234/turtle'})];
 await scheduler.runDailySearch();assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,1);assert.match(db.prepare('SELECT title FROM articles').get().title,/Sea turtle/);
});
test('history revalidation preserves unconfirmed papers but excludes them from email and Zotero',async()=>{
 reset();db.prepare('UPDATE topics SET name=?').run('Sea turtle');const topic=db.prepare('SELECT id FROM topics').get();
 const id=Number(db.prepare('INSERT INTO articles(topic_id,title,url,source,published_date,selected_date) VALUES(?,?,?,?,?,?)').run(topic.id,'Sea quarks in a proton','https://example.org/bad-history','arXiv',date,date).lastInsertRowid);
 require('../src/daily-relevance').refreshHistory(db);
 assert.equal(db.prepare('SELECT relevance_status FROM articles WHERE id=?').get(id).relevance_status,'not_confirmed');
 const zotero=require('../src/zotero'),oldConnected=zotero.isConnected,oldAdd=zotero.addArticle;let uploaded=[];
 zotero.isConnected=()=>true;zotero.addArticle=async a=>{uploaded.push(a.title);return a.zotero_item_key;};
 try{found=[article({title:'Sea turtle health',doi:'10.1234/valid'})];await scheduler.runDailyJob();assert.deepEqual(uploaded,['Sea turtle health']);assert.equal(db.prepare('SELECT sent_at FROM articles WHERE id=?').get(id).sent_at,null);assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,2);assert.equal(db.prepare('SELECT article_count FROM newsletters').get().article_count,1);}finally{zotero.isConnected=oldConnected;zotero.addArticle=oldAdd;}
});
