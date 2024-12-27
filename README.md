# Cora -- Code RAG

**Cora** is a Deno-based microservice that provides Retrieval-Augmented Generation (RAG) for code hosted in one or more Git repositories (local or remote), with real-time indexing powered by **Cojack**. It uses **Weaviate’s hybrid search** under the hood for semantic + keyword lookups. Cora is implemented as a **Deno** **TypeScript** application, distributed under the **MIT License**, and is typically run in Docker alongside a local Weaviate instance for storage on the host filesystem.

Cora offers:

- **RAG Endpoint** compatible with OpenAI-style chat history, with advanced chunking and references.
- **Multiple Repo Support**: local (checked-out) or directly from GitHub (both private and public).
- **User Authentication & Repo Access Authorization**: ensures only permitted users/projects can query or modify repos.
- **Real-Time Indexing**: uses **Cojack** to detect and reindex changed files on the fly.
- **Sophisticated Chunking & Commentary**: each file is split into structured chunks, optionally including short summaries to improve retrieval quality.
- **Simple Admin UI**: a browser-based interface for basic administration.  
- **Integration-Friendly**: primarily designed to provide its RAG endpoint to external LLM tools.

---

## Requirements

- [Deno v2.1+](https://deno.land/) (if running natively)
- [Docker](https://www.docker.com/) for the recommended containerized setup
- An available [Weaviate](https://www.weaviate.io/) instance (local or remote)  
- A cloned Git repository (or multiple repos) monitored by **Cojack**, **or** direct GitHub access for remote-only repos.

---

## Overview

### Architecture

1. **Docker-based Deployment**  
   - Cora is commonly packaged in Docker along with a **local Weaviate** instance. By default, the Weaviate instance stores index data on the host filesystem, so your state is preserved between container restarts.

2. **Multi-Repo Support**  
   - A single Cora instance can track one checked-out git repo via **Cojack**, which notifies Cora of file changes.  
   - Future: We intend Cora to support multiple **project directories** (checked-out GitHub repos) 
   - Future: We intend Cora to support fetching data directly from GitHub repositories (both private and public), performing indexing without requiring local checkouts.

3. **Continuous Real-Time Indexing**  
   - **Cojack** monitors code changes in your Git repos and triggers reindex calls to Cora.  
   - Cora re-chunks only modified regions, so queries stay up to date.

4. **RAG Endpoint**  
   - Cora’s main function is to provide a **Retrieval-Augmented Generation** service.  
   - It **accepts OpenAI-compatible chat histories** as input, performs code snippet retrieval (with advanced chunking and reference expansion), and returns top-matching code chunks.

5. **Security & Authorization**  
   - Cora manages user authentication and checks whether each user can access a particular repo.  
   - You can configure credentials or tokens to control who can query or reindex a given project.

6. **Admin UI**  
   - Cora provides a lightweight, browser-based admin interface for overseeing repos, usage, and configuration.  
   - However, the primary usage is via the programmatic RAG endpoint.

---

## Security & Potential Future Directions

Cora’s initial security model supports:

- **Token or Credential-Based Access**: A single access token or set of credentials that grants permission for queries or reindex operations.
- **Repo-Level Authorization**: Configure which users or tokens can access which repos.

Future: we expect to support organizations with more complex security requirements, including:

1. **User Accounts & Authentication**  
   - Map tokens to unique user accounts.  
   - Integrate with OAuth or SSO (e.g. GitHub, Google).  
   - Session-based tokens or short-lifespan tokens.

2. **Fine-Grained Authorization**  
   - Per-repo roles (reader, contributor, admin).  
   - Directory or file-level rules.

3. **Auditing & Logging**  
   - Query logs tracking who asked what, when.  
   - Access traces to see which files or chunks were retrieved.

4. **Secure Access Enforcement**  
   - TLS/SSL in front of Cora.  
   - Deploy behind a VPN or private subnetwork.

5. **Multi-Tenant Caching**  
   - Shared repo caches for teams.  
   - Separate caching for private, per-user repos.

---

## How It Works: Chunking, Commentary & Retrieval

Cora processes files by splitting them into *chunks*, each with associated metadata and (optionally) a short generated commentary. These chunks are stored with vector embeddings, enabling both semantic similarity and keyword-based lookups.

- **Chunk Formation**:  
  - For source code, Cora uses a language-aware approach (e.g., tree-sitter) to isolate major declarations or sections.  
  - For non-code files (Markdown, YAML, etc.), heuristic-based splitting is used.  
  - Chunks may elide large sections with `...` to keep them within size constraints.

- **Embedding & Storage**:  
  - Each chunk’s raw code (and optional AI-generated commentary) is embedded and stored in Weaviate.  
  - Commentary can summarize or highlight a chunk’s purpose, improving conceptual matches.

- **Reference Expansion**:  
  - Chunks reference each other through calls, imports, or file-level relationships.  
  - When you query, Cora finds top-N relevant chunks, then optionally pulls in neighbors by reference if they provide crucial context (e.g., a function definition that’s called by a top result).

- **Boost Directives**:  
  - You can hint that certain files or declarations are must-include or higher priority.  
  - This ensures essential files (like core libraries or README) appear in the final snippet.

---

## RAG API Endpoints

### `POST /cora/query`

Cora’s principal retrieval endpoint. This accepts an OpenAI-style chat history, searches relevant repos, and returns a curated snippet of code or documentation in a `<cora:chunk>`-based format.

#### Example Request Payload

```json
{
  "messages": [
    { "role": "system", "content": "You are a code-assistant." },
    { "role": "user", "content": "Explain how concurrency logic works in repo A" }
  ],
  "approxLength": 8000,
  "repos": [
    {
      "originUri": "http://github.com/organization/repoA",
      "checkoutPath": "/path/to/repoA",
      "versionSpecifier": "latest"
    }
  ],
  "boostDirectives": {
    "files": ["README.md"],
    "declarations": [
      {
        "repoId": "repoA",
        "path": "src/concurrency",
        "includeImplementation": true
      }
    ]
  }
}
```

- **`messages`**: OpenAI-style conversation messages.  
- **`approxLength`**: Soft limit (in characters) to keep the final code snippet or text within.  
- **`repos`**: One or more repositories, each with a `checkoutPath` or remote Git reference.  
- **`boostDirectives`** (optional): Tells Cora to prioritize or fully include certain files or declarations.

#### Example Response

```json
{
  "ragResult": "",
  "metadata": { "sourcesUsed": ["src/concurrency/index.ts"] }
}
```

- **`ragResult`**: A single large string formatted as shown below 
- **`metadata`**: Additional info, e.g. which files or lines were included.

`ragResult` provides the AI with an elided view across repos and files. RAG results are formatted as informal XML, using XML-style tags but not otherwise following XML syntax.

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

### `POST /cora/refresh`

A housekeeping endpoint that prompts Cora to re-scan the specified repo(s). Useful when you suspect a major set of changes wasn’t automatically captured.

#### Example Request Payload

```json
{
  "repoPath": "/path/to/local-repo"
}
```

#### Example Response

```json
{
  "status": "ok",
  "refreshed": true
}
```

---

## Usage

### 1. Running Cora in Docker (Recommended)

Cora ships with a Docker setup that includes Weaviate as part of the same stack:

```bash
docker-compose up -d
```

- This will start:
  - **Cora** on an exposed HTTP port (check `docker-compose.yml` for the port mapping).
  - **Weaviate** (using a local volume to store index data).
- Configure environment variables (e.g., `WEAVIATE_URL`, credentials, or any repo access tokens) in your `.env` file or your Docker Compose config.

### 2. Running Cora Natively (Optional)

If you prefer not to use Docker, ensure you have:

1. **Weaviate**: either running locally (e.g., via Docker) or a remote instance.
2. **Deno**: to run the service.

Then launch Cora:
```bash
deno task start --allow-net --allow-read
```
- Cora picks up your Weaviate connection details from environment variables (e.g., `WEAVIATE_URL`).

### 3. Connecting Cojack (Local Repos)

For each local repo you wish to track:
1. Run **Cojack**:
   ```bash
   deno task dev /path/to/your/local-repo
   ```
2. Cojack detects file changes and informs Cora via `POST /cora/refresh`.

### 4. Accessing Remote GitHub Repos

If you want Cora to index repos **directly** from GitHub (public or private):
1. Provide **GitHub credentials** (a personal access token with appropriate scopes) to Cora.
2. Configure Cora to track the desired remote repositories. It will periodically or on-demand fetch changes and reindex.

---

## Example Workflow

1. **Startup**  
   - **Docker**: `docker-compose up -d` (starts both Weaviate + Cora).  
   - **Local**: run Weaviate + run Cora in separate terminals.

2. **Indexing**  
   - On first run, Cora performs an initial full index of each tracked repo (local or remote).  
   - Cora chunks source files, optionally generates commentary, then stores them in Weaviate.

3. **Query**  
   - Send a `POST /cora/query` request with an OpenAI-style `messages` array (and optionally `boostDirectives`).  
   - Cora retrieves top-matching chunks from Weaviate, may expand to reference-related chunks, and returns them.

4. **Real-Time Updates**  
   - If you edit local repos, **Cojack** triggers `POST /cora/refresh`.  
   - Cora re-chunks changed regions only, so the search index remains fresh.

5. **Admin UI**  
   - Navigate to the admin UI (URL shown in logs or Docker output) to see a list of repos, configure access tokens, or watch indexing status.

---

## Building an Executable (Optional)

For those who prefer a single executable:

- **Linux**:
  ```bash
  deno compile --output cora --allow-net --allow-read main.ts
  ```
- **macOS**:
  ```bash
  deno compile --output cora_mac --allow-net --allow-read main.ts
  ```
- **Windows**:
  ```bash
  deno compile --output cora.exe --allow-net --allow-read main.ts
  ```

You can then run `./cora` (or equivalent) with necessary environment variables set, like `WEAVIATE_URL`.

---

## Testing

Cora’s tests rely on **Deno’s built-in test framework**:

1. **Unit Tests**  
   - Validate chunk parsing, commentary generation, reference linking, and embedding.
2. **Integration Tests**  
   - Launch a local in-memory server for API tests.
   - Optionally mock Weaviate or use a test instance to confirm end-to-end flows.
3. **End-to-End (E2E) Tests**  
   - Run both Cora and Cojack together.
   - Verify real-time indexing and chunk updates.

```bash
deno test --allow-net --allow-read
```

For coverage:

```bash
deno test --coverage=coverage/
deno coverage coverage/
```

---

## Contributing

We welcome contributions! Please:
1. Open an [issue](../../issues) if you encounter bugs or have suggestions.
2. Submit a pull request for bug fixes, docs, or feature enhancements.

### Project Style

- **Modern, idiomatic TypeScript**: prefer a functional style with immutable data structures.
- **Deno-First**: use Deno's built-in features and standard libraries.
- **Cross-Platform**: run on Linux, macOS, and Windows.  
- **Security & Authorization**: ensure every PR maintains or improve Cora's security

Before making a PR, run:

```bash
deno lint
deno fmt
deno test
```

---

## License

Cora is licensed under the [MIT License](LICENSE). Feel free to use, modify, and embed it in your own systems under these terms.
