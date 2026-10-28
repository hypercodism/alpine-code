import { Button, LinkButton } from '@alpine/ui/primitives';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { AgentChip, Composer, useSlashSkills } from '@/shared/components/composer';
import { useMessages } from '@/shared/i18n';
import { answerTo, ASK_USER, readQuestion } from '@/shared/questions';
import {
  activeApproval,
  SESSION_NOT_FOUND,
  SESSION_RUNNING,
  ServerError,
  useAnswerApproval,
  useCancelSession,
  useSendMessage,
  useSession,
  useSetSessionAgent,
  useServer,
  useSetSessionMode,
  type Item,
} from '@/shared/server';

import { Chat } from './Chat';
import { ContextMeter } from './ContextMeter';
import { ProgressLine } from './ProgressLine';
import { messages } from './messages';

/** Within this many pixels of the end, the chat follows new text; further up, the reader is left where they are. */
const FOLLOW_PX = 80;

/** Whether the conversation's last question to me is still unanswered. */
function questionOpen(items: Item[]) {
  const call = items.findLast((item) => item.kind === 'tool_call' && item.name === ASK_USER && item.status === 'done');
  const question = call?.kind === 'tool_call' ? readQuestion(call) : null;
  return !!call && call.kind === 'tool_call' && !!question && !answerTo(items, call, question);
}

/**
 * A session's centre column: the chat ending in the progress line while a run is
 * active (a call that waits for my answer is a card in it), and the input at the bottom (with the conversation
 * length meter in its bar, the agent chip, which hands the conversation to another agent between messages (it waits
 * while a run goes on), and the permission mode, which can change any time and counts from the next call: a call
 * already waiting stays). While the run goes on the send button is a stop button. While a call waits, what I write in the input skips
 * it and tells the agent what to do instead. Project, branch and state are in the top bar.
 */
/**
 * `compact`: shown in the dock beside another page (the product map), so it fits the dock's width instead of keeping
 * the width of a page of its own. `readOnly`: the page has its own input (the map's), so this shows the conversation
 * without a second one. `inputOnMap`: that input answers this conversation (it is the one the map talks to); another
 * conversation shown beside the map gets its own input while it waits for my answer, for that answer only.
 */
