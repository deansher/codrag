# Cora -- Code RAG

**Cora** is a Deno-based microservice that provides Retrieval-Augmented Generation (RAG) for code hosted in one or more Git repositories (local or remote), with real-time indexing powered by **Cojack**. It uses **Weaviate’s hybrid search** under the hood for semantic + keyword lookups. Cora is implemented as a **Deno** **TypeScript** application, distributed under the **MIT License**, and is typically run in Docker alongside a local Weaviate instance for storage on the host filesystem.

Cora offers:

- **RAG Endpoint** compatible with OpenAI-style chat history.
- **Multiple Repo Support**: local (checked-out) or directly from GitHub (both private and public).
- **User Authentication & Repo Access Authorization**: ensures only permitted users/projects can query or modify repos.
- **Real-Time Indexing**: uses **Cojack** to detect and reindex changed files on the fly.
- **Simple Admin UI**: a browser-based interface for basic administration.  
- **Integration-Friendly**: primarily designed to provide its RAG endpoint to external LLM tools.

---

## Requirements

- [Deno v2.1+](https://deno.land/) (if running natively)
- [Docker](https://www.docker.com/) for the recommended containerized setup
- An available [Weaviate](https://www.weaviate.io/) instance (local or remote)  
- A cloned Git repository (or multiple repos) monitored by [Cojack](../cojack/README.md), **or** direct GitHub access for remote-only repos.

---

## Overview

### Architecture

1. **Docker-based Deployment**  
   - Cora is commonly packaged in Docker along with a **local Weaviate** instance. By default, the Weaviate instance stores index data on the host filesystem, so your state is preserved between container restarts.

2. **Multi-Repo Support**  
   - A single Cora instance can track multiple **project directories** (checked-out GitHub repos) via **Cojack**, which notifies Cora of file changes.  
   - Cora can also fetch data directly from GitHub repositories (both private and public), performing indexing without requiring local checkouts.

3. **Continuous Real-Time Indexing**  
   - **Cojack** monitors code changes in your Git repos and triggers reindex calls to Cora.  
   - Cora re-chunks only modified regions, so queries stay up to date.

4. **RAG Endpoint**  
   - Cora’s main function is to provide a **Retrieval-Augmented Generation** service.  
   - It **accepts OpenAI-compatible chat histories** as input, performs code snippet retrieval, and returns top-matching code chunks.

5. **Security & Authorization**  
   - Cora manages user authentication and checks whether each user can access a particular repo.  
   - You can configure credentials or tokens to control who can query or reindex a given project.

6. **Admin UI**  
   - Cora provides a lightweight, browser-based admin interface for overseeing repos, usage, and configuration.  
   - However, the primary usage is via the programmatic RAG endpoint.

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

## Basic RAG Endpoint

### `POST /cora/query`

- **Payload**: An **OpenAI-compatible** chat history. This is an array of messages in the form:
  ```json
  {
    "messages": [
      { "role": "system", "content": "You are a code-assistant." },
      { "role": "user", "content": "Explain how the concurrency logic works." }
    ],
    "approxLength": 8000
  }
  ```
- **Behavior**:  
  1. Cora reads the user’s messages (particularly the last user message).  
  2. Embeds the query content and searches Weaviate for relevant code chunks.  
  3. Returns a JSON response containing the matched code blocks, each in `<cora:chunk>` format.

### `POST /cora/refresh`

- **Payload**:  
  - A JSON object specifying which file(s) or directories changed. 
  - Example:
    ```json
    {
      "repoPath": "/path/to/local-repo",
      "filesChanged": ["src/index.ts"]
    }
    ```
- **Behavior**:  
  1. Instructs Cora to re-chunk and reindex the specified files.  
  2. Typically called by **Cojack** when it detects changes in a local Git repo.

---

## Example Workflow

1. **Startup**  
   - **Docker**: `docker-compose up -d` (starts both Weaviate + Cora).  
   - **Local**: run Weaviate + run Cora in separate terminals.

2. **Indexing**  
   - On first run, Cora performs an initial full index of each tracked repo (local or remote).  
   - Cora chunks source files using Tree-Sitter or fallback heuristics, then stores them in Weaviate.

3. **Query**  
   - Send a `POST /cora/query` request with an OpenAI-style `messages` array.  
   - Cora retrieves top-matching chunks from Weaviate, possibly expands references, and returns them.

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
   - Focus on chunking, reference expansion, embeddings, etc.
2. **Integration Tests**  
   - Launch a local in-memory server for API tests.
   - Optionally mock Weaviate or use a test instance to confirm end-to-end flows.
3. **End-to-End (E2E) Tests**  
   - Run both Cora and Cojack together.
   - Verify real-time indexing.

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

- **Modern, idiomatic TypeScript**: minimal dependencies, functional approach where possible.
- **Cross-Platform**: run on Linux, macOS, and Windows.  
- **Security & Authorization**: ensure PRs maintain authentication and permission checks.

Before making a PR, run:

```bash
deno lint
deno fmt
deno test
```

---

## License

Cora is licensed under the [MIT License](LICENSE). Feel free to use, modify, and embed it in your own systems under these terms.
