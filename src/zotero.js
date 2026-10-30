const request=require('./http');
const crypto=require('crypto');
function isConnected(){return !!(process.env.ZOTERO_API_KEY&&/^\d+$/.test(process.env.ZOTERO_LIBRARY_ID||''));}
async function addArticle(article){
 const type=process.env.ZOTERO_LIBRARY_TYPE||'users';
 if(!['users','groups'].includes(type))throw new Error('ZOTERO_LIBRARY_TYPE inválido');
 const key=article.zotero_item_key||Array.from(crypto.randomBytes(8),b=>'23456789ABCDEFGHIJKLMNPQRSTUVWXYZ'[b%32]).join('');
 const base='https://api.zotero.org/'+type+'/'+process.env.ZOTERO_LIBRARY_ID;
 const headers={'Zotero-API-Key':process.env.ZOTERO_API_KEY,'Zotero-API-Version':'3','Content-Type':'application/json'};
 // A chave é persistida antes da requisição: uma falha de rede não cria outro item na próxima tentativa.
 const fetch=require('node-fetch');
 const existing=await fetch(base+'/items/'+key,{headers,timeout:30000});
 if(existing.ok)return key;
 if(existing.status!==404)throw new Error('Zotero HTTP '+existing.status);
 const data={key,itemType:'journalArticle',title:article.title,creators:(article.authors||'').split(', ').filter(Boolean).map(name=>({creatorType:'author',name})),abstractNote:article.abstract||'',DOI:article.doi||'',url:article.url,date:article.published_date,extra:article.pmid?'PMID: '+article.pmid:'',collections:process.env.ZOTERO_COLLECTION_KEY?[process.env.ZOTERO_COLLECTION_KEY]:[],tags:[]};
 const json=await(await request(base+'/items',{method:'POST',headers,body:JSON.stringify([data])})).json();
 const saved=json.successful?.['0']?.key||json.success?.['0']||json.unchanged?.['0'];
 if(!saved)throw new Error('Zotero recusou o item: '+(json.failed?.['0']?.code||'resposta inválida'));
 return key;
}
module.exports={isConnected,addArticle};
