import {events,categories} from './events.js';
import {FIRST_YEAR,LAST_YEAR,END_YEAR,TOTAL_YEARS,MIN_SPAN,clamp,normalizeRange,zoomRange,yearX,centuryOf,centuries,formatDate,layoutEvents} from './timeline.js';
const $ = selector => document.querySelector(selector);
const timeline=$('#timeline'), layer=$('#event-layer'), grid=$('#century-grid'), ticks=$('#ticks');
const state={range:{start:FIRST_YEAR,span:TOTAL_YEARS},category:'all',selected:'printing',search:'',frame:0};
const filtered=()=>events.filter(event=>state.category==='all'||event.category===state.category);
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const eventById=id=>events.find(event=>event.id===id);
const currentEvent=()=>eventById(state.selected);
function schedule(){if(!state.frame)state.frame=requestAnimationFrame(()=>{state.frame=0;renderTimeline();});}
function setRange(range){state.range=normalizeRange(range.start,range.span);schedule();}
function zoom(span,anchor=.5){setRange(zoomRange(state.range,span,anchor));}
function reset(){setRange({start:FIRST_YEAR,span:TOTAL_YEARS});}
function selectEvent(id,{reveal=false,focus=false}={}){
  state.selected=id;
  const event=eventById(id);
  if(reveal&&(event.year<state.range.start||event.year>=state.range.start+state.range.span))setRange({start:event.year-state.range.span/2,span:state.range.span});
  renderDetail();schedule();
  if(focus){$('#detail').scrollIntoView({behavior:'instant',block:'nearest'});}
  const url=new URL(location.href);url.hash=id;history.replaceState(null,'',url);
}
function renderTimeline(){
  const width=timeline.clientWidth, range=state.range;
  const mobile=width<700,labelWidth=mobile?132:150;
  const axis=parseFloat(getComputedStyle(timeline).getPropertyValue('--axis'));
  const active=document.activeElement?.dataset?.event;
  const gfrag=document.createDocumentFragment(),tfrag=document.createDocumentFragment(),efrag=document.createDocumentFragment();
  for(const c of centuries){
    if(c.end<=range.start||c.start>=range.start+range.span)continue;
    const x=yearX(c.start,range,width),end=yearX(c.end,range,width),box=el('div','century'+(c.number===21?' current':''));
    box.style.left=`${x}px`;box.style.width=`${end-x}px`;gfrag.append(box);
    if(range.span>300 && (!mobile || range.span<1000 || [1,5,10,15,20].includes(c.number))){const text=el('span','century-label',c.label);text.style.left=`${clamp((x+end)/2,8,width-8)}px`;tfrag.append(text);}
  }
  if(range.span<=300){
    const step=range.span<=30?2:range.span<=100?10:25;
    for(let y=Math.ceil(range.start/step)*step;y<Math.min(END_YEAR,range.start+range.span);y+=step){const text=el('span','tick-label',String(y));text.style.left=`${yearX(y,range,width)}px`;tfrag.append(text);}
  }
  const layout=layoutEvents(filtered(),range,width,labelWidth,state.selected);
  for(const p of layout.placed){
    const selected=p.event.id===state.selected;
    const button=el('button','event'+(selected?' selected':''));
    const top=p.lane===0?58:axis+72;
    button.style.left=`${p.left}px`;button.style.top=`${top}px`;button.dataset.event=p.event.id;
    button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',`${formatDate(p.event)}. ${p.event.title}`);
    button.append(el('strong','',p.event.approximate?`ок. ${p.event.year}`:String(p.event.year)),el('span','',p.event.title));
    const line=el('span','connector');line.style.left=`${p.x}px`;
    line.style.top=`${p.lane===0?top+52:axis}px`;line.style.height=`${p.lane===0?axis-top-52:72}px`;
    const dot=el('span','event-dot'+(selected?' selected':''));dot.style.left=`${p.x-2}px`;
    efrag.append(line,dot,button);
  }
  for(const group of layout.groups){
    const b=el('button','cluster',`+${group.items.length}`);
    b.style.left=`${clamp(group.x-10,0,width-26)}px`;b.dataset.cluster=group.items.map(e=>e.id).join(',');
    b.setAttribute('aria-label',`Приблизить: ${group.items.map(e=>e.title).join(', ')}`);efrag.append(b);
  }
  grid.replaceChildren(gfrag);ticks.replaceChildren(tfrag);layer.replaceChildren(efrag);
  if(active)layer.querySelector(`[data-event="${active}"]`)?.focus({preventScroll:true});
  $('#empty-timeline').hidden=layout.visible.length>0;
  $('#range-readout').textContent=`${Math.floor(range.start)} — ${Math.min(LAST_YEAR,Math.ceil(range.start+range.span)-1)}`;
  $('#event-count').textContent=`${layout.visible.length} из ${filtered().length} событий в отрезке`;
  $('#zoom-out').disabled=range.span>=TOTAL_YEARS;
  $('#zoom-in').disabled=range.span<=MIN_SPAN;
  const select=$('#scale');let custom=select.querySelector('[data-custom]');if(custom)custom.remove();
  if(![2026,500,100,25].includes(range.span)){custom=el('option','',`${Math.round(range.span)} лет`);custom.value=String(range.span);custom.dataset.custom='true';select.append(custom);}
  select.value=String(range.span);
  $('#century-select').value=String(centuries.find(c=>c.start===range.start&&c.end-c.start===range.span)?.number||'');
  document.querySelectorAll('.century-jump').forEach(b=>{const c=centuries[Number(b.dataset.century)-1];b.setAttribute('aria-pressed',String(c.number===centuryOf(currentEvent().year)));b.classList.toggle('in-view',c.end>range.start&&c.start<range.start+range.span);});
}
function renderDetail(){
  const event=currentEvent();const root=$('#detail');const date=el('p','detail-date');
  if(event.approximate)date.append(el('small','','около'));
  date.append(document.createTextNode(event.year));if(event.endYear)date.append(el('span','date-end',`— ${event.endYear}`));
  const main=el('div','detail-main');const meta=el('div','detail-meta');meta.append(el('span','',categories[event.category]),el('span','',event.region));
  main.append(meta,el('h2','',event.title),el('p','',event.description));
  const nav=el('div','detail-nav'),list=filtered(),index=list.findIndex(e=>e.id===event.id);
  for(const [delta,label] of [[-1,'← Предыдущее'],[1,'Следующее →']]){const b=el('button','',label);b.disabled=index+delta<0||index+delta>=list.length;b.addEventListener('click',()=>selectEvent(list[index+delta].id,{reveal:true}));nav.append(b);}main.append(nav);
  const impact=el('div','detail-impact');const source=el('a','source',`${event.sourceTitle} ↗`);source.href=event.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';
  impact.append(el('h3','','Почему это важно'),el('p','',event.impact),source);root.replaceChildren(date,main,impact);
}
function renderList(){
  const list=filtered().filter(e=>`${formatDate(e)} ${e.title} ${e.region} ${e.description}`.toLocaleLowerCase('ru').includes(state.search));
  $('#catalog-total').textContent=`/ ${filtered().length}`;
  const fragment=document.createDocumentFragment();
  for(const e of list){const b=el('button','list-event');b.dataset.event=e.id;b.append(el('strong','',formatDate(e)),el('span','',e.title),el('small','',e.region));fragment.append(b);}
  if(!list.length)fragment.append(el('p','empty-list','Ничего не найдено. Попробуйте другой год или название.'));
  $('#event-list').replaceChildren(fragment);
}
for(const c of centuries){const b=el('button','century-jump',c.label);b.style.width=`${(c.end-c.start)/TOTAL_YEARS*100}%`;b.dataset.century=c.number;b.title=`${c.label} век · ${c.start}–${c.end-1}`;b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed','false');$('#overview').append(b);const option=el('option','',b.title);option.value=c.number;$('#century-select').append(option);}
function goToCentury(number){const c=centuries[number-1];setRange({start:c.start,span:c.end-c.start});const event=filtered().find(e=>e.year>=c.start&&e.year<c.end);if(event)selectEvent(event.id);}
$('#century-select').addEventListener('change',e=>{if(e.target.value)goToCentury(Number(e.target.value));});
$('#overview').addEventListener('click',e=>{const b=e.target.closest('[data-century]');if(!b)return;goToCentury(Number(b.dataset.century));});
$('.filters').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;state.category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));const list=filtered();if(!list.some(event=>event.id===state.selected))state.selected=list[0].id;selectEvent(state.selected);renderList();schedule();});
layer.addEventListener('click',e=>{
  if(suppressClick){suppressClick=false;return;}
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.event)selectEvent(button.dataset.event);
  if(button.dataset.cluster){const list=button.dataset.cluster.split(',').map(eventById);state.selected=list[0].id;const span=Math.max(MIN_SPAN,Math.min(state.range.span/3,(list.at(-1).year-list[0].year+20)));setRange({start:(list[0].year+list.at(-1).year)/2-span/2,span});selectEvent(state.selected);}
});
$('#event-list').addEventListener('click',e=>{const b=e.target.closest('[data-event]');if(b)selectEvent(b.dataset.event,{reveal:true,focus:true});});
$('#zoom-in').addEventListener('click',()=>zoom(state.range.span/2));$('#zoom-out').addEventListener('click',()=>zoom(state.range.span*2));
$('#scale').addEventListener('change',e=>zoom(Number(e.target.value)));$('#reset').addEventListener('click',reset);$('#empty-reset').addEventListener('click',reset);
$('#search').addEventListener('input',e=>{state.search=e.target.value.trim().toLocaleLowerCase('ru');renderList();});
$('#catalog-toggle').addEventListener('click',()=>{const b=$('#catalog-toggle'),open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));$('#catalog-body').hidden=!open;});
$('#about-open').addEventListener('click',()=>$('#about').showModal());$('#about-close').addEventListener('click',()=>$('#about').close());
$('#about').addEventListener('click',e=>{if(e.target!==$('#about'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();});
// Pointer work is coalesced to one render per frame. Normal vertical scrolling stays native.
let gesture=null,suppressClick=false;const pointers=new Map();
function pointerBasis(){const entries=[...pointers.values()];return entries.length>1?{distance:Math.abs(entries[1].x-entries[0].x),center:(entries[1].x+entries[0].x)/2}:null;}
timeline.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;suppressClick=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  gesture={range:{...state.range},x:e.clientX,y:e.clientY,pinch:pointerBasis(),moved:false};
});
timeline.addEventListener('pointermove',e=>{
  if(!gesture||!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const pinch=pointerBasis(),rect=timeline.getBoundingClientRect();
  if(pinch&&gesture.pinch&&gesture.pinch.distance>5){
    const span=clamp(gesture.range.span*gesture.pinch.distance/Math.max(5,pinch.distance),MIN_SPAN,TOTAL_YEARS);
    const anchor=(gesture.pinch.center-rect.left)/rect.width;
    const start=gesture.range.start+anchor*gesture.range.span-(pinch.center-rect.left)/rect.width*span;
    setRange({start,span});gesture.moved=true;suppressClick=true;e.preventDefault();
  }else{
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(!gesture.moved&&Math.abs(dx)<=6)return;
    if(!gesture.moved&&Math.abs(dy)>Math.abs(dx)&&e.pointerType==='touch')return;
    gesture.moved=true;suppressClick=true;timeline.classList.add('dragging');
    if(!timeline.hasPointerCapture(e.pointerId))timeline.setPointerCapture(e.pointerId);
    setRange({start:gesture.range.start-dx/rect.width*gesture.range.span,span:gesture.range.span});
  }
});
function release(e){pointers.delete(e.pointerId);if(timeline.hasPointerCapture(e.pointerId))timeline.releasePointerCapture(e.pointerId);timeline.classList.remove('dragging');gesture=null;pointers.clear();}
timeline.addEventListener('pointerup',release);timeline.addEventListener('pointercancel',release);window.addEventListener('pointerup',release);
timeline.addEventListener('wheel',e=>{
  if(e.ctrlKey||e.metaKey){e.preventDefault();zoom(state.range.span*Math.exp(e.deltaY*.008),(e.clientX-timeline.getBoundingClientRect().left)/timeline.clientWidth);}
  else if(Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey){e.preventDefault();setRange({start:state.range.start+(e.deltaX||e.deltaY)/timeline.clientWidth*state.range.span,span:state.range.span});}
},{passive:false});
timeline.addEventListener('keydown',e=>{
  if(e.target!==timeline)return;
  if(['ArrowLeft','ArrowRight','+','=','-','0','Home','End'].includes(e.key))e.preventDefault();
  if(e.key==='ArrowLeft'||e.key==='ArrowRight')setRange({start:state.range.start+state.range.span*.15*(e.key==='ArrowRight'?1:-1),span:state.range.span});
  if(e.key==='+'||e.key==='=')zoom(state.range.span/2);if(e.key==='-')zoom(state.range.span*2);if(e.key==='0')reset();
  if(e.key==='Home')setRange({start:FIRST_YEAR,span:state.range.span});if(e.key==='End')setRange({start:END_YEAR-state.range.span,span:state.range.span});
});
new ResizeObserver(schedule).observe(timeline);
function restoreHash(){let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}if(eventById(id)){state.selected=id;const event=eventById(id);if(state.category!=='all'&&event.category!==state.category){state.category='all';document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category==='all')));}renderDetail();renderList();schedule();}}
window.addEventListener('hashchange',restoreHash);restoreHash();renderDetail();renderList();schedule();
