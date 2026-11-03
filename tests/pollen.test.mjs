import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appUrl,
  buildAuthorizeUrl,
  completeSignIn,
  createPkceChallenge,
  getSession,
  parseCompanyPlan,
  parseRun,
  readCallback,
} from '../public/pollen.js';

const storage = () => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
};

test('creates an S256 PKCE challenge from a verifier', async () => {
  const challenge = await createPkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  assert.equal(challenge, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('builds an OAuth PKCE URL with the registered app key and callback', () => {
  assert.equal(appUrl('https://example.github.io/pollen-towers/index.html?x=1'), 'https://example.github.io/pollen-towers/');
  const url = new URL(buildAuthorizeUrl({
    redirectUri: 'https://example.github.io/pollen-towers/',
    state: 'csrf',
    codeChallenge: 'challenge',
    clientId: 'pk_test_app',
  }));
  assert.equal(url.origin, 'https://enter.pollinations.ai');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'pk_test_app');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.github.io/pollen-towers/');
  assert.equal(url.searchParams.get('state'), 'csrf');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.has('scope'), false);
});

test('fails clearly when Pollinations app registration is not configured', () => {
  assert.throws(() => buildAuthorizeUrl({ redirectUri: 'https://example.com/', state: 'csrf', codeChallenge: 'challenge', clientId: '' }), /not configured/);
});

test('validates success, denial, missing state, and malformed returned codes', () => {
  assert.deepEqual(readCallback('?code=one-time-code&state=ok', 'ok'), { status: 'ok', code: 'one-time-code' });
  assert.equal(readCallback('?error=access_denied&state=ok', 'ok').status, 'denied');
  assert.equal(readCallback('?code=one-time-code&state=wrong', 'ok').status, 'bad-state');
  assert.equal(readCallback(`?code=${'x'.repeat(2049)}&state=ok`, 'ok').status, 'bad-code');
  assert.equal(readCallback('', 'ok').status, 'none');
});

test('exchanges a validated callback and stores the short-lived token in tab storage', async () => {
  const original = {
    sessionStorage: globalThis.sessionStorage,
    location: globalThis.location,
    history: globalThis.history,
    fetch: globalThis.fetch,
    document: globalThis.document,
  };
  globalThis.sessionStorage = storage();
  globalThis.location = { search: '?code=one-time-code&state=expected', pathname: '/pollen/', hash: '#keep=1' };
  globalThis.history = { replaceState: (_state, _title, url) => { globalThis.location.replaced = url; } };
  globalThis.document = { querySelector: () => ({ content: 'pk_test_app' }) };
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: new URLSearchParams(options.body) };
    return { ok: true, json: async () => ({ access_token: 'sk_12345678', expires_in: 3600 }) };
  };
  try {
    sessionStorage.setItem('pollen.pending', JSON.stringify({ state: 'expected', verifier: 'verifier-string', redirectUri: 'https://example.github.io/pollen/', expiresAt: Date.now() + 60_000 }));
    assert.equal(await completeSignIn(), 'ok');
    assert.equal(location.replaced, '/pollen/#keep=1');
    assert.equal(sessionStorage.getItem('pollen.pending'), null);
    assert.equal(getSession().key, 'sk_12345678');
    assert.ok(getSession().expiresAt > Date.now());
    assert.equal(request.url, 'https://enter.pollinations.ai/api/oauth/token');
    assert.equal(request.body.get('code_verifier'), 'verifier-string');
    assert.equal(request.body.get('redirect_uri'), 'https://example.github.io/pollen/');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('rejects expired pending OAuth state before making an exchange request', async () => {
  const original = { sessionStorage: globalThis.sessionStorage, location: globalThis.location, history: globalThis.history, document: globalThis.document, fetch: globalThis.fetch };
  globalThis.sessionStorage = storage();
  globalThis.location = { search: '?code=one-time-code&state=expected', pathname: '/', hash: '' };
  globalThis.history = { replaceState() {} };
  globalThis.document = { querySelector: () => ({ content: 'pk_test_app' }) };
  globalThis.fetch = async () => { throw new Error('must not exchange'); };
  try {
    sessionStorage.setItem('pollen.pending', JSON.stringify({ state: 'expected', verifier: 'v', redirectUri: 'https://example.com/', expiresAt: 0 }));
    assert.equal(await completeSignIn(), 'expired');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('accepts a valid generated team plan and rejects incomplete replies', () => {
  const result = parseCompanyPlan(JSON.stringify({
    agents: ['Planner', 'Maker'],
    jobs: [{ agent: 'Planner', title: 'Map the work', result: 'A clear three-step plan.' }],
  }));
  assert.deepEqual(result.agents, ['Planner', 'Maker']);
  assert.equal(result.jobs[0].status, 'done');
  assert.equal(result.jobs[0].result, 'A clear three-step plan.');
  assert.throws(() => parseCompanyPlan('{not json'), /unreadable team plan/);
  assert.throws(() => parseCompanyPlan('{"agents":[],"jobs":[]}'), /incomplete team plan/);
});

test('parses finished work reports and rejects empty work', () => {
  const jobs = parseRun('```json\n{"jobs":[{"agent":"Builder","title":"Draft","result":"A useful first version."}]}\n```');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, 'pending');
  assert.throws(() => parseRun('{"jobs":[]}'), /no finished work/);
});
