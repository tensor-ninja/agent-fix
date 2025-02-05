async function testTokenizeIndex() {
  const data = {
    action: "index",
    files: [
      { filePath: "demo.py", content: "print('Hello World')" }
    ]
  };

  const res = await fetch("http://localhost:3000/api/tokenize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  console.log("Tokenize index response:", json);
}

async function testTokenizeQuery() {
  const data = {
    action: "query",
    query: "print"
  };

  const res = await fetch("http://localhost:3000/api/tokenize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  console.log("Tokenize query response:", json);
}

async function testCodeFix() {
  const response = await fetch("http://localhost:3000/api/code-fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      issueDescription: "fix the syntax error in the print statement",
      currentCode: "print('Hello, world)",
    }),
  });

  const resultText = await response.text();
  console.log("output:\n", resultText);
}

async function testCodeFixStreaming() {
  const response = await fetch("http://localhost:3000/api/code-fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      issueDescription: "fix the syntax error in the print statement",
      currentCode: "print('Hello, world)",
    }),
  });

  if (!response.body) {
    console.error("ReadableStream not supported in this browser.");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";

  // Stream and process each chunk as it arrives.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    output += chunk;
    console.log("Received chunk:", chunk);
  }
  console.log("Final output:", output);
}
/**
 * Function to test the tokenize route.
 *
 * This function performs the following:
 *  1. Makes a POST request with action "index" to build the embedding index
 *     with sample source files.
 *  2. Makes a POST request with action "query" to search over the indexed files.
 *  3. Logs the responses from both requests.
 *
 * Ensure your local server is running (e.g., at http://localhost:3000)
 * and that the environment variable OPENAI_API_KEY is correctly configured.
 */
async function testTokenizeFlow() {
    try {
      // Step 1: Index sample files.
      const indexData = {
        action: "index",
        files: [
          { filePath: "demo.py", content: "print('Hello World')" },
          { filePath: "utils.js", content: "export function greet() { console.log('Hello'); }" }
        ]
      };
  
      const indexResponse = await fetch("http://localhost:3000/api/tokenize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(indexData)
      });
  
      const indexJson = await indexResponse.json();
      console.log("Indexing response:", indexJson);
  
      // Step 2: Query the indexed files.
      const queryData = {
        action: "query",
        query: "print"
      };
  
      const queryResponse = await fetch("http://localhost:3000/api/tokenize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryData)
      });
  
      const queryJson = await queryResponse.json();
      console.log("Query response:", queryJson);
    } catch (error) {
      console.error("Error during testing:", error);
    }
  }
  
// Execute the test function.
testTokenizeFlow();

// Run tests
//testTokenizeIndex()
//testTokenizeQuery()

// Run the streaming test
//testCodeFixStreaming();
