const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const socket=new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let id=0;const pending=new Map();socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){pending.get(r.id)?.(r);pending.delete(r.id);}});
function command(method,params){return new Promise(resolve=>{const key=++id;pending.set(key,resolve);socket.send(JSON.stringify({id:key,method,params}));});}
const result=await command('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
 location.hash='settings';
 await new Promise(r=>setTimeout(r,1500));
 if(!document.querySelector('.phone-dnd')){document.querySelector('[aria-label="Open profile menu"]')?.click();await new Promise(r=>setTimeout(r,300));Array.from(document.querySelectorAll('.sheet-menu button')).find(b=>b.textContent.includes('Settings'))?.click();await new Promise(r=>setTimeout(r,500));}
 const card=document.querySelector('.phone-dnd');
 const label=card?.querySelector('.check-label'),box=label?.querySelector('input');
 const ui={found:!!card,width:card?.getBoundingClientRect().width,viewport:innerWidth,text:card?.innerText,labelDisplay:label?getComputedStyle(label).display:null,boxHeight:box?.getBoundingClientRect().height};
 const original=JSON.parse(localStorage.getItem('waterline-phone-dnd')||'null')||{enabled:false,start:'22:00',end:'07:00',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
 const plugin=window.Capacitor.Plugins.PhoneAlarm;
 const now=new Date(),minutes=now.getHours()*60+now.getMinutes();
 const time=m=>String(Math.floor((m%1440)/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 try {
  await plugin.quietHours({enabled:true,start:time(minutes),end:time(minutes+2),timezone:original.timezone});
  const state=await plugin.status();let rejection='';try{await plugin.test();}catch(e){rejection=e.message;}
  return {ui,quiet:state.quiet,testRejected:rejection};
 }finally{await plugin.quietHours(original);}
})()`});
console.log(JSON.stringify(result.result?.result?.value??result));socket.close();
