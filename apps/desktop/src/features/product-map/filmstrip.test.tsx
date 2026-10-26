import type { FlowGetResult, FlowNode, ProductFlow } from '@alpine/protocol';
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
} from '@/shared/server';

import { MapTopActions } from './MapTopActions';
import { blogBoard, blogConversation, type PlanMoment } from './planExample';
import { ProductMap } from './ProductMap';
import { boardScript } from './testBoard';

/**
 * The map as a filmstrip of the product's screens (map-first, 10-25): phone journeys as rows of frames, computer
 * journeys as browser windows one under another, steps without a screen, forks and loops; the question's card and the
 * completion card; and the top bar's one button for where the plan stands.
 */

const cwd = '/project';

interface Mount {
  mapItems?: Item[];
  map?: Partial<Parameters<typeof sessionInfo>[0]>;
  build?: Partial<Parameters<typeof sessionInfo>[0]>;
  buildItems?: Item[];
}

function mount(board: FlowGetResult, { mapItems = [], map = {}, build = {}, buildItems = [] }: Mount = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const sessions = [
    { info: sessionInfo({ id: 'map-1', cwd, purpose: 'map', title: '지도', ...map }), items: mapItems },
    ...(board.buildSession
      ? [{ info: sessionInfo({ id: 'build-1', cwd, purpose: 'build', title: '만들기', ...build }), items: buildItems }]
      : []),
  ];
  const connection = scriptedConnection(mergeScripts(boardScript(board), sessionScript({ sessions })));
  const request = vi.spyOn(connection, 'request');
  const onPublish = vi.fn();
  const onOpenInApp = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ServerProvider connection={connection}>
        <LocaleProvider locale="ko">
          <div data-testid="top">
            <MapTopActions cwd={cwd} />
          </div>
          <div style={{ height: 900 }}>
            <ProductMap cwd={cwd} onSession={vi.fn()} onPublish={onPublish} onOpenInApp={onOpenInApp} />
          </div>
        </LocaleProvider>
      </ServerProvider>
    </QueryClientProvider>,
  );
  return { request, onPublish, onOpenInApp };
}

/** The blog plan at one moment, in `/project`. */
const blog = (moment: PlanMoment, more: Partial<FlowGetResult> = {}) => ({ ...blogBoard(moment), ...more });

const screenNode = (id: string, title: string, more: Partial<FlowNode> = {}): FlowNode => ({
  id,
  title,
  kind: 'screen',
  phase: 'built',
  conditions: [{ id: `${id}-p`, expectation: `${title}이 열린다` }],
  ...more,
});

/** A map drawn from code: these cards on one phone journey of a person called 손님. */
function codeMap(nodes: FlowNode[], flow: Partial<ProductFlow> = {}): FlowGetResult {
  return {
    revision: 'r1',
    etag: 'e1',
    exists: true,
    document: {
      nodes,
      flows: [
        {
          id: 'shop',
          title: '빵 미리 예약하기',
          actor: '손님',
          device: 'phone',
          nodeIds: nodes.map((node) => node.id),
          ...flow,
        },
      ],
      edges: [],
    },
  };
}

const opens = (within_: HTMLElement) =>
  within(within_)
    .queryAllByRole('button', { hidden: true })
    .filter((button) => button.getAttribute('aria-haspopup') === 'dialog');
const scrolledTo = () =>
  vi.mocked(Element.prototype.scrollIntoView).mock.contexts.map((element) => (element as HTMLElement).dataset.card);
const top = () => screen.getByTestId('top');

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

