const {chromium}=require('playwright');
(async()=>{
  const [file,...ts]=process.argv.slice(2);
  const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  for(const t of ts){
    await p.goto('file://'+process.cwd()+'/'+file+'?t='+t);
    await p.waitForFunction(()=>window.READY===true,{timeout:8000}).catch(()=>errs.push('READY timeout'));
    await p.waitForTimeout(300);
    await p.screenshot({path:`shots/${file.replace('.html','')}-${t}.png`});
  }
  console.log("errors:",JSON.stringify(errs.filter(e=>!e.includes("TUNNEL"))));await b.close();
})();
