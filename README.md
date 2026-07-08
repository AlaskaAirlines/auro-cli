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

`auro component <name>`
Looks up a single Auro component's API — attributes, properties/methods, slots, events, and CSS parts — from its published Custom Elements Manifest. Useful for humans and for AI coding assistants that call the CLI in a tool-use loop to avoid guessing an API.

#### Options

- `-t, --tag <version>` npm dist-tag or version to look up (default: `latest`).
- `--json` Output the raw manifest declaration(s) as JSON instead of formatted text.

#### Examples

Look up a component (name is normalized, so all of these work):

```
auro component button
auro component auro-button
auro component @aurodesignsystem/auro-button
```

Look up a specific version or dist-tag:

```
auro component auro-button --tag beta
auro component auro-button --tag 11.0.0
```

Get machine-readable output:

```
auro component auro-button --json
```
