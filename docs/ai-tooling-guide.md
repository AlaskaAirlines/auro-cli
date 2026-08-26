# AI Tooling Guide

This guide explains how to use the Auro CLI's AI-readiness tooling when building
with Auro FormKit components. These tools give AI coding assistants (Claude,
Cursor, Copilot, and others) an accurate, authoritative picture of the Auro
component API so they generate working markup instead of guessing.

## Why these tools exist

When you ask an AI assistant to "build a form with Auro," the assistant often
has no grounding in Auro's real API. It hallucinates component names, invents
attributes, or falls back to plain HTML. These commands close that gap by
feeding the assistant Auro's actual, published component definitions.

There are three CLI commands plus one web-discoverability file:

| Tool | What it gives you | When to use it |
| --- | --- | --- |
| `auro context` | A high-level primer: component list, package names, usage patterns, coding rules | Once, at the start of a session, to orient the assistant |
| `auro cem` | A single aggregated Custom Elements Manifest for every published component | When a tool or the assistant needs the full API index |
| `auro component <name>` | The API for one component: attributes, slots, events, CSS parts, install snippet | On demand, while writing code for a specific component |
| `llms.txt` (docs site) | A discoverability index of the docs site for web-based AI tools | Automatic — no action needed |

## Prerequisites

Install the Auro CLI (globally, or run it with `npx`):

```bash
npm install -g @aurodesignsystem/auro-cli
# or
npx @aurodesignsystem/auro-cli <command>
```

All commands read from data Auro already publishes to npm/unpkg, so no extra
setup or authentication is required. A network connection is needed for the
commands that fetch manifests.

## `auro context` — prime your AI assistant

Run this first. It prints an AI-ready document describing the Auro Design
System: what components exist, their package names, common usage patterns, and
coding rules.

```bash
# Print to your terminal
auro context

# Write to a file you can attach or paste into an AI tool
auro context --output AURO_CONTEXT.md

# Skip the network and use the built-in component table
auro context --offline
```

Component descriptions come from each component's Custom Elements Manifest:
installed components are read from your project's `node_modules` (matching the
version you have), and the rest are fetched from unpkg, falling back to a
curated built-in list so no component is ever dropped. Any installed component
that isn't on the latest published release is flagged on stderr after the
document is generated. Use `--offline` to enrich only from installed manifests
and skip the network entirely.

**Typical workflow**

1. Generate the context file:
   ```bash
   auro context --output AURO_CONTEXT.md
   ```
2. Attach `AURO_CONTEXT.md` to your AI chat, or add it to your project (for
   example as a rules/context file your assistant reads automatically).
3. Now when you ask the assistant to build with Auro, it knows the real
   component names and conventions instead of guessing.

## `auro component <name>` — look up one component's API

The command you'll reach for most often while coding. It fetches a single
component's published Custom Elements Manifest and prints its API — attributes,
slots, events, CSS parts — plus an install snippet.

```bash
# All of these resolve to the same component (the name is normalized)
auro component button
auro component auro-button
auro component @aurodesignsystem/auro-button

# Emit raw declarations for tooling or an AI tool-use loop
auro component auro-button --json
```

**For humans:** run it at the shell when you can't remember an attribute name
or want to confirm which slots a component exposes.

**For AI assistants:** the `--json` output is designed to be called inside a
tool-use loop. An assistant can invoke `auro component auro-input --json`
mid-task, read the exact attributes back, and write correct markup on the first
try.

## `auro cem` — build the full aggregated manifest

Where `auro component` describes one component, `auro cem` merges every
published component's manifest into a single aggregated Custom Elements
Manifest — one machine-readable index of the entire system's API.

```bash
# Write custom-elements.aggregate.json to the current directory
auro cem

# Write to a specific path (for example, for a docs site or tool to consume)
auro cem --output dist/custom-elements.aggregate.json
```

Use this when a tool (an IDE integration, a documentation generator, or an AI
assistant) needs the whole API surface at once rather than looking up
components one at a time. Each module's path is namespaced by its package (for
example `@aurodesignsystem/auro-button/src/auro-button.js`), so every
declaration is traceable back to its source component.

## `llms.txt` — web discoverability

The Auro docs site publishes a `public/llms.txt` file following the
[llms.txt specification](https://llmstxt.org/). This helps web-based AI tools
(Claude, Cursor, Perplexity, Copilot) discover and understand what the docs
site contains.

You don't run anything for this one — it works automatically for assistants
that read from the web. It complements the CLI commands: `llms.txt` guides
tools that work from web context, while the CLI commands serve tools and
developers working from the shell.

## Putting it together

A common end-to-end flow when building a form with an AI assistant:

1. **Prime once** — `auro context --output AURO_CONTEXT.md` and attach it to
   your session so the assistant knows Auro exists and how it's structured.
2. **Look up as you go** — the assistant (or you) runs
   `auro component auro-input --json`, `auro component auro-form --json`, etc.,
   to get exact attributes and slots while writing code.
3. **Or index everything** — for tooling that wants the full API up front, run
   `auro cem --output custom-elements.aggregate.json` and point the tool at it.

The result: markup that uses real Auro attributes and slots, with far fewer
broken components from hallucinated APIs.

## A note on coverage

The `auro cem` and `auro component` commands only return data for components
that publish a `custom-elements.json` manifest. Coverage grows as more
components adopt the manifest, so a component that returns nothing today may
simply not publish a CEM yet — this is expected and handled gracefully (unknown
or manifest-less components are skipped with a clear message rather than
failing).
