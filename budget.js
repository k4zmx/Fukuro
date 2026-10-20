// Budget: Cash + Account balances, spending per month with category limits, salary you confirm when it
// actually arrives, savings pots (goals, emergency fund) and insights across months.
const BCAT = {
  out: [['food', 'Food', '#c8692c'], ['transport', 'Transport', '#2f7f86'], ['uni', 'Uni', '#2b4b7e'], ['phone', 'Phone & internet', '#6f5a9a'],
        ['out', 'Going out', '#b5546b'], ['shop', 'Shopping', '#b8901f'], ['health', 'Health & sport', '#3f7f74'], ['bills', 'Bills', '#5d6670'], ['other', 'Other', '#86593f']],
  in:  [['salary', 'Salary', '#3f7f74'], ['gift', 'Gift', '#b5546b'], ['otherin', 'Other', '#5d6670']],
};
const bcat = k => [...BCAT.out, ...BCAT.in].find(c => c[0] === k) || ['other', 'Other', '#86593f'];
const POT_KIND = {goal:'Goal', emergency:'Emergency fund', pot:'Pot'};
const POT_COLORS = ['#3f7f74', '#2b4b7e', '#b8901f', '#b5546b', '#6f5a9a', '#c8692c', '#2f7f86'];
const BG = {data: store.get('budget', {}), month: todayISO().slice(0, 7), kind: 'out', tab: 'month'};
{ // older data: fill in what newer versions expect
  const D = BG.data;
  D.entries ||= []; D.recurring ||= []; D.recDone ||= {}; D.pots ||= []; D.limits ||= {};
  D.wallets ||= [{id:'cash', name:'Cash', start:0}, {id:'bank', name:'Account', start:0}];
  D.entries.forEach(e => { if ((e.kind === 'in' || e.kind === 'out') && !e.w) e.w = 'cash'; });
}
const saveBudget = () => store.set('budget', BG.data);
// $, £, ¥ and ₹ go before the amount, codes and € after
const money = n => { const v = Math.round(n).toLocaleString('en-US').replace(/,/g, ' '), c = CFG.currency || ''; return !c ? v : /^[$£¥₹]|\$$/.test(c) ? (v[0] === '-' ? '-' + c + v.slice(1) : c + v) : `${v} ${c}`; };
const short = n => Math.abs(n) >= 1000 ? (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + 'k' : String(Math.round(n));
const monthLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + m2 - m1; };
const wallet = id => BG.data.wallets.find(w => w.id === id) || BG.data.wallets[0];

const CAT_WORDS = {
  food: /lunch|dinner|breakfast|food|coffee|caf[eé]|snack|pizza|restaurant|grocer|bread|sandwich|kebab|tacos|juice/i,
  transport: /bus|taxi|metro|train|tram|uber|yassir|heetch|fuel|gas|essence|ticket/i,
  uni: /book|print|photocop|uni\b|course|class|pen|notebook|school|tuition/i,
  phone: /phone|flexy|internet|recharge|data|mobilis|djezzy|ooredoo/i,
  out: /cinema|movie|party|outing|bowling|game|concert/i,
  shop: /clothes|shoes|amazon|aliexpress|shirt|jacket|bag/i,
  health: /pharma|doctor|medic|gym|sport|dentist/i,
  bills: /rent|bill|electric|water|sonelgaz/i,
  salary: /salary|pay ?check|wage|job/i, gift: /gift|present/i,
};
const guessCat = (note, kind) => (kind === 'in' ? ['salary', 'gift'] : ['food', 'transport', 'uni', 'phone', 'out', 'shop', 'health', 'bills']).find(k => CAT_WORDS[k].test(note)) || (kind === 'in' ? 'otherin' : 'other');
// "-300 lunch", "+45k salary", "spent 1200 on books card", "save 2000 laptop"
function parseMoney(text){
  const num = s => { const m = s.match(/^(\d+(?:[.,]\d+)?)(k)?$/i); return m ? parseFloat(m[1].replace(',', '.')) * (m[2] ? 1000 : 1) : 0; };
  let m = text.match(/^save\s+(\d+(?:[.,]\d+)?k?)\s*(?:da|dzd|eur|usd|gbp|[$€£])?\s*(?:for|to|in)?\s*(.*)$/i);
  if (m && num(m[1])) {
    const q = m[2].trim().toLowerCase(), pot = BG.data.pots.find(p => q && p.name.toLowerCase().includes(q)) || BG.data.pots[0];
    return pot ? {kind:'save', amt:num(m[1]), pot:pot.id, note:''} : null;
  }
  let kind, amt, note;
  if ((m = text.match(/^([+-])\s*[$€£]?(\d+(?:[.,]\d+)?k?)\s*(?:da|dzd|eur|usd|gbp|[$€£])?\s*(.*)$/i))) { kind = m[1] === '-' ? 'out' : 'in'; amt = num(m[2]); note = m[3]; }
  else if ((m = text.match(/^(spent|paid|bought|earned|got paid|received|salary)\s+[$€£]?(\d+(?:[.,]\d+)?k?)\s*(?:da|dzd|eur|usd|gbp|[$€£])?\s*(?:on|for)?\s*(.*)$/i))) {
    kind = /earned|got paid|received|salary/i.test(m[1]) ? 'in' : 'out'; amt = num(m[2]); note = m[3] || (/salary/i.test(m[1]) ? 'Salary' : '');
  }
  if (!amt) return null;
  // "card", "ccp", "bank" or the account's own name picks the account instead of cash
  const acc = BG.data.wallets[1], wre = new RegExp(`\\b(card|ccp|bank|baridi\\w*${acc ? '|' + reEsc(acc.name.toLowerCase()) : ''})\\b`, 'i');
  const w = acc && wre.test(note) ? acc.id : 'cash';
  note = note.replace(wre, '').replace(/\s+/g, ' ').trim();
  return {kind, amt, note, w, cat:guessCat(note + ' ' + (m[1] || ''), kind)};
}

