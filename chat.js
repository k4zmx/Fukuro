// Chat: plain conversations with Claude on this PC's Claude Code sign-in. Haiku by default, answers stream in.
// Only the last few messages go with each question, so long chats stay cheap.
const CH = {list: store.get('chats', []), cur: store.get('chatCur', null), live: null, model: store.get('chatModel', 'haiku'), mine: false};
const saveChats = () => { CH.list = CH.list.slice(0, 60); store.set('chats', CH.list); store.set('chatCur', CH.cur); };
const chatById = id => CH.list.find(c => c.id === id);
const CHI = {
  send:svg('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>', 18), stop:svg('<rect x="7" y="7" width="10" height="10" rx="2"/>', 16),
  plus:svg('<path d="M12 5v14M5 12h14"/>', 15), x:svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 13), copy:svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>', 14),
};
const CH_TRIES = ['Explain a concept from my course simply', 'Help me write a message to my teacher', 'Quiz me on something I am learning', 'Give me a plan for a productive evening'];

function chatSystem(){
  const now = new Date();
  let s = `You are Fukurō, a friendly assistant inside the user's personal desktop app. Talk like a helpful friend: clear and direct, short by default (a few sentences), longer only when asked or when it truly needs it. Use Markdown ("- " list items, tables, code blocks) only when it helps. Reply in the user's language. Today is ${DAY_NAMES[now.getDay()]} ${iso(now)}, ${fmt(now.getHours() * 60 + now.getMinutes())}.`;
  if (CH.mine) s += `\n\nThe user's day, from the app: ${digestText(now)}`
    + (TD.list.some(t => !t.done) ? `\nOpen to-dos: ${TD.list.filter(t => !t.done).slice(0, 8).map(t => t.text + (t.due ? ` (due ${t.due})` : '')).join('; ')}` : '');
  return s;
}
// earlier turns go in as a transcript; Claude Code keeps no session between calls
function chatPrompt(c){
  const msgs = c.msgs.filter(m => !m.err), last = msgs[msgs.length - 1], before = msgs.slice(-11, -1);
  if (!before.length) return last.t;
  return 'Earlier in this conversation:\n\n' + before.map(m => `${m.r === 'u' ? 'User' : 'You'}: ${m.t.length > 2500 ? m.t.slice(0, 2500) + ' […]' : m.t}`).join('\n\n')
    + `\n\nThe user now says:\n${last.t}`;
}

async function chatSend(text){
  text = text.trim(); if (!text || CH.live || !aiReady()) return;
  let c = chatById(CH.cur);
  if (!c) { c = {id:uid('c'), title:text.replace(/\s+/g, ' ').slice(0, 48), at:Date.now(), msgs:[]}; CH.list.unshift(c); CH.cur = c.id; }
  c.msgs = c.msgs.filter(m => !m.err);
  c.msgs.push({r:'u', t:text}); c.at = Date.now();
  CH.list.sort((a, b) => b.at - a.at); saveChats();
  const id = uid('q'), model = CH.model;
  CH.live = {id, chat:c.id, text:''};
  aiBump(); MODS.chat.render();
  const r = await desk.ai.chat({id, system:chatSystem(), prompt:chatPrompt(c), model});
  CH.live = null;
  if (r.ok) c.msgs.push({r:'a', t:r.text.trim(), m:model});
  else c.msgs.push({r:'a', t:/missing|not logged|login/i.test(r.error) ? 'Claude Code is not signed in on this PC.' : `No answer (${r.error})`, err:true});
  saveChats();
  if (window.VIEW === 'chat') MODS.chat.render(); else toast('Chat answered', [['Open', () => go('chat')]]);
}
// streamed text: only the live bubble is redrawn, once per frame
let chatRaf = 0;
if (DESK && desk.ai?.onDelta) desk.ai.onDelta((id, t) => {
  if (CH.live?.id !== id) return;
  CH.live.text += t;
  if (!chatRaf) chatRaf = requestAnimationFrame(() => {
    chatRaf = 0;
    const b = $('chLive'); if (!b || !CH.live) return;
    b.innerHTML = mdToHtml(CH.live.text); b.classList.remove('wait'); chatScroll();
  });
});
function chatScroll(){ const s = $('chMsgs'); if (s && s.scrollHeight - s.scrollTop - s.clientHeight < 160) s.scrollTop = s.scrollHeight; }

function chatMsgHTML(m, i){
  if (m.r === 'u') return `<div class="ch-m u"><div class="ch-b">${esc(m.t).replace(/\n/g, '<br>')}</div></div>`;
  return `<div class="ch-m a${m.err ? ' err' : ''}"><span class="owl"></span><div class="ch-b md">${m.err ? `<p>${esc(m.t)}</p><button class="btn" data-ch="retry">Try again</button>` : mdToHtml(m.t)}</div>
    ${m.err ? '' : `<button class="ch-copy" data-ch="copy" data-i="${i}" title="Copy">${CHI.copy}</button>`}</div>`;
}
function chatGate(){
  if (!DESK) return '<p class="empty-state">Chat works in the desktop app, through Claude Code on your PC.</p>';
  if (!AI.status) return '<p class="empty-state">Checking Claude Code…</p>';
  if (!AI.status.found) return '<p class="empty-state">Chat uses Claude Code on this PC. Install it, sign in once, then come back.</p>';
  if (!AI.status.loggedIn) return '<p class="empty-state">Claude Code is installed but not signed in. Open a terminal, run <code>claude</code> and sign in, then press Check.</p><p style="text-align:center"><button class="btn" data-ch="check">Check again</button></p>';
  return '';
}

