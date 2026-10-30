process.env.DB_PATH=':memory:';
const {test}=require('node:test');const assert=require('node:assert/strict');
let payloads=[],queries=[];
const requestPath=require.resolve('../src/http');require.cache[requestPath]={id:requestPath,filename:requestPath,loaded:true,exports:async url=>{const parsed=new URL(url);if(parsed.hostname==='eutils.ncbi.nlm.nih.gov')return {json:async()=>({esearchresult:{count:'0',idlist:[]}})};queries.push(parsed);return {json:async()=>payloads.shift()};}};
const literature=require('../src/literature');
const {previousDay}=require('../src/core');
const work=(DOI,year,references=[])=>({DOI,title:['Paper '+DOI],published:{'date-parts':[[year,1,5]]},reference:references});
test('previous day handles timezone, month and leap-year boundaries',()=>{
 assert.equal(previousDay(new Date('2026-01-01T12:00:00Z')),'2025-12-31');
 assert.equal(previousDay(new Date('2024-03-01T12:00:00Z')),'2024-02-29');
 assert.equal(previousDay(new Date('2026-10-30T01:00:00Z')),'2026-10-28');
});
test('validates theme, inclusive year range and result limit',()=>{
 assert.deepEqual(literature.validate({topic:'  insomnia ',startYear:'2003',endYear:'2026',limit:'100'}),{topic:'insomnia',startYear:2003,endYear:2026,limit:100});
 for(const input of [{topic:'x',startYear:2003,endYear:2026},{topic:'valid',startYear:2027,endYear:2003},{topic:'valid',startYear:2003,endYear:9999},{topic:'valid',startYear:2003,endYear:2026,limit:10000}])assert.throws(()=>literature.validate(input));
});
test('citation graph preserves directed DOI evidence, duplicates and out-of-period context',()=>{
 const result=literature.buildGraph([work('10.1234/a',2003,[{DOI:'10.1234/B'},{DOI:'https://doi.org/10.1234/b'},{DOI:'10.1234/external',year:'1990'},{unstructured:'no DOI'}]),work('10.1234/b',2026),work('10.1234/too-old',2002),work('10.1234/a',2003),work(null,2020)],{startYear:2003,endYear:2026});
 assert.equal(result.stats.articles,2);assert.equal(result.links.length,2);assert.equal(result.stats.externalReferences,1);assert.equal(result.stats.unlinkedReferences,1);assert.equal(result.stats.withoutDOI,1);
 assert.equal(result.nodes.find(n=>n.id==='10.1234/external').external,true);assert.equal(result.links[0].source,'10.1234/a');assert.equal(result.links[0].target,'10.1234/b');assert.ok(!result.nodes.some(n=>n.id==='10.1234/too-old'));
});
test('graph never invents edges from matching titles',()=>{
 const result=literature.buildGraph([work('10.1234/a',2020,[{unstructured:'Paper 10.1234/b'}]),work('10.1234/b',2020)],{startYear:2003,endYear:2026});assert.equal(result.links.length,0);
});
test('search uses bounded publication-date query and records truncation',async()=>{
 payloads=[{message:{items:[{...work('10.1234/a',2020),title:['Treatment of insomnia']}],'total-results':42}}];
 const result=await literature.searchLiterature({topic:'insomnia',startYear:2003,endYear:2026,limit:10});
 assert.equal(result.limited,true);assert.equal(result.nodes.length,1);assert.match(queries[0].searchParams.get('filter'),/from-pub-date:2003-01-01,until-pub-date:2026-12-31/);assert.equal(queries[0].searchParams.get('query.bibliographic'),'insomnia');
 assert.equal(queries[0].searchParams.get('sort'),'score');assert.equal(queries[0].searchParams.get('order'),'desc');
});
test('irrelevant candidates are not used to fill requested result count',async()=>{
 payloads=[{message:{items:[{...work('10.1234/irrelevant',2020),title:['Marine metaphors in German philosophy']}],'total-results':1}}];
 const result=await literature.searchLiterature({topic:'plasmodium em aves marinhas',startYear:2003,endYear:2026,limit:10});
 assert.equal(result.stats.articles,0);assert.equal(result.screening.rejectedCrossref,1);assert.ok(result.warnings.some(w=>w.includes('Nenhum artigo')));
});
test('Obsidian ZIP uses stable safe filenames and working wiki links',()=>{
 const {crc32,zip,exportReview}=require('../src/obsidian');assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
 const result=literature.buildGraph([work('10.1234/../../a',2020,[{DOI:'10.1234/b'}]),work('10.1234/b',2020)],{startYear:2003,endYear:2026});
 result.query={topic:'Test',startYear:2003,endYear:2026,limit:100};result.retrievedAt='2026-10-30';
 const archive=exportReview({result});assert.equal(archive.readUInt32LE(0),0x04034b50);assert.equal(archive.readUInt16LE(archive.length-12),3);assert.match(archive.toString(),/\[\[artigo-[a-f0-9]{16}\|/);assert.equal(zip([['a.md','hi']]).readUInt32LE(0),0x04034b50);
});
test('review results are persisted independently from newsletter history',async()=>{
 const db=require('../src/db');payloads=[{message:{items:[work('10.1234/saved',2020)],'total-results':1}}];
 const id=literature.createReview({topic:'Paper',startYear:2003,endYear:2026,limit:10});
 for(let i=0;i<40&&literature.getReview(id).status==='running';i++)await new Promise(resolve=>setTimeout(resolve,5));
 const saved=literature.getReview(id);assert.equal(saved.status,'complete');assert.equal(saved.result.nodes[0].id,'10.1234/saved');assert.equal(db.prepare('SELECT count(*) n FROM newsletters').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,0);
});