/* ---------- money maths ---------- */
function flow(e, id){
  if (e.kind === 'in') return e.w === id ? e.amt : 0;
  if (e.kind === 'out') return e.w === id ? -e.amt : 0;
  if (e.kind === 'move') return e.w === id ? -e.amt : e.to === id ? e.amt : 0;
  if (e.kind === 'adj') return e.w === id ? e.amt : 0;
  return 0;   // savings stay inside your balances, they are only set aside
}
const walletBal = id => wallet(id).start + BG.data.entries.reduce((a, e) => a + flow(e, id), 0);
const totalBal = () => BG.data.wallets.reduce((a, w) => a + walletBal(w.id), 0);
const potBal = p => BG.data.entries.filter(e => e.kind === 'save' && e.pot === p.id).reduce((a, e) => a + e.amt, 0);
const savedTotal = () => BG.data.pots.reduce((a, p) => a + potBal(p), 0);
const available = () => totalBal() - savedTotal();
const monthEntries = ym => BG.data.entries.filter(e => e.date.startsWith(ym));
function monthSums(ym){
  const list = monthEntries(ym), sum = k => list.filter(e => e.kind === k).reduce((a, e) => a + e.amt, 0);
  return {list, inn:sum('in'), out:sum('out'), saved:sum('save')};
}
const catSpent = (ym, k) => monthEntries(ym).filter(e => e.kind === 'out' && e.cat === k).reduce((a, e) => a + e.amt, 0);
// average monthly spending over the last n finished months that have any data
function avgSpend(n = 3, upTo = todayISO().slice(0, 7)){
  const months = []; for (let i = 1; months.length < n && i <= 12; i++) { const ym = shiftMonth(upTo, -i); if (monthEntries(ym).length) months.push(monthSums(ym).out); }
  return months.length ? months.reduce((a, b) => a + b, 0) / months.length : monthSums(upTo).out;
}
function potTarget(p){ return p.kind === 'emergency' && !p.target ? Math.round(avgSpend() * (p.months || 3)) : p.target || 0; }

/* ---------- repeating items ----------
   Expenses (phone plan…) are added by themselves on their day unless turned off in Settings. Income waits
   for you: salary can be late or go up, so it shows as expected / late until you mark it received. */
function syncRecurring(){
  if (CFG.recAuto === false) return;
  const now = todayISO(); let added = 0;
  BG.data.recurring.filter(r => r.kind === 'out').forEach(r => {
    for (let ym = r.from; ym <= now.slice(0, 7); ym = shiftMonth(ym, 1)) {
      const key = r.id + ':' + ym, date = `${ym}-${pad(Math.min(r.day, 28))}`;
      if (BG.data.recDone[key] || date > now) continue;
      BG.data.recDone[key] = true; added++;
      BG.data.entries.push({id:uid('m'), date, amt:r.amt, kind:'out', cat:r.cat, note:r.note, rec:r.id, w:r.w || 'cash'});
    }
  });
  if (added) saveBudget();
}
function pendingIncome(withBills = false){
  const now = todayISO(), out = [];
  BG.data.recurring.filter(r => r.kind === 'in' || (withBills && CFG.recAuto === false)).forEach(r => {
    for (let ym = r.from; ym <= now.slice(0, 7); ym = shiftMonth(ym, 1)) {
      if (BG.data.recDone[r.id + ':' + ym]) continue;
      const due = `${ym}-${pad(Math.min(r.day, 28))}`, late = daysBetween(parseISO(due), new Date());
      out.push({r, ym, due, late});
    }
  });
  return out;
}
function salaryStats(r){
  const got = BG.data.entries.filter(e => e.rec === r.id && e.kind === 'in').sort((a, b) => a.date.localeCompare(b.date));
  const delays = got.filter(e => e.ym).map(e => Math.max(0, daysBetween(parseISO(`${e.ym}-${pad(Math.min(r.day, 28))}`), parseISO(e.date))));
  let raise = null;
  for (let i = 1; i < got.length; i++) if (got[i].amt > got[i - 1].amt) raise = {from:got[i - 1].amt, to:got[i].amt, ym:got[i].date.slice(0, 7)};
  return {count:got.length, delay:delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0, raise};
}

/* ---------- adding ---------- */
function refreshMoney(){ if (window.VIEW === 'budget' || window.VIEW === 'overview') MODS[window.VIEW].render(); }
MODS.budget = {
  add(m, date = todayISO()){
    const e = m.kind === 'save' ? {id:uid('m'), date, amt:m.amt, kind:'save', pot:m.pot, note:m.note || ''} : {id:uid('m'), date, amt:m.amt, kind:m.kind, cat:m.cat, note:m.note, w:m.w || 'cash'};
    BG.data.entries.push(e); saveBudget(); refreshMoney();
    const what = m.kind === 'save' ? `Saved ${money(m.amt)} · ${esc(BG.data.pots.find(p => p.id === m.pot)?.name || '')}`
      : `${m.kind === 'out' ? 'Spent' : 'Earned'} ${money(m.amt)} · ${esc(bcat(m.cat)[1])}${m.note ? ' · ' + esc(m.note) : ''}${BG.data.wallets.length > 1 ? ' · ' + esc(wallet(e.w).name) : ''}`;
    toast(what, [['Undo', () => { BG.data.entries = BG.data.entries.filter(x => x !== e); saveBudget(); refreshMoney(); }]]);
    limitWarning(e);
  },
  render(){
    syncRecurring();
    const tabs = [['month', 'Month'], ['save', 'Savings'], ['insights', 'Insights']];
    const isNow = BG.month === todayISO().slice(0, 7);
    $('v-budget').innerHTML = `<div class="pg bgx">
      <header class="pg-h"><div><h1>Budget</h1><p>Quick capture works too: <b>-300 lunch</b>, <b>-1200 books card</b>, <b>save 2000 laptop</b></p></div>
        <div class="pg-tools bg-nav">${BG.tab === 'month' ? `<button class="btn icon" data-bg="prev" aria-label="Previous month">${svg('<path d="m15 18-6-6 6-6"/>', 16)}</button>
          <b>${monthLabel(BG.month)}</b><button class="btn icon" data-bg="next" aria-label="Next month">${svg('<path d="m9 18 6-6-6-6"/>', 16)}</button>${isNow ? '' : '<button class="btn" data-bg="now">This month</button>'}` : ''}</div></header>
      <div class="chipbar">${tabs.map(([k, l]) => `<button class="${BG.tab === k ? 'on' : ''}" data-bgtab="${k}">${l}</button>`).join('')}</div>
      ${BG.tab === 'month' ? monthTab() : BG.tab === 'save' ? savingsTab() : insightsTab()}
    </div>`;
  },
};
// a spending line that pushes a category (or the whole month) past its limit gets a heads-up
function limitWarning(e){
  if (e.kind !== 'out' || CFG.limWarn === false) return;
  const ym = e.date.slice(0, 7), lim = BG.data.limits[e.cat], spent = catSpent(ym, e.cat);
  if (lim && spent > lim * 0.8 && spent - e.amt <= lim * (spent > lim ? 1 : 0.8)) setTimeout(() => toast(spent > lim ? `${esc(bcat(e.cat)[1])} is over its limit · ${money(spent)} of ${money(lim)}` : `${esc(bcat(e.cat)[1])} is at ${Math.round(spent / lim * 100)}% of its limit`), 2400);
}