MODS.chat = {
  render(){
    const c = chatById(CH.cur), gate = chatGate(), live = CH.live && CH.live.chat === c?.id;
    const keep = $('chIn')?.value || '';
    $('v-chat').innerHTML = `<div class="ch">
      <aside class="ch-side">
        <button class="btn primary ch-new" data-ch="new">${CHI.plus}New chat</button>
        <div class="ch-list">${CH.list.map(x => `<div class="ch-li${x.id === CH.cur ? ' on' : ''}" data-cid="${x.id}"><span>${esc(x.title)}</span><small>${ago(x.at)}</small>
          <button data-ch="del" title="Delete">${CHI.x}</button></div>`).join('') || '<p class="ch-none">Your chats appear here.</p>'}</div>
      </aside>
      <section class="ch-main">
        <div class="ch-msgs" id="chMsgs">${gate || (c && c.msgs.length ? `<div class="ch-col">${c.msgs.map(chatMsgHTML).join('')}
            ${live ? `<div class="ch-m a"><span class="owl"></span><div class="ch-b md${CH.live.text ? '' : ' wait'}" id="chLive">${CH.live.text ? mdToHtml(CH.live.text) : '<i></i><i></i><i></i>'}</div></div>` : ''}</div>`
          : `<div class="ch-hello"><span class="owl"></span><h2>What's on your mind?</h2><p>Ask anything. Answers come from Claude on your own account.</p>
            <div class="ch-tries">${CH_TRIES.map(t => `<button data-try="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`)}</div>
        ${gate ? '' : `<form class="ch-box" id="chForm">
          <textarea id="chIn" rows="1" placeholder="Message Fukurō · Enter to send, Shift+Enter for a new line" maxlength="8000">${esc(keep)}</textarea>
          <div class="ch-tools">
            <div class="seg ch-model">${[['haiku', 'Fast'], ['sonnet', 'Smart']].map(([k, l]) => `<button type="button" class="${CH.model === k ? 'on' : ''}" data-chm="${k}" title="${k === 'haiku' ? 'Haiku: quick answers, light on your limits' : 'Sonnet: better for harder questions, uses more of your limits'}">${l}</button>`).join('')}</div>
            <label class="ch-mine" title="Sends today's plan and your open to-dos with each message"><input type="checkbox" id="chMine" ${CH.mine ? 'checked' : ''}><span>Include my day</span></label>
            <span class="sp"></span>
            ${CH.live ? `<button type="button" class="btn ch-send" data-ch="stop" title="Stop">${CHI.stop}</button>` : `<button class="btn primary ch-send" title="Send">${CHI.send}</button>`}
          </div></form>`}
      </section></div>`;
    const s = $('chMsgs'); if (s) s.scrollTop = s.scrollHeight;
    const i = $('chIn'); if (i) { chatGrow(i); if (!CH.live) i.focus(); }
    if (DESK && !AI.status) aiCheck().then(() => window.VIEW === 'chat' && MODS.chat.render());
  },
};
const chatGrow = i => { i.style.height = 'auto'; i.style.height = Math.min(220, i.scrollHeight) + 'px'; };

$('v-chat').addEventListener('submit', e => {
  if (e.target.id !== 'chForm') return;
  e.preventDefault();
  const i = $('chIn'), t = i.value; if (!t.trim() || CH.live) return;
  i.value = ''; chatSend(t);
});
$('v-chat').addEventListener('keydown', e => {
  if (e.target.id === 'chIn' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('chForm').requestSubmit(); }
});
$('v-chat').addEventListener('input', e => { if (e.target.id === 'chIn') chatGrow(e.target); });
$('v-chat').addEventListener('change', e => { if (e.target.id === 'chMine') CH.mine = e.target.checked; });
$('v-chat').addEventListener('click', e => {
  const tr = e.target.closest('[data-try]'); if (tr) { const i = $('chIn'); i.value = tr.dataset.try + ': '; i.focus(); chatGrow(i); return; }
  const m = e.target.closest('[data-chm]'); if (m) { CH.model = m.dataset.chm; store.set('chatModel', CH.model); return MODS.chat.render(); }
  const b = e.target.closest('[data-ch]');
  const li = e.target.closest('[data-cid]');
  if (li && !b) { CH.cur = li.dataset.cid; saveChats(); return MODS.chat.render(); }
  if (!b) return;
  const c = chatById(CH.cur);
  switch (b.dataset.ch) {
    case 'new': CH.cur = null; saveChats(); MODS.chat.render(); break;
    case 'stop': if (CH.live) desk.ai.stop(CH.live.id); break;
    case 'check': AI.status = null; MODS.chat.render(); break;
    case 'copy': navigator.clipboard.writeText(c.msgs[+b.dataset.i].t); toast('Copied'); break;
    case 'retry': { c.msgs = c.msgs.filter(x => !x.err); const q = c.msgs.pop(); saveChats(); if (q) chatSend(q.t); break; }
    case 'del': {
      const x = chatById(li.dataset.cid), at = CH.list.indexOf(x);
      CH.list.splice(at, 1); if (CH.cur === x.id) CH.cur = null; saveChats(); MODS.chat.render();
      toast('Chat deleted', [['Undo', () => { CH.list.splice(at, 0, x); saveChats(); MODS.chat.render(); }]]);
    }
  }
});
