const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const socket=new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let id=0;const pending=new Map();socket.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){pending.get(r.id)?.(r);pending.delete(r.id);}});
function command(method,params){return new Promise(resolve=>{const key=++id;pending.set(key,resolve);socket.send(JSON.stringify({id:key,method,params}));});}
const result=await command('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
 const card=document.querySelector('.phone-dnd');
 card.querySelector('form').requestSubmit();
 for(let n=0;n<30;n++){await new Promise(r=>setTimeout(r,500));const text=card.innerText;if(text.includes('Phone DND saved.')||text.includes('Cloud sync failed'))return {status:text,feedback:document.querySelector('.feedback-toast')?.innerText};}
 return {status:card.innerText,error:document.querySelector('[role="alert"]')?.innerText};
})()`});
console.log(JSON.stringify(result.result?.result?.value??result));socket.close();
