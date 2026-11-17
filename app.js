/* DOM rendering uses textContent exclusively for user-supplied content. */
(() => {
  'use strict';
  const M = window.ChatModel;
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'chat22.simulator.v1';
  let store = new M.Store(), sender = '', selected = null, memberEditing = null, toastTimer;
  const roleViews = new Map();
  let storageBlocked = false;
  function notify(message,error=false) { $('toast').textContent=message; $('toast').className=error?'error':''; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(() => $('toast').hidden=true,6000); }
  try { const saved=localStorage.getItem(STORAGE_KEY); if(saved) store=new M.Store(JSON.parse(saved)); }
  catch(error) { storageBlocked=true; notify('Không đọc được dữ liệu đã lưu. Dữ liệu cũ được giữ nguyên; hãy xuất bản sao trước khi đặt lại. '+error.message,true); }
  function mutate(action) {
    if(storageBlocked) { notify('Dữ liệu lưu cũ chưa đọc được. Hãy đặt lại có xác nhận hoặc nhập một bản sao hợp lệ để tiếp tục.',true); return false; }
    const backup=JSON.stringify(store.data);
    try { action(); localStorage.setItem(STORAGE_KEY,JSON.stringify(store.data)); $('save-status').textContent='Đã lưu · '+new Date().toLocaleTimeString('vi-VN'); render(); return true; }
    catch(error) { store=new M.Store(JSON.parse(backup)); notify('Không lưu thay đổi: '+error.message,true); return false; }
  }
  function element(tag,className,text) { const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=text; return node; }
  function button(text,handler,className='') { const node=element('button',className,text); node.type='button'; node.addEventListener('click',event => {event.stopPropagation();handler();}); return node; }
  const memberById = id => store.data.members.find(member=>member.id===id);
  const currentMessages = () => M.latest(store.data.events);
  const messageById = id => currentMessages().find(message=>message.message_id===id);
  function avatar(member) { const node=element('span','avatar',Array.from(member.name.trim()).slice(0,2).join('').toLocaleUpperCase('vi')); node.style.setProperty('--avatar-color',member.color); return node; }
  function renderMembers() {
    if(!memberById(sender)) sender=store.data.members[0]?.id || '';
    $('members').replaceChildren();
    store.data.members.forEach(member=> {
      const row=element('div','member-row'+(sender===member.id?' active':''));
      const choose=button('',()=>focusRole(member.id),'member-select');
      choose.append(avatar(member)); const name=element('span','member-name',member.name); name.append(element('small','',member.id)); choose.append(name);
      choose.setAttribute('aria-label','Đóng vai '+member.name); choose.setAttribute('aria-pressed',String(sender===member.id));
      const edit=button('✎',()=>openMember(member),'icon-button'); edit.title='Sửa tên '+member.name; edit.setAttribute('aria-label',edit.title); row.append(choose,edit); $('members').append(row);
    });
    $('member-count').textContent=store.data.members.length; $('header-members').textContent=store.data.members.length;
  }
  function showRolePanel() { document.body.classList.remove('data-visible');$('toggle-inspector').textContent='{ } Xem dữ liệu';$('toggle-inspector').setAttribute('aria-expanded','false'); }
  function focusRole(id) {
    showRolePanel();sender=id;renderMembers();
    roleViews.forEach((view,roleId)=>view.card.classList.toggle('active',roleId===id));
    const view=roleViews.get(id);if(!view)return;
    view.card.scrollIntoView({block:'nearest',behavior:'smooth'});view.fields['message-text'].focus({preventScroll:true});
  }
  function createRoleView(member) {
    const card=$('role-template').content.firstElementChild.cloneNode(true);
    const fields=Object.fromEntries([...card.querySelectorAll('[data-field]')].map(node=>[node.dataset.field,node]));
    const view={card,fields,reply:null,editing:null,suspendedDraft:null};roleViews.set(member.id,view);
    card.dataset.roleId=member.id;
    fields['message-text'].addEventListener('focus',()=>{sender=member.id;renderMembers();roleViews.forEach((item,id)=>item.card.classList.toggle('active',id===sender));});
    fields['reply-selected'].addEventListener('click',()=>{const target=messageById(selected);if(target)startReply(target,member.id);});
    fields['cancel-context'].addEventListener('click',()=>clearContext(view));
    fields['message-form'].addEventListener('submit',event=>{event.preventDefault();sendRole(member.id);});
    fields['message-text'].addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();fields['message-form'].requestSubmit();}});
    $('role-composers').append(card);return view;
  }
  function renderRoles() {
    if(!store.data.members.length) {
      $('role-composers').replaceChildren(element('p','role-empty','Thêm thành viên bằng nút ＋ bên trái. Mỗi thành viên sẽ có một khung chat riêng tại đây.'));
    } else if(!roleViews.size) $('role-composers').replaceChildren();
    store.data.members.forEach(member=>{
      const view=roleViews.get(member.id)||createRoleView(member);const f=view.fields;
      const identity=element('div','member-name',member.name);identity.append(element('small','',member.id));f.identity.replaceChildren(avatar(member),identity);
      f['input-label'].textContent='Tin nhắn của '+member.name;
      f['source-note'].textContent='Nguồn: '+store.data.config.conversation_id+' · '+store.data.config.channel_id;
      view.card.setAttribute('aria-label','Khung chat của '+member.name);view.card.classList.toggle('active',sender===member.id);
      const checked=new Set([...f.participants.querySelectorAll('input:checked')].map(input=>input.value));f.participants.replaceChildren();
      store.data.members.forEach(person=>{const label=element('label');const input=document.createElement('input');input.type='checkbox';input.value=person.id;input.checked=checked.has(person.id);input.disabled=!!view.editing;label.append(input,document.createTextNode(person.name));f.participants.append(label);});
    });
    updateReplyTargets();
  }
  function updateReplyTargets() {
    const target=messageById(selected);
    const canReply=target&&target.event_type!=='delete'&&target.conversation_id===store.data.config.conversation_id;
    $('reply-target').textContent=canReply?'Đã chọn '+target.message_id+' · Bấm Trả lời trong khung vai muốn dùng.':'Chọn tin còn tồn tại trong cùng nguồn hội thoại để trả lời.';
    roleViews.forEach(view=>{view.fields['reply-selected'].disabled=!canReply;view.fields['reply-selected'].textContent=canReply?'↳ Trả lời '+target.message_id:'↳ Trả lời tin đã chọn';});
  }
  function formatTime(value) { return new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}); }
  function renderMessages() {
    const list=$('messages'); const scroll=list.scrollTop; const messages=currentMessages(); list.replaceChildren();
    if(!messages.length) {
      const empty=element('div','empty-state'); empty.append(element('div','empty-icon','☷'),element('h2','','Mỗi cuộc trò chuyện, nhiều câu chuyện.'),element('p','','Thêm thành viên, chọn người gửi và tạo những chủ đề đan xen. Dữ liệu của bạn được giữ nguyên, từng tin nhắn.'),element('span','empty-pill','BẮT ĐẦU VỚI MỘT TIN NHẮN'));list.append(empty);
    }
    messages.forEach(message=> {
      const member=memberById(message.sender_id); const row=element('article','message'+(selected===message.message_id?' selected':'')+(message.event_type==='delete'?' deleted':''));row.dataset.id=message.message_id;
      row.append(avatar(member)); const content=element('div','message-content');const meta=element('div','message-meta');meta.append(element('strong','',member.name)); const time=element('time','',formatTime(message.timestamp));time.dateTime=message.timestamp;meta.append(time);
      if(message.topic!==null)meta.append(element('span','topic-tag',message.topic)); if(message.event_type==='edit')meta.append(element('small','','đã sửa'));content.append(meta);
      if(message.reply_to) { const target=messageById(message.reply_to); const quote=button('↳ '+memberById(target.sender_id).name+': '+(target.event_type==='delete'?'[Tin nhắn đã xóa]':target.text),()=>selectMessage(target.message_id,true),'reply-quote');content.append(quote); }
      content.append(element('div','bubble',message.event_type==='delete'?'Tin nhắn đã được xóa':message.text));const actions=element('div','message-actions');
      if(message.event_type!=='delete') {
        actions.append(button('Trả lời',()=>startReply(message)),button('Sửa',()=>startEdit(message)),button('Xóa',()=>deleteMessage(message)));
      }
      actions.append(button('{ } '+message.message_id,()=>{selectMessage(message.message_id);showInspector();}));content.append(actions);row.append(content);row.addEventListener('click',()=>selectMessage(message.message_id));list.append(row);
    });
    list.scrollTop=scroll;
    $('message-count').textContent=messages.length+' tin nhắn · '+store.data.events.length+' sự kiện';
  }
  function renderInspector() {
    const message=messageById(selected);$('copy-selected').disabled=!message;
    $('selection-info').textContent=message ? message.message_id+' · '+memberById(message.sender_id).name+' · '+message.conversation_id : 'Chọn một tin nhắn để xem metadata và lịch sử sự kiện.';
    $('json-preview').textContent=JSON.stringify(message || {},null,2);$('event-history').replaceChildren();
    if(message) {
      const history=store.data.events.filter(event=>event.message_id===selected);
      $('event-history').append(element('strong','','Lịch sử · '+history.length+' sự kiện'));
      history.forEach((event,index)=>$('event-history').append(button((index+1)+'. '+event.event_type+' · '+formatTime(event.timestamp),()=>{$('json-preview').textContent=JSON.stringify(event,null,2);$('selection-info').textContent=message.message_id+' · Sự kiện '+(index+1)+' / '+history.length;})));
    }
  }
  function render() { renderMembers();renderRoles();renderMessages();renderInspector();$('group-label').textContent=store.data.config.group_id; for(const key of Object.keys(store.data.config))$('settings-form').elements[key].value=store.data.config[key]; }
  function selectMessage(id,scroll=false) { selected=id;renderMessages();renderInspector();updateReplyTargets();if(scroll)[...$('messages').children].find(node=>node.dataset.id===id)?.scrollIntoView({block:'center',behavior:'smooth'}); }
  function clearContext(view) {
    if(view.editing&&view.suspendedDraft) {view.fields['message-text'].value=view.suspendedDraft.text;view.reply=view.suspendedDraft.reply;}
    else view.reply=null;
    view.editing=null;view.suspendedDraft=null;view.fields['send-button'].textContent='Gửi tin nhắn ↗';
    view.fields.advanced.querySelectorAll('input,textarea').forEach(node=>node.disabled=false);
    refreshContext(view);
  }
  function refreshContext(view) {
    const target=messageById(view.reply);
    view.fields['compose-context'].hidden=!view.editing&&!target;
    view.fields['context-text'].textContent=view.editing?'Đang sửa '+view.editing+' · Giữ metadata nguồn':target?'Trả lời '+memberById(target.sender_id).name+' · '+target.text:'';
  }
  function startReply(message,roleId) {
    if(message.conversation_id!==store.data.config.conversation_id) {notify('Tin này thuộc '+message.conversation_id+'. Đổi cấu hình conversation_id trước khi trả lời.',true);return;}
    if(message.event_type==='delete')return;
    selectMessage(message.message_id);showRolePanel();
    if(!roleId){notify('Bấm Trả lời '+message.message_id+' trong khung vai ở bên phải.');return;}
    const view=roleViews.get(roleId);if(!view)return;clearContext(view);view.reply=message.message_id;refreshContext(view);focusRole(roleId);
  }
  function startEdit(message) {
    const view=roleViews.get(message.sender_id);if(!view)return;
    if(!view.editing)view.suspendedDraft={text:view.fields['message-text'].value,reply:view.reply};
    view.editing=message.message_id;view.reply=null;view.fields['message-text'].value=message.text;view.fields['send-button'].textContent='Lưu chỉnh sửa';
    view.fields.advanced.querySelectorAll('input,textarea').forEach(node=>node.disabled=node.dataset.field!=='timestamp');refreshContext(view);selectMessage(message.message_id);focusRole(message.sender_id);
  }
  function deleteMessage(message) {if(confirm('Xóa '+message.message_id+'? Bản gốc và lịch sử vẫn được giữ trong dữ liệu xuất.')) {if(mutate(()=>store.change(message.message_id,'delete'))) {roleViews.forEach(view=>{if(view.editing===message.message_id)clearContext(view);if(view.reply===message.message_id){view.reply=null;refreshContext(view);}});notify('Đã ghi sự kiện delete.');}}}
  function sendRole(roleId) {
    const view=roleViews.get(roleId);const f=view.fields;const text=f['message-text'].value;
    if(!text.trim()) {notify('Hãy nhập nội dung tin nhắn.',true);return;}
    let saved;
    if(mutate(()=>{
      const time=M.timestamp(f.timestamp.value);
      if(view.editing) saved=store.change(view.editing,'edit',text,time);
      else saved=store.send({sender_id:roleId,text,timestamp:time,participants:[...f.participants.querySelectorAll('input:checked')].map(input=>input.value),reply_to:view.reply,topic:f.topic.value===''?null:f.topic.value,media_text:f['media-text'].value===''?null:f['media-text'].value,acl:JSON.parse(f.acl.value)});
    })) {
      selected=saved.message_id;
      if(view.editing)clearContext(view);else{f['message-text'].value='';view.reply=null;refreshContext(view);}
      renderMessages();renderInspector();updateReplyTargets();$('messages').scrollTop=$('messages').scrollHeight;focusRole(roleId);
    }
  }
  function openMember(member) {memberEditing=member?.id || null;$('member-dialog-title').textContent=member?'Sửa tên thành viên':'Thêm thành viên';$('member-name').value=member?.name || '';$('member-id').value=member?.id || '';$('member-id').disabled=!!member;$('member-dialog').showModal();$('member-name').focus();}
  $('add-member').addEventListener('click',()=>openMember());$('close-member').addEventListener('click',()=>$('member-dialog').close());
  $('member-form').addEventListener('submit',event=>{event.preventDefault();if(mutate(()=>memberEditing?store.renameMember(memberEditing,$('member-name').value):store.addMember($('member-name').value,$('member-id').value.trim())))$('member-dialog').close();});
  $('settings-form').addEventListener('submit',event=>{event.preventDefault();const config=Object.fromEntries(new FormData(event.target));if(mutate(()=>store.data.config=M.validateConfig(config))){roleViews.forEach(view=>{if(!view.editing&&messageById(view.reply)?.conversation_id!==config.conversation_id){view.reply=null;refreshContext(view);}if(view.suspendedDraft&&messageById(view.suspendedDraft.reply)?.conversation_id!==config.conversation_id)view.suspendedDraft.reply=null;});notify('Đã lưu cấu hình. Tin nhắn cũ giữ nguyên metadata.');}});
  const exportText=()=>JSON.stringify(store.data,null,2);
  $('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([exportText()],{type:'application/json;charset=utf-8'}));const link=element('a');link.href=url;link.download='chat22-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Đã xuất gói JSON gồm thành viên, cấu hình và toàn bộ sự kiện.');});
  async function copy(text) {try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else{const input=element('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw new Error('Trình duyệt từ chối clipboard.');}notify('Đã sao chép JSON.');}catch(error){notify('Không sao chép được. Hãy dùng Xuất JSON. '+error.message,true);}}
  $('copy-all').addEventListener('click',()=>copy(exportText()));$('copy-selected').addEventListener('click',()=>copy($('json-preview').textContent));
  $('import').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async event=> {
    const file=event.target.files[0];if(!file)return;
    try {
      const incoming=M.importData(JSON.parse(await file.text()));
      if(!confirm('Thay thế dữ liệu hiện tại bằng '+incoming.members.length+' thành viên và '+incoming.events.length+' sự kiện? Hãy xuất dữ liệu hiện tại nếu cần giữ lại.'))return;
      incoming.nextId=Math.max(incoming.nextId,store.data.nextId);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(incoming));store=new M.Store(incoming);storageBlocked=false;selected=null;sender='';roleViews.clear();$('role-composers').replaceChildren();render();notify('Đã nhập và kiểm tra dữ liệu thành công.');
    }catch(error){notify('Không nhập dữ liệu: '+error.message,true);}finally{event.target.value='';}
  });
  $('reset').addEventListener('click',()=>{if(!confirm('Đặt lại toàn bộ thành viên và hội thoại? Dữ liệu trên thiết bị sẽ bị xóa. Hãy xuất JSON trước nếu cần lưu giữ.'))return;try{const next=M.empty();next.nextId=store.data.nextId;localStorage.setItem(STORAGE_KEY,JSON.stringify(next));store=new M.Store(next);storageBlocked=false;selected=null;sender='';roleViews.clear();$('role-composers').replaceChildren();render();notify('Đã đặt lại dữ liệu.');}catch(error){notify('Không đặt lại được: '+error.message,true);}});
  function showInspector() {document.body.classList.add('data-visible');$('toggle-inspector').textContent='↩ Khung đóng vai';$('toggle-inspector').setAttribute('aria-expanded','true');}
  $('toggle-inspector').addEventListener('click',()=>{if(document.body.classList.contains('data-visible'))showRolePanel();else showInspector();});
  window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY){storageBlocked=true;notify('Dữ liệu đã thay đổi ở tab khác. Tải lại trang trước khi tiếp tục để tránh ghi đè.',true);}});
  render();
})();
