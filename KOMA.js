
// KOMA 专用接口版 · 大号 4×4 · 三天 · 自动深浅色
const KEY='koma.widget.api.v1', TITLE='课间 · KOMA', PATH='/api/widget/v1/timetable?days=3&offset=0';
const TOKEN_RE=/^kw_[A-Za-z0-9_-]{43}$/, DEFAULT_ORIGIN='https://komadesu.com', IS_DORM=false;
const HELP='登录 KOMA → 订阅日历 → ICS 订阅 → 小组件 Token。此处填写专用 Token，不是 ICS 链接或学校密码。服务端须已更新至支持接口的版本。';
const MENU_HELP='大号 4×4 · 今天、明天、后天 · 教学周由接口提供';
const DAY=86400000,REFRESH_MINUTES=30;
function chinaDay(d=new Date()){return localDay(d);}
function midnight(s){return Date.parse(s+'T00:00:00+08:00');}
function shifted(s,n){return dayShift(s,n);}
function hm(ms){return new Date(ms+28800000).toISOString().slice(11,16);}
function expandDays(events,start,days){return events.filter(e=>e.date>=start&&e.date<shifted(start,days));}
function validateData(d){return d?.schemaVersion===1&&d.timezone==='Asia/Shanghai'&&Array.isArray(d.days)&&d.days.every(x=>/^\d{4}-\d\d-\d\d$/.test(x.date)&&Array.isArray(x.courses)&&x.courses.every(c=>['teaching','lab'].includes(c.kind)&&typeof c.name==='string'&&Number.isFinite(Date.parse(c.startAt))&&Number.isFinite(Date.parse(c.endAt))))&&typeof d.term?.firstMonday==='string'&&d.sources&&['ok','partial','unavailable'].includes(d.state);}
function render(settings,p){
  const today=chinaDay();
  if(!p.data){initColors();const w=new ListWidget();w.backgroundColor=C.paper;w.setPadding(18,18,18,18);label(w,TITLE,22,C.green,'bold');w.addSpacer(12);label(w,p.error||'尚无课表',14,C.muted,'regular',4);return w;}
  const d=p.data,expected=[today,shifted(today,1),shifted(today,2)];
  const complete=expected.every(date=>d.days.some(x=>x.date===date));
  const events=d.days.flatMap(day=>day.courses.map(c=>({uid:c.id,name:c.name,projectName:c.projectName,kind:c.kind,location:c.location||'',date:day.date,start:Date.parse(c.startAt),end:Date.parse(c.endAt),overlap:c.timeOverlap,period:c.startPeriod==null?'':String(c.startPeriod)+(c.endPeriod==null?'':'–'+c.endPeriod)})));
  const sourceTimes=Object.values(d.sources).filter(x=>x.available).map(x=>Date.parse(x.updatedAt)).filter(Number.isFinite);
  const packet={events:complete?events:[],checked:sourceTimes.length?Math.min(...sourceTimes):null,stale:p.offline||Object.values(d.sources).some(x=>['error','failed'].includes(x.syncState)),offline:p.offline,failed:d.state!=='ok'||!complete};
  const w=drawWeek({firstMonday:d.term.firstMonday,maxWeeks:d.term.maxWeeks},packet,today,{demo:p.demo,preview:!config.runsInWidget});
  if(!complete){return render(settings,{error:'缓存日期已过期，请联网刷新'});}
  return w;
}
function demoData(){
  const start=chinaDay(),p=demoPacket(start);
  return {schemaVersion:1,timezone:'Asia/Shanghai',state:'ok',term:{firstMonday:shifted(start,-((new Date(midnight(start)+28800000).getUTCDay()+6)%7)-56)},sources:{teaching:{available:true,updatedAt:new Date().toISOString(),syncState:'ok'},lab:{available:true,updatedAt:new Date().toISOString(),syncState:'ok'}},days:[0,1,2].map(n=>{const date=shifted(start,n);return {date,courses:p.events.filter(e=>e.start>=midnight(date)&&e.start<midnight(shifted(date,1))).map(e=>({id:e.uid,name:e.name,projectName:e.projectName,kind:e.kind,location:e.location,startAt:new Date(e.start).toISOString(),endAt:new Date(e.end).toISOString(),startPeriod:Number(e.period.split('–')[0]),endPeriod:Number(e.period.split('–')[1])}))};})};
}

