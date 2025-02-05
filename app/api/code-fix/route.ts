import OpenAI from "openai";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function runPythonCode({
  code,
  testCases,
}: {
  code: string;
  testCases: string[];
}): Promise<{ success: boolean; output: string }> {
  // Indent each test case so that it is correctly nested under the try clause.
  const indentedTestCases = testCases
    .map((tc) => {
      return tc.split("\n").map((line) => "        " + line).join("\n");
    })
    .join("\n");

  const fileContent = `
${code}

if __name__ == "__main__":
    import sys
    try:
${indentedTestCases}
    except Exception as e:
        print("TEST_FAILED", e)
        sys.exit(1)
    else:
        print("TEST_PASSED")
  `;

  // Write the combined content to a temporary file.
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `fix_${Date.now()}.py`);
  try {
    await fs.writeFile(filePath, fileContent);
    // Execute the file using the system's Python runtime (ensure that Python is installed).
    const { stdout, stderr } = await execAsync(`python ${filePath}`, { timeout: 10000 });
    // Check stdout for the "TEST_PASSED" message.
    if (stdout.includes("TEST_PASSED")) {
      return { success: true, output: stdout };
    } else {
      return { success: false, output: stdout || stderr };
    }
  } catch (error: any) {
    return { success: false, output: error.stderr || error.message };
  } finally {
    // Attempt to remove the temporary file.
    fs.unlink(filePath).catch(() => {});
  }
}

async function downloadDependency(dependency: string): Promise<{ success: boolean; output: string }> {
  try {
    // Execute pip install using the current Python interpreter.
    const { stdout, stderr } = await execAsync(`python -m pip install ${dependency}`, { timeout: 30000 });
    // Treat any stderr output (beyond just empty whitespace) as a potential failure.
    if (stderr && stderr.trim()) {
      return { success: false, output: stderr };
    }
    return { success: true, output: stdout };
  } catch (error: any) {
    return { success: false, output: error.stderr || error.message };
  }
}

