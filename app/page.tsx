"use client";

import { useState, useEffect } from "react";
import AgentList from "@/components/AgentList";
import { AgentData } from "@/components/AgentBox";
import LoadingIndicator from "@/components/LoadingIndicator";

// Optionally, create a headers object for GitHub API requests.
const githubHeaders = {
  Accept: "application/vnd.github.v3+json",
  // Use an environment variable for your GitHub token.
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
};

export default function AgentsPage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [numIssues, setNumIssues] = useState(3);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [repoFiles, setRepoFiles] = useState<{ path: string; link: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRepoFilesExpanded, setIsRepoFilesExpanded] = useState(false);
  const [indexingStep, setIndexingStep] = useState(0);
  const [indexingComplete, setIndexingComplete] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState("medium");

  // Called when the user submits a GitHub repository URL.
  const handleRepoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setIndexingStep(0);
    setIndexingComplete(false);

    // Expect URLs like: https://github.com/owner/repo
    const regex = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)/;
    const match = repoUrl.match(regex);
    if (!match) {
      alert("Invalid GitHub repository URL");
      setLoading(false);
      return;
    }
    const owner = match[1];
    const repo = match[2];

    try {
      setIndexingStep(0); // downloading repository
      // Fetch open issues from the repository
      const issuesResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=open`,
        { headers: githubHeaders }
      );
      const issuesData = await issuesResponse.json();

      // Fetch repository info to determine the default branch.
      setIndexingStep(1); // preparing chunks
      const repoInfoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers: githubHeaders }
      );
      const repoInfo = await repoInfoResponse.json();
      const defaultBranch = repoInfo.default_branch || "main";

      // Fetch branch info to get the tree SHA for the default branch.
      setIndexingStep(2); // indexing files
      const branchInfoResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches/${defaultBranch}`,
        { headers: githubHeaders }
      );
      const branchInfo = await branchInfoResponse.json();
      const treeSha = branchInfo.commit.commit.tree.sha;

      // Fetch the complete repository tree recursively.
      const treeResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
        { headers: githubHeaders }
      );
      const treeData = await treeResponse.json();

      // Filter the tree for relevant code files (e.g., Python and JavaScript files).
      const codeFiles = Array.isArray(treeData.tree)
        ? treeData.tree.filter(
            (item: any) =>
              item.type === "blob" &&
              (item.path.endsWith(".py") || item.path.endsWith(".js"))
          )
        : [];

      // Create a list of repository files with clickable GitHub links.
      const fileListArray = codeFiles.map((item: any) => ({
        path: item.path,
        link: `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${item.path}`,
      }));
      setRepoFiles(fileListArray);

      // --- Tokenization Process for RAG ---
      // For each code file, pull the content from GitHub and decode it.
      setIndexingStep(3); // creating embeddings
      const indexFiles = await Promise.all(
        codeFiles.map(async (file: any) => {
          try {
            const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`;
            const fileResponse = await fetch(fileUrl, { headers: { ...githubHeaders } });
            const fileData = await fileResponse.json();
            if (fileData && fileData.content) {
              const decodedContent = atob(fileData.content);
              return { filePath: file.path, content: decodedContent };
            }
          } catch (error) {
            console.error("Error fetching file:", file.path, error);
          }
          return { filePath: file.path, content: "" };
        })
      );
      // Build the embedding index by sending the files to the tokenization endpoint.
      setIndexingStep(4); // storing embeddings
      const tokenizeResponse = await fetch("/api/tokenize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "index", files: indexFiles }),
      });
      await tokenizeResponse.json();

      // Select the first N issues as configured.
      const selectedIssues = Array.isArray(issuesData)
        ? issuesData.slice(0, numIssues)
        : [];

      // Map each issue to an AgentData object.
      const newAgents: AgentData[] = selectedIssues.map((issue: any) => ({
        id: issue.id,
        title: issue.title,
        description: issue.body,
        status: "coding",
        cycle: 0,
        logs: [
          `Agent initialized: starting coding phase for Issue #${issue.number}: ${issue.title}`,
        ],
      }));

      setAgents(newAgents);
      setIndexingComplete(true);
    } catch (error) {
      console.error("Failed to load repository data:", error);
      alert("An error occurred while fetching repository data");
    } finally {
      setLoading(false);
    }
  };

  // Helper to kick off a code fix for an agent.
  const fixCodeForAgent = async (agent: AgentData) => {
    const fixResponse = await fetch("/api/code-fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueName: agent.title,
        issueDescription: agent.description,
        reasoningEffort: reasoningEffort,
        currentCode: "",
      }),
    });
    const fixResult = await fixResponse.json();

    setAgents((prevAgents) =>
      prevAgents.map((a) =>
        a.id === agent.id
          ? {
              ...a,
              logs: [
                ...a.logs,
                `Code fix applied: ${fixResult.codeFix || "see logs"}`,
                `Test results: ${JSON.stringify(fixResult.testResults)}`,
              ],
              status: "testing",
            }
          : a
      )
    );

    if (fixResult.testResults) {
      setAgents((prevAgents) =>
        prevAgents.map((a) =>
          a.id === agent.id ? { ...a, status: "done" } : a
        )
      );
    }
  };

  // When agents are created, run the fix process for any agent in the "coding" phase.
  useEffect(() => {
    agents.forEach((agent) => {
      if (
        agent.status === "coding" &&
        !agent.logs.some((log) => log.includes("Code fix applied"))
      ) {
        fixCodeForAgent(agent);
      }
    });
  }, [agents, reasoningEffort]);

  return (
    <div className="p-8 min-h-screen bg-background text-foreground">
      <h1 className="text-3xl font-bold mb-8">Agent Fix 🕵️‍♂️</h1>
      <form className="mb-8 flex gap-4" onSubmit={handleRepoSubmit}>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="Enter GitHub repo URL (https://github.com/owner/repo)"
          className="flex-1 p-2 border border-black-300 rounded text-black"
          required
        />
        <select
          value={reasoningEffort}
          onChange={(e) => setReasoningEffort(e.target.value)}
          className="p-2 border border-gray-300 rounded text-black"
          required
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          type="number"
          value={numIssues}
          onChange={(e) => setNumIssues(parseInt(e.target.value))}
          placeholder="Number of issues"
          className="w-40 p-2 border border-gray-300 rounded text-black"
          min="1"
          required
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded"
          disabled={loading}
        >
          {loading ? "Loading..." : "Load Repository"}
        </button>
      </form>

      {repoFiles.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setIsRepoFilesExpanded(!isRepoFilesExpanded)}
            className="flex items-center gap-2 text-2xl font-bold mb-2 hover:text-blue-500"
          >
            <svg
              className={`w-6 h-6 transform transition-transform ${
                isRepoFilesExpanded ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            Repository Files ({repoFiles.length})
          </button>
          
          {isRepoFilesExpanded && (
            <div className="flex flex-wrap gap-2 mt-2 pl-8">
              {repoFiles.map((file) => (
                <a
                  key={file.path}
                  href={file.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-blue-200 text-blue-700 rounded-full hover:bg-blue-300"
                >
                  {file.path}
                </a>
              ))}
            </div>
          )}
      {loading && (
        <LoadingIndicator 
          currentStep={indexingStep}
          isComplete={indexingComplete}
        />
      )}
        </div>
      )}

      {!loading && indexingComplete && (
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
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
          </div>
          <span>Files ready for Agents!</span>
        </div>
      )}
      <AgentList agents={agents} reasoningEffort={reasoningEffort} />
    </div>
  );
} 