import { Puzzle } from 'lucide-react';

import { agentMessages, agentName } from '@/shared/components/agent';
import { useMessages } from '@/shared/i18n';
import { openSettings } from '@/shared/navigation';
import { useAgents, useSkills } from '@/shared/server';

import { chip } from './chip';
import { messages } from './messages';

/**
 * Beside the agent in the input bar: how many skills it works with, and pressing it opens settings at that agent,
 * where skills and tools are added. Said where the AI is talked to, so "what else can it hold" has an answer there.
 */
export function AgentSkillsChip({ agentId }: { agentId: string }) {
  const t = useMessages(messages);
  const a = useMessages(agentMessages);
  const agents = useAgents().data?.agents;
  const skills = useSkills().data?.skills;
  const agent = agents?.find((one) => one.id === agentId) ?? agents?.find((one) => one.id === 'default');
  if (!agent || !skills) return null;
  const off = new Set(agent.skillsOff ?? []);
  const count = skills.filter((skill) => !off.has(skill.name)).length;
  return (
    <button
      type="button"
      className={chip}
      title={t.skillsOf(agentName(agent, a))}
      onClick={() => openSettings('agents', agent.id === 'default' ? {} : { agent: agent.id })}
    >
      <Puzzle size={15} strokeWidth={1.6} aria-hidden="true" />
      {t.skillCount(count)}
    </button>
  );
}
