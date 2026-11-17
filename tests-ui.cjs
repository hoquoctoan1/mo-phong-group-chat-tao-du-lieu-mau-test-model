/* Dependency-free DOM simulation for composer interactions (not browser/layout QA). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('./model.js');
class Node {
  constructor(tag='') {
    this.tag=tag; this.children=[]; this.dataset={}; this.attributes={}; this.listeners={};
    this.className=''; this.value=''; this.checked=false; this.disabled=false; this.hidden=false;
    this.style={setProperty(){}}; this.scrollTop=0; this.scrollHeight=100;
    this.classList={toggle:(name,on)=>{const values=new Set(this.className.split(' ').filter(Boolean));const active=on??!values.has(name);if(active)values.add(name);else values.delete(name);this.className=[...values].join(' ');},add:name=>this.classList.toggle(name,true),remove:name=>this.classList.toggle(name,false),contains:name=>this.className.split(' ').includes(name)};
  }
  set textContent(value) { this.children=[]; this.text=String(value); }
  get textContent() { return (this.text||'')+this.children.map(node=>node.textContent).join(''); }
  get firstElementChild() { return this.children.find(node=>node.tag); }
  get elements() { return Object.fromEntries(this.querySelectorAll('input').map(node=>[node.attributes.name,node])); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text='';this.children=[...nodes]; }
  setAttribute(key,value) {
    this.attributes[key]=value;
    if(key==='class')this.className=value;
    if(key==='value')this.value=value;
    if(key==='type')this.type=value;
    if(key==='hidden')this.hidden=true;
    if(key==='disabled')this.disabled=true;
    if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;
  }
  querySelectorAll(selector) {
    const result=[];const selectors=selector.split(',');
    function matches(node) { return selectors.some(item=>item==='[data-field]'?!!node.dataset.field:item==='input:checked'?node.tag==='input'&&node.checked:node.tag===item); }
    function walk(node){for(const child of node.children){if(matches(child))result.push(child);walk(child);}}
    walk(this);return result;
  }
  addEventListener(type,handler) { (this.listeners[type]??=[]).push(handler); }
  dispatch(type,extra={}) { for(const handler of this.listeners[type]||[])handler({preventDefault(){},stopPropagation(){},target:this,...extra}); }
  focus(){this.dispatch('focus');}
  scrollIntoView(){}
  requestSubmit(){this.dispatch('submit');}
  showModal(){this.open=true;}
  close(){this.open=false;}
  cloneNode(deep) { const node=new Node(this.tag);for(const [key,value] of Object.entries(this.attributes))node.setAttribute(key,value);node.text=this.text;if(deep)node.children=this.children.map(child=>child.cloneNode(true));return node; }
}
function parse(html) {
  const root=new Node();const stack=[root];const ids=new Map();
  const voidTags=new Set(['meta','link','input','br']);
  for(const match of html.matchAll(/<\/?([a-z][\w-]*)\b([^>]*)>|([^<]+)/gi)) {
    if(match[3]){const text=new Node();text.text=match[3];stack.at(-1).append(text);continue;}
    if(match[0].startsWith('</')){stack.pop();continue;}
    const node=new Node(match[1].toLowerCase());
    for(const attribute of match[2].matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'))?/g))node.setAttribute(attribute[1],attribute[2]??attribute[3]??'');
    if(node.attributes.id)ids.set(node.attributes.id,node);
    stack.at(-1).append(node);
    if(node.tag==='template'){node.content=new Node();stack.push(node.content);}
    else if(!voidTags.has(node.tag))stack.push(node);
  }
  return {ids,body:ids.size&&root.children.find(node=>node.tag==='html')?.children.find(node=>node.tag==='body')};
}
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const {ids,body}=parse(html);
assert.ok(body,'HTML body parsed');
const initial=new M.Store();initial.addMember('Lan','U_LAN');initial.addMember('Nam','U_NAM');initial.addMember('Hùng','U_HUNG');
const storage=new Map([['chat22.simulator.v1',JSON.stringify(initial.data)]]);
const context=vm.createContext({
  window:{ChatModel:M,addEventListener(){}},
  document:{getElementById:id=>ids.get(id),createElement:tag=>new Node(tag),createTextNode:text=>{const node=new Node();node.text=text;return node;},body},
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
  setTimeout(){return 1;},clearTimeout(){},confirm(){return true;},console
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),context);
const fields=id=>Object.fromEntries(ids.get('role-composers').children.find(card=>card.dataset.roleId===id).querySelectorAll('[data-field]').map(node=>[node.dataset.field,node]));
const events=()=>JSON.parse(storage.get('chat22.simulator.v1')).events;
const selectLatest=()=>ids.get('messages').children.filter(node=>node.tag==='article').at(-1).dispatch('click');
const lan=fields('U_LAN'),nam=fields('U_NAM'),hung=fields('U_HUNG');
assert.equal(ids.get('role-composers').children.length,3);
lan['message-text'].value='Lan đang soạn';hung['message-text'].value='Hùng đang soạn';
nam.topic.value='Proposal';nam['message-text'].value='Nam gửi đầu tiên';nam['message-form'].requestSubmit();
assert.equal(events()[0].sender_id,'U_NAM');assert.equal(events()[0].topic,'Proposal');
assert.equal(lan['message-text'].value,'Lan đang soạn');assert.equal(hung['message-text'].value,'Hùng đang soạn');assert.equal(nam['message-text'].value,'');
console.log('PASS per-role send identity, metadata and independent drafts');
selectLatest();lan['reply-selected'].dispatch('click');hung['reply-selected'].dispatch('click');
assert.equal(lan['compose-context'].hidden,false);assert.equal(hung['compose-context'].hidden,false);
lan['message-text'].value='Lan trả lời Nam';lan['message-form'].requestSubmit();
assert.equal(events()[1].reply_to,'msg_001');assert.equal(events()[1].sender_id,'U_LAN');
assert.equal(hung['compose-context'].hidden,false);assert.equal(hung['message-text'].value,'Hùng đang soạn');
hung['message-form'].requestSubmit();assert.equal(events()[2].reply_to,'msg_001');
console.log('PASS independent reply contexts in multiple role cards');
nam['message-text'].value='Bản nháp của Nam';
const first=ids.get('messages').children.find(node=>node.dataset.id==='msg_001');
first.querySelectorAll('button').find(node=>node.textContent==='Sửa').dispatch('click');
assert.equal(nam['message-text'].value,'Nam gửi đầu tiên');assert.equal(nam.topic.disabled,true);
nam['message-text'].value='Nam đã chỉnh sửa';nam['message-form'].requestSubmit();
assert.equal(events().at(-1).event_type,'edit');assert.equal(events().at(-1).message_id,'msg_001');
assert.equal(events().at(-1).sender_id,'U_NAM');assert.equal(nam['message-text'].value,'Bản nháp của Nam');assert.equal(nam.topic.disabled,false);
console.log('PASS edit routes to original sender and restores pending draft');
nam['message-text'].value='';lan['message-text'].value='';hung['message-text'].value='';
const before=events().length;nam['message-form'].requestSubmit();assert.equal(events().length,before);
assert.equal(ids.get('toast').className,'error');
console.log('PASS empty message rejected without touching event history');
const jsonButton=ids.get('messages').children.find(node=>node.dataset.id==='msg_001').querySelectorAll('button').find(node=>node.textContent.startsWith('{ }'));
jsonButton.dispatch('click');assert.ok(body.classList.contains('data-visible'));
ids.get('toggle-inspector').dispatch('click');assert.equal(body.classList.contains('data-visible'),false);
console.log('PASS JSON inspector returns to role composers');
const checkbox=lan.participants.querySelectorAll('input').find(node=>node.value==='U_NAM');checkbox.checked=true;
lan['message-text'].value='<img src=x onerror=alert(1)>';lan['message-form'].requestSubmit();
assert.deepEqual(events().at(-1).participants,['U_NAM']);assert.equal(events().at(-1).text,'<img src=x onerror=alert(1)>');
assert.ok(ids.get('messages').children.at(-1).querySelectorAll('div').some(node=>node.className==='bubble'&&node.textContent==='<img src=x onerror=alert(1)>'&&node.children.length===0));
console.log('PASS per-role participants and safe literal message rendering');
// Restore/reload from the same serialized events in a fresh app instance.
const reloaded=parse(html);context.document={getElementById:id=>reloaded.ids.get(id),createElement:tag=>new Node(tag),createTextNode:text=>{const node=new Node();node.text=text;return node;},body:reloaded.body};
vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),context);
assert.equal(reloaded.ids.get('role-composers').children.length,3);
assert.equal(reloaded.ids.get('messages').children.filter(node=>node.tag==='article').length,4);
console.log('PASS app reload restores role cards and persisted conversation');