describe('the filmstrip', () => {
  it('lays a phone journey out as frames in a row and a computer journey as windows one under another', async () => {
    mount(blog('built'));
    const visitor = await screen.findByRole('region', { name: '방문자' });
    expect(within(visitor).getByText('휴대폰')).toBeTruthy();
    expect(within(visitor).getByText('흐름 1개 · 화면 3개')).toBeTruthy();
    const reading = within(visitor).getByRole('region', { name: '글 찾아 읽기' });
    expect(within(reading).getByText('화면 3개 · 약속 5개 중 5개 확인')).toBeTruthy();
    expect(opens(reading).map((button) => button.getAttribute('aria-label'))).toEqual([
      '글 목록 보기 열기',
      '글 읽기 열기',
      '댓글 달기 열기',
    ]);
    expect(within(reading).queryByText('다음')).toBeNull();

    const writer = screen.getByRole('region', { name: '글쓴이' });
    expect(within(writer).getByText('컴퓨터')).toBeTruthy();
    const writing = within(writer).getByRole('region', { name: '글 써서 올리기' });
    // A browser window per screen, with its address, and a quiet 다음 between them.
    expect(within(writing).getAllByText('다음')).toHaveLength(2);
    expect(within(writing).getByText('/write')).toBeTruthy();
    // Built screens are real.
    expect(within(writing).getAllByText('실제 화면')).toHaveLength(3);
    // The words beside a window go under it when the map is too narrow for both, never past its edge.
    const row = writing.querySelector('[data-card]')!;
    expect(row.className).toContain('flex-wrap');
    expect(row.querySelector('[data-caption]')!.className).toMatch(/\bflex-1\b.*\bmin-w-60\b|\bmin-w-60\b.*\bflex-1\b/);
  });

  it('shows three screens of a long phone journey and a tile for the rest, which opens the row', async () => {
    const titles = ['첫 화면', '빵 고르기', '찾으러 올 시간', '연락처 남기기', '예약 확인', '예약 완료'];
    mount(codeMap(titles.map((title, index) => screenNode(`s${index}`, title))));
    const row = await screen.findByRole('region', { name: '빵 미리 예약하기' });
    expect(opens(row)).toHaveLength(3);
    const more = within(row).getByRole('button', { name: /^화면 3개 더/ });
    for (const title of ['연락처 남기기', '예약 확인', '예약 완료']) expect(within(more).getByText(title)).toBeTruthy();
    fireEvent.click(more);
    expect(opens(row).map((button) => button.getAttribute('aria-label'))).toEqual(titles.map((t) => `${t} 열기`));
    expect(within(row).queryByRole('button', { name: /^화면 \d+개 더/ })).toBeNull();
  });

  it('puts a step with nothing to see in its place as a low card, which opens like a screen', async () => {
    mount(
      codeMap([
        screenNode('order', '연락처 남기기'),
        screenNode('notify', '문자 보내기', { kind: 'process' }),
        screenNode('done', '예약 완료'),
      ]),
    );
    const card = await screen.findByRole('button', { name: '문자 보내기 열기' });
    expect(within(card).getByText('화면 없음')).toBeTruthy();
    expect(card.querySelector('img, iframe')).toBeNull();
    fireEvent.click(card);
    expect(within(await screen.findByRole('dialog')).getByRole('heading', { name: '문자 보내기' })).toBeTruthy();
  });

  it('follows a fork with its ways as small rows, and says a way back in one line', async () => {
    mount(
      codeMap(
        [
          screenNode('home', '첫 화면'),
          screenNode('pick', '빵 고르기'),
          screenNode('login', '로그인'),
          screenNode('done', '예약 완료'),
        ],
        {
          edges: [
            { source: 'home', target: 'pick', label: '로그인했으면' },
            { source: 'home', target: 'login', label: '안 했으면' },
            { source: 'login', target: 'done' },
            { source: 'done', target: 'home', label: '처음으로' },
          ],
        },
      ),
    );
    const row = await screen.findByRole('region', { name: '빵 미리 예약하기' });
    const ways = within(row)
      .getAllByRole('button')
      .filter((button) => /했으면/.test(button.textContent ?? ''));
    expect(ways.map((way) => way.textContent)).toEqual(['로그인했으면→빵 고르기', '안 했으면→로그인']);
    expect(within(row).getByText('← 첫 화면으로')).toBeTruthy();
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    fireEvent.click(ways[1]!);
    await waitFor(() => expect(scrolledTo()).toContain('login'));
  });

  it('outlines the card a question is about and brings it into view, without snow on it', async () => {
    const question: Item = {
      id: 'q1',
      kind: 'tool_call',
      name: 'ask_user',
      args: {
        question: '방문자가 댓글을 달 수 있게 할까요?',
        about: 'comment',
        options: [{ label: '로그인한 사람만' }],
      },
      status: 'done',
      result: '',
      images: 0,
      commandResult: null,
      fileChanges: null,
    };
    mount(blog('asking'), { mapItems: [{ id: 'u1', kind: 'user_message', text: '개발 블로그 만들어 줘' }, question] });
    const comment = await screen.findByRole('button', { name: '댓글 달기 열기' });
    await waitFor(() => expect(comment.classList.contains('border-interactive')).toBe(true));
    expect(comment.querySelector('canvas')).toBeNull();
    expect(scrolledTo()).toContain('comment');
    // The other screens stay as they are.
    expect(screen.getByRole('button', { name: '글 읽기 열기' }).classList.contains('border-interactive')).toBe(false);
  });
});

