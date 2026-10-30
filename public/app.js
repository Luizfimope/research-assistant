const api = async (path, opts) => { const r=await fetch('/api'+path, opts); const data=await r.json(); if(!r.ok) throw new Error(data.error||'Não foi possível concluir a operação'); return data; };
const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=value=>/^https?:\/\//i.test(value||'')?esc(value):'#';

document.getElementById('today-date').textContent = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
});

// ---------- TÓPICOS ----------
async function loadTopics() {
  const topics = await api('/topics');
  const list = document.getElementById('topic-list');
  list.innerHTML = '';
  topics.filter(t => t.active).forEach(t => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(t.name)}${t.understoodAs&&t.understoodAs.toLowerCase()!==t.name.toLowerCase()?'<small class="topic-understood">Busca: '+esc(t.understoodAs)+'</small>':''}</span>`;
    const del = document.createElement('button');
    del.textContent = '×';
    del.title = 'Remover tema';
    del.onclick = async () => { await api(`/topics/${t.id}`, { method: 'DELETE' }); loadTopics(); };
    li.appendChild(del);
    list.appendChild(li);
  });
}

document.getElementById('topic-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('topic-input');
  if (!input.value.trim()) return;
  const res = await api('/topics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.value.trim() })
  });
  if (!res.error) { input.value = ''; loadTopics(); }
  else alert(res.error);
});

// ---------- REVISTAS ----------
async function loadJournals() {
  const journals = await api('/journals');
  const list = document.getElementById('journal-list');
  list.innerHTML = '';
  journals.filter(j => j.active).forEach(j => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(j.name)}${j.issn ? ` <span style="opacity:.6">(${esc(j.issn)})</span>` : ''}</span>`;
    const del = document.createElement('button');
    del.textContent = '×';
    del.title = 'Remover revista';
    del.onclick = async () => { await api(`/journals/${j.id}`, { method: 'DELETE' }); loadJournals(); };
    li.appendChild(del);
    list.appendChild(li);
  });
}

document.getElementById('journal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('journal-input');
  if (!input.value.trim()) return;
  const res = await api('/journals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.value.trim() })
  });
  if (!res.error) { input.value = ''; loadJournals(); }
  else alert(res.error);
});

// ---------- MENDELEY ----------
async function loadZoteroStatus() {
  const { connected } = await api('/zotero/status');
  const el = document.getElementById('zotero-status');
  const btn = document.getElementById('zotero-connect');
  if (connected) {
    el.textContent = 'Biblioteca conectada';
    el.className = 'zotero-status connected';
    btn.style.display = 'none';
  } else {
    el.textContent = 'Não conectado';
    el.className = 'zotero-status disconnected';
    btn.style.display = 'inline-block';
  }
}

// ---------- HEATMAP (estilo GitHub) ----------
async function loadHeatmap() {
  const log = await api('/reading-log');
  const counts = Object.fromEntries(log.map(r => [r.date, r.count]));

  const today = new Date();
  const days = [];
  for (let i = 363; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  // Alinha a primeira coluna começando no domingo
  const firstDay = new Date(days[0]);
  const pad = firstDay.getDay();
  const padded = Array(pad).fill(null).concat(days);

  const heatmap = document.getElementById('heatmap');
  heatmap.innerHTML = '';
  padded.forEach(date => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    if (date) {
      const c = counts[date] || 0;
      cell.style.background =
        c === 0 ? 'var(--heat-0)' :
        c === 1 ? 'var(--heat-1)' :
        c === 2 ? 'var(--heat-2)' :
        c <= 4 ? 'var(--heat-3)' : 'var(--heat-4)';
      cell.title = `${date}: ${c} artigo${c === 1 ? '' : 's'} lido${c === 1 ? '' : 's'}`;
    } else {
      cell.style.background = 'transparent';
    }
    heatmap.appendChild(cell);
  });

  // Calcula sequência atual de dias lidos
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (counts[days[i]]) streak++; else break;
  }
  document.getElementById('streak-text').textContent =
    streak > 0 ? `${streak} dia${streak > 1 ? 's' : ''} seguidos lendo` : 'Nenhuma sequência ativa ainda';
}

// ---------- NEWSLETTER / ARTIGOS ----------
async function markRead(id, btn) {
  await api(`/articles/${id}/read`, { method: 'POST' });
  btn.textContent = 'Lido ✓';
  btn.classList.add('done');
  btn.disabled = true;
  loadHeatmap();
}

