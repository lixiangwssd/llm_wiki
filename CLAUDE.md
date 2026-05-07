# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev          # Start Vite dev server (port 1420)
npm run build        # Type-check + Vite build
npm run typecheck    # TypeScript type checking only
npm run tauri dev    # Run Tauri desktop app in dev mode
npm run tauri build  # Build production Tauri app

# Tests
npm test             # Run all tests (mocks + real LLM)
npm run test:mocks   # Run unit tests only (excludes *.real-llm.test.ts)
npm run test:llm     # Run real-LLM integration tests only
```

## Architecture

LLM Wiki is a Tauri v2 desktop application that transforms documents into a self-maintaining knowledge base.

### Three-Layer Pattern (from Karpathy's design)
- **Raw Sources** (`raw/sources/`) — immutable uploaded documents
- **Wiki** (`wiki/`) — LLM-generated pages with `[[wikilink]]` cross-references and YAML frontmatter
- **Schema** (`purpose.md`, `schema.md`) — rules and intent defining the wiki

### Core Operations
1. **Ingest** — Two-step: LLM analyzes source → LLM generates wiki pages with source traceability
2. **Query** — Tokenized search + graph relevance expansion + optional vector semantic search
3. **Lint** — Health checks on wiki structure and cross-references

### Project Structure

```
src/
├── App.tsx                    # Main app shell with sidebar navigation
├── lib/                       # Core business logic (all TypeScript)
│   ├── ingest.ts              # Two-step ingest pipeline (~67KB, largest file)
│   ├── search.ts              # Multi-phase retrieval pipeline
│   ├── llm-providers.ts       # Multi-provider LLM support (OpenAI/Anthropic/Google/Ollama)
│   ├── llm-client.ts         # Streaming fetch client for LLMs
│   ├── embedding.ts          # Vector embedding via LanceDB
│   ├── text-chunker.ts       # Content splitting for context budget
│   ├── context-budget.ts     # Token budget allocation across wiki/history/index/system
│   ├── wiki-graph.ts         # graphology-based graph construction
│   ├── graph-relevance.ts    # 4-signal relevance model (direct/sources/Adamic-Adar/type)
│   ├── graph-insights.ts     # Louvain community detection + surprise/gap analysis
│   ├── ingest-queue.ts       # Persistent serial queue with crash recovery
│   ├── deep-research.ts      # Web search → wiki synthesis pipeline
│   └── dedup*.ts             # Deduplication logic
├── stores/                    # Zustand state management
│   ├── wiki-store.ts         # Wiki content, graph data, search results
│   ├── chat-store.ts         # Multi-conversation chat with cited references
│   ├── activity-store.ts     # Ingest queue progress visualization
│   ├── review-store.ts       # Async human-in-the-loop review items
│   └── research-store.ts     # Deep research task state
├── components/                # React UI components (shadcn/ui + Tailwind CSS)
└── i18n/                     # react-i18next translations

src-tauri/                    # Rust backend
├── src/
│   ├── clip_server.rs        # Local HTTP server for Chrome extension
│   ├── lib.rs                # Tauri commands (file ops, LLM calls, web search)
│   └── proxy.rs              # HTTP proxy configuration
└── tauri.conf.json           # Tauri app config
```

### Key Data Flow

**Ingest Pipeline** (`ingest.ts`):
1. SHA256 cache check — unchanged files skipped
2. File parsing (PDF via Rust `pdf-extract`, DOCX, PPTX, XLSX, images)
3. Step 1: LLM analyzes → structured analysis with entity/concept detection
4. Step 2: LLM generates wiki pages from analysis
5. Overview update, index.md rebuild, review items created

**Query Pipeline** (`search.ts`):
1. Tokenized search (English word split / Chinese CJK bigram)
2. Optional vector search via LanceDB embeddings
3. Graph expansion (4-signal relevance, 2-hop decay)
4. Context budget assembly (60% wiki / 20% chat / 5% index / 15% system)

**Knowledge Graph** (`wiki-graph.ts` → `graph-relevance.ts` → `graph-insights.ts`):
- graphology graph from `[[wikilinks]]` and frontmatter `sources[]`
- Louvain community detection via `graphology-communities-louvain`
- ForceAtlas2 layout via `graphology-layout-forceatlas2`

### Multi-Provider LLM Support

Providers configured in `llm-providers.ts`: OpenAI, Anthropic, Google, Ollama, Custom. Each provider has specific streaming behavior and header handling via `llm-client.ts`.

### State Persistence

Zustand stores persist via Tauri Store plugin. Chat histories saved to `.llm-wiki/chats/{id}.json`. Review items, activity state, and project config all persisted to disk.

### Important Conventions

- Path normalization via `path-utils.ts` — all paths normalized to forward slashes across 22+ files
- Unicode-safe string handling for CJK filenames
- `dataVersion` signaling triggers graph/UI refresh when wiki content changes
- Tests use `fast-check` for property-based testing; real LLM tests require `.env.test.local` with API keys
