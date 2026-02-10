# Project Structure

## Root Directory

```
.
├── .kiro/              # Kiro configuration and steering files
│   ├── hooks/          # Agent hooks for automation
│   ├── settings/       # Kiro settings including MCP config
│   ├── specs/          # Feature specifications
│   └── steering/       # Project guidance documents
├── src/                # Source code
│   ├── bin/            # Executable entry points (mcp-server, ingest, manager)
│   ├── domains/        # Domain-specific business logic
│   ├── infrastructure/ # External integrations (ChromaDB, MCP, Fastify)
│   ├── shared/         # Shared utilities (config, logging, types)
│   └── ui/             # Web UI components
├── dist/               # Compiled TypeScript output (gitignored)
├── .gitignore          # Git ignore patterns
├── .eslintrc.json      # ESLint configuration
├── .env.example        # Example environment variables
├── package.json        # npm package configuration
├── tsconfig.json       # TypeScript configuration
├── vitest.config.ts    # Vitest test configuration
└── README.md           # Project documentation
```

## Source Organization

The `src/` directory follows a domain-driven design pattern:

### Entry Points (`src/bin/`)
- `mcp-server.ts` - MCP server executable
- `ingest.ts` - Ingestion CLI executable
- `manager.ts` - Manager UI server executable

### Domains (`src/domains/`)
Each domain contains:
- Service implementation
- Domain models/types
- `__tests__/` directory with unit and property tests

Planned domains:
- `codebase/` - Codebase CRUD operations
- `search/` - Semantic search functionality
- `ingestion/` - File scanning and indexing
- `embedding/` - Embedding generation
- `parsing/` - Tree-sitter code parsing

### Infrastructure (`src/infrastructure/`)
External system integrations:
- `chromadb/` - ChromaDB client wrapper
- `mcp/` - MCP server implementation
- `fastify/` - Fastify server and routes

### Shared (`src/shared/`)
Cross-cutting concerns:
- `config/` - Configuration management
- `logging/` - Structured logging with Pino
- `types/` - Shared TypeScript types

### UI (`src/ui/`)
Web interface components:
- `manager/` - Single-page management UI

## Configuration Files

- `.gitignore` - Git ignore patterns (node_modules, dist, local data)
- `package.json` - npm package manifest with name `@teknologika/mcp-codebase-search`
- `tsconfig.json` - TypeScript compiler configuration for Node.js 23+
- `.eslintrc.json` - ESLint rules for code quality
- `vitest.config.ts` - Test runner configuration with coverage thresholds
- `.env.example` - Example environment variables

## Conventions

### File Naming
- Source files: `kebab-case.ts` (e.g., `codebase.service.ts`)
- Test files: `*.test.ts` for unit tests, `*.properties.test.ts` for property-based tests
- Type files: `types.ts` or `index.ts` for exports

### Code Organization
- One class/service per file
- Co-locate tests with source in `__tests__/` subdirectories
- Export public APIs through `index.ts` barrel files
- Use dependency injection for testability

### Testing
- Minimum 80% code coverage
- Both unit tests and property-based tests required
- Property tests use `fast-check` with minimum 100 iterations
- Test files reference design document properties

## Key Directories

- `src/bin/` - Executable entry points for the three commands
- `src/domains/` - Core business logic organized by domain
- `src/infrastructure/` - External system integrations
- `src/shared/` - Shared utilities and cross-cutting concerns
- `src/ui/` - Web interface components
- `dist/` - Compiled JavaScript output (created by `npm run build`)
- `.codebase-memory/` - Local data storage (gitignored, created at runtime)
