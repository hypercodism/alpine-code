import { describe, expect, it } from 'vitest';

import { BLOG_DRAFT, BLOG_QUESTIONS } from './planBlogExample';
import { drawnSoFar, planOrder, withoutCard } from './planModel';

describe('planned map', () => {
  it('reads cards person by person, step by step', () => {
    expect(planOrder(BLOG_DRAFT)).toEqual(['list', 'read', 'comment', 'login', 'write', 'publish']);
  });

  it('shows only the cards drawn so far, and no person without one', () => {
    const two = drawnSoFar(BLOG_DRAFT, 2);
    expect(planOrder(two)).toEqual(['list', 'read']);
    expect(two.people.map((p) => p.id)).toEqual(['visitor']);
  });

  it('takes a step off every journey', () => {
    const plan = withoutCard(BLOG_DRAFT, 'comment');
    expect(plan.cards.comment).toBeUndefined();
    expect(planOrder(plan)).not.toContain('comment');
  });

  it('"no comments" takes the comment step off the map', () => {
    const comments = BLOG_QUESTIONS.find((q) => q.id === 'q-comment');
    const none = comments?.options.find((o) => o.label === '댓글 없이');
    expect(planOrder(none?.apply?.(BLOG_DRAFT) ?? BLOG_DRAFT)).not.toContain('comment');
  });
});
