import type { FlowGetResult, FlowNode, TaskForceItem } from '@alpine/protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@/shared/i18n';
import {
  mergeScripts,
  scriptedConnection,
  ServerProvider,
  sessionInfo,
  sessionScript,
  type Item,
  type Script,
} from '@/shared/server';

import { blogBoard, blogBuild, type PlanMoment } from './planExample';
import { ProductMap } from './ProductMap';
import { boardScript, bookingBoard } from './testBoard';

/**
 * What the map does with the work it hands the AI (audit theme 2): it shows what goes on and can stop it, says when
 * the AI waits for me, keeps my words until the AI can take them, and shows the answers where I asked.
 */

const cwd = '/project';
const said = (id: string, text: string): Item => ({ id, kind: 'user_message', text });
const reply = (id: string, text: string): Item => ({ id, kind: 'agent_message', text, agent: null });
const signedOut: Item = { id: 'stop-1', kind: 'run_stopped', reason: 'signed_out', message: null };
const ask = (id: string, question: string, labels: string[]): Item => ({
  id,
  kind: 'tool_call',
  name: 'ask_user',
  args: { question, options: labels.map((label) => ({ label })) },
  status: 'done',
  result: '',
  images: 0,
  commandResult: null,
  fileChanges: null,
});
const team = (status: TaskForceItem['status'], needed: number | null = null): TaskForceItem => ({
  id: 'tf-1',
  kind: 'taskforce',
  title: '블로그 만들기',
  steps: [{ title: '화면 만들기', count: 2, model: 'm' }],
  minutes: 30,
  status,
  members: [],
  step: '',
  log: null,
  needed,
  error: null,
  startedAt: null,
});

interface Talk {
  map?: Partial<Parameters<typeof sessionInfo>[0]>;
  mapItems?: Item[];
  build?: Partial<Parameters<typeof sessionInfo>[0]>;
  buildItems?: Item[];
  others?: Parameters<typeof sessionInfo>[0][];
}

/** The map of `board` in `/project`, its conversation (`map-1`) and, for a plan being built, the build's (`build-1`). */
function mount(board: FlowGetResult, talk: Talk = {}, extra: Script = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const sessions = [
    { info: sessionInfo({ id: 'map-1', cwd, purpose: 'map', title: '보드', ...talk.map }), items: talk.mapItems ?? [] },
    ...(board.buildSession
      ? [
          {
            info: sessionInfo({ id: 'build-1', cwd, purpose: 'build', title: '만들기', ...talk.build }),
            items: talk.buildItems ?? [],
          },
        ]
      : []),
    ...(talk.others ?? []).map((info) => ({ info: sessionInfo({ cwd, ...info }) })),
  ];
  const connection = scriptedConnection(
    mergeScripts(
      boardScript(board),
      sessionScript({ sessions }),
      { results: { 'taskforce/allowMore': {}, 'taskforce/takeResults': {}, 'taskforce/resume': {} } },
      extra,
    ),
  );
  const request = vi.spyOn(connection, 'request');
  const onSession = vi.fn();
  const onShowConversation = vi.fn();
  const onFixConnection = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <div style={{ height: 900 }}>
            <ProductMap
              cwd={cwd}
              onSession={onSession}
              onShowConversation={onShowConversation}
              onFixConnection={onFixConnection}
            />
          </div>
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
  return { connection, request, onSession, onShowConversation, onFixConnection };
}

/** The blog plan at one moment, in `/project`. */
const blog = (moment: PlanMoment, more: Partial<FlowGetResult> = {}) => ({ ...blogBoard(moment), ...more });
const sent = (request: { mock: { calls: unknown[][] } }, sessionId: string) =>
  request.mock.calls
    .filter(
      ([method, params]) => method === 'session/send' && (params as { sessionId: string }).sessionId === sessionId,
    )
    .map(([, params]) => (params as { text: string }).text);