describe('the completion card', () => {
  const builtWithAMiss = () => {
    const board = blog('built');
    board.states!.comment!.promises!['p-comment'] = { status: 'failed' };
    return board;
  };

  it('counts the screens and checked promises, fixes an open promise at once, and puts the app online', async () => {
    const { request, onPublish, onOpenInApp } = mount(builtWithAMiss());
    const done = await screen.findByRole('region', { name: '다 만들었어요' });
    expect(within(done).getByText(/화면 6개 · 약속 9개 중 8개 확인/)).toBeTruthy();
    expect(within(done).getByText('다 만들었어요 · 고칠 약속 1개')).toBeTruthy();
    expect(within(done).queryByRole('button', { name: '앱 열기' })).toBeNull();
    const open = within(done).getByRole('list', { name: '고칠 약속' });
    expect(within(open).getByText('댓글 달기 · 로그인한 사람만 댓글을 달 수 있어요')).toBeTruthy();

    fireEvent.click(within(open).getByRole('button', { name: '앱에서 보기' }));
    expect(onOpenInApp).toHaveBeenCalledWith('comment');
    fireEvent.click(within(done).getByRole('button', { name: '인터넷에 올리기' }));
    expect(onPublish).toHaveBeenCalled();

    fireEvent.click(within(open).getByRole('button', { name: '바로 고치기' }));
    await waitFor(() =>
      expect(request.mock.calls.find(([method]) => method === 'flow/prepare')?.[1]).toMatchObject({
        action: 'change',
        nodeId: 'comment',
        request: '댓글 달기에서 지켜지지 않는 약속을 고쳐 주세요: 로그인한 사람만 댓글을 달 수 있어요',
      }),
    );
    // The fix is new work: the card folds to one line, so the conversation and what it asks stay in view.
    const folded = await screen.findByRole('button', { name: '펼치기' });
    expect(screen.queryByRole('list', { name: '고칠 약속' })).toBeNull();
    fireEvent.click(folded);
    expect(await screen.findByRole('list', { name: '고칠 약속' })).toBeTruthy();
  });

  it('says 다 만들었어요 alone only when nothing is broken or waits', async () => {
    mount(blog('built'));
    const done = await screen.findByRole('region', { name: '다 만들었어요' });
    expect(within(done).getByText('다 만들었어요')).toBeTruthy();
    expect(within(done).queryByRole('list', { name: '고칠 약속' })).toBeNull();
    expect(within(done).queryByRole('button', { name: '다시 확인' })).toBeNull();
  });

  it('puts the promises to check again on one line with one 다시 확인, apart from the broken ones', async () => {
    const board = builtWithAMiss();
    // A fix changed files other cards rest on: their promises wait to be checked again, they are not broken.
    board.states!.write!.promises!['p-markdown'] = { status: 'recheck' };
    board.states!.write!.promises!['p-draft'] = { status: 'recheck' };
    board.states!.publish!.promises!['p-publish'] = { status: 'unconfirmed' };
    const { request } = mount(board);
    const done = await screen.findByRole('region', { name: '다 만들었어요' });
    expect(within(done).getByText('다 만들었어요 · 고칠 약속 1개')).toBeTruthy();
    const broken = within(done).getByRole('list', { name: '고칠 약속' });
    expect(within(broken).getAllByRole('listitem')).toHaveLength(1);
    expect(within(done).getAllByRole('button', { name: '바로 고치기' })).toHaveLength(1);
    expect(within(done).getByText('다시 확인할 약속 3개')).toBeTruthy();

    fireEvent.click(within(done).getByRole('button', { name: '다시 확인' }));
    await waitFor(() =>
      expect(request.mock.calls.find(([method]) => method === 'flow/prepare')?.[1]).toMatchObject({
        action: 'verify',
        nodeIds: ['write', 'publish'],
      }),
    );
  });

  it('names what waits in its title when nothing is broken', async () => {
    const board = blog('built');
    board.states!.write!.promises!['p-draft'] = { status: 'recheck' };
    mount(board);
    const done = await screen.findByRole('region', { name: '다 만들었어요' });
    expect(within(done).getByText('다 만들었어요 · 다시 확인할 약속 1개')).toBeTruthy();
    expect(within(done).queryByRole('button', { name: '바로 고치기' })).toBeNull();
  });

  it('opens a built screen in the app from its card', async () => {
    const { onOpenInApp } = mount(blog('built'));
    fireEvent.click(await screen.findByRole('button', { name: '글 쓰기 열기' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '앱에서 보기' }));
    expect(onOpenInApp).toHaveBeenCalledWith('write');
  });
});

