// Diagnostic: confirm GH_TOKEN and ADO_TOKEN in .env (or shell env) are
// valid and have the right scopes for the auro-cli version-bot commands.
//
// Read-only — no work items are created, no GitHub state changes.
// Token VALUES are never printed; only the API responses' non-secret
// metadata (your GitHub login, the ADO project name, the work item type
// list) is shown.
//
// Usage:
//   npm run check-tokens
import "dotenv/config";

const ADO_ORG = "itsals";
const ADO_PROJECT = "E_Retain_Content";

async function checkGhToken() {
  const token = process.env.GH_TOKEN;
  if (!token) {
    return { ok: false, message: "GH_TOKEN not set in .env or shell env" };
  }
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "auro-cli-token-check",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `${res.status} ${res.statusText} — ${body.slice(0, 120)}`,
      };
    }
    const body = await res.json();
    const scopes =
      res.headers.get("x-oauth-scopes") ?? "(scopes header missing)";
    return {
      ok: true,
      message: `valid as ${body.login} — scopes: ${scopes}`,
    };
  } catch (err) {
    return { ok: false, message: `network error: ${err}` };
  }
}

async function checkAdoToken() {
  const token = process.env.ADO_TOKEN;
  if (!token) {
    return { ok: false, message: "ADO_TOKEN not set in .env or shell env" };
  }
  const auth = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
  const url =
    `https://dev.azure.com/${ADO_ORG}` +
    `/${encodeURIComponent(ADO_PROJECT)}` +
    "/_apis/wit/workitemtypes?api-version=7.1";
  try {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) {
      const body = await res.text();
      const hint =
        res.status === 401
          ? " — token rejected (expired or wrong org?)"
          : res.status === 203
            ? " — auth required (PAT may be missing Work Items scope)"
            : "";
      return {
        ok: false,
        message: `${res.status} ${res.statusText}${hint} — ${body.slice(0, 120)}`,
      };
    }
    const body = await res.json();
    const types = body.value?.map((t) => t.name) ?? [];
    const hasUserStory = types.includes("User Story");
    return {
      ok: true,
      message:
        `valid against ${ADO_ORG}/${ADO_PROJECT} — ` +
        `${types.length} work item types found, User Story scope: ${hasUserStory ? "yes" : "no"}`,
    };
  } catch (err) {
    return { ok: false, message: `network error: ${err}` };
  }
}

(async () => {
  console.log("Checking auro-cli tokens...\n");

  const gh = await checkGhToken();
  console.log(`GH_TOKEN:  ${gh.ok ? "✓" : "✗"} ${gh.message}`);

  const ado = await checkAdoToken();
  console.log(`ADO_TOKEN: ${ado.ok ? "✓" : "✗"} ${ado.message}`);

  console.log("");
  if (gh.ok && ado.ok) {
    console.log("All tokens valid. Safe to run dry-run scenarios.");
    console.log(
      "When ready for a real ticket, use: --apply --limit 1 --repo <one-safe-repo>",
    );
  } else {
    console.log("One or more tokens failed. Check .env values and PAT scopes.");
    process.exit(1);
  }
})();
