// Controlled, visible expansions. Users can edit every group; this is not a general translator.
const dictionary = [
  {names:['marine mammals','marine mammal','marine mamals','marine mamal','mamiferos marinhos','mamifero marinho'],terms:['marine mammals','marine mammal','cetacean','cetaceans','pinniped','pinnipeds','whale','whales','dolphin','dolphins','porpoise','porpoises','sea lion','sea lions','fur seal','fur seals','harbor seal','harbour seal','elephant seal','elephant seals','walrus','walruses','manatee','manatees','dugong','dugongs','mamíferos marinhos','mamífero marinho','baleia','baleias','golfinho','golfinhos','cetáceo','cetáceos','pinípede','pinípedes']},
  {names:['sea turtle','sea turtles','marine turtle','marine turtles','tartaruga marinha','tartarugas marinhas'],terms:['sea turtle','sea turtles','marine turtle','marine turtles','tartaruga marinha','tartarugas marinhas','Chelonia mydas','Caretta caretta','Eretmochelys imbricata','Dermochelys coriacea','Lepidochelys olivacea','Lepidochelys kempii','Natator depressus','Cheloniidae','Dermochelyidae']},
  {names:['turtle','turtles','tartaruga','tartarugas'],terms:['turtle','turtles','tartaruga','tartarugas','Testudines']},
  {names:['tilapia','tilapias'],terms:['tilapia','tilapias','Oreochromis','Sarotherodon','Coptodon']},
  {names:['aves marinhas','ave marinha','seabirds','seabird','sea birds','marine birds'], terms:['seabird','seabirds','sea bird','sea birds','marine bird','marine birds','aves marinhas','ave marinha','penguin','penguins','pinguim','pinguins','albatross','albatrosses','petrel','petrels','frigatebird','frigatebirds','booby','boobies','gull','gulls','tern','terns','spheniscus','spheniscidae','procellariiformes','sulidae']},
  {names:['plasmodium'],terms:['Plasmodium','avian malaria','malária aviária']},
  {names:['malaria aviaria','avian malaria'],terms:['avian malaria','Plasmodium','malária aviária']},
  {names:['terapia cognitivo comportamental','terapia cognitiva comportamental','cognitive behavioral therapy','cognitive behavioural therapy'],terms:['cognitive behavioral therapy','cognitive behavioural therapy','terapia cognitivo comportamental','CBT']},
  {names:['insonia','insomnia'],terms:['insomnia','insônia']},
  {names:['aves','birds'],terms:['birds','bird','avian','aves','ave']},
  {names:['pinguins','penguins','pinguim','penguin'],terms:['penguin','penguins','pinguim','pinguins','Spheniscus','Spheniscidae']},
  {names:['malaria','malária'],terms:['malaria','malária','Plasmodium']}
];
function clean(value) {
  return String(value || '').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&').replace(/&#(?:x([a-f0-9]+)|(\d+));/gi,(_,h,d)=>{const n=parseInt(h||d,h?16:10);return n<=0x10ffff?String.fromCodePoint(n):' ';}).replace(/<[^>]*>/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim();
}
const normalize = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const stopwords = new Set('em de do da dos das e ou para por sobre no na nos nas um uma o a os as in on of for with and or the from effect effects study studies estudo estudos efeito efeitos'.split(' '));
function validateGroups(groups) {
  if(!Array.isArray(groups)||!groups.length||groups.length>10)throw new Error('Use entre 1 e 10 conceitos obrigatórios, um por linha.');
  return groups.map(group=>{
    if(!Array.isArray(group)||!group.length||group.length>40)throw new Error('Cada conceito precisa de 1 a 40 sinônimos separados por |.');
    const terms=[...new Set(group.map(t=>typeof t==='string'?t.trim():''))];
    if(terms.some(t=>t.length<2||t.length>100||!normalize(t)))throw new Error('Cada termo deve ter entre 2 e 100 caracteres.');
    return terms;
  });
}
function automaticGroups(topic) {
  let remaining=' '+normalize(topic)+' ';
  const groups=[];
  for(const entry of [...dictionary].sort((a,b)=>Math.max(...b.names.map(n=>n.length))-Math.max(...a.names.map(n=>n.length)))){
    let found=false;
    for(const alias of entry.names){const term=' '+normalize(alias)+' ';if(remaining.includes(term)){remaining=remaining.split(term).join(' ');found=true;}}
    if(found)groups.push(entry.terms);
  }
  for(const word of remaining.trim().split(/\s+/))if(word&&!stopwords.has(word))groups.push([word]);
  return groups;
}
function planSearch(topic, manual) {
  const groups=validateGroups(typeof manual==='string'&&manual.trim()?manual.split(/\r?\n/).filter(line=>line.trim()).map(line=>line.split(/[|;]/)):Array.isArray(manual)&&manual.length?manual:automaticGroups(topic));
  const phrase=term=>'"'+clean(term).replace(/["\[\]()]/g,' ').trim()+'"[Title/Abstract]';
  const arxivTerm=term=>'"'+clean(term).replace(/["\\]/g,' ').trim()+'"';
  return {groups,mode:'all-concepts',understoodAs:groups.map(g=>g[0]).join(' E '),pubmedQuery:groups.map(g=>'('+g.map(phrase).join(' OR ')+')').join(' AND '),arxivQuery:groups.map(g=>'('+g.map(t=>'(ti:'+arxivTerm(t)+' OR abs:'+arxivTerm(t)+')').join(' OR ')+')').join(' AND '),crossrefQuery:groups.map(g=>g[0]).join(' '),manual:!!manual,description:'Todos os conceitos devem aparecer no título, resumo ou palavras-chave; sinônimos da mesma linha são alternativas.'};
}
function assess(work, plan) {
  const fields=[['título',clean(Array.isArray(work.title)?work.title.join(' '):work.title)],['resumo',clean(work.abstract)],['palavras-chave',(work.subject||[]).map(clean).join(' ')]];
  const evidence=plan.groups.map(group=>{
    for(const [field,text] of fields){const normalized=' '+normalize(text)+' ';for(const term of group){if(normalized.includes(' '+normalize(term)+' '))return {concept:group[0],term,field};}}
    return {concept:group[0],missing:true};
  });
  return {accepted:evidence.every(e=>!e.missing),evidence,score:evidence.reduce((n,e)=>n+(e.field==='título'?3:e.field==='resumo'?2:e.field?1:0),0)};
}
module.exports={clean,normalize,planSearch,assess};