describe('the top bar over a map', () => {
  it('says what is left to decide and keeps 이대로 만들기 quiet until nothing is', async () => {
    mount(blog('asking'));
    expect(await within(top()).findByText('정할 것 2개')).toBeTruthy();
    expect(within(top()).getByRole('button', { name: '이대로 만들기' }).hasAttribute('disabled')).toBe(true);
  });

  it('starts the build in a conversation of its own once everything is decided', async () => {
    const { request } = mount(blog('asking', { undecided: [] }));
    const build = await within(top()).findByRole('button', { name: '이대로 만들기' });
    await waitFor(() => expect(build.hasAttribute('disabled')).toBe(false));
    expect(within(top()).queryByText(/정할 것/)).toBeNull();
    // The bar under the conversation only says so; the button is up here.
    expect(screen.getByText('다 정했어요')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '이대로 만들기' })).toHaveLength(1);
    fireEvent.click(build);
    await waitFor(() =>
      expect(request.mock.calls.find(([method]) => method === 'flow/prepare')?.[1]).toMatchObject({ action: 'build' }),
    );
    expect(request.mock.calls.find(([method]) => method === 'session/new')?.[1]).toMatchObject({ purpose: 'build' });
  });

  it('offers 멈추기 while it builds, which stops the build', async () => {
    const { request } = mount(blog('building'), { build: { status: 'running' } });
    fireEvent.click(await within(top()).findByRole('button', { name: '멈추기' }));
    await waitFor(() =>
      expect(request.mock.calls.find(([method]) => method === 'session/cancel')?.[1]).toEqual({ sessionId: 'build-1' }),
    );
    expect(within(top()).getByText('화면 6개 중 3개')).toBeTruthy();
  });

  it('says what the build does while no card is being built, instead of a count that looks stuck', async () => {
    const board = blog('building');
    const nodes = board.document!.nodes!.map((node) => ({ ...node, phase: 'planned' as const, sources: [] }));
    const edit = (id: string, path: string) =>
      ({
        id,
        kind: 'tool_call',
        name: 'write',
        args: { path },
        status: 'done',
        result: '',
        images: 0,
        commandResult: null,
        fileChanges: null,
      }) as Item;
    const said = { id: 'u1', kind: 'user_message', text: '이대로 만들어 주세요.' } as Item;
    mount(
      { ...board, document: { ...board.document!, nodes } },
      { build: { status: 'running' }, buildItems: [said, edit('e1', '/project/src/db/schema.ts')] },
    );
    expect(await within(top()).findByText('데이터와 구조를 만드는 중')).toBeTruthy();
    expect(within(top()).queryByText(/화면 \d+개 중 0개/)).toBeNull();
    expect(within(top()).getByRole('button', { name: '멈추기' })).toBeTruthy();
  });

  it('shows nothing once it is built', async () => {
    mount(blog('built'));
    await screen.findByRole('region', { name: '다 만들었어요' });
    expect(within(top()).queryByRole('button')).toBeNull();
  });
});

describe('a question beside the conversation', () => {
  it('lays each option out on its own line, the full width, with why under its label', async () => {
    mount(blog('asking'), { mapItems: blogConversation('asking') });
    const option = await screen.findByRole('button', { name: /로그인한 사람만/ });
    expect(option.className).toContain('w-full');
    expect(option.className).toContain('flex-col');
    expect(option.parentElement!.className).toContain('flex-col');
    expect(within(option).getByText('광고 글을 막아요').parentElement).toBe(option);
  });
});

describe('the look question', () => {
  const look = (accent: string) => ({
    page: '#ffffff',
    surface: '#f5f5f5',
    ink: '#191f28',
    muted: '#6b7684',
    line: '#e5e8eb',
    accent,
    on_accent: '#ffffff',
    display: 'Pretendard',
    body: 'Pretendard',
    radius: '12px',
  });
  const asked = {
    id: 'ask-look',
    kind: 'tool_call',
    name: 'ask_user',
    args: {
      question: '어떤 느낌으로 만들까요?',
      options: [
        { label: 'Medium 참고', detail: '조용히 읽혀요', look: look('#171717') },
        { label: '토스 참고', detail: '밝고 친절해요', look: look('#3182f6') },
        { label: '당근 참고', detail: '따뜻해요', look: look('#ff6f0f') },
      ],
    },
    status: 'done',
    result: '',
    images: 0,
    commandResult: null,
    fileChanges: null,
  } as Item;
  const said = { id: 'u1', kind: 'user_message', text: '개발 블로그 만들어 줘' } as Item;

  it('says which look every screen wears, and pointing at another tries it until the pointer leaves', async () => {
    mount(blog('asking'), { mapItems: [said, asked] });
    expect(await screen.findByText('Medium 참고로 미리 보는 중')).toBeTruthy();
    const toss = screen.getByRole('button', { name: /토스 참고/ });
    fireEvent.mouseEnter(toss);
    expect(screen.getByText('토스 참고로 미리 보는 중')).toBeTruthy();
    fireEvent.mouseLeave(toss);
    expect(screen.getByText('Medium 참고로 미리 보는 중')).toBeTruthy();
    // Pressing still tries it, and 이 느낌으로 answers.
    fireEvent.click(screen.getByRole('button', { name: /당근 참고/ }));
    expect(screen.getByText('당근 참고로 미리 보는 중')).toBeTruthy();
  });
});
