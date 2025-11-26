# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Package Manager**: This project uses Bun as its package manager and runtime.

```bash
# Install dependencies
bun install

# Development server (runs on port 3000)
bun --bun run dev

# Production build
bun --bun run build

# Preview production build
bun serve

# Testing
bun --bun run test

# Linting and formatting (using Biome)
bun --bun run lint      # Lint code
bun --bun run format    # Format code
bun --bun run check     # Both lint and format
```

## Architecture Overview

This is a **TanStack Start** application - a full-stack React framework built on top of TanStack Router. Key architectural components:

### Routing System
- **File-based routing**: Routes are defined as files in `src/routes/`
- Each route file exports a `Route` created via `createFileRoute()`
- Route files auto-generate TypeScript types in `src/routeTree.gen.ts` (do not edit manually)
- The root layout is in `src/routes/__root.tsx` with a `shellComponent` that renders the HTML document structure

### Server Functions
Server functions enable type-safe RPC-style calls from client to server:
- Created using `createServerFn({ method: 'GET' | 'POST' })` from `@tanstack/react-start`
- Can import Node.js modules (like `fs`) directly - these only run on the server
- Input validation via `.inputValidator()`, execution logic via `.handler()`
- Called from components like regular async functions
- Example: `src/routes/demo/start.server-funcs.tsx`

### API Routes
For REST-style endpoints, use the `server.handlers` pattern:
```tsx
export const Route = createFileRoute('/path')({
  server: {
    handlers: {
      GET: () => json(data),
      POST: ({ request }) => { /* handle POST */ }
    }
  }
})
```
Example: `src/routes/demo/api.names.ts`

### Data Loading
Routes can preload data using the `loader` function:
```tsx
export const Route = createFileRoute('/path')({
  loader: async () => { return data },
  component: Component
})
```
Access loaded data in components via `Route.useLoaderData()`

### Styling
- **Tailwind CSS v4** with Vite plugin
- **Shadcn UI** components (New York style variant)
- Path aliases configured: `@/*` maps to `src/*`
- Component paths: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`
- Global styles in `src/styles.css`

### Adding Shadcn Components
```bash
bunx shadcn@latest add button
```

### TypeScript Configuration
- Path aliases via `vite-tsconfig-paths` plugin
- Strict mode enabled with additional checks
- `@/*` paths resolve to `src/*`

### Code Style
- **Biome** for linting and formatting (not ESLint/Prettier)
- Tab indentation
- Double quotes for JavaScript/TypeScript
- Biome ignores `src/routeTree.gen.ts` and `src/styles.css`

## Demo Files
Files prefixed with `demo` (in `src/routes/demo/` and `src/data/demo.*`) are examples and can be safely deleted when starting your own implementation.
