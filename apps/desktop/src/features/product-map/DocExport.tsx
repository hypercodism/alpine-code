import { Menu } from '@alpine/ui/primitives';
import { Share } from 'lucide-react';
import { useRef, useState } from 'react';

import { useLocale, useMessages } from '@/shared/i18n';
import { inTauri, pickSavePath, revealInFinder, savePdf, saveText, screenPicture, shareFile } from '@/shared/platform';

import type { BoardLayout } from './boardLayout';
import { documentMarkdown, documentPage, type DocWords } from './docPages';
import { docMessages } from './docMessages';
import type { DocContent } from './docModel';
import { filmMessages } from './filmMessages';
import { flowTreeMessages } from './flowTreeMessages';
import { hasScreenArea, isJourneyLink, type Journey, type TreeMap } from './flowTreeModel';
import { screenAddress, useLiveApp } from './liveScreens';
import { DESKTOP_WIDTH, SCREEN_WIDTH, type Device } from './planLook';
import { useText } from './treeParts';

type Notice = { kind: 'saved'; path: string } | { kind: 'copied' } | { kind: 'failed'; reason: string };

/**
 * 내보내기 on the 문서: the document as a PDF (with each screen's picture) or Markdown, saved where the person picks,
 * Markdown copied to paste elsewhere, or the PDF sent through the Mac's share menu (mail, Messages, AirDrop). What
 * happened shows under the header; a saved file can be shown in Finder.
 */
export function DocExport({
  map,
  doc,
  layout,
  undecided,
  device,
  uses,
}: {
  map: TreeMap;
  doc: DocContent;
  layout: BoardLayout;
  undecided: string[];
  device: (journey: Journey) => Device;
  uses: (journey: Journey) => Device;
}) {
  const t = useMessages(docMessages);
  const words = useMessages(flowTreeMessages);
  const film = useMessages(filmMessages);
  const text = useText();
  const { locale } = useLocale();
  const app = useLiveApp();
  const trigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const name = t.fileName(map.product);
  const inApp = inTauri();

  const read = (): DocWords => ({
    t,
    words,
    film,
    text,
    device,
    uses,
    undecided,
    date: new Date().toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'long' }),
  });
  // Each screen as the app draws it now (the running app's own pixels), else its picture on the board.
  const pictures = async () => {
    const found: Record<string, string> = {};
    for (const journey of doc.journeys)
      for (const id of journey.steps) {
        const card = isJourneyLink(id) ? undefined : map.cards[id];
        if (!card || found[id] || !hasScreenArea(card)) continue;
        const home = doc.homes.get(id);
        const on = home ? device(home) : 'phone';
        const picture =
          app && card.path && card.kind === 'screen'
            ? await screenPicture(
                screenAddress(app, card.path),
                on === 'computer' ? DESKTOP_WIDTH : SCREEN_WIDTH,
                on === 'computer' ? 800 : 844,
              ).catch(() => null)
            : card.screen && card.screen.kind !== 'planned'
              ? await asDataAddress(card.screen.src)
              : null;
        if (picture) found[id] = picture;
      }
    return found;
  };
  const run = async (work: () => Promise<Notice | null>) => {
    setNotice(null);
    try {
      setNotice(await work());
    } catch (error) {
      setNotice({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) });
    }
  };
  const markdown = () => documentMarkdown(map, doc, layout, read());
  // The PDF takes a few seconds (a picture of each screen, then the print): the button says so meanwhile.
  const pdf = async (path: string | null) => {
    setBusy(true);
    try {
      return await savePdf(documentPage(map, doc, layout, read(), await pictures()), path, name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Menu.Root>
        <Menu.Trigger
          ref={trigger}
          disabled={busy}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-canvas-raised px-3 text-body text-fg hover:bg-hover disabled:cursor-default disabled:text-fg-muted data-popup-open:bg-hover"
        >
          <Share size={14} aria-hidden />
          {busy ? t.makingPdf : t.exportMenu}
        </Menu.Trigger>
        <Menu.Popup align="end">
          <Menu.Item
            disabled={!inApp}
            onClick={() =>
              run(async () => {
                const path = await pickSavePath(name, 'pdf', 'PDF');
                return path ? { kind: 'saved', path: await pdf(path) } : null;
              })
            }
          >
            {t.savePdf}
          </Menu.Item>
          <Menu.Item
            disabled={!inApp}
            onClick={() =>
              run(async () => {
                const path = await pickSavePath(name, 'md', 'Markdown');
                if (!path) return null;
                await saveText(path, markdown());
                return { kind: 'saved', path };
              })
            }
          >
            {t.saveMarkdown}
          </Menu.Item>
          <Menu.Item
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(markdown());
                return { kind: 'copied' };
              })
            }
          >
            {t.copyMarkdown}
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item
            disabled={!inApp}
            onClick={() =>
              run(async () => {
                const path = await pdf(null);
                if (trigger.current) await shareFile(path, trigger.current);
                return null;
              })
            }
          >
            {t.share}
          </Menu.Item>
        </Menu.Popup>
      </Menu.Root>
      {notice && (
        <p role="status" className="text-meta text-fg-muted">
          {notice.kind === 'copied' && t.copied}
          {notice.kind === 'failed' && <span className="text-danger">{t.exportFailed(notice.reason)}</span>}
          {notice.kind === 'saved' && (
            <>
              {t.saved(notice.path.slice(notice.path.lastIndexOf('/') + 1))}
              {' · '}
              <button
                type="button"
                onClick={() => void revealInFinder(notice.path)}
                className="cursor-pointer text-interactive hover:underline"
              >
                {t.reveal}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** A picture's address as data, so the printed page needs nothing from the app; `null` when it cannot be read. */
async function asDataAddress(src: string): Promise<string | null> {
  if (src.startsWith('data:')) return src;
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