function readSettings(){try{return JSON.parse(Keychain.get(KEY));}catch(_){return {};}}
function endpoint(origin){return origin+PATH;}
function originValue(value){
  const m=String(value||'').trim().match(/^https:\/\/([^\s/?#@]+)\/?$/i);
  if(!m)throw Error('请输入 HTTPS 站点地址，例如 https://example.com，不带接口路径');
  return 'https://'+m[1].toLowerCase();
}
function files(){const fm=FileManager.local(),dir=fm.joinPath(fm.libraryDirectory(),KEY);if(!fm.fileExists(dir))fm.createDirectory(dir,true);return {fm,dir,path:fm.joinPath(dir,'snapshot.json')};}
function clearCache(){const {fm,path}=files();if(fm.fileExists(path))fm.remove(path);}
async function configure(settings){
  const a=new Alert();a.title=TITLE+' · 连接';a.message=HELP;
  a.addTextField('HTTPS 站点地址',settings.origin||DEFAULT_ORIGIN);a.addSecureTextField('专用 Token（留空保留原值）','');a.addAction('保存');a.addCancelAction('取消');
  if(await a.presentAlert()<0)return null;
  const origin=originValue(a.textFieldValue(0)),typed=a.textFieldValue(1).trim();
  const token=typed||(origin===settings.origin?settings.token:'');
  if(!TOKEN_RE.test(token||''))throw Error('请填写服务端生成的专用 Token');
  const changed=origin!==settings.origin||token!==settings.token;
  if(changed||settings.blocked)clearCache();
  const next={...settings,origin,token,blocked:false};
  Keychain.set(KEY,JSON.stringify(next));return next;
}
async function select(){
  let settings=readSettings();if(config.runsInWidget)return {settings};
  const a=new Alert();a.title=TITLE;a.message=MENU_HELP;
  a.addAction('刷新并预览');a.addAction('配置接口与 Token');
  if(IS_DORM)a.addAction('设置圆环最大电量');
  a.addAction('示例预览');a.addCancelAction('取消');
  const c=await a.presentAlert();if(c<0)return null;
  if(c===1){settings=await configure(settings);if(!settings)return null;}
  if(IS_DORM&&c===2){
    const p=new Alert();p.title='圆环最大电量';p.message='手动填写大于 0 的度数并保存在本机，没有默认值。';p.addTextField('最大电量（度）',settings.maxKwh?String(settings.maxKwh):'');p.addAction('保存');p.addCancelAction('取消');
    if(await p.presentAlert()<0)return null;
    const maxKwh=Number(p.textFieldValue(0).trim());if(!Number.isFinite(maxKwh)||maxKwh<=0)throw Error('最大电量必须大于 0');
    settings={...settings,maxKwh};Keychain.set(KEY,JSON.stringify(settings));
  }
  return {settings,demo:c===(IS_DORM?3:2)};
}
function validNumber(n){return typeof n==='number'&&Number.isFinite(n);}
function localDay(d=new Date()){return new Date(d.getTime()+28800000).toISOString().slice(0,10);}
function widgetMetrics(){
  const s=Device.screenSize(),width=Math.min(s.width,s.height),height=Math.max(s.width,s.height);
  // iPhone widget bounds in points; preview and desktop share these dimensions.
  const sizes={568:[292,141,311],667:[321,148,324],736:[348,157,357],812:[329,155,345],844:[338,158,354],852:[338,158,354],874:[342,162,362],896:[360,169,379],926:[364,170,382],932:[364,170,382],956:[364,170,382]};
  const v=sizes[Math.round(height)];
  if(v&&width<500)return {width:v[0],mediumHeight:v[1],height:v[2]};
  const w=Math.max(280,Math.min(380,width-64));return {width:w,mediumHeight:Math.floor((w-22)/2),height:Math.floor(w*1.047)};
}
function dayShift(s,n){return localDay(new Date(Date.parse(s+'T00:00:00+08:00')+n*86400000));}
function displayTime(value){
  if(!value)return '—';
  const raw=String(value),fixed=/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?$/.test(raw)?raw.replace(' ','T')+'+08:00':raw;
  const ms=Date.parse(fixed);if(!Number.isFinite(ms))return '—';
  const s=new Date(ms+28800000).toISOString();return s.slice(5,10).replace('-','/')+' '+s.slice(11,16);
}
async function fetchPacket(settings){
  if(!settings.origin||!settings.token)return {error:'请先配置接口与 Token'};
  if(settings.blocked)return {error:'凭证失效，请重新配置 Token'};
  const {fm,path}=files();let cached;
  try{cached=JSON.parse(fm.readString(path));}catch(_){}
  try{
    const req=new Request(endpoint(settings.origin));req.timeoutInterval=15;
    req.headers={'Authorization':'Bearer '+settings.token,'Accept':'application/json'};
    req.onRedirect=next=>String(next.url||'').startsWith(settings.origin+'/')?next:null;
    const body=await req.loadString(),status=req.response?.statusCode;
    if(status===401){clearCache();Keychain.set(KEY,JSON.stringify({...settings,blocked:true}));return {error:'凭证失效，请重新配置 Token'};}
    if(status!==200){const messages={400:'接口参数或账户配置有误',404:'接口不存在，请更新服务端',421:'域名未获允许，请配置服务端'};throw Error(messages[status]||'服务暂不可用');}
    let data;try{data=JSON.parse(body);}catch(_){throw Error('接口返回格式有误');}
    if(!validateData(data))throw Error('接口版本或数据格式不兼容');
    const packet={data,savedAt:Date.now()};try{fm.writeString(path,JSON.stringify(packet));}catch(_){}
    return packet;
  }catch(e){
    // Never expose request URLs, credentials, or underlying network errors.
    const safe=['接口参数或账户配置有误','接口不存在，请更新服务端','域名未获允许，请配置服务端','接口返回格式有误','接口版本或数据格式不兼容'];
    const error=safe.includes(e.message)?e.message:'网络或服务暂不可用';
    if(cached&&validateData(cached.data))return {...cached,offline:true,error};
    return {error};
  }
}
function openSettings(){return 'scriptable:///run?scriptName='+encodeURIComponent(Script.name());}
async function main(){
  try{
    const selected=await select();if(!selected){Script.complete();return;}
    const packet=selected.demo?{data:demoData(),demo:true,savedAt:Date.now()}:await fetchPacket(selected.settings);
    const widget=render(selected.settings,packet);widget.url=openSettings();widget.refreshAfterDate=new Date(Date.now()+30*60000);
    if(config.runsInWidget)Script.setWidget(widget);else if(IS_DORM)await widget.presentMedium();else await widget.presentLarge();
  }catch(_){
    const widget=new ListWidget();widget.backgroundColor=new Color(IS_DORM?'#0D1321':'#191E1B');widget.setPadding(18,18,18,18);
    const text=widget.addText('配置未完成，请在 Scriptable 中重新运行并检查地址、专用 Token 和最大电量。');text.textColor=new Color('#CBD5E1');text.font=Font.systemFont(14);widget.url=openSettings();
    if(config.runsInWidget)Script.setWidget(widget);else{const a=new Alert();a.title='配置未完成';a.message='请检查 HTTPS 地址、专用 Token 或最大电量（必须大于 0），然后重新配置。';a.addAction('好');await a.presentAlert();}
  }
  Script.complete();
}
const C = {};
function initColors() {
  const d=(l,k)=>Color.dynamic(new Color(l),new Color(k));
  Object.assign(C,{paper:d('#F6F4ED','#191E1B'),panel:d('#FCFBF7','#232A25'),ink:d('#303A31','#E2E7DE'),muted:d('#7B8076','#A6B1A1'),green:d('#344E40','#B0C9A7'),column:d('#EEEFE5','#2C352C'),today:d('#E3E9DC','#344435'),line:d('#D9DECD','#3C493C'),lessonEdge:d('#9DAF8D','#809B76'),lab:d('#FBF6EB','#383124'),labEdge:d('#BEA476','#BEA476'),gold:d('#8B7040','#D8C29A'),alert:d('#AD5141','#ED9B87')});
}
function label(parent,value,size,color=C.ink,weight='regular',lines=1) {
  const t=parent.addText(String(value));t.textColor=color;t.font=weight==='bold'?Font.boldSystemFont(size):weight==='medium'?Font.mediumSystemFont(size):Font.systemFont(size);t.lineLimit=lines;t.minimumScaleFactor=.9;return t;
}
function rule(parent) { const s=parent.addStack();s.size=new Size(0,.5);s.backgroundColor=C.line;s.addSpacer(); }
function dimensions(){return widgetMetrics();}
function lessonName(event) {
  const clean=String(event.name||'').replace(/^\s*(?:\[实验\]|【实验】)\s*/,'').trim();
  if(event.kind!=='lab')return clean;
  if(String(event.projectName||'').trim())return String(event.projectName).trim();
  // 兼容旧订阅：例如“大学物理实验(A)II · 分光计测量三棱镜的顶角”。
  const parts=clean.split(/\s*[·•|｜]\s*|\s+[—–-]\s+/);
  return parts.length>1?parts.slice(1).join(' · ').trim():clean;
}
function drawLesson(parent,event,width,height,relaxed=false) {
  const shell=parent.addStack();shell.size=new Size(width,height);shell.cornerRadius=3;
  shell.backgroundColor=event.kind==='lab'?C.lab:C.panel;
  const stripe=shell.addStack();stripe.size=new Size(2,height);stripe.backgroundColor=event.kind==='lab'?C.labEdge:C.lessonEdge;stripe.addSpacer();
  const name=lessonName(event),longProject=event.kind==='lab'&&[...name].length>6,crowded=height<47;
  const card=shell.addStack();card.layoutVertically();
  const pad=relaxed?2:longProject?(crowded?1:2):(height<42?2:3);
  card.setPadding(pad,4,pad,3);
  const small=height<50,accent=event.kind==='lab'?C.gold:C.green;
  const time=card.addStack();time.centerAlignContent();
  const timeSize=relaxed?(height<50?7:height<56?8:8.5):longProject?(height<40?6.5:crowded?7:8.5):(height<42?7.5:small?8:10.5);
  label(time,hm(event.start)+'–'+hm(event.end),timeSize,accent,'medium');
  time.addSpacer();
  const tag=event.overlap?'重叠':event.period;
  if(tag)label(time,tag,relaxed?7.5:small?7:8.5,event.overlap?C.alert:accent);
  const nameSize=relaxed?(longProject?(height<50?9:10.5):height<50?9.5:height<58?11:12):longProject?(height<40?8:crowded?8.5:10.5):(height<42?10.5:small?11:14);
  const nameLines=relaxed?(longProject&&height>=68?3:2):longProject?2:1;
  label(card,name,nameSize,C.ink,'medium',nameLines);
  card.addSpacer();
  const locationSize=relaxed?(height<50?7:height<56?8:9):longProject?(height<40?6.5:crowded?7:8.5):(height<42?8.5:small?9:11);
  if(event.location)label(card,event.location,locationSize,C.muted,'regular',1);
}

function drawWeek(settings,packet,start,options={}) {
  initColors();const now=options.now||new Date(),today=chinaDay(now),rows=expandDays(packet.events,start,3);
  const dims=dimensions(),w=new ListWidget();w.backgroundColor=C.paper;w.setPadding(16,18,16,18);
  w.url=openSettings();
  const heading=w.addStack();heading.centerAlignContent();
  let weekText='教学周未设置';
  if(settings.firstMonday){
    const first=midnight(settings.firstMonday),a=Math.floor((midnight(start)-first)/(7*DAY))+1,b=Math.floor((midnight(shifted(start,2))-first)/(7*DAY))+1;
    weekText=a>=1&&b<=(settings.maxWeeks||53)?(a===b?'第 '+a+' 教学周':'第 '+a+'–'+b+' 周'):'学期外';
  }
  label(heading,weekText,11,C.green,'medium');heading.addSpacer();
  label(heading,start.slice(5).replace('-','/')+' — '+shifted(start,2).slice(5).replace('-','/'),10,C.muted);
  w.addSpacer(6);
  if(config.widgetFamily && config.widgetFamily!=='large' && !options.preview){label(w,'请选择大号（4×4）组件',15,C.green,'bold');w.addSpacer();return w;}
  const grid=w.addStack();grid.layoutHorizontally();
  const colWidth=(dims.width-36-2*6)/3,bodyHeight=Math.max(208,dims.height-74);
  for(let day=0;day<3;day++){
    if(day)grid.addSpacer(6);
    const date=shifted(start,day),isToday=date===today,col=grid.addStack();col.size=new Size(colWidth,bodyHeight);col.layoutVertically();col.setPadding(3,4,3,4);col.cornerRadius=5;col.backgroundColor=isToday?C.today:C.column;
    const weekday='周'+'日一二三四五六'[new Date(midnight(date)+8*3600000).getUTCDay()];
    const heading=col.addStack();heading.centerAlignContent();label(heading,(isToday?'今天 · ':'')+weekday,10,isToday?C.green:C.muted,'medium');
    heading.addSpacer();const n=label(heading,date.slice(8),17,C.green);n.font=new Font('Georgia',17);
    col.addSpacer(3);rule(col);col.addSpacer(4);
    const items=rows.filter(x=>x.date===date),innerWidth=colWidth-8;
    // 五到一门逐档增高，每档设置上限，保留列底留白。
    const maxVisible=5,more=items.length>maxVisible;
    const compactHeight=Math.min(54,(bodyHeight-34-(more?12:0))/maxVisible-3);
    const relaxed=items.length>0&&items.length<=4;
    const extra=[0,28,22,14,7],caps=[0,80,74,68,60];
    const cardHeight=relaxed?Math.min(caps[items.length],compactHeight+extra[items.length]):compactHeight;
    for(const event of items.slice(0,maxVisible)){drawLesson(col,event,innerWidth,cardHeight,relaxed);col.addSpacer(3);}
    if(more)label(col,'另有 '+(items.length-maxVisible)+' 门',9,C.green,'medium');
    if(!items.length){col.addSpacer(20);label(col,packet.failed?'尚无课表':'今日留白',10,packet.failed?C.alert:C.muted);}
    col.addSpacer();
  }
  w.addSpacer();const foot=w.addStack();
  let note=options.demo?'示例数据':packet.checked?'同步 '+displayTime(new Date(packet.checked).toISOString()):'等待同步';
  if(packet.stale)note+=' · 缓存';if(packet.failed)note+=' · 来源不全';if(packet.offline)note+=' · 离线';
  label(foot,note,8,packet.stale?C.alert:C.muted);foot.addSpacer();
  let next=now.getTime()+REFRESH_MINUTES*60000;
  const tomorrow=midnight(shifted(today,1));if(tomorrow>now.getTime())next=Math.min(next,tomorrow+1000);
  w.refreshAfterDate=new Date(next);return w;
}

function demoPacket(start) {
  const courses=[
    [['程序设计','致知楼 C302','陈老师'],['高等数学','明理楼 A201','王老师'],['大学物理实验','15号教学楼15-438','张老师','lab'],['大学英语','文心楼 B103','刘老师'],['线性代数','明理楼 B103','李老师']],
    [['大学物理','明理楼 A205','张老师'],['大学英语','文心楼 B103','刘老师'],['程序设计实验','致知楼 C302','陈老师','lab'],['体育','体育场','赵老师']],
    [['高等数学','明理楼 A201','王老师'],['大学英语','文心楼 B103','刘老师'],['程序设计','致知楼 C302','陈老师'],['线性代数','明理楼 B103','李老师'],['大学物理','明理楼 A205','张老师']]
  ];
  const times=[[8,0,9,40],[10,5,11,45],[14,0,15,40],[16,5,17,45],[19,0,20,40]];
  const events=courses.flatMap((lessons,day)=>lessons.map(([name,location,teacher,kind],i)=>{
    const [h,m,eh,em]=times[i];
    return {uid:'demo-'+day+'-'+i,name,location,teacher,projectName:kind==='lab'?(day===0?'分光计测量三棱镜的顶角':'验证动量守恒定律'):'',kind:kind||'teaching',period:(i*2+1)+'–'+(i*2+2),start:midnight(shifted(start,day))+(h*60+m)*60000,end:midnight(shifted(start,day))+(eh*60+em)*60000,rdates:[],exdates:[],rule:null};
  }));
  return {events,checked:Date.now(),stale:false};
}


await main();
