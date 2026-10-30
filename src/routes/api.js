const express = require('express');
const db = require('../db');
const zotero = require('../zotero');
const { runDailyJob, runDailySearch, buildNewsletterHtml } = require('../scheduler');

const router = express.Router();

// ---------- TÓPICOS ----------
router.get('/topics', (req, res) => {
  const topics = db.prepare('SELECT * FROM topics ORDER BY created_at DESC').all();
  res.json(topics.map(topic=>{try{return {...topic,understoodAs:require('../relevance').planSearch(topic.name).understoodAs};}catch{return topic;}}));
});

router.post('/topics', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do tópico é obrigatório.' });
  try {
    const info = db.prepare('INSERT INTO topics (name) VALUES (?)').run(name.trim());
    res.json({ id: info.lastInsertRowid, name: name.trim() });
  } catch (e) {
    res.status(400).json({ error: 'Esse tópico já existe.' });
  }
});

router.delete('/topics/:id', (req, res) => {
  db.prepare('UPDATE topics SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Busca manual imediata, sem esperar o agendamento diário
router.post('/topics/search-now', async (req, res) => {
  try {
    const {summary} = await runDailyJob();
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- REVISTAS ----------
router.get('/journals', (req, res) => {
  const journals = db.prepare('SELECT * FROM journals ORDER BY created_at DESC').all();
  res.json(journals);
});

router.post('/journals', (req, res) => {
  const { name, issn } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome da revista é obrigatório.' });
  try {
    const info = db.prepare('INSERT INTO journals (name, issn) VALUES (?, ?)')
      .run(name.trim(), issn?.trim() || null);
    res.json({ id: info.lastInsertRowid, name: name.trim(), issn: issn?.trim() || null });
  } catch (e) {
    res.status(400).json({ error: 'Essa revista já está na lista.' });
  }
});

router.delete('/journals/:id', (req, res) => {
  db.prepare('UPDATE journals SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- ARTIGOS ----------
router.get('/articles', (req, res) => {
  const relevanceFilter=req.query.includeUnconfirmed==='1'?'':"WHERE articles.relevance_status IN ('matched','journal')";
  const rows = db.prepare(`
    SELECT articles.*,
           COALESCE(topics.name, journals.name || ' (revista)') as topic_name,
           CASE WHEN journals.id IS NOT NULL THEN 'journal' ELSE 'topic' END as group_type
    FROM articles
    LEFT JOIN topics ON topics.id = articles.topic_id
    LEFT JOIN journals ON journals.id = articles.journal_id
    ${relevanceFilter}
    ORDER BY found_at DESC LIMIT 200
  `).all();
  res.json(rows.map(row=>{let relevance=null;try{relevance=JSON.parse(row.relevance_json||'null');}catch{}return {...row,relevance};}));
});

// Marca um artigo como lido -> alimenta o "heatmap" tipo GitHub
router.post('/articles/:id/read', (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Artigo não encontrado.' });

  if (article.read_at) return res.json({ok:true});
  const today = require('../core').today();
  db.prepare('UPDATE articles SET read_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
  db.prepare(`
    INSERT INTO reading_log (date, count) VALUES (?, 1)
    ON CONFLICT(date) DO UPDATE SET count = count + 1
  `).run(today);

  res.json({ ok: true });
});

// ---------- NEWSLETTER / HOME ----------
router.get('/newsletter/latest', (req, res) => {
  const row = db.prepare('SELECT * FROM newsletters ORDER BY date DESC LIMIT 1').get();
  res.json(row || null);
});

router.get('/newsletter/history', (req, res) => {
  const rows = db.prepare('SELECT id, date, article_count, sent, status, last_error, publication_date FROM newsletters ORDER BY date DESC LIMIT 30').all();
  res.json(rows);
});

// Roda o job completo (busca + mendeley + email) sob demanda, útil pra testar
router.post('/newsletter/run-now', async (req, res) => {
  try {
    const result = await runDailyJob();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- HEATMAP (dias em que li artigos) ----------
router.get('/reading-log', (req, res) => {
  const rows = db.prepare('SELECT date, count FROM reading_log ORDER BY date ASC').all();
  res.json(rows);
});

// ---------- MENDELEY ----------
router.get('/zotero/status', (req, res) => {
  res.json({ connected: zotero.isConnected() });
});

router.get('/status',(req,res)=>res.json({date:require('../core').today(),publicationDate:require('../core').previousDay(),timezone:require('../core').timezone(),schedule:process.env.CRON_SCHEDULE||'0 7 * * *',running:require('../scheduler').isRunning(),zoteroConfigured:zotero.isConnected(),runs:db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 10').all()}));
router.post('/email/verify',async(req,res)=>{try{await require('../mailer').verify();res.json({ok:true});}catch(e){res.status(400).json({error:e.code||'Verifique SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e destinatário.'});}});
const literature = require('../literature');
router.get('/reviews',(req,res)=>res.json(literature.listReviews()));
router.get('/reviews/plan',(req,res)=>{
  try{if(typeof req.query.topic!=='string'||req.query.topic.length>300)throw new Error('Informe um tema com até 300 caracteres.');res.json(require('../relevance').planSearch(req.query.topic));}
  catch(error){res.status(400).json({error:error.message});}
});
router.post('/reviews',(req,res)=>{
  try {const id=literature.createReview(req.body);res.status(202).json({id});}
  catch(error){res.status(400).json({error:error.message});}
});
router.get('/reviews/:id',(req,res)=>{
  if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Revisão inválida.'});
  const review=literature.getReview(Number(req.params.id));
  if(!review)return res.status(404).json({error:'Revisão não encontrada.'});
  res.json(review);
});
router.get('/reviews/:id/obsidian',(req,res)=>{
  if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Revisão inválida.'});
  const review=literature.getReview(Number(req.params.id));
  if(!review?.result)return res.status(404).json({error:'Revisão concluída não encontrada.'});
  res.set({'Content-Type':'application/zip','Content-Disposition':`attachment; filename="revisao-${review.id}-obsidian.zip"`});
  res.send(require('../obsidian').exportReview(review));
});
module.exports = router;
