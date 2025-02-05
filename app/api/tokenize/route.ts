import { NextResponse } from 'next/server';
import { encodingForModel } from 'js-tiktoken';

interface SourceFile {
  filePath: string;
  content: string;
}

interface CodeIndexRecord extends SourceFile {
  embedding: number[];
}

// For demonstration purposes, we store the embedding index in a global variable.
// In production, you might want to persist this in a database or an in-memory cache.
let codeIndex: CodeIndexRecord[] = [];

/**
 * Splits the input text into chunks that are below the max token limit.
 * Uses js-tiktoken to encode the text to tokens, then splits the tokens array.
 */
function chunkText(text: string, maxTokens: number): string[] {
  const encoder = encodingForModel("text-embedding-ada-002");
  const tokens = encoder.encode(text);

  // If the text is short enough, return as a single chunk.
  if (tokens.length <= maxTokens) return [text];

  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += maxTokens) {
    const chunkTokens = tokens.slice(i, i + maxTokens);
    const chunk = encoder.decode(chunkTokens);
    chunks.push(chunk);
  }
  return chunks;
}

/**
 * Helper function to call the OpenAI Embedding API for a single text chunk with exponential backoff.
 */
async function fetchEmbedding(text: string, model: string = 'text-embedding-ada-002'): Promise<number[]> {
  console.log("Fetching embedding for chunk: ", text.slice(0, 30) + "...");

  const maxRetries = 5;
  let retryCount = 0;
  let waitTime = 500; // initial wait time in ms

  while (true) {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: text,
          model,
        }),
      });

      // Handle rate limiting: wait and retry on 429 status.
      if (response.status === 429 && retryCount < maxRetries) {
        console.warn(`Rate limit hit. Retrying in ${waitTime}ms... (attempt ${retryCount + 1})`);
        await new Promise(res => setTimeout(res, waitTime));
        retryCount++;
        waitTime *= 2; // exponential backoff
        continue;
      }

      if (!response.ok) {
        // For non-rate-limit errors, throw immediately.
        throw new Error(`Error fetching embedding: ${response.statusText}`);
      }

      const data = await response.json();
      // Assumes the API returns an array of embeddings and takes the first one.
      return data.data[0].embedding;
    } catch (error) {
      if (retryCount < maxRetries) {
        console.warn(`Error occurred, retrying in ${waitTime}ms... (attempt ${retryCount + 1})`);
        await new Promise(res => setTimeout(res, waitTime));
        retryCount++;
        waitTime *= 2;
      } else {
        throw error;
      }
    }
  }
}

/**
 * Averages multiple embedding arrays (element-wise average).
 */
function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const embeddingLength = embeddings[0].length;
  const result = new Array(embeddingLength).fill(0);

  embeddings.forEach(embedding => {
    for (let i = 0; i < embeddingLength; i++) {
      result[i] += embedding[i];
    }
  });
  return result.map(val => val / embeddings.length);
}

/**
 * Computes the embedding for a given text.
 * If the text is too long, it first chunks it into pieces under the max token limit,
 * computes embeddings for each chunk, then returns the average embedding.
 */
export async function getEmbedding(
  text: string,
  model: string = 'text-embedding-ada-002'
): Promise<number[]> {
  // Remove the disallowed special token from the text.
  text = text.replace(/<\|endoftext\|>/g, '');

  // Define the maximum number of tokens allowed per chunk.
  const MAX_TOKENS_PER_CHUNK = 2048;
  // Split the text into manageable chunks.
  const chunks = chunkText(text, MAX_TOKENS_PER_CHUNK);
  
  // If there's just one chunk, fetch its embedding directly.
  if (chunks.length === 1) {
    return await fetchEmbedding(chunks[0], model);
  } else {
    // Get embeddings for all chunks concurrently and average them.
    const embeddings = await Promise.all(chunks.map(chunk => fetchEmbedding(chunk, model)));
    return averageEmbeddings(embeddings);
  }
}

/**
 * Computes the cosine similarity between two vectors of equal dimensions.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * The Next.js API route handler.
 * 
 * POST requests with action "index" and an array of files will build an embedding index.
 * POST requests with action "query" and a query string will compute the query embedding,
 * perform a vector (cosine similarity) search over the indexed files, 
 * and return the top 3 file candidates.
 */
export async function POST(request: Request) {
  try {
    const { action, files, query } = await request.json();
    console.log("Received request:", { action, files, query });

    if (action === 'index') {
      if (!Array.isArray(files)) {
        return NextResponse.json({ error: 'Files array is required for indexing.' }, { status: 400 });
      }
      // Compute the embedding for each file concurrently.
      codeIndex = await Promise.all(
        files.map(async (file: SourceFile) => {
          const embedding = await getEmbedding(file.content);
          return {
            filePath: file.filePath,
            content: file.content,
            embedding,
          };
        })
      );
      console.log("Index built:", codeIndex);

      return NextResponse.json({ message: 'Embedding index built successfully.', fileCount: codeIndex.length });
    } else if (action === 'query') {
      if (typeof query !== 'string') {
        return NextResponse.json({ error: 'A query string is required for searching.' }, { status: 400 });
      }
      if (!codeIndex.length) {
        return NextResponse.json({ error: 'Embedding index not built yet. Please index the files first.' }, { status: 400 });
      }
      // Compute the query embedding.
      console.log("Query:", query);
      const queryEmbedding = await getEmbedding(query);

      // Compute cosine similarity for each file.
      const scoredFiles = codeIndex.map(file => {
        const score = cosineSimilarity(queryEmbedding, file.embedding);
        return { ...file, score };
      });

      // Sort the files by similarity score in descending order.
      scoredFiles.sort((a, b) => b.score - a.score);

      // Return the top 3 most relevant files.
      return NextResponse.json({ results: scoredFiles.slice(0, 3) });
    } else {
      return NextResponse.json({ error: "Invalid action. Use 'index' or 'query'." }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 