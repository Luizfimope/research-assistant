(() => {
  const $ = id => document.getElementById(id);
  let current=null, selected=null, pollTimer=null, pollVersion=0, strategyTopic="", strategyManual=false, strategyVersion=0;
  const canvas=$('reference-graph'), ctx=canvas.getContext('2d');
  let points=[], visibleLinks=[], width=800, height=530, camera={x:0,y:0,scale:1}, drag=null;
  const pointMap=new Map();
  const message=text=>$('review-message').textContent=text;
  async function suggestConcepts(force=false){
    if(strategyManual&&!force)return;
    const topic=$('review-topic').value.trim();if(topic.length<2)return;
    const version=++strategyVersion;
    try{const plan=await api('/reviews/plan?topic='+encodeURIComponent(topic));if(version!==strategyVersion)return;$('review-concepts').value=plan.groups.map(g=>g.join(' | ')).join('\n');strategyTopic=topic;strategyManual=false;}
    catch(error){message(error.message);throw error;}
  }
  $('review-concepts').oninput=()=>{strategyManual=true;strategyVersion++;};
  $('review-topic').addEventListener('change',()=>suggestConcepts().catch(()=>{}));
  $('review-suggest').onclick=()=>suggestConcepts(true).catch(()=>{});
  $('review-to').value=new Date().getFullYear();
  $('review-to').max=$('review-from').max=new Date().getFullYear();
  function tab(review){
    $('review-view').hidden=!review; $('daily-view').hidden=review;
    $('tab-review').setAttribute('aria-selected',String(review));$('tab-daily').setAttribute('aria-selected',String(!review));
    if(review){resize();loadHistory().catch(error=>message(error.message));}
  }
  $('tab-review').onclick=()=>tab(true);$('tab-daily').onclick=()=>tab(false);
  api('/topics').then(topics=>{
    for(const topic of topics.filter(t=>t.active)){const option=document.createElement('option');option.value=topic.name;$('review-topics').append(option);}
  }).catch(()=>{});
  async function loadHistory(){
    const reviews=await api('/reviews');const dropdown=$('review-history');
    dropdown.replaceChildren(new Option('Selecione uma revisão',''));
    for(const r of reviews)dropdown.add(new Option(`${r.topic} · ${r.start_year}–${r.end_year} · ${r.status==='complete'?'concluída':r.status==='running'?'em andamento':'interrompida'} · #${r.id}${r.status==='complete'?(r.algorithm_version>=2?' · conceitos obrigatórios':' · busca antiga'):''}`,r.id));
    if(current)dropdown.value=current.id;
    if(!current){const active=reviews.find(r=>r.status==='running');if(active)openReview(active.id);}
  }
  function setBusy(value){$('review-submit').disabled=value;$('review-submit').textContent=value?'Buscando artigos…':'Construir revisão';}
  $('review-form').onsubmit=async event=>{
    event.preventDefault();setBusy(true);message('Iniciando busca…');
    try{
      if(!strategyManual&&strategyTopic!==$('review-topic').value.trim())await suggestConcepts(true);
      const {id}=await api('/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:$('review-topic').value,startYear:$('review-from').value,endYear:$('review-to').value,limit:$('review-limit').value,concepts:$('review-concepts').value.trim()||undefined})});
      await openReview(id);await loadHistory();
    }catch(error){message(error.message);setBusy(false);}
  };
  $('review-history').onchange=event=>{if(event.target.value)openReview(event.target.value).catch(error=>message(error.message));};
  async function openReview(id){
    clearTimeout(pollTimer);const version=++pollVersion;
    const r=await api('/reviews/'+id);if(version!==pollVersion)return;
    current=r;
    if(r.result){$('review-concepts').value=(r.result.plan?.groups||[]).map(g=>g.join(' | ')).join('\n');strategyTopic=r.topic;strategyManual=false;}
    $('review-topic').value=r.topic;$('review-from').value=r.start_year;$('review-to').value=r.end_year;$('review-limit').value=r.result_limit;
    setBusy(r.status==='running');
    $('review-export').disabled=$('review-markdown').disabled=!r.result;
    $('review-results').hidden=!r.result;
    if(r.status==='running'){
      message(r.progress || 'Buscando…');
      pollTimer=setTimeout(()=>openReview(id).catch(error=>{message(error.message);setBusy(false);}),1500);
    }else if(r.status==='failed'){message(r.error || 'Busca interrompida. Tente novamente.');loadHistory().catch(()=>{});}
    else{message(`Revisão salva: ${r.topic} · ${r.start_year}–${r.end_year}. ${r.result.algorithmVersion>=2?'Os candidatos contêm todos os conceitos nos metadados consultados; a pertinência ainda exige leitura. '+(r.result.limited?'A consulta tem limites; não representa toda a literatura.':''):'Revisão antiga: foi gerada com a busca ampla. Refaça a busca para aplicar os filtros de conceitos.'} ${(r.result.warnings||[]).join(' ')}`);render(r.result);loadHistory().catch(()=>{});}
  }
  function render(result){
    selected=null;$('review-filter').value='';$('review-match').value=result.algorithmVersion>=2?'title':'metadata';
    const s=result.stats;
    $('review-stats').innerHTML=`<div><strong>${s.articles}</strong><span>artigos no período</span></div><div><strong>${s.connections}</strong><span>citações com DOI</span></div><div><strong>${s.externalReferences}</strong><span>referências externas</span></div><div><strong>${s.withoutReferences}</strong><span>artigos sem referências disponíveis</span></div>`;
    const info=document.createElement('p');info.className='review-coverage';info.textContent=result.algorithmVersion>=2?`${s.articles} candidatos compatíveis após avaliar ${result.screening.checked} candidatos em ${result.source}. ${result.screening.rejectedCrossref} candidatos da Crossref excluídos por não confirmar todos os conceitos. ${s.unlinkedReferences} referências sem DOI não puderam ser ligadas.${s.omittedLinks?' '+s.omittedLinks+' conexões omitidas pelo limite visual.':''} As referências externas são contexto e podem estar fora de ${result.query.startYear}–${result.query.endYear}.`:`Revisão antiga sem filtro por todos os conceitos: refaça a busca. ${Number(result.totalMatches).toLocaleString('pt-BR')} correspondências amplas na base; isso não é o número de artigos relevantes.`; $('review-stats').append(info);
    $('review-detail').innerHTML='<h2>Explore as conexões</h2><p>Selecione um ponto ou artigo para ver o que ele cita e quem o cita nesta revisão. Arraste pontos ou o fundo; use a roda do mouse para aproximar.</p>';
    layout(result);renderList();requestAnimationFrame(()=>{resize();fit();});
  }
  function hash(text){let n=0;for(const c of text)n=(n*31+c.charCodeAt(0))>>>0;return n;}
  function layout(result){
    pointMap.clear();
    const seeds=result.nodes.filter(n=>!n.external).sort((a,b)=>(a.year||0)-(b.year||0));
    seeds.forEach((node,i)=>{const angle=i*2.399963,r=Math.sqrt(i+1)*27;pointMap.set(node.id,{...node,x:Math.cos(angle)*r,y:Math.sin(angle)*r});});
    const parents=new Map();for(const link of result.links){if(!parents.has(link.target))parents.set(link.target,[]);parents.get(link.target).push(link.source);}
    for(const node of result.nodes.filter(n=>n.external)){
      const anchors=(parents.get(node.id)||[]).map(id=>pointMap.get(id)).filter(Boolean);
      const angle=(hash(node.id)%6283)/1000, radius=60+(hash(node.id)%120);
      const x=anchors.length?anchors.reduce((sum,p)=>sum+p.x,0)/anchors.length:0,y=anchors.length?anchors.reduce((sum,p)=>sum+p.y,0)/anchors.length:0;
      pointMap.set(node.id,{...node,x:x+Math.cos(angle)*radius,y:y+Math.sin(angle)*radius});
    }
    updateVisible();
  }
  function updateVisible(){
    if(!current?.result)return;
    const titleOnly=$('review-match').value==='title';
    const allowed=new Set(current.result.nodes.filter(n=>!n.external&&(!titleOnly||n.relevance?.evidence.every(e=>e.field==='título')||n.id===selected)).map(n=>n.id));
    const graphLinks=current.result.links.filter(l=>allowed.has(l.source));
    const degree=new Map();for(const l of graphLinks)degree.set(l.target,(degree.get(l.target)||0)+1);
    const neighbors=new Set(graphLinks.filter(l=>l.source===selected||l.target===selected).flatMap(l=>[l.source,l.target]));
    points=[...pointMap.values()].filter(n=>!n.external?allowed.has(n.id):(degree.get(n.id)||0)>0&&($('graph-leaves').checked||(degree.get(n.id)||0)>1||neighbors.has(n.id)||n.id===selected));
    const ids=new Set(points.map(p=>p.id));visibleLinks=graphLinks.filter(l=>ids.has(l.source)&&ids.has(l.target));
    $('graph-count').textContent=`${points.length} de ${current.result.nodes.length} pontos visíveis · ${visibleLinks.length} conexões. Referências isoladas do mapa podem ser exibidas pela opção acima.`;draw();
  }
  $('graph-leaves').onchange=()=>{updateVisible();fit();};
  function resize(){
    if($('review-view').hidden)return;
    width=canvas.clientWidth || 800;height=canvas.clientHeight || 530;
    const dpr=window.devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();
  }
  new ResizeObserver(resize).observe(canvas);
  function fit(){
    if(!points.length){camera={x:0,y:0,scale:1};draw();return;}
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs)-45,maxX=Math.max(...xs)+45,minY=Math.min(...ys)-45,maxY=Math.max(...ys)+45;
    camera={x:-(minX+maxX)/2,y:-(minY+maxY)/2,scale:Math.min(width/(maxX-minX),height/(maxY-minY),2)};draw();
  }
  function screen(p){return {x:(p.x+camera.x)*camera.scale+width/2,y:(p.y+camera.y)*camera.scale+height/2};}
  function draw(){
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#151b23';ctx.fillRect(0,0,width,height);
    const related=new Set(selected?[selected]:[]);
    if(selected)for(const link of visibleLinks)if(link.source===selected||link.target===selected){related.add(link.source);related.add(link.target);}
    for(const link of visibleLinks){
      const a=screen(pointMap.get(link.source)),b=screen(pointMap.get(link.target));
      const active=selected&&(link.source===selected||link.target===selected);
      ctx.strokeStyle=active?'#d8b977':selected?'#27313b':'#344752';ctx.lineWidth=active?1.8:0.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      if(active){const angle=Math.atan2(b.y-a.y,b.x-a.x),x=b.x-Math.cos(angle)*9,y=b.y-Math.sin(angle)*9;ctx.fillStyle='#d8b977';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(angle-.45)*8,y-Math.sin(angle-.45)*8);ctx.lineTo(x-Math.cos(angle+.45)*8,y-Math.sin(angle+.45)*8);ctx.fill();}
    }
    for(const point of points){
      const p=screen(point),active=point.id===selected,muted=selected&&!related.has(point.id),radius=active?8:point.external?3.5:5.5;
      ctx.globalAlpha=muted ? 0.24 : 1;ctx.fillStyle=active?'#f0cb80':point.external?'#8191a9':'#81c6b2';ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();
      if(active || (camera.scale>1.15&&!point.external&&points.length<120)){
        ctx.font=(active?'600 ':'')+'11px Inter, sans-serif';ctx.fillStyle='#e4eaf2';ctx.fillText(point.title.slice(0,45)+(point.title.length>45?'…':''),p.x+11,p.y+4);
      }
    }ctx.globalAlpha=1;
    if(!points.length){ctx.fillStyle='#a4b0bd';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('Nenhum artigo disponível com este filtro.',width/2,height/2);ctx.textAlign='left';}
  }
  function mouse(event){const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
  function hit(p){let nearest=null,distance=14;for(const node of points){const s=screen(node),d=Math.hypot(s.x-p.x,s.y-p.y);if(d<distance){nearest=node;distance=d;}}return nearest;}
  canvas.onpointerdown=event=>{const p=mouse(event);drag={start:p,last:p,node:hit(p),moved:false};canvas.setPointerCapture(event.pointerId);};
  canvas.onpointermove=event=>{
    const p=mouse(event);if(!drag){const node=hit(p);canvas.style.cursor=node?'pointer':'grab';canvas.title=node?node.title:'';return;}
    const dx=(p.x-drag.last.x)/camera.scale,dy=(p.y-drag.last.y)/camera.scale;
    if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>4)drag.moved=true;
    if(drag.node){drag.node.x+=dx;drag.node.y+=dy;}else{camera.x+=dx;camera.y+=dy;}drag.last=p;draw();
  };
  canvas.onpointerup=event=>{if(drag?.node&&!drag.moved)select(drag.node.id);drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
  canvas.onpointercancel=()=>drag=null;
  function zoom(factor,p={x:width/2,y:height/2}){
    const old=camera.scale,next=Math.max(.12,Math.min(6,old*factor));camera.x+=(p.x-width/2)*(1/next-1/old);camera.y+=(p.y-height/2)*(1/next-1/old);camera.scale=next;draw();
  }
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY<0?1.15:1/1.15,mouse(event));},{passive:false});
  $('graph-minus').onclick=()=>zoom(1/1.3);$('graph-plus').onclick=()=>zoom(1.3);$('graph-fit').onclick=fit;
  canvas.onkeydown=event=>{if(event.key==='+'||event.key==='='){zoom(1.3);event.preventDefault();}if(event.key==='-'){zoom(1/1.3);event.preventDefault();}if(event.key==='0')fit();};
  function select(id){
    selected=id;updateVisible();fit();const node=pointMap.get(id);if(!node)return;
    const links=current.result.links;
    const citing=links.filter(l=>l.source===id).map(l=>pointMap.get(l.target));
    const cited=links.filter(l=>l.target===id).map(l=>pointMap.get(l.source));
    $('review-detail').innerHTML=`<p class="review-kicker">${node.external?'Referência citada · metadados parciais':'Artigo encontrado · '+esc(node.year)}</p><h2>${esc(node.title)}</h2><p>${esc(node.authors)}</p><p>${esc(node.journal)}${node.date?' · '+esc(node.date):''}</p><a href="${url(node.url)}" target="_blank" rel="noopener">Abrir publicação ↗</a>${node.abstract?'<p class="detail-abstract">'+esc(node.abstract)+'</p>':''}${node.relevance?'<p class="relevance-evidence">Incluído por: '+node.relevance.evidence.map(e=>esc(e.term)+' ('+esc(e.field)+')').join(' + ')+'</p>':''}<h3>Cita (${citing.length})</h3><div id="detail-cites"></div><h3>Citado por neste mapa (${cited.length})</h3><div id="detail-cited"></div><p class="review-scope">As ligações são as referências com DOI fornecidas à Crossref. Este mapa não contém todas as citações existentes.</p>`;
    for(const [container,nodes] of [[$('detail-cites'),citing],[$('detail-cited'),cited]]){
      if(!nodes.length){const p=document.createElement('p');p.textContent='Nenhuma conexão disponível.';container.append(p);}
      for(const n of nodes){const button=document.createElement('button');button.type='button';button.className='connection-link';button.textContent=n.title;button.onclick=()=>select(n.id);container.append(button);}
    }
    for(const button of $('review-article-list').querySelectorAll('button[data-doi]'))button.setAttribute('aria-pressed',String(button.dataset.doi===id));
  }
  function renderList(){
    const filter=$('review-filter').value.toLowerCase();const nodes=current.result.nodes.filter(n=>!n.external&&($('review-match').value!=='title'||n.relevance?.evidence.every(e=>e.field==='título'))&&[n.title,n.authors,n.doi,n.journal].join(' ').toLowerCase().includes(filter));
    const list=$('review-article-list');list.replaceChildren();$('review-list-count').textContent=nodes.length+' de '+current.result.stats.articles+' candidatos visíveis. '+($('review-match').value==='title'?'Exigindo todos os conceitos no título. Amplie o filtro para avaliar também os resumos.':'Incluindo correspondências em título, resumo ou palavras-chave. Leia o contexto antes de incluir na revisão.')+' As exportações incluem a revisão completa, independentemente deste filtro.';
    for(const n of nodes){const row=document.createElement('article');row.className='review-article';row.innerHTML=`<p class="review-kicker">${esc(n.year)} · ${esc(n.journal)}</p><h3>${esc(n.title)}</h3><p>${esc(n.authors)}</p><p class="review-doi">${esc(n.doi||('PMID: '+n.pmid))}</p>${n.relevance?'<p class="relevance-evidence">'+(n.relevance.evidence.every(e=>e.field==='título')?'Todos os conceitos no título. ':'Conferir contexto no resumo. ')+'Encontrado por: '+n.relevance.evidence.map(e=>esc(e.term)+' ('+esc(e.field)+')').join(' + ')+'</p>':''}`;
      const button=document.createElement('button');button.type='button';button.textContent='Explorar conexões';button.dataset.doi=n.id;button.setAttribute('aria-pressed',String(n.id===selected));button.onclick=()=>{select(n.id);$('review-detail').scrollIntoView({behavior:'smooth',block:'nearest'});};row.append(button);
      const link=document.createElement('a');link.href=n.url;link.textContent='Abrir artigo ↗';link.target='_blank';link.rel='noopener';row.append(link);list.append(row);}
    if(!nodes.length){const p=document.createElement('p');p.textContent='Nenhum artigo corresponde a este filtro.';list.append(p);}
  }
  $('review-match').onchange=()=>{if(current?.result){selected=null;updateVisible();fit();renderList();}};
  $('review-filter').oninput=()=>{if(current?.result)renderList();};
  function download(blob,name){const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);}
  $('review-export').onclick=()=>{if(current?.result)download(new Blob([JSON.stringify(current.result,null,2)],{type:'application/json'}),'revisao-'+current.id+'.json');};
  $('review-markdown').onclick=async()=>{if(!current?.result)return;try{const response=await fetch('/api/reviews/'+current.id+'/obsidian');if(!response.ok)throw new Error('Não foi possível exportar a revisão.');download(await response.blob(),'revisao-'+current.id+'-obsidian.zip');}catch(error){message(error.message);}};
})();
