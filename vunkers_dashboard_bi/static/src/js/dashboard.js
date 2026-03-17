// ===== DECODE COMPACT RECORDS =====
const LK = DATA._lk;
const RC = DATA._rc;
// Record fields: [0:month_i, 1:amount, 2:partner_i, 3:product_i, 4:cat_i, 5:sub1_i, 6:sub2_i, 7:is_sub, 8:bu_i, 9:ba_i, 10:tipo_i, 11:acct_i]
function decRec(r){return{m:LK.months[r[0]],a:r[1],p:r[2]>=0?LK.partners[r[2]]:'',pid:r[2]>=0?LK.partner_ids[r[2]]:0,prod:r[3]>=0?LK.products[r[3]]:'',cat:LK.cats[r[4]],sub1:LK.sub1s[r[5]],sub2:LK.sub2s[r[6]],is_sub:r[7]===1,bu:LK.bus[r[8]],ba:LK.bas[r[9]],tipo:LK.tipos[r[10]],acct:LK.accts[r[11]]}}

const BU_COLORS={'Cloud':'#3b82f6','ISP':'#06b6d4','Ciberseguridad':'#ef4444','Operador':'#f59e0b','Software':'#8b5cf6','Software Verticales':'#2c5282','Networking':'#10b981','Telefonia':'#ec4899','Sistemas':'#f97316','IOT':'#14b8a6','Seguridad':'#64748b','Software Odoo':'#9333ea','(Sin asignar)':'#9ca3af'};
const PALETTE=['#1e3a5f','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316','#8b5cf6','#14b8a6','#64748b','#2b6cb0'];
const PLAN_ORDER=['Mensual','Trimestral','Semestral','Anual','Bianual','Trianual'];
const STATE_COLORS={'Activa':'#059669','Cancelada':'#dc2626','Pausada':'#d97706','Borrador':'#9ca3af','Renovada':'#3b82f6','En renovación':'#f59e0b','Sin estado':'#d1d5db'};
const VALID_BUS=LK.bus.filter(b=>b!=='(Sin asignar)');

let charts={};
let viewMode='monthly';
let F={monthFrom:'',monthTo:'',cat:'',subcat1:'',subcat2:'',product:'',acct:''};

