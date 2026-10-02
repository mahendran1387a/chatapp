import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAppServer } from '../scripts/serve.mjs';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { test, before, after } from 'node:test';

let base;
let server, browser;
before(async () => {
  server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server,'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({args:['--no-sandbox']});
});
after(async () => { await browser?.close(); server?.closeAllConnections(); await new Promise(resolve=>server?.close(resolve)); });

// Offline Firebase boundary fixture. The browser runs the real application module;
// external requests are blocked, and no actual Firebase accounts/data are used.
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const names = app.match(/import \{([^}]+)\} from '\.\/firebase-chat.js'/)[1].split(',').map(s=>s.trim()).filter(Boolean);
const fixture = `
const listeners = new Map();
const me = {uid:'self',email:'me@example.test',displayName:'Me',getIdToken:async()=> 'fixture'};
const users = [me,{uid:'alpha',email:'alpha@example.test',displayName:'Alpha',approved:true},{uid:'beta',email:'beta@example.test',displayName:'Beta',approved:true}];
const messages = [{id:'own',text:'Hello from me',senderUid:'self',direction:'out',senderDisplayName:'Me',readBy:['self'],time:'10:00'}, {id:'incoming',text:'Hello from Alpha',senderUid:'alpha',direction:'in',readBy:['alpha'],time:'10:01'}];
window.review = {me,users,messages,calls:[],emit(kind,data){for(const fn of [...(listeners.get(kind)??[])])fn(data);}};
function sub(kind, fn, initial){const set=listeners.get(kind)??new Set();listeners.set(kind,set);set.add(fn);queueMicrotask(()=>{if(set.has(fn))fn(initial)});return()=>set.delete(fn)}
const implementations = {
 signInWithGoogle:async()=>{throw new Error('Fixture popup failed')},
 startAuthListener:(fn)=>sub('auth',fn,me), saveUserProfile:async()=>{}, setUserOnlineStatus:async()=>{},
 getFirebaseSetupStatus:()=>({configured:true}), isFamilyOwnerEmail:()=>false,
 subscribeCurrentUserProfile:(uid,fn)=>sub('profile',fn,{uid,approved:true}),
 subscribeAuthenticatedUsers:(fn)=>sub('users',fn,users),
 subscribeUserGroups:(uid,fn)=>sub('groups',fn,[]),
 subscribeDiscoverableGroups:(uid,fn)=>sub('available',fn,[{id:'joinable',type:'group',groupName:'Space Club',memberIds:['alpha','beta']}]),
 subscribeConversationMessages:(uid,other,fn,error,shouldRead=()=>true)=>sub('messages:'+other,data=>{if(shouldRead())review.receiptChecks=(review.receiptChecks??0)+1;fn(data)},other==='alpha'?messages:[]),
 subscribeGroupMessages:(id,uid,fn)=>sub('messages:'+id,fn,[]),
 subscribeOwnGroupJoinRequests:(uid,fn)=>sub('requests',fn,[]),
 subscribeManagedGroupJoinRequests:(groups,user,fn)=>sub('managed',fn,[]),
 subscribePendingFamilyUsers:(fn)=>sub('pending',fn,[]), subscribeFamilyInvites:(fn)=>sub('invites',fn,[]),
 logoutGoogleUser:async()=>window.review.emit('auth',null),
 sendFirebaseMessage:async(uid,text)=>{window.review.calls.push(['send',uid,text]); if(window.review.sendDelay) await new Promise(r=>setTimeout(r,window.review.sendDelay));},
 createFirebaseGroup:async({groupName,memberUids},user)=>{await new Promise(r=>setTimeout(r,review.groupDelay??0));return {id:'created',type:'group',groupName,memberIds:[user.uid,...memberUids],createdBy:user.uid,hostId:user.uid};},
 updateFirebaseMessage:async(contact,id,text,user)=>{window.review.calls.push(['edit',contact.id,id,text,user.uid]);},
 deleteFirebaseMessage:async(contact,id,user)=>{window.review.calls.push(['delete',contact.id,id,user.uid]);}
};
${names.map(name=>`export const ${name} = implementations.${name} ?? (()=>()=>{});`).join('\n')}
`;

