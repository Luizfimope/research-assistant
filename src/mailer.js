const nodemailer=require('nodemailer');
function buildTransport(){
 for(const key of ['SMTP_HOST','SMTP_USER','SMTP_PASS','EMAIL_FROM','EMAIL_TO'])if(!process.env[key])throw new Error('Configuração ausente: '+key);
 const port=Number(process.env.SMTP_PORT||465);
 return nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
}
async function verify(){const t=buildTransport();try{return await t.verify();}finally{t.close();}}
async function sendNewsletter(html,count,date){
 const t=buildTransport();try{
 const info=await t.sendMail({from:process.env.EMAIL_FROM,to:process.env.EMAIL_TO,subject:'Artigos de '+date+' ('+count+')',html,text:html.replace(/<[^>]*>/g,' '),messageId:'<research-'+date+'@research-assistant.local>'});
 if(!info.accepted?.length||info.rejected?.length)throw new Error('SMTP não aceitou todos os destinatários; conferir servidor antes de repetir');
 return info;
 }finally{t.close();}
}
module.exports={buildTransport,verify,sendNewsletter};
