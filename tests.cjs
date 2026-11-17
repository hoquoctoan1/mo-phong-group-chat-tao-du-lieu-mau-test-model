/* Optional: node tests.cjs. No dependencies; not needed to run the app. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('./model.js');
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
const store = new M.Store();
test('5 unique members; renaming preserves ID', () => {
  ['Lan','Nam','Hùng','Mai','An'].forEach((name,index) => store.addMember(name,'U_'+index));
  assert.equal(new Set(store.data.members.map(member=>member.id)).size,5);
  assert.equal(new Set(store.data.members.map(member=>member.color)).size,5);
  store.renameMember('U_0','Lan Nguyễn');
  assert.equal(store.data.members[0].id,'U_0');
  assert.throws(()=>store.addMember('Duplicate','U_0'));
});
test('20 messages / 3 interleaved topics / distant reply / exact text', () => {
  for(let i=0;i<20;i++) store.send({sender_id:'U_'+i%5,text:i===0?'  <script>alert("xss")</script>\nGiữ nguyên  ':'Tin nhắn '+(i+1),topic:['Proposal','Lịch họp','Sản phẩm'][i%3],participants:i%2?['U_0','U_1']:[],reply_to:i===19?'msg_001':null,timestamp:M.timestamp('2026-11-17T09:'+String(i).padStart(2,'0'))});
  assert.equal(store.data.events.length,20);
  assert.equal(store.data.events[19].reply_to,'msg_001');
  assert.equal(store.data.events[0].text,'  <script>alert("xss")</script>\nGiữ nguyên  ');
  assert.deepEqual(store.data.events[0].participants,[]);
  assert.equal(new Set(store.data.events.map(event=>event.topic)).size,3);
});
test('Edit/delete append events, preserve originals and metadata', () => {
  const original=JSON.stringify(store.data.events[1]);
  store.change('msg_002','edit','Đã chỉnh sửa');store.change('msg_003','delete');
  assert.equal(store.data.events.length,22);
  assert.equal(JSON.stringify(store.data.events[1]),original);
  assert.equal(M.latest(store.data.events)[1].text,'Đã chỉnh sửa');
  assert.equal(M.latest(store.data.events)[2].event_type,'delete');
  assert.equal(store.data.events[21].text,store.data.events[2].text);
  assert.throws(()=>store.change('msg_003','edit','No resurrection'));
});
test('Exactly 13 schema fields, null values, +07:00 timestamps', () => {
  store.data.events.forEach(event=>{
    assert.deepEqual(Object.keys(event),M.FIELDS);
    assert.equal(typeof event.text,'string');assert.ok(Array.isArray(event.acl));
    assert.equal(event.media_text,null);assert.ok(M.validTimestamp(event.timestamp));
  });
  assert.equal(M.validTimestamp('2026-02-30T09:00:00+07:00'),false);
  assert.equal(M.validTimestamp('2026-11-17T25:00:00+07:00'),false);
  assert.equal(M.validTimestamp('2026-11-17T09:00:00Z'),false);
  assert.ok(M.timestamp().endsWith('+07:00'));
});
test('JSON round trip and continuing IDs after import/deletion', () => {
  const json=JSON.stringify(store.data);
  const restored=new M.Store(JSON.parse(json));assert.deepEqual(restored.data,store.data);
  assert.equal(restored.send({sender_id:'U_0',text:'Tiếp tục'}).message_id,'msg_021');
  const bare=new M.Store(store.data.events);assert.equal(bare.data.members.length,5);
  assert.equal(bare.send({sender_id:'U_0',text:'Bare import'}).message_id,'msg_021');
});
test('Replay uses processing order, including backdated events', () => {
  const restored=new M.Store(store.data);
  restored.change('msg_002','edit','Sửa với thời gian quá khứ',M.timestamp('2020-01-01T00:00'));
  assert.equal(M.latest(restored.data.events)[1].text,'Sửa với thời gian quá khứ');
  assert.equal(M.latest(restored.data.events)[1].message_id,'msg_002');
});
test('Reject duplicate new IDs, invalid users/types/ACL and dangling replies', () => {
  const bad=change=>{const copy=JSON.parse(JSON.stringify(store.data));change(copy);assert.throws(()=>M.importData(copy));};
  bad(data=>data.events.push(data.events[0]));
  bad(data=>data.members.push(data.members[0]));
  bad(data=>data.events[0].sender_id='UNKNOWN');
  bad(data=>data.events[0].participants=['UNKNOWN']);
  bad(data=>data.events[0].participants=['U_0','U_0']);
  bad(data=>data.events[0].acl=[]);
  bad(data=>data.events[0].topic=42);
  bad(data=>data.events[0].media_text={});
  bad(data=>data.events[0].reply_to='msg_missing');
  bad(data=>data.events[0].event_type='edit');
  bad(data=>data.events[0].extra='undocumented');
  bad(data=>delete data.events[0].topic);
  bad(data=>data.events[20].sender_id='U_4');
  bad(data=>data.events[21].text='Changed on delete');
});
test('Replies cannot cross conversations, point forward, or target deleted messages', () => {
  const restored=new M.Store(store.data);
  restored.data.config.conversation_id='conv_other';
  assert.throws(()=>restored.send({sender_id:'U_0',text:'Cross source',reply_to:'msg_001'}));
  restored.data.config.conversation_id='conv_1';
  assert.throws(()=>restored.send({sender_id:'U_0',text:'Deleted',reply_to:'msg_003'}));
  assert.throws(()=>restored.send({sender_id:'U_0',text:'Future',reply_to:'msg_999'}));
});
test('Existing reply stays valid after its target is deleted', () => {
  const restored=new M.Store(store.data);restored.change('msg_001','delete');
  assert.equal(new M.Store(restored.data).data.events[19].reply_to,'msg_001');
});
test('No script injection sinks and all application scripts parse', () => {
  const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  new vm.Script(source);new vm.Script(fs.readFileSync(path.join(__dirname,'model.js'),'utf8'));
  assert.doesNotMatch(source,/\.innerHTML\s*=|insertAdjacentHTML|document\.write\(|\beval\(/);
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(ids.length,new Set(ids).size);
  for(const match of source.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]),'Missing element '+match[1]);
});
console.log(`\n${count} groups passed.`);
