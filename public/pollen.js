// Pollinations BYOP for a static page, using OAuth authorization code + PKCE.
const ENTER = "https://enter.pollinations.ai";
const GEN = "https://gen.pollinations.ai";
const SESSION = "pollen.session";
const PENDING = "pollen.pending";
const DAY_MS = 86_400_000;
const AUTH_WINDOW_MS = 15 * 60_000;
const MODEL = "openai/gpt-5.4-nano";
const configuredClientId = () => globalThis.document?.querySelector('meta[name="pollinations-client-id"]')?.content.trim() ?? "";

export class PollenError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "PollenError";
    this.status = status;
  }
}

export function appUrl(href = location.href) {
  return new URL("./", href).href;
}

const randomToken = (byteLength = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
};

export async function createPkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildAuthorizeUrl({ redirectUri, state, codeChallenge, clientId = configuredClientId() }) {
  if (!clientId) throw new PollenError("Pollinations sign-in is not configured. Register this app and add its Pollinations App Key.");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${ENTER}/authorize?${params}`;
}

export function readCallback(search, expectedState) {
  const params = new URLSearchParams(search);
  if (params.has("error")) return { status: "denied" };
  if (!params.has("code")) return { status: "none" };
  if (!expectedState || params.get("state") !== expectedState) return { status: "bad-state" };
  const code = params.get("code");
  if (!code || code.length > 2048) return { status: "bad-code" };
  return { status: "ok", code };
}

export function getSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION) || "null");
    if (/^sk_\S{8,}$/.test(session?.key ?? "") && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now()) return session;
  } catch {}
  clearSession();
  return null;
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION);
  } catch {}
}

export async function startSignIn() {
  const state = randomToken(16);
  const verifier = randomToken();
  const codeChallenge = await createPkceChallenge(verifier);
  const redirectUri = appUrl();
  sessionStorage.setItem(PENDING, JSON.stringify({ state, verifier, redirectUri, expiresAt: Date.now() + AUTH_WINDOW_MS }));
  location.assign(buildAuthorizeUrl({ redirectUri, state, codeChallenge }));
}

// Call on page load. Remove the one-use authorization code from the address bar before exchange.
export async function completeSignIn(search = location.search) {
  if (!new URLSearchParams(search).has("code") && !new URLSearchParams(search).has("error")) return null;
  let pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) || "null");
  } catch {}
  const callback = readCallback(search, pending?.state);
  try {
    history.replaceState(null, "", location.pathname + location.hash);
  } catch {}
  try {
    sessionStorage.removeItem(PENDING);
  } catch {}
  if (callback.status !== "ok") return callback.status;
  if (!pending?.verifier || !pending.redirectUri || pending.expiresAt <= Date.now()) return "expired";
  if (!configuredClientId()) return "not-configured";

  let response;
  try {
    response = await fetch(`${ENTER}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: callback.code,
        client_id: configuredClientId(),
        redirect_uri: pending.redirectUri,
        code_verifier: pending.verifier,
      }),
    });
  } catch {
    return "exchange-failed";
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !/^sk_\S{8,}$/.test(body?.access_token ?? "") || !Number.isFinite(body?.expires_in) || body.expires_in <= 0) return "exchange-failed";
  try {
    sessionStorage.setItem(SESSION, JSON.stringify({
      key: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    }));
  } catch {
    return "no-storage";
  }
  return "ok";
}

function parseJsonReply(content) {
  const cleaned = String(content ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new PollenError("Pollinations returned an unreadable team plan. Please try again.");
  }
}

export function parseCompanyPlan(content) {
  const plan = parseJsonReply(content);
  const rawAgents = Array.isArray(plan?.agents) ? plan.agents : [];
  const agents = (rawAgents.length ? rawAgents : (Array.isArray(plan?.jobs) ? plan.jobs.map(job => job?.agent) : []))
    .filter(agent => typeof agent === "string")
    .map(agent => agent.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 4);
  const jobs = (Array.isArray(plan?.jobs) ? plan.jobs : [])
    .filter(job => typeof job?.agent === "string" && rawAgents.includes(job.agent))
    .map((job, index) => ({
      id: `job-${Date.now()}-${index}`,
      agent: typeof job?.agent === "string" ? job.agent.trim().slice(0, 40) : "",
      title: typeof job?.title === "string" ? job.title.trim().slice(0, 100) : "",
      result: typeof job?.result === "string" ? job.result.trim().slice(0, 600) : "",
      status: "done",
    }))
    .filter(job => job.agent && job.title && job.result)
    .slice(0, 3);
  if (agents.length < 2 || jobs.length < 1) throw new PollenError("Pollinations returned an incomplete team plan. Please try again.");
  return { agents, jobs };
}

export function parseRun(content) {
  const parsed = parseJsonReply(content);
  const jobs = (Array.isArray(parsed?.jobs) ? parsed.jobs : [])
    .map((job, index) => ({
      id: `job-${Date.now()}-${index}`,
      agent: typeof job?.agent === "string" ? job.agent.trim().slice(0, 40) : "",
      title: typeof job?.title === "string" ? job.title.trim().slice(0, 100) : "",
      result: typeof job?.result === "string" ? job.result.trim().slice(0, 600) : "",
      status: "pending",
    }))
    .filter(job => job.agent && job.title && job.result)
    .slice(0, 5);
  if (!jobs.length) throw new PollenError("The team returned no finished work. Please try again.");
  return jobs;
}

async function requestCompletion(messages, { signal } = {}) {
  const session = getSession();
  if (!session) throw new PollenError("Connect Pollen and sign in to continue.", 401);
  let response;
  try {
    response = await fetch(`${GEN}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.key}` },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 700 }),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new PollenError("Could not reach Pollinations. Check your connection and try again.");
  }
  const body = await response.json().catch(() => ({}));
  if (response.ok) {
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) return content;
    throw new PollenError("Pollinations returned an empty response. Please try again.");
  }
  const detail = body?.error?.message ?? body?.message ?? `Request failed (${response.status})`;
  if (response.status === 401) {
    clearSession();
    throw new PollenError("Your Pollinations sign-in expired. Connect again to continue.", 401);
  }
  if (response.status === 402) throw new PollenError("Out of Pollen. Top up at enter.pollinations.ai.", 402);
  if (response.status === 403) throw new PollenError(`Pollinations denied this request: ${detail}`, 403);
  throw new PollenError(detail, response.status);
}

export async function generateCompanyPlan(name, brief, options) {
  const content = await requestCompletion([
    { role: "system", content: 'Create a small AI company team. Reply with JSON only: {"agents":["name",...],"jobs":[{"agent":"one listed agent","title":"short task","result":"finished, specific work"}]}. Include 2-4 agents and 1-3 completed example jobs. Never claim real-world actions happened.' },
    { role: "user", content: `Company: ${name}\nWhat it does: ${brief}` },
  ], options);
  return parseCompanyPlan(content);
}

export async function runCompany(company, options) {
  const content = await requestCompletion([
    { role: "system", content: `You run ${company.name}. ${company.brief}\nYour agents: ${(company.agents ?? []).join(", ")}. Produce 1-5 finished jobs as JSON only: {"jobs":[{"agent":"one listed agent","title":"short title","result":"specific completed work"}]}. Never claim real-world actions happened.` },
    { role: "user", content: "Run today's work. Give each job a concrete useful result." },
  ], options);
  return parseRun(content);
}
