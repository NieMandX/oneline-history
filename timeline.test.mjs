import {test} from 'node:test';
import assert from 'node:assert/strict';
import {centuryOf,centuries,TOTAL_YEARS,END_YEAR,normalizeRange,zoomRange,yearX,layoutEvents,periodGeometry,formatDate} from './timeline.js';
import {events,categories} from './events.js';

test('calendar boundaries have no year zero and XXI is exactly 26% of a century',()=>{
  assert.equal(centuryOf(1),1);assert.equal(centuryOf(100),1);assert.equal(centuryOf(101),2);
  assert.equal(centuryOf(2000),20);assert.equal(centuryOf(2001),21);
  assert.equal(centuries.length,21);assert.equal(centuries.at(-1).end-centuries.at(-1).start,26);
  assert.equal(centuries.reduce((sum,c)=>sum+c.end-c.start,0),TOTAL_YEARS);
  for(let i=1;i<centuries.length;i++)assert.equal(centuries[i-1].end,centuries[i].start);
});
test('pan and zoom stay inside the historical domain',()=>{
  assert.deepEqual(normalizeRange(-100,100),{start:1,span:100});
  assert.deepEqual(normalizeRange(2000,100),{start:1927,span:100});
  assert.deepEqual(normalizeRange(100,4000),{start:1,span:2026});
  assert.equal(normalizeRange(2010,0).span,12);
  for(let span=1;span<2500;span+=37){const r=normalizeRange(2100-span,span);assert.ok(r.start>=1&&r.start+r.span<=END_YEAR);}
});
test('zoom preserves the pointer year unless clamped at a boundary',()=>{
  const before={start:600,span:500};const anchor=.31;
  const after=zoomRange(before,100,anchor);
  assert.ok(Math.abs(before.start+before.span*anchor-after.start-after.span*anchor)<1e-9);
  assert.equal(yearX(1450,{start:1401,span:100},1000),490);
});
test('event label collision detection works across mobile and desktop ranges',()=>{
  for(const width of [280,350,700,1440])for(const range of [{start:1,span:2026},{start:1901,span:100},{start:1940,span:25},{start:2001,span:26}]){
    const labelWidth=width<700?132:150;const layout=layoutEvents(events,range,width,labelWidth,'printing');
    const all=[...layout.placed.map(p=>p.event.id),...layout.groups.flatMap(g=>g.items.map(e=>e.id))];
    assert.equal(all.length,new Set(all).size);assert.equal(all.length,layout.visible.length);
    for(const p of layout.placed){assert.ok(p.left>=0&&p.left+labelWidth<=width);for(const q of layout.placed){if(q!==p&&q.lane===p.lane)assert.ok(p.left+labelWidth<=q.left||q.left+labelWidth<=p.left);}}
  }
  assert.ok(layoutEvents(events,{start:1,span:2026},350,132,'printing').placed.some(p=>p.event.id==='printing'));
});
test('every event has valid dates, unique ID, category, description, impact, and HTTPS source',()=>{
  assert.equal(events.length,new Set(events.map(e=>e.id)).size);
  for(const e of events){assert.ok(e.year>=1&&e.year<=2026);assert.ok(!e.endYear||e.endYear>=e.year);assert.ok(categories[e.category]);assert.ok(e.title&&e.description&&e.impact&&e.sourceTitle);assert.equal(new URL(e.sourceUrl).protocol,'https:');}
  assert.deepEqual([...events].sort((a,b)=>a.year-b.year).map(e=>e.year),events.map(e=>e.year));
});
test('period endpoints stay aligned with dates and clip at either viewport edge',()=>{
  const e={kind:'state',year:1200,endYear:1600};
  assert.deepEqual(periodGeometry(e,{start:1000,span:1000},1000),{x:200,width:400,startClipped:false,endClipped:false});
  assert.deepEqual(periodGeometry(e,{start:1300,span:200},600),{x:0,width:600,startClipped:true,endClipped:true});
  assert.deepEqual(periodGeometry(e,{start:1100,span:200},600),{x:300,width:300,startClipped:false,endClipped:true});
  assert.deepEqual(periodGeometry(e,{start:1500,span:200},600),{x:0,width:300,startClipped:true,endClipped:false});
});
test('outside, missing, zero-length and unrelated process intervals do not draw a band',()=>{
  const range={start:1000,span:100};
  for(const event of [null,{kind:'state',year:800,endYear:1000},{kind:'era',year:1100,endYear:1300},{kind:'state',year:1020},{kind:'state',year:1020,endYear:1020},{year:1020,endYear:1040}])assert.equal(periodGeometry(event,range,500),null);
});
test('a short period retains its true width and approximate boundaries are explicit',()=>{
  assert.ok(Math.abs(periodGeometry({kind:'era',year:1000,endYear:1001},{start:1,span:2026},350).width-350/2026)<1e-9);
  assert.equal(formatDate({year:500,endYear:1000,approximate:true,endApproximate:true}),'ок. 500–ок. 1000');
});
test('curated states and eras have sourced, explained endpoints',()=>{
  for(const e of events.filter(e=>['state','era'].includes(e.kind))){
    assert.ok(e.endYear>e.year&&e.endYear<=2026,e.id);assert.ok(e.periodNote,e.id);
    if(e.periodSourceUrl){assert.equal(new URL(e.periodSourceUrl).protocol,'https:');assert.ok(e.periodSourceTitle);}
    if(e.kind==='era')assert.ok(e.approximate&&e.endApproximate,e.id);
  }
});
test('topic views reveal secondary labels while preserving collision checks',()=>{
  const states=events.filter(e=>e.category==='states'),range={start:1,span:2026};
  const general=layoutEvents(states,range,1200,150,'sasanians');
  const topic=layoutEvents(states,range,1200,150,'sasanians',false);
  assert.ok(topic.placed.length>general.placed.length);
  for(const p of topic.placed)for(const q of topic.placed)if(p!==q&&p.lane===q.lane)assert.ok(p.left+150<=q.left||q.left+150<=p.left);
});