async function loadNewsletter() {
  const [articles, latest] = await Promise.all([api('/articles'+(document.getElementById('show-unconfirmed').checked?'?includeUnconfirmed=1':'')), api('/newsletter/latest')]);
  const container = document.getElementById('newsletter-body');

  const {publicationDate:today} = await api('/status');
  const todays = articles.filter(a => a.selected_date === today);
  document.getElementById('daily-filter-note').textContent=document.getElementById('show-unconfirmed').checked?'Histórico ampliado: itens sem confirmação são exibidos com aviso e não entram em novos envios.':'Seleção filtrada pelo tema em título, resumo ou palavras-chave. Resultados antigos sem confirmação ficam ocultos.';

  container.innerHTML = '';

  if (todays.length === 0) {
    container.innerHTML = `<p class="empty-state">Nenhum artigo novo encontrado com publicação no dia anterior. ${latest ? '' : 'Adicione um tema e clique em "Buscar artigos agora" para começar.'}</p>`;
    return;
  }

  const byTopic = {};
  todays.forEach(a => { (byTopic[a.topic_name] ??= []).push(a); });

  Object.entries(byTopic).forEach(([topicName, list]) => {
    const group = document.createElement('div');
    group.className = 'topic-group';
    group.innerHTML = `<h2>${esc(topicName)} (${list.length})</h2>`;

    list.forEach(a => {
      const row = document.createElement('div');
      row.className = 'article-row';
      row.innerHTML = `
        <a class="article-title" href="${url(a.url)}" target="_blank">${esc(a.title)}</a>
        <div class="article-meta">${esc(a.authors || '')} · ${esc(a.source)}</div>
        ${a.abstract ? `<div class="article-abstract">${esc(a.abstract.slice(0, 320))}${a.abstract.length > 320 ? '…' : ''}</div>` : ''}
        ${a.relevance_status==='not_confirmed'?'<p class="daily-unconfirmed">Tema não confirmado nos metadados disponíveis. Preservado apenas para conferência do histórico.</p>':a.relevance?.evidence?'<p class="daily-evidence">Encontrado por: '+a.relevance.evidence.filter(e=>!e.missing).map(e=>esc(e.term)+' ('+esc(e.field)+')').join(' + ')+'</p>':''}
      `;
      const btn = document.createElement('button');
      btn.className = 'mark-read' + (a.read_at ? ' done' : '');
      btn.textContent = a.read_at ? 'Lido ✓' : 'Marcar como lido';
      if (a.read_at) btn.disabled = true;
      btn.onclick = () => markRead(a.id, btn);
      row.appendChild(btn);
      group.appendChild(row);
    });

    container.appendChild(group);
  });
}

async function loadHistory() {
  const history = await api('/newsletter/history');
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  history.forEach(h => {
    const li = document.createElement('li');
    const date = new Date(h.date+'T12:00:00').toLocaleDateString('pt-BR');
    li.innerHTML = `<span>${date}${h.publication_date ? ' · publicações de '+esc(h.publication_date) : ''}</span><span>${h.article_count} artigo${h.article_count === 1 ? '' : 's'} · ${esc(h.sent ? 'aceita pelo servidor' : h.status || 'pendente')}${h.last_error ? ' — '+esc(h.last_error) : ''}</span>`;
    list.appendChild(li);
  });
}

// ---------- AÇÕES ----------
document.getElementById('run-now').addEventListener('click', async (e) => {
  const btn = e.target;
  btn.disabled = true;
  btn.textContent = 'Buscando…';
  try {
    const result=await api('/newsletter/run-now', { method: 'POST' });
    document.getElementById('action-message').textContent=result.errors?.length?result.errors.join(' · '):'Busca concluída. Consulte o estado da newsletter abaixo.';
    await Promise.all([loadNewsletter(), loadHistory()]);
  } catch(error) { document.getElementById('action-message').textContent=error.message; } finally {
    loadStatus();
    btn.disabled = false;
    btn.textContent = 'Buscar artigos agora';
  }
});

// ---------- INICIALIZAÇÃO ----------
loadTopics();
loadJournals();
loadZoteroStatus();
loadHeatmap();
loadNewsletter();
loadHistory();

async function loadStatus(){const s=await api('/status');document.getElementById('operation-status').textContent='Horário: '+s.schedule+' · '+s.timezone+' · '+(s.running?'Busca em andamento':s.runs[0]?'Última execução: '+s.runs[0].status:'Nenhuma execução')+' · Edição com artigos de '+s.publicationDate+'. Envio às 07h ou ao entrar no Windows, sem repetir uma edição já enviada.';}
document.getElementById('verify-email').onclick=async()=>{const el=document.getElementById('action-message');el.textContent='Verificando conexão…';try{await api('/email/verify',{method:'POST'});el.textContent='Conexão e autenticação SMTP verificadas. Nenhum e-mail de teste foi enviado.';}catch(e){el.textContent=e.message;}};
window.addEventListener('unhandledrejection',e=>{document.getElementById('action-message').textContent=e.reason?.message||'Falha de conexão';});
loadStatus();setInterval(()=>loadStatus().catch(()=>{}),30000);

document.getElementById('show-unconfirmed').onchange=()=>loadNewsletter().catch(error=>{document.getElementById('action-message').textContent=error.message;});