async function pageFor(size={width:1280,height:850}) {
 const context=await browser.newContext({viewport:size});
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url===base+'/src/firebase-chat.js') return route.fulfill({contentType:'text/javascript',body:fixture});
  if(!url.startsWith(base)) return route.abort();
  return route.continue();
 });
 let voiceSocket,voiceOffer;
 await context.routeWebSocket('**/voice',ws=>{voiceSocket=ws;ws.onMessage(raw=>{const m=JSON.parse(raw);if(m.type==='call-offer')voiceOffer=m;if(m.type==='hello')ws.send(JSON.stringify({type:'voice-ready',uid:m.uid,onlineUids:['self','alpha','beta']}));})});
 const page=await context.newPage();
 await page.exposeFunction('getFixtureVoiceOffer',()=>voiceOffer??null);
 await page.exposeFunction('sendFixtureVoiceMessage',message=>voiceSocket.send(JSON.stringify(message)));
 await page.goto(base);
 await page.waitForSelector('.chat-name');
 return {page,context};
}

async function check(name, fn) { test(name, async () => {const {page,context}=await pageFor();try{await fn(page)}finally{await context.close()}}); }
await check('clicking a chat name opens that conversation',async page=>{
 await page.locator('.chat-name').filter({hasText:'Beta'}).click();
 assert.equal(await page.locator('.conversation-title strong').textContent(),'Beta');
 assert.equal(await page.locator('.contact-context-menu').count(),0);
});
await check('new messages appear while typing without losing the draft',async page=>{
 await page.locator('#messageInput').fill('My draft');
 await page.evaluate(()=>review.emit('messages:alpha',[...review.messages,{id:'new',text:'A new message',senderUid:'alpha',direction:'in',time:'10:02',readBy:[]}])) ;
 assert.match(await page.locator('#messages').textContent(),/A new message/);
 assert.equal(await page.locator('#messageInput').inputValue(),'My draft');
});
await check('live friend updates preserve composer focus and draft',async page=>{
 await page.locator('#messageInput').fill('Keep this draft');
 await page.evaluate(()=>review.emit('users',review.users));
 assert.equal(await page.locator('#messageInput').inputValue(),'Keep this draft');
 assert.equal(await page.locator('#messageInput').evaluate(el=>el===document.activeElement),true);
});
await check('Google display names render as text rather than HTML',async page=>{
 await page.evaluate(()=>review.emit('users',[...review.users,{uid:'evil',email:'safe@example.test',approved:true,displayName:'<img src=x onerror="window.injected=true">'}]));
 assert.equal(await page.locator('.chat-name img').count(),0);
 assert.equal(await page.locator('.chat-name').filter({hasText:'<img src=x'}).count(),1);
});
await check('only the sender can edit or delete a message',async page=>{
 await page.locator('[data-message-id="incoming"]').click({button:'right'});
 assert.equal(await page.locator('[data-message-menu-action]').count(),0);
});
await check('deleting a sent message persists it to Firebase',async page=>{
 await page.locator('[data-message-id="own"]').click({button:'right'});
 await page.locator('[data-message-menu-action="delete"]').click();
 assert.deepEqual(await page.evaluate(()=>review.calls.filter(c=>c[0]==='delete')), [['delete','alpha','own','self']]);
});
await check('editing a sent message persists it to Firebase',async page=>{
 await page.locator('[data-message-id="own"]').click({button:'right'});
 await page.locator('[data-message-menu-action="edit"]').click();
 await page.locator('#editMessageForm textarea').fill('Edited hello');
 await page.locator('#editMessageForm button[type=submit]').click();
 await page.waitForFunction(()=>!document.querySelector('#editMessageForm'));
 assert.deepEqual(await page.evaluate(()=>review.calls.filter(c=>c[0]==='edit')), [['edit','alpha','own','Edited hello','self']]);
});
await check('typing during a send keeps the next message draft',async page=>{
 await page.evaluate(()=>review.sendDelay=200);
 await page.locator('#messageInput').fill('First message');
 await page.locator('#composer button[type=submit]').click();
 await page.locator('#messageInput').fill('Next draft');
 await page.waitForTimeout(300);
 assert.equal(await page.locator('#messageInput').inputValue(),'Next draft');
});
await check('switching accounts clears the previous account chat cache',async page=>{
 await page.evaluate(()=>review.emit('auth',null));
 assert.equal(await page.locator('.bubble').count(),0);
});
await check('friend search keeps existing group join controls',async page=>{
 await page.locator('[data-section="friends"]').click();
 await page.locator('#friendSearchInput').fill('Alpha');
 assert.equal(await page.locator('[data-request-group-join="joinable"]').count(),1);
});

