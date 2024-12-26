# Cora – Detailed Chunking and Retrieval Specification

This document focuses on the **internals** of how Cora handles repository files and organizes them into chunks for retrieval-augmented generation. Cora uses **Cojack** to access a checked out GitHub repository and reindex it in real time whenever code changes. Under the hood, Cora is implemented in **TypeScript** and relies on **Weaviate’s hybrid search** (vector + keyword) to power its retrieval.

---

## 1. Chunking & Commentary

### 1.1 Inspiration & Overall Flow

We emulate, at least initially, the techniques used by [aider’s](http://aider.chat) `repomap.py`:
1. **Process each source file** with tree-sitter.
2. **Parse out top-level (or near-top-level) declarations**—for example, functions, classes, methods.
3. **Group small declarations into a single chunk** to avoid overly fragmenting the code.
4. **Identify references** between declarations (e.g., function A calls function B).
5. Store metadata (file name, line ranges, references, doc comments, etc.), plus chunk embeddings.

### 1.2 Chunk Structure

Cora treats each file as a **sequence of chunks**. The first chunk often includes any leading imports and top-level doc comments; subsequent chunks typically align with major declarations. Each chunk includes:

1. **Metadata**: file name, line numbers, references, etc.  
2. **Optional Commentary**: AI-generated summary or docstring expansions intended to aid an LLM in understanding the chunk.  
3. **Content**: the actual code or text, using `...` (ellipsis) where content is elided for brevity.

Cora is designed to support both AI-assisted code understanding and AI-assisted code editing. To support code editing, it returns complete verbatim source for high-relevance chunks of the code.

#### 1.2.1 `<cora:chunk>` Format

A chunk is formatted as an XML-like element:

```xml
<cora:chunk>
  <cora:metadata>
    <!-- e.g., file="src/foo.ts" lines="10-36" -->
  </cora:metadata>
  <cora:commentary>
    <!-- Optional: short summary or context for LLM consumption -->
  </cora:commentary>
  <cora:content>
    <!-- Actual code lines, with possible . . . elisions -->
  </cora:content>
</cora:chunk>
```

- **`<cora:metadata>`**: Minimal info to locate and track the chunk (file path, line offsets).  
- **`<cora:commentary>`**: A short summary or doc-like explanation.  
- **`<cora:content>`**: The verbatim code or text, possibly elided (`. . .`) if content is lengthy.

---

## 2. Boost Directives & Advanced Retrieval

Beyond the basic “nearest chunks” approach, Cora supports **boost directives**. This mechanism allows the user (or a higher-level orchestration) to designate certain files, declarations, or entire directories as “must-include” or “high priority” during retrieval. For example:

- **Explicit File Inclusion**: “Always include `README.md` fully.”  
- **Declaration-Level Boosting**: “Return the entire `FooClass` implementation.”

---

## 3. References & Personalized PageRank

In addition to nearest-neighbor embedding searches, Cora includes a **relationship expansion** step:
1. **Root Chunks**: The top-N chunks most relevant to the query (by embedding similarity).  
2. **Referential Expansion**: If chunk A references chunk B, then B gets a “link-based” boost.  
3. **Personalized PageRank**: The final set of chunks is determined by combining embedding scores + reference-based boosts.

In other words, a chunk that is frequently referenced by your top results is more likely to be included.

---

## 4. Handling Non-Source Files

Although Cora is primarily designed for source code, it also accommodates:
- **Markdown & Docs** (grouped by headings/sections).
- **YAML & JSON** (grouped by top-level keys).
- **Miscellaneous** text or configuration files.

For these file types, tree-sitter might be replaced or augmented by simpler chunking heuristics (e.g., splitting on headings in `.md`). Doc sections can still have references (e.g., in-line links).

---

## 5. Implementation Notes

1. **Caching & Updates**:
   - Cora uses **Cojack** to detect file changes in real time. When major edits occur, Cora re-ingests or re-chunks the affected files.  
   - An initial MVP might refresh everything, while future iterations can do more incremental indexing based on Git diffs.

2. **Multi-File Aggregation**:
   - The final returned snippet may combine chunks from multiple files (or multiple repos in future expansions).
   - Cora unifies them under the same `<cora:chunk>`-based markup, ensuring an LLM can parse each chunk in context.

---

## 6. Future-Focused Enhancements

1. **Hybrid Summaries**: Summaries that combine code commentary with high-level usage examples.  
2. **Multi-Repo Graph**: A cross-repo reference graph, letting Cora unify code relationships across different projects.  
3. **Automatic Elision of “Noisy” Blocks**: If repeated boilerplate code appears in many files, automatically detect and omit (unless specifically referenced).  
4. **Comprehensive Reference Types**: Future expansions could parse not just imports and function calls, but also environment dependencies, build pipeline references, etc.

---

## 7. MVP Implementation Outline

Below is a concise, step-by-step outline for how Cora can be initially implemented in an MVP capacity, focusing on the core tasks of **chunking**, **embedding**, **storing**, and **retrieving** code. This design aligns with the broader Cora specification but keeps the implementation as straightforward as possible for immediate functionality.

### 7.1 Overview

The MVP algorithm proceeds in **four phases**:

1. **Parse & Chunk**  
   - Use a code-aware parser (e.g., Tree-Sitter) to walk through each file, extracting top-level declarations (e.g., functions, classes, or methods).  
   - If a file lacks recognized structure (like plain text or Markdown), fall back on a simpler “heading-based” or “N-line” splitting approach.  
   - Build a list of chunks, each with metadata (`filepath`, `lineStart`, `lineEnd`, etc.) and the raw code snippet.  

2. **Embed & Store**  
   - For each chunk generate an embedding. (Our initial code embedding model is Voyage-code-3.) 
   - Store the chunk context, embedding, and associated metadata in **Weaviate** for hybrid BM25/vector retrieval.

3. **Query & Retrieval**  
   - For an incoming request:
     1. Determine the user’s query text (e.g., from an LLM conversation or direct request).
     2. Embed the query content with the same model used to embed chunks.
     3. Perform a **hybrid similarity search** in Weaviate (vector + keyword) to fetch the top-K matching chunks.
     4. Apply reference expansion with page-rank scoring to pick up additional chunks.
     5. Choose the higher-relevance chunks that will be included in their entirity in the response, versus lower-relevance chunks whose implementations will be elided.
     6. Combine the final set of chunks into a `<cora:chunk>`-based text block for returning to the caller.

---

### 7.2 Phase 1: Parse & Chunk

1. **Initialize Tree-Sitter**  
   - Load the grammar for the relevant languages (TypeScript, Python, etc.).  
   - For non-supported or simple text files, skip AST-based parsing.  

2. **Extract Top-Level Declarations**  
   - Identify each function/class/method node.  
   - Capture the entire source code for each node.

3. **Build Chunk Metadata**  
   - For each chunk, store:
     - `filePath`: relative path in the repo.  
     - `lineRange`: e.g., `startLine` and `endLine`.  
     - `references`: minimal set of references (if easily derivable from import statements or function calls).  
     - `content`: the raw (possibly partially elided) code lines.

4. **Generate Commentary (Optional)**  
   - If you want short doclike commentary, feed a small prompt to an LLM or implement a static summarizer for each chunk.  
   - Store this commentary so it can be embedded separately.

---

### 7.3 Phase 2: Embed & Store

1. **Choose an Embedding Model**  
   - For the MVP, pick a single model (e.g., OpenAI’s `text-embedding-ada-002` or a local open-source alternative).  
   - Each chunk yields:
     - `embeddingCode`: an embedding of the raw code snippet.  
     - `embeddingCommentary`: an embedding of the commentary (if used).

2. **Store in Weaviate**  
   - Within Weaviate, define a schema class (e.g., `CoraChunk`) to hold your chunk’s metadata and embeddings.  
   - Insert each chunk with its vector embeddings so that Weaviate can perform approximate nearest neighbor (ANN) searches.

3. **Index Updates**  
   - As code changes, **Cojack** notifies Cora.  
   - Cora identifies which files changed, re-runs the parse-and-chunk step, and updates Weaviate.  

---

### 7.4 Phase 3: Query & Retrieval

1. **Embed the Query**  
   - Take the user’s prompt or request body and generate a vector embedding via the same model used for chunk embeddings.

2. **Hybrid Search in Weaviate**  
   - Use Weaviate’s **hybrid search** for the top-K matches, combining both vector similarity and keyword/BM25-like scoring.  
   - Retrieve chunk metadata and raw code for those matches.

3. **Reference Expansion (Optional)**  
   - Gather references from the top-K chunks.  
   - Pull in additional chunks that are either directly referenced or appear in the same file.  
   - Limit the final set to `approxLength` tokens.

4. **Response Assembly**  
   - Format the final set of chunks as `<cora:chunk>` blocks, each containing `<metadata>`, `<commentary>` (if available), and `<content>`.  
   - Return them in an appropriate response payload.

---

### 7.5 Phase 4: (Optional) PageRank Boost

1. **Build Graph of References**  
   - For each chunk, you have a list of references (e.g., imported modules, called functions). Build a directed graph connecting chunks.

2. **Re-Score**  
   - After obtaining top-K by embedding similarity, run a short link-based scoring pass (like a personalized PageRank) to see which chunks are heavily connected to the top-K.  
   - Increase the rank of those that appear in multiple references.

3. **Combine & Cap**  
   - Merge the embedding-based top-K with any strongly boosted chunks from reference analysis.  
   - Enforce length constraints so you don’t exceed the `approxLength` limit.

---

### 7.6 Example Data Flow (MVP)

1. **Indexing**  
   - A background process, triggered by Cojack, notices a local Git repository checkout.  
   - Cora scans the repo files, calls Tree-Sitter on supported languages, produces chunk objects.  
   - Each chunk is embedded and stored in Weaviate.

2. **Querying**  
   - The user calls an endpoint such as `POST /cora/query` with a `messages` array and `approxLength: 8000`.  
   - Cora embeds the query, fetches the top 6–10 chunks from Weaviate, and optionally expands references.  
   - The chunks are returned as `<cora:chunk>` elements in the response.

3. **Real-Time Reindex**  
   - Whenever code changes, Cojack informs Cora.  
   - Cora re-processes any altered file, re-chunking and re-indexing only what’s changed.

---

### 7.7 Summary of MVP Goals

- **Simplicity**: The algorithm avoids heavy complexity—one pass for chunk creation, one pass for embedding, one pass for retrieval.  
- **Extensibility**: You can add advanced reference analysis or more flexible chunk splitting later.  
- **Modularity**: Each phase (parse, embed, store, retrieve) is conceptually separate, making debugging easier.  
- **Low Friction**: For smaller repos, a single Weaviate instance is enough. Larger deployments can scale horizontally and add advanced caching or replication strategies.

---

## 8. Incorporating Hybrid Lexical & Semantic Search

Recent insights from **Anthropic’s Contextual Retrieval** method, along with established lexical indexing techniques such as **BM25**, highlight the need to balance semantic similarity with exact keyword matching—particularly when unique identifiers or error codes are present. Below is a proposed addition to Cora that leverages **Weaviate’s hybrid search** to handle both conceptual and literal matches.

### 8.1 Rationale

1. **Exact Keyword Searches**  
   - Pure embedding approaches may overlook rare or “low-frequency” terms (e.g., `TS-999`, `myVarXYZ`).  
   - BM25-like token matching ensures those terms are accounted for.

2. **Semantic Similarity**  
   - Embedding-based queries capture broader, conceptual matches—critical for “explain how function X works” or “find the concurrency logic in this class.”

3. **Hybrid Fusion**  
   - Weaviate can combine vector and lexical search into a single query, returning results that satisfy both literal token matches and conceptual closeness.

4. **Contextual Chunking**  
   - Prepending short chunk-specific context strings (e.g., “This chunk is from the concurrency module…”) can further improve recall.

### 8.2 Proposed Changes

1. **Dual Indexing via Weaviate**  
   - **Vector Index**: Store each chunk’s embedding.  
   - **Keyword/BM25**: Allow Weaviate’s hybrid search to parse chunk text for lexical queries.  
   - Merge or re-rank the results (Weaviate can do this automatically in many configurations).

2. **Query Flow**  
   - The user’s query is first embedded.  
   - In parallel, Weaviate processes the text as a keyword search.  
   - Hybrid search fuses both results, returning the top hits that satisfy either or both scoring criteria.  

3. **Contextual Retrieval**  
   - Provide additional context in chunk text or commentary fields.  
   - Weaviate’s indexing can then capture both the code snippet and a short description.

### 8.3 Implementation Notes with Weaviate

1. **Chunk Schema**  
   - In Weaviate, define a class `CoraChunk` with fields like:
     ```graphql
     class: CoraChunk
     properties:
       - name: content
       - name: commentary
       - name: filePath
       - name: references
       - name: lineRange
     vectorIndexType: hnsw
     vectorizer: some-embedding-config
     ```
   - This schema enables both vector search and (optionally) generative or keyword-based queries.

2. **Embedding Management**  
   - Cora sends the chunk’s code snippet + commentary to the embedding model, receives a vector, and passes it to Weaviate on creation or update.  
   - Weaviate stores the vector for ANN queries.

3. **Hybrid Searching**  
   - In Weaviate queries, you can specify something like:
     ```graphql
     nearText: {
       concepts: ["function X concurrency"],
       moveTo: {...},
       moveAwayFrom: {...}
     }
     bm25: {
       query: "function X concurrency"
     }
     ```
   - Weaviate combines these signals, returning a unified result set.

4. **Rank Fusion**  
   - If you need custom weighting, you can override how vector or keyword matches are ranked via Weaviate’s GraphQL parameters or your own re-ranking step.

### 8.4 Example Flow

**Indexing**  
1. Parse chunk → gather chunk text + optional commentary.  
2. Embed each snippet → store `(content, commentary, vector)` in Weaviate as a `CoraChunk` object.

**Querying**  
1. User’s question: “Where is function X declared?”  
2. Cora calls Weaviate’s **hybrid query** with the text “function X declared,” specifying both BM25 and vector search.  
3. Weaviate merges the results, returning chunks referencing or semantically matching “function X.”  
4. Cora may expand references if desired, then formats final output as `<cora:chunk>` blocks.

### 8.5 Conclusion

By integrating **Weaviate’s hybrid search**, Cora can handle both **exact identifier lookups** and **semantic** code or doc queries. This approach:

- Improves coverage for unique code tokens.  
- Maintains conceptual and high-level matching via embeddings.  
- Scales easily as repositories grow.  

All of these additions enrich Cora’s chunk-based retrieval system, ensuring robust code search and snippet assembly that smoothly handles real-time changes via Cojack. 