function fmt(n){return new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+'\u20ac';}
function fmtK(n){return n>=1000000?(n/1000000).toFixed(1)+'M\u20ac':n>=1000?(n/1000).toFixed(0)+'K\u20ac':Math.round(n)+'\u20ac';}
function fmtN(n){return new Intl.NumberFormat('es-ES').format(n);}
function pctChange(p,c){if(!p)return c>0?{val:'+100%',cls:'up'}:{val:'\u2014',cls:''};const v=((c-p)/Math.abs(p)*100).toFixed(1);return{val:(v>=0?'+':'')+v+'%',cls:v>=0?'up':'down'};}
function destroyChart(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
function getCtx(id){return document.getElementById(id)?.getContext('2d');}
function mLabel(m){return new Date(m+'-01').toLocaleDateString('es-ES',{month:'short',year:'2-digit'});}
function mShort(m){return new Date(m+'-01').toLocaleDateString('es-ES',{month:'short'});}

// ===== FILTER RECORDS using compact format for speed =====
let _filteredCache=null;let _filterKey='';
function getFilteredRecords(){
  const key=JSON.stringify(F);
  if(key===_filterKey&&_filteredCache) return _filteredCache;
  _filterKey=key;
  const cat_i=F.cat?LK.cats.indexOf(F.cat):-1;
  const sub1_i=F.subcat1?LK.sub1s.indexOf(F.subcat1):-1;
  const sub2_i=F.subcat2?LK.sub2s.indexOf(F.subcat2):-1;
  const acct_i=F.acct?LK.accts.indexOf(F.acct):-1;
  _filteredCache=RC.filter(r=>{
    if(cat_i>=0&&r[4]!==cat_i) return false;
    if(sub1_i>=0&&r[5]!==sub1_i) return false;
    if(sub2_i>=0&&r[6]!==sub2_i) return false;
    if(acct_i>=0&&r[11]!==acct_i) return false;
    return true;
  });
  return _filteredCache;
}

function getMonthRecords(m){
  const mi=LK.months.indexOf(m);
  return getFilteredRecords().filter(r=>r[0]===mi);
}

function getMonthTotal(m){
  return getMonthRecords(m).reduce((a,r)=>a+r[1],0);
}

function getMonthSub(m){
  return getMonthRecords(m).filter(r=>r[7]===1).reduce((a,r)=>a+r[1],0);
}

function getMonthNonSub(m){
  return getMonthRecords(m).filter(r=>r[7]===0).reduce((a,r)=>a+r[1],0);
}

function getActiveClients(m){
  const mi=LK.months.indexOf(m);
  const pids=new Set();
  getFilteredRecords().filter(r=>r[0]===mi&&r[7]===1).forEach(r=>{if(r[2]>=0)pids.add(r[2]);});
  return pids.size;
}

// ===== GLOBAL FILTERS =====
function getMonthRange(){
  const fi=F.monthFrom?LK.months.indexOf(F.monthFrom):0;
  const ti=F.monthTo?LK.months.indexOf(F.monthTo):LK.months.length-1;
  return LK.months.slice(fi,ti+1);
}
function isZoomMode(){ return F.monthFrom||F.monthTo; }

// Determine the "current year" and "previous year" dynamically from data
function _getYears(){
  const allYears=[...new Set(DATA.months.map(m=>m.split('-')[0]))].sort();
  const currYear=allYears[allYears.length-1]||'2026';
  const prevYear=allYears.length>1?allYears[allYears.length-2]:'2025';
  return {currYear, prevYear};
}

const HIDDEN_BUS=['01 GASTOS','NETWORKING','OPERADOR','04 Finanzas','PRODUCTE GENERIC','SENSE CATEGORIA'];

function initGlobalFilters(){
  const {currYear}=_getYears();
  const mFrom=document.getElementById('gf-month-from');
  const mTo=document.getElementById('gf-month-to');
  mFrom.innerHTML='<option value="">A\u00f1o completo</option>';
  DATA.months.filter(m=>m>=currYear).forEach(m=>{
    const lbl=new Date(m+'-01').toLocaleDateString('es-ES',{month:'long'}).replace(/^./,c=>c.toUpperCase());
    mFrom.innerHTML+='<option value="'+m+'">'+lbl+'</option>';
  });
  mTo.innerHTML='<option value="">\u2014</option>';
  mTo.disabled=true;
  mFrom.value='';mTo.value='';F.monthFrom='';F.monthTo='';
  const catSel=document.getElementById('gf-cat');
  catSel.innerHTML='<option value="">BU (Todas)</option>';
  Object.keys(DATA.filter_tree).sort().filter(c=>!HIDDEN_BUS.includes(c)).forEach(c=>{catSel.innerHTML+='<option value="'+c+'">'+c+'</option>';});
  const acctSel=document.getElementById('gf-acct');
  acctSel.innerHTML='<option value="">Cuenta (Todas)</option>';
  LK.accts.forEach(a=>{acctSel.innerHTML+='<option value="'+a+'">'+a.substring(0,12)+'</option>';});

  mFrom.onchange=()=>{
    F.monthFrom=mFrom.value;
    if(!F.monthFrom){
      mTo.innerHTML='<option value="">\u2014</option>';mTo.disabled=true;
      F.monthTo='';
    } else {
      mTo.disabled=false;
      mTo.innerHTML='<option value="">\u00daltimo</option>';
      DATA.months.filter(m2=>m2>=F.monthFrom&&m2>=currYear).forEach(m2=>{
        const lbl=new Date(m2+'-01').toLocaleDateString('es-ES',{month:'long'}).replace(/^./,c=>c.toUpperCase());
        mTo.innerHTML+='<option value="'+m2+'">'+lbl+'</option>';
      });
      F.monthTo='';mTo.value='';
    }
    _filteredCache=null;updateAll();
  };
  mTo.onchange=()=>{F.monthTo=mTo.value;_filteredCache=null;updateAll();};
  document.getElementById('gf-product').onchange=()=>{F.product=document.getElementById('gf-product').value;_filteredCache=null;updateAll();};
}

function onCatChange(){
  F.cat=document.getElementById('gf-cat').value;F.subcat1='';F.subcat2='';F.product='';_filteredCache=null;
  const s1=document.getElementById('gf-subcat1'),s2=document.getElementById('gf-subcat2'),sp=document.getElementById('gf-product');
  s1.innerHTML='<option value="">Clase (Todas)</option>';s2.innerHTML='<option value="">Familia (Todos)</option>';sp.innerHTML='<option value="">Producto (Todos)</option>';
  if(F.cat&&DATA.filter_tree[F.cat]) Object.keys(DATA.filter_tree[F.cat]).sort().forEach(s=>{if(s)s1.innerHTML+='<option value="'+s+'">'+s+'</option>';});
  updateAll();
}
function onSubcat1Change(){
  F.subcat1=document.getElementById('gf-subcat1').value;F.subcat2='';F.product='';_filteredCache=null;
  const s2=document.getElementById('gf-subcat2'),sp=document.getElementById('gf-product');
  s2.innerHTML='<option value="">Familia (Todos)</option>';sp.innerHTML='<option value="">Producto (Todos)</option>';
  if(F.cat&&F.subcat1&&DATA.filter_tree[F.cat]?.[F.subcat1]) Object.keys(DATA.filter_tree[F.cat][F.subcat1]).sort().forEach(s=>{if(s)s2.innerHTML+='<option value="'+s+'">'+s+'</option>';});
  updateAll();
}
function onSubcat2Change(){
  F.subcat2=document.getElementById('gf-subcat2').value;F.product='';_filteredCache=null;
  const sp=document.getElementById('gf-product');sp.innerHTML='<option value="">Producto (Todos)</option>';
  if(F.cat&&F.subcat1&&F.subcat2&&DATA.filter_tree[F.cat]?.[F.subcat1]?.[F.subcat2]) DATA.filter_tree[F.cat][F.subcat1][F.subcat2].forEach(p=>{sp.innerHTML+='<option value="'+p+'">'+p.substring(0,60)+'</option>';});
  updateAll();
}
function onFilterChange(){
  F.acct=document.getElementById('gf-acct').value;
  _filteredCache=null;updateAll();
}
function setMode(mode){viewMode=mode;document.getElementById('mode-monthly').classList.toggle('active',mode==='monthly');document.getElementById('mode-ytd').classList.toggle('active',mode==='ytd');updateAll();}
function resetAllFilters(){
  document.getElementById('gf-month-from').value='';
  const mTo=document.getElementById('gf-month-to');mTo.innerHTML='<option value="">\u2014</option>';mTo.disabled=true;mTo.value='';
  document.getElementById('gf-cat').value='';
  document.getElementById('gf-acct').value='';
  F={monthFrom:'',monthTo:'',cat:'',subcat1:'',subcat2:'',product:'',acct:''};
  viewMode='monthly';_filteredCache=null;
  document.getElementById('mode-monthly').classList.add('active');document.getElementById('mode-ytd').classList.remove('active');
  onCatChange();
}

// ===== TAB NAV =====
document.querySelectorAll('.nav-tab').forEach(tab=>{tab.addEventListener('click',()=>{
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  tab.classList.add('active');document.getElementById('tab-'+tab.dataset.tab).classList.add('active');
  setTimeout(()=>Object.values(charts).forEach(c=>c&&c.resize&&c.resize()),100);
});});

// ===== TAB 1: RESUMEN SUSCRIPCIONES =====
const BU_CARD_COLORS={'TOTAL':'#0f2942',
  '01 CIBERSEGURETAT':'#ef4444','02 CLOUD':'#3b82f6','03 IOT':'#14b8a6','04 ISP':'#06b6d4',
  '05 NETWORKING':'#10b981','06 OPERADOR':'#f59e0b','07 SEGURIDAD FISICA':'#64748b',
  '08 SISTEMES':'#f97316','09 SOFTWARE':'#8b5cf6','10 TELEFONIA':'#ec4899'
};
function cleanBU(bu){return bu.replace(/^\d+\s+/,'');}

function buildDynamicBUCards(){
  const recs=getFilteredRecords();
  const buList=DATA.bu_list.filter(b=>!HIDDEN_BUS.includes(b));
  const cards={};
  const GASTOS_CAT_IDX=LK.cats.indexOf('01 GASTOS');

  buList.forEach(bu=>{
    const ci=LK.cats.indexOf(bu);
    const buRecs=bu==='TOTAL'?recs.filter(r=>r[4]!==GASTOS_CAT_IDX):recs.filter(r=>r[4]===ci);

    const monthly_mrr={};
    DATA.months.forEach(m=>{
      const mi=LK.months.indexOf(m);
      monthly_mrr[m]=buRecs.filter(r=>r[0]===mi&&r[7]===1).reduce((a,r)=>a+r[1],0);
    });

    const rangeMonths=getMonthRange();
    const lastMonthInRange=rangeMonths[rangeMonths.length-1];
    const prevMonthIdx=DATA.months.indexOf(lastMonthInRange)-1;
    const prevMonth=prevMonthIdx>=0?DATA.months[prevMonthIdx]:null;
    const selY=parseInt(lastMonthInRange.split('-')[0]);const selM=lastMonthInRange.split('-')[1];
    const prevYearMonth=(selY-1)+'-'+selM;

    const mrrRange=rangeMonths.reduce((a,m)=>a+(monthly_mrr[m]||0),0);
    const mrr_td=rangeMonths.length===1?mrrRange:mrrRange/rangeMonths.length;
    const mrr_prev=prevMonth?monthly_mrr[prevMonth]||0:0;
    const mrr_prev_year=monthly_mrr[prevYearMonth]||0;
    const arr=mrr_td*12;

    const origCard=DATA.bu_cards[bu]||{};

    const rangeIdxs=new Set(rangeMonths.map(m=>LK.months.indexOf(m)));
    const periodRecs=buRecs.filter(r=>rangeIdxs.has(r[0]));
    const tipo_servicio={};
    const tipo_prods={};
    periodRecs.filter(r=>r[7]===1).forEach(r=>{
      const t=LK.tipos[r[10]]||'Otro';
      if(!tipo_prods[t])tipo_prods[t]=new Set();
      tipo_prods[t].add(r[3]);
    });
    Object.entries(tipo_prods).forEach(([t,s])=>{tipo_servicio[t]=s.size;});

    cards[bu]={monthly_mrr,mrr_td,mrr_prev,mrr_prev_year,arr,
      subs_state:origCard.subs_state||{},subs_plan:origCard.subs_plan||{},
      tipo_servicio};
  });
  return cards;
}

function renderBUCards(){
  const grid=document.getElementById('bu-cards-grid');if(!grid)return;
  const buList=DATA.bu_list.filter(b=>!HIDDEN_BUS.includes(b));
  if(!buList){grid.innerHTML='<p>No hay datos</p>';return;}
  Object.keys(charts).forEach(k=>{if(k.startsWith('bu-'))destroyChart(k);});

  const cards=buildDynamicBUCards();
  const {currYear, prevYear}=_getYears();

  let h='';
  buList.forEach(bu=>{
    const c=cards[bu];if(!c)return;
    const color=BU_CARD_COLORS[bu]||'#1e3a5f';
    const isTotal=bu==='TOTAL';
    const BU_ICONS={'01 CIBERSEGURETAT':'\u{1F6E1}\uFE0F','02 CLOUD':'\u2601\uFE0F','03 IOT':'\u{1F4E1}','04 ISP':'\u{1F310}','05 NETWORKING':'\u{1F5A7}','06 OPERADOR':'\u{1F4DE}','07 SEGURIDAD FISICA':'\u{1F4F7}','08 SISTEMES':'\u{1F5A5}\uFE0F','09 SOFTWARE':'\u{1F4BB}','10 TELEFONIA':'\u{1F4F1}'};
    const buIcon=isTotal?'<img src="https://www.vunkers.com/wp-content/themes/vunkers/assets/img/logov.png" style="height:22px;vertical-align:middle;margin-right:6px">':(BU_ICONS[bu]?'<span style="margin-right:6px">'+BU_ICONS[bu]+'</span>':'');
    const displayName=isTotal?'TOTAL':bu;
    const uid=bu.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
    const totalActive=(c.subs_state['Activa']||0)+(c.subs_state['En renovaci\u00f3n']||0)+(c.subs_state['Renovada']||0);

    const mrrVar=c.mrr_prev?((c.mrr_td-c.mrr_prev)/Math.abs(c.mrr_prev)*100).toFixed(1):0;
    const mrrCls=mrrVar>=0?'up':'down';const mrrSign=mrrVar>=0?'+':'';
    const arrVar=c.mrr_prev_year?((c.mrr_td-c.mrr_prev_year)/Math.abs(c.mrr_prev_year)*100).toFixed(1):0;
    const arrCls=arrVar>=0?'up':'down';const arrSign=arrVar>=0?'+':'';

    // ARR Proyectado
    const allMM_kpi=['01','02','03','04','05','06','07','08','09','10','11','12'];
    const d26_kpi=allMM_kpi.map(mm=>c.monthly_mrr[currYear+'-'+mm]||0);
    const d25_kpi=allMM_kpi.map(mm=>c.monthly_mrr[prevYear+'-'+mm]||0);
    let liKpi=-1;for(let i=11;i>=0;i--){if(d26_kpi[i]>0){liKpi=i;break;}}
    const nowKpi=new Date();const curMKpi=nowKpi.getMonth();
    let lcKpi=liKpi;
    if(nowKpi.getFullYear()===parseInt(currYear)&&liKpi===curMKpi&&nowKpi.getDate()<28)lcKpi=liKpi-1;
    let sC=0,nC=0;for(let i=0;i<=Math.max(lcKpi,0);i++){if(d26_kpi[i]>0){sC+=d26_kpi[i];nC++;}}
    const avgK=nC>0?sC/nC:0;
    const arrProy=d26_kpi.reduce((s,v,i)=>s+(i<=liKpi?v:avgK),0);
    const cum25Total=d25_kpi.reduce((s,v)=>s+v,0);
    const arrProyVar=cum25Total?((arrProy-cum25Total)/Math.abs(cum25Total)*100).toFixed(1):0;
    const arrProyCls=arrProyVar>=0?'up':'down';const arrProySign=arrProyVar>=0?'+':'';

    const tipos=Object.entries(c.tipo_servicio||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);

    h+=`<div class="bu-card${isTotal?' bu-card-total':''}" style="--bu-color:${color}">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:#1e3a5f"></div>
      <div class="bu-card-header">
        <div class="bu-card-title">${buIcon}${displayName}</div>
        <div class="bu-card-badge">${totalActive} activas</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
        <div>
          <div class="bu-section-title">N\u00ba Suscripciones</div>
          <table class="bu-mini-table">
            <tr><td>Activas</td><td class="val" style="color:#059669">${c.subs_state['Activa']||0}</td></tr>
            <tr><td>Renovaci\u00f3n</td><td class="val" style="color:#d97706">${c.subs_state['En renovaci\u00f3n']||0}</td></tr>
            <tr><td>Renovada</td><td class="val" style="color:#3b82f6">${c.subs_state['Renovada']||0}</td></tr>
            <tr style="border-top:1px solid #cbd5e1"><td><b>Total</b></td><td class="val" style="font-weight:700">${(c.subs_state['Activa']||0)+(c.subs_state['En renovaci\u00f3n']||0)+(c.subs_state['Renovada']||0)}</td></tr>
          </table>
        </div>
        <div>
          <div class="bu-section-title">N\u00ba por Plan Recurrente</div>
          <table class="bu-mini-table">
            <tr><td>Mensual</td><td class="val">${c.subs_plan['Mensual']||0}</td></tr>
            <tr><td>Trimestral</td><td class="val">${c.subs_plan['Trimestral']||0}</td></tr>
            <tr><td>Anual</td><td class="val">${c.subs_plan['Anual']||0}</td></tr>
            <tr><td>Bianual</td><td class="val">${c.subs_plan['Bianual']||0}</td></tr>
            <tr><td>Trianual</td><td class="val">${c.subs_plan['Trianual']||0}</td></tr>
            <tr style="border-top:1px solid #cbd5e1"><td><b>Total</b></td><td class="val" style="font-weight:700">${(c.subs_plan['Mensual']||0)+(c.subs_plan['Trimestral']||0)+(c.subs_plan['Anual']||0)+(c.subs_plan['Bianual']||0)+(c.subs_plan['Trianual']||0)}</td></tr>
          </table>
        </div>
        <div>
          <div class="bu-section-title">N\u00ba Productos Recurrentes</div>
          <table class="bu-mini-table">
            ${tipos.map(([t,v])=>'<tr><td>'+t+'</td><td class="val" style="color:#059669">'+v+'</td></tr>').join('')}
            <tr style="border-top:1px solid #cbd5e1"><td><b>Total</b></td><td class="val" style="font-weight:700;color:#059669">${tipos.reduce((a,[,v])=>a+v,0)}</td></tr>
          </table>
        </div>
      </div>

      <div class="bu-section-title">Ingresos Recurrentes</div>
      <div class="bu-chart-row">
        <div class="bu-chart-left">
          <div class="bu-kpi-box">
            <div class="bu-kpi-label">MRR</div>
            <div class="bu-kpi-value">${fmtK(c.mrr_td)}</div>
            <div class="bu-kpi-change ${mrrCls}">${mrrSign}${mrrVar}% mes ant.</div>
          </div>
          <div class="bu-kpi-box">
            <div class="bu-kpi-label">ARR Proyectado vs ${prevYear}</div>
            <div class="bu-kpi-value" style="color:#059669">${fmtK(arrProy)} <span style="font-size:0.6em;color:#64748b">/ ${fmtK(cum25Total)}</span></div>
            <div class="bu-kpi-change ${arrProyCls}">${arrProySign}${arrProyVar}%</div>
          </div>
          <div class="bu-kpi-box">
            <div class="bu-kpi-label">ARR</div>
            <div class="bu-kpi-value">${fmtK(c.arr)}</div>
            <div class="bu-kpi-change ${arrCls}">${arrSign}${arrVar}% a\u00f1o ant.</div>
          </div>
        </div>
        <div class="bu-chart-right-tall"><canvas id="bu-mrr-${uid}"></canvas></div>
      </div>
      <div style="margin-top:6px;padding:4px 6px;background:#f8fafc;border-radius:4px;border:1px solid #e2e8f0">
        <div style="font-size:7.5px;color:#64748b;line-height:1.4">
          <b>MRR</b>: Facturaci\u00f3n Recurrente \u00faltimo mes &nbsp;|&nbsp;
          <b>ARR Proyectado</b>: Suma Enero a ${new Date().toLocaleDateString('es-ES',{month:'long'}).replace(/^./,c=>c.toUpperCase())}, proyecta ${new Date(new Date().getFullYear(),new Date().getMonth()+1,1).toLocaleDateString('es-ES',{month:'long'}).replace(/^./,c=>c.toUpperCase())} a Diciembre aplicando la media meses completos &nbsp;|&nbsp;
          <b>ARR</b>: MRR proyectado a 12 meses
        </div>
      </div>
    </div>`;
  });

  grid.innerHTML=h;

  // Render MRR evolution charts
  const zoom=isZoomMode();
  const rangeM=getMonthRange();
  buList.forEach(bu=>{
    const c=cards[bu];if(!c)return;
    const uid=bu.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
    const mrrCtx=getCtx('bu-mrr-'+uid);
    if(mrrCtx){
      const isTotalCard=bu==='TOTAL';

      if(zoom){
        const c25z='#94a3b8',c26z='#341c7c';
        const mmInRange=rangeM.map(m=>m.split('-')[1]);
        const labels=mmInRange.map(mm=>new Date(currYear+'-'+mm+'-01').toLocaleDateString('es-ES',{month:'short'}));
        const data2026z=mmInRange.map(mm=>c.monthly_mrr[currYear+'-'+mm]||0);
        const data2025z=mmInRange.map(mm=>c.monthly_mrr[prevYear+'-'+mm]||0);
        let datasets=[];
        if(isTotalCard){
          datasets.push({type:'line',label:'MRR '+prevYear,data:data2025z,borderColor:c25z,borderWidth:2.5,pointRadius:2,pointBackgroundColor:c25z,tension:0.3,fill:false,borderDash:[3,3],order:4});
          datasets.push({type:'line',label:'MRR '+currYear,data:data2026z,borderColor:c26z,borderWidth:2.5,pointRadius:3,pointBackgroundColor:c26z,tension:0.3,fill:false,order:3});
        } else {
          datasets.push({type:'bar',label:'MRR '+prevYear,data:data2025z,backgroundColor:c25z+'50',borderColor:c25z+'80',borderWidth:1,borderRadius:3,maxBarThickness:18,order:4});
          datasets.push({type:'bar',label:'MRR '+currYear,data:data2026z,backgroundColor:c26z,borderColor:'#2a1563',borderWidth:1,borderRadius:3,maxBarThickness:18,order:3});
        }
        let ac25=0;const cum2025z=data2025z.map(v=>{ac25+=v;return ac25;});
        let ac26=0;const cum2026z=data2026z.map(v=>{ac26+=v;return ac26;});
        datasets.push({type:'line',label:'Acum. '+prevYear,data:cum2025z,borderColor:c25z,borderWidth:2,pointRadius:2,pointBackgroundColor:c25z,tension:0.3,fill:false,order:1,yAxisID:'y1'});
        datasets.push({type:'line',label:'Acum. '+currYear,data:cum2026z,borderColor:'#341c7c',borderWidth:3,pointRadius:3,pointBackgroundColor:'#341c7c',tension:0.3,fill:false,order:1,yAxisID:'y1'});
        charts['bu-mrr-'+uid]=new Chart(mrrCtx,{type:isTotalCard?'line':'bar',data:{labels,datasets},
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'top',labels:{font:{size:7},boxWidth:10,padding:6}},datalabels:{display:false}},scales:{x:{ticks:{font:{size:8}},grid:{display:false}},y:{display:false,beginAtZero:true},y1:{display:false,beginAtZero:true,position:'right'}}}
        });
      } else {
        const allMM=['01','02','03','04','05','06','07','08','09','10','11','12'];
        const labels=allMM.map(m=>new Date(currYear+'-'+m+'-01').toLocaleDateString('es-ES',{month:'short'}));
        const data2025=allMM.map(mm=>c.monthly_mrr[prevYear+'-'+mm]||0);
        const data2026real=allMM.map(mm=>c.monthly_mrr[currYear+'-'+mm]||0);
        let lastRealIdx=-1;
        for(let i=11;i>=0;i--){if(data2026real[i]>0){lastRealIdx=i;break;}}
        const now=new Date();const curMonth=now.getMonth();const curYearNum=now.getFullYear();
        let lastCompleteIdx=lastRealIdx;
        if(curYearNum===parseInt(currYear)&&lastRealIdx===curMonth&&now.getDate()<28) lastCompleteIdx=lastRealIdx-1;
        let sumComplete=0,countComplete=0;
        for(let i=0;i<=Math.max(lastCompleteIdx,0);i++){if(data2026real[i]>0){sumComplete+=data2026real[i];countComplete++;}}
        const avgMRR=countComplete>0?sumComplete/countComplete:0;
        const data2026proj=allMM.map((_mm,i)=>i<=lastRealIdx?data2026real[i]:avgMRR);
        let acc=0;const cum2026=data2026proj.map(v=>{acc+=v;return acc;});
        const cum2026real=cum2026.map((v,i)=>i<=lastRealIdx?v:null);
        const cum2026proj=cum2026.map((v,i)=>i>=lastRealIdx?v:null);
        const has2026=lastRealIdx>=0;
        let acc2025=0;const cum2025=data2025.map(v=>{acc2025+=v;return acc2025;});
        const data2026bars=allMM.map(mm=>c.monthly_mrr[currYear+'-'+mm]||0);
        const c25='#94a3b8',c26='#059669';
        const datasets=isTotalCard?[
          {type:'line',label:'MRR '+prevYear,data:data2025,borderColor:c25,borderWidth:2.5,pointRadius:2,pointBackgroundColor:c25,tension:0.3,fill:false,borderDash:[3,3],order:4},
          {type:'line',label:'MRR '+currYear,data:data2026bars.map(v=>v||null),borderColor:'#341c7c',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#341c7c',tension:0.3,fill:false,spanGaps:false,order:3},
          {type:'line',label:'Acum. '+prevYear,data:cum2025,borderColor:c25+'90',borderWidth:2,pointRadius:2,pointBackgroundColor:c25+'90',tension:0.3,fill:false,order:1,yAxisID:'y1'}
        ]:[
          {type:'bar',label:'MRR '+prevYear,data:data2025,backgroundColor:c25+'50',borderColor:c25+'80',borderWidth:1,borderRadius:3,maxBarThickness:12,order:4},
          {type:'bar',label:'MRR '+currYear,data:data2026bars,backgroundColor:'#341c7c',borderColor:'#2a1563',borderWidth:1,borderRadius:3,maxBarThickness:12,order:3},
          {type:'line',label:'Acum. '+prevYear,data:cum2025,borderColor:c25,borderWidth:2,pointRadius:2,pointBackgroundColor:c25,tension:0.3,fill:false,order:1,yAxisID:'y1'}
        ];
        if(has2026){
          datasets.push({type:'line',label:'Acum. '+currYear+' (real)',data:cum2026real,borderColor:'#341c7c',borderWidth:3,pointRadius:3,pointBackgroundColor:'#341c7c',tension:0.3,spanGaps:false,fill:false,order:1,yAxisID:'y1'});
          datasets.push({type:'line',label:'Proyecci\u00f3n '+currYear,data:cum2026proj,borderColor:c26,borderWidth:2,pointRadius:2,pointBackgroundColor:c26,borderDash:[5,4],tension:0.3,spanGaps:false,fill:false,order:2,yAxisID:'y1'});
        }
        charts['bu-mrr-'+uid]=new Chart(mrrCtx,{type:isTotalCard?'line':'bar',data:{labels,datasets},
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:has2026,position:'top',labels:{font:{size:7},boxWidth:10,padding:6}},datalabels:{display:false}},scales:{x:{ticks:{font:{size:8}},grid:{display:false}},y:{display:false,beginAtZero:true},y1:{display:false,beginAtZero:true,position:'right'}}}
        });
      }
    }
  });
}

