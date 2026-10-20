// Calendar month view: one cell per day with classes as dots, work hours, your events, exams and due to-dos.
function renderMonth(){
  const y = monthCur.getFullYear(), m = monthCur.getMonth(), start = weekStart(new Date(y, m, 1)), today = new Date();
  const weeks = Math.ceil((daysBetween(start, new Date(y, m + 1, 0)) + 1) / 7);
  const todos = typeof TD === 'undefined' ? [] : TD.list.filter(t => !t.done && t.due);
  let html = `<div class="mo-head">${DAYS.map(d => `<span>${d.slice(0, 3)}</span>`).join('')}</div><div class="mo-grid" style="--weeks:${weeks}">`;
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(start, w * 7), evs = weekEvents(ws).filter(e => !e.cancelled && !e.allDay && visible(e));
    for (let d = 0; d < 7; d++) {
      const date = addDays(ws, d), k = iso(date), day = evs.filter(e => e.d === d).sort((a, b) => a.s - b.s);
      const uni = day.filter(e => e.kind === 'uni' && !e.clash), jobMin = day.filter(e => e.kind === 'job').reduce((a, e) => a + e.e - e.s, 0);
      const due = todos.filter(t => t.due === k);
      const items = [
        ...dlOn(date).map(x => `<button class="mi dl" data-act="dl-edit" data-v="${x.id}" style="--c:${DL_KIND[x.kind].c}"><b>${DL_KIND[x.kind].label}</b>${esc(dlName(x))}</button>`),
        ...day.filter(e => e.kind === 'perso').map(e => `<span class="mi" style="--c:${e.c}"><i>${fmt(e.s)}</i>${esc(e.title)}</span>`),
        ...(due.length ? [`<button class="mi td" data-act="due-pop" data-v="${k}">${due.length} to-do${due.length > 1 ? 's' : ''} due</button>`] : []),
      ];
      const past = date < startOfToday();
      html += `<div class="mc${date.getMonth() !== m ? ' out' : ''}${sameDay(date, today) ? ' today' : ''}${past ? ' past' : ''}" data-act="mday" data-v="${k}">
        <div class="mc-h"><span class="n">${date.getDate()}</span>${uni.length ? `<span class="dots" title="${esc(uni.map(e => `${fmt(e.s)} ${e.title} ${typeName(e.t)}`).join('\n'))}">${uni.map(e => `<i style="background:${e.c}"></i>`).join('')}</span>` : ''}</div>
        ${jobMin ? `<div class="mjob">Work ${hm(jobMin)}</div>` : ''}
        <div class="mis">${items.slice(0, 4).join('')}${items.length > 4 ? `<span class="more">+${items.length - 4} more</span>` : ''}</div></div>`;
    }
  }
  $('month').innerHTML = html + '</div>';
}
