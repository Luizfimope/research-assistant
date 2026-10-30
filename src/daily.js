require('dotenv').config({path:require('path').join(__dirname,'..','.env')});
require('./scheduler').runIfDue({startup:true}).then(result=>{
 process.exitCode=result.errors.length?1:0;
 require('./db').close();
}).catch(error=>{console.error(error.message);process.exitCode=1;});