function updateKPIs(){ renderBUCards(); }
function renderSubsBuPlanTable(){}
function renderSubsBuStateTable(){}

// ===== TAB 2: EVOLUCION =====
function renderTipoKPIs(){
  const grid=document.getElementById('tipo-kpis-grid');if(!grid)return;
  const {currYear, prevYear}=_getYears();
  const tipoIcons={'Producto':'\u{1F4E6}','Servicios Profesionales':'\u{1F6E0}\uFE0F','Software':'\u{1F4BB}','WH Hardware':'\u{1F5A5}\uFE0F'};
  const tipoColors={'Producto':'#1e3a5f','Servicios Profesionales':'#3b82f6','Software':'#10b981','WH Hardware':'#f59e0b'};
  const tipos=['Producto','Servicios Profesionales','Software','WH Hardware'];
  const recs=getFilteredRecords();
  const GASTOS_K=LK.cats.indexOf('01 GASTOS');
  const recsK=recs.filter(r=>r[4]!==GASTOS_K);
  const rangeMonths=getMonthRange();
  const rangeMMs=rangeMonths.map(m=>m.split('-')[1]);
  let h='';
  tipos.forEach(t=>{
    const ti=LK.tipos.indexOf(t);
    const f26=rangeMMs.reduce((a,mm)=>{const mi=LK.months.indexOf(currYear+'-'+mm);return a+(mi>=0?recsK.filter(r=>r[0]===mi&&r[10]===ti).reduce((s,r)=>s+r[1],0):0);},0);
    const f25=rangeMMs.reduce((a,mm)=>{const mi=LK.months.indexOf(prevYear+'-'+mm);return a+(mi>=0?recsK.filter(r=>r[0]===mi&&r[10]===ti).reduce((s,r)=>s+r[1],0):0);},0);
    const lastMM=rangeMMs[rangeMMs.length-1];
    const miLast=LK.months.indexOf(currYear+'-'+lastMM);
    const mrr26=miLast>=0?recsK.filter(r=>r[0]===miLast&&r[10]===ti).reduce((a,r)=>a+r[1],0):0;
    const miLast25=LK.months.indexOf(prevYear+'-'+lastMM);
    const mrr25=miLast25>=0?recsK.filter(r=>r[0]===miLast25&&r[10]===ti).reduce((a,r)=>a+r[1],0):0;
    const varAcum=f25?((f26-f25)/Math.abs(f25)*100).toFixed(1):0;
    const varMRR=mrr25?((mrr26-mrr25)/Math.abs(mrr25)*100).toFixed(1):0;
    const clsAcum=varAcum>=0?'up':'down';
    const clsMRR=varMRR>=0?'up':'down';
    const signA=varAcum>=0?'+':'';
    const signM=varMRR>=0?'+':'';
    const color=tipoColors[t]||'#6b7280';
    const icon=tipoIcons[t]||'\u{1F4CA}';
    h+=`<div style="background:#fff;border-radius:10px;padding:14px 16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);border-top:3px solid ${color}">
      <div style="font-size:14px;font-weight:800;color:#1a1a2e;margin-bottom:10px">${icon} ${t}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:10px;color:#6b7280">Acumulado ${currYear}</div>
          <div style="font-size:16px;font-weight:700;color:${color}">${fmtK(f26)}</div>
          <div style="font-size:10px;color:#94a3b8">${prevYear}: ${fmtK(f25)}</div>
          <span class="kpi-change ${clsAcum}" style="font-size:11px">${signA}${varAcum}%</span>
        </div>
        <div>
          <div style="font-size:10px;color:#6b7280">MRR \u00faltimo mes</div>
          <div style="font-size:16px;font-weight:700;color:${color}">${fmtK(mrr26)}</div>
          <div style="font-size:10px;color:#94a3b8">${prevYear}: ${fmtK(mrr25)}</div>
          <span class="kpi-change ${clsMRR}" style="font-size:11px">${signM}${varMRR}%</span>
        </div>
      </div>
    </div>`;
  });
  grid.innerHTML=h;
}

