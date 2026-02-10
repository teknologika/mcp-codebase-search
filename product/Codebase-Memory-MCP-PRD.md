# Codebase Memory MCP Server

## Problem Statement

People using LLM coding assistants waste time because the model cannot reliably discover what already exists in a codebase, so it guesses, duplicates implementations, and edits the wrong files. The cost compounds quickly because review time increases, architecture drifts, and quick fixes create long-lived mess that the team then has to pay down.

## Evidence

Assumption: coding assistants commonly create duplicate implementations when they do not have fast, trustworthy search and retrieval over the existing repository state; needs validation through observed PR review notes and a small sample of assistant-authored change sets. Observation: language-aware parsing and chunking materially improves retrieval relevance for code compared to naive fixed-size chunking, especially when the user is asking about symbols, call sites, or implementations. Assumption: developers prefer local-first indexing for privacy and speed, especially when indexing proprietary repositories; needs validation through a short pilot and adoption metrics.

## Proposed Solution

We will build a fully local codebase memory system packaged as an npm TypeScript project that exposes an MCP server for discovery and retrieval, a local ingestion CLI for indexing, and a lightweight one-page management UI served by a Fastify web server. Code is chunked using Tree-sitter-aware strategies for C#, Java (JDK22+), JavaScript/TypeScript, and Python, embedded locally using `@huggingface/transformers`, and stored in a locally running ChromaDB instance with metadata that preserves provenance. The operational model is intentionally simple: no file watching, no incremental updates, and no partial refresh; we re-ingest the target directory when the user wants the index updated, using out of the box defaults for model choice and configuration.

## Key Hypothesis

We believe fast, local, AST-aware code search and retrieval via MCP tools will reduce duplicate implementations and wrong-file edits for developers using LLM coding assistants. We'll know we're right when assistant-assisted PRs show a measurable drop in duplicated code and rework, and when users report they can locate the right place to change within minutes rather than by manual grepping.

## What We're NOT Building

- Incremental indexing, file watchers, or update-on-change workflows, because the first release must be operationally simple and deterministic.
- Remote collaboration features such as shared indexes, hosted storage, or multi-user auth, because this must run fully locally on a developer workstation.
- Broad language support beyond C#, Java (JDK22+), JavaScript/TypeScript, and Python, because anything else should be surfaced as unsupported rather than best-effort indexed to avoid false confidence.

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Duplicate-implementation rate in assistant-assisted PRs | 50% reduction within 4 weeks of adoption | Static analysis plus reviewer tagging (“duplicate created”) across a baseline and post-adoption window |
| Time-to-right-file for a change request | Median under 3 minutes | Instrumented CLI and UI events (search to open result) plus short user self-report sampling |

---

## Users & Context

**Primary User**
- **Who**: A developer or tech lead using an LLM coding assistant on a developer workstation who needs high-confidence discovery over one or more repositories, including monorepos.
- **Current behavior**: They rely on ripgrep and IDE search, plus assistant guesses and tribal knowledge, and they often discover existing implementations late during review or after tests fail.
- **Trigger**: The moment they receive a task like add feature X, refactor module Y, fix bug Z, or find where the implementation of something lives.
- **Success state**: They can list available codebases, search semantically and structurally, open the most relevant chunks with provenance, and refresh the index by re-ingesting when needed, all without leaving local dev workflows.

**Job to Be Done**
When I'm about to change code in a repository, I want the assistant to reliably surface the most relevant existing implementations and constraints, so I can modify the right place without creating duplicates or architectural drift.

**Non-Users**
Teams that require a managed cloud service, cross-organisation indexing, or hosted analytics are not the target because the product is explicitly local-first and offline-capable.

---

## Solution Detail

### Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | MCP server exposing `list_codebases`, `search_codebases`, `get_codebase_stats`, `open_codebase_manager` | This is the assistant integration contract and primary value surface. |
| Must | Ingestion CLI that recursively ingests a directory into a named codebase | Without ingestion there is no data, and CLI enables workflow automation. |
| Must | Local persistence in ChromaDB for vectors and metadata | Required store for chunk vectors, provenance metadata, and similarity retrieval. |
| Must | Local embeddings using `@huggingface/transformers` with out of the box defaults | Required to satisfy local-only constraints without early tuning work. |
| Must | Language support for C#, Java (JDK22+), JavaScript/TypeScript, and Python | This is the minimum supported set and must be first-class. |
| Must | Unsupported language detection and explicit user notification | Prevents silent failures and improves trust in results. |
| Must | Fastify server hosting a one-page manager UI and local HTTP API | Keeps the stack single-runtime and provides an operational control surface. |
| Should | Admin operations for rename and delete of codebases and delete chunk sets | Makes the store operable and supports lifecycle management. |
| Won't | File watchers and incremental update flows | Explicitly deferred because the update model is re-ingestion. |

### MVP Scope

The MVP is a local-first pipeline that indexes a repository into ChromaDB with stable chunk IDs, file provenance, and embeddings; exposes MCP tools for listing, searching, and stats; and provides a Fastify-hosted one-page UI for the same operations. Language support is limited to C#, Java (JDK22+), JavaScript/TypeScript, and Python. Any other language is detected during ingest and shown to the user as unsupported, with those files excluded from embedding and chunk indexing.

### User Flow

A user runs the ingestion CLI to index a repository into a named codebase, then uses the manager UI to confirm file counts and chunk counts. They then use an MCP-capable assistant to call `list_codebases` and `search_codebases` to retrieve relevant chunks with file paths, symbol hints, and chunk ranges, and the user opens the right files in their editor. When code changes, the user re-runs ingestion for that codebase to refresh the index.

---

## Technical Approach

**Feasibility**: HIGH

**Architecture Notes**
- A single npm package provides three entry points: an MCP server binary, an ingestion CLI binary, and a Fastify server binary that hosts the one-page app and exposes a local HTTP API.
- The system stores chunk embeddings plus metadata in ChromaDB, where metadata includes codebase name, repo root, file path, language, symbol hints, file hash, modified time, chunk boundaries, and last indexed time.
- Chunking uses Tree-sitter parsing for the supported languages. For files detected as unsupported languages, ingestion records a clear warning and skips chunking and embedding.
- Embeddings are generated locally via `@huggingface/transformers` using out of the box defaults, with caching to avoid repeated compute across re-ingest runs.
- The Fastify API and MCP tools call into the same internal service layer so search behaviour, filters, ranking, and provenance formatting remain identical across surfaces.

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Embedding performance varies across developer workstations | M | Cache embeddings, batch ingestion, expose a single optional knob for model selection later, and document expected performance envelopes. |
| Tree-sitter grammar edge cases across the four supported languages | M | Pin grammar versions, add conformance fixtures per language, and fail safely with clear warnings when parsing fails. |
| Re-ingestion is slow for large codebases | M | Support filtering (path include/exclude), parallelise ingestion, and persist file hashes to skip unchanged files within a re-ingest run. |
| Index drift after renames, deletes, or large refactors | M | Detect deletes during re-ingest and reconcile by removing stale chunks for missing files. |
| ChromaDB schema evolution breaks older stores | M | Version metadata schema and introduce explicit migrations when changes are required. |

---

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Foundations | Repo setup, package boundaries, ChromaDB wiring, schema design | pending | - | - | - |
| 2 | Ingestion + Chunking | CLI ingest, Tree-sitter chunker for 4 languages, metadata model, embedding pipeline | pending | - | 1 | - |
| 3 | MCP Server Tools | Implement MCP server tools and retrieval contract | pending | with 4 | 2 | - |
| 4 | Fastify UI + API | Fastify server hosting UI and exposing HTTP endpoints for search, stats, ingest, admin | pending | with 3 | 2 | - |
| 5 | Operational Hardening | Re-ingest performance improvements, cache strategy, schema versioning, UX polish | pending | - | 3, 4 | - |