const input = () => screen.getByRole('textbox', { name: '보드에 부탁하기' });
const write = (text: string) => {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.keyDown(input(), { key: 'Enter' });
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('work asked of a map that exists (#4, #9, #10)', () => {
  it('shows the work above the input, calls me when it waits, can stop it, and shows its answer', async () => {
    const { request, onShowConversation } = mount(
      bookingBoard(),
      {},
      { results: { 'files/list': { entries: [], nextOffset: 0, hasMore: false } } },
    );
    await screen.findByRole('button', { name: '보드 메뉴' });
    write('결제 버튼 색 바꿔 줘');
    await waitFor(() => expect(sent(request, 'map-1')).toEqual(['[map] request: 결제 버튼 색 바꿔 줘']));
    // The scripted turn asks before running a command: the map says so, and opens the conversation where it asks.
    expect(await screen.findByText('AI가 확인을 기다려요')).toBeTruthy();
    expect(onShowConversation).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '멈추기' }));
    await waitFor(() =>
      expect(request.mock.calls.find(([method]) => method === 'session/cancel')?.[1]).toEqual({ sessionId: 'map-1' }),
    );
    // Stopped part way, what it said so far is no answer: the line above the input says it stopped, with the way to
    // the whole conversation.
    const reply = await screen.findByRole('region', { name: 'AI의 답' });
    expect(within(reply).getByText('중간에 멈췄어요')).toBeTruthy();
    expect(within(reply).queryByText('Let me look at the project first.')).toBeNull();
    fireEvent.click(within(reply).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('region', { name: 'AI의 답' })).toBeNull();
  });

  it('shows the answer of a turn that ended, and why one stopped on the model connection (#10, #36)', async () => {
    const answered = [
      said('u1', '[map] request: 결제 버튼 색 바꿔 줘'),
      reply('a1', '결제 버튼을 파란색으로 바꿨어요.'),
    ];
    mount(bookingBoard(), { mapItems: answered });
    expect(
      within(await screen.findByRole('region', { name: 'AI의 답' })).getByText('결제 버튼을 파란색으로 바꿨어요.'),
    ).toBeTruthy();
    cleanup();
    const { onFixConnection } = mount(bookingBoard(), {
      mapItems: [...answered, said('u2', '[map] request: 검색 넣어 줘'), reply('a2', '먼저 코드를 볼게요.'), signedOut],
    });
    const stopped = await screen.findByRole('region', { name: 'AI의 답' });
    expect(within(stopped).getByText('모델 로그인이 끝나서 멈췄어요')).toBeTruthy();
    fireEvent.click(within(stopped).getByRole('button', { name: '모델 연결 열기' }));
    expect(onFixConnection).toHaveBeenCalled();
  });

  it('sends words to a free conversation even when earlier words could not be sent, and shows them all (#34)', async () => {
    // Kept from before: words to an older conversation that refuses them, then words to the map's own conversation.
    localStorage.setItem(
      `alpine.product-map.later:${cwd}`,
      JSON.stringify([
        { id: 'w1', to: 'old', text: '첫 번째 말' },
        { id: 'w2', to: 'old', text: '두 번째 말' },
        { id: 'w3', to: 'map-1', text: '보드 대화에 할 말' },
      ]),
    );
    const refusing: Script = {
      results: {
        'session/send': ({ sessionId }) => {
          if (sessionId === 'old') throw new Error('refused');
          return {};
        },
      },
    };
    const { request } = mount(bookingBoard(), { others: [{ id: 'old', title: '예전 대화' }] }, refusing);
    await waitFor(() => expect(sent(request, 'map-1')).toEqual(['보드 대화에 할 말']));
    const waiting = await screen.findByRole('region', { name: 'AI가 지금 일을 마치면 전할게요' });
    // The first could not go and says so; the one after it to the same place waits behind it, and is shown too.
    await waitFor(() => expect(within(waiting).getByText('보내지 못했어요')).toBeTruthy());
    expect(within(waiting).getByText('첫 번째 말')).toBeTruthy();
    expect(within(waiting).getByText('두 번째 말')).toBeTruthy();
    expect(within(waiting).queryByText('보드 대화에 할 말')).toBeNull();
    expect(sent(request, 'old')).toEqual(['첫 번째 말']);
  });

  it('sends words kept for a conversation that is gone to the map, in order, without taking the dock (#34)', async () => {
    localStorage.setItem(
      `alpine.product-map.later:${cwd}`,
      JSON.stringify([
        { id: 'w1', to: 'deleted', text: '지운 대화에 할 말' },
        { id: 'w2', to: 'old', text: '보관한 대화에 할 말', failed: true },
      ]),
    );
    // The conversation takes them without starting a turn here, so nothing else calls me to it.
    const { request, onSession } = mount(
      bookingBoard(),
      { others: [{ id: 'old', title: '예전 대화', archived: true }] },
      { results: { 'session/send': {} } },
    );
    await waitFor(() => expect(sent(request, 'map-1')).toEqual(['지운 대화에 할 말', '보관한 대화에 할 말']));
    expect(sent(request, 'deleted')).toEqual([]);
    expect(sent(request, 'old')).toEqual([]);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'AI가 지금 일을 마치면 전할게요' })).toBeNull());
    expect(onSession).not.toHaveBeenCalled();
  });

  it('says why the map waits when another conversation works, leads there, and keeps my words for later (#29, #60)', async () => {
    const { request, onSession } = mount(bookingBoard(), {
      others: [{ id: 'old', title: '예전 대화', status: 'running' }],
    });
    expect(await screen.findByText(/다른 대화에서 AI가 일하는 중이에요/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '그 대화 보기' }));
    expect(onSession).toHaveBeenCalledWith('old');
    expect(input().getAttribute('placeholder')).toBe('지금 일이 끝나면 전해요');
    write('검색 넣어 줘');
    const waiting = await screen.findByRole('region', { name: 'AI가 지금 일을 마치면 전할게요' });
    expect(within(waiting).getByText('검색 넣어 줘')).toBeTruthy();
    expect(request.mock.calls.some(([method]) => method === 'flow/prepare')).toBe(false);
    fireEvent.click(within(waiting).getByRole('button', { name: '보내지 않기' }));
    expect(screen.queryByRole('region', { name: 'AI가 지금 일을 마치면 전할게요' })).toBeNull();
  });
});