function updateEvolution(){
  renderTipoKPIs();
  const {currYear, prevYear}=_getYears();
  destroyChart('evo-hist');const ctx1=getCtx('chart-evo-hist');
  if(ctx1){
    const allMMe=['01','02','03','04','05','06','07','08','09','10','11','12'];
    const labelsE=allMMe.map(m=>new Date(currYear+'-'+m+'-01').toLocaleDateString('es-ES',{month:'short'}));
    const recs=getFilteredRecords();
    const GASTOS_IDX=LK.cats.indexOf('01 GASTOS');
    const recsNoGastos=recs.filter(r=>r[4]!==GASTOS_IDX);
    const c25e='#94a3b8',c25eNR='#cbd5e1';
    const d25rec=allMMe.map(mm=>{const mi=LK.months.indexOf(prevYear+'-'+mm);return mi>=0?recsNoGastos.filter(r=>r[0]===mi&&r[7]===1).reduce((a,r)=>a+r[1],0):0;});
    const d25nr=allMMe.map(mm=>{const mi=LK.months.indexOf(prevYear+'-'+mm);return mi>=0?recsNoGastos.filter(r=>r[0]===mi&&r[7]===0).reduce((a,r)=>a+r[1],0):0;});
    const d26rec=allMMe.map(mm=>{const mi=LK.months.indexOf(currYear+'-'+mm);return mi>=0?recsNoGastos.filter(r=>r[0]===mi&&r[7]===1).reduce((a,r)=>a+r[1],0):0;});
    const d26nr=allMMe.map(mm=>{const mi=LK.months.indexOf(currYear+'-'+mm);return mi>=0?recsNoGastos.filter(r=>r[0]===mi&&r[7]===0).reduce((a,r)=>a+r[1],0):0;});
    const varRec=d26rec.map((v,i)=>(!v||!d25rec[i])?null:(((v-d25rec[i])/Math.abs(d25rec[i]))*100));
    const varNR=d26nr.map((v,i)=>(!v||!d25nr[i])?null:(((v-d25nr[i])/Math.abs(d25nr[i]))*100));
    const dlOpts=(refs)=>({anchor:'end',align:'top',font:{size:9,weight:700},formatter:(v,ctx)=>{const pct=refs[ctx.dataIndex];if(pct===null||!v)return '';return (pct>=0?'+':'')+pct.toFixed(1)+'%';},color:(ctx)=>{const pct=refs[ctx.dataIndex];if(pct===null)return 'transparent';return pct>=0?'#059669':'#dc2626';}});
    const datasetsE=[
      {type:'bar',label:'Recurrente '+prevYear,data:d25rec,backgroundColor:c25e+'70',borderColor:c25e,borderWidth:1,borderRadius:3,maxBarThickness:14,order:5,datalabels:{display:false}},
      {type:'bar',label:'Recurrente '+currYear,data:d26rec,backgroundColor:'#341c7c',borderColor:'#2a1563',borderWidth:1,borderRadius:3,maxBarThickness:14,order:4,datalabels:dlOpts(varRec)},
      {type:'bar',label:'No Recurrente '+prevYear,data:d25nr,backgroundColor:c25eNR+'70',borderColor:c25eNR,borderWidth:1,borderRadius:3,maxBarThickness:14,order:3,datalabels:{display:false}},
      {type:'bar',label:'No Recurrente '+currYear,data:d26nr,backgroundColor:'#7c6bc4',borderColor:'#6a5aad',borderWidth:1,borderRadius:3,maxBarThickness:14,order:2,datalabels:dlOpts(varNR)},
      {type:'line',label:'Tend. Rec. '+prevYear,data:d25rec,borderColor:c25e,borderWidth:2,pointRadius:0,tension:0.3,fill:false,borderDash:[3,3],order:1,datalabels:{display:false}},
      {type:'line',label:'Tend. Rec. '+currYear,data:d26rec.map(v=>v||null),borderColor:'#341c7c',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#341c7c',tension:0.3,fill:false,spanGaps:false,order:0,datalabels:{display:false}}
    ];
    charts['evo-hist']=new Chart(ctx1,{type:'bar',data:{labels:labelsE,datasets:datasetsE},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'top',labels:{font:{size:10},boxWidth:10,padding:6}}},scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>fmtK(v)}}}}});
  }

  // Tipo evolution chart
  destroyChart('tipo-evo');const ctx3=getCtx('chart-tipo-evo');
  if(ctx3){
    const tipoColors={'Producto':'#1e3a5f','Servicios Profesionales':'#3b82f6','Software':'#10b981','WH Hardware':'#f59e0b'};
    const tipoColors25={'Producto':'#94a3b8','Servicios Profesionales':'#93c5fd','Software':'#6ee7b7','WH Hardware':'#fcd34d'};
    const tipos=['Producto','Servicios Profesionales','Software','WH Hardware'];
    const allMMt=['01','02','03','04','05','06','07','08','09','10','11','12'];
    const labelsTipo=allMMt.map(m=>new Date(currYear+'-'+m+'-01').toLocaleDateString('es-ES',{month:'short'}));
    const recsT=getFilteredRecords();
    const GASTOS_T=LK.cats.indexOf('01 GASTOS');
    const recsNoGT=recsT.filter(r=>r[4]!==GASTOS_T);
    const datasetsTipo=[];
    tipos.forEach(t=>{
      const ti=LK.tipos.indexOf(t);
      const d25t=allMMt.map(mm=>{const mi=LK.months.indexOf(prevYear+'-'+mm);return mi>=0?recsNoGT.filter(r=>r[0]===mi&&r[10]===ti).reduce((a,r)=>a+r[1],0):0;});
      const d26t=allMMt.map(mm=>{const mi=LK.months.indexOf(currYear+'-'+mm);return mi>=0?recsNoGT.filter(r=>r[0]===mi&&r[10]===ti).reduce((a,r)=>a+r[1],0):0;});
      const varT=d26t.map((v,i)=>(!v||!d25t[i])?null:(((v-d25t[i])/Math.abs(d25t[i]))*100));
      const dlT={anchor:'end',align:'top',font:{size:8,weight:700},formatter:(v,ctx)=>{const pct=varT[ctx.dataIndex];if(pct===null||!v)return '';return (pct>=0?'+':'')+pct.toFixed(0)+'%';},color:(ctx)=>{const pct=varT[ctx.dataIndex];return pct===null?'transparent':pct>=0?'#059669':'#dc2626';}};
      datasetsTipo.push({type:'bar',label:t+' '+prevYear.slice(2),data:d25t,backgroundColor:(tipoColors25[t]||'#d1d5db')+'90',borderColor:tipoColors25[t]||'#d1d5db',borderWidth:1,borderRadius:2,maxBarThickness:10,order:3,datalabels:{display:false}});
      datasetsTipo.push({type:'bar',label:t+' '+currYear.slice(2),data:d26t,backgroundColor:tipoColors[t]||'#6b7280',borderColor:tipoColors[t]||'#6b7280',borderWidth:1,borderRadius:2,maxBarThickness:10,order:2,datalabels:dlT});
    });
    charts['tipo-evo']=new Chart(ctx3,{type:'bar',data:{labels:labelsTipo,datasets:datasetsTipo},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'top',labels:{font:{size:9},boxWidth:8,padding:5}}},scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>fmtK(v)}}}}});
  }
}

