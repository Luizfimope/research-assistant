const {planSearch,assess}=require('./relevance');
const VERSION=1;
function screen(topic,article) {
  const plan=planSearch(topic);
  const match=assess({title:[article.title],abstract:article.abstract,subject:article.keywords||[]},plan);
  return {...match,version:VERSION,understoodAs:plan.understoodAs};
}
function refreshHistory(db) {
  const rows=db.prepare('SELECT a.*,t.name topic_name FROM articles a LEFT JOIN topics t ON t.id=a.topic_id').all();
  const report={matched:0,notConfirmed:0,journals:0};
  const update=db.prepare('UPDATE articles SET relevance_status=?,relevance_json=? WHERE id=?');
  db.exec('BEGIN IMMEDIATE');
  try {
    for(const article of rows){
      if(article.journal_id){update.run('journal',JSON.stringify({version:VERSION,accepted:true,scope:'journal'}),article.id);report.journals++;continue;}
      let evaluation;
      try{evaluation=screen(article.topic_name,{...article,keywords:JSON.parse(article.keywords_json||'[]')});}
      catch{evaluation={version:VERSION,accepted:false,evidence:[],reason:'Tema ou metadados insuficientes para confirmar a correspondência.'};}
      update.run(evaluation.accepted?'matched':'not_confirmed',JSON.stringify(evaluation),article.id);
      if(evaluation.accepted)report.matched++;else report.notConfirmed++;
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return report;
}
module.exports={screen,refreshHistory};
