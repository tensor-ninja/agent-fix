import React, { useState, useEffect } from "react";

/**
 * Updated AgentData interface to include a description field.
 */
export interface AgentData {
  id: number;
  title: string;
  description: string; // New property for the issue description
  status: string;
  logs: string[];
  relevantFiles?: { filePath: string; link: string }[]; // New property: clickable links for relevant files.
}

interface AgentBoxProps {
  agent: AgentData;
  isExpanded: boolean;
  onToggle: () => void;
  reasoningEffort?: string; // New prop for reasoning effort
}

const AgentBox: React.FC<AgentBoxProps> = ({ agent, isExpanded, onToggle, reasoningEffort = "medium" }) => {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);
  
  // New state for handling status messages
  const [status, setStatus] = useState("");

  // New state for handling relevant files locally:
  const [localRelevantFiles, setLocalRelevantFiles] = useState(
    agent.relevantFiles || []
  );

  // Optionally, update localRelevantFiles when the agent prop changes.
  useEffect(() => {
    setLocalRelevantFiles(agent.relevantFiles || []);
  }, [agent.relevantFiles]);

  const handleStartFix = async () => {
    setLoading(true);
    setStatus("Starting fix generation...");
    try {
      console.log("agent.description", agent.description);
      // Query for relevant documents using title and description.
      const queryResponse = await fetch("/api/tokenize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "query",
          query: `${agent.title}\n${agent.description}`,
        }),
      });
      const queryResult = await queryResponse.json();

      // Assume each record includes filePath.
      const files = queryResult.results || [];

      // Map the records to our expected file structure.
      const computedRelevantFiles = files.map((record: any) => ({
        filePath: record.filePath,
        // Here you might need to customize the link depending on how you want to generate it.
        link: record.filePath,
      }));

      // Update the local state so the UI reflects the returned relevant files.
      setLocalRelevantFiles(computedRelevantFiles);

      const context = files.map((record: any) => record.content).join("\n\n");

      // Use the context, title, and description to get the code fix. Include reasoningEffort.
      const fixResponse = await fetch("/api/code-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueName: agent.title,
          issueDescription: agent.description,
          context: context,
          reasoningEffort: reasoningEffort,
        }),
      });

      if (!fixResponse.body) {
        throw new Error("ReadableStream not supported in this browser.");
      }

      const reader = fixResponse.body.getReader();
      const decoder = new TextDecoder();
      setOutput("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        setOutput((prevOutput) => prevOutput + chunk);

        // Update status based on certain keywords in the stream.
        if (chunk.includes("Generated code fix")) {
          setStatus("Code generated. Running test cases...");
        } else if (chunk.includes("Test cases passed!")) {
          setStatus("Test cases passed! Fix successful.");
        } else if (chunk.includes("Test cases failed")) {
          setStatus("Test cases failed. Retrying...");
        } else if (chunk.includes("Final working fix")) {
          setStatus("Final fix generated.");
        }
      }
      setFinished(true);
    } catch (error: any) {
      console.error("Error during fix process:", error);
      setOutput("Error: " + error.message);
      setStatus("Error during fix process.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * The click handler:
   * - If the fix process hasn't begun (no output), we expand this agent *and* start the process.
   * - Otherwise, we simply toggle the expanded view.
   */
  const handleAgentClick = () => {
    if (!loading && !output) {
      // If not expanded, notify the parent to expand this agent.
      if (!isExpanded) {
        onToggle();
      }
      handleStartFix();
    } else {
      // Toggle the expanded view.
      onToggle();
    }
  };

  return (
    <div
      className="border border-gray-700 bg-gray-800 rounded-lg p-4 mb-4 cursor-pointer"
      onClick={handleAgentClick}
    >
      <div className="flex items-center gap-3">
        {loading ? (
          <div className="w-6 h-6 relative">
            <div className="absolute inset-0 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div
            className={`w-6 h-6 rounded-full ${
              finished ? "bg-green-500" : "bg-blue-500"
            }`}
          >
            {finished && (
              <svg
                className="w-4 h-4 mx-auto mt-1 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        )}
        {/* Render both the title and the issue description */}
        <div className="flex flex-col">
          <h3 className="text-lg text-gray-200">{agent.title}</h3>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pl-9">
          <p className="text-sm text-gray-400">{agent.description}</p>
          {/* Display status notifications */}
          {status && (
            <div className="mb-2 text-sm text-yellow-300">
              <strong>Status:</strong> {status}
            </div>
          )}
          <pre className="bg-gray-900 p-3 rounded text-sm text-gray-300 whitespace-pre-wrap">
            {localRelevantFiles && localRelevantFiles.length > 0 && (
              <div className="mt-2">
                <h4 className="text-md font-bold text-gray-200 mb-1">
                  Relevant Files:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {localRelevantFiles.map((file) => (
                    <a
                      key={file.filePath}
                      href={file.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-blue-200 text-blue-700 rounded-full hover:bg-blue-300"
                    >
                      {file.filePath}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {output || "Click to start the fix process..."}
          </pre>
        </div>
      )}
    </div>
  );
};

export default AgentBox; 