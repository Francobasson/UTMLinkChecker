const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
function publicAddress(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b] = ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)));
  }
  // Permit only global unicast IPv6; exclude mapped IPv4 and local ranges.
  return /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(db8|0):/i.test(ip);
}
async function checkLink(raw) {
  let current = new URL(raw); const redirects=[];
  for(let hop=0;hop<=5;hop++) {
    if(!['http:','https:'].includes(current.protocol)||current.username||current.password|| (current.port && !['80','443'].includes(current.port))) throw Error('Only public HTTP(S) URLs on standard ports are supported.');
    const host=current.hostname.replace(/^\[|\]$/g,'');
    const addresses=await dns.lookup(host,{all:true});
    if(!addresses.length||addresses.some(a=>!publicAddress(a.address))) throw Error('Private or reserved network addresses cannot be checked.');
    const chosen=addresses[0];
    const result=await new Promise((resolve,reject)=>{
      const req=(current.protocol==='https:'?https:http).request(current,{method:'GET',headers:{'User-Agent':'UTMLinkChecker/1.0','Range':'bytes=0-0'},lookup:(_h,opts,cb)=>opts.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family)},res=>{resolve({status:res.statusCode,location:res.headers.location});res.destroy();});
      req.setTimeout(8000,()=>req.destroy(Error('The destination timed out.')));req.on('error',reject);req.end();
    });
    if([301,302,303,307,308].includes(result.status)&&result.location){redirects.push({url:current.href,status:result.status});current=new URL(result.location,current);continue;}
    return {status:result.status,finalUrl:current.href,redirects};
  }
  throw Error('Too many redirects (more than five).');
}
let activeChecks=0;
let windowStart=Date.now();
let windowChecks=0;
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='GET'&&req.url==='/healthz'){
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return;
  }
  if(req.method==='POST'&&req.url==='/api/check'){
    if(Date.now()-windowStart>=60000){windowStart=Date.now();windowChecks=0;}
    if(activeChecks>=12||windowChecks>=240){
      res.writeHead(429,{'Content-Type':'application/json','Retry-After':'60'});
      res.end(JSON.stringify({error:'The checker is busy. Please try again in a minute.'}));return;
    }
    activeChecks++;windowChecks++;
    let body='';try{
      for await(const chunk of req){body+=chunk;if(body.length>20000)throw Error('Request too large.');}
      const {url}=JSON.parse(body);if(typeof url!=='string'||url.length>8000)throw Error('Invalid URL.');
      const result=await checkLink(url);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
    }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}finally{activeChecks--;}return;
  }
  const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
  const file=files[req.url];if(!file){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.setHeader('X-Content-Type-Options','nosniff');fs.createReadStream(path.join(__dirname,'public',file)).pipe(res);
});
if(require.main===module)server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('UTM Link Checker listening on port '+(process.env.PORT||3000)));
module.exports={server,publicAddress};
