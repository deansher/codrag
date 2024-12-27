# Cora Spec

Cora is a code-focused Retrieval-Augmented Generation (RAG) system that ingests source files from one or more Git repositories, splits them into semantically relevant chunks, and retrieves chunks in an AI chat context. Unlike general-purpose embeddings-and-search solutions, Cora prioritizes the structure and connections within codebases: it parses the abstract syntax tree to isolate top-level declarations, correlates references between them, and uses hybrid (vector + keyword) search to ensure precise lookups for both conceptual queries and exact identifiers.

---

## 1. Motivation & Approach

We are still in the early stages of productive AI/human collaboration. RAG in a chat context has emerged as a central paradigm. But effective RAG for a codebase is challenging. Cora aims to provide the AI with the knowledge it needs from one or more repos to do its job effectively at each step of the collaboration.

Codebases are complex, with intertwined functions, classes, tests, and documentation. The current state of a chat be used as a query to find directly relevant chunks of repo content. But we must then chase references through the codebase to provide further context.

Cora approaches this problem as follows:

1. **Structured Chunking**: Splitting source code at meaningful boundaries so each chunk is semantically coherent.
2. **Contextual Retrieval**: Applying embeddings to each chunk for semantic understanding, while also honoring literal tokens via keyword search.
3. **Reference Linking**: Accounting for cross-file or cross-declaration references (imports, function calls) to surface related snippets.
4. **Real-Time Updates**: Responding dynamically to code changes, ensuring that results reflect the current state of each repository.

---

## 2. Core Concepts

### 2.1 Chunking

Each file is split into one or more **chunks** —- file segments that capture coherent sections of code or documentation:

- **Top-Level Declarations**: For languages supported by tree-sitter, Cora gathers major units (classes, functions, methods).  
- **Grouping Small Blocks**: If a file contains many small declarations, closely related ones can be combined into a single chunk to avoid fragmentation.  
- **Metadata Capture** -- e.g., file path, line range, references
- **AI-Generated Commentary** -- prose documentation of a chunk generated in context by AI at indexing time

#### RAG Result -- The AI's Code View

Each RAG result provides the AI with an elided view across repos and files. RAG results are formatted as informal XML, using XML-style tags but not otherwise following XML syntax.

Here is the top-level structure. The XML comments are included in actual RAG results to explain this structure to the AI. Adjacent file chunks are merged in the RAG result. When an entire file is returned, its content appears in a `<cora:content>` element directly under the `<cora:file>` element.

```xml
<cora:rag-result>
  <!--
  This code RAG result provides the most relevant source file exerpts for this point in the chat. 
  <cora:content> elements contain verbatim excerpts of the latest file contents, as they
    appear right now on disk or in the repo, except that some line ranges may be elided by ". . ."
  <cora:commentary> elements contain AI-generated prose explanations that were generated at indexing time
  -->

  <cora:repo origin="https://github.com/example/repo" 
             git-commit-hash="..."
             checkout-host="ledge" checkout-path="/home/deansher/projects/example/repo">
    <cora:file path="src/example.ts" git-status="modified">
      <cora:chunk lines="10-36">
        ...
      </cora:chunk>
    </cora:file>
    ...
  </cora:repo>
  ...
</cora:rag-result>
```

Here is the structure of a chunk:

```xml
<cora:chunk lines="10-36">
  <cora:commentary>
    This function handles concurrency logic, using a shared state manager.
  </cora:commentary>
  <cora:content>
export function runTaskQueue() {
// ...
}
...
  </cora:content>
</cora:chunk>
```

---

### 2.2 Hybrid Retrieval

Cora stores each chunk’s embedding in a **Weaviate** instance, enabling approximate nearest neighbor (ANN) lookups. It also leverages Weaviate’s BM25-like indexing to match exact tokens such as unique identifiers or error codes. This hybrid approach ensures:

1. **Semantic Similarity**: High-level queries (e.g., “Explain concurrency logic”) map to the right chunk.  
2. **Exact Matches**: Uncommon tokens (e.g., `mySpecialVar128`) or error codes are found via keyword search.

---

### 2.3 Reference Expansion

After the top-K chunks are retrieved by similarity search, Cora expands the result set:

