import type { BoardLayout } from './boardLayout';
import type { docMessages } from './docMessages';
import { mark, type DocContent } from './docModel';
import type { filmMessages } from './filmMessages';
import { devicesOf } from './filmstripModel';
import type { flowTreeMessages } from './flowTreeMessages';
import { hasScreenArea, isJourneyLink, type Journey, type Localized, type TreeMap } from './flowTreeModel';
import type { Device } from './planLook';

/**
 * The 문서 taken out of the app: the same document as the tab, as Markdown (to paste into Notion, a wiki, a chat) and
 * as a page to print to a PDF, with each screen's picture. Both read `DocContent`, as the tab does.
 */
export interface DocWords {
  t: (typeof docMessages)['ko'];
  words: (typeof flowTreeMessages)['ko'];
  film: (typeof filmMessages)['ko'];
  text: (text: Localized) => string;
  /** The frame a journey's screens wear (the board's one size for one app). */
  device: (journey: Journey) => Device;
  /** What a journey's person uses, said beside them. */
  uses: (journey: Journey) => Device;
  /** What is left to decide (the plan's open questions), listed last. */
  undecided: string[];
  /** The day it is taken out, as the person reads dates. */
  date: string;
}

export function documentMarkdown(map: TreeMap, doc: DocContent, layout: BoardLayout, w: DocWords): string {
  const { t, words, film, text } = w;
  const lines: string[] = [
    `# ${map.product}`,
    '',
    `${t.exportedOn(w.date)} · ${t.counts(doc.screens, doc.promises.length)}`,
  ];
  const status = statusLine(doc, w);
  if (status) lines.push('', status);
  lines.push('', `## ${t.people}`, '');
  for (const person of doc.people) {
    const devices = devicesOf(person.journeys.filter((journey) => journey.steps.length).map(w.uses)).map(
      (one) => film[one],
    );
    lines.push(
      `- **${text(person.name)}** · ${devices.join(', ')}${text(person.role) ? ` — ${text(person.role)}` : ''}`,
    );
    if (text(person.start)) lines.push(`  ${t.startsWith} · ${text(person.start)}`);
  }
  lines.push('', `## ${t.flows}`);
  for (const journey of doc.journeys) {
    const person = doc.people.find((one) => one.journeys.includes(journey))!;
    lines.push('', `### ${text(journey.title)} (${text(person.name)})`, '');
    if (text(journey.goal)) lines.push(text(journey.goal), '');
    if (journey.trigger && text(journey.trigger)) lines.push(`${t.startsWith} · ${text(journey.trigger)}`, '');
    let step = 0;
    for (const id of journey.steps) {
      if (isJourneyLink(id)) {
        const other = doc.journeys.find((one) => one.id === id.slice('flow:'.length));
        if (other) lines.push(`${++step}. → ${t.goesThrough(text(other.title))}`);
        continue;
      }
      const card = map.cards[id];
      if (!card) continue;
      const number = layout.nodes[id]?.number;
      lines.push(
        `${++step}. ${hasScreenArea(card) ? `${number ? `\`${number}\` ` : ''}${card.title}` : `${card.title} (${t.noScreen})`}`,
      );
    }
  }
  lines.push('', `## ${t.promises(doc.promises.length)}`, '');
  if (!doc.promises.length) lines.push(t.noPromises);
  for (const { card, promise } of doc.promises) {
    const situation = promise.state ? card.states?.find((one) => one.id === promise.state) : undefined;
    const said = promise.when ? `${promise.when}, ${promise.then}` : promise.then;
    lines.push(
      `- ${mark(promise.status)} ${said} — ${card.title}${situation ? ` · ${situation.title}` : ''} · ${words[promise.status]}`,
    );
  }
  if (doc.decisions.length) {
    lines.push('', `## ${t.decisions(doc.decisions.length)}`, '');
    for (const decision of doc.decisions)
      lines.push(
        `- ${decision.answer} — ${decision.question ? `${decision.question} · ` : ''}${decision.cards.map((card) => card.title).join(' · ')} · ${decision.by === 'ai' ? t.byAi : t.byPerson}`,
      );
  }
  if (w.undecided.length) {
    lines.push('', `## ${t.undecided(w.undecided.length)}`, '');
    for (const question of w.undecided) lines.push(`- ${question}`);
  }
  return `${lines.join('\n')}\n`;
}

