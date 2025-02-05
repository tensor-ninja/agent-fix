import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    // Extract issueName, issueDescription, currentCode, and reasoningEffort from the request payload.
    const { issueName, issueDescription, currentCode, reasoningEffort } = await req.json();

    // Query the tokenize endpoint using a combined query.
    const tokenizeResponse = await fetch("http://localhost:3000/api/tokenize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "query", query: `${issueName}\n${issueDescription}` })
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

    // Construct a prompt that includes both issue title and description.
    const prompt = `You're a senior software engineer. You're given a relevant code context and a description of an issue.
Solve the issue.
Issue Title: ${issueName}
Issue Description: ${issueDescription}

Current Code Context:
${fullContext}
`;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Async generator to stream reasoning traces from OpenAI.
    async function* streamReasoningTraces(prompt: string) {
      const stream = await openai.chat.completions.create({
        model: "o3-mini",
        reasoning_effort: reasoningEffort || "medium",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 100000,
        stream: true,
      });

      for await (const chunk of stream) {
        const reasoningTrace = chunk.choices?.[0]?.delta?.content || "";
        yield reasoningTrace;
      }
    }

    // Create a ReadableStream to stream the response to the client.
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamReasoningTraces(prompt)) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (error) {
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