// ===== TAB 3: EXPLORADOR =====
function filterClients(){
  const search=document.getElementById('client-search').value.toLowerCase();
  let clients=DATA.client_directory;
  if(search) clients=clients.filter(c=>c.name.toLowerCase().includes(search));
  document.getElementById('client-list').innerHTML=clients.slice(0,50).map(c=>{
    const buTags=c.bus.slice(0,4).map(b=>'<span class="bu-tag" style="background:'+(BU_COLORS[b.name]||'#1e3a5f')+'20;color:'+(BU_COLORS[b.name]||'#1e3a5f')+'">'+b.name+'</span>').join('');
    const prods=c.products.slice(0,3).map(p=>'<div style="font-size:11px;color:#6b7280;margin-top:2px">\u2022 '+p.name.substring(0,55)+' \u2014 '+fmtK(p.amount)+'</div>').join('');
    return '<div class="client-card"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div class="client-name">'+c.name.substring(0,60)+'</div><div class="client-bus">'+buTags+'</div></div><div class="client-amount">'+fmtK(c.total)+'</div></div>'+prods+'</div>';
  }).join('');
}

// ===== TAB 4: DIRECTORIO =====
function updateDirectory(){
  const tbody=document.getElementById('client-table-body');
  const ms=DATA.months,lastM=ms[ms.length-2],prevM=ms.length>=3?ms[ms.length-3]:lastM;
  let clients=DATA.client_directory;
  tbody.innerHTML=clients.slice(0,200).map((c,i)=>{
    const lv=c.monthly[lastM]||0,pv=c.monthly[prevM]||0;const ch=pctChange(pv,lv);
    return '<tr><td>'+(i+1)+'</td><td>'+c.name.substring(0,55)+'</td><td><span class="bu-tag">'+(c.bus[0]?.name||'-')+'</span></td><td class="right">'+fmt(c.total)+'</td><td class="right">'+fmt(lv)+'</td><td class="right"><span class="kpi-change '+ch.cls+'" style="display:inline">'+ch.val+'</span></td></tr>';
  }).join('');
}