1. **Checking References**: If chunk A references chunk B (or is referenced by chunk B), B is boosted in the final ranking.  
2. **Personalized PageRank**: Cora computes a simple link-based ranking that promotes chunks with many links to the search matches.

---

### 2.4 Boost Directives

Users or higher-level orchestrations can specify **boost directives**:

- **File-Level Boost**: “Include entire `README.md`.”  
- **Declaration-Level Boost**: “Include the entire `FooClass` from `foo.ts`.”  

These hints override normal retrieval heuristics, ensuring essential content appears in the final chunk set.

---

## 3. Handling Different File Types

Although designed primarily for code (using tree-sitter), Cora can index various file formats:

1. **Markdown / Docs**: Split by headings or sections.  
2. **YAML / JSON**: Split top-level keys or major blocks.  
3. **Misc. Text / Config**: Split by a fallback rule (e.g., N lines per chunk).

The approach is modular; new file types or specialized parsers can be added as needed.

---

## 4. Implementation Outline

Below is a step-by-step summary of how Cora transforms code into searchable chunks and returns high-relevance snippets.

### 4.1 Phase 1: Parse & Chunk

#### Source Files

1. **Tree-Sitter Parsing**  
   - For each source file, parse its AST (abstract syntax tree). Identify top-level declarations like functions or classes, as well as near-top-level declarations like methods of top-level classes.
   - If unsupported by tree-sitter (e.g., .md files), use a simpler splitting heuristic.

2. **Chunk Construction**  
   - Extract the code lines for each declaration.  
   - Combine smaller related declarations if needed to fill a target chunk size.
   - Store metadata (file path, line range, references).
   - Generate and add commentary as a later step.

3. **Reference Tracking**  
   - Collect references (function calls, imports) and store them so chunk A knows that it references chunk B, and vice versa.

#### Non-Source Files

An analogous process is used for other file formats that commonly appear in code repos, such as `.md`, `.json`, `.yaml`, and `.toml`. The abstract algorithm is the same. We abstract the idea of a declaration to "content item", which may be a section, a JSON object, a YAML document, etc. We use a format-appropriate implementation of "reference".

---

### 4.2 Phase 2: Index & Store

1. **Embeddings**  
   - For each chunk, obtain an embedding vector (initially Voyage-code-3). 

2. **Weaviate Ingestion**  
   - Insert each chunk into Weaviate.
   - Include lexical data for BM25-like scoring.

3. **Real-Time Updates**  
   - Cora integrates with **Cojack**, a background process that detects changed files.  
   - Upon notification, Cora re-parses and updates the affected chunks in Weaviate.

---

### 4.3 Phase 3: Query & Retrieve

1. **Query Embedding**  
   - The user’s prompt or question is embedded via the same model.

2. **Hybrid Search**  
   - Weaviate uses both vector similarity and keyword matching to produce a top-K list of candidate chunks.

3. **Reference Expansion**  
   - Check references among the top-K; pull in relevant neighbors.  
   - Compute relevance scores of neighbors using a simple PageRank algorithm.

4. **Boost Directives**  
   - Honor explicit requests (e.g., include entire `README.md`).

5. **Response Assembly**  
   - Draw a relevance "cut line" based on a target length.
   - Assemble the RAG result.

---

## 6. Future Enhancements & Insights

Cora’s architecture is designed for incremental evolution. Some longer-term improvements include:

1. **Cross-Repo Graph**  
   - Extend referencing logic to multiple repositories. This is useful for monorepos or related projects that share code.

2. **Smarter Elision**  
   - Dynamically omit repeated boilerplate or identical code in the final snippet unless explicitly requested (e.g., license headers).

3. **Hybrid Summaries**  
   - Generate commentary that intermixes usage examples, docstrings, or integration tips, not just code-level details.

4. **Fine-Grained Reference Types**  
   - Recognize different references: imports vs. function calls vs. inheritance. Provide more nuanced expansions based on these relationships.

5. **Caching & Diff-Based Chunking**  
   - Instead of re-indexing entire files on each update, chunk changes at the diff level, saving resources for large repos undergoing frequent commits.

Ultimately, Cora aims to unify code search, reference expansion, and chunk-based snippet generation into a streamlined workflow. By balancing fine-grained code structure with user-friendly commentary, and by merging semantic and lexical search capabilities, it offers a powerful RAG foundation for developers working with complex codebases.
