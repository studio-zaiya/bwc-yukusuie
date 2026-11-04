const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto('file:///home/claude/yukusuie/design/v3/logo/index.html');await p.waitForTimeout(500);
for(const id of 'ABCDE'){const el=await p.$('#logo-'+id);await el.screenshot({path:`/home/claude/yukusuie/design/v3/stills/logo-${id}.png`});}
await b.close();})();
