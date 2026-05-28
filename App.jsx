import { useState, useEffect, useRef, useCallback } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ── constants ─────────────────────────────────────────────────────────────────
const CATS = [
  { id:"food",          label:"食物",  icon:"🍱", color:"#5aab8c" },
  { id:"transport",     label:"交通",  icon:"🚌", color:"#4a8fd4" },
  { id:"entertainment", label:"娛樂",  icon:"🎮", color:"#9b7fd4" },
  { id:"shopping",      label:"購物",  icon:"🛍️", color:"#d48a4a" },
  { id:"health",        label:"醫療",  icon:"💊", color:"#d46b7a" },
  { id:"other",         label:"其他",  icon:"🍃", color:"#6aafc8" },
];
const TRAVEL_CATS = [
  { id:"accommodation", label:"住宿",  icon:"🏨", color:"#4a8fd4" },
  { id:"food",          label:"餐飲",  icon:"🍜", color:"#5aab8c" },
  { id:"transport",     label:"交通",  icon:"✈️", color:"#9b7fd4" },
  { id:"activities",    label:"活動",  icon:"🎡", color:"#d48a4a" },
  { id:"shopping",      label:"購物",  icon:"🛍️", color:"#d46b7a" },
  { id:"other",         label:"其他",  icon:"🍃", color:"#6aafc8" },
];
const CURRENCIES = ["TWD","JPY","USD","EUR","KRW","HKD","CNY","THB","SGD","GBP"];

