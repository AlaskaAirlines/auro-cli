# Manual Testing — Auro AI Tooling

Manual test plan for the **Auro AI Tooling** effort — the work that makes the
Auro Design System discoverable and usable by AI coding assistants. The effort is
delivered in phases (standalone grounding first, richer integrations such as MCP
later), each broken into milestones. This document grows one phase and milestone
at a time; every phase gets its own top-level section below.

**Currently covered:** [Phase 1 — Standalone Grounding (no MCP)](#phase-1--standalone-grounding-no-mcp-ab1628539)
(AB#1628539), specifically [PT-M0 — Land Tier 1 CLI primitives](#ab1628540--pt-m0-land-tier-1-cli-primitives)
(AB#1628540). Sections for PT-M1…M4 and later phases will be added as that work
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

### Milestones pending (to be expanded later)

- **PT-M1…M4 — `auro init`** and downstream tooling: test sections will be added
  to this document as each milestone lands under AB#1628539.