// ===== TAB 5: RANKING =====
function updateRanking(){
  destroyChart('top-clients');const ctx1=getCtx('chart-top-clients');
  if(ctx1){
    let clients=DATA.top_clients;
    const top=clients.slice(0,15);
    charts['top-clients']=new Chart(ctx1,{type:'bar',data:{labels:top.map(c=>c.name.substring(0,30)),datasets:[{data:top.map(c=>c.total),backgroundColor:PALETTE.concat(PALETTE).slice(0,15),borderRadius:6}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},datalabels:{anchor:'end',align:'right',font:{size:9,weight:700},formatter:v=>fmtK(v),color:'#6b7280'}},scales:{x:{ticks:{callback:v=>fmtK(v)}}}}});
  }
  destroyChart('top-cats');const ctx2=getCtx('chart-top-cats');
  if(ctx2){
    const top=DATA.top_categories.slice(0,15);
    charts['top-cats']=new Chart(ctx2,{type:'bar',data:{labels:top.map(c=>c.name.split('/').pop()?.trim()?.substring(0,30)),datasets:[{data:top.map(c=>c.total),backgroundColor:PALETTE.concat(PALETTE).slice(0,15),borderRadius:6}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},datalabels:{anchor:'end',align:'right',font:{size:9,weight:700},formatter:v=>fmtK(v),color:'#6b7280'}},scales:{x:{ticks:{callback:v=>fmtK(v)}}}}});
  }
  const trend=DATA.product_trend||[];
  const up=trend.filter(p=>p.diff>0).sort((a,b)=>b.diff-a.diff).slice(0,10);
  const down=trend.filter(p=>p.diff<0).sort((a,b)=>a.diff-b.diff).slice(0,10);
  document.querySelector('#prods-up-table tbody').innerHTML=up.map(p=>'<tr><td>'+p.name.substring(0,40)+'</td><td class="right">'+fmt(p.prev)+'</td><td class="right">'+fmt(p.curr)+'</td><td class="right"><span class="kpi-change up" style="display:inline">+'+fmt(p.diff)+'</span></td></tr>').join('');
  document.querySelector('#prods-down-table tbody').innerHTML=down.map(p=>'<tr><td>'+p.name.substring(0,40)+'</td><td class="right">'+fmt(p.prev)+'</td><td class="right">'+fmt(p.curr)+'</td><td class="right"><span class="kpi-change down" style="display:inline">'+fmt(p.diff)+'</span></td></tr>').join('');
}

