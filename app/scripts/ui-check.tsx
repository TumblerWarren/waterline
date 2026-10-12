import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalibrationPage } from '../src/components/CalibrationPage';
import { HistoryChart } from '../src/components/HistoryChart';
import { ThemedSelect } from '../src/components/ThemedSelect';
import { initialHousehold } from '../src/demo';
import { t, useLanguage } from '../src/language';
import '../src/styles.css'; import '../src/redesign.css';
function Review() {
 const {language,setLanguage}=useLanguage(); const [page,setPage]=useState('history');
 const now=Date.now(); const home={...initialHousehold,role:'owner' as const};
 const points=Array.from({length:50},(_,i)=>({at:now-(49-i)*3*3600000,band:(i%3===0?'middle':'near-full') as 'middle'|'near-full'}));
 return <div className="app-shell"><aside className="sidebar"><div className="brand">waterline.</div><nav>{['Overview','History','Alarm','Bluetooth'].map(x=><button className="nav-item" key={x} onClick={()=>setPage(x.toLowerCase())}>{t(x)}</button>)}</nav><button className="profile-trigger">SD</button></aside><div className="workspace"><main className="main-content"><div className="page-heading"><h1>{t('Your tank over time.')}</h1></div><section className="panel"><ThemedSelect label="Language" value={language} onValueChange={v=>setLanguage(v as 'en'|'bn')}><option value="en">English</option><option value="bn">বাংলা</option></ThemedSelect><button onClick={()=>setPage('calibration')}>{t('Calibration')}</button></section>{page==='calibration'?<CalibrationPage home={home} now={now} preview={false} capture={async()=>{}}/>:<section className="panel history-panel"><HistoryChart points={points}/></section>}</main></div></div>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