// ── localStorage helpers ───────────────────────────────────────────────────────
const LS = {
  get: (key, def) => { try { const v=localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  del: (key) => { try { localStorage.removeItem(key); } catch {} },
};
const SK = { exp:"mori_exp", shared:"mori_shared", trips:"mori_trips", texp:"mori_texp", cfg:"mori_cfg", apikey:"mori_apikey" };

// ── misc helpers ───────────────────────────────────────────────────────────────
const today     = () => new Date().toISOString().slice(0,10);
const thisMonth = () => new Date().toISOString().slice(0,7);
const getCat    = (id, cats=CATS) => cats.find(c=>c.id===id) ?? cats[cats.length-1];
const daysIn    = mon => { const [y,m]=mon.split("-").map(Number); return new Date(y,m,0).getDate(); };
const fmt       = (n, cur="NT$") => `${cur} ${Number(n||0).toLocaleString()}`;
const uid       = () => `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;

const compressImage = (file, maxW=640) => new Promise(resolve => {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ── component ─────────────────────────────────────────────────────────────────
export default function App() {
  const [expenses,  setExpenses]  = useState(() => LS.get(SK.exp, []));
  const [shared,    setShared]    = useState(() => LS.get(SK.shared, []));
  const [trips,     setTrips]     = useState(() => LS.get(SK.trips, []));
  const [travelExp, setTravelExp] = useState(() => LS.get(SK.texp, []));
  const [cfg,       setCfg]       = useState(() => LS.get(SK.cfg, {name:"我",time:"21:00",on:false}));
  const [apiKey,    setApiKey]    = useState(() => LS.get(SK.apikey, ""));
  const [tab,       setTab]       = useState("add");
  const [month,     setMonth]     = useState(thisMonth());
  const [filterCat, setFilterCat] = useState("all");
  const [toast,     setToast]     = useState(null);
  const [form,      setForm]      = useState({ amount:"", category:"food", note:"", date:today() });
  // travel
  const [selTrip,   setSelTrip]   = useState(null);
  const [tripView,  setTripView]  = useState("list");
  const [newTrip,   setNewTrip]   = useState({ name:"", destination:"", startDate:today(), endDate:today(), budget:"", currency:"TWD" });
  const [tForm,     setTForm]     = useState({ amount:"", category:"accommodation", note:"", date:today(), photo:null });
  const [photoModal,setPhotoModal]= useState(null);
  // voice
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceText,  setVoiceText]  = useState("");
  const [voiceResult,setVoiceResult]= useState(null);
  const [showKeyInput,setShowKeyInput]= useState(false);
  const recognitionRef = useRef(null);
  const fileRef  = useRef();

  // ── persist ────────────────────────────────────────────────────────────────
  useEffect(() => LS.set(SK.exp,    expenses),  [expenses]);
  useEffect(() => LS.set(SK.shared, shared),    [shared]);
  useEffect(() => LS.set(SK.trips,  trips),     [trips]);
  useEffect(() => LS.set(SK.texp,   travelExp), [travelExp]);
  useEffect(() => LS.set(SK.cfg,    cfg),       [cfg]);
  useEffect(() => LS.set(SK.apikey, apiKey),    [apiKey]);

  // ── reminder ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cfg.on) return;
    const iv = setInterval(() => {
      const n=new Date(); const [h,m]=cfg.time.split(":").map(Number);
      if (n.getHours()===h && n.getMinutes()===m && Notification.permission==="granted")
        new Notification("🍃 記帳提醒", { body:`今天花了 ${fmt(todayTotal)}，記得記帳！` });
    }, 60000);
    return () => clearInterval(iv);
  }, [cfg.on, cfg.time]);

  // ── derived ────────────────────────────────────────────────────────────────
  const todayTotal = expenses.filter(e=>e.date===today()).reduce((s,e)=>s+e.amount,0);
  const monthExp   = expenses.filter(e=>e.date.startsWith(month));
  const monthTotal = monthExp.reduce((s,e)=>s+e.amount,0);
  const filtered   = monthExp.filter(e=>filterCat==="all"||e.category===filterCat).sort((a,b)=>b.date.localeCompare(a.date));
  const catTotals  = CATS.map(c=>({ name:c.label, icon:c.icon, color:c.color, value:monthExp.filter(e=>e.category===c.id).reduce((s,e)=>s+e.amount,0) })).filter(c=>c.value>0);
  const dailyData  = Array.from({length:daysIn(month)},(_,i)=>{ const d=String(i+1).padStart(2,"0"); return {day:`${i+1}`,total:monthExp.filter(e=>e.date===`${month}-${d}`).reduce((s,e)=>s+e.amount,0)}; });
  const sharedByPerson = {};
  shared.forEach(e=>{ sharedByPerson[e.person]=(sharedByPerson[e.person]||0)+e.amount; });
  const sharedTotal = Object.values(sharedByPerson).reduce((a,b)=>a+b,0);
  const perPerson   = Object.keys(sharedByPerson).length>0 ? sharedTotal/Object.keys(sharedByPerson).length : 0;
  const curTrip     = trips.find(t=>t.id===selTrip);
  const tripExpenses= travelExp.filter(e=>e.tripId===selTrip).sort((a,b)=>b.date.localeCompare(a.date));
  const tripTotal   = tripExpenses.reduce((s,e)=>s+e.amount,0);
  const tripCatTotals = TRAVEL_CATS.map(c=>({ name:c.label,icon:c.icon,color:c.color,value:tripExpenses.filter(e=>e.category===c.id).reduce((s,e)=>s+e.amount,0) })).filter(c=>c.value>0);

  // ── helpers ────────────────────────────────────────────────────────────────
  const showToast=(msg,err=false)=>{ setToast({msg,err}); setTimeout(()=>setToast(null),2800); };
  const f  =(k,v)=>setForm(p=>({...p,[k]:v}));
  const tf =(k,v)=>setTForm(p=>({...p,[k]:v}));
  const nt =(k,v)=>setNewTrip(p=>({...p,[k]:v}));
  const sc =(k,v)=>setCfg(p=>({...p,[k]:v}));

  // ── actions ────────────────────────────────────────────────────────────────
  const addExp=()=>{
    if(!form.amount||+form.amount<=0) return showToast("請輸入有效金額 🌿",true);
    setExpenses(p=>[{id:uid(),...form,amount:+form.amount},...p]);
    f("amount",""); f("note",""); showToast("✅ 記帳成功！");
  };
  const delExp=id=>setExpenses(p=>p.filter(e=>e.id!==id));
  const addShared=()=>{
    if(!form.amount||+form.amount<=0) return showToast("請輸入有效金額 🌿",true);
    setShared(p=>[{id:uid(),...form,amount:+form.amount,person:cfg.name},...p]);
    f("amount",""); f("note",""); showToast("🤝 已加入共享帳本！");
  };
  const delShared=id=>setShared(p=>p.filter(e=>e.id!==id));
  const createTrip=()=>{
    if(!newTrip.name.trim()) return showToast("請輸入旅行名稱",true);
    const trip={id:uid(),...newTrip,budget:+newTrip.budget||0};
    setTrips(p=>[trip,...p]); setSelTrip(trip.id); setTripView("detail");
    setNewTrip({name:"",destination:"",startDate:today(),endDate:today(),budget:"",currency:"TWD"});
    showToast("✈️ 旅行帳本建立成功！");
  };
  const deleteTrip=id=>{ setTrips(p=>p.filter(t=>t.id!==id)); setTravelExp(p=>p.filter(e=>e.tripId!==id)); setSelTrip(null); setTripView("list"); showToast("旅行帳本已刪除"); };
  const addTravelExp=()=>{
    if(!tForm.amount||+tForm.amount<=0) return showToast("請輸入有效金額 🌿",true);
    setTravelExp(p=>[{id:uid(),tripId:selTrip,...tForm,amount:+tForm.amount},...p]);
    setTForm(t=>({...t,amount:"",note:"",photo:null})); showToast("📸 旅行記帳成功！");
  };
  const delTravelExp=id=>setTravelExp(p=>p.filter(e=>e.id!==id));
  const handleTPhoto=async e=>{ const file=e.target.files[0]; if(!file) return; try{ tf("photo",await compressImage(file)); }catch{} e.target.value=""; };

  const doExport=()=>{
    const blob=new Blob([JSON.stringify({expenses,shared,trips,travelExp,exported:new Date().toISOString()},null,2)],{type:"application/json"});
    Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:`kakeibo_${today()}.json`}).click();
    showToast("📦 匯出成功！");
  };
  const doImport=e=>{
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const d=JSON.parse(ev.target.result);
        const merge=(setter,arr)=>{ if(!arr) return; setter(p=>{ const ids=new Set(p.map(x=>x.id)); return [...arr.filter(x=>!ids.has(x.id)),...p]; }); };
        merge(setExpenses,d.expenses); merge(setShared,d.shared); merge(setTrips,d.trips); merge(setTravelExp,d.travelExp);
        showToast("📥 匯入成功！");
      }catch{ showToast("匯入失敗，請確認格式",true); }
    };
    r.readAsText(file); e.target.value="";
  };
  const reqNotif=async()=>{ if(Notification.permission!=="granted") await Notification.requestPermission(); sc("on",true); showToast("🔔 提醒已開啟！"); };

  // ── AI voice ──────────────────────────────────────────────────────────────
  const startVoice=useCallback(()=>{
    if(!apiKey.trim()) { setShowKeyInput(true); return showToast("請先在設定中填入 Anthropic API Key",true); }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR) return showToast("您的瀏覽器不支援語音辨識（請用 Chrome）",true);
    const rec=new SR(); rec.lang="zh-TW"; rec.interimResults=false; rec.maxAlternatives=1;
    recognitionRef.current=rec;
    rec.onstart=()=>setVoiceState("listening");
    rec.onresult=async ev=>{
      const transcript=ev.results[0][0].transcript;
      setVoiceText(transcript); setVoiceState("processing");
      try{
        const res=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
          body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:300,
            messages:[{role:"user",content:`你是記帳助理。從以下語音文字中提取記帳資訊，只回傳JSON，不要其他文字。
格式：{"amount":數字,"category":"food/transport/entertainment/shopping/health/other","note":"簡短說明"}
語音：「${transcript}」`}] })
        });
        const data=await res.json();
        const txt=(data.content||[]).find(b=>b.type==="text")?.text||"{}";
        const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
        setVoiceResult(parsed); setVoiceState("done");
      }catch{ setVoiceState("idle"); showToast("AI 解析失敗，請確認 API Key",true); }
    };
    rec.onerror=()=>{ setVoiceState("idle"); showToast("語音辨識失敗",true); };
    rec.start();
  },[apiKey]);

  const applyVoiceResult=()=>{
    if(!voiceResult) return;
    f("amount",String(voiceResult.amount||"")); f("category",voiceResult.category||"other"); f("note",voiceResult.note||voiceText);
    setVoiceState("idle"); setVoiceResult(null); setVoiceText(""); showToast("✅ 語音記帳已填入！");
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'M PLUS Rounded 1c','Noto Sans TC',sans-serif",background:"linear-gradient(160deg,#dceefb 0%,#e6f3fc 45%,#d4e9f7 100%)",minHeight:"100vh"}}>
      <style>{G_CSS}</style>

      {/* HEADER */}
      <div className="hdr">
        <div style={{fontSize:11,color:"rgba(255,255,255,.7)",letterSpacing:".18em",marginBottom:3}}>🌿 MY KAKEIBO · お小遣い帳</div>
        <h1 style={{color:"#fff",fontSize:24,fontWeight:800,letterSpacing:".06em",margin:0}}>
          森の家計簿 <span className="float">🍂</span>
        </h1>
        <div style={{color:"rgba(255,255,255,.75)",fontSize:13,marginTop:4}}>
          {new Date().toLocaleDateString("zh-TW",{year:"numeric",month:"long",day:"numeric",weekday:"long"})}
        </div>
      </div>

      <div className="main">
        {/* TODAY */}
        <div className="today-banner">
          <div style={{fontSize:13,opacity:.85,marginBottom:3}}>🌸 今日消費</div>
          <div style={{fontSize:36,fontWeight:800}}>{fmt(todayTotal)}</div>
          <div style={{fontSize:12,opacity:.72,marginTop:3}}>
            本月累計：{fmt(expenses.filter(e=>e.date.startsWith(thisMonth())).reduce((s,e)=>s+e.amount,0))}
          </div>
        </div>

        {/* TABS */}
        <div className="tabs">
          {[{id:"add",l:"✏️ 記帳"},{id:"records",l:"📋 記錄"},{id:"chart",l:"📊 圖表"},
            {id:"report",l:"📝 月報"},{id:"travel",l:"✈️ 旅行"},{id:"shared",l:"👥 共享"},{id:"settings",l:"⚙️ 設定"}]
            .map(t=>(
            <button key={t.id} className={`tab${tab===t.id?" active":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>
          ))}
        </div>

        {/* ── ADD ── */}
        {tab==="add" && (
          <div className="card">
            <div className="washi" />
            {/* VOICE */}
            <div className="voice-box">
              <div className="sec-title" style={{marginBottom:8,color:"#7b5fb4"}}>🎤 AI 語音記帳</div>
              {voiceState==="idle" && <button className="voice-btn" onClick={startVoice}><span style={{fontSize:20}}>🎤</span> 開始說話</button>}
              {voiceState==="listening" && <button className="voice-btn recording" onClick={()=>recognitionRef.current?.stop()}><span className="pulse-dot" /> 聆聽中… 點擊停止</button>}
              {voiceState==="processing" && <div className="voice-btn processing"><span className="spin">⏳</span> AI 分析中…</div>}
              {voiceState==="done" && voiceResult && (
                <div className="voice-result">
                  <div style={{fontSize:12,color:"#6aafc8",marginBottom:6}}>辨識：「{voiceText}」</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontWeight:800,color:"#1a4e7a"}}>NT$ {voiceResult.amount}</span>
                    <span className="voice-tag">{getCat(voiceResult.category).icon} {getCat(voiceResult.category).label}</span>
                    {voiceResult.note&&<span style={{fontSize:13,color:"#4a7a9e"}}>"{voiceResult.note}"</span>}
                    <button className="btn green" style={{padding:"6px 14px",fontSize:13,width:"auto",borderRadius:20}} onClick={applyVoiceResult}>✅ 套用</button>
                    <button className="del" onClick={()=>{setVoiceState("idle");setVoiceResult(null);}}>✕</button>
                  </div>
                </div>
              )}
              <div style={{fontSize:11,color:"#8ec5de",marginTop:6}}>範例：「午餐花了一百五十元」「地鐵票兩百」</div>
            </div>
            <hr className="divider" />
            <div className="sec-title">🌿 手動記帳</div>
            <div className="form-col">
              <div><div className="lbl">💰 金額 (NT$)</div>
                <input className="inp" type="number" placeholder="0" value={form.amount} onChange={e=>f("amount",e.target.value)} onKeyDown={e=>e.key==="Enter"&&addExp()} style={{fontSize:28,fontWeight:800,color:"#1a4e7a"}} /></div>
              <div><div className="lbl">🏷️ 類別</div>
                <div className="cat-grid">{CATS.map(c=><button key={c.id} className="cat-btn"
                  style={{borderColor:c.color,background:form.category===c.id?c.color:"rgba(255,255,255,.88)",color:form.category===c.id?"#fff":c.color}}
                  onClick={()=>f("category",c.id)}>{c.icon} {c.label}</button>)}</div></div>
              <div><div className="lbl">📅 日期</div><input className="inp" type="date" value={form.date} onChange={e=>f("date",e.target.value)} /></div>
              <div><div className="lbl">📝 備注</div><input className="inp" type="text" placeholder="今天買了什麼呢？🌸" value={form.note} onChange={e=>f("note",e.target.value)} onKeyDown={e=>e.key==="Enter"&&addExp()} /></div>
              <button className="btn" onClick={addExp}>🍃 記帳！</button>
            </div>
          </div>
        )}

        {/* ── RECORDS ── */}
        {tab==="records" && (
          <div className="card">
            <div className="washi" />
            <div className="sec-title">📋 消費記錄</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input className="inp" type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{flex:1}} />
              <select className="inp" value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{flex:1,appearance:"none"}}>
                <option value="all">全部類別</option>
                {CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div className="summary-card">
              <div style={{fontSize:11,color:"#6aafc8"}}>{month}</div>
              <div style={{fontSize:26,fontWeight:800,color:"#1a4e7a"}}>{fmt(filtered.reduce((s,e)=>s+e.amount,0))}</div>
              <div style={{fontSize:12,color:"#6aafc8"}}>{filtered.length} 筆記錄</div>
            </div>
            <div style={{maxHeight:360,overflowY:"auto"}}>
              {filtered.length===0 ? <Empty text="這個月還沒有記錄喔！" /> : filtered.map(e=>{
                const c=getCat(e.category);
                return <div key={e.id} className="row" style={{borderLeftColor:c.color}}>
                  <span style={{fontSize:22}}>{c.icon}</span>
                  <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,color:"#1a4e7a",fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.note||c.label}</div><div style={{fontSize:11,color:"#8ec5de"}}>{e.date} · {c.label}</div></div>
                  <div style={{fontWeight:800,color:"#1a4e7a",fontSize:14,whiteSpace:"nowrap"}}>{fmt(e.amount)}</div>
                  <button className="del" onClick={()=>delExp(e.id)}>✕</button>
                </div>;
              })}
            </div>
            <hr className="divider" />
            <div style={{display:"flex",gap:8}}>
              <button className="btn green" onClick={doExport} style={{flex:1,fontSize:13,padding:"10px 14px"}}>⬇ 匯出</button>
              <label style={{flex:1}}><div className="btn purple" style={{fontSize:13,padding:"10px 14px",textAlign:"center",cursor:"pointer"}}>⬆ 匯入</div><input ref={fileRef} type="file" accept=".json" onChange={doImport} style={{display:"none"}} /></label>
            </div>
          </div>
        )}

        {/* ── CHART ── */}
        {tab==="chart" && (<>
          <div className="card">
            <div className="washi" /><div className="sec-title">🥧 類別分布</div>
            <input className="inp" type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{marginBottom:14}} />
            {catTotals.length===0 ? <Empty text="這個月還沒有資料！" /> : <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={catTotals} cx="50%" cy="50%" innerRadius={52} outerRadius={82} dataKey="value" paddingAngle={3} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {catTotals.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Tooltip formatter={v=>fmt(v)} /></PieChart>
              </ResponsiveContainer>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>
                {catTotals.map(c=><div key={c.name} style={{display:"flex",alignItems:"center",gap:5,fontSize:12}}>
                  <div style={{width:10,height:10,borderRadius:3,background:c.color}} /><span style={{color:"#4a7a9e"}}>{c.icon} {c.name}：{fmt(c.value)}</span></div>)}
              </div>
            </>}
          </div>
          <div className="card"><div className="sec-title">📊 每日消費趨勢</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyData} margin={{top:4,right:4,bottom:4,left:-16}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8eef9" /><XAxis dataKey="day" tick={{fontSize:9,fill:"#8ec5de"}} /><YAxis tick={{fontSize:9,fill:"#8ec5de"}} />
                <Tooltip formatter={v=>fmt(v)} /><Bar dataKey="total" fill="#4a8fd4" radius={[5,5,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>)}

        {/* ── REPORT ── */}
        {tab==="report" && (
          <div className="card">
            <div className="washi" /><div className="sec-title">📝 月度報表</div>
            <input className="inp" type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{marginBottom:16}} />
            <div className="report-hero">
              <div style={{fontSize:13,opacity:.8}}>📅 {month}</div>
              <div style={{fontSize:34,fontWeight:800}}>{fmt(monthTotal)}</div>
              <div style={{fontSize:12,opacity:.72,marginTop:2}}>{monthExp.length} 筆消費 · 日均 {fmt(Math.round(monthTotal/Math.max(daysIn(month),1)))}</div>
            </div>
            {CATS.map(c=>{ const total=monthExp.filter(e=>e.category===c.id).reduce((s,e)=>s+e.amount,0); const pct=monthTotal>0?(total/monthTotal)*100:0; if(!total) return null;
              return <div key={c.id} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4,color:"#1a4e7a",fontWeight:700}}>
                  <span>{c.icon} {c.label}</span><span>{fmt(total)} <span style={{fontWeight:400,color:"#6aafc8"}}>({pct.toFixed(1)}%)</span></span></div>
                <div style={{height:10,background:"#deeef9",borderRadius:10,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:c.color,borderRadius:10,transition:"width .5s"}} /></div>
              </div>; })}
            <hr className="divider" />
            <div className="sec-title">🔥 最高消費日 TOP 3</div>
            {(()=>{ const bd={}; monthExp.forEach(e=>{ bd[e.date]=(bd[e.date]||0)+e.amount; });
              return Object.entries(bd).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([date,amt])=>(
                <div key={date} className="row"><span>📅</span><span style={{flex:1,fontWeight:700,color:"#1a4e7a",fontSize:14}}>{date}</span><span style={{fontWeight:800,color:"#4a8fd4"}}>{fmt(amt)}</span></div>
              )); })()}
          </div>
        )}

        {/* ── TRAVEL ── */}
        {tab==="travel" && (<>
          {tripView==="list" && (
            <div className="card">
              <div className="washi" style={{background:"repeating-linear-gradient(90deg,rgba(155,127,212,.2) 0,rgba(155,127,212,.2) 17px,rgba(212,138,74,.15) 17px,rgba(212,138,74,.15) 34px)"}} />
              <div className="sec-title" style={{color:"#9b7fd4"}}>✈️ 我的旅行帳本</div>
              <button className="btn" style={{background:"linear-gradient(135deg,#9b7fd4,#7b5fb4)",marginBottom:14}} onClick={()=>setTripView("newtrip")}>＋ 新建旅行帳本</button>
              {trips.length===0 ? <Empty text="還沒有旅行帳本，快去建立吧！" /> : (
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {trips.map(trip=>{ const tex=travelExp.filter(e=>e.tripId===trip.id); const ttotal=tex.reduce((s,e)=>s+e.amount,0); const pct=trip.budget>0?Math.min(100,(ttotal/trip.budget)*100):0;
                    return <div key={trip.id} className="trip-card" onClick={()=>{setSelTrip(trip.id);setTripView("detail");}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div><div style={{fontWeight:800,fontSize:16,color:"#1a4e7a"}}>✈️ {trip.name}</div><div style={{fontSize:12,color:"#6aafc8",marginTop:2}}>📍 {trip.destination||"未設定"} · {trip.startDate} ～ {trip.endDate}</div></div>
                        <span className="trip-badge">{trip.currency}</span></div>
                      <div style={{marginTop:10}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#1a4e7a",marginBottom:4}}>
                          <span>已消費 {fmt(ttotal,trip.currency)}</span>{trip.budget>0&&<span style={{color:"#6aafc8"}}>預算 {fmt(trip.budget,trip.currency)}</span>}</div>
                        {trip.budget>0&&<div style={{height:8,background:"#deeef9",borderRadius:8,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:pct>90?"#d46b7a":"#9b7fd4",borderRadius:8}} /></div>}
                      </div>
                      <div style={{fontSize:12,color:"#8ec5de",marginTop:6}}>{tex.length} 筆記錄 →</div>
                    </div>;
                  })}
                </div>
              )}
            </div>
          )}

          {tripView==="newtrip" && (
            <div className="card">
              <div className="washi" style={{background:"repeating-linear-gradient(90deg,rgba(155,127,212,.2) 0,rgba(155,127,212,.2) 17px,rgba(212,138,74,.15) 17px,rgba(212,138,74,.15) 34px)"}} />
              <button className="back-btn" onClick={()=>setTripView("list")}>← 返回</button>
              <div className="sec-title" style={{color:"#9b7fd4"}}>✈️ 新建旅行帳本</div>
              <div className="form-col">
                <div><div className="lbl">🗺️ 旅行名稱 *</div><input className="inp" placeholder="例：東京五日遊" value={newTrip.name} onChange={e=>nt("name",e.target.value)} /></div>
                <div><div className="lbl">📍 目的地</div><input className="inp" placeholder="例：東京、日本" value={newTrip.destination} onChange={e=>nt("destination",e.target.value)} /></div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1}}><div className="lbl">📅 出發日</div><input className="inp" type="date" value={newTrip.startDate} onChange={e=>nt("startDate",e.target.value)} /></div>
                  <div style={{flex:1}}><div className="lbl">📅 回程日</div><input className="inp" type="date" value={newTrip.endDate} onChange={e=>nt("endDate",e.target.value)} /></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:2}}><div className="lbl">💰 預算</div><input className="inp" type="number" placeholder="0" value={newTrip.budget} onChange={e=>nt("budget",e.target.value)} /></div>
                  <div style={{flex:1}}><div className="lbl">💱 幣別</div><select className="inp" value={newTrip.currency} onChange={e=>nt("currency",e.target.value)} style={{appearance:"none"}}>{CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                </div>
                <button className="btn" style={{background:"linear-gradient(135deg,#9b7fd4,#7b5fb4)"}} onClick={createTrip}>✈️ 建立旅行帳本</button>
              </div>
            </div>
          )}

          {tripView==="detail" && curTrip && (<>
            <div className="card">
              <button className="back-btn" onClick={()=>setTripView("list")}>← 返回旅行列表</button>
              <div style={{background:"linear-gradient(135deg,#7b5fb4,#9b7fd4)",borderRadius:16,padding:"18px 16px",color:"#fff",marginBottom:14}}>
                <div style={{fontSize:13,opacity:.8}}>✈️ {curTrip.destination||"旅行帳本"}</div>
                <div style={{fontSize:22,fontWeight:800,marginTop:2}}>{curTrip.name}</div>
                <div style={{fontSize:12,opacity:.75,marginTop:3}}>{curTrip.startDate} ～ {curTrip.endDate}</div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:12,alignItems:"flex-end"}}>
                  <div><div style={{fontSize:11,opacity:.8}}>已消費</div><div style={{fontSize:26,fontWeight:800}}>{fmt(tripTotal,curTrip.currency)}</div></div>
                  {curTrip.budget>0&&<div style={{textAlign:"right"}}><div style={{fontSize:11,opacity:.8}}>剩餘預算</div><div style={{fontSize:18,fontWeight:800,color:tripTotal>curTrip.budget?"#ffb3b3":"#b3ffda"}}>{fmt(curTrip.budget-tripTotal,curTrip.currency)}</div></div>}
                </div>
                {curTrip.budget>0&&<div style={{height:8,background:"rgba(255,255,255,.25)",borderRadius:8,overflow:"hidden",marginTop:10}}><div style={{height:"100%",width:`${Math.min(100,(tripTotal/curTrip.budget)*100)}%`,background:"rgba(255,255,255,.85)",borderRadius:8}} /></div>}
              </div>
              {tripCatTotals.length>0&&<>
                <div className="sec-title">🥧 分類概覽</div>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart><Pie data={tripCatTotals} cx="50%" cy="50%" innerRadius={36} outerRadius={60} dataKey="value" paddingAngle={3} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {tripCatTotals.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie><Tooltip formatter={v=>fmt(v,curTrip.currency)} /></PieChart>
                </ResponsiveContainer><hr className="divider" />
              </>}
              <div className="sec-title" style={{color:"#9b7fd4"}}>📸 新增旅行消費</div>
              <div className="form-col">
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:2}}><div className="lbl">💰 金額</div><input className="inp" type="number" placeholder="0" value={tForm.amount} onChange={e=>tf("amount",e.target.value)} style={{fontSize:20,fontWeight:800}} /></div>
                  <div style={{flex:1}}><div className="lbl">📅 日期</div><input className="inp" type="date" value={tForm.date} onChange={e=>tf("date",e.target.value)} /></div>
                </div>
                <div><div className="lbl">🏷️ 類別</div><div className="cat-grid">{TRAVEL_CATS.map(c=><button key={c.id} className="cat-btn"
                  style={{borderColor:c.color,background:tForm.category===c.id?c.color:"rgba(255,255,255,.88)",color:tForm.category===c.id?"#fff":c.color,fontSize:12}}
                  onClick={()=>tf("category",c.id)}>{c.icon} {c.label}</button>)}</div></div>
                <div><div className="lbl">📝 備注</div><input className="inp" placeholder="今天去了哪裡？🌸" value={tForm.note} onChange={e=>tf("note",e.target.value)} /></div>
                <div><div className="lbl">📷 拍照記錄</div>
                  {tForm.photo ? (
                    <div style={{position:"relative"}}><img src={tForm.photo} alt="" style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:14,border:"2px solid #a8cce6",cursor:"pointer"}} onClick={()=>setPhotoModal(tForm.photo)} /><button className="del" style={{position:"absolute",top:8,right:8}} onClick={()=>tf("photo",null)}>✕</button></div>
                  ) : (
                    <label><div className="photo-placeholder"><span style={{fontSize:32}}>📷</span><div style={{fontSize:13,color:"#6aafc8",marginTop:6}}>點擊拍照或選擇圖片</div></div><input type="file" accept="image/*" capture="environment" onChange={handleTPhoto} style={{display:"none"}} /></label>
                  )}
                </div>
                <button className="btn" style={{background:"linear-gradient(135deg,#9b7fd4,#7b5fb4)"}} onClick={addTravelExp}>📸 記錄此筆消費</button>
              </div>
            </div>
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div className="sec-title" style={{marginBottom:0,color:"#9b7fd4"}}>📋 旅行記錄 ({tripExpenses.length})</div>
                <button style={{background:"none",border:"1.5px solid #d4a8a8",color:"#d46b7a",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:12,fontFamily:"'M PLUS Rounded 1c',sans-serif"}} onClick={()=>{if(confirm("確定刪除整個旅行帳本？"))deleteTrip(selTrip);}}>🗑 刪除旅行</button>
              </div>
              {tripExpenses.length===0 ? <Empty text="還沒有記錄！" /> : (
                <div style={{maxHeight:500,overflowY:"auto"}}>
                  {tripExpenses.map(e=>{ const c=getCat(e.category,TRAVEL_CATS);
                    return <div key={e.id} className="travel-row" style={{borderLeftColor:c.color}}>
                      {e.photo ? <img src={e.photo} alt="" style={{width:54,height:54,objectFit:"cover",borderRadius:10,flexShrink:0,cursor:"pointer",border:"2px solid #a8cce6"}} onClick={()=>setPhotoModal(e.photo)} />
                        : <div style={{width:54,height:54,borderRadius:10,background:"rgba(155,127,212,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{c.icon}</div>}
                      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,color:"#1a4e7a",fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.note||c.label}</div><div style={{fontSize:11,color:"#8ec5de"}}>{e.date} · {c.label}</div></div>
                      <div style={{fontWeight:800,color:"#1a4e7a",fontSize:14,whiteSpace:"nowrap"}}>{fmt(e.amount,curTrip.currency)}</div>
                      <button className="del" onClick={()=>delTravelExp(e.id)}>✕</button>
                    </div>;
                  })}
                </div>
              )}
            </div>
          </>)}
        </>)}

        {/* ── SHARED ── */}
        {tab==="shared" && (<>
          <div className="card">
            <div className="washi" /><div className="sec-title">👥 共享帳本</div>
            <div style={{marginBottom:12}}><div className="lbl">👤 你的名字</div><input className="inp" value={cfg.name} onChange={e=>sc("name",e.target.value)} /></div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <div style={{flex:1}}><div className="lbl">💰 金額</div><input className="inp" type="number" placeholder="0" value={form.amount} onChange={e=>f("amount",e.target.value)} /></div>
              <div style={{flex:1}}><div className="lbl">🏷️ 類別</div><select className="inp" value={form.category} onChange={e=>f("category",e.target.value)} style={{appearance:"none"}}>{CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select></div>
            </div>
            <div style={{marginBottom:12}}><div className="lbl">📝 備注</div><input className="inp" placeholder="說明一下～" value={form.note} onChange={e=>f("note",e.target.value)} /></div>
            <button className="btn orange" onClick={addShared}>🤝 加入共享記帳</button>
          </div>
          {Object.keys(sharedByPerson).length>1&&(
            <div className="card"><div className="sec-title">⚖️ 分帳結算</div>
              <div className="report-hero" style={{marginBottom:14}}><div style={{fontSize:12,opacity:.8}}>總金額</div><div style={{fontSize:26,fontWeight:800}}>{fmt(sharedTotal)}</div><div style={{fontSize:12,opacity:.75}}>每人應付 {fmt(Math.round(perPerson))}</div></div>
              {Object.entries(sharedByPerson).map(([name,amt])=>{ const diff=amt-perPerson; return <div key={name} className="row">
                <span>👤</span><span style={{flex:1,fontWeight:700,color:"#1a4e7a"}}>{name}</span><span style={{fontWeight:800,color:"#1a4e7a"}}>{fmt(amt)}</span>
                <span style={{fontSize:12,padding:"3px 9px",borderRadius:20,fontWeight:700,background:diff>=0?"rgba(90,171,140,.15)":"rgba(212,107,122,.15)",color:diff>=0?"#3a8a6a":"#b04a5a",border:`1.5px solid ${diff>=0?"#5aab8c":"#d46b7a"}`}}>{diff>=0?`多付 +${Math.round(diff)}`:`應收 ${Math.round(-diff)}`}</span>
              </div>;})}
            </div>
          )}
          <div className="card"><div className="sec-title">📋 共享記錄</div>
            {shared.length===0?<Empty text="還沒有共享帳本記錄！" />:
              <div style={{maxHeight:300,overflowY:"auto"}}>{shared.map(e=>{ const c=getCat(e.category); return <div key={e.id} className="row" style={{borderLeftColor:c.color}}>
                <span style={{fontSize:20}}>{c.icon}</span><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:13,color:"#1a4e7a"}}>👤 {e.person}{e.note?` · ${e.note}`:""}</div><div style={{fontSize:11,color:"#8ec5de"}}>{e.date} · {c.label}</div></div>
                <span style={{fontWeight:800,color:"#1a4e7a",fontSize:14,whiteSpace:"nowrap"}}>{fmt(e.amount)}</span><button className="del" onClick={()=>delShared(e.id)}>✕</button>
              </div>;})}
            </div>}
          </div>
        </>)}

        {/* ── SETTINGS ── */}
        {tab==="settings" && (
          <div className="card">
            <div className="washi" /><div className="sec-title">⚙️ 設定</div>

            {/* API KEY */}
            <div style={{marginBottom:18}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1a4e7a",marginBottom:8}}>🤖 Anthropic API Key（語音記帳用）</div>
              <div style={{fontSize:12,color:"#8ec5de",marginBottom:8}}>前往 <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:"#4a8fd4"}}>console.anthropic.com</a> 免費取得 API Key</div>
              <input className="inp" type="password" placeholder="sk-ant-..." value={apiKey} onChange={e=>setApiKey(e.target.value)} style={{marginBottom:6}} />
              <div style={{fontSize:11,color:"#8ec5de"}}>🔒 僅儲存於您的瀏覽器，不會上傳</div>
            </div>
            <hr className="divider" />

            {/* REMINDER */}
            <div style={{marginBottom:18}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1a4e7a",marginBottom:10}}>🔔 每日記帳提醒</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input className="inp" type="time" value={cfg.time} onChange={e=>sc("time",e.target.value)} style={{flex:1}} />
                <button className="btn" onClick={reqNotif} style={{flex:1,fontSize:13,padding:"11px 14px",background:cfg.on?"linear-gradient(135deg,#5aab8c,#3a8a6a)":"linear-gradient(135deg,#4a8fd4,#2a68b8)"}}>{cfg.on?"✅ 已開啟":"開啟提醒"}</button>
              </div>
            </div>
            <hr className="divider" />

            {/* DATA */}
            <div style={{marginBottom:18}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1a4e7a",marginBottom:10}}>📦 資料管理</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button className="btn green" onClick={doExport}>⬇ 匯出所有資料</button>
                <label><div className="btn purple" style={{textAlign:"center",cursor:"pointer"}}>⬆ 匯入資料</div><input type="file" accept=".json" onChange={doImport} style={{display:"none"}} /></label>
                <button className="btn red" onClick={()=>{if(confirm("確定清除所有資料？")){[SK.exp,SK.shared,SK.trips,SK.texp].forEach(k=>LS.del(k));setExpenses([]);setShared([]);setTrips([]);setTravelExp([]);showToast("已清除全部資料");}}}>🗑 清除全部資料</button>
              </div>
            </div>
            <hr className="divider" />
            <div style={{fontSize:12,color:"#8ec5de",textAlign:"center",lineHeight:1.9}}>
              🌿 森の家計簿 v2.0<br/>✈️ 旅行帳本 · 📷 拍照記帳 · 🎤 AI語音<br/><span style={{fontSize:10}}>Animal Crossing × 日系手帳風</span>
            </div>
          </div>
        )}
        <div style={{height:32}} />
      </div>

      {/* PHOTO MODAL */}
      {photoModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPhotoModal(null)}>
          <img src={photoModal} alt="" style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:16,boxShadow:"0 8px 40px rgba(0,0,0,.5)"}} />
        </div>
      )}
      {toast&&<div className={`toast${toast.err?" err":""}`}>{toast.msg}</div>}
    </div>
  );
}

