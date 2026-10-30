require('dotenv').config({path:require('path').join(__dirname,'..','.env')});
const express=require('express');const path=require('path');const scheduler=require('./scheduler');
const app=express();app.use(express.json({limit:'32kb'}));
app.use((req,res,next)=>{const origin=req.get('origin');if(origin&&origin!=='http://'+req.get('host'))return res.sendStatus(403);next();});
app.use(express.static(path.join(__dirname,'..','public')));app.use('/api',require('./routes/api'));
const port=Number(process.env.PORT||4141);
const server=app.listen(port,'127.0.0.1',()=>{console.log('[server] http://127.0.0.1:'+port);scheduler.start();});
module.exports=server;
