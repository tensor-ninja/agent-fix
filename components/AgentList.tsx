import React, { useState } from "react";
import AgentBox, { AgentData } from "./AgentBox";

interface AgentListProps {
  agents: AgentData[];
  reasoningEffort: string;
}

const AgentList: React.FC<AgentListProps> = ({ agents, reasoningEffort }) => {
  // Store the currently expanded agent's id; only one agent can be expanded at a time.
  const [expandedAgentId, setExpandedAgentId] = useState<number | null>(null);

  // Toggle the expanded agent. If the same agent is clicked, collapse it.
  const handleToggle = (id: number) => {
    setExpandedAgentId((currentExpanded) => (currentExpanded === id ? null : id));
  };

  return (
    <div className="flex flex-col space-y-4">
      {agents.map((agent) => (
        <AgentBox
          key={agent.id}
          agent={agent}
          isExpanded={expandedAgentId === agent.id}
          onToggle={() => handleToggle(agent.id)}
          reasoningEffort={reasoningEffort}
        />
      ))}
    </div>
  );
};

export default AgentList; 