export function Session({
  sessionId,
  compact = false,
  readOnly = false,
  inputOnMap = false,
  questionsPinned = false,
  approvalsPinned = false,
  onInspectProcesses,
  onShowTaskForce,
}: {
  sessionId: string;
  compact?: boolean;
  readOnly?: boolean;
  inputOnMap?: boolean;
  /** The question it waits on is held under it, above the input (a plan's map): here it is one quiet line. */
  questionsPinned?: boolean;
  /** Its calls waiting for my OK are held above the input beside the map (`WaitingApprovals`). */
  approvalsPinned?: boolean;
  onInspectProcesses?: () => void;
  /** Opens the dock on the session's TF. */
  onShowTaskForce?: () => void;
}) {
  const t = useMessages(messages);
  const session = useSession(sessionId);
  const send = useSendMessage();
  const cancel = useCancelSession();
  const answer = useAnswerApproval();
  const setMode = useSetSessionMode();
  const setAgent = useSetSessionAgent();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const state = session.data;
  const shown = Boolean(state && !state.deleted);
  const slash = useSlashSkills(state?.info.cwd);
  // After a stop, the commands the agent started may still be ending: a line says so, and only then, with the way to
  // them (the agent commands in the dock). An ordinary stop ends its commands with the run, so they are counted only a
  // moment after the run is over, and the line never flashes by.
  const server = useServer();
  const [stopped, setStopped] = useState(false);
  const [settled, setSettled] = useState(false);
  const ended = !!state && state.info.status !== 'running' && state.info.status !== 'waiting';
  useEffect(() => {
    if (!stopped || !ended) return;
    const timer = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(timer);
  }, [stopped, ended]);
  const cwd = state?.info.cwd ?? '';
  const leftover = useQuery({
    queryKey: ['processes', cwd, sessionId, 'command'],
    queryFn: () => server.request('processes/list', { cwd, sessionId, kind: 'command' }),
    enabled: settled && stopped && ended && !!cwd && !!onInspectProcesses,
    refetchInterval: (query) =>
      query.state.data?.processes.some((p) => p.status === 'running' || p.status === 'stopping') === false
        ? false
        : 750,
    retry: false,
  });
  const commandsLeft =
    settled && stopped && ended
      ? (leftover.data?.processes ?? []).filter(
          (p) => p.kind !== 'shell' && (p.status === 'running' || p.status === 'stopping'),
        ).length
      : 0;

  // Follow the end of the chat as it grows, unless the reader scrolled up. The chat's height is watched rather than
  // the items, because a reply keeps growing on screen after its text arrived (it is let out at an even pace).
  useEffect(() => {
    const element = scroller.current;
    if (!element || !content.current) return;
    const observer = new ResizeObserver(() => {
      if (following.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [shown]);

  if (!state || state.deleted) {
    const missing =
      state?.deleted || (session.error instanceof ServerError && session.error.code === SESSION_NOT_FOUND);
    return (
      <main
        aria-label={t.conversation}
        className={clsx(
          'flex min-h-0 grow flex-col items-center justify-center bg-canvas',
          compact ? 'min-w-0' : 'min-w-120',
        )}
      >
        {missing ? (
          <p role="status" className="text-body text-fg-muted">
            {t.notFound}
          </p>
        ) : session.isError ? (
          <div className="flex flex-col items-center gap-3">
            <p role="alert" className="text-body text-fg-muted">
              {t.loadFailed}
            </p>
            <Button disabled={session.isFetching} onClick={() => void session.refetch()}>
              {t.retry}
            </Button>
          </div>
        ) : (
          <p role="status" className="text-body text-fg-muted">
            {t.loading}
          </p>
        )}
      </main>
    );
  }

  const { info } = state;
  const running = info.status === 'running' || info.status === 'waiting';
  const approval = activeApproval(state);
  const answerHere = readOnly && !inputOnMap && ((!!approval && !approvalsPinned) || questionOpen(state.items));
  const title = info.title || t.untitled;
  const agentError = setAgent.error;
  const agentFailed =
    agentError instanceof ServerError && agentError.code === SESSION_RUNNING
      ? t.agentRunning
      : agentError instanceof ServerError && agentError.data?.reason === 'invalid_config'
        ? t.agentInvalidConfig
        : agentError instanceof ServerError && agentError.data?.reason === 'agent_not_found'
          ? t.agentNotFound
          : t.agentFailed;

  return (
    <main
      aria-label={title}
      className={clsx('flex min-h-0 grow flex-col bg-canvas', compact ? 'min-w-0' : 'min-w-120')}
    >
      <div
        ref={scroller}
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          following.current = scrollHeight - scrollTop - clientHeight < FOLLOW_PX;
        }}
        className="min-h-0 grow overflow-y-auto"
      >
        <div
          ref={content}
          className={clsx('mx-auto flex w-full max-w-175 flex-col gap-4 py-6', compact ? 'px-4' : 'px-6')}
        >
          <Chat
            sessionId={sessionId}
            cwd={info.cwd}
            items={state.items}
            activeIds={state.activeIds}
            onShowTaskForce={onShowTaskForce}
            inputOnMap={readOnly && inputOnMap}
            questionsPinned={questionsPinned}
            approvalsPinned={approvalsPinned}
          />
          {running && <ProgressLine info={info} />}
          {commandsLeft > 0 && (
            <p role="status" className="flex items-center gap-2 text-meta text-fg-muted">
              {t.commandsLeft(commandsLeft)}
              <LinkButton className="min-h-5 px-0.5" onClick={onInspectProcesses}>
                {t.commandsShow}
              </LinkButton>
            </p>
          )}
        </div>
      </div>
      {(!readOnly || answerHere) && (
        <div className={clsx('mx-auto flex w-full max-w-175 flex-col gap-2 pt-3 pb-6', compact ? 'px-4' : 'px-6')}>
          {setAgent.isError && (
            <p role="alert" className="px-1 text-meta text-fg-muted">
              {agentFailed}
            </p>
          )}
          <Composer
            running={running}
            slash={slash}
            answer={
              approval
                ? {
                    placeholder: t.answerPlaceholder,
                    onSend: (text) =>
                      answer.mutateAsync({ sessionId, requestId: approval.id, decision: 'deny', feedback: text }),
                  }
                : undefined
            }
            agent={
              <AgentChip
                context="session"
                agentId={info.agent ?? 'default'}
                model={info.model}
                disabled={running || setAgent.isPending}
                onChange={(agent) => setAgent.mutate({ sessionId, agent })}
              />
            }
            bar={<ContextMeter info={info} />}
            onSend={(text) => {
              following.current = true;
              setStopped(false);
              setSettled(false);
              return send.mutateAsync({ sessionId, text });
            }}
            onStop={() => {
              setStopped(true);
              setSettled(false);
              cancel.mutate(sessionId);
            }}
            mode={{ value: info.mode, onChange: (mode) => setMode.mutate({ sessionId, mode }) }}
          />
        </div>
      )}
    </main>
  );
}
