# Agent Fix

Agent Fix is a Next.js application that leverages AI-powered agents to identify issues from a GitHub repository and automatically generate code fixes. By integrating with the OpenAI API and GitHub's REST endpoints, Agent Fix analyzes code files, tokenizes and indexes them, and then uses conversational AI to propose fixes along with automated testing.

> [!WARNING]  
> This project will execute code generated by the model on your system.

## Features

- **Repository Analysis:**  
  - Input a GitHub repository URL and fetch its open issues.
  - Automatically download the repository's code files (Python and JavaScript).
  
- **Code Indexing & Embedding:**  
  - Break code files into manageable chunks.
  - Generate embeddings for each chunk using OpenAI's embeddings API for improved context retrieval.
  
- **AI-Powered Code Fixing:**  
  - Each issue is assigned to an "agent" that generates a potential code fix.
  - Uses a streaming response to display real-time progress and test execution logs.
  - Automatically retries with improved suggestions if initial fixes fail the tests.

- **Interactive Interface:**  
  - Simple UI built with React and Tailwind CSS.
  - Allows selection of "reasoning effort" (low, medium, or high) to guide the AI's code-fixing process.
  - Displays detailed logs, relevant file excerpts, and final code fix results.

## Getting Started

### Prerequisites

- Node.js (v14+ recommended)
- A GitHub token with permissions to access repository issues and contents.
- An OpenAI API key.

### Installation

1. **Clone the Repository**

   ```bash
   git clone https://github.com/your-username/agent-fix.git
   cd agent-fix
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Environment Variables**

   Create a `.env.local` file in the project root and add the following variables:

   ```env
   OPENAI_API_KEY=your_openai_api_key
   GITHUB_TOKEN=your_github_token
   ```

4. **Run the Development Server**

   ```bash
   npm run dev
   ```

   The application will start on [http://localhost:3000](http://localhost:3000).

## Usage

1. Open the application in your browser.
2. Enter the URL of a GitHub repository (e.g., `https://github.com/owner/repo`).
3. Specify the number of issues to analyze and select the desired reasoning effort.
4. Click **Load Repository**. The application will:
   - Fetch open issues and repository files.
   - Index code files by generating corresponding embeddings.
   - Spawn agents that generate and test code fixes.
5. Review agent logs and click on an agent to see detailed output and relevant code excerpts.

## Architecture

- **Frontend:**  
  Built using React with Next.js. The main interface is located in the `app/page.tsx` file, with components for listing agents (`AgentList.tsx`) and displaying details (`AgentBox.tsx`).

- **API Endpoints:**  
  - `/api/tokenize`:  
    Handles both indexing (creating embeddings for code files) and querying (retrieving relevant documents based on text search).
  - `/api/code-fix`:  
    Streams the code fix generation process using OpenAI's chat completions API and calls out to backend helpers for running tests on the generated Python code.

- **AI Logic:**  
  Uses OpenAI's `o3-mini` model to generate code fixes iteratively. The system can download missing dependencies, run Python test cases, and provide live updates on the fix status.

## Testing the Endpoints

A test script (`testEndpoints.js`) is included in the repository to help manually verify:
- The tokenize (index and query) endpoints.
- The code fix generation endpoint (including streaming).

Run the test script using Node.js:

```bash
node testEndpoints.js
```

## Deployment

To build the application for production, run:

```bash
npm run build
npm run start
```

Ensure all required environment variables are set on your deployment platform.

## Contributing

Contributions, bug fixes, and feature improvements are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Commit your changes.
4. Open a pull request.

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [OpenAI API](https://openai.com/api/)
- [Tailwind CSS](https://tailwindcss.com/)
- Inspired by the need to automate code improvements using AI-powered agents.