async function* streamFixProcess(prompt: string, reasoningEffort: string) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const maxAttempts = 5;
  let attempt = 0;
  let successfulCode: string | null = null;
  let successfulTestCases: string[] | null = null;
  // Start conversation with the initial prompt.
  const chatMessages: Array<any> = [{ role: "user", content: prompt }];

  while (attempt < maxAttempts && !successfulCode) {
    yield `Attempt ${attempt + 1}: Generating Python code fix and test cases...\n\n`;
    try {
      // Remove any lingering tool messages before the API call.
      const conversation = chatMessages.filter((msg) => msg.role !== "tool");

      const response = await openai.chat.completions.create({
        model: "o3-mini",
        reasoning_effort: reasoningEffort || "medium",
        messages: conversation,
        tools: [
          {
            type: "function",
            function: {
              name: "run_python_code",
              description:
                "Run the provided python code along with test cases and return test results.",
              parameters: {
                type: "object",
                properties: {
                  code: {
                    type: "string",
                    description: "The python code fix.",
                  },
                  testCases: {
                    type: "array",
                    items: { type: "string" },
                    description: "An array of python test case strings.",
                  },
                },
                required: ["code", "testCases"],
                additionalProperties: false,
              },
              strict: true,
            },
          },
          {
            type: "function",
            function: {
              name: "download_dependency",
              description:
                "Download a Python dependency using pip if a module is missing.",
              parameters: {
                type: "object",
                properties: {
                  dependency: {
                    type: "string",
                    description: "The name of the dependency to install.",
                  },
                },
                required: ["dependency"],
                additionalProperties: false,
              },
              strict: true,
            },
          },
        ],
        tool_choice: "auto",
      });

      const message = response.choices?.[0]?.message;

      if (message?.tool_calls?.[0]) {
        const toolCall = message.tool_calls[0];
        const toolCallId = toolCall.id;
        if (toolCall.function.name === "download_dependency") {
          let params;
          try {
            params = JSON.parse(toolCall.function.arguments);
          } catch (err) {
            if (toolCallId) {
              chatMessages.push({
                role: "tool",
                content: JSON.stringify({ error: "Error parsing function arguments for download_dependency" }),
                tool_call_id: toolCallId,
              });
            }
            yield `Error parsing download_dependency function call arguments. Please retry.\n\n`;
            attempt++;
            chatMessages.push({
              role: "user",
              content: "Function call arguments for download_dependency could not be parsed. Please ensure proper JSON formatting.",
            });
            continue;
          }
          yield `Downloading dependency ${params.dependency}...\n\n`;
          const depResult = await downloadDependency(params.dependency);
          if (toolCallId) {
            chatMessages.push({
              role: "tool",
              content: JSON.stringify(depResult),
              tool_call_id: toolCallId,
            });
          }
          if (depResult.success) {
            yield `Dependency ${params.dependency} installed successfully.\n\n`;
            chatMessages.push({
              role: "user",
              content: `Successfully installed dependency ${params.dependency}. Please regenerate the code fix if necessary.`,
            });
          } else {
            yield `Failed to install dependency ${params.dependency}: ${depResult.output}\n\n`;
            chatMessages.push({
              role: "user",
              content: `Failed to install dependency ${params.dependency}: ${depResult.output}. Please correct the installation and try again.`,
            });
            attempt++;
          }
          continue;
        } else if (toolCall.function.name === "run_python_code") {
          let params;
          try {
            params = JSON.parse(toolCall.function.arguments);
          } catch (err) {
            if (toolCallId) {
              chatMessages.push({
                role: "tool",
                content: JSON.stringify({ error: "Error parsing function arguments for run_python_code" }),
                tool_call_id: toolCallId,
              });
            }
            yield `Error parsing function call arguments for run_python_code. Please retry.\n\n`;
            attempt++;
            chatMessages.push({
              role: "user",
              content: "Function call arguments for run_python_code could not be parsed. Please ensure proper JSON formatting.",
            });
            continue;
          }
          yield `Generated code fix. Running test cases...\n\n`;
          const result = await runPythonCode(params);

          if (toolCallId) {
            chatMessages.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: toolCallId,
            });
          }

          if (result.success) {
            successfulCode = params.code;
            successfulTestCases = params.testCases;
            yield `Test cases passed! Fix successful on attempt ${attempt + 1}.\n\n`;
            break;
          } else {
            // Automatically detect if the error is due to a missing dependency.
            const missingDepMatch = result.output.match(/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/);
            if (missingDepMatch) {
              const missingDependency = missingDepMatch[1];
              yield `Missing dependency detected: ${missingDependency}. Attempting to install...\n\n`;
              const depResult = await downloadDependency(missingDependency);
              yield `Dependency installation output: ${depResult.output}\n\n`;
              if (depResult.success) {
                chatMessages.push({
                  role: "user",
                  content: `Dependency ${missingDependency} installed successfully. Please retry generating the code fix.`,
                });
              } else {
                chatMessages.push({
                  role: "user",
                  content: `Failed to install dependency ${missingDependency}: ${depResult.output}. Please check the installation.`,
                });
                attempt++;
              }
              continue;
            } else {
              yield `Test cases failed on attempt ${attempt + 1}: ${result.output}\n\n`;
              chatMessages.push({
                role: "user",
                content: `The tests failed with the error: ${result.output}. The code: ${params.code}. The original issue: ${prompt}. Please improve the code fix accordingly.`,
              });
              attempt++;
            }
          }
        } else {
          yield "Unknown tool call received. Retrying...\n\n";
          attempt++;
        }
      } else {
        yield `No function call received. Retrying...\n\n`;
        attempt++;
      }
    } catch (error: any) {
      yield `Error during generation: ${error.message}\n\n`;
      attempt++;
    }
  }
  if (!successfulCode) {
    yield `Failed to generate a working fix after ${maxAttempts} attempts.\n\n`;
  } else {
    yield `Final working fix:\n\nCode Fix:\n${successfulCode}\n\nTest Cases:\n${successfulTestCases?.join("\n")}\n\n`;
  }
}

export async function POST(req: Request) {
  try {
    // Extract issueName, issueDescription, currentCode, and reasoningEffort from the request payload.
    const { issueName, issueDescription, currentCode, reasoningEffort } = await req.json();

    // Query the tokenize endpoint using a combined query.
    const tokenizeResponse = await fetch("http://localhost:3000/api/tokenize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "query", query: `${issueName}\n${issueDescription}` }),
    });

    if (!tokenizeResponse.ok) {
      throw new Error(`Tokenize endpoint error: ${tokenizeResponse.statusText}`);
    }

    const tokenizeResult = await tokenizeResponse.json();
    const relevantDocuments = tokenizeResult.results || [];
    console.log("Relevant Documents:", relevantDocuments);
    const additionalContext = relevantDocuments.map((doc: any) => doc.content).join("\n\n");

    // Combine the current code context with the additional excerpts.
    const fullContext = `${currentCode}\n\nRelevant Code Excerpts:\n${additionalContext}`;

    // Construct a prompt that includes both the issue title and description, plus instructions for function calling.
    const prompt = `
You're a senior software engineer. You're tasked with generating a Python code fix for the following issue.
Issue Title: ${issueName}
Issue Description: ${issueDescription}

The current code context is provided below, along with relevant code excerpts:
${fullContext}

Generate a Python code fix that resolves the issue. Additionally, generate a set of Python test cases to validate that the fix works correctly. Your response should be a function call to "run_python_code" with the parameters "code" and "testCases". 
- "code" should contain only the Python code fix.
- "testCases" should be an array of Python code strings, each representing a test case.
If the tests fail, you should try again based on the error message, up to a maximum of 5 attempts.
Do not include any additional text.
    `;

    // Create a ReadableStream to stream the response to the client.
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamFixProcess(prompt, reasoningEffort || "medium")) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (error: any) {
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
} 