test('voice call says Connected only after the peer connects', async () => {
  const {page,context} = await pageFor();
  try {
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => ({active:true,getAudioTracks:()=>[{readyState:'live',enabled:true}],getTracks:()=>[{stop(){}}]});
      window.RTCPeerConnection = class extends EventTarget {
        constructor(){super();review.peer=this;this.connectionState='new';}
        addTrack(){} async createOffer(){return {type:'offer',sdp:'fixture'};}
        async setLocalDescription(){} close(){}
      };
    });
    await page.locator('[data-action="voiceCall"]').click();
    await page.locator('[data-start-voice-call]').click();
    await page.waitForFunction(()=>review.peer);
    assert.equal(await page.locator('[data-voice-call-dialog] h2').textContent(),'Calling');
    await page.evaluate(()=>{review.peer.connectionState='connected';review.peer.dispatchEvent(new Event('connectionstatechange'));});
    assert.equal(await page.locator('[data-voice-call-dialog] h2').textContent(),'Connected');
  } finally {await context.close();}
});

for (const size of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1280,height:850}]) {
 test(`chat and friends screens fit ${size.width}px wide`,async()=>{
  const {page,context}=await pageFor(size);
  try {
    // A named row is the natural navigation target on a touch screen.
    await page.locator('.chat-name').filter({hasText:'Alpha'}).click();
    const composer=await page.locator('#composer').boundingBox();
    assert.ok(composer && composer.x>=0 && composer.x+composer.width<=size.width+1 && composer.y+composer.height<=size.height+1,'composer stays in viewport');
    await page.locator('[data-sticker-toggle]').click();
    const picker=await page.locator('[data-sticker-picker]').boundingBox();
    assert.ok(picker.x>=0 && picker.x+picker.width<=size.width+1,'sticker picker stays in viewport');
    if(process.env.REVIEW_SCREENSHOTS) await page.screenshot({path:`${process.env.REVIEW_SCREENSHOTS}/chat-${size.width}.png`});
    if(size.width<=850) await page.locator('[data-mobile-chat-back]').click();
    await page.locator('[data-section="friends"]').click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal document overflow');
    const button=await page.locator('.create-group-shortcut').boundingBox();
    assert.ok(button && button.y+button.height<=size.height,'create group control remains reachable');
    if(process.env.REVIEW_SCREENSHOTS) await page.screenshot({path:`${process.env.REVIEW_SCREENSHOTS}/friends-${size.width}.png`});
  } finally {await context.close();}
 });
}

await check('a short message does not include template indentation as blank lines',async page=>{
 const bubble=await page.locator('[data-message-id="own"]').boundingBox();
 assert.ok(bubble.height<110,`short message height ${bubble.height}`);
});
await check('group join button shows its full label',async page=>{
 await page.locator('[data-section="friends"]').click();
 assert.ok(await page.locator('[data-request-group-join]').evaluate(el=>el.scrollWidth<=el.clientWidth),'group join label is not clipped');
});