function Empty({text}){
  return <div style={{textAlign:"center",padding:"36px 0",color:"#8ec5de"}}><div style={{fontSize:44}}>🍃</div><div style={{marginTop:8,fontSize:14}}>{text}</div></div>;
}

const G_CSS = `
@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
.hdr{background:linear-gradient(135deg,#2a68b8 0%,#4a8fd4 55%,#6aafc8 100%);padding:22px 16px 62px;position:relative;overflow:hidden}
.hdr::before{content:"";position:absolute;top:-28px;right:-28px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.07)}
.hdr::after{content:"🌿";position:absolute;right:18px;bottom:-8px;font-size:76px;opacity:.17;transform:rotate(-15deg)}
.main{padding:0 12px;margin:-46px auto 0;max-width:620px;position:relative;z-index:2}
.today-banner{background:linear-gradient(135deg,#2a68b8,#4a8fd4);border-radius:22px;padding:20px;color:#fff;text-align:center;margin-bottom:14px;position:relative;overflow:hidden;box-shadow:0 8px 28px rgba(42,104,184,.24)}
.today-banner::before{content:"🍃";position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:42px;opacity:.2}
.today-banner::after{content:"🍂";position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:42px;opacity:.2}
.tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:5px;margin-bottom:14px;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{flex-shrink:0;padding:8px 13px;border-radius:50px;border:none;cursor:pointer;font-family:'M PLUS Rounded 1c',sans-serif;font-size:12px;font-weight:700;transition:all .18s}
.tab.active{background:#4a8fd4;color:#fff;box-shadow:0 4px 12px rgba(74,143,212,.38)}
.tab:not(.active){background:rgba(255,255,255,.76);color:#4a8fd4;border:1.5px solid #bcd8f0}
.card{background:rgba(255,255,255,.89);border-radius:22px;border:2px dashed #a8cce6;padding:18px 16px;margin-bottom:14px;box-shadow:0 6px 24px rgba(58,128,194,.09);backdrop-filter:blur(8px)}
.washi{height:17px;margin-bottom:15px;border-radius:4px;background:repeating-linear-gradient(90deg,rgba(74,143,212,.2) 0,rgba(74,143,212,.2) 17px,rgba(106,175,200,.16) 17px,rgba(106,175,200,.16) 34px)}
.sec-title{font-size:13px;font-weight:700;color:#4a8fd4;letter-spacing:.08em;display:flex;align-items:center;gap:6px;margin-bottom:12px}
.form-col{display:flex;flex-direction:column;gap:12px}
.lbl{font-size:12px;font-weight:700;color:#6aafc8;margin-bottom:5px}
.inp{width:100%;padding:11px 14px;border:2px solid #a8cce6;border-radius:14px;font-family:'M PLUS Rounded 1c',sans-serif;font-size:15px;color:#1a4e7a;background:rgba(255,255,255,.92);outline:none;transition:border-color .2s}
.inp:focus{border-color:#4a8fd4;box-shadow:0 0 0 3px rgba(74,143,212,.16)}
.cat-grid{display:flex;flex-wrap:wrap;gap:8px}
.cat-btn{padding:8px 13px;border-radius:50px;cursor:pointer;font-family:'M PLUS Rounded 1c',sans-serif;font-weight:700;font-size:13px;border:2px solid;transition:all .18s}
.btn{display:block;width:100%;padding:13px 18px;border:none;border-radius:50px;font-family:'M PLUS Rounded 1c',sans-serif;font-weight:800;font-size:15px;cursor:pointer;transition:all .18s;background:linear-gradient(135deg,#4a8fd4,#2a68b8);color:#fff;box-shadow:0 4px 14px rgba(74,143,212,.32)}
.btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(74,143,212,.42)}
.btn.green{background:linear-gradient(135deg,#5aab8c,#3a8a6a);box-shadow:0 4px 14px rgba(90,171,140,.28)}
.btn.purple{background:linear-gradient(135deg,#9b7fd4,#7b5fb4);box-shadow:0 4px 14px rgba(155,127,212,.28)}
.btn.red{background:linear-gradient(135deg,#d46b7a,#b44a5a);box-shadow:0 4px 14px rgba(212,107,122,.28)}
.btn.orange{background:linear-gradient(135deg,#d48a4a,#b46a2a);box-shadow:0 4px 14px rgba(212,138,74,.28)}
.summary-card{background:linear-gradient(135deg,rgba(74,143,212,.1),rgba(106,175,200,.06));border-radius:15px;padding:14px;text-align:center;margin-bottom:14px}
.row{display:flex;align-items:center;gap:10px;padding:11px 12px;background:rgba(255,255,255,.76);border-radius:14px;border-left:4px solid #4a8fd4;margin-bottom:8px;transition:all .18s}
.row:hover{background:rgba(255,255,255,.96);box-shadow:0 2px 10px rgba(74,143,212,.12)}
.del{background:none;border:1.5px solid #d4a8a8;color:#d4a8a8;border-radius:8px;padding:2px 8px;cursor:pointer;font-size:12px;transition:all .18s;flex-shrink:0}
.del:hover{background:#d4a8a8;color:#fff}
.divider{border:none;border-top:2px dashed #bcd8f0;margin:14px 0}
.report-hero{background:linear-gradient(135deg,#2a68b8,#4a8fd4);border-radius:18px;padding:18px 20px;color:#fff;text-align:center;margin-bottom:16px;box-shadow:0 6px 22px rgba(42,104,184,.2)}
.voice-box{background:linear-gradient(135deg,rgba(155,127,212,.08),rgba(106,175,200,.06));border:1.5px dashed #b8a8e4;border-radius:18px;padding:14px;margin-bottom:14px}
.voice-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border:none;border-radius:50px;font-family:'M PLUS Rounded 1c',sans-serif;font-weight:800;font-size:14px;cursor:pointer;background:linear-gradient(135deg,#9b7fd4,#7b5fb4);color:#fff;box-shadow:0 4px 14px rgba(155,127,212,.3);transition:all .18s}
.voice-btn.recording{background:linear-gradient(135deg,#d46b7a,#b44a5a);animation:pulse-bg 1.5s ease-in-out infinite}
.voice-btn.processing{background:linear-gradient(135deg,#d48a4a,#b46a2a);cursor:default}
@keyframes pulse-bg{0%,100%{box-shadow:0 4px 14px rgba(212,107,122,.3)}50%{box-shadow:0 4px 24px rgba(212,107,122,.6)}}
.pulse-dot{width:10px;height:10px;border-radius:50%;background:#fff;animation:blink 1s ease-in-out infinite;display:inline-block}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.spin{display:inline-block;animation:spin 1s linear infinite}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.voice-result{background:rgba(255,255,255,.85);border-radius:14px;padding:12px;border:1.5px solid #c8b8e8;margin-top:8px}
.voice-tag{display:inline-flex;align-items:center;gap:3px;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;background:rgba(155,127,212,.15);color:#7b5fb4;border:1.5px solid #b8a8e4}
.back-btn{background:none;border:1.5px solid #a8cce6;color:#4a8fd4;border-radius:20px;padding:6px 14px;cursor:pointer;font-family:'M PLUS Rounded 1c',sans-serif;font-size:13px;font-weight:700;margin-bottom:14px;display:inline-block}
.trip-card{background:rgba(255,255,255,.85);border-radius:18px;border:2px solid #d4c8f0;padding:16px;cursor:pointer;transition:all .2s}
.trip-card:hover{border-color:#9b7fd4;box-shadow:0 4px 18px rgba(155,127,212,.2);transform:translateY(-1px)}
.trip-badge{background:linear-gradient(135deg,#9b7fd4,#7b5fb4);color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:800;flex-shrink:0}
.travel-row{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.76);border-radius:14px;border-left:4px solid #9b7fd4;margin-bottom:8px;transition:all .18s}
.travel-row:hover{background:rgba(255,255,255,.96);box-shadow:0 2px 10px rgba(155,127,212,.12)}
.photo-placeholder{width:100%;height:120px;border:2px dashed #a8cce6;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;background:rgba(255,255,255,.6);transition:all .18s}
.photo-placeholder:hover{border-color:#4a8fd4;background:rgba(74,143,212,.05)}
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#1e4e82;color:#fff;padding:12px 24px;border-radius:50px;font-weight:700;font-size:14px;z-index:9999;box-shadow:0 6px 24px rgba(30,78,130,.34);animation:su .3s ease;font-family:'M PLUS Rounded 1c',sans-serif;white-space:nowrap}
.toast.err{background:#b44a5a}
@keyframes su{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.float{animation:float 3s ease-in-out infinite;display:inline-block}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#a8cce6;border-radius:4px}
`;
