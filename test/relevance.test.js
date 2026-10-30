process.env.DB_PATH=':memory:';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {planSearch,assess,clean}=require('../src/relevance');
const topic='plasmodium em aves marinhas',plan=planSearch(topic);
const work=(title,abstract='',subject=[])=>({title:[title],abstract,subject});
test('Portuguese topic becomes mandatory scientific concept groups with English alternatives',()=>{
 assert.equal(plan.groups.length,2);assert.match(plan.pubmedQuery,/ AND /);assert.match(plan.pubmedQuery,/Plasmodium/);assert.match(plan.pubmedQuery,/seabird/);assert.ok(!plan.groups.some(g=>g.includes('em')));
});
test('requires parasite and seabird evidence in own title abstract or keywords',()=>{
 for(const candidate of [work('Avian malaria in seabirds'),work('Plasmodium relictum in penguins'),work('Blood parasites of seabirds','Plasmodium was detected.'),work('Plasmodium infection in birds','',['seabirds'])])assert.equal(assess(candidate,plan).accepted,true);
 for(const candidate of [work('Plasmodium falciparum malaria in human patients'),work('Seabird conservation'),work('Metáforas marinhas em território alemão'),work('Arlequina em Aves de Rapina'),work('Salmonella in seabirds'),work('Plasmodium in freshwater fish')])assert.equal(assess(candidate,plan).accepted,false);
});
test('rejects matches in references, journal and authors and avoids substrings',()=>{
 assert.equal(assess({...work('Unrelated title'),reference:[{unstructured:'Plasmodium in seabirds'}],author:[{family:'Plasmodium'}],'container-title':['seabirds']},plan).accepted,false);
 assert.equal(assess(work('Plasmodium alternate treatment'),plan).accepted,false); // tern must not match alternate
 assert.equal(assess(work('Plasmodium in humans','',['tropical medicine']),plan).accepted,false);
});
test('manual alternatives use OR within groups and AND across groups',()=>{
 const custom=planSearch('Research','Plasmodium | avian malaria\nseabird | penguin');
 assert.equal(assess(work('Avian malaria in penguins'),custom).accepted,false); // explicit terms do not silently stem
 assert.equal(assess(work('Plasmodium in penguin'),custom).accepted,true);
 assert.throws(()=>planSearch('Research','x'));
});
test('HTML entities are decoded before stripping tags and screening',()=>{
 assert.equal(clean('In &lt;i&gt;Plasmodium&lt;/i&gt; &amp; birds'),'In Plasmodium & birds');
 assert.equal(assess(work('&lt;em&gt;Plasmodium&lt;/em&gt; in seabirds'),plan).accepted,true);
});
test('PubMed XML preserves mixed title order, abstracts PMID and electronic publication date',async()=>{
 const {parseArticles}=require('../src/review-pubmed');
 const records=await parseArticles('<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">123</PMID><Article><ArticleTitle>Detection of <i>Plasmodium</i> in seabirds</ArticleTitle><Abstract><AbstractText Label="RESULTS">Parasites detected in <i>penguins</i>.</AbstractText></Abstract><Journal><Title>Journal</Title><JournalIssue><PubDate><Year>2020</Year><Month>Dec</Month></PubDate></JournalIssue></Journal><ArticleDate DateType="Electronic"><Year>2019</Year><Month>11</Month><Day>03</Day></ArticleDate></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1234/a</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>');
 assert.equal(records[0].title[0],'Detection of Plasmodium in seabirds');assert.equal(records[0].pmid,'123');assert.equal(records[0].DOI,'10.1234/a');assert.deepEqual(records[0].published['date-parts'][0],[2019,11,3]);assert.match(records[0].abstract,/penguins/);
});
test('PubMed articles without DOI stay in the review with PMID links',()=>{
 const {buildGraph}=require('../src/literature');const graph=buildGraph([{pmid:'123',title:['Avian malaria in seabirds'],published:{'date-parts':[[2020]]}}],{startYear:2003,endYear:2026});assert.equal(graph.stats.articles,1);assert.equal(graph.nodes[0].doi,null);assert.equal(graph.nodes[0].url,'https://pubmed.ncbi.nlm.nih.gov/123/');
});
test('Obsidian export preserves PMID-only publications and correct source',()=>{
 const {exportReview}=require('../src/obsidian'),{buildGraph}=require('../src/literature');
 const result=buildGraph([{pmid:'123',title:['Avian malaria in seabirds'],published:{'date-parts':[[2020]]},_source:'PubMed'}],{startYear:2003,endYear:2026});
 result.source='PubMed + Crossref';result.query={topic:'test',startYear:2003,endYear:2026,limit:100};
 const content=exportReview({result}).toString();assert.ok(content.includes('https://pubmed.ncbi.nlm.nih.gov/123/'));assert.ok(!content.includes('https://doi.org/null'));assert.ok(content.includes('fonte: "PubMed"'));
});

test('marine mammals spelling variants form a single concept and do not match marine alone',()=>{
 const typo=planSearch('marine mamals'),correct=planSearch('marine mammals');assert.deepEqual(typo.groups,correct.groups);assert.equal(typo.groups.length,1);assert.equal(typo.understoodAs,'marine mammals');
 for(const title of ['Marine mammal conservation','Acoustic monitoring of cetaceans','Dolphin population health'])assert.equal(assess(work(title),typo).accepted,true);
 for(const title of ['Marine biogeochemistry emulator','Maritime communication and sensing','Sea quarks in the proton'])assert.equal(assess(work(title),typo).accepted,false);
});
test('sea turtle keeps the phrase and scientific names without accepting sea alone or freshwater turtles',()=>{
 const plan=planSearch('Sea turtle');assert.equal(plan.groups.length,1);
 for(const title of ['Sea turtle health','Caretta caretta migration','Hematology of Chelonia mydas'])assert.equal(assess(work(title),plan).accepted,true);
 for(const title of ['Quarks in the Dirac sea','Maritime RL sensing','Softshell turtles in freshwater','Trachemys scripta in freshwater'])assert.equal(assess(work(title),plan).accepted,false);
});