// ===== TAB 6: ANALISIS =====
function updateAnalysis(){
  const grid=document.getElementById('kpi-subs');
  const recs=getFilteredRecords();
  const subRecs=recs.filter(r=>r[7]===1);
  const totalSub=subRecs.reduce((a,r)=>a+r[1],0);
  const rangeM=getMonthRange();
  const m=rangeM[rangeM.length-1];
  const mSub=getMonthSub(m);
  const subPartners=new Set();subRecs.forEach(r=>{if(r[2]>=0)subPartners.add(r[2]);});
  grid.innerHTML=`
    <div class="kpi-card purple"><div class="kpi-label">Facturaci\u00f3n Recurrente Total</div><div class="kpi-value purple">${fmtK(totalSub)}</div></div>
    <div class="kpi-card blue"><div class="kpi-label">Recurrente Mes (${mLabel(m)})</div><div class="kpi-value blue">${fmtK(mSub)}</div></div>
    <div class="kpi-card green"><div class="kpi-label">ARR Estimado (x12)</div><div class="kpi-value green">${fmtK(mSub*12)}</div></div>
    <div class="kpi-card amber"><div class="kpi-label">Clientes con Suscripci\u00f3n</div><div class="kpi-value">${fmtN(subPartners.size)}</div></div>
    <div class="kpi-card purple"><div class="kpi-label">Ticket Medio Recurrente</div><div class="kpi-value">${subPartners.size?fmtK(totalSub/subPartners.size):'\u2014'}</div><div class="kpi-detail">Total / cliente</div></div>
  `;

  // MRR by BU doughnut
  destroyChart('mrr-bu');const ctx1=getCtx('chart-mrr-bu');
  if(ctx1){
    const buAmounts={};VALID_BUS.forEach(bu=>{const bi=LK.bus.indexOf(bu);buAmounts[bu]=subRecs.filter(r=>r[8]===bi).reduce((a,r)=>a+r[1],0);});
    const entries=Object.entries(buAmounts).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
    charts['mrr-bu']=new Chart(ctx1,{type:'doughnut',data:{labels:entries.map(([k])=>k),datasets:[{data:entries.map(([,v])=>v),backgroundColor:entries.map(([k])=>BU_COLORS[k]||'#1e3a5f'),borderWidth:2,borderColor:'#fff',hoverOffset:8}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10,weight:600},padding:8}},datalabels:{font:{size:10,weight:700},color:'#fff',formatter:(v,ctx)=>{const t=ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);return t?((v/t)*100).toFixed(0)+'%':'';}}}}});
  }

  // Tipo distribution doughnut
  destroyChart('tipo-dist');const ctx2=getCtx('chart-tipo-dist');
  if(ctx2){
    const tipoAmounts={};LK.tipos.forEach((t,i)=>{if(t!=='(Sin asignar)'){const v=recs.filter(r=>r[10]===i).reduce((a,r)=>a+r[1],0);if(v>0)tipoAmounts[t]=v;}});
    const entries=Object.entries(tipoAmounts).sort((a,b)=>b[1]-a[1]);
    const tipoColors={'Producto':'#1e3a5f','Servicios Profesionales':'#3b82f6','Software':'#10b981','WH Hardware':'#f59e0b','Programaci\u00f3n':'#ec4899','WH Otros':'#64748b','Software Varios':'#2c5282','Gastos':'#ef4444'};
    charts['tipo-dist']=new Chart(ctx2,{type:'doughnut',data:{labels:entries.map(([k])=>k),datasets:[{data:entries.map(([,v])=>v),backgroundColor:entries.map(([k])=>tipoColors[k]||'#9ca3af'),borderWidth:2,borderColor:'#fff',hoverOffset:8}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10,weight:600},padding:8}},datalabels:{font:{size:10,weight:700},color:'#fff',formatter:(v,ctx)=>{const t=ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);return t?((v/t)*100).toFixed(0)+'%':'';}}}}});
  }

  // Account distribution
  destroyChart('acct-dist');const ctx3=getCtx('chart-acct-dist');
  if(ctx3){
    const acctAmounts={};LK.accts.forEach((a,i)=>{const v=recs.filter(r=>r[11]===i).reduce((r,rec)=>r+rec[1],0);if(v>0)acctAmounts[a]=v;});
    const entries=Object.entries(acctAmounts).sort((a,b)=>b[1]-a[1]);
    charts['acct-dist']=new Chart(ctx3,{type:'bar',data:{labels:entries.map(([k])=>k.substring(0,20)),datasets:[{data:entries.map(([,v])=>v),backgroundColor:PALETTE.slice(0,entries.length),borderRadius:6}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},datalabels:{anchor:'end',align:'right',font:{size:9,weight:700},formatter:v=>fmtK(v),color:'#6b7280'}},scales:{x:{ticks:{callback:v=>fmtK(v)}}}}});
  }

  // Active clients line
  destroyChart('active-clients');const ctx4=getCtx('chart-active-clients');
  if(ctx4){charts['active-clients']=new Chart(ctx4,{type:'line',data:{labels:DATA.months.map(mLabel),datasets:[{label:'Clientes Activos',data:DATA.months.map(m=>getActiveClients(m)),borderColor:'#1e3a5f',backgroundColor:'rgba(124,58,237,0.08)',fill:true,tension:0.3,borderWidth:3,pointRadius:5,pointBackgroundColor:'#1e3a5f'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},datalabels:{anchor:'top',align:'top',font:{size:11,weight:700},color:'#1e3a5f'}},scales:{y:{beginAtZero:false}}}});}
}

// ===== INFO BAR =====
function updateInfo(){
  const rangeInfo=getMonthRange();
  let parts=[];
  if(isZoomMode()) parts.push(mLabel(rangeInfo[0])+' \u2192 '+mLabel(rangeInfo[rangeInfo.length-1]));
  else parts.push('Todos los periodos');
  if(F.cat) parts.push('BU: '+F.cat);
  if(F.subcat1) parts.push('Clase: '+F.subcat1);
  if(F.subcat2) parts.push('Familia: '+F.subcat2);
  if(F.product) parts.push('Producto: '+F.product);
  if(F.acct) parts.push('Cuenta: '+F.acct);
  if(viewMode==='ytd') parts.push('YTD');
  document.getElementById('gf-count').textContent='Mostrando: '+parts.join(' \u00b7 ');
}

// ===== MASTER UPDATE =====
function updateAll(){
  updateInfo();
  updateKPIs();
  renderSubsBuPlanTable();
  renderSubsBuStateTable();
  updateEvolution();
  filterClients();
  updateDirectory();
  updateRanking();
  updateAnalysis();
}

Chart.register(ChartDataLabels);
Chart.defaults.font.family='Inter';
initGlobalFilters();
updateAll();