/* ---------- month tab ---------- */
function monthTab(){
  const ym = BG.month, {list, inn, out, saved} = monthSums(ym), isNow = ym === todayISO().slice(0, 7);
  const prevOut = monthSums(shiftMonth(ym, -1)).out, diff = prevOut ? Math.round((out - prevOut) / prevOut * 100) : null;
  const [y, mo] = ym.split('-').map(Number), dim = new Date(y, mo, 0).getDate(), today = new Date().getDate();
  const days = Array.from({length:dim}, (_, i) => list.filter(e => e.kind === 'out' && +e.date.slice(8) === i + 1).reduce((a, e) => a + e.amt, 0));
  const peak = Math.max(1, ...days), lim = CFG.budget, daysLeft = isNow ? dim - today + 1 : 0;
  const byCat = BCAT.out.map(([k, l, c]) => ({k, l, c, v:catSpent(ym, k), lim:BG.data.limits[k] || 0})).filter(x => x.v || x.lim).sort((a, b) => b.v - a.v);
  const pend = pendingIncome(true), groups = [...new Set(list.map(e => e.date))].sort().reverse();
  const av = available();
  return `${pend.map(p => `<div class="bg-due${p.late > 0 ? ' late' : ''}" data-pend="${p.r.id}" data-ym="${p.ym}">
      ${svg('<rect x="4" y="7.5" width="16.5" height="12" rx="2.5"/><path d="M4 7.5a2.5 2.5 0 0 1 2.5-2.5H17v3M16 13.5h1.5"/>', 18)}
      <span><b>${esc(p.r.note || (p.r.kind === 'in' ? 'Salary' : bcat(p.r.cat)[1]))} · ${monthLabel(p.ym)}</b><small>${p.r.kind === 'out' ? (p.late === 0 ? 'Due today' : `Due on the ${ord(+p.due.slice(8))}`) : p.late > 0 ? `Expected on the ${ord(+p.due.slice(8))} · late by ${p.late} day${p.late > 1 ? 's' : ''}` : p.late === 0 ? 'Expected today' : `Expected on the ${ord(+p.due.slice(8))} · in ${-p.late} day${p.late < -1 ? 's' : ''}`} · usually ${money(p.r.amt)}</small></span>
      <button class="btn primary" data-bg="received">${p.r.kind === 'in' ? 'Received' : 'Paid'}</button><button class="btn" data-bg="skippay" title="${p.r.kind === 'in' ? "It won't come" : 'Nothing to pay'} for this month">Not this month</button></div>`).join('')}
    <form class="bg-add" id="bgAdd" autocomplete="off">
      <div class="vseg">${[['out', 'Spent'], ['in', 'Earned'], ['move', 'Move']].map(([k, l]) => `<button type="button" class="${BG.kind === k ? 'on' : ''}" data-bgk="${k}">${l}</button>`).join('')}</div>
      <input name="amt" class="bg-amt" inputmode="decimal" placeholder="Amount" required>
      ${BG.kind === 'move' ? `<select name="w" class="bg-cat">${BG.data.wallets.map(w => `<option value="${w.id}">From ${esc(w.name)}</option>`).join('')}</select>
        <select name="to" class="bg-cat">${BG.data.wallets.map((w, i) => `<option value="${w.id}" ${i === 1 ? 'selected' : ''}>To ${esc(w.name)}</option>`).join('')}</select>
        <input name="note" class="bg-note" placeholder="Note (ATM, deposit…)" maxlength="80">`
      : `<input name="note" class="bg-note" placeholder="${BG.kind === 'out' ? 'What for? (lunch, bus…)' : 'From? (salary, gift…)'}" maxlength="80">
        <select name="cat" class="bg-cat">${BCAT[BG.kind].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <select name="w" class="bg-w">${BG.data.wallets.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select>`}
      <input type="date" name="date" class="bg-date" value="${isNow ? todayISO() : ym + '-01'}">
      <button class="btn primary">Add</button></form>
    <div class="bg-sum">
      <div class="bg-tile big"><small>Free to spend</small><b class="${av < 0 ? 'neg' : ''}">${money(av)}</b>
        <span class="bg-wl">${BG.data.wallets.map(w => `<button data-bg="wallet" data-w="${w.id}" title="Rename or fix the balance">${esc(w.name)} <b>${money(walletBal(w.id))}</b></button>`).join('')}${savedTotal() ? `<button data-bgtab="save">Saved <b>${money(savedTotal())}</b></button>` : ''}</span></div>
      <div class="bg-tile"><small>Spent in ${MONTHS[mo - 1]}</small><b>${money(out)}</b>
        ${diff != null ? `<em class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${diff}% vs ${MONTHS_S[mo === 1 ? 11 : mo - 2]}</em>` : '<em>first month logged</em>'}
        ${lim ? `<span class="bg-meter"><i style="width:${Math.min(100, out / lim * 100)}%"></i></span><em>${out <= lim ? `${money(lim - out)} left of ${money(lim)}${daysLeft ? ` · ~${money((lim - out) / daysLeft)} a day` : ''}` : `${money(out - lim)} over your ${money(lim)} limit`}</em>` : ''}</div>
      <div class="bg-tile"><small>Earned</small><b class="pos">${money(inn)}</b><em>${saved ? `${money(saved)} saved this month${inn ? ` · ${Math.round(saved / inn * 100)}% of income` : ''}` : 'Nothing saved yet this month'}</em></div>
    </div>
    <div class="bg-two">
      <section class="bg-box"><h3>Categories<button type="button" data-bg="limits">Limits</button></h3>
        ${byCat.length ? `<ul class="bg-lim">${byCat.map(x => `<li style="--c:${x.c}"><span class="dot"></span><span>${esc(x.l)}</span><b>${money(x.v)}</b>${x.lim ? `<small class="${x.v > x.lim ? 'over' : x.v > x.lim * 0.8 ? 'near' : ''}">of ${short(x.lim)}</small><span class="bg-meter${x.v > x.lim ? ' over' : ''}"><i style="width:${Math.min(100, x.v / x.lim * 100)}%"></i></span>` : `<small>${out ? Math.round(x.v / out * 100) + '%' : ''}</small>`}</li>`).join('')}</ul>`
          : '<p class="ov-empty">Nothing spent this month.</p>'}
      </section>
      <section class="bg-box"><h3>Day by day</h3>
        <div class="bg-chart">${days.map((v, i) => `<div class="bg-bar${isNow && i + 1 === today ? ' today' : ''}${isNow && i + 1 > today ? ' future' : ''}" title="${i + 1} ${MONTHS_S[mo - 1]} · ${money(v)}"><i style="height:${v / peak * 100}%"></i></div>`).join('')}</div>
        <div class="bg-axis"><span>1</span><span>${Math.ceil(dim / 2)}</span><span>${dim}</span></div>
      </section>
    </div>
    <section class="bg-box"><h3>Every month<button type="button" data-bg="rec">Add</button></h3>
      ${BG.data.recurring.length ? `<ul class="bg-rec">${BG.data.recurring.map(r => { const st = r.kind === 'in' ? salaryStats(r) : null; return `<li data-rec="${r.id}" style="--c:${bcat(r.cat)[2]}"><span class="dot"></span>
        <span>${esc(r.note || bcat(r.cat)[1])}<small>${r.kind === 'in' || CFG.recAuto === false ? `confirm when it ${r.kind === 'in' ? 'arrives' : 'is paid'}${st?.delay ? ` · usually ${st.delay} day${st.delay > 1 ? 's' : ''} late` : ''}${st?.raise ? ` · went up from ${short(st.raise.from)} to ${short(st.raise.to)} in ${monthLabel(st.raise.ym)}` : ''}` : 'added by itself'}</small></span>
        <small>on the ${ord(r.day)}</small><b class="${r.kind === 'in' ? 'pos' : ''}">${r.kind === 'in' ? '+' : '-'}${money(r.amt)}</b><button class="td-x" data-bg="recedit" aria-label="Edit">${TI.pen}</button><button class="td-x" data-bg="recdel" aria-label="Stop">${tdIcon.x}</button></li>`; }).join('')}</ul>`
        : '<p class="ov-empty">Add your salary once: each month it waits for you to confirm it, so late pay or a raise is easy to log. Phone plans and subscriptions get added by themselves.</p>'}
    </section>
    <section class="bg-list">${groups.map(d => {
      const p = parseISO(d), rows = list.filter(e => e.date === d);
      return `<h3 class="td-h">${sameDay(p, new Date()) ? 'Today' : shortDate(p)}</h3><ul class="td-list">${rows.map(entryRow).join('')}</ul>`;
    }).join('') || '<p class="empty-state">No money in or out this month yet.</p>'}</section>`;
}
function entryRow(e){
  const many = BG.data.wallets.length > 1;
  let label, tag = '', amt, cls = '', c = '#8a8274';
  if (e.kind === 'move') { label = e.note || 'Moved'; tag = `${esc(wallet(e.w).name)} → ${esc(wallet(e.to).name)}`; amt = money(e.amt); }
  else if (e.kind === 'save') { const p = BG.data.pots.find(x => x.id === e.pot); c = p?.color || c; label = e.note || (e.amt > 0 ? 'Set aside' : 'Taken out'); tag = esc(p?.name || 'Pot'); amt = (e.amt > 0 ? '→ ' : '← ') + money(Math.abs(e.amt)); }
  else if (e.kind === 'adj') { label = 'Balance fixed'; tag = esc(wallet(e.w).name); amt = (e.amt > 0 ? '+' : '-') + money(Math.abs(e.amt)); }
  else { c = bcat(e.cat)[2]; label = e.note || bcat(e.cat)[1]; tag = esc(bcat(e.cat)[1]) + (many ? ' · ' + esc(wallet(e.w).name) : ''); amt = (e.kind === 'in' ? '+' : '-') + money(e.amt); cls = e.kind === 'in' ? 'pos' : ''; }
  return `<li class="td-row bg-row k-${e.kind}" data-id="${e.id}" style="--c:${c}"><span class="dot"></span><span class="td-text">${esc(label)}</span><span class="td-tag">${tag}</span>${e.rec ? '<span class="td-tag">Monthly</span>' : ''}
    <b class="${cls}">${amt}</b><button class="td-x" data-bg="edit" aria-label="Edit">${TI.pen}</button><button class="td-x" data-bg="del" aria-label="Delete">${tdIcon.x}</button></li>`;
}

/* ---------- savings tab ---------- */
function savingsTab(){
  const ym = todayISO().slice(0, 7), thisMonth = monthSums(ym).saved, avg = avgSpend();
  return `<div class="bg-sum">
      <div class="bg-tile"><small>Saved in total</small><b class="pos">${money(savedTotal())}</b><em>kept aside inside your balances</em></div>
      <div class="bg-tile"><small>Saved this month</small><b>${money(thisMonth)}</b><em>${BG.data.pots.some(p => p.monthly) ? `plan: ${money(BG.data.pots.reduce((a, p) => a + (p.monthly || 0), 0))} a month` : 'set a monthly amount on a pot to plan it'}</em></div>
      <div class="bg-tile"><small>Free to spend</small><b class="${available() < 0 ? 'neg' : ''}">${money(available())}</b><em>balances minus savings</em></div>
    </div>
    <div class="pot-grid">${BG.data.pots.map(p => potCard(p, avg, ym)).join('')}
      <button class="pot-card add" data-bg="newpot">${svg('<path d="M12 5v14M5 12h14"/>', 18)}<span>New pot</span><small>A goal, an emergency fund, or just a pot</small></button></div>`;
}
function potCard(p, avg, ym){
  const bal = potBal(p), target = potTarget(p), pr = target ? Math.min(1, bal / target) : 0;
  const thisMonth = monthEntries(ym).filter(e => e.kind === 'save' && e.pot === p.id).reduce((a, e) => a + e.amt, 0);
  let line = '';
  if (p.kind === 'goal' && target) {
    if (bal >= target) line = 'Reached. Well done.';
    else if (p.due) {
      const left = Math.max(1, monthsBetween(ym, p.due) + 1), need = (target - bal) / left;
      line = monthsBetween(ym, p.due) < 0 ? `Passed ${monthLabel(p.due)} · ${money(target - bal)} to go` : `Save ${money(need)} a month to make it by ${monthLabel(p.due)}`;
    } else line = `${money(target - bal)} to go${p.monthly ? ` · about ${Math.ceil((target - bal) / p.monthly)} months at ${short(p.monthly)} a month` : ''}`;
  }
  if (p.kind === 'emergency') line = avg ? `Covers ${(bal / avg).toFixed(1)} month${bal / avg >= 1.95 ? 's' : ''} of spending · goal ${p.months || 3} months` : 'Log a month of spending to size it';
  if (p.kind === 'pot') line = p.monthly ? `${money(p.monthly)} a month planned` : 'No target';
  const R = 34, C = 2 * Math.PI * R;
  return `<div class="pot-card" data-pot="${p.id}" style="--c:${p.color}">
    <div class="pot-top"><span class="pot-k">${POT_KIND[p.kind]}</span><span class="tm-tools"><button data-bg="editpot" aria-label="Edit">${TI.pen}</button></span></div>
    <div class="pot-mid">
      ${target ? `<div class="pot-ring"><svg viewBox="0 0 80 80"><circle class="trk" cx="40" cy="40" r="${R}"/><circle class="val" cx="40" cy="40" r="${R}" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${(C * (1 - pr)).toFixed(1)}"/></svg><span>${Math.round(pr * 100)}%</span></div>` : ''}
      <div><b class="pot-name">${esc(p.name)}</b><b class="pot-bal">${money(bal)}</b>${target ? `<small>of ${money(target)}${p.kind === 'emergency' && !p.target ? ' (from your spending)' : ''}</small>` : ''}</div>
    </div>
    <p class="pot-line">${line}</p>
    ${p.monthly ? `<div class="pot-plan"><span>This month ${money(thisMonth)} / ${money(p.monthly)}</span><span class="bg-meter"><i style="width:${Math.min(100, Math.max(0, thisMonth) / p.monthly * 100)}%"></i></span></div>` : ''}
    <div class="pot-acts"><button class="btn primary" data-bg="potin">Add money</button>${bal > 0 ? '<button class="btn" data-bg="potout">Take out</button>' : ''}</div>
  </div>`;
}
function openPot(p){
  const v = p || {name:'', kind:'goal', target:'', due:'', monthly:'', months:3, color:POT_COLORS[BG.data.pots.length % POT_COLORS.length]};
  openSheet(`<h2>${p ? 'Edit pot' : 'New pot'}</h2>
    <div class="quick hb-target">${Object.entries(POT_KIND).map(([k, l]) => `<label><input type="radio" name="kind" value="${k}" ${v.kind === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    <input type="text" name="name" class="title-in" placeholder="Name (e.g. Laptop, Summer trip, Emergency)" maxlength="40" required value="${esc(v.name)}">
    <div class="nums n3"><label>Target<input type="number" name="target" min="0" step="any" value="${v.target || ''}" placeholder="${v.kind === 'emergency' ? 'auto' : 'optional'}"></label>
      <label>By (month)<input type="month" name="due" value="${v.due || ''}"></label>
      <label>Each month<input type="number" name="monthly" min="0" step="any" value="${v.monthly || ''}" placeholder="optional"></label></div>
    <label class="field-note pot-em">Emergency fund size: <select name="months" class="sel">${[1, 2, 3, 4, 6].map(n => `<option value="${n}" ${(v.months || 3) === n ? 'selected' : ''}>${n} month${n > 1 ? 's' : ''} of spending</option>`).join('')}</select> (used when the target is empty)</label>
    <div class="field-lbl">Colour</div>
    <div class="swatches">${POT_COLORS.map(c => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === v.color ? 'checked' : ''}></label>`).join('')}</div>
    ${p && potBal(p) ? `<p class="field-note">Deleting it releases ${money(potBal(p))} back to free money.</p>` : ''}
    ${sheetActions(!!p)}`, f => {
      const n = {name:f.name.value.trim(), kind:f.kind.value, target:+f.target.value || 0, due:f.due.value, monthly:+f.monthly.value || 0, months:+f.months.value, color:f.color.value};
      if (p) Object.assign(p, n); else BG.data.pots.push({id:uid('pot'), ...n});
      saveBudget(); MODS.budget.render();
    });
  $('mdForm').querySelector('[data-sheet=delete]')?.addEventListener('click', () => {
    const snap = structuredClone(BG.data);
    BG.data.pots = BG.data.pots.filter(x => x !== p); BG.data.entries = BG.data.entries.filter(e => !(e.kind === 'save' && e.pot === p.id));
    saveBudget(); closeSheet(); MODS.budget.render();
    toast(`Pot "${esc(p.name)}" deleted`, [['Undo', () => { BG.data = snap; saveBudget(); MODS.budget.render(); }]]);
  });
}
function openPotMove(p, out){
  const bal = potBal(p), sug = !out && p.monthly ? Math.max(0, p.monthly - monthEntries(todayISO().slice(0, 7)).filter(e => e.kind === 'save' && e.pot === p.id).reduce((a, e) => a + e.amt, 0)) : '';
  openSheet(`<h2>${out ? 'Take out of' : 'Add to'} ${esc(p.name)}</h2>
    <input type="number" name="amt" class="title-in" min="1" step="any" ${out ? `max="${bal}"` : ''} placeholder="Amount" value="${sug || ''}" required>
    <input type="text" name="note" placeholder="${out ? 'What for? (optional)' : 'Note (optional)'}" maxlength="60">
    <p class="field-note">${out ? `${money(bal)} in this pot. It goes back to your free money; log the purchase itself as spending.` : `Free to spend now: ${money(available())}. The money stays in your balances, set aside for this.`}</p>
    ${sheetActions(false)}`, f => {
      const a = +f.amt.value; if (!(a > 0)) return false;
      BG.data.entries.push({id:uid('m'), date:todayISO(), kind:'save', pot:p.id, amt:out ? -Math.min(a, bal) : a, note:f.note.value.trim()});
      saveBudget(); MODS.budget.render();
      if (!out && potTarget(p) && potBal(p) >= potTarget(p) && potBal(p) - a < potTarget(p)) setTimeout(() => toast(`${esc(p.name)} reached its target`), 300);
    });
}

/* ---------- insights tab ---------- */
function insightsTab(){
  const now = todayISO().slice(0, 7), months = Array.from({length:12}, (_, i) => shiftMonth(now, i - 11));
  const data = months.map(ym => ({ym, ...monthSums(ym)}));
  const peak = Math.max(1, ...data.map(d => Math.max(d.inn, d.out)));
  const year = now.slice(0, 4), ys = data.filter(d => d.ym.startsWith(year)), sum = k => ys.reduce((a, d) => a + d[k], 0);
  const active = ys.filter(d => d.list.length).length || 1, yIn = sum('inn'), yOut = sum('out'), ySaved = sum('saved');
  // this month against the average of the 3 months before (only months with data)
  const prev = [1, 2, 3].map(i => shiftMonth(now, -i)).filter(ym => monthEntries(ym).length);
  const trends = BCAT.out.map(([k, l, c]) => {
    const curV = catSpent(now, k), avg = prev.length ? prev.reduce((a, ym) => a + catSpent(ym, k), 0) / prev.length : 0;
    return {k, l, c, cur:curV, avg, pct:avg ? Math.round((curV - avg) / avg * 100) : null};
  }).filter(t => t.cur || t.avg).sort((a, b) => b.cur - a.cur);
  const big = monthEntries(now).filter(e => e.kind === 'out').sort((a, b) => b.amt - a.amt).slice(0, 5);
  const up = svg('<path d="M12 19V5M6 11l6-6 6 6"/>', 13), down = svg('<path d="M12 5v14M6 13l6 6 6-6"/>', 13);
  return `<section class="bg-box"><h3>Last 12 months<span class="bg-leg"><i class="in"></i>Earned<i class="out"></i>Spent<i class="sv"></i>Saved</span></h3>
      <div class="bg-yr">${data.map(d => `<div class="bg-mo${d.ym === now ? ' cur' : ''}" data-bgm="${d.ym}" title="${monthLabel(d.ym)}\nEarned ${money(d.inn)}\nSpent ${money(d.out)}\nSaved ${money(d.saved)}">
        <div class="bars"><i class="in" style="height:${d.inn / peak * 100}%"></i><i class="out" style="height:${d.out / peak * 100}%"></i><i class="sv" style="height:${Math.max(0, d.saved) / peak * 100}%"></i></div>
        <span>${MONTHS_S[+d.ym.slice(5) - 1]}</span><small>${d.out ? short(d.out) : ''}</small></div>`).join('')}</div>
    </section>
    <div class="bg-sum four">
      <div class="bg-tile"><small>Earned in ${year}</small><b class="pos">${money(yIn)}</b></div>
      <div class="bg-tile"><small>Spent in ${year}</small><b>${money(yOut)}</b><em>${money(yOut / active)} a month on average</em></div>
      <div class="bg-tile"><small>Saved in ${year}</small><b>${money(ySaved)}</b><em>${yIn ? Math.round(ySaved / yIn * 100) + '% of what you earned' : ''}</em></div>
      <div class="bg-tile"><small>Kept overall</small><b class="${yIn - yOut < 0 ? 'neg' : ''}">${money(yIn - yOut)}</b><em>earned minus spent</em></div>
    </div>
    <div class="bg-two">
      <section class="bg-box"><h3>${MONTHS[+now.slice(5) - 1]} vs your usual</h3>
        ${trends.length ? `<ul class="bg-tr">${trends.map(t => `<li style="--c:${t.c}"><span class="dot"></span><span>${esc(t.l)}</span><b>${money(t.cur)}</b>
          <small>usually ${short(t.avg)}</small>${t.pct == null ? '<em>new</em>' : `<em class="${t.pct > 10 ? 'up' : t.pct < -10 ? 'down' : ''}">${t.pct > 0 ? up : t.pct < 0 ? down : ''}${Math.abs(t.pct)}%</em>`}</li>`).join('')}</ul>
          <p class="field-note">Compared with the average of the months before (${prev.length || 'no'} month${prev.length === 1 ? '' : 's'} with data).</p>` : '<p class="ov-empty">Log a bit of spending to see trends.</p>'}
      </section>
      <section class="bg-box"><h3>Biggest this month</h3>
        ${big.length ? `<ul class="bg-cats">${big.map(e => `<li style="--c:${bcat(e.cat)[2]}"><span class="dot"></span><span>${esc(e.note || bcat(e.cat)[1])}</span><small>${shortDate(parseISO(e.date))}</small><b>${money(e.amt)}</b></li>`).join('')}</ul>` : '<p class="ov-empty">Nothing yet.</p>'}
      </section>
    </div>`;
}

/* ---------- sheets ---------- */
function openRecurring(rec){
  const kind = rec ? rec.kind : BG.kind === 'in' ? 'in' : 'out';
  openSheet(`<h2>${rec ? 'Edit monthly item' : 'Every month'}</h2>
    <div class="quick hb-target"><label><input type="radio" name="kind" value="in" ${kind === 'in' ? 'checked' : ''}><span>Income (salary)</span></label><label><input type="radio" name="kind" value="out" ${kind === 'out' ? 'checked' : ''}><span>Expense</span></label></div>
    <input type="text" name="note" class="title-in" placeholder="Name (e.g. Salary, Phone plan)" maxlength="60" required value="${rec ? esc(rec.note || '') : kind === 'in' ? 'Salary' : ''}">
    <div class="nums n3"><label>Usual amount<input type="number" name="amt" min="1" step="any" required value="${rec ? rec.amt : ''}"></label><label>Day of month<input type="number" name="day" min="1" max="28" value="${rec ? rec.day : 1}" required></label>
      <label>${kind === 'in' ? 'Goes to' : 'Paid from'}<select name="w" class="sel">${BG.data.wallets.map(w => `<option value="${w.id}" ${rec && w.id === rec.w ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label></div>
    <p class="field-note">${rec ? 'Changes apply from now on. Lines already in the list stay as they are (click them to edit).' : `Income waits for you to tap Received, so late pay and raises are easy to log. Expenses are ${CFG.recAuto === false ? 'shown as due until you tap Paid' : 'added by themselves on that day'}.`}</p>
    ${sheetActions(!!rec)}`, f => {
      const kind = f.kind.value, n = {kind, amt:+f.amt.value, day:+f.day.value, note:f.note.value.trim(), w:f.w.value};
      if (rec) Object.assign(rec, n, rec.kind === kind && rec.note === n.note ? {} : {cat:guessCat(n.note, kind)});
      else BG.data.recurring.push({id:uid('r'), ...n, cat:guessCat(n.note, kind), from:todayISO().slice(0, 7)});
      saveBudget(); MODS.budget.render();
    });
  if (rec) $('mdForm').querySelector('[data-sheet=delete]').addEventListener('click', () => { closeSheet(); stopRecurring(rec.id); });
}
function stopRecurring(rid){
  const i = BG.data.recurring.findIndex(x => x.id === rid), [gone] = BG.data.recurring.splice(i, 1);
  saveBudget(); MODS.budget.render();
  toast('Stopped · past months stay in the list', [['Undo', () => { BG.data.recurring.splice(i, 0, gone); saveBudget(); MODS.budget.render(); }]]);
}
function openReceived(r, ym){
  const inc = r.kind === 'in';
  openSheet(`<h2>${esc(r.note || (inc ? 'Salary' : bcat(r.cat)[1]))} for ${monthLabel(ym)}</h2>
    <div class="nums n3"><label>Amount<input type="number" name="amt" min="1" step="any" value="${r.amt}" required></label><label>${inc ? 'Arrived on' : 'Paid on'}<input type="date" name="date" value="${todayISO()}" required></label>
      <label>${inc ? 'Into' : 'From'}<select name="w" class="sel">${BG.data.wallets.map(w => `<option value="${w.id}" ${w.id === (r.w || 'bank') ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label></div>
    <label class="check"><input type="checkbox" name="raise" checked> If the amount changed, use it from now on</label>
    ${inc && BG.data.pots.some(p => p.monthly) ? `<label class="check"><input type="checkbox" name="fill" ${CFG.planFill === false ? '' : 'checked'}> Put this month's savings plan aside (${money(BG.data.pots.reduce((a, p) => a + (p.monthly || 0), 0))})</label>` : ''}
    ${sheetActions(false)}`, f => {
      const amt = +f.amt.value;
      BG.data.entries.push({id:uid('m'), date:f.date.value, amt, kind:r.kind, cat:r.cat || (inc ? 'salary' : 'other'), note:r.note || (inc ? 'Salary' : ''), w:f.w.value, rec:r.id, ym});
      BG.data.recDone[r.id + ':' + ym] = true;
      if (f.raise.checked && amt !== r.amt) { if (inc && amt > r.amt) setTimeout(() => toast(`Up ${money(amt - r.amt)} from last time`), 400); r.amt = amt; }
      r.w = f.w.value;
      if (f.fill?.checked) BG.data.pots.filter(p => p.monthly).forEach(p => BG.data.entries.push({id:uid('m'), date:f.date.value, kind:'save', pot:p.id, amt:p.monthly, note:'Monthly plan'}));
      saveBudget(); MODS.budget.render();
    });
}
function openWallet(w){
  const bal = walletBal(w.id);
  openSheet(`<h2>${esc(w.name)}</h2>
    <input type="text" name="name" class="title-in" maxlength="24" value="${esc(w.name)}" required>
    <div class="nums n2"><label>Fukurō thinks you have<input type="text" value="${money(bal)}" disabled></label><label>You actually have<input type="number" name="real" step="any" placeholder="${Math.round(bal)}"></label></div>
    <p class="field-note">Typing what you really have adds a small correction so the balance matches. It doesn't count as spending.</p>
    ${sheetActions(false)}`, f => {
      w.name = f.name.value.trim() || w.name;
      if (f.real.value !== '') { const d = +f.real.value - bal; if (Math.round(d)) BG.data.entries.push({id:uid('m'), date:todayISO(), kind:'adj', w:w.id, amt:d}); }
      saveBudget(); MODS.budget.render();
    });
}
function openLimits(){
  openSheet(`<h2>Monthly limits</h2><p class="field-note">Leave empty for no limit. You get a heads-up at 80% and when you go over.</p>
    <div class="lim-grid"><label class="lim-all"><span>All spending</span><input type="number" name="all" min="0" step="any" value="${CFG.budget || ''}" placeholder="none"></label>
    ${BCAT.out.map(([k, l, c]) => `<label style="--c:${c}"><span><i></i>${l}</span><input type="number" name="l_${k}" min="0" step="any" value="${BG.data.limits[k] || ''}" placeholder="${avgCat(k) ? short(avgCat(k)) + ' usual' : 'none'}"></label>`).join('')}</div>
    ${sheetActions(false)}`, f => {
      BCAT.out.forEach(([k]) => { const v = +f['l_' + k].value; if (v > 0) BG.data.limits[k] = v; else delete BG.data.limits[k]; });
      CFG.budget = +f.all.value || 0; saveCfg(); saveBudget(); MODS.budget.render();
    });
}
function openEntry(x){
  const wsel = (name, cur) => `<select name="${name}" class="sel">${BG.data.wallets.map(w => `<option value="${w.id}" ${w.id === cur ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>`;
  const catOpts = (kind, cur) => BCAT[kind].map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');
  const seg = (name, opts, cur) => `<div class="quick hb-target">${opts.map(([k, l]) => `<label><input type="radio" name="${name}" value="${k}" ${cur === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  const amtIn = v => `<label>Amount<input type="number" name="amt" min="0" step="any" value="${v}" required></label>`, dateIn = `<label>Day<input type="date" name="date" value="${x.date}" required></label>`;
  const note = ph => `<input type="text" name="note" class="title-in" placeholder="${ph}" maxlength="80" value="${esc(x.note || '')}">`;
  let title, body;
  if (x.kind === 'in' || x.kind === 'out') {
    title = 'Edit'; body = `${seg('kind', [['out', 'Spent'], ['in', 'Earned']], x.kind)}${note('What for?')}
      <div class="nums n2">${amtIn(x.amt)}${dateIn}<label>Category<select name="cat" class="sel">${catOpts(x.kind, x.cat)}</select></label><label>Wallet${wsel('w', x.w)}</label></div>
      ${x.rec ? '<p class="field-note">Came from a monthly item. Changing it here only changes this month.</p>' : ''}`;
  } else if (x.kind === 'move') {
    title = 'Edit move'; body = `${note('Note (ATM, deposit…)')}<div class="nums n2">${amtIn(x.amt)}${dateIn}<label>From${wsel('w', x.w)}</label><label>To${wsel('to', x.to)}</label></div>`;
  } else if (x.kind === 'save') {
    title = 'Edit savings'; body = `${seg('dir', [['in', 'Set aside'], ['out', 'Taken out']], x.amt < 0 ? 'out' : 'in')}${note('Note (optional)')}
      <div class="nums n2">${amtIn(Math.abs(x.amt))}${dateIn}<label>Pot<select name="pot" class="sel">${BG.data.pots.map(p => `<option value="${p.id}" ${p.id === x.pot ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></div>`;
  } else {
    title = 'Edit correction'; body = `${seg('dir', [['in', 'Added'], ['out', 'Removed']], x.amt < 0 ? 'out' : 'in')}
      <div class="nums n2">${amtIn(Math.abs(x.amt))}${dateIn}<label>Wallet${wsel('w', x.w)}</label></div>
      <p class="field-note">Made when you fixed a balance. It doesn't count as spending.</p>`;
  }
  openSheet(`<h2>${title}</h2>${body}${sheetActions(true)}`, f => {
    const amt = +f.amt.value; if (!(amt > 0)) { toast('Type an amount'); return false; }
    const base = {amt, date:f.date.value || x.date};
    if (f.note) base.note = f.note.value.trim();
    if (x.kind === 'in' || x.kind === 'out') Object.assign(x, base, {kind:f.kind.value, cat:f.cat.value, w:f.w.value});
    else if (x.kind === 'move') { if (f.w.value === f.to.value) { toast('Pick two different places'); return false; } Object.assign(x, base, {w:f.w.value, to:f.to.value}); }
    else if (x.kind === 'save') Object.assign(x, base, {amt:f.dir.value === 'out' ? -amt : amt, pot:f.pot.value});
    else Object.assign(x, base, {amt:f.dir.value === 'out' ? -amt : amt, w:f.w.value});
    saveBudget(); MODS.budget.render(); toast('Saved');
  });
  const form = $('mdForm');
  // switching Spent / Earned swaps the category list
  form.onchange = e => {
    if (e.target.name !== 'kind') return;
    const sel = form.elements.cat; sel.innerHTML = catOpts(e.target.value, ''); sel.value = guessCat(form.elements.note.value, e.target.value);
  };
  form.querySelector('[data-sheet=delete]').addEventListener('click', () => { closeSheet(); delEntry(x.id); });
}
function delEntry(id){
  const i = BG.data.entries.findIndex(x => x.id === id); if (i < 0) return;
  const [gone] = BG.data.entries.splice(i, 1);
  if (gone.rec && gone.ym) delete BG.data.recDone[gone.rec + ':' + gone.ym];   // a deleted salary goes back to "expected"
  saveBudget(); MODS.budget.render();
  toast('Deleted', [['Undo', () => { BG.data.entries.splice(i, 0, gone); if (gone.rec && gone.ym) BG.data.recDone[gone.rec + ':' + gone.ym] = true; saveBudget(); MODS.budget.render(); }]]);
}
const avgCat = k => { const ms = [1, 2, 3].map(i => shiftMonth(todayISO().slice(0, 7), -i)).filter(ym => monthEntries(ym).length); return ms.length ? ms.reduce((a, ym) => a + catSpent(ym, k), 0) / ms.length : catSpent(todayISO().slice(0, 7), k); };

/* ---------- events ---------- */
$('v-budget').addEventListener('click', e => {
  const t = e.target.closest('[data-bgtab]'); if (t) { BG.tab = t.dataset.bgtab; return MODS.budget.render(); }
  const mo = e.target.closest('[data-bgm]'); if (mo) { BG.month = mo.dataset.bgm; BG.tab = 'month'; return MODS.budget.render(); }
  const k = e.target.closest('[data-bgk]');
  if (k) { BG.kind = k.dataset.bgk; MODS.budget.render(); return $('bgAdd').elements.amt.focus(); }
  const b = e.target.closest('[data-bg]');
  if (!b) {
    const row = e.target.closest('.bg-row'), rec = e.target.closest('[data-rec]');
    if (row) openEntry(BG.data.entries.find(z => z.id === row.dataset.id));
    else if (rec) openRecurring(BG.data.recurring.find(z => z.id === rec.dataset.rec));
    return;
  }
  const id = b.closest('[data-id]')?.dataset.id, pot = BG.data.pots.find(p => p.id === b.closest('[data-pot]')?.dataset.pot);
  const pend = b.closest('[data-pend]'), r = pend && BG.data.recurring.find(x => x.id === pend.dataset.pend);
  switch (b.dataset.bg) {
    case 'prev': BG.month = shiftMonth(BG.month, -1); MODS.budget.render(); break;
    case 'next': BG.month = shiftMonth(BG.month, 1); MODS.budget.render(); break;
    case 'now': BG.month = todayISO().slice(0, 7); MODS.budget.render(); break;
    case 'rec': openRecurring(); break;
    case 'limits': openLimits(); break;
    case 'wallet': openWallet(wallet(b.dataset.w)); break;
    case 'received': openReceived(r, pend.dataset.ym); break;
    case 'skippay': {
      const key = r.id + ':' + pend.dataset.ym; BG.data.recDone[key] = 'skip'; saveBudget(); MODS.budget.render();
      toast('Marked as not coming this month', [['Undo', () => { delete BG.data.recDone[key]; saveBudget(); MODS.budget.render(); }]]);
      break;
    }
    case 'newpot': openPot(null); break;
    case 'editpot': openPot(pot); break;
    case 'potin': openPotMove(pot, false); break;
    case 'potout': openPotMove(pot, true); break;
    case 'edit': openEntry(BG.data.entries.find(z => z.id === id)); break;
    case 'del': delEntry(id); break;
    case 'recedit': openRecurring(BG.data.recurring.find(z => z.id === b.closest('[data-rec]').dataset.rec)); break;
    case 'recdel': stopRecurring(b.closest('[data-rec]').dataset.rec); break;
  }
});
$('v-budget').addEventListener('input', e => {
  if (e.target.name === 'note' && e.target.closest('#bgAdd') && BG.kind !== 'move') $('bgAdd').elements.cat.value = guessCat(e.target.value, BG.kind);
});
$('v-budget').addEventListener('submit', e => {
  if (e.target.id !== 'bgAdd') return;
  e.preventDefault();
  const f = e.target.elements, raw = f.amt.value.trim(), amt = parseFloat(raw.replace(',', '.').replace(/k$/i, '')) * (/k$/i.test(raw) ? 1000 : 1);
  if (!(amt > 0)) return toast('Type an amount');
  if (BG.kind === 'move') {
    if (f.w.value === f.to.value) return toast('Pick two different places');
    BG.data.entries.push({id:uid('m'), date:f.date.value || todayISO(), amt, kind:'move', w:f.w.value, to:f.to.value, note:f.note.value.trim()});
  } else {
    const en = {id:uid('m'), date:f.date.value || todayISO(), amt, kind:BG.kind, cat:f.cat.value, note:f.note.value.trim(), w:f.w.value};
    BG.data.entries.push(en); limitWarning(en);
  }
  saveBudget(); MODS.budget.render(); $('bgAdd').elements.amt.focus();
});