### Phase Details

**Phase 1: Foundations**
- **Goal**: Establish a runnable local stack with ChromaDB and a clear data model for codebases, files, chunks, embeddings, and provenance.
- **Scope**: TypeScript project scaffolding, ChromaDB start scripts, collection naming, schema versioning approach, internal service interfaces.
- **Success signal**: A developer can start the datastore locally and create and read a codebase record plus a sample chunk record end to end.

**Phase 2: Ingestion + Chunking**
- **Goal**: Convert a directory tree into stable, searchable chunks with correct provenance for the supported language set.
- **Scope**: Recursive crawl, ignore rules, language detection, Tree-sitter chunking for C#, Java, JS/TS, Python, unsupported language notification, embeddings via `@huggingface/transformers`, persistence into ChromaDB.
- **Success signal**: Indexing a repository produces deterministic counts and clearly reports unsupported files without silent loss.

**Phase 3: MCP Server Tools**
- **Goal**: Provide a stable tool surface for assistants.
- **Scope**: `list_codebases`, `search_codebases`, `get_codebase_stats`, `open_codebase_manager`, response formats with strong provenance and freshness signals.
- **Success signal**: An MCP client can call each tool and reliably reproduce search results that match the UI.

**Phase 4: Fastify UI + API**
- **Goal**: Make the datastore operable and inspectable by humans without adding a second runtime stack.
- **Scope**: One-page UI (Search, Stats, Ingest, Admin), Fastify routes that call the shared internal service layer, local-only binding posture.
- **Success signal**: A user can ingest a repo, search, inspect stats, and rename or delete a codebase safely.

**Phase 5: Operational Hardening**
- **Goal**: Make re-ingestion and retrieval predictable on real workstations and repositories.
- **Scope**: Performance tuning for re-ingest, caching and skip-unchanged logic, schema versioning and migrations, improved unsupported-language reporting, UX polish for the manager UI.
- **Success signal**: Re-ingesting a medium-sized repository is stable, repeatable, and produces consistent stats and search results.

### Parallelism Notes

Phases 3 and 4 can run in parallel once ingestion output and schema are stable because both MCP tools and the Fastify API should sit on the same internal service layer. This preserves consistency while allowing independent iteration on the assistant-facing contract and the human-facing UI.

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Deployment target | Developer workstation only | Hosted service, shared index | Aligns with privacy and offline constraints. |
| Datastore | ChromaDB local | Hosted vector DB, SQLite vector extensions | Matches requirement and keeps local-first operation. |
| Web server | Fastify | Flask sidecar, Express | Single runtime and clean API surface for UI and operations. |
| Minimum language support | C#, Java (JDK22+), JavaScript/TypeScript, Python | Broad language coverage | Focuses scope while covering the required minimum set. |
| Unsupported languages | Explicitly notify user and skip indexing | Best-effort parse, silent skip | Prevents false confidence and improves trust in the index. |
| Update model | Re-ingest only, no watcher | Incremental watcher-based indexing | Keeps MVP simple and deterministic. |
| Embeddings | `@huggingface/transformers` with out of the box defaults | Tuned models and profiles | Avoids early complexity and supports workstation-first adoption. |

---

## Research Summary

**Market Context**
Tool-based context surfaces like MCP are an increasingly common way to give assistants reliable, inspectable grounding, and codebase search is a high-leverage use case because it turns guessing into retrieval with provenance.

**Technical Context**
Incremental parsing and chunk stability matter because they make updates cheap and reduce index churn after small edits, even if the MVP defers watchers, because the same approach improves chunk quality and symbol-level relevance. ChromaDB provides a local vector store abstraction suited to storing chunk embeddings with metadata and performing similarity search, while `@huggingface/transformers` provides a path to local embeddings that keep proprietary code on the workstation.

---

*Generated: 2026-02-10 10:47 UTC*
*Status: DRAFT - needs validation*