/** A screen's frame on the printed page, in CSS pixels (the page is 794 wide, an A4 at 96 per inch). */
const FRAME = { phone: { w: 120, h: 260 }, computer: { w: 280, h: 175 } } as const;

/**
 * The document as one page of HTML that prints well: plain type, every section in order, each screen with its picture
 * (`pictures`, by card; a screen without one shows its name in an empty frame), and nothing that needs the app.
 */
export function documentPage(
  map: TreeMap,
  doc: DocContent,
  layout: BoardLayout,
  w: DocWords,
  pictures: Record<string, string>,
): string {
  const { t, words, film, text } = w;
  const status = statusLine(doc, w);
  const people = doc.people
    .map((person) => {
      const devices = devicesOf(person.journeys.filter((journey) => journey.steps.length).map(w.uses)).map(
        (one) => film[one],
      );
      return `<li class="person"><b>${esc(text(person.name))}</b> <span class="muted">· ${esc(devices.join(', '))}</span>${
        text(person.role) ? `<div>${esc(text(person.role))}</div>` : ''
      }${text(person.start) ? `<div class="meta">${esc(t.startsWith)} · ${esc(text(person.start))}</div>` : ''}</li>`;
    })
    .join('');
  const journeys = doc.journeys
    .map((journey) => {
      const person = doc.people.find((one) => one.journeys.includes(journey))!;
      const steps = journey.steps
        .map((id) => {
          if (isJourneyLink(id)) {
            const other = doc.journeys.find((one) => one.id === id.slice('flow:'.length));
            return other ? `<li class="link">→ ${esc(t.goesThrough(text(other.title)))}</li>` : '';
          }
          const card = map.cards[id];
          if (!card) return '';
          if (!hasScreenArea(card))
            return `<li class="task"><div class="meta">${esc(t.noScreen)}</div>${esc(card.title)}</li>`;
          const home = doc.homes.get(id);
          const on: Device = home ? w.device(home) : 'phone';
          const size = FRAME[on];
          const number = layout.nodes[id]?.number;
          const picture = pictures[id];
          return `<li class="screen" style="width:${size.w}px"><div class="frame ${on}" style="width:${size.w}px;height:${size.h}px">${
            picture ? `<img src="${picture}" alt="">` : `<span>${esc(card.title)}</span>`
          }</div><div class="meta">${number ? `<span class="faint">${number}</span> ` : ''}${esc(card.title)}</div></li>`;
        })
        .join('');
      return `<section class="journey"><h3>${esc(text(journey.title))} <span class="muted">· ${esc(text(person.name))}</span></h3>${
        text(journey.goal) ? `<p class="muted">${esc(text(journey.goal))}</p>` : ''
      }${
        journey.trigger && text(journey.trigger)
          ? `<p class="meta">${esc(t.startsWith)} · ${esc(text(journey.trigger))}</p>`
          : ''
      }<ol class="steps">${steps}</ol></section>`;
    })
    .join('');
  const promises = doc.promises.length
    ? doc.promises
        .map(({ card, promise }) => {
          const situation = promise.state ? card.states?.find((one) => one.id === promise.state) : undefined;
          const said = promise.when ? `${promise.when}, ${promise.then}` : promise.then;
          return `<li class="${promise.status}"><span class="mark">${mark(promise.status)}</span><span>${esc(said)} <span class="meta">· ${esc(card.title)}${
            situation ? ` · ${esc(situation.title)}` : ''
          }</span></span><span class="word">${esc(words[promise.status])}</span></li>`;
        })
        .join('')
    : `<li>${esc(t.noPromises)}</li>`;
  const decisions = doc.decisions
    .map(
      (decision) =>
        `<li>${esc(decision.answer)}<div class="meta">${decision.question ? `${esc(decision.question)} · ` : ''}${esc(
          decision.cards.map((card) => card.title).join(' · '),
        )} · ${esc(decision.by === 'ai' ? t.byAi : t.byPerson)}</div></li>`,
    )
    .join('');
  const undecided = w.undecided.map((question) => `<li>${esc(question)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(map.product)}</title><style>${PAGE_STYLE}</style></head><body>
<header><h1>${esc(map.product)}</h1><p class="meta">${esc(t.exportedOn(w.date))} · ${esc(t.counts(doc.screens, doc.promises.length))}</p>${
    status ? `<p>${esc(status)}</p>` : ''
  }</header>
<section><h2>${esc(t.people)}</h2><ul class="people">${people}</ul></section>
<section><h2>${esc(t.flows)}</h2>${journeys}</section>
<section><h2>${esc(t.promises(doc.promises.length))}</h2><ul class="promises">${promises}</ul></section>
${decisions ? `<section><h2>${esc(t.decisions(doc.decisions.length))}</h2><ul class="decisions">${decisions}</ul></section>` : ''}
${undecided ? `<section><h2>${esc(t.undecided(w.undecided.length))}</h2><ul class="undecided">${undecided}</ul></section>` : ''}
</body></html>`;
}

/** "✗ 실패 1 · ○ 다시 확인 42 · ✓ 통과 2 · 정할 것 2개": how the promises stand, as the tab's header says it. */
function statusLine(doc: DocContent, w: DocWords): string {
  return [
    ...doc.statuses.map(({ status, count }) => `${mark(status)} ${w.words[status]} ${count}`),
    ...(w.undecided.length ? [w.t.undecided(w.undecided.length)] : []),
  ].join(' · ');
}

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Print type: the system's Korean-friendly sans, black on white, sections that do not break inside a line. */
const PAGE_STYLE = `
@page { size: A4; }
* { box-sizing: border-box; }
body { margin: 0; font: 13px/1.6 -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif; color: #1d232b; }
h1 { font-size: 26px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 28px 0 10px; break-after: avoid; }
h3 { font-size: 15px; margin: 18px 0 4px; break-after: avoid; }
p { margin: 4px 0; }
ul, ol { list-style: none; margin: 0; padding: 0; }
.muted { color: #5b6573; }
.meta { font-size: 11px; color: #5b6573; }
.faint { color: #7c8693; font-variant-numeric: tabular-nums; }
.people { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.person { border: 1px solid #dfe3e8; border-radius: 10px; padding: 10px 12px; break-inside: avoid; }
.steps { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; margin-top: 8px; }
.journey, .screen { break-inside: avoid; }
.frame { border: 1px solid #dfe3e8; overflow: hidden; display: flex; align-items: center; justify-content: center;
  text-align: center; font-size: 11px; color: #9aa3ae; background: #fff; }
.frame.phone { border-radius: 16px; }
.frame.computer { border-radius: 6px; }
.frame img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.task { width: 120px; border: 1px dashed #dfe3e8; border-radius: 8px; padding: 6px 8px; align-self: center; font-size: 11px; }
.link { align-self: center; font-size: 11px; color: #2f6fd6; }
.promises li { display: flex; gap: 8px; padding: 3px 0; break-inside: avoid; }
.promises .mark { width: 12px; flex: none; text-align: center; color: #7c8693; }
.promises .word { margin-left: auto; flex: none; padding-left: 8px; font-size: 11px; color: #7c8693; }
.promises .passed .mark, .promises .passed .word { color: #2f6fd6; }
.promises .failed .mark, .promises .failed .word { color: #c43b3b; }
.decisions li { border: 1px solid #dfe3e8; border-radius: 8px; padding: 8px 12px; margin-bottom: 6px; break-inside: avoid; }
.undecided li { background: #fdf6dc; border-radius: 8px; padding: 8px 12px; margin-bottom: 6px; break-inside: avoid; }
`;
