const crypto = require('crypto');
function crc32(buffer) {
  let crc=0xffffffff;
  for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function zip(files) {
  const chunks=[],central=[];let offset=0;
  for(const [filename,text] of files){
    const name=Buffer.from(filename),body=Buffer.from(text),crc=crc32(body);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(body.length,18);header.writeUInt32LE(body.length,22);header.writeUInt16LE(name.length,26);
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(33,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(body.length,20);entry.writeUInt32LE(body.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);
    chunks.push(header,name,body);central.push(entry,name);offset+=header.length+name.length+body.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,directory,end]);
}
function exportReview(review) {
  const {nodes,links,query}=review.result;
  const names=new Map(nodes.map(n=>[n.id,'artigo-'+crypto.createHash('sha256').update(n.id).digest('hex').slice(0,16)]));
  const label=n=>String(n.title).replace(/[\[\]|\r\n]/g,' ').slice(0,180);
  const wiki=n=>'[['+names.get(n.id)+'|'+label(n)+']]';
  const files=nodes.map(n=>{
    const citations=links.filter(l=>l.source===n.id).map(l=>nodes.find(x=>x.id===l.target));
    const citedBy=links.filter(l=>l.target===n.id).map(l=>nodes.find(x=>x.id===l.source));
    return [names.get(n.id)+'.md',`---\ndoi: ${JSON.stringify(n.doi)}\nano: ${n.year || 'null'}\nreferencia_externa: ${n.external}\nfonte: ${JSON.stringify(n.source||'Crossref')}\n---\n\n# ${n.title}\n\n${n.authors || ''}\n\n${n.journal || ''} · ${n.date || 'Data não disponível'}\n\n${n.doi?'DOI: <https://doi.org/'+encodeURI(n.doi)+'>':'PMID: '+n.pmid+' <https://pubmed.ncbi.nlm.nih.gov/'+n.pmid+'/>'}\n\n${n.external ? 'Referência citada: metadados parciais, pode estar fora do período selecionado.\n\n' : ''}${n.abstract || ''}\n\n## Cita\n\n${citations.map(x=>'- '+wiki(x)).join('\n') || 'Nenhuma referência com DOI disponível neste mapa.'}\n\n## Citado por neste mapa\n\n${citedBy.map(x=>'- '+wiki(x)).join('\n') || 'Nenhuma conexão disponível neste mapa.'}\n\n## Minhas notas\n\n`];
  });
  files.unshift(['Revisao.md',`# ${query.topic}\n\nPeríodo: ${query.startYear}–${query.endYear}. Consulta: ${review.result.retrievedAt}.\n\nFontes: ${review.result.source||'Crossref'}. Seleção de candidatos, limitada a ${query.limit} artigos. A compatibilidade de termos não substitui a leitura crítica. Conexões representam apenas referências com DOI informadas pelas editoras (uma geração). Não é uma revisão exaustiva. Referências externas podem ser anteriores ou posteriores ao período.\n\n## Estratégia\n\n${(review.result.plan?.groups||[]).map(g=>'- '+g.join(' OU ')).join('\n')}\n\nConceitos combinados com E.\n\n## Artigos\n\n${nodes.filter(n=>!n.external).map(n=>'- '+wiki(n)).join('\n')}\n\nExtraia todos os arquivos em uma pasta e abra-a como um cofre no Obsidian, ou copie as notas para seu cofre existente. Os links entre notas permitem usar a visão de grafo.\n`]);
  return zip(files);
}
module.exports={crc32,zip,exportReview};
