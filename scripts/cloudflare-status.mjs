// Read-only account checks. Wrangler owns the cache/keyring; credentials stay in memory.
import { execFileSync } from 'node:child_process';
const account='7a8e6db3082a866ded1d858dd40d495a';
let credentials;
try {credentials=JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','auth','token','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}
catch {console.error('Kunde inte återanvända Wranglers inloggning.');process.exit(1);}
if(!credentials.token) {console.error('Wranglers inloggning har fel format.');process.exit(1);}
for(const path of ['subscriptions','workers/account-settings']) {
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,{headers:{Authorization:`Bearer ${credentials.token}`}});
  const data=await response.json();
  if(!response.ok) {console.log(JSON.stringify({check:path,status:response.status,errors:data.errors?.map(e=>({code:e.code,message:e.message}))}));continue;}
  console.log(JSON.stringify({check:path,result:path==='subscriptions'?data.result.map(s=>({plan:s.rate_plan,price:s.price,state:s.state})):data.result}));
}
