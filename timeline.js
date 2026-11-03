/** Calendar years are positions, and the right boundary is exclusive. No year zero. */
export const FIRST_YEAR = 1;
export const LAST_YEAR = 2026;
export const END_YEAR = LAST_YEAR + 1;
export const TOTAL_YEARS = END_YEAR - FIRST_YEAR;
export const MIN_SPAN = 12;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function normalizeRange(start, span) {
  span = clamp(span, MIN_SPAN, TOTAL_YEARS);
  return { start: clamp(start, FIRST_YEAR, END_YEAR - span), span };
}
export function zoomRange(range, span, anchor = .5) {
  const nextSpan = clamp(span, MIN_SPAN, TOTAL_YEARS);
  return normalizeRange(range.start + (range.span - nextSpan) * clamp(anchor, 0, 1), nextSpan);
}
export function yearX(year, range, width) { return (year - range.start) / range.span * width; }
export function centuryOf(year) { return Math.floor((year - 1) / 100) + 1; }
export function roman(value) {
  const pairs = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let result=''; for (const [n,s] of pairs) while(value>=n){result+=s;value-=n;} return result;
}
export const centuries = Array.from({length:centuryOf(LAST_YEAR)}, (_,i)=>({ number:i+1, start:i*100+1, end:Math.min(i*100+101, END_YEAR), label:roman(i+1) }));
export function formatDate(event) { return `${event.approximate?'ок. ':''}${event.year}${event.endYear?'–'+(event.endApproximate?'ок. ':'')+event.endYear:''}`; }
/** Dates are endpoints, not inclusive year-sized blocks. Only explicit periods get a band. */
export function periodGeometry(event, range, width) {
  if (!event || !['state','era'].includes(event.kind) || !Number.isFinite(event.endYear) || event.endYear <= event.year || width <= 0) return null;
  const left=yearX(event.year,range,width),right=yearX(event.endYear,range,width);
  if(right<=0||left>=width)return null;
  const x=clamp(left,0,width),end=clamp(right,0,width);
  return {x,width:end-x,startClipped:left<0,endClipped:right>width};
}
/** Fixed label width and interval checks keep text from colliding at every zoom. */
export function layoutEvents(events, range, width, labelWidth, selectedId, overview=true) {
  const visible = events.filter(e => e.year >= range.start && e.year < range.start + range.span);
  const lanes = [[],[]], placed=[], hidden=[];
  const sorted = [...visible].sort((a,b)=>(a.id===selectedId?-1:b.id===selectedId?1:a.priority-b.priority||a.year-b.year));
  for(const event of sorted){
    const x=clamp(yearX(event.year,range,width),3,width-3);
    const left=clamp(x-16,4,Math.max(4,width-labelWidth-4));
    if(overview && range.span>1000 && event.priority>1 && event.id!==selectedId){hidden.push({event,x});continue;}
    const preferred = placed.length % 2;
    const lane=[preferred,1-preferred].find(i=>lanes[i].every(p=>left+labelWidth+14<=p || left>=p+labelWidth+14));
    if(lane===undefined){hidden.push({event,x});continue;}
    lanes[lane].push(left);placed.push({event,x,left,lane});
  }
  const groups=[];
  for(const item of hidden.sort((a,b)=>a.x-b.x)){
    const prev=groups.at(-1);
    if(prev && item.x-prev.x<30){prev.items.push(item.event);} else groups.push({x:item.x,items:[item.event]});
  }
  return {placed,groups,visible};
}
