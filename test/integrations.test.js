const {test}=require('node:test');const assert=require('node:assert/strict');
let responses=[],urls=[];
const httpPath=require.resolve('../src/http');require.cache[httpPath]={id:httpPath,filename:httpPath,loaded:true,exports:async url=>{urls.push(url);return {json:async()=>responses.shift(),text:async()=>responses.shift()};}};
test('PubMed queries publication date and extracts PMID/DOI; earliest full date wins',async()=>{
 responses=[{esearchresult:{count:'1',idlist:['123']}},'<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>123</PMID><Article><ArticleTitle>Paper about marine mammals</ArticleTitle><Abstract><AbstractText>Full abstract about cetaceans.</AbstractText></Abstract><Journal><Title>Journal</Title><JournalIssue><PubDate><Year>2026</Year><Month>10</Month><Day>30</Day></PubDate></JournalIssue></Journal><ArticleDate DateType="Electronic"><Year>2026</Year><Month>10</Month><Day>29</Day></ArticleDate></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1/real</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>'];
 const rows=await require('../src/fetchers/pubmed').searchPubmed('topic','2026-10-30');
 const query=new URL(urls[0]).searchParams;assert.equal(query.get('datetype'),'pdat');assert.equal(query.get('mindate'),query.get('maxdate'));assert.equal(rows[0].pmid,'123');assert.equal(rows[0].doi,'10.1/real');assert.equal(rows[0].published_date,'2026-10-29');assert.match(rows[0].abstract,/Full abstract/);assert.match(query.get('term'),/Title\/Abstract/);
});
test('Crossref filters publication day and does not fabricate incomplete dates',async()=>{
 responses=[{message:{items:[{title:['Test'],DOI:'10.1/a',URL:'https://doi.org/10.1/a','container-title':['Nature'],published:{'date-parts':[[2026,10]]}}]}}];
 const rows=await require('../src/fetchers/crossref').searchJournal('Nature','2026-10-30');assert.equal(rows[0].published_date,null);assert.match(urls.at(-1),/until-pub-date/);
});
test('arXiv uses submitted date range and detects truncated responses',async()=>{
 responses=['<feed xmlns:opensearch="http://a"><opensearch:totalResults>201</opensearch:totalResults></feed>'];
 await assert.rejects(require('../src/fetchers/arxiv').searchArxiv('topic','2026-10-30'),/200/);
});
test('mailer TLS mode and SMTP recipient rejection',async()=>{
 let options;const nodemailer=require('nodemailer');nodemailer.createTransport=o=>{options=o;return {sendMail:async()=>({accepted:['a'],rejected:['b']}),close(){}};};
 Object.assign(process.env,{SMTP_HOST:'localhost',SMTP_PORT:'587',SMTP_USER:'u',SMTP_PASS:'p',EMAIL_FROM:'a@example.org',EMAIL_TO:'b@example.org'});
 const mailer=require('../src/mailer');mailer.buildTransport();assert.equal(options.secure,false);assert.equal(options.requireTLS,true);
 await assert.rejects(mailer.sendNewsletter('html',1,'2026-10-30'),/destinatários/);
});
test('Zotero validates HTTP 200 item failures, never accepts batch failure as synced',async()=>{
 const fetchPath=require.resolve('node-fetch');require.cache[fetchPath]={id:fetchPath,filename:fetchPath,loaded:true,exports:async()=>({ok:false,status:404})};
 Object.assign(process.env,{ZOTERO_API_KEY:'test-secret',ZOTERO_LIBRARY_ID:'123'});
 responses=[{failed:{'0':{code:400}}}];
 await assert.rejects(require('../src/zotero').addArticle({title:'Paper',url:'https://example.org',published_date:'2026-10-30',zotero_item_key:'ABCDEFGH'}),/recusou/);
});

test('arXiv uses complete marine-mammal phrases in title/abstract, never all fields',async()=>{
 responses=['<feed xmlns:opensearch="http://a"><opensearch:totalResults>0</opensearch:totalResults></feed>'];
 await require('../src/fetchers/arxiv').searchArxiv('marine mamals','2026-10-29');
 const term=new URL(urls.at(-1)).searchParams.get('search_query');assert.match(term,/ti:"marine mammals"/);assert.match(term,/abs:"marine mammals"/);assert.ok(!term.includes('all:'));assert.match(term,/submittedDate:\[202610290000 TO 202610292359\]/);
});