await check('incoming messages update unread chats without opening them',async page=>{
 await page.evaluate(()=>review.emit('messages:beta',[{id:'beta-new',text:'Hello from Beta',senderUid:'beta',direction:'in',readBy:['beta'],time:'10:03'}]));
 await page.locator('[data-filter="unread"]').click();
 assert.equal(await page.locator('.chat-name').filter({hasText:'Beta'}).count(),1);
 assert.match(await page.locator('.chat-item').filter({hasText:'Beta'}).textContent(),/Hello from Beta/);
 await page.locator('.chat-name').filter({hasText:'Beta'}).click();
 assert.equal(await page.locator('.unread').count(),0);
});
await check('chat subscriptions restart when family approval is restored',async page=>{
 await page.evaluate(()=>review.emit('profile',{uid:'self',approved:false}));
 await page.evaluate(()=>review.emit('profile',{uid:'self',approved:true}));
 await page.waitForTimeout(50);
 assert.equal(await page.locator('.chat-name').filter({hasText:'Alpha'}).count(),1);
});
await check('signing out during a send does not crash or restore old messages',async page=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(()=>review.sendDelay=200);
 await page.locator('#messageInput').fill('Pending message');
 await page.locator('#composer button[type=submit]').click();
 await page.evaluate(()=>review.emit('auth',null));
 await page.waitForTimeout(300);
 assert.deepEqual(errors,[]);
 assert.equal(await page.locator('.bubble').count(),0);
});

await check('a live snapshot during send keeps pending state and clears the sent draft',async page=>{
 await page.evaluate(()=>review.sendDelay=250);
 await page.locator('#messageInput').fill('Snapshot send');
 await page.locator('#composer button[type=submit]').click();
 await page.evaluate(()=>review.emit('messages:alpha',review.messages));
 assert.equal(await page.locator('#composer button[type=submit]').isDisabled(),true);
 await page.waitForTimeout(300);
 assert.equal(await page.locator('#messageInput').inputValue(),'');
 assert.equal(await page.locator('#composer button[type=submit]').isDisabled(),false);
});

await check('removed group shortcuts can be reopened without joining again',async page=>{
 await page.evaluate(()=>{const group={id:'club',type:'group',groupName:'Our Club',memberIds:['self','alpha'],createdBy:'alpha',hostId:'alpha'};review.emit('groups',[group]);review.emit('available',[group]);});
 await page.locator('.chat-name').filter({hasText:'Our Club'}).click({button:'right'});
 await page.locator('[data-contact-menu-action="delete-contact"]').click();
 await page.locator('[data-section="friends"]').click();
 assert.equal(await page.locator('[data-open-existing-group="club"]').count(),1);
 await page.locator('[data-open-existing-group="club"]').click();
 assert.equal(await page.locator('.conversation-title strong').textContent(),'Our Club');
 assert.equal(await page.locator('.chat-name').filter({hasText:'Our Club'}).count(),1);
});

test('messages stay unread while a phone shows the chat list',async()=>{
 const {page,context}=await pageFor({width:390,height:844});
 try {
  await page.locator('.chat-name').filter({hasText:'Alpha'}).click();
  await page.locator('[data-mobile-chat-back]').click();
  await page.evaluate(()=>review.emit('messages:alpha',[...review.messages,{id:'phone-new',text:'Phone incoming',senderUid:'alpha',direction:'in',readBy:['alpha'],time:'10:04'}]));
  await page.locator('[data-filter="unread"]').click();
  assert.equal(await page.locator('.chat-name').filter({hasText:'Alpha'}).count(),1);
  assert.ok(Number(await page.locator('.unread').textContent())>0);
 }finally{await context.close();}
});

await check('signing out while microphone permission is pending releases the microphone',async page=>{
 await page.evaluate(()=>{
  navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>review.resolveMic=resolve);
  review.stopped=false;
  window.RTCPeerConnection=class extends EventTarget {addTrack(){} async createOffer(){return {type:'offer',sdp:'fixture'}} async setLocalDescription(){} close(){}};
 });
 await page.locator('[data-action="voiceCall"]').click();
 await page.locator('[data-start-voice-call]').click();
 await page.waitForFunction(()=>review.resolveMic);
 await page.evaluate(()=>{review.emit('auth',null);review.resolveMic({active:true,getAudioTracks:()=>[{readyState:'live',enabled:true}],getTracks:()=>[{stop(){review.stopped=true}}]});});
 await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>review.stopped),true);
 assert.equal(await page.locator('[data-voice-call-dialog]').count(),0);
});
await check('late connection events cannot revive an ended voice call',async page=>{
 await page.evaluate(()=>{
  navigator.mediaDevices.getUserMedia=async()=>({active:true,getAudioTracks:()=>[{readyState:'live',enabled:true}],getTracks:()=>[{stop(){}}]});
  window.RTCPeerConnection=class extends EventTarget {constructor(){super();review.peer=this;this.connectionState='new'} addTrack(){} async createOffer(){return {type:'offer',sdp:'fixture'}} async setLocalDescription(){} close(){}};
 });
 await page.locator('[data-action="voiceCall"]').click();
 await page.locator('[data-start-voice-call]').click();
 await page.waitForFunction(()=>review.peer);
 await page.locator('[data-voice-call-end]').click();
 await page.evaluate(()=>{review.peer.connectionState='connected';review.peer.dispatchEvent(new Event('connectionstatechange'));});
 assert.equal(await page.locator('[data-voice-call-dialog] h2').textContent(),'Ended');
});

