import clsx from 'clsx';
import { FolderTree } from 'lucide-react';
import { useMemo } from 'react';

import { useMessages } from '@/shared/i18n';
import { useProductMap } from '@/shared/server';

import { useBoardDevice } from './boardDevice';
import { layoutBoard } from './boardLayout';
import { docMessages } from './docMessages';
import { toTreeMap } from './flowTreeData';
import { flowTreeMessages } from './flowTreeMessages';
import { isJourneyLink, type Journey, type TreeCard, type TreeMap } from './flowTreeModel';
import { Avatar, useText } from './treeParts';

const NONE: ReadonlySet<string> = new Set();

/**
 * The 코드 tab's list (10-25 design canvas): the project's code as the board reads it, each journey's screens with the
 * files they live in, numbered as on the board, and 모든 파일 for the rest. Pressing a file opens it beside the list.
 */
export function ScreenFiles({
  cwd,
  selected,
  onOpen,
  onBrowse,
}: {
  cwd: string;
  /** The file open beside the list, or none while the whole tree shows. */
  selected: string | null;
  onOpen: (path: string) => void;
  onBrowse: () => void;
}) {
  const t = useMessages(docMessages);
  const tree = useMessages(flowTreeMessages);
  const data = useProductMap(cwd).data;
  const map = useMemo(
    () =>
      data
        ? toTreeMap(data, NONE, cwd.split('/').pop() ?? cwd, {
            unnamed: { ko: tree.unnamed, en: tree.unnamed },
            unnamedRole: { ko: tree.unnamedRole, en: tree.unnamedRole },
          })
        : null,
    [data, cwd, tree.unnamed, tree.unnamedRole],
  );
  return (
    <nav aria-label={t.codeList} className="flex min-h-0 flex-col gap-4 overflow-y-auto px-3 py-5">
      <button
        type="button"
        aria-current={selected === null ? 'page' : undefined}
        onClick={onBrowse}
        className={clsx(
          'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-body',
          selected === null ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
        )}
      >
        <FolderTree size={14} aria-hidden />
        {t.allFiles}
      </button>
      {map && <Screens map={map} selected={selected} onOpen={onOpen} />}
    </nav>
  );
}

function Screens({ map, selected, onOpen }: { map: TreeMap; selected: string | null; onOpen: (path: string) => void }) {
  const t = useMessages(docMessages);
  const text = useText();
  const device = useBoardDevice(map);
  const layout = useMemo(() => layoutBoard(map, device), [map, device]);
  // Each card under its own journey only (the first that walks it), as the board draws it once.
  const homes = new Map<string, Journey>();
  for (const person of map.people)
    for (const journey of person.journeys)
      for (const step of journey.steps) if (!isJourneyLink(step) && !homes.has(step)) homes.set(step, journey);
  const groups = map.people.flatMap((person) =>
    person.journeys
      .map((journey) => ({
        person,
        journey,
        cards: journey.steps
          .filter((step, index) => homes.get(step) === journey && journey.steps.indexOf(step) === index)
          .map((step) => map.cards[step])
          .filter((card): card is TreeCard => !!card?.sources?.length),
      }))
      .filter((group) => group.cards.length),
  );
  if (!groups.length) return <p className="px-2 text-meta text-fg-muted">{t.noScreenFiles}</p>;
  // A file several screens name (the app's frame, its styles, its data) is listed once, above them; under each screen
  // only the files that are its own.
  const uses = new Map<string, number>();
  for (const { cards } of groups)
    for (const card of cards) for (const path of new Set(card.sources)) uses.set(path, (uses.get(path) ?? 0) + 1);
  const shared = [...uses].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);
  const file = (path: string, note?: string) => (
    <FileRow key={path} path={path} note={note} selected={selected === path} onOpen={onOpen} />
  );
  return (
    <>
      {shared.length > 0 && (
        <section aria-label={t.sharedFiles} className="flex flex-col gap-1">
          <h3 className="px-2 text-meta text-fg-muted">{t.sharedFiles}</h3>
          {shared.map(([path, count]) => file(path, t.screensUsing(count)))}
        </section>
      )}
      {groups.map(({ person, journey, cards }) => (
        <section key={journey.id} aria-label={text(journey.title)} className="flex flex-col gap-1">
          <h3 className="flex items-center gap-1.5 px-2 text-meta text-fg-muted">
            <Avatar person={person} small />
            <span className="truncate">{text(journey.title)}</span>
          </h3>
          {cards.map((card) => {
            const own = [...new Set(card.sources)].filter((path) => uses.get(path) === 1);
            return (
              <div key={card.id} className="flex flex-col">
                <p className="truncate px-2 pt-1.5 pb-0.5 text-body">
                  {layout.nodes[card.id]?.number && (
                    <span className="mr-1.5 text-fg-faint tabular-nums">{layout.nodes[card.id]!.number}</span>
                  )}
                  {card.title}
                </p>
                {own.length ? (
                  own.map((path) => file(path))
                ) : (
                  <p className="py-1 pr-2 pl-6 text-meta text-fg-faint">{t.onlyShared}</p>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

/** A file in the list: its name, the folder it is in, and how many screens share it. */
function FileRow({
  path,
  note,
  selected,
  onOpen,
}: {
  path: string;
  note?: string;
  selected: boolean;
  onOpen: (path: string) => void;
}) {
  const slash = path.lastIndexOf('/');
  return (
    <button
      type="button"
      title={path}
      aria-current={selected ? 'page' : undefined}
      onClick={() => onOpen(path)}
      className={clsx(
        'flex min-w-0 cursor-pointer items-baseline gap-1.5 rounded-md py-1 pr-2 pl-6 text-left text-meta',
        selected ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
      )}
    >
      <span className="min-w-0 truncate font-mono">{path.slice(slash + 1)}</span>
      {slash > 0 && <span className="min-w-0 truncate font-mono text-fg-faint">{path.slice(0, slash)}</span>}
      {note && <span className="ml-auto shrink-0 pl-2 text-fg-faint">{note}</span>}
    </button>
  );
}
