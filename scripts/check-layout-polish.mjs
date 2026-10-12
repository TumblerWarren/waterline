const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const socket=new WebSocket(pages[0].webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
const timer=setTimeout(()=>{socket.close();process.exitCode=1;console.log('Phone inspection timed out.');},25000);
socket.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.id===1){console.log(JSON.stringify(r.result?.result?.value??r));clearTimeout(timer);socket.close();}});
socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{awaitPromise:true,returnByValue:true,expression:`(async()=>{
 const wait=()=>new Promise(r=>setTimeout(r,350));
 const nav=async(name)=>{document.querySelector('[aria-label="Open profile menu"]')?.click();await wait();Array.from(document.querySelectorAll('.sheet-menu button')).find(b=>b.textContent.includes(name))?.click();await wait();};
 await nav('Settings');
 const bounds=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
 const card=document.querySelector('.phone-dnd'),checkbox=card.querySelector('input[type="checkbox"]');
 if(!checkbox.checked){checkbox.click();await wait();}
 card.querySelector('.time-trigger').click();await wait();
 const dialog=document.querySelector('dialog[open]');
 const clock={present:!!dialog.querySelector('.clock-dial'),width:dialog.getBoundingClientRect().width,viewport:innerWidth};
 dialog.querySelector('[aria-label="Hour 8"]').click();await wait();dialog.querySelector('[aria-label="Minute 25"]').click();await wait();clock.draft=dialog.querySelector('.clock-display').textContent;
 Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Set time').click();await wait();
 const liveCard=document.querySelector('.phone-dnd');const save=liveCard.querySelector('form > button');
 const settings={clock,changedTime:liveCard.querySelector('.time-trigger').textContent,cardReplaced:card!==liveCard,saveHighlighted:save.classList.contains('primary'),saveEnabled:!save.disabled,languageHelperRemoved:!document.querySelector('.language-settings').textContent.includes('Language applies'),switchRightEdges:Array.from(document.querySelectorAll('.settings-panel .setting-row input')).map(e=>bounds(e).right),saveInsideAlertCard:!!Array.from(document.querySelectorAll('.settings-panel')).find(e=>e.textContent.includes('In-app alerts')&&e.textContent.includes('Save preferences')),overflow:document.documentElement.scrollWidth>innerWidth};
 await nav('Calibration');
 const labels=Array.from(document.querySelectorAll('.capture-confirm'));
 const calibration={bullets:document.querySelectorAll('.calibration-instructions li').length,labels:labels.map(e=>({display:getComputedStyle(e).display,box:bounds(e.querySelector('input')),text:bounds(e.querySelector('span'))})),overflow:document.documentElement.scrollWidth>innerWidth};
 Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='History')?.click();await wait();
 const history={cloudNoteRemoved:!document.body.textContent.includes('Cloud history ·'),refreshNoteRemoved:!document.body.textContent.includes('History refreshes on opening')};
 await nav('Settings');return {settings,calibration,history};
})()`}}));