await check('a group creation finishing after sign-out cannot mutate the next account',async page=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(()=>review.groupDelay=200);
 await page.locator('[data-section="friends"]').click();
 await page.locator('.create-group-shortcut').click();
 await page.locator('#createGroupForm input[name="groupName"]').fill('Pending club');
 await page.locator('#createGroupForm [data-group-member]').first().check();
 await page.locator('#createGroupForm button[type=submit]').click();
 await page.evaluate(()=>review.emit('auth',null));
 await page.waitForTimeout(300);
 assert.deepEqual(errors,[]);
 assert.equal(await page.locator('.chat-name').count(),0);
 assert.doesNotMatch(await page.locator('body').textContent(),/Cannot read properties|Group created/);
});

test('reopening a phone conversation resumes read receipts for displayed messages',async()=>{
 const {page,context}=await pageFor({width:390,height:844});
 try {
  await page.locator('.chat-name').filter({hasText:'Alpha'}).click();
  await page.locator('[data-mobile-chat-back]').click();
  await page.evaluate(()=>review.emit('messages:alpha',[...review.messages,{id:'return-new',text:'Read on return',senderUid:'alpha',direction:'in',readBy:['alpha'],time:'10:04'}]));
  const before=await page.evaluate(()=>review.receiptChecks??0);
  await page.locator('.chat-name').filter({hasText:'Alpha'}).click();
  await page.waitForTimeout(50);
  assert.ok(await page.evaluate(()=>review.receiptChecks??0)>before,'visible conversation restarts its reader');
 }finally{await context.close();}
});

await check('Google sign-in failures are shown while signed out',async page=>{
 await page.evaluate(()=>review.emit('auth',null));
 await page.locator('[data-auth-sign-in]').click();
 await page.waitForTimeout(50);
 assert.match(await page.locator('.auth-gate').textContent(),/Fixture popup failed/);
});
await check('SDP completion cannot overwrite an already connected voice call',async page=>{
 await page.evaluate(()=>{
  navigator.mediaDevices.getUserMedia=async()=>({active:true,getAudioTracks:()=>[{readyState:'live',enabled:true}],getTracks:()=>[{stop(){}}]});
  window.RTCPeerConnection=class extends EventTarget {constructor(){super();review.peer=this;this.connectionState='new'} addTrack(){} async createOffer(){return {type:'offer',sdp:'fixture'}} async setLocalDescription(){} async setRemoteDescription(){this.remoteDescription={};this.connectionState='connected';this.dispatchEvent(new Event('connectionstatechange'))} close(){}};
 });
 await page.locator('[data-action="voiceCall"]').click();
 await page.locator('[data-start-voice-call]').click();
 await page.waitForFunction(()=>review.peer);
 let offer;
 for(let attempt=0;attempt<50&&!offer;attempt++){offer=await page.evaluate(()=>getFixtureVoiceOffer());if(!offer)await page.waitForTimeout(20)}
 assert.ok(offer,'offer was sent');
 await page.evaluate(offer=>sendFixtureVoiceMessage({type:'call-answer',callId:offer.callId,senderUid:'alpha',recipientUid:'self',answer:{type:'answer',sdp:'fixture'}}),offer);
 await page.waitForTimeout(50);
 assert.equal(await page.locator('[data-voice-call-dialog] h2').textContent(),'Connected');
});
