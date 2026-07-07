# Auro CLI

Auro CLI is a command-line interface designed to help consumers of the Auro Design System and the developers maintaining it.

## `Dev` Command Features

- **Start Development Server**: Quickly launch a web development server with default or custom configurations.
- **Customizable Options**: Specify the port and the directory to open when the server starts.
- **Hot Module Replacement**: Integrates with HMR (Hot Module Replacement) for a better development experience.
- **Graceful Error Handling**: Handles invalid inputs and missing options gracefully.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Commands](#commands)
- [Options](#options)
- [Examples](#examples)

## Installation

To install Auro CLI, clone the repository and install the dependencies:

```bash
npm install @aurodesignsystem/auro-cli
```

## Usage

To use Auro CLI, run the following command in your terminal:

```bash
auro dev
```

This will start the development server with default options.

## Commands

`auro dev`
Runs the web development server.

#### Options

- `-o, --open <type>` Open the server to a specific directory (default: demo/).
- `-p, --port <type>` Change the server port (default: undefined).

#### Examples

Start the server on a specific port:

```
auro dev --port 8000
```

Open the server to a specific directory:

```
auro dev --open src/
```

`auro context`
Prints an AI-ready context document describing the Auro Design System, its components, and usage patterns. Designed to be piped into or pasted into AI coding assistants (Claude, Cursor, Copilot, etc.) to prime them on Auro.

#### Options

- `-o, --output <file>` Write the context document to a file instead of stdout (e.g. `AURO_CONTEXT.md`).

#### Examples

Print the context to the terminal:

```
auro context
```

Write the context to a file for your AI tool:

```
auro context --output AURO_CONTEXT.md
```
