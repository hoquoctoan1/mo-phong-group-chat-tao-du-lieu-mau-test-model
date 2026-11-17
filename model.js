/* Data model shared by the browser and the dependency-free test suite. */
(function (root) {
  'use strict';
  const FIELDS = ['message_id','conversation_id','channel_id','group_id','sender_id','timestamp','text','participants','reply_to','topic','media_text','acl','event_type'];
  const DEFAULT_CONFIG = {conversation_id:'conv_1',channel_id:'c_sales',group_id:'G01'};
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const uniqueStrings = value => Array.isArray(value) && value.every(nonempty) && new Set(value).size === value.length;
  function timestamp(local) {
    if (local) {
      const result = local.length === 16 ? local + ':00+07:00' : local + '+07:00';
      if (!validTimestamp(result)) fail('Thời gian không hợp lệ.');
      return result;
    }
    return new Date(Date.now() + 7 * 3600000).toISOString().slice(0,23) + '+07:00';
  }
  function validTimestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?\+07:00$/.test(value)) return false;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return false;
    const normalized = new Date(date.getTime() + 7 * 3600000).toISOString();
    return normalized.slice(0,19) === value.slice(0,19);
  }
  function validateConfig(config) {
    if (!config || !Object.keys(DEFAULT_CONFIG).every(key => nonempty(config[key]))) fail('Cấu hình nguồn phải có đủ ba ID.');
    return Object.fromEntries(Object.keys(DEFAULT_CONFIG).map(key => [key, config[key]]));
  }
  function latest(events) {
    const map = new Map();
    for (const event of events) map.set(event.message_id, event);
    return [...map.values()]; // Map retains original send order, independent of timestamps.
  }
  function validateEvents(events, members) {
    if (!Array.isArray(events)) fail('events phải là một mảng JSON.');
    const users = new Set(members.map(member => member.id));
    const seen = new Map();
    events.forEach((event,index) => {
      const prefix = `Sự kiện ${index + 1}: `;
      if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).length !== FIELDS.length || !FIELDS.every(key => Object.hasOwn(event,key))) fail(prefix + 'cần đúng 13 trường theo schema.');
      for (const key of ['message_id','conversation_id','channel_id','group_id','sender_id']) if (!nonempty(event[key])) fail(prefix + key + ' phải là chuỗi có nội dung.');
      if (!users.has(event.sender_id)) fail(prefix + 'sender_id không tồn tại.');
      if (!validTimestamp(event.timestamp)) fail(prefix + 'timestamp phải là ISO 8601 hợp lệ với +07:00.');
      if (typeof event.text !== 'string' || !event.text.trim()) fail(prefix + 'text phải có nội dung.');
      if (!uniqueStrings(event.participants) || !event.participants.every(id => users.has(id))) fail(prefix + 'participants chứa ID không hợp lệ hoặc trùng.');
      if (!uniqueStrings(event.acl) || !event.acl.length) fail(prefix + 'acl phải là mảng chuỗi không rỗng, không trùng.');
      for (const key of ['topic','media_text']) if (event[key] !== null && typeof event[key] !== 'string') fail(prefix + key + ' phải là chuỗi hoặc null.');
      if (event.reply_to !== null && !nonempty(event.reply_to)) fail(prefix + 'reply_to phải là ID hoặc null.');
      if (!['new','edit','delete'].includes(event.event_type)) fail(prefix + 'event_type không hợp lệ.');
      const previous = seen.get(event.message_id);
      if (event.event_type === 'new') {
        if (previous) fail(prefix + 'trùng message_id của tin gốc.');
        if (event.reply_to !== null) {
          const target = seen.get(event.reply_to);
          if (!target || target.event_type === 'delete' || target.conversation_id !== event.conversation_id) fail(prefix + 'reply_to phải trỏ tới tin còn tồn tại trong cùng conversation_id.');
        }
      } else {
        if (!previous || previous.event_type === 'delete') fail(prefix + 'edit/delete phải có tin gốc còn tồn tại.');
        for (const key of ['conversation_id','channel_id','group_id','sender_id','reply_to','participants','topic','media_text','acl']) {
          if (JSON.stringify(event[key]) !== JSON.stringify(previous[key])) fail(prefix + 'không được thay đổi metadata gốc: ' + key);
        }
        if (event.event_type === 'delete' && event.text !== previous.text) fail(prefix + 'delete phải giữ nội dung trước khi xóa.');
      }
      seen.set(event.message_id,event);
    });
    return events;
  }
  function validateMembers(members) {
    if (!Array.isArray(members)) fail('members phải là mảng.');
    const ids = new Set();
    return members.map((member,index) => {
      if (!member || !nonempty(member.id) || !nonempty(member.name) || ids.has(member.id)) fail('Thành viên không hợp lệ hoặc ID trùng.');
      ids.add(member.id);
      return {id:member.id,name:member.name,color:color(index)};
    });
  }
  function color(index) { return `hsl(${(index * 137.508 + 215) % 360} 58% 53%)`; }
  function empty() { return {version:1,config:{...DEFAULT_CONFIG},members:[],events:[],nextId:1}; }
  function importData(input) {
    let members,events,config;
    if (Array.isArray(input)) {
      events = input;
      const ids = new Set();
      events.forEach(event => { if (event && typeof event.sender_id === 'string') ids.add(event.sender_id); if (event && Array.isArray(event.participants)) event.participants.filter(id => typeof id === 'string').forEach(id => ids.add(id)); });
      members = [...ids].map(id => ({id,name:id}));
      config = events.length ? {conversation_id:events[0].conversation_id,channel_id:events[0].channel_id,group_id:events[0].group_id} : DEFAULT_CONFIG;
    } else {
      if (!input || input.version !== 1) fail('Tệp phải là gói dữ liệu version 1 hoặc mảng sự kiện.');
      ({members,events,config} = input);
    }
    members = validateMembers(members);
    config = validateConfig(config);
    validateEvents(events,members);
    const maxId = events.reduce((max,event) => Math.max(max, /^msg_\d+$/.test(event.message_id) ? Number(event.message_id.slice(4)) : 0),0);
    if (!Number.isSafeInteger(maxId) || maxId >= Number.MAX_SAFE_INTEGER - 1) fail('ID số vượt giới hạn hỗ trợ.');
    const nextId = !Array.isArray(input) && Number.isSafeInteger(input.nextId) && input.nextId > 0 ? Math.max(input.nextId,maxId + 1) : maxId + 1;
    return {version:1,config,members,events:clone(events),nextId};
  }
  class Store {
    constructor(data) { this.data = data ? importData(data) : empty(); }
    addMember(name,id) {
      if (!nonempty(name) || !/^[A-Za-z0-9_-]+$/.test(id)) fail('Tên và ID thành viên không hợp lệ.');
      if (this.data.members.some(member => member.id === id)) fail('ID thành viên đã tồn tại.');
      this.data.members.push({id,name,color:color(this.data.members.length)});
    }
    renameMember(id,name) {
      if (!nonempty(name)) fail('Tên không được để trống.');
      const member = this.data.members.find(item => item.id === id);
      if (!member) fail('Không tìm thấy thành viên.');
      member.name = name;
    }
    send(values) {
      if (!Number.isSafeInteger(this.data.nextId) || this.data.nextId >= Number.MAX_SAFE_INTEGER) fail('Đã hết dải ID.');
      let id;
      do { id = 'msg_' + String(this.data.nextId++).padStart(3,'0'); } while (this.data.events.some(event => event.message_id === id));
      const event = {message_id:id,...validateConfig(this.data.config),sender_id:values.sender_id,timestamp:values.timestamp || timestamp(),text:values.text,participants:values.participants || [],reply_to:values.reply_to ?? null,topic:values.topic ?? null,media_text:values.media_text ?? null,acl:values.acl || ['*'],event_type:'new'};
      this.append(event);
      return event;
    }
    change(id,type,text,time) {
      if (!['edit','delete'].includes(type)) fail('Chỉ hỗ trợ edit hoặc delete.');
      const previous = latest(this.data.events).find(event => event.message_id === id);
      if (!previous || previous.event_type === 'delete') fail('Tin nhắn không còn tồn tại.');
      const event = {...clone(previous),text:type === 'edit' ? text : previous.text,timestamp:time || timestamp(),event_type:type};
      this.append(event);
      return event;
    }
    append(event) {
      const events = [...this.data.events,event];
      validateEvents(events,this.data.members);
      this.data.events.push(clone(event));
    }
  }
  root.ChatModel = {Store,FIELDS,timestamp,validTimestamp,latest,importData,validateConfig,empty};
  if (typeof module !== 'undefined') module.exports = root.ChatModel;
})(typeof globalThis !== 'undefined' ? globalThis : window);
