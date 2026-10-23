import type { SkillsAddResult } from '@alpine/protocol';
import { Button, Dialog } from '@alpine/ui/primitives';
import { useCallback, useState } from 'react';

import { ChooseSkills, skillError, skillMessages, skillTitle } from '@/shared/components/skills';
import { useLocale, useMessages } from '@/shared/i18n';
import { ServerError, useAddSkill } from '@/shared/server';

import { messages } from './messages';

/**
 * What dropping something on the window came to: skills added, several to pick from, why adding failed, files that
 * are neither a skill nor a folder (`refused`, by name), which nothing takes yet, or a folder that could not be opened
 * for another reason (`unopened`).
 */
export type DropOutcome =
  | { kind: 'added'; names: string[] }
  | { kind: 'choose'; result: SkillsAddResult }
  | { kind: 'failed'; message: string }
  | { kind: 'refused'; names: string[] }
  | { kind: 'unopened'; name: string };

/** A path that can only be a skill: an archive or a SKILL.md. A folder is a skill when a SKILL.md is in it. */
const SKILL_FILE = /\.(zip|skill)$|(^|\/)SKILL\.md$/i;

/**
 * Takes what was dropped on the window: skills (a `.zip`, a `.skill`, a SKILL.md or a folder with one) are added,
 * anything else goes to `onFolder`, which opens it as a project and resolves whether it was one (and rejects when it
 * could not tell). Resolves with what to tell, or `null` when there is nothing to tell (a folder opened as a project
 * shows itself).
 */
export function useSkillDrop(onFolder: (path: string) => Promise<boolean>) {
  const { mutateAsync } = useAddSkill();
  const s = useMessages(skillMessages);
  return useCallback(
    async (paths: string[]): Promise<DropOutcome | null> => {
      const names: string[] = [];
      const refused: string[] = [];
      for (const path of paths) {
        const asSkill = SKILL_FILE.test(path) ? path : `${path.replace(/\/$/, '')}/SKILL.md`;
        try {
          const result = await mutateAsync({ source: asSkill });
          if (result.choices.length > 0) return { kind: 'choose', result };
          names.push(...result.added.map((x) => x.name));
        } catch (reason) {
          const notThere = reason instanceof ServerError && reason.data?.reason === 'not_found';
          if (!notThere || SKILL_FILE.test(path)) return { kind: 'failed', message: skillError(reason, s) };
          const name = path.split('/').pop() || path;
          const folder = await onFolder(path).catch(() => null);
          if (folder === null) return { kind: 'unopened', name };
          if (!folder) refused.push(name);
        }
      }
      if (refused.length > 0) return { kind: 'refused', names: refused };
      return names.length > 0 ? { kind: 'added', names } : null;
    },
    [mutateAsync, s, onFolder],
  );
}

/** Tells what a dropped skill (or a file nothing takes) came to, over whatever screen is open. */
export function DroppedSkillsDialog({ outcome, onClose }: { outcome: DropOutcome | null; onClose: () => void }) {
  const s = useMessages(skillMessages);
  const t = useMessages(messages);
  const { locale } = useLocale();
  const add = useAddSkill();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog.Root open={outcome !== null} onOpenChange={(open) => !open && (onClose(), setError(null))}>
      <Dialog.Popup size={outcome?.kind === 'choose' ? 'md' : 'sm'}>
        <Dialog.Title>
          {outcome?.kind === 'refused'
            ? t.droppedFileTitle
            : outcome?.kind === 'unopened'
              ? t.droppedFolderTitle
              : s.droppedTitle}
        </Dialog.Title>
        {outcome?.kind === 'refused' && (
          <Dialog.Description>{t.droppedFileBody(outcome.names.join(', '))}</Dialog.Description>
        )}
        {outcome?.kind === 'unopened' && <Dialog.Description>{t.droppedFolderBody(outcome.name)}</Dialog.Description>}
        {outcome?.kind === 'added' && (
          <Dialog.Description>
            {s.droppedOne(outcome.names.map((name) => skillTitle(name, locale)).join(', '))}
          </Dialog.Description>
        )}
        {outcome?.kind === 'failed' && (
          <p role="alert" className="text-body text-danger">
            {outcome.message}
          </p>
        )}
        {outcome?.kind === 'choose' && (
          <div className="max-h-[60vh] overflow-y-auto">
            <ChooseSkills
              source={outcome.result.source.split('/').pop() ?? outcome.result.source}
              choices={outcome.result.choices}
              onAdd={async (names) => {
                setError(null);
                try {
                  await add.mutateAsync({ source: outcome.result.source, names });
                  return true;
                } catch (reason) {
                  setError(skillError(reason, s));
                  return false;
                }
              }}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-meta text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Dialog.Close render={<Button variant="primary" />}>{s.close}</Dialog.Close>
        </div>
      </Dialog.Popup>
    </Dialog.Root>
  );
}