describe('a planned product on its map', () => {
  it('says once that it draws the plan, with 멈추기 (#31)', async () => {
    const empty = blog('asking', {
      document: { nodes: [], flows: [], edges: [] },
      undecided: [],
      build: 'none',
      buildSession: null,
    });
    const { request } = mount(empty, { map: { status: 'running' } });
    expect(await screen.findByText('한 줄을 보고 보드를 그리는 중이에요')).toBeTruthy();
    expect(screen.queryByText(/코드를 살펴보는 중이에요/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '멈추기' }));
    await waitFor(() =>
      expect(request.mock.calls.find(([method]) => method === 'session/cancel')?.[1]).toEqual({ sessionId: 'map-1' }),
    );
  });

  it('offers to keep asking or decide the rest when no question waits (#70)', async () => {
    const { request } = mount(blog('asking'), { mapItems: [said('u1', '개발 블로그 만들어 줘')] });
    expect(await screen.findByText('정할 것이 2개 남았어요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '이어서 물어봐 줘' }));
    await waitFor(() => expect(sent(request, 'map-1')).toEqual(['정할 것을 이어서 하나씩 물어봐 주세요.']));
  });

  it('while building: calls me when the build waits, follows the build in its chips, and keeps my words for it (#8, #11, #34)', async () => {
    const board = blog('building');
    const { connection, request, onSession, onShowConversation } = mount(board, {
      build: { mode: 'auto' },
      buildItems: blogBuild('building'),
    });
    // The build is at work and comes to the command it asks about.
    await connection.request('session/send', { sessionId: 'build-1', text: '이대로 만들어 주세요.' });
    expect(await screen.findByText('AI가 확인을 기다려요')).toBeTruthy();
    await waitFor(() => expect(onShowConversation).toHaveBeenCalled());
    expect(onSession).toHaveBeenCalledWith('build-1');
    fireEvent.click(screen.getByRole('button', { name: '확인하기' }));

    // The safety chip is the build's, and a change applies to the plan's conversation too.
    fireEvent.click(screen.getByRole('button', { name: '안전: 알아서 하기' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /파일 수정은 바로/ }));
    await waitFor(() =>
      expect(
        request.mock.calls
          .filter(([method]) => method === 'session/setMode')
          .map(([, params]) => (params as { sessionId: string }).sessionId)
          .sort(),
      ).toEqual(['build-1', 'map-1']),
    );

    // While it waits for my OK, my words skip that command and tell the build what to do instead (#35): the map's
    // input is where the conversation beside it says to write them.
    expect(input().getAttribute('placeholder')).toBe('건너뛰고 대신 할 일을 적어 주세요');
    write('그 명령은 빼고 버튼 색은 파란색으로');
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'session/answer',
        expect.objectContaining({
          sessionId: 'build-1',
          decision: 'deny',
          feedback: '그 명령은 빼고 버튼 색은 파란색으로',
        }),
      ),
    );
    expect(screen.queryByRole('region', { name: 'AI가 지금 일을 마치면 전할게요' })).toBeNull();
  });

  it('keeps words written while the build works, and gives them to the build once its turn is over (#34)', async () => {
    const { connection, request } = mount(blog('building'), {
      build: { status: 'running' },
      buildItems: blogBuild('building'),
    });
    await waitFor(() => expect(input().getAttribute('placeholder')).toBe('지금 일이 끝나면 전해요'));
    write('버튼 색은 파란색으로');
    const waiting = await screen.findByRole('region', { name: 'AI가 지금 일을 마치면 전할게요' });
    expect(within(waiting).getByText('버튼 색은 파란색으로')).toBeTruthy();
    expect(sent(request, 'build-1')).toEqual([]);
    // Its turn ends (here, stopped): the words go to the build, not to the map as a request.
    await connection.request('session/cancel', { sessionId: 'build-1' });
    await waitFor(() => expect(sent(request, 'build-1')).toEqual(['버튼 색은 파란색으로']));
    expect(request.mock.calls.some(([method]) => method === 'flow/prepare')).toBe(false);
  });

  it('keeps another answer to an AI decision while the build works, and gives it to the build after (#5)', async () => {
    const { connection, request } = mount(blog('building'), { buildItems: blogBuild('building') });
    await connection.request('session/send', { sessionId: 'build-1', text: '이대로 만들어 주세요.' });
    await screen.findByText('AI가 확인을 기다려요');
    // The card's own "AI가 정함 · 바꾸기", in its panel.
    const card = await waitFor(() => {
      for (const more of screen.queryAllByRole('button', { name: /^화면 \d+개 더/ })) fireEvent.click(more);
      return screen.getAllByRole('button', { name: '발행 열기', hidden: true })[0]!;
    });
    fireEvent.click(card);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '바꾸기' }));
    // The card's panel is still open beside it, so the rest of the page is outside the dialog.
    const review = await screen.findByRole('region', { name: '질문', hidden: true });
    expect(within(review).getByText('만들다가 생긴 질문이에요. AI가 먼저 정하고 계속 만들고 있어요.')).toBeTruthy();
    fireEvent.click(within(review).getByRole('button', { name: '댓글은 남겨 둬요', hidden: true }));
    const waiting = await screen.findByRole('region', { name: 'AI가 지금 일을 마치면 전할게요', hidden: true });
    expect(within(waiting).getByText(/답을 바꿀래요: 댓글은 남겨 둬요/)).toBeTruthy();
    const open = await connection.request('session/open', { sessionId: 'build-1' });
    const approval = open.active.find((item) => item.kind === 'approval');
    await connection.request('session/answer', { sessionId: 'build-1', requestId: approval!.id, decision: 'allow' });
    await waitFor(() => expect(sent(request, 'build-1').at(-1)).toMatch(/답을 바꿀래요: 댓글은 남겨 둬요/));
  });

  it('says why a build stopped and offers what fixes it (#36)', async () => {
    const { onFixConnection } = mount(blog('stopped'), {
      buildItems: [
        said('b1', '이대로 만들어 주세요.'),
        { id: 's1', kind: 'run_stopped', reason: 'signed_out', message: null },
      ],
    });
    expect(await screen.findByText('만들기가 멈췄어요')).toBeTruthy();
    expect(screen.getByText(/모델 로그인이 끝나서 멈췄어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '모델 연결 열기' }));
    expect(onFixConnection).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '이어서 만들기' })).toBeTruthy();
  });

  it('shows the question a stopped build asked, and the answer goes to the build (#36)', async () => {
    const { request } = mount(blog('stopped'), {
      buildItems: [said('b1', '이대로 만들어 주세요.'), ask('q1', '결제는 어떻게 받을까요?', ['카드', '계좌 이체'])],
    });
    expect(await screen.findByText('결제는 어떻게 받을까요?')).toBeTruthy();
    expect(screen.getByText('만들다가 AI가 물어봤어요. 답하면 이어서 만들어요.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /계좌 이체/ }));
    await waitFor(() => expect(sent(request, 'build-1')).toEqual(['계좌 이체']));
  });

  it('answers a TF that needs more agents from the map (#37)', async () => {
    const { request } = mount(blog('stopped'), {
      buildItems: [said('b1', '이대로 만들어 주세요.'), team('over', 4)],
    });
    fireEvent.click(await screen.findByRole('button', { name: '2명 더 쓰고 계속' }));
    fireEvent.click(screen.getByRole('button', { name: '여기까지 결과 받기' }));
    await waitFor(() =>
      expect(request.mock.calls.map(([method]) => method).filter((m) => m.startsWith('taskforce/'))).toEqual([
        'taskforce/allowMore',
        'taskforce/takeResults',
      ]),
    );
  });

  it('continues a build whose TF was cut off where the TF was (#37)', async () => {
    const { request } = mount(blog('stopped'), {
      buildItems: [said('b1', '이대로 만들어 주세요.'), team('interrupted')],
    });
    fireEvent.click(await screen.findByRole('button', { name: '이어서 만들기' }));
    await waitFor(() =>
      expect(request.mock.calls.find(([method]) => method === 'taskforce/resume')?.[1]).toEqual({
        sessionId: 'build-1',
        runId: 'tf-1',
        fresh: false,
      }),
    );
    expect(request.mock.calls.some(([method]) => method === 'flow/prepare')).toBe(false);
  });

  it("once built, does not bring back what the plan's conversation said last as the answer (#10)", async () => {
    const planning = [said('u1', '개발 블로그 만들어 줘'), reply('a1', '이제 정할 것이 없어요. 만들 준비가 됐어요.')];
    mount(blog('asking', { undecided: [] }), { mapItems: planning });
    expect(await screen.findByText('다 정했어요')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'AI의 답' })).toBeNull();
    // Built afterwards (the map comes back after the build): the planning words stay behind.
    cleanup();
    mount(blog('built'), { mapItems: planning });
    expect(await screen.findByText('다 만들었어요')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'AI의 답' })).toBeNull();
    expect(screen.queryByText('이제 정할 것이 없어요. 만들 준비가 됐어요.')).toBeNull();
  });

  it('takes words as a request once built (#33)', async () => {
    const { request } = mount(blog('built'));
    await screen.findByText('다 만들었어요');
    write('글 목록에 검색 넣어 줘');
    await waitFor(() =>
      expect(request.mock.calls.find(([method]) => method === 'flow/prepare')?.[1]).toMatchObject({
        action: 'request',
        request: '글 목록에 검색 넣어 줘',
      }),
    );
  });

  it('goes through every AI decision one after another, and words in the input change the open one (#75, #76)', async () => {
    const board = blog('built');
    const nodes = board.document!.nodes!.map((node: FlowNode) =>
      node.id === 'list'
        ? {
            ...node,
            decisions: [{ question: '글을 몇 개씩 보여 줄까요?', options: ['10개', '20개'], answer: '10개', by: 'ai' }],
          }
        : node,
    );
    const { request } = mount({ ...board, document: { ...board.document, nodes } } as FlowGetResult);
    fireEvent.click(await screen.findByRole('button', { name: 'AI가 정한 것 2개' }));
    const first = await screen.findByRole('region', { name: '질문' });
    expect(within(first).getByText('1/2')).toBeTruthy();
    // The answer it already has sends nothing, and leads to the next one.
    fireEvent.click(within(first).getByRole('button', { name: /AI가 고른 것/ }));
    const second = await screen.findByRole('region', { name: '질문' });
    expect(within(second).getByText('2/2')).toBeTruthy();
    expect(request.mock.calls.some(([method]) => method === 'flow/prepare')).toBe(false);
    // Words in the input answer the open question, with its card and question.
    const question = within(second).getByText(/\?$/).textContent!;
    write('직접 고를게요');
    await waitFor(() => {
      const prepared = request.mock.calls.find(([method]) => method === 'flow/prepare')?.[1] as {
        action: string;
        request: string;
      };
      expect(prepared.action).toBe('change');
      expect(prepared.request).toContain(question);
      expect(prepared.request).toContain('직접 고를게요');
    });
    await waitFor(() => expect(screen.queryByRole('region', { name: '질문' })).toBeNull());
  });
});

