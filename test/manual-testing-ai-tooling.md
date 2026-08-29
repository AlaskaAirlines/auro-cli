# Manual Testing — Auro AI Tooling

Manual test plan for the **Auro AI Tooling** effort — the work that makes the
Auro Design System discoverable and usable by AI coding assistants. The effort is
delivered in phases (standalone grounding first, richer integrations such as MCP
later), each broken into milestones. This document grows one phase and milestone
at a time; every phase gets its own top-level section below.

**Currently covered:** [Phase 1 — Standalone Grounding (no MCP)](#phase-1--standalone-grounding-no-mcp-ab1628539)
(AB#1628539) — [PT-M0 — Land Tier 1 CLI primitives](#ab1628540--pt-m0-land-tier-1-cli-primitives)
(AB#1628540), [PT-M1 — `auro init` v1 (scoped grounding file)](#ab1628541--pt-m1-auro-init-v1-scoped-grounding-file)
(AB#1628541), and [PT-M2 — Editor IntelliSense generation](#ab1628542--pt-m2-editor-intellisense-generation-html-custom-data--framework-types)
(AB#1628542). Sections for PT-M3…M4 and later phases will be added as that work
lands.

---

## Phase 1 — Standalone Grounding (no MCP) (AB#1628539)

Delivers AI grounding through the CLI alone — no server or MCP. Tracked by the
[Phase 1 — Auro AI Tooling: Standalone Grounding (no MCP)](https://itsals.visualstudio.com/E_Retain_Content/_workitems/edit/1628539)
user story, delivered in milestones (PT-M0…M4).

### How to run the CLI under test

All M0 tests below are run against a **locally packed and installed** copy of the
CLI, not the bundled `dist/` directly. Installing from a local tarball exercises
the exact same code path a published release does — the `build`, the `files`
allow-list, the `bin` mapping, and the globally linked `auro` command — so a
green run here is strong evidence the published release (§ M0-6) will behave
identically, with zero setup for the end user.

#### Step 1 — Build

```bash
npm ci          # first time only (clean, lockfile-exact install)
npm run build   # produces dist/auro-cli.js
```

#### Step 2 — Pack a local tarball

`npm pack` produces the *same* tarball that would be published to npm, honoring
the `files` allow-list and `bin` entries in [package.json](../package.json).

```bash
npm pack        # writes aurodesignsystem-auro-cli-<version>.tgz to the cwd
```

- **Expect:** a `.tgz` file is created and its printed contents include
  `dist/auro-cli.js`, `README.md`, `LICENSE`, and `NOTICE` (the `files` list).
  Confirm nothing from `src/` or dev-only files leaked in.
- Optionally inspect without extracting: `tar -tzf aurodesignsystem-auro-cli-*.tgz`.

#### Step 3 — Install the local package globally

Installing the tarball globally links the `auro` (and `auro-cli`) bin onto your
`PATH`, exactly as `npm i -g @aurodesignsystem/auro-cli` would after release.

```bash
npm install -g ./aurodesignsystem-auro-cli-*.tgz
```

**Verify the command resolves to the local install:**

```bash
which auro            # -> a path under your global npm prefix
auro --version        # matches package.json "version"
auro --help           # lists context, component, cem, ... subcommands
```

> **Node version note:** the global bin runs under whatever `node` is on your
> `PATH`. Ensure it satisfies `engines.node >= 18` (`node -v`). If you use a
> version manager (nvm/asdf), the `auro` shim uses the node active in the shell
> where you run it.

<details>
<summary>Alternative: run without a global install</summary>

If you prefer not to install globally, either of these run the same local build:

- **`npm link`** (from the repo root): `npm link` then run `auro <command>`.
  Uses a symlink to the working tree rather than a packed tarball, so it does
  **not** validate the `files` allow-list — prefer `npm pack` + global install
  for the M0 pass.
- **Isolated project install:** in a scratch dir,
  `npm init -y && npm install /abs/path/to/aurodesignsystem-auro-cli-*.tgz`,
  then run `npx auro <command>` from that dir.

</details>

#### Step 4 — Run the tests

> Throughout this doc, `auro <command>` means the globally installed local
> package from Step 3. Most tests need a network connection because the commands
> fetch live manifests from unpkg.

#### Step 5 — Teardown (after the run)

```bash
npm uninstall -g @aurodesignsystem/auro-cli   # remove the global link
rm aurodesignsystem-auro-cli-*.tgz            # delete the local tarball
# if you used npm link instead: npm unlink -g @aurodesignsystem/auro-cli
```

Confirm removal: `which auro` should no longer resolve (or should point away
from the test install).

**Environment to record for each test run:**

- CLI commit SHA (`git rev-parse --short HEAD`)
- Packed version (`auro --version`) and tarball filename
- Node version (`node -v`) — must satisfy `engines.node >= 18`
- OS / shell
- Network state (online / offline / throttled) where relevant

---

### AB#1628540 — PT-M0: Land Tier 1 CLI primitives

Milestone goal: an engineer can prime an AI assistant and look up any published
Auro component's API from the terminal with **zero setup**. The four surfaces
below plus graceful no-CEM handling and a verified release constitute "done."

Reference: [docs/ai-tooling-guide.md](../docs/ai-tooling-guide.md),
[docs/pt-m0-completion-plan.md](../docs/pt-m0-completion-plan.md).

#### Components under test

Testing both the happy path and graceful no-CEM handling requires one component
that **publishes** a Custom Elements Manifest and one that does **not**. These
two are used consistently throughout the M0 tests below:

| Role | Package | `custom-elements.json` | Why chosen |
| --- | --- | --- | --- |
| **Has a CEM** | `@aurodesignsystem/auro-button` | `200` — registers `auro-button` | Stable, single registered element; canonical example in the guide |
| **No CEM** | `@aurodesignsystem/auro-icon` | `404` (package itself resolves `200`) | A real, shipping component that simply hasn't adopted a CEM — proves *manifest-less skip*, not *unknown package* |

> **Verify current status before running.** CEM coverage grows as components
> adopt manifests, so re-confirm both roles at the start of a test pass:
>
> ```bash
> for c in auro-button auro-icon; do
>   echo "$(curl -sL -o /dev/null -w '%{http_code}' \
>     https://unpkg.com/@aurodesignsystem/$c/custom-elements.json)  $c"
> done
> # expect: 200  auro-button   and   404  auro-icon
> ```
>
> If `auro-icon` starts returning `200`, pick another `404` package from
> [src/static/auroComponents.ts](../src/static/auroComponents.ts) and swap it in
> below. As of the last check, other no-CEM candidates include `auro-alert`,
> `auro-header`, `auro-toast`, and `auro-tokenlist`.

#### Local resolution fixture project

`auro component` and `auro context` resolve manifests **local-first**: they read
`./node_modules` before falling back to unpkg. To exercise that path (and the
outdated-release check) you need a throwaway project with an Auro component
installed — deliberately an **older** version so the staleness check has
something to report.

```bash
mkdir -p /tmp/auro-fixture && cd /tmp/auro-fixture
npm init -y
# Install a CEM-publishing component pinned BEHIND its latest release so the
# outdated check fires. Use 12.3.0 — the FIRST auro-button release to ship a
# custom-elements.json; any earlier build has no CEM and won't exercise this path.
npm install @aurodesignsystem/auro-button@12.3.0
# Confirm the local manifest + version the CLI will read:
cat node_modules/@aurodesignsystem/auro-button/package.json | jq '{version, customElements}'
ls node_modules/@aurodesignsystem/auro-button/custom-elements.json
```

- Use **12.3.0** specifically: it is the first `@aurodesignsystem/auro-button`
  release to include a `custom-elements.json`, so earlier versions have no CEM and
  can't exercise the local-manifest path. Confirm it is still behind the latest
  release (`npm view @aurodesignsystem/auro-button version`) so the outdated check
  fires; if 12.3.0 ever becomes latest, pick any newer non-latest version that
  ships a CEM instead.
- Run the local/online tests (M0-1.3, M0-1.4, M0-2.2a) from **inside**
  `/tmp/auro-fixture`. Tests that only cover the unpkg fallback can run from any
  empty dir.
- Teardown: `rm -rf /tmp/auro-fixture`.

#### Test matrix overview

| ID | Surface | What it proves |
| --- | --- | --- |
| M0-1 | `auro context` | AI-priming document generates to stdout and to a file |
| M0-2 | `auro component <name>` | Single-component API lookup, name normalization, `--json`, `--tag` |
| M0-3 | `auro cem` | Aggregated manifest builds and merges correctly |
| M0-4 | `llms.txt` | Docs-site discoverability file is present and valid |
| M0-5 | Graceful no-CEM skip | Manifest-less / unknown packages skip, not crash |
| M0-6 | Release installable | Published CLI runs via `npx` with zero setup |

---

#### Automated coverage & manual scope

Most of the matrix above is now locked down by the automated suite (run
`npm test`). Those tests mock `fetch` and use on-disk `node_modules` fixtures,
so they authoritatively cover **logic, exact messaging, exit codes, stdout vs.
stderr separation, manifest namespacing, version comparison, and
path-traversal safety** — deterministically and offline. Re-running those cases
by hand adds nothing; cite the test in sign-off instead of repeating it.

**Regression-covered by `npm test` — do not test manually:**

| Area | Test file |
| --- | --- |
| Name normalization, whitespace/case, `deprecatedTag`, `renderList`, `formatDeclaration` sections | [`formatComponent.test.ts`](formatComponent.test.ts) |
| Local-first resolution, custom `customElements` path, `..`/traversal safety, unpkg fallback, explicit-version→unpkg, `preferLocal:false`, `fetchLatestVersion` | [`fetchManifest.local.test.ts`](fetchManifest.local.test.ts) |
| 404-vs-transient classification & messages (timeout, network error, 5xx, unparseable), `partitionOutcomes` | [`fetchManifest.test.ts`](fetchManifest.test.ts) |
| `auro cem` success, no-manifest total failure, transient-makes-incomplete exit codes | [`cem.command.test.ts`](cem.command.test.ts) |
| Aggregate namespacing (local refs vs. external), mixed-schema warning, default version | [`mergeManifests.test.ts`](mergeManifests.test.ts) |
| Outdated detection incl. prerelease edges, `compareVersions`, banner text | [`outdated.test.ts`](outdated.test.ts) |
| `auro context` → stdout, `--output` → file, `--offline` never fetches, local-outdated warns on stderr, **write-failure exit 1** | [`context.command.test.ts`](context.command.test.ts) |
| `auro component` → stdout, `--json`, 404 exit 1, transient exit 1, no-elements exit 1, local-outdated warns on stderr | [`component.command.test.ts`](component.command.test.ts) |
| `renderComponentRows`, pipe-escaping, `buildAuroContext` structure, `clean` helper | [`auroContext.test.ts`](auroContext.test.ts), [`clean.test.ts`](clean.test.ts) |

**Manual scope — what automation structurally cannot cover.** A manual pass
only needs the following; everything else is regression-covered above:

1. **Packaging & distribution** — the [run-under-test harness](#how-to-run-the-cli-under-test)
   (`npm pack` → `files` allow-list → `bin` → global install / `npx` →
   `--version`/`--help` → Node `engines`) and **M0-6**. Unit tests run against
   source, never the packed tarball, so this is the only check of the published
   artifact.
2. **M0-4 `llms.txt`** — lives in the docs site, not this repo.
3. **One live-network smoke run** per command from the fixture project — confirms
   the real unpkg/registry shapes still match what the tests mock (real
   `auro-button` CEM, real `auro-icon` 404, real "latest" for the outdated
   banner). Run the [status probe](#components-under-test) first.
4. **TTY/visual rendering** — the outdated banner's colors/bold on a real TTY
   (and that they drop when redirected), plus spinner UX. Tests assert content
   and stream, not ANSI/TTY output.

**Marginal — rely on the unit test unless verifying real sockets:** the M0-2.5
stalled-connection 10s timeout (`nc`/blackhole + `/etc/hosts`) and the M0-3.4
mid-run transient mix. The logic is unit-tested; the elaborate repro only adds
value if you specifically want to confirm the real `AbortSignal` against a live
silent socket. Individual cases below are annotated **[Regression-covered]**,
**[Manual]**, or **[Marginal]** accordingly.

---

#### M0-1 — `auro context`

Primes an AI assistant with a high-level Auro overview. The Component Reference
table always starts from the curated component set and enriches each row's
description from a Custom Elements Manifest: **local-first** (read from the
current directory's `node_modules`, matching the installed version) with **unpkg**
as the network fallback, and the curated built-in text as the final fallback so
no component is ever dropped. After the document is generated, any installed
component not on its latest published release is reported to **stderr**.

> **Working directory matters.** Local enrichment reads `./node_modules`, so run
> the online-vs-local tests from the [fixture project](#local-resolution-fixture-project),
> not the CLI repo root (which does not install Auro components). Tests that only
> exercise the unpkg fallback can run from any empty dir.

##### M0-1.1 Print to stdout (online, no local installs) — [Regression-covered]

1. From an empty dir (no Auro components in `./node_modules`), run: `auro context`
2. **Expect:**
   - Spinner reports `Resolving component manifests...`
   - On success, spinner shows `Enriched N component description(s) from unpkg.`
     — with nothing installed, all `N` enriched rows come from unpkg (the
     message omits the local-package count rather than reporting `0`).
   - A full Markdown document is written to stdout (component list, package
     names, usage patterns, coding rules, and a Component Reference table).
   - Because nothing is installed, **no** outdated-release check runs (the
     `Checking for newer component releases...` spinner does not appear).
   - Exit code `0` (`echo $?`).

##### M0-1.2 Write to a file — [Regression-covered]

1. Run: `auro context --output AURO_CONTEXT.md`
2. **Expect:**
   - Spinner succeeds with `Auro context written to AURO_CONTEXT.md`.
   - Follow-up line instructing to paste the file into an AI tool.
   - `AURO_CONTEXT.md` exists in the working dir and is non-empty valid Markdown.
   - Exit code `0`.
3. Also verify `-o` short flag: `auro context -o /tmp/auro-context.md`.

##### M0-1.3 Local enrichment + outdated-release check — [Regression-covered; banner colors/TTY → Manual]

Run from the [fixture project](#local-resolution-fixture-project) (has ≥1 Auro
component installed, at least one intentionally behind its latest release).

1. Run: `auro context --output /tmp/ctx-local.md`
2. **Expect:**
   - Spinner succeeds with
     `Enriched N component description(s); M package(s) resolved from local node_modules.`
     where `M` equals the number of Auro packages installed in the fixture and
     `N` (component descriptions) may be larger when a package exports several.
   - **After** the document is written, a second spinner runs
     `Checking for newer component releases...` and then, if anything is behind,
     prints a bordered, bold banner to **stderr** — not a flat list:

     ```text
     ┌────────────────────────────────────────────────────┐
     ⚠  K Auro component(s) are NOT on the latest release
     └────────────────────────────────────────────────────┘
       @aurodesignsystem/auro-button  12.3.0 → <latest>

       Update all with:
       npm install @aurodesignsystem/auro-button@latest
     ```

     - The heading reads `⚠  K Auro component(s) are NOT on the latest release`;
       each row is `<pkg>  <installed> → <latest>` (aligned), followed by an
       `Update all with:` / `npm install <pkg>@latest …` command.
     - Colors/bold are applied when stderr is a TTY and drop automatically when
       redirected to a file (the border + heading keep it prominent regardless).
   - The generated document on stdout/`ctx-local.md` contains **no** outdated
     warning (stdout stays clean). Verify with:
     `auro context 1>/tmp/out.md 2>/tmp/err.txt` — the banner is in `err.txt`.
   - If all installs are current, the check instead succeeds with
     `All installed Auro components are on the latest release.` (no banner).
   - Exit code `0`.

##### M0-1.4 Offline mode (`--offline`) — [Regression-covered]

1. From the fixture project, run: `auro context --offline`
2. **Expect:**
   - Spinner reports `Reading installed component manifests...`
   - Success line is the offline variant, keyed off manifests **found** in
     `node_modules` (not descriptions enriched):
     `Read M installed component manifest(s) from local node_modules; enriched N description(s).`
     - **Note:** `auro-button@12.3.0` ships a CEM whose element carries **no**
       description, so with only that component installed the line reads
       `Read 1 installed component manifest(s) from local node_modules; none documented a description, using the built-in table.`
       (still a **success** — the manifest was found; the curated built-in text
       is used for the description). To see a non-zero `enriched N`, install a
       component whose CEM documents a description.
   - If no Auro components are installed at all, warns instead:
     `No installed component manifests found; using the built-in component table.`
   - **No** network is used: the `Checking for newer component releases...`
     outdated check is skipped entirely.
   - Document still written to stdout; exit code `0`.
3. Sanity-check true offline: disable the network and re-run `auro context
   --offline` — behavior is unchanged (no hangs, no transient errors).

##### M0-1.5 File write failure — [Regression-covered]

> **Regression-covered — skip manually.** `test/context.command.test.ts`
> ("exits 1 with a write-failure message when the output path is unwritable")
> drives an unwritable `--output` path and asserts the `Failed to write context`
> message plus exit code `1`. Run via `npm test`.

1. Run with an unwritable output path, e.g.
   `auro context --output /nonexistent-dir/ctx.md`
2. **Expect:**
   - Spinner fails with `Failed to write context: <message>`.
   - Exit code `1`.

---

#### M0-2 — `auro component <name>`

Looks up a single component's API from its Custom Elements Manifest. Resolution
is **local-first**: if the component is installed in the current directory's
`node_modules` (and no explicit `--tag`/version is given), its manifest is read
locally and the success line shows `(local vX.Y.Z)`; otherwise it is fetched
from unpkg and shows `(unpkg)`.

> **Outdated-install warning.** When the manifest is read from a **local**
> install, `auro component` also checks whether that install is behind its latest
> published release and, if so, prints the same bordered banner as `auro context`
> (see M0-1.3) to **stderr**. This only fires for a local read — an explicit
> `--tag`/version forces an unpkg fetch, and unpkg already serves latest, so
> neither path warns.

##### M0-2.1 Basic lookup + name normalization (unpkg) — [Regression-covered; live unpkg → Manual smoke]

Run from a dir with **no** Auro components installed so resolution goes to unpkg.
All three must resolve to the same component:

```bash
auro component button
auro component auro-button
auro component @aurodesignsystem/auro-button
```

**Expect (each):**
- Spinner succeeds:
  `@aurodesignsystem/auro-button — N custom element(s) (unpkg)`.
- Human-readable output includes, per element: tag name + package, description,
  `Class:` line, an `Install:` block (`npm i …` / `import "…"`), and
  `Attributes`, `Properties & Methods`, `Slots`, `Events` sections (with
  `CSS Parts` / `CSS Custom Properties` only when present).
- Trailing `Full docs: https://auro.alaskaair.com` line.
- Exit code `0`.
- Also confirm whitespace/case tolerance: `auro component "  Button  "` works.

##### M0-2.2a Local-first resolution — [Regression-covered]

Run from the [fixture project](#local-resolution-fixture-project) with
`@aurodesignsystem/auro-button` installed.

1. Run: `auro component auro-button`
2. **Expect:**
   - Success line shows the local origin and version:
     `@aurodesignsystem/auro-button — N custom element(s) (local vX.Y.Z)`, where
     `X.Y.Z` matches the version installed in the fixture's `node_modules`
     (`cat node_modules/@aurodesignsystem/auro-button/package.json | jq .version`).
   - The API shown reflects the **installed** version, not necessarily latest.
   - Exit code `0`.
3. Contrast: run the same command from an empty dir → origin is `(unpkg)`.

##### M0-2.2b Outdated local install warning — [Regression-covered; banner colors/TTY → Manual]

Run from the [fixture project](#local-resolution-fixture-project), which pins
`@aurodesignsystem/auro-button@12.3.0` (deliberately behind its latest release).

1. Run: `auro component auro-button`
2. **Expect:**
   - The success line shows the local origin (`… (local v12.3.0)`), then a
     `Checking for a newer release...` spinner runs.
   - Because 12.3.0 is behind latest, the **same bordered banner** as M0-1.3 is
     printed to **stderr**, as the **last** thing on screen (after the API dump,
     so it isn't scrolled off):

     ```text
     ┌────────────────────────────────────────────────────┐
     ⚠  1 Auro component(s) are NOT on the latest release
     └────────────────────────────────────────────────────┘
       @aurodesignsystem/auro-button  12.3.0 → <latest>

       Update all with:
       npm install @aurodesignsystem/auro-button@latest
     ```

   - stdout stays clean: `auro component auro-button 1>/tmp/out.txt 2>/tmp/err.txt`
     — the banner is in `err.txt`, the API doc in `out.txt`.
   - With `--json`, the banner still goes to **stderr** so stdout remains valid
     JSON: `auro component auro-button --json | jq .` succeeds.
3. **Negative cases (no banner):**
   - Run the same command from an **empty dir** → resolves from unpkg (latest),
     so **no** outdated check runs and no banner appears.
   - Run `auro component auro-button --tag latest` from the fixture → forces an
     unpkg fetch (`(unpkg)`), so no banner appears.
4. Exit code `0` in all cases (an outdated install is advisory, not an error).

##### M0-2.2 `--json` output — [Regression-covered]

1. Run: `auro component auro-button --json`
2. **Expect:**
   - Spinner success line (to stderr), then **only** raw JSON to stdout.
   - Output is valid JSON: `auro component auro-button --json | tail -n +1 | jq .`
     (pipe just the JSON; it is an array of declaration objects).
   - Each element in the array has `customElement: true` and a `tagName`.
   - Exit code `0`.

##### M0-2.3 `--tag` / version selection (always unpkg) — [Regression-covered]

An explicit `--tag`/version bypasses local resolution and always fetches from
unpkg (the installed copy may not match the requested ref).

1. Run: `auro component auro-button --tag latest`
2. Run with an explicit version, e.g. `auro component auro-button -t <a-real-version>`
3. **Expect:** spinner text reflects the `package@tag` target; output resolves to
   that version's manifest; success line shows `(unpkg)` — **even when run from
   the fixture project** where a local copy exists; exit code `0`.

##### M0-2.4 Component with no published manifest (genuine 404) — [Regression-covered; live auro-icon → Manual smoke]

Use the no-CEM component: **`auro-icon`** (it ships as a package but publishes no
`custom-elements.json`).

1. Run: `auro component auro-icon`
2. **Expect:**
   - Spinner **fails** with
     `No custom-elements.json published for @aurodesignsystem/auro-icon. It may not exist or may not publish a manifest yet.`
   - Exit code `1` (`echo $?`).

##### M0-2.5 Transient failure vs. 404 (distinct messaging) — [Regression-covered; real stalled-socket timeout → Marginal]

Proves a network failure is reported **differently** from a genuine 404 — when
offline the CLI cannot know whether the manifest is truly absent, so it must
report a transient error rather than the "no manifest published" message.

1. Take the machine offline (or block the network), then run any component
   lookup, e.g. `auro component auro-icon`.
2. **Expect:** the spinner **fails** with the transient variant, where the
   parenthetical is the underlying cause reported by the network layer:
   - Offline / DNS failure:
     `Failed to fetch @aurodesignsystem/auro-icon: request failed (fetch failed).`
   - Stalled connection (no response within 10s):
     `Failed to fetch @aurodesignsystem/auro-icon: request failed (timed out after 10s).`
   - The message is **never** the 404 form
     (`No custom-elements.json published for …`), even for `auro-icon` (which
     genuinely 404s when online) — offline cannot distinguish the two.
   - Exit code `1`.

> **Offline vs. stalled are different code paths.** Simply going offline fails
> **immediately** with `request failed (fetch failed)` — the connection is
> refused or DNS can't resolve, so `fetch` rejects at once. The
> `timed out after 10s` variant only fires when a connection is *accepted* but
> the server never responds, so nothing rejects until the CLI's own 10s
> `AbortSignal.timeout` fires. You can't reach it by turning off Wi‑Fi — you
> need a host that accepts the socket and then goes silent.

**Reproducing the stalled connection (the `timed out after 10s` variant).**
The manifest URL is hardcoded to `unpkg.com`, so redirect that name to
something that accepts the connection and stalls. Both methods need `sudo`
(privileged port / `/etc/hosts` edit).

- **Method A — local listener that never replies (most reliable):**

  ```bash
  # 1. Point unpkg at localhost
  sudo sh -c 'printf "\n127.0.0.1 unpkg.com\n" >> /etc/hosts'
  # 2. In one terminal: accept connections on 443 and never respond
  sudo nc -k -l 443
  # 3. In another terminal, look up a component that WOULD succeed online:
  time auro component auro-button
  #    → hangs ~10s, then:
  #    ✖ Failed to fetch @aurodesignsystem/auro-button: request failed (timed out after 10s).
  # 4. Cleanup: Ctrl-C the nc, then remove the hosts line
  sudo sed -i '' '/127.0.0.1 unpkg.com/d' /etc/hosts
  ```

  `nc` accepts the TCP socket and reads the TLS ClientHello but sends nothing,
  so the handshake stalls until the 10s abort.

- **Method B — blackhole IP (quicker, no listener):**

  ```bash
  sudo sh -c 'printf "\n192.0.2.1 unpkg.com\n" >> /etc/hosts'   # TEST-NET-1, unrouted
  time auro component auro-button        # SYN goes nowhere → ~10s → timed out after 10s
  sudo sed -i '' '/192.0.2.1 unpkg.com/d' /etc/hosts
  ```

  `192.0.2.1` is reserved (RFC 5737) and normally silently dropped, so the SYN
  gets no reply and the connect hangs. Caveat: on a network that returns an
  ICMP *reject* instead of dropping, you'll get `fetch failed` immediately
  rather than the timeout — if that happens, use Method A.

> Use **`auro-button`** (not `auro-icon`) for the stall test — it would succeed
> online, so the *only* reason for failure is the stall, cleanly proving the
> timeout messaging independent of a 404.

---

#### M0-3 — `auro cem`

Fetches every published component manifest and merges them into one aggregated
Custom Elements Manifest.

> **Canonical, not local.** Unlike `component`/`context`, `auro cem` deliberately
> ignores `./node_modules` (`preferLocal: false`) and always fetches the latest
> published manifests from unpkg, so the aggregated index never mixes
> per-machine installed versions. Running it from the fixture project must
> produce the same output as running it from an empty dir. Verify: the
> aggregate's `auro-button` modules reflect the **latest** published version,
> not the older one pinned in the fixture.

##### M0-3.1 Default aggregate build — [Regression-covered; live full-registry aggregate → Manual smoke]

1. Run: `auro cem`
2. **Expect:**
   - Spinner: `Fetching manifests for N components...` → `Merging manifests...`
     → succeeds with `Aggregated X/N component manifests (M modules) to custom-elements.aggregate.json`.
   - `custom-elements.aggregate.json` exists and is valid JSON
     (`jq . custom-elements.aggregate.json`).
   - Top level has `schemaVersion` and a `modules` array with M entries.
   - **Namespacing:** every `modules[].path` is prefixed with its package, e.g.
     `@aurodesignsystem/auro-button/src/auro-button.js`. Spot-check that internal
     references (`declaration.module`, `references[].module`) are namespaced too,
     while any node carrying a `package` sibling is left untouched.
   - Skipped packages are listed after the spinner:
     `Skipped <pkg>: no custom-elements.json published`.
   - Exit code `0`.

##### M0-3.2 Custom output path — [Regression-covered]

1. Run: `auro cem --output dist/custom-elements.aggregate.json`
   (ensure `dist/` exists) and `auro cem -o /tmp/agg.json`.
2. **Expect:** file written to the given path; success line names that path; exit `0`.

##### M0-3.3 Mixed schema versions warning — [Regression-covered]

The warning fires only when the fetched manifests declare **more than one**
distinct `schemaVersion`. Because `auro cem` is canonical (it always fetches the
latest published manifests and ignores `./node_modules`), a tester cannot force
this from the fixture — the inputs come from the live registry.

1. **Precondition probe** — check whether the live set can even trigger it:

   ```bash
   for p in accordion button card formkit hyperlink nav table tabs; do
     curl -sfL --max-time 12 "https://unpkg.com/@aurodesignsystem/auro-$p/custom-elements.json" \
       | jq -r --arg p "$p" '"\($p): \(.schemaVersion)"'
   done | sort -u
   ```

   - If this prints **one** version (as of this writing every published Auro CEM
     is `1.0.0`), the live command **cannot** emit the warning — mark this step
     **N/A (all published manifests share one schemaVersion)** and rely on the
     unit test below for coverage.
   - If it prints **more than one** version, run `auro cem` and confirm a
     `Merging mixed CEM schema versions: <v1>, <v2>` line appears on stderr and
     the command still exits `0`.

2. **Automated coverage (deterministic).** The mixed-schema detection is unit
   tested in [`test/mergeManifests.test.ts`](mergeManifests.test.ts), which feeds
   `mergeManifests` sources with differing `schemaVersion`s and asserts the
   warning fires exactly once (listing every distinct version), does **not** fire
   when versions are uniform, and that the merge still succeeds. Run with:

   ```bash
   npm test
   ```

   **Expect:** all tests pass — this is the authoritative check for M0-3.3 while
   the live registry is single-schema.

##### M0-3.4 Transient failures make the aggregate incomplete — [Marginal]

Proves the command distinguishes a genuine 404 (an expected skip — not every
package publishes a CEM) from a transient failure (network error, timeout, 5xx,
unparseable body), which means an expected manifest is missing and the aggregate
is incomplete.

**Integration check (best-effort, environment-dependent).**

1. Force some fetches to fail transiently (throttle/offline mid-run).
2. **Expect:**
   - Genuine 404s are reported as `Skipped …` and do **not** fail the command.
   - Transient failures produce
     `N component(s) failed to fetch transiently; the aggregate may be incomplete. Re-run to retry.`
     and exit code `1`.

> Forcing exactly this — some packages 404 while others fail transiently, all in
> one `Promise.all` run — is hard to do deterministically without mocking the
> network (see the M0-2.5 note on why offline yields an immediate `fetch failed`
> rather than a mid-run mix). Treat this as a best-effort integration check and
> rely on the unit coverage below for the authoritative behavior.

**Automated coverage (deterministic).** [`test/fetchManifest.test.ts`](fetchManifest.test.ts)
locks down both halves of this behavior with a mocked `fetch`:

- **Classification** — a `404` is a skip with `transient` unset; a timeout →
  `transient` + `request failed (timed out after 10s)`; a network error →
  `transient` + `request failed (fetch failed)`; a `500` → `transient` +
  `HTTP 500`; an unparseable body → `transient` + `custom-elements.json is not
  valid JSON`; a valid `200` resolves the manifest from unpkg.
- **Partitioning** — `partitionOutcomes` (used by `auro cem`) puts every miss in
  `skipped` but only transient misses in `transientFailures`, so a run with only
  404 skips does **not** fail while any transient miss does.

Run with `npm test`; **expect** all tests pass.

##### M0-3.5 Total failure — [Regression-covered; live offline → Marginal]

1. Run fully offline: `auro cem`
2. **Expect:** `No component manifests could be fetched.`; exit code `1`.

---

#### M0-4 — `llms.txt` discoverability — [Manual]

The Auro docs site publishes `public/llms.txt` per the
[llms.txt spec](https://llmstxt.org/). No CLI command runs this; verify the file
is present and discoverable.

1. Confirm the docs site serves `llms.txt` at its web root
   (e.g. `curl -sSf https://auro.alaskaair.com/llms.txt`), returning HTTP 200.
2. **Expect:**
   - Content is non-empty and follows the llms.txt format (H1 title, summary,
     and link sections).
   - Links referenced resolve (spot-check a few).
3. Record where the file lives in the docs repo/build so later milestones can
   keep it in sync.

> Note: this surface lives in the Auro **docs site**, not this CLI repo. If the
> docs deploy is out of scope for the current test pass, mark this test
> **blocked** and note the owning repo/deploy.

---

#### M0-5 — Graceful skip for packages shipping no CEM — [Regression-covered; live smoke → Manual]

Confirms the system treats a missing manifest as an expected, handled case —
never a crash. The no-CEM component under test is **`auro-icon`** (a shipping
`@aurodesignsystem/*` package that returns `404` for `custom-elements.json` —
re-confirm via the probe in § Components under test).

1. **`auro cem`:** confirm `auro-icon` appears as
   `Skipped @aurodesignsystem/auro-icon: no custom-elements.json published` and
   the command still exits `0` with the remaining manifests aggregated.
2. **`auro component auro-icon`:** confirm it fails cleanly with
   `No custom-elements.json published for @aurodesignsystem/auro-icon. It may not
   exist or may not publish a manifest yet.` and exit `1` (a clear message, not a
   stack trace).
3. **`auro component zzznope`** (a totally unknown name): confirm the same
   graceful 404 handling — no unhandled exception, exit `1`.
4. **Expect overall:** no uncaught exceptions or stack traces in any case;
   messaging distinguishes "not published yet" (expected) from transient errors.

---

#### M0-6 — Release installable / npx-able (zero setup) — [Manual]

Validates the "done when" bar: the published CLI runs with zero local setup.
Run **after** PR #302 is merged and a release is cut.

1. In a clean environment (fresh temp dir, no repo checkout, caches cleared):
   ```bash
   npx --package=@aurodesignsystem/auro-cli auro context
   npx --package=@aurodesignsystem/auro-cli auro component auro-button --json
   npx --package=@aurodesignsystem/auro-cli auro cem -o /tmp/agg.json
   ```
2. **Expect:**
   - npx pulls the published version and each command behaves as in M0-1…M0-3.
   - No build step, auth, or config required.
   - Confirm the resolved version matches the newly cut release
     (`npx --package=@aurodesignsystem/auro-cli auro --version`).
3. Also smoke-test a global install:
   `npm i -g @aurodesignsystem/auro-cli && auro context`.

---

### Sign-off checklist (PT-M0 / AB#1628540)

**Automated — one check covers the bulk of the matrix:**

- [ ] `npm test` passes (green run signs off every **[Regression-covered]** case
      above — M0-1.1–1.5, M0-2.1–2.5 logic, M0-3.1–3.5 logic, M0-5 logic)

**Manual pass — only what automation can't reach:**

- [ ] Packaging & distribution: `npm pack` `files` allow-list + `bin`, global
      install / `npx`, `--version`/`--help`, Node `engines` (harness + **M0-6**)
- [ ] **M0-4** `llms.txt` present and discoverable (docs site)
- [ ] One live-network smoke run per command from the fixture project
      (real unpkg CEM, real `auro-icon` 404, real "latest" for the banner)
- [ ] TTY/visual: outdated banner colors/bold on a real TTY, and that they drop
      when stderr is redirected (M0-1.3 / M0-2.2b)
- [ ] Environment (SHA, Node, OS, network) recorded for the run

**Marginal (optional):** M0-2.5 real stalled-socket timeout, M0-3.4 mid-run
transient mix — run only to confirm real-socket behavior beyond the unit tests.

---

### AB#1628541 — PT-M1: `auro init` v1 (scoped grounding file)

Milestone goal: an engineer runs `auro init` in a project with Auro dependencies
and gets AI grounding files — **`AGENTS.md`** (canonical), a thin **`CLAUDE.md`**
that imports it, and a persisted **`auro.config.json`** — that document **exactly**
the installed components at their installed versions, with correct per-component
import paths and the Auro coding rules. Multi-component packages (`auro-formkit`)
are fully enumerated; existing custom registrations are detected and honored under
their real tags; and legacy standalone form packages can be migrated to formkit.

Reference: [docs/pt-m1-completion-plan.md](../docs/pt-m1-completion-plan.md),
[src/commands/init.ts](../src/commands/init.ts).

#### Command under test

`auro init` — one command, four options:

| Option | Effect |
| --- | --- |
| `--prefix <prefix>` | Default custom-element tag prefix (e.g. `myapp-`) for components with no existing registration. **Settles** the default, so no prompt is needed. |
| `--non-interactive` | Never prompt; take the prefix from `--prefix` or fail cleanly. **Implied by a non-TTY stdin or a set `CI` env var.** |
| `--yes` | Alias for `--non-interactive`. |
| `--offline` | Skip the best-effort outdated-release check (init's one network touch). Keeps the run fully network-free for CI/air-gapped use. |

After writing its files, `init` runs the **same best-effort outdated-release check
as `auro context`/`auro component`** — a bordered banner on stderr for any installed
package behind its latest release (including the legacy `⇢ auro-formkit` **Migrate**
block). It's online by default and advisory (a network failure never fails the run);
`--offline` skips it. Banner content is regression-covered by [`outdated.test.ts`](outdated.test.ts)
and the init call path by [`init.command.test.ts`](init.command.test.ts).

Outputs, written to the project root:

- **`AGENTS.md`** — canonical grounding: one API section per installed component
  (tag, install/import lines, attributes/props/slots/events) plus the Auro coding
  rules block.
- **`CLAUDE.md`** — a thin file that imports the canonical one (`@AGENTS.md`).
- **`auro.config.json`** — persisted default prefix + per-component tag overrides;
  the source of truth that makes regeneration idempotent.

#### Test projects — three real consumer apps

PT-M1's cross-framework scanning and monorepo handling were validated against three
real apps. Clone them fresh for the manual pass; each installs `auro-button`
(standalone) **and** `auro-formkit` (monorepo) and registers via **side-effect
import** (`import "@aurodesignsystem/auro-button"`), matching the dominant
real-world pattern:

| Repo | Framework / files | Distinguishing trait |
| --- | --- | --- |
| [ai-tooling-test-vanilla](https://github.com/AlaskaAirlines/ai-tooling-test-vanilla) | Vanilla `.js` (`src/main.js`) | Side-effect imports only — **no** `.register()` calls |
| [ai-tooling-test-react](https://github.com/AlaskaAirlines/ai-tooling-test-react) | React `.jsx` with JSX markup | Contains a real `Component.register('legacy-input')` amid JSX — the existing-registration case |
| [ai-tooling-test-svelte](https://github.com/AlaskaAirlines/ai-tooling-test-svelte) | Svelte `.svelte` (`<script>` blocks) | Registration via side-effect import inside a `<script>` block |

```bash
# From a scratch working area, per repo:
git clone https://github.com/AlaskaAirlines/ai-tooling-test-vanilla && cd ai-tooling-test-vanilla
npm install          # pulls auro-button + auro-formkit into node_modules
auro init            # the command under test (globally installed local build)
```

Two **derived scenarios** are built from a scratch project (they exercise paths the
three apps don't cover as shipped):

- **Migration scenario** — a project that declares a **legacy standalone** form
  package so the formkit migration offer fires:

  ```bash
  mkdir -p /tmp/auro-init-migrate && cd /tmp/auro-init-migrate
  npm init -y
  npm install @aurodesignsystem/auro-input   # a legacy standalone now shipped by formkit
  # add a source file that imports it, e.g. src/app.js with:
  #   import "@aurodesignsystem/auro-input";
  ```

- **Dedupe scenario** — a project with **both** a legacy standalone and the
  monorepo installed, so the same tag is registered twice:

  ```bash
  mkdir -p /tmp/auro-init-dedupe && cd /tmp/auro-init-dedupe
  npm init -y
  npm install @aurodesignsystem/auro-input @aurodesignsystem/auro-formkit
  ```

> **Teardown:** `rm -rf` each scratch dir; for the cloned repos, discard the
> generated `AGENTS.md`/`CLAUDE.md`/`auro.config.json` (and any migration edits)
> rather than committing them.

#### Automated coverage & manual scope (PT-M1)

As with M0, the bulk of PT-M1 is locked down by the automated suite (`npm test`),
which drives the full **detect → plan → generate → write** pipeline with mocked
`fetch`, on-disk `node_modules` fixtures, and forced non-interactive/TTY states.
Those tests authoritatively cover **logic, exact messaging, exit codes, stdout vs.
stderr separation, file contents, scoping, monorepo enumeration, dedupe, prefix
precedence, AST-scan detection, and the migration codemod** — deterministically and
offline. Re-running them by hand adds nothing; cite the test in sign-off instead.

**Regression-covered by `npm test` — do not test manually:**

| Area | Test file |
| --- | --- |
| Installed-component detection, version pinned from `package.json` (**never `latest`**), not-installed / no-manifest exclusion | [`detectInstalled.test.ts`](detectInstalled.test.ts) |
| `ResolvedComponent` normalization, monorepo enumeration (all shipped components, per-component subpath imports, shared version), catalog-not-installed exclusion, **grounded-once dedupe** | [`resolver.test.ts`](resolver.test.ts) |
| Config load/save, AST scan of `.js/.ts/.jsx/.svelte`, precedence config → scan → default, `inferPrefixFromTag`, majority suggestion, mixed-prefix, `planTagResolution`, `extractSvelteScripts` | [`registry.test.ts`](registry.test.ts) |
| `AGENTS.md` rendering, prefix/subpath-aware install lines, `CLAUDE.md` thin `@AGENTS.md` import | [`generator.test.ts`](generator.test.ts), [`init.format.test.ts`](init.format.test.ts) |
| End-to-end init: detect→plan→write, no-components warn, mixed-prefix confirm/decline/CI-fail, dedupe warning, migration accept/decline/non-interactive, AST-scan warn/skip | [`init.command.test.ts`](init.command.test.ts) |
| Legacy list + `isLegacyFormkitPackage`/`formkitTagFor`/`formkitSubpathFor`; dep swap, named/side-effect/Svelte import rewrites, deep-import skip, idempotency | [`formkitMigration.test.ts`](formkitMigration.test.ts), [`migrateFormkit.test.ts`](migrateFormkit.test.ts) |
| Outdated banner incl. the legacy `⇢ auro-formkit` **Migrate to auro-formkit** block | [`outdated.test.ts`](outdated.test.ts) |

**Manual scope — what automation structurally cannot cover.** The manual pass only
needs the following; everything else is regression-covered above:

1. **Real-TTY interactive prompts** — the tests force non-interactive (they *must*,
   since `inquirer` throws on a closed stdin). The `confirm`/`input` prompt UX,
   default selection, and the majority-prefix confirm can **only** be exercised on a
   real TTY. This is the central manual item (M1-3, M1-5).
2. **The formkit migration codemod on real source** — it edits `package.json` and
   rewrites import specifiers across real `.js/.jsx/.svelte` files, then requires a
   real `npm install` + re-run to ground formkit. Tests use fixtures; the real repos
   prove the codemod against actual source shapes and the reinstall loop (M1-5).
3. **Cross-framework AST scan on real files** — a live run over the real `.jsx`,
   `.svelte`, and vanilla `.js` confirms the globbing and Svelte `<script>`
   extraction against actual repo layouts (M1-4).
4. **Packaging** — `auro init` ships in the same bundle as M0, so the
   [run-under-test harness](#how-to-run-the-cli-under-test) covers distribution;
   just confirm `auro init` appears in `auro --help` and runs from the packed/global
   install.

Individual cases below are annotated **[Regression-covered]**, **[Manual]**, or
**[Manual smoke]** accordingly.

---

#### M1-1 — Basic scoped grounding — [Regression-covered; real-repo run → Manual smoke]

From a real repo (e.g. **ai-tooling-test-vanilla** after `npm install`).

1. Run: `auro init`
2. **Expect:**
   - Spinner: `Detecting installed Auro components...` → succeeds with
     `Detected N installed component(s) to ground.`
   - A `Writing grounding files...` spinner succeeds with
     `Wrote AGENTS.md, CLAUDE.md, and auro.config.json for N component(s).`
   - `AGENTS.md` exists, is non-empty Markdown, has one API section **only** for
     installed components (`auro-button` + every `auro-formkit` component), and ends
     with the Auro coding rules block. **No** component from an uninstalled package
     appears (strict scoping — not the 60+ catalog).
   - `CLAUDE.md` exists and is a thin import of the canonical file (contains
     `@AGENTS.md`).
   - `auro.config.json` exists and records the resolved prefix default + any
     per-component overrides.
   - Exit code `0`.
3. **Empty-project negative:** from a dir with no Auro deps, `auro init` warns
   `No installed Auro components found; nothing to ground.` and exits `0` (no files
   written).

#### M1-2 — Monorepo (`auro-formkit`) enumeration — [Regression-covered; real → Manual smoke]

Any of the three repos installs `auro-formkit` (one package, one aggregated CEM,
per-component subpath exports, one shared version).

1. Run `auro init`, then inspect `AGENTS.md`.
2. **Expect:**
   - **Every** component `auro-formkit` ships is grounded (not just one) — spot-check
     several tags (`auro-input`, `auro-select`, `auro-combobox`, …).
   - Each formkit component's install block uses its **subpath** import, e.g.
     `import "@aurodesignsystem/auro-formkit/auro-input";`, while `auro-button`
     (standalone) imports as `import "@aurodesignsystem/auro-button";`.
   - All formkit components report the **same** shared package version.
   - Exit code `0`.

#### M1-3 — Prefix resolution on a real TTY — [Manual]

The core manual item — exercises the `inquirer` prompt the suite cannot. Use a
scratch project with components installed but **no** existing registrations and
**no** persisted `auro.config.json` (delete it between sub-cases to force a fresh
decision).

1. **Interactive free input (no inferable prefix):** run `auro init` on a real TTY
   with no `--prefix`.
   - **Expect:** an `input` prompt —
     `Prefix for Auro custom-element tags (e.g. myapp-; blank keeps the bare auro-* tags):`.
     Enter `myapp-`.
   - Grounded tags in `AGENTS.md` use `myapp-` (e.g. `myapp-button`); the prefix is
     persisted to `auro.config.json`. Exit `0`.
2. **Blank answer keeps bare tags:** re-run, submit an **empty** prefix.
   - **Expect:** tags stay bare `auro-*` and a stderr warning notes the bare-`auro-*`
     fallback. Exit `0`.
3. **`--prefix` settles it (no prompt):** `auro init --prefix acme-` — **no** prompt
   appears; tags become `acme-*`; persisted. Exit `0`.
4. **Non-interactive / CI without a resolvable prefix fails cleanly:**
   `CI=1 auro init` (or `auro init --non-interactive`) with an unresolved default.
   - **Expect:** no prompt; error on stderr
     `Cannot resolve component tags non-interactively: … Re-run with --prefix <prefix> (e.g. --prefix myapp-).`
     and exit `1`.

#### M1-4 — Existing custom registrations + cross-framework scan — [Regression-covered; real files → Manual smoke]

Use **ai-tooling-test-react** (has a real `Component.register('legacy-input')` amid
JSX) and the vanilla/svelte repos (side-effect imports only).

1. **React (has a registration):** run `auro init`.
   - **Expect:** the scanned tag (`legacy-input`) is honored as a **per-component
     override**, grounded under its **actual** tag, and **never** rewritten. If a
     majority prefix can be inferred from existing registrations, it is offered as
     the default (see M1-3's confirm). Exit `0`.
2. **Vanilla + Svelte (side-effect imports only):** run `auro init`.
   - **Expect:** the AST scan finds no registrations and emits **no** false-positive
     warnings — the dominant side-effect-import pattern is clean. Svelte `<script>`
     blocks are scanned (template markup/runes never reach the parser). Exit `0`.
3. **Mixed prefixes (derived):** in a scratch project, seed two existing
   registrations with different prefixes (e.g. `foo-input`, `bar-select`) and run
   `auro init` on a TTY.
   - **Expect:** each existing tag is preserved as its own override; a confirm prompt
     offers the **majority** prefix as the future default
     (`Existing registrations use more than one prefix. Use the most common, '<p>', …?`).
     Non-interactively this path instead requires `--prefix` and fails without it.

#### M1-5 — Legacy standalone → `auro-formkit` migration walkthrough — [Manual]

Uses the **migration scenario** project (a legacy standalone like
`@aurodesignsystem/auro-input` installed + a source file importing it). This is
init's sole codemod path — it runs **before** grounding.

1. **Accept (interactive):** run `auro init` on a real TTY.
   - **Expect:** after detection, a confirm prompt (default **No**):
     `N legacy standalone package(s) now live in auro-formkit (…). Migrate to auro-formkit now? This edits package.json and rewrites import specifiers.`
     Answer **Yes**.
   - A `Migrating to auro-formkit...` spinner succeeds:
     `Migrated N package(s) to auro-formkit; rewrote M import(s) across K file(s).`
   - `package.json` now depends on `@aurodesignsystem/auro-formkit` (added at
     `@latest` when absent, existing version kept); bare import specifiers are
     rewritten to formkit subpaths (`import "@aurodesignsystem/auro-formkit/auro-input";`).
   - Any **deep** import (`…/auro-input/dist/x.js`) is **left unchanged** and flagged
     on stderr for manual follow-up.
   - The run **stops** (no grounding yet) with:
     `Next: run npm install, then re-run auro init to regenerate grounding for auro-formkit.`
   - Then `npm install && auro init` grounds the formkit components (subpath imports),
     confirming the reinstall loop.
2. **Decline (interactive):** re-run, answer **No** (the default).
   - **Expect:** no edits; init proceeds to ground the project **as-is** (the legacy
     standalone is documented). Exit `0`.
3. **Non-interactive / CI only advises (never edits):** `CI=1 auro init` (or
   `--non-interactive`) in the same project.
   - **Expect:** no prompt, no file edits — only a stderr advisory:
     `⚠ N legacy standalone package(s) can be migrated to @aurodesignsystem/auro-formkit: … Run auro init interactively to apply the migration.`
     Grounding then continues normally. Verify `package.json` and sources are
     **unchanged** (`git diff`).

#### M1-6 — Regeneration on dependency change — [Regression-covered; real → Manual smoke]

From a project already inited once (so `auro.config.json` exists with a settled
default).

1. Add or remove an Auro dependency (`npm install @aurodesignsystem/auro-<x>` or
   `npm uninstall …`), then re-run `auro init`.
2. **Expect:**
   - The files update to reflect the new installed set (added component appears /
     removed component drops).
   - With the default already settled in `auro.config.json`, the run does **not**
     re-prompt and does **not** CI-fail — regeneration is deterministic. Exit `0`.

#### M1-7 — Legacy-vs-monorepo dedupe warning — [Regression-covered]

Uses the **dedupe scenario** (both `@aurodesignsystem/auro-input` and
`@aurodesignsystem/auro-formkit` installed).

1. Run `auro init`.
2. **Expect:**
   - The overlapping tag (`auro-input`) is grounded **once** (a single API section),
     and a stderr warning fires:
     `⚠ Tag <auro-input> is registered by multiple installed packages: … Grounded once — verify which package you intend to use.`
   - Exit code `0`.

---

### Sign-off checklist (PT-M1 / AB#1628541)

**Automated — one check covers the bulk of the matrix:**

- [ ] `npm test` passes (green run signs off every **[Regression-covered]** case
      above — detection, scoping, monorepo enumeration, dedupe, prefix precedence,
      AST scan, migration codemod, `CLAUDE.md` import, bare-default warning)

**Manual pass — only what automation can't reach:**

- [ ] `auro init` appears in `auro --help` and runs from the packed/global install
- [ ] **M1-3** real-TTY prefix prompts: free input, blank-keeps-bare, `--prefix`
      (no prompt), CI/non-interactive fail-without-`--prefix`
- [ ] **M1-5** formkit migration walkthrough on a real project: accept (edits +
      reinstall + re-ground), decline (ground as-is), CI advisory-only (no edits)
- [ ] **M1-4** cross-framework scan smoke over the three real repos (React
      registration honored; vanilla/Svelte side-effect imports clean, no false
      positives)
- [ ] **M1-2** monorepo smoke: all `auro-formkit` components grounded with subpath
      imports + shared version
- [ ] Environment (SHA, Node, OS, network) recorded for the run

---

### AB#1628542 — PT-M2: Editor IntelliSense generation (HTML custom-data + framework types)

Milestone goal: after `auro init`, an engineer's **editor** offers autocomplete +
hover for the Auro tags they actually have installed — with **no network call**,
generated from the CEM already in `node_modules`. Where PT-M1 emitted grounding
files for an AI assistant, PT-M2 emits **editor artifacts** for the IDE's own
language servers, including for components registered under a **custom tag name**
(not just the default `auro-*`).

Reference: [docs/pt-m2-completion-plan.md](../docs/pt-m2-completion-plan.md),
[src/init/editors/](../src/init/editors/), [src/commands/init.ts](../src/commands/init.ts).

#### Two mechanisms — why one artifact can't cover all three apps

This is the central fact of the manual pass: editor IntelliSense for web components
comes from **three independent language-server subsystems**, so PT-M2 ships **four
emit targets over one resolved manifest**. Each app below is powered by a different
server, so each must be verified in its **own** file type — a green HTML check says
nothing about JSX, Svelte, or CSS `::part()`.

| App / file | Language server | Fed by | Artifact |
| --- | --- | --- | --- |
| Vanilla `.html` (+ HTML regions) | VS Code **HTML** server | `html.customData` JSON | `.vscode/auro.html-custom-data.json` |
| React `.tsx`/`.jsx` | **TypeScript** service | `.d.ts` augmenting `JSX.IntrinsicElements` | `auro-types/auro-jsx.d.ts` |
| Svelte `.svelte` | **Svelte** server | `.d.ts` augmenting `svelteHTML` | `auro-types/auro-svelte.d.ts` |
| `.css`/`.scss`/`.less` (+ Svelte `<style>`) | VS Code **CSS** server (snippets) | auto-discovered `.code-snippets` | `.vscode/auro.code-snippets` |

**Why a snippets file and not CSS custom-data.** Styling a shadow part
(`myapp-button::part(⎸)`) is the one thing the other three targets structurally
can't assist: `css.customData` has no field to enumerate an element's `::part()`
names, and the JSX/Svelte `.d.ts` describe attributes, not CSS. A generated VS Code
**snippets** file — one `${1|part,names|}` choice placeholder per component, keyed on
the resolved tag — is the only mechanism that gives an editor pick-list for part
names. VS Code **auto-discovers** `.vscode/*.code-snippets`, so this target needs
**no `settings.json` wiring** at all (unlike html.customData).

> **HTML hover ≠ HTML autocomplete for slots/events.** The `html.customData` format
> models **tags and attributes** as first-class (both autocomplete *and* hover), but
> has **no slot/event model**. Slots, events, methods, and CSS parts are rendered
> into the tag's **hover description** only. So for the HTML app, word every check as
> *tag/attribute autocomplete* and *hover shows slots/events/methods/CSS parts* —
> **never** "slot/event autocomplete." (The JSX/Svelte targets, being real TS types,
> do surface typed events/props.)

#### Artifacts written + how init decides to write them

Enabled targets write, at the project root (all generated from the local CEM, no
network):

- `.vscode/auro.html-custom-data.json` — wired into `.vscode/settings.json`
  (`"html.customData": ["./.vscode/auro.html-custom-data.json"]`).
- `auro-types/auro-jsx.d.ts` — its `import type { … }` specifiers resolved to the
  **installed** packages so they type-check from the consumer's `node_modules`.
- `auro-types/auro-svelte.d.ts` — self-contained (no class imports).
- `.vscode/auro.code-snippets` — CSS `::part()` snippets, **auto-discovered** by VS
  Code (no `settings.json` entry). Written only when at least one installed component
  has `cssParts`; an all-partless install writes no file even with the target enabled.

The `auro-types/` dir is deliberately **non-dotted** so TypeScript's default `**/*`
include picks it up with **zero** tsconfig edits; when a project has an explicit
`include`/`files`, init appends `"auro-types"` non-destructively (see M2-6).

New `auro init` options (tri-state, commander-negatable):

| Option | Effect |
| --- | --- |
| `--vscode` / `--no-vscode` | Force the HTML custom-data target on / off. |
| `--jsx` / `--no-jsx` | Force the React/JSX `.d.ts` target on / off. |
| `--svelte` / `--no-svelte` | Force the Svelte `.d.ts` target on / off. |
| `--css-snippets` / `--no-css-snippets` | Force the CSS `::part()` snippets target on / off. |

Per-target resolution precedence (frozen): **flag → persisted `auro.config.json`
`init.editors.*` → detection → interactive confirm (TTY only)**. Detection defaults:
`.vscode/` dir → VS Code; a `tsconfig.json` with `jsx` set **or** a `react` dep →
JSX; a `svelte` dep or `svelte.config.*` → Svelte; the CSS snippets target reuses the
`.vscode/` signal (it's a VS Code feature). Non-interactive/CI takes the
detected default and **never** prompts or fails (an editor choice always has a safe
default — unlike the PT-M1 prefix).

#### Test projects — the same three real consumer apps, opened in an editor

PT-M2 reuses the exact three PT-M1 apps ([§ Test projects — three real consumer
apps](#test-projects--three-real-consumer-apps)), because the point is to prove live
IntelliSense against real framework source. The **new** requirement over PT-M1 is
that each must be **opened in an editor with the right language server**, and the
artifacts committed to the TS program / HTML server:

| Repo | Prove in this file type | Editor prerequisite |
| --- | --- | --- |
| [ai-tooling-test-vanilla](https://github.com/AlaskaAirlines/ai-tooling-test-vanilla) | `.html` file / HTML region | VS Code **HTML Language Features** (built in) |
| [ai-tooling-test-react](https://github.com/AlaskaAirlines/ai-tooling-test-react) | `.tsx` / `.jsx` | VS Code **TypeScript** service (built in); `@types/react` installed |
| [ai-tooling-test-svelte](https://github.com/AlaskaAirlines/ai-tooling-test-svelte) | `.svelte` | **Svelte for VS Code** (`svelte.svelte-vscode`) |

```bash
# Per repo, from a scratch working area:
git clone https://github.com/AlaskaAirlines/ai-tooling-test-react && cd ai-tooling-test-react
npm install                 # pulls auro-button + auro-formkit (+ react/@types/react)
auro init --jsx             # writes auro-types/auro-jsx.d.ts + tsconfig wiring
code .                      # open the folder in VS Code
```

> **Editor must reload to pick up new wiring.** After `auro init` writes/merges
> `settings.json` or `tsconfig.json`, force the servers to re-read — HTML
> custom-data via **Developer: Reload Window** (or reopen the folder); TypeScript
> (JSX) via **TypeScript: Restart TS Server**; Svelte via **Svelte: Restart Language
> Server** (or Reload Window). If completion/hover doesn't appear, a stale server is
> the first thing to rule out.

**Teardown:** discard the generated `.vscode/auro.html-custom-data.json`,
`.vscode/auro.code-snippets`, `auro-types/`, and the `settings.json`/`tsconfig.json`
merges (`git checkout`/`git clean`) rather than committing them.

#### Automated coverage & manual scope (PT-M2)

As with M0/M1, the bulk of PT-M2 is locked down by the automated suite (`npm test`),
which drives the three pure builders and the full write/merge orchestration with
synthetic + real vendored CEMs, on-disk fixtures, and forced non-interactive/TTY
states. Those tests authoritatively cover **artifact *contents* (byte-exact golden
fixtures per target), tag-swap for custom names, JSX class-import resolution, the
`settings.json` + `tsconfig.json` merges (every branch), detection heuristics, the
interactive prompt, flag precedence, idempotent regeneration, and dependency
add/remove** — deterministically and offline. Re-running them by hand adds nothing;
cite the test in sign-off instead.

**Regression-covered by `npm test` — do not test manually:**

| Area | Test file |
| --- | --- |
| Byte-exact HTML/JSX/Svelte artifact contents (golden fixtures); tag swap for default-prefix / arbitrary override / bare fallback; attributes present; private-reflected description-less attributes (`data-hover`/`data-active`) dropped while documented ones are kept; slots/events/methods in the HTML hover description; JSX class-import specifiers resolved to the installed package | [`init.editors.builders.test.ts`](init.editors.builders.test.ts) |
| Format-freeze golden fixtures per target (upstream drift → failing test) | [`init.editors.format.test.ts`](init.editors.format.test.ts) |
| `mergeVsCodeSettings` + `mergeTsconfigInclude`: empty / unrelated-keys+comments / string→array normalize / pre-existing entry / idempotent / unparseable→warn+skip; the four-branch `include` decision tree | [`init.editors.builders.test.ts`](init.editors.builders.test.ts) |
| Detection heuristics — every branch of `detectVsCode`/`detectJsx`/`detectSvelte`/`detectEditorSignals`, negatives, never-throws | [`init.editors.detect.test.ts`](init.editors.detect.test.ts) |
| JSX `.d.ts` type-checks under the project's own `tsc` (imports resolve; self-contained prop/element types valid) | [`init.editors.tsc-smoke.test.ts`](init.editors.tsc-smoke.test.ts) |
| `auro init` integration: each `--<target>` writes its artifact + wiring with the resolved (prefixed) tag; `--no-*` writes nothing; detected signal enables non-interactively; persisted choice honored without a flag; interactive prompt seeds detection defaults + persists answers; flag overrides a conflicting persisted choice; malformed-CEM hardening; all-three idempotent regeneration + dependency removal; `--css-snippets` writes `.vscode/auro.code-snippets` with the resolved tag and **no** `settings.json` merge, persisting `cssSnippets: true` | [`init.command.test.ts`](init.command.test.ts) |
| CSS `::part()` snippets builder: byte-exact golden (a `${1...}` choice placeholder of part names, `scope` of `css,scss,less`, resolved-tag key/prefix/selector); components without `cssParts` omitted; an all-partless install returns `null` (no file); choice-breaking part names dropped | [`init.editors.builders.test.ts`](init.editors.builders.test.ts), [`init.editors.format.test.ts`](init.editors.format.test.ts) |

**Manual scope — what automation structurally cannot cover.** Automation proves the
artifacts are **correct**; only a human in an editor can prove the language servers
**consume** them into live completion/hover. The manual pass needs only:

1. **Live HTML IntelliSense** (M2-1) — real `<auro-` completion, attribute
   completion, and hover in an `.html` file, driven by the written custom-data.
2. **Live React/JSX IntelliSense** (M2-2) — typed intrinsic-element completion,
   prop-type hover, and a real type **error** on a wrong prop in a `.tsx` file.
3. **Live Svelte IntelliSense** (M2-3) — element completion with typed props/events
   in a `.svelte` file.
4. **Custom-registered tag names in the editor** (M2-4) — the same three checks, but
   under a custom tag (`--prefix myapp-` → `myapp-button`, and an existing
   `legacy-input` registration), proving task #4 end-to-end in the IDE.
5. **Real-TTY per-target prompt** (M2-5) — the `confirm`-per-detected-target UX the
   suite forces non-interactive.
6. **Live wiring merge on a real editor config** (M2-6 smoke) — that a real
   pre-existing `.vscode/settings.json` / `tsconfig.json` keeps its comments/keys and
   the servers still activate.
7. **Live CSS `::part()` snippet completion** (M2-7) — that typing `myapp-button::part`
   in a `.css`/`.scss`/`.less` file expands to the generated part-name choice, driven
   by the auto-discovered snippets file (no `settings.json`).

Individual cases below are annotated **[Manual]**, **[Manual smoke]**, or
**[Regression-covered]** accordingly.

---

#### M2-1 — Vanilla / HTML: live tag + attribute autocomplete and hover — [Manual]

From **ai-tooling-test-vanilla** after `npm install`.

1. Run `auro init --vscode` (or plain `auro init` — the `.vscode/` dir makes VS Code
   the detected default), then **Reload Window** and open an `.html` file (create
   `scratch.html` if the repo has none).
2. **Tag autocomplete:** type `<auro-` in the HTML body.
   - **Expect:** installed Auro tags complete — `auro-button` plus every installed
     `auro-formkit` element (`auro-input`, `auro-select`, …). **No** uninstalled
     catalog tag appears (strict install-scoping).
3. **Attribute autocomplete:** inside `<auro-button>` (type a space after the tag),
   trigger completion.
   - **Expect:** real attributes from the CEM complete (e.g. `variant`, `disabled`),
     each with a hover description.
   - **Negative (private reflections):** internal reflected attributes such as
     `data-hover` / `data-active` do **not** appear in the completion list —
     [Regression-covered] by the builder drop (`isPrivateReflection`), confirmed
     live here.
4. **Tag hover:** hover the `<auro-button>` tag name.
   - **Expect:** a description that includes **Slots / Events / Methods / CSS Parts**
     markdown sections (hover, not autocomplete — per the note above). Confirm a
     slot-rich element like `auro-input` shows its slots/events on hover.
5. **Negative:** a plain `<div>` shows no Auro attributes (custom-data is scoped to
   the Auro tags), and a tag from an **uninstalled** package does not complete.

#### M2-2 — React / JSX: typed intrinsic completion, prop hover, and a type error — [Manual]

From **ai-tooling-test-react** after `npm install` (confirm `react` + `@types/react`
are present so JSX prop typing fully resolves).

1. Run `auro init --jsx`, then **TypeScript: Restart TS Server**, and open a `.tsx`
   file with JSX markup.
2. **Intrinsic-element completion:** type `<auro-button` (then a space) in JSX.
   - **Expect:** the intrinsic element completes with **typed props** (attributes
     typed from the CEM), not `any`. Prop names autocomplete inside the tag.
3. **Prop-type hover:** hover a prop (e.g. `variant`).
   - **Expect:** the hover shows its **type**, not `any`/`unknown`.
4. **Type error on a wrong prop type:** assign a prop a value of the wrong type (e.g.
   a boolean-typed attribute set to a number, or an unknown prop under a strict
   config).
   - **Expect:** the TS service flags it with a red squiggle / Problems entry — proof
     the `.d.ts` is genuinely on the program and type-checking, not merely present.
5. **Import resolution:** confirm no "cannot find module" error originates from
   `auro-types/auro-jsx.d.ts` — its `import type { … }` specifiers must resolve from
   the installed packages (regression-covered by the tsc smoke, but confirm live too).

> **JSX namespace note (React version).** Newer React (19) routes JSX through
> `react/jsx-runtime` rather than the global `JSX` namespace. The generated `.d.ts`
> augments both; if intrinsic completion doesn't appear, record the React version and
> which namespace the project uses — this is the one JSX variance the plan flagged as
> a verify-in-editor item, not a blocker.

#### M2-3 — Svelte: typed element completion + hover — [Manual]

From **ai-tooling-test-svelte** after `npm install`, with the **Svelte for VS Code**
extension installed.

1. Run `auro init --svelte`, then restart the Svelte language server so it re-reads
   `tsconfig.json` and loads the new `auro-types/auro-svelte.d.ts`:
   - Open a `.svelte` file first (this **activates** the Svelte extension — its
     commands don't appear until a Svelte file is open).
   - Open the Command Palette (**⇧⌘P** on macOS / **Ctrl+Shift+P** on Windows/Linux),
     type `Svelte: Restart Language Server`, and run it. (The command is contributed
     by the `svelte.svelte-vscode` extension; if it isn't listed, the extension isn't
     installed or hasn't activated — reopen a `.svelte` file.)
   - Fallback if completion still doesn't appear: **Developer: Reload Window** (from
     the same Command Palette) restarts every server, including Svelte's.
2. Back in the `.svelte` file's template markup, type `<auro-button` (or
   `<auro-input`), then a space.
   - **Expect:** the element completes with **typed props/events** from the CEM; prop
     hover shows types. Only installed Auro elements appear.
3. Confirm the Svelte server — not just the HTML fallback — is providing this: the
   typed props/events (not merely tag-name completion) are the Svelte `.d.ts` at work.

#### M2-4 — Custom-registered tag names in the editor (task #4) — [Manual]

The ticket's task #4: autocomplete/hover must work for a component registered under a
**custom** name, not only the default `auro-*`. Prove it lives in each editor.

1. **Prefix-driven custom tag.** In any of the three apps, run
   `auro init --prefix myapp- --vscode --jsx --svelte` (delete `auro.config.json`
   first to force a fresh prefix), reload the servers.
   - **HTML (vanilla):** `<myapp-` completes to `myapp-button` etc.; hover works
     under the custom name; the bare `<auro-button>` does **not** complete (the tag
     was swapped, not duplicated).
   - **React:** `<myapp-button` completes with typed props.
   - **Svelte:** `<myapp-button` completes with typed props/events.
2. **Existing per-component registration.** In **ai-tooling-test-react** (which has a
   real `Component.register('legacy-input')`), run `auro init --jsx`.
   - **Expect:** `<legacy-input` completes/hovers under its **actual** registered tag
     (honored as a per-component override), while other components use the default
     (or prefixed) tag — proving arbitrary per-tag overrides reach the editor, not
     just a uniform prefix.

#### M2-5 — Real-TTY per-target detection prompt — [Manual]

Exercises the `confirm`-per-target UX the suite forces non-interactive. Use a scratch
project (or one of the apps) with **no** `--vscode/--jsx/--svelte` flags and **no**
persisted `init.editors` in `auro.config.json` (delete it to force a fresh decision).

1. Run `auro init` on a real TTY.
   - **Expect:** a `confirm` prompt **per target**, each **defaulting to its detected
     signal** — e.g. VS Code defaults **Yes** when a `.vscode/` dir exists, JSX
     defaults **Yes** when `react`/`jsx` is present, Svelte defaults **Yes** with a
     `svelte` dep/config. Answer against a default (e.g. decline a detected target,
     accept an undetected one).
2. **Expect:** the **answers** (not the detected defaults) drive which artifacts are
   written, and all three booleans persist to `auro.config.json` `init.editors`.
3. **Re-run is silent:** run `auro init` again — with `init.editors` now settled, it
   does **not** re-prompt (idempotent, CI-safe). Exit `0`.
4. **Non-interactive default:** `CI=1 auro init` (fresh config) writes each target
   per its detected signal with **no** prompt and **no** failure. Exit `0`.

#### M2-6 — Non-destructive wiring on a real editor config — [Regression-covered; live-server smoke → Manual]

The merges are exhaustively regression-covered (every branch, idempotent,
comment-preserving). The **only** manual value is confirming a real language server
still activates against a genuine pre-existing config.

1. In an app that already has a `.vscode/settings.json` **with comments and unrelated
   keys** (add a couple if none), run `auro init --vscode`.
   - **Expect:** the file keeps its comments/keys/formatting and gains
     `html.customData` (verify via `git diff`); a **second** run does not duplicate
     the entry; the HTML server activates after reload (M2-1 checks pass).
2. In an app with an explicit `tsconfig.json` `include` array, run `auro init --jsx`.
   - **Expect:** `"auro-types"` is appended to `include` (deduped, source files
     unaffected); the `.d.ts` lands on the TS program (M2-2 checks pass). For a
     default-include project (no `include`/`files`), confirm init makes **no**
     tsconfig edit yet the `.tsx` still type-checks (the non-dotted dir is auto-picked
     up).
3. **Unrecoverable config → warn + still write.** Temporarily corrupt the
   `tsconfig.json` (malformed JSONC) and run `auro init --jsx`.
   - **Expect:** a stderr warning carrying the exact manual `include` line to add, the
     `.d.ts` **still written**, and the tsconfig left untouched (regression-covered;
     smoke only if verifying the live message).

#### M2-7 — CSS `::part()` snippet completion — [Manual]

The one target the automated suite can prove **correct** but not **consumed**: only a
live editor shows the snippet firing. Use any of the three apps whose install has a
component with real `cssParts` (e.g. **auro-formkit** → `auro-input` has
`wrapper`/`label`/`helpText`/`input`/… parts; note the vendored `auro-button` CEM
ships **empty** `cssParts`, so a button-only install writes no snippets file).

1. Run `auro init --css-snippets` (or plain `auro init` — the `.vscode/` dir makes it a
   detected default), then **Developer: Reload Window** so VS Code re-scans
   `.vscode/*.code-snippets`. Confirm `.vscode/auro.code-snippets` was written and that
   **no** `html.customData`/settings entry was added for it (`git diff` — snippets are
   auto-discovered).
2. **Plain CSS:** in a `.css` file, type `auro-input::part` (or your resolved tag).
   - **Expect:** a snippet suggestion `Auro <auro-input> ::part`; accepting it inserts
     `auro-input::part(⎸) { … }` with the cursor in a **choice dropdown** of that
     component's part names, in CEM order. Picking one fills the selector; `Tab` lands
     in the `{ }` block. Property/value completion inside the block is the standard CSS
     service (not ours).
3. **SCSS + LESS:** repeat in a `.scss` and a `.less` file — the `scope: css,scss,less`
   fires in all three.
4. **Resolved tag:** if the app was init'd with `--prefix myapp-`, the snippet is keyed
   and inserts under `myapp-input::part(…)`, **not** `auro-input` — the resolved tag
   flows into the snippet just like the other targets.
5. **Svelte `<style>` — needs `:global(...)`:** in a `.svelte` file's `<style>` block
   the snippet still fires (it's CSS-language), **but** Svelte's scoped-style compiler
   drops selectors it thinks are unused; a shadow `::part()` selector must be wrapped
   `:global(auro-input::part(input)) { … }` to survive. This is a **documented Svelte
   requirement**, not a CLI bug — note it rather than filing it.
6. **Documented non-blockers (do not file):**
   - **CSS-in-JS** (styled-components / Emotion template literals) — the snippet won't
     fire inside a JS/TS template string unless the editor has an embedded-CSS grammar
     active for that library; VS Code doesn't by default. Out of scope for a snippets
     file.
   - **Inline `style=` attributes** cannot target pseudo-elements at all (a CSS
     limitation, not editor tooling) — `::part()` styling must live in a stylesheet.

---

### Sign-off checklist (PT-M2 / AB#1628542)

**Automated — one check covers the bulk of the matrix:**

- [ ] `npm test` passes (green run signs off every **[Regression-covered]** case
      above — artifact contents, tag swap, JSX class-import + tsc smoke, both merges,
      detection, interactive prompt, flag precedence, idempotent regen, dependency
      removal, malformed-CEM hardening)

**Manual pass — only what automation can't reach (live language servers):**

- [ ] `auro init` `--vscode`/`--jsx`/`--svelte`/`--css-snippets` (+ `--no-*`) appear in
      `auro init --help` and run from the packed/global install
- [ ] **M2-1** HTML: `<auro-` tag completion, attribute completion, hover shows
      slots/events/methods/CSS parts (vanilla app, `.html`)
- [ ] **M2-2** React: typed `<auro-button` intrinsic completion, prop-type hover, a
      wrong-prop **type error** (react app, `.tsx`)
- [ ] **M2-3** Svelte: element completion with typed props/events (svelte app,
      `.svelte`, Svelte extension)
- [ ] **M2-4** custom-registered tags in the editor: `--prefix myapp-` completes under
      `myapp-*` in all three; existing `legacy-input` registration honored
- [ ] **M2-5** real-TTY per-target prompt (detected defaults, answers persist, re-run
      silent, CI default no-prompt/no-fail)
- [ ] **M2-6** live smoke: real commented `settings.json` / `tsconfig.json` preserved
      and the server still activates
- [ ] **M2-7** CSS `::part()` snippet: `auro-input::part` expands to the part-name
      choice in `.css`/`.scss`/`.less` (resolved tag honored; Svelte `:global(...)`
      caveat noted; auto-discovered, no `settings.json`)
- [ ] Editor + versions recorded (VS Code build, Svelte extension version, React /
      TypeScript versions), plus CLI SHA, Node, OS

---

### CEM contract enforcement — `auro cem-check [path]` (layer 1)

The keystone of the [CEM contract-enforcement effort](../docs/cem-contract-enforcement.md):
an executable that validates a component's `custom-elements.json` against the
contract auro-cli's editor-type generation depends on. It exists to convert the
generators' **silent** defensive pruning (nameless members, unbalanced `type.text`,
private reflections — dropped without a word in
[manifest.ts](../src/init/editors/manifest.ts)) into a **producer-visible signal**,
so a component team learns at PR time that a CEM change broke the editor tooling.

It checks the CEM two complementary ways:

- **Static rules** ([rules.ts](../src/init/cem-check/rules.ts)) read the raw
  declarations and *report* what the prune would silently drop, reusing the exact
  same predicates so the check and the prune can never disagree.
- **Generation smoke** ([smoke.ts](../src/init/cem-check/smoke.ts)) runs the real
  editor-type builders (`buildJsxTypes` / `buildSvelteTypes`) plus the project-pinned
  `tsc --noEmit` against the CEM — the authoritative consumer-path check that catches
  breaks the static rules can't foresee (e.g. a balanced-but-unresolvable `type.text`).

**Rules and severities:**

| Rule | Severity | Fires when |
| --- | --- | --- |
| `name-required` | **error** | a registered declaration, or any member/attribute/slot/event/cssPart/cssProperty, has a non-string `name` |
| `type-parseable` | **error** | a non-empty `type.text` has unbalanced `()[]{}<>` delimiters (the generated `.d.ts` would not parse) |
| `type-not-typescript` | **error** | a `type.text` contains a JS/JSDoc spelling that is not valid TS — a lowercase primitive (`array`, `function`) or a bare generic missing its type argument (`Array`, `Promise`, `Map`, …), matched as a whole word inside the type (so `Array \| null`, `string \| array`) after string literals are ignored |
| `generation-smoke` | **error** | the real builders' output fails to type-check under `tsc` |
| `generation-build` | **error** | a builder throws while generating types for the CEM |
| `schema-version` | warn | `manifest.schemaVersion` is missing |
| `type-imprecise` | warn | a whole-string `type.text` is a valid but uninformative object type (`object`/`Object`) — it compiles, but exposes no properties so nothing completes |
| `enumerated-union` | warn | a conventionally-enumerated attr (`variant`/`shape`/`size`/`type`/`appearance`) is typed as bare `"string"` |
| `private-reflection` | warn | an undescribed, private-backed reflected attribute would be pruned |

**Exit-code contract:** `0` when there are no `error`-severity findings; `1` when
there is ≥1 error, or — under `--strict` — ≥1 warning. Warnings alone never fail
without `--strict`.

**Path argument:** optional — defaults to `custom-elements.json` in the directory the
command runs from, so `auro cem-check` with no argument checks the CEM at a component
repo's root. Pass an explicit path to check a CEM elsewhere. A missing/unreadable
target exits 1 before any rule runs.

**Flags:**

- `--json` — emit the findings array to **stdout** as JSON (human text otherwise goes
  to **stderr**, so stdout stays machine-parseable for the `/auro` pr/code-review
  skills). Exit code is unchanged.
- `--strict` — promote warnings to failures (any finding then exits 1).

#### Manual smoke

Run against the globally installed local package (Step 3 above). No network needed —
the generation smoke stubs every import and uses the pinned `tsc`.

```bash
# 1. A clean CEM → exit 0, "CEM contract clean".
cat > /tmp/clean.json <<'JSON'
{"schemaVersion":"1.0.0","modules":[{"kind":"javascript-module","path":"x.js",
"declarations":[{"kind":"class","name":"AuroButton","tagName":"auro-button",
"customElement":true,"attributes":[{"name":"label","type":{"text":"string"}}],
"slots":[],"events":[]}],"exports":[{"kind":"custom-element-definition",
"name":"auro-button","declaration":{"name":"AuroButton"}}]}]}
JSON
auro cem-check /tmp/clean.json ; echo "exit=$?"

# 2. A hand-broken CEM (nameless member + truncated type.text) → exit 1, both errors.
cat > /tmp/broken.json <<'JSON'
{"schemaVersion":"1.0.0","modules":[{"kind":"javascript-module","path":"x.js",
"declarations":[{"kind":"class","name":"AuroBad","tagName":"auro-bad",
"customElement":true,"members":[{"kind":"field","type":{"text":"string"}}],
"attributes":[{"name":"config","type":{"text":"Object<key"}}],"slots":[],
"events":[]}],"exports":[{"kind":"custom-element-definition","name":"auro-bad",
"declaration":{"name":"AuroBad"}}]}]}
JSON
auro cem-check /tmp/broken.json ; echo "exit=$?"

# 3. Machine-readable: stdout is a parseable JSON array; human text stays on stderr.
auro cem-check /tmp/broken.json --json 2>/dev/null | node -e \
  'process.stdin.pipe(require("stream").Writable({write(c,e,cb){this.b=(this.b||"")+c;cb()},final(cb){console.log("rules:",JSON.parse(this.b).map(f=>f.rule).join(","));cb()}}))'

# 4. --strict turns a warn-only CEM into a failure.
cat > /tmp/warn.json <<'JSON'
{"schemaVersion":"1.0.0","modules":[{"kind":"javascript-module","path":"x.js",
"declarations":[{"kind":"class","name":"AuroButton","tagName":"auro-button",
"customElement":true,"attributes":[{"name":"variant","type":{"text":"string"}}],
"slots":[],"events":[]}],"exports":[{"kind":"custom-element-definition",
"name":"auro-button","declaration":{"name":"AuroButton"}}]}]}
JSON
auro cem-check /tmp/warn.json          ; echo "warn exit=$?"   # exit 0, ⚠ enumerated-union
auro cem-check /tmp/warn.json --strict ; echo "strict exit=$?" # exit 1

# 5. Default path: with no argument it checks ./custom-elements.json in the cwd.
mkdir -p /tmp/cc-root && cp /tmp/clean.json /tmp/cc-root/custom-elements.json
( cd /tmp/cc-root && auro cem-check ; echo "default exit=$?" )        # exit 0
( cd /tmp && auro cem-check ; echo "missing exit=$?" )                # exit 1, ENOENT

# 5. Help lists the flags.
auro cem-check --help
```

- **Expect (1):** `✔ CEM contract clean — no violations.`, `exit=0`.
- **Expect (2):** `✖ CEM contract failed — 2 errors, 0 warnings.`, then a
  `[name-required]` line and a `[type-parseable]` line; `exit=1`.
- **Expect (3):** `rules: name-required,type-parseable` (stdout was valid JSON).
- **Expect (4):** `warn exit=0` with a `⚠ [enumerated-union]` line; `strict exit=1`.
- **Expect (5):** usage shows `<path>`, `--json`, and `--strict`.

#### Sign-off checklist (`auro cem-check`)

**Automated — `npm test` covers the contract:**

- [ ] `npm test` passes — the command tests
      ([cem-check.command.test.ts](cem-check.command.test.ts): clean exit 0; nameless
      member and unbalanced `type.text` each exit 1; enumerated bare-`string` warns
      but exits 0; `--strict` flips it to exit 1; `--json` stdout parses; unreadable
      path exits 1) and the generation-smoke tests
      ([cem-check.smoke.test.ts](cem-check.smoke.test.ts): clean set compiles;
      empty set is a no-op; a balanced-but-unresolvable `type.text` fails the smoke)

**Manual pass — only what automation can't reach (the packed/global bin end-to-end):**

- [ ] `auro cem-check --help` lists `<path>`, `--json`, `--strict`
- [ ] Steps 1–5 above produce the expected exit codes and output from the
      packed/global install
- [ ] Optional: run against a real published `custom-elements.json` (e.g. from an
      installed `@aurodesignsystem/*` package) → exit 0, no violations
- [ ] CLI SHA, packed version, Node, OS recorded

---

### Milestones pending (to be expanded later)

- **PT-M3…M4 — `auro init`** downstream tooling and later surfaces: test sections
  will be added to this document as each milestone lands under AB#1628539.