describe('an empty folder (#79)', () => {
  const folder = (...names: string[]): Script => ({
    results: {
      'files/list': {
        entries: names.map((name) => ({ name, path: name, kind: 'file' as const })),
        nextOffset: 0,
        hasMore: false,
      },
    },
  });
  const nothing = {
    revision: 'missing',
    exists: false,
    document: { nodes: [], flows: [], edges: [] },
  } as FlowGetResult;

  it('does not offer to start over a folder with other hidden files, which 새 프로젝트 would refuse', async () => {
    mount(nothing, {}, folder('.git', '.env', '.vscode'));
    expect(await screen.findByRole('textbox', { name: '보드에 부탁하기' })).toBeTruthy();
    expect(screen.queryByText('빈 폴더예요')).toBeNull();
  });

  it('counts .git and .DS_Store alone as empty, as the server does', async () => {
    mount(nothing, {}, folder('.git', '.DS_Store'));
    expect(await screen.findByText('빈 폴더예요')).toBeTruthy();
  });

  it('counts a folder with only hidden files (an empty repository) as empty', async () => {
    mount(
      { revision: 'missing', exists: false, document: { nodes: [], flows: [], edges: [] } } as FlowGetResult,
      {},
      {
        results: {
          'files/list': {
            entries: [{ name: '.git', path: '.git', kind: 'directory' }],
            nextOffset: 0,
            hasMore: false,
          },
        },
      },
    );
    expect(await screen.findByText('빈 폴더예요')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '보드에 부탁하기' })).toBeNull();
  });
});
