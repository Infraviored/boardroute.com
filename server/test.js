import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDb } from './db.js';
import { createApp, LIMITS, limiter, isPrivateIp, clientIp } from './app.js';
import { signInMail } from './mail.js';

const ORIGIN = 'https://boardroute.com';
let clock = 1_000_000;

async function setup() {
    const mails = [];
    const app = createApp({ db: openDb(':memory:'), send: async (m) => { mails.push(m); }, signInMail, origin: ORIGIN, now: () => clock });
    const srv = createServer(app.handle);
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    let cookie = '';
    const call = async (method, path, body, headers = {}) => {
        const h = {
            ...(method !== 'GET' ? { Origin: ORIGIN } : {}),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
        };
        for (const k of Object.keys(h)) {
            if (h[k] === undefined) delete h[k];
        }
        const res = await fetch(base + path, {
            method,
            headers: h,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const sets = res.headers.getSetCookie ? res.headers.getSetCookie() : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
        for (const s of sets) {
            const first = s.split(';')[0].trim();
            const eq = first.indexOf('=');
            if (eq > 0) {
                const name = first.slice(0, eq), val = first.slice(eq + 1);
                if (!val || s.includes('Max-Age=0')) {
                    if (cookie.startsWith(name + '=')) cookie = '';
                } else {
                    cookie = first;
                }
            }
        }
        const set = res.headers.get('set-cookie');
        return { status: res.status, json: await res.json(), set };
    };
    const signIn = async (email) => {
        await call('POST', '/api/auth/request', { email });
        const t = mails.at(-1).text.match(/#signin=([\w-]+)/)[1];
        return call('POST', '/api/auth/verify', { token: t });
    };
    return { call, signIn, mails, close: () => srv.close(), setCookie: (c) => { cookie = c; }, getCookie: () => cookie };
}

const circuit = { components: [{ id: 'R1', pins: [] }], wires: [] };

test('sign in by link, once, then signed in', async () => {
    const s = await setup();
    const r = await s.call('POST', '/api/auth/request', { email: ' Flo@Example.com ' });
    assert.equal(r.status, 200);
    assert.equal(s.mails[0].to, 'flo@example.com');
    const t = s.mails[0].text.match(/#signin=([\w-]+)/)[1];
    assert.ok(s.mails[0].html.includes(t));
    const v = await s.call('POST', '/api/auth/verify', { token: t });
    assert.equal(v.status, 200);
    assert.equal(v.json.email, 'flo@example.com');
    assert.match(v.set, /__Host-br_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
    assert.equal((await s.call('GET', '/api/me')).json.email, 'flo@example.com');
    // the link works once
    s.setCookie('');
    assert.equal((await s.call('POST', '/api/auth/verify', { token: t })).status, 400);
    assert.equal((await s.call('GET', '/api/me')).status, 401);
    s.close();
});

test('login CSRF: sign-in token bound to requesting browser nonce cookie', async () => {
    const s = await setup();
    const r = await s.call('POST', '/api/auth/request', { email: 'flo@example.com' });
    assert.equal(r.status, 200);
    const t = s.mails.at(-1).text.match(/#signin=([\w-]+)/)[1];
    const signinCookie = s.getCookie();

    // 1. verify without cookie fails
    const noCookie = await s.call('POST', '/api/auth/verify', { token: t }, { Cookie: '' });
    assert.equal(noCookie.status, 400);
    assert.equal(noCookie.json.error, 'BROWSER_MISMATCH');

    // 2. verify with wrong cookie fails
    const wrongCookie = await s.call('POST', '/api/auth/verify', { token: t }, { Cookie: '__Host-br_signin=wrongnonce' });
    assert.equal(wrongCookie.status, 400);
    assert.equal(wrongCookie.json.error, 'BROWSER_MISMATCH');

    // 3. verify with right cookie succeeds
    const rightCookie = await s.call('POST', '/api/auth/verify', { token: t }, { Cookie: signinCookie });
    assert.equal(rightCookie.status, 200);
    assert.equal(rightCookie.json.email, 'flo@example.com');
    assert.match(rightCookie.set, /__Host-br_signin=;.*Max-Age=0/);

    s.close();
});

test('an expired link is refused', async () => {
    const s = await setup();
    await s.call('POST', '/api/auth/request', { email: 'a@b.de' });
    const t = s.mails[0].text.match(/#signin=([\w-]+)/)[1];
    clock += LIMITS.linkMs + 1;
    assert.equal((await s.call('POST', '/api/auth/verify', { token: t })).json.error, 'LINK_INVALID');
    s.close();
});

test('bad addresses and too many requests', async () => {
    const s = await setup();
    assert.equal((await s.call('POST', '/api/auth/request', { email: 'nope' })).status, 400);
    for (let i = 0; i < 3; i++) assert.equal((await s.call('POST', '/api/auth/request', { email: 'x@y.de' })).status, 200);
    assert.equal((await s.call('POST', '/api/auth/request', { email: 'x@y.de' })).status, 429);
    s.close();
});

test('save, list, update, delete; only your own', async () => {
    const s = await setup();
    await s.signIn('one@x.de');
    const c = (await s.call('POST', '/api/circuits', { name: 'Blinker', data: circuit })).json;
    assert.equal(c.name, 'Blinker');
    assert.equal((await s.call('GET', '/api/circuits')).json.circuits.length, 1);
    assert.deepEqual((await s.call('GET', `/api/circuits/${c.id}`)).json.data, circuit);
    const u = await s.call('PUT', `/api/circuits/${c.id}`, { name: 'Blinker 2', data: { ...circuit, wires: [{ a: 1 }] } });
    assert.equal(u.json.name, 'Blinker 2');
    assert.equal((await s.call('POST', '/api/circuits', { name: 'x', data: { nope: 1 } })).json.error, 'BAD_CIRCUIT');
    // someone else sees nothing of it
    const mine = s.getCookie();
    await s.signIn('two@x.de');
    assert.equal((await s.call('GET', '/api/circuits')).json.circuits.length, 0);
    assert.equal((await s.call('GET', `/api/circuits/${c.id}`)).status, 404);
    assert.equal((await s.call('DELETE', `/api/circuits/${c.id}`)).status, 404);
    s.setCookie(mine);
    assert.equal((await s.call('DELETE', `/api/circuits/${c.id}`)).status, 200);
    assert.equal((await s.call('GET', '/api/circuits')).json.circuits.length, 0);
    s.close();
});

test('share: public read by link, unshare ends it', async () => {
    const s = await setup();
    await s.signIn('one@x.de');
    const c = (await s.call('POST', '/api/circuits', { name: 'Dimmer', data: circuit })).json;
    const sh = (await s.call('POST', `/api/circuits/${c.id}/share`)).json.share;
    assert.ok(sh);
    s.setCookie('');
    const pub = await s.call('GET', `/api/shared/${sh}`);
    assert.equal(pub.json.name, 'Dimmer');
    assert.deepEqual(pub.json.data, circuit);
    await s.signIn('one@x.de');
    await s.call('DELETE', `/api/circuits/${c.id}/share`);
    assert.equal((await s.call('GET', `/api/shared/${sh}`)).status, 404);
    s.close();
});

test('CSRF: foreign or missing origin and non-JSON bodies are refused', async () => {
    const s = await setup();
    await s.signIn('one@x.de');
    assert.equal((await s.call('POST', '/api/circuits', { data: circuit }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await s.call('POST', '/api/circuits', { data: circuit }, { Origin: undefined })).status, 403);
    assert.equal((await s.call('POST', '/api/circuits', { data: circuit }, { Origin: ORIGIN })).status, 200);
    assert.equal((await s.call('POST', '/api/circuits', { data: circuit }, { 'Content-Type': 'text/plain' })).status, 415);
    s.close();
});

test('cookies: malformed percent-encoding is skipped rather than throwing', async () => {
    const s = await setup();
    await s.signIn('one@x.de');
    const validCookie = s.getCookie();
    const r = await s.call('GET', '/api/me', undefined, { Cookie: `malformed=%ZZ; ${validCookie}` });
    assert.equal(r.status, 200);
    assert.equal(r.json.email, 'one@x.de');
    s.close();
});

test('body: non-object JSON bodies return 400 BAD_JSON', async () => {
    const s = await setup();
    for (const badBody of [null, [1, 2], 'just a string', 42, true]) {
        const r = await s.call('POST', '/api/auth/request', badBody);
        assert.equal(r.status, 400);
        assert.equal(r.json.error, 'BAD_JSON');
    }
    s.close();
});

test('body: oversized body returns 413 TOO_LARGE cleanly', async () => {
    const s = await setup();
    await s.signIn('one@x.de');
    const huge = { components: [], pad: 'x'.repeat(LIMITS.bodyBytes + 1024) };
    const r = await s.call('POST', '/api/circuits', huge);
    assert.equal(r.status, 413);
    assert.equal(r.json.error, 'TOO_LARGE');
    s.close();
});

test('limiter: prunes expired keys and refuses new keys at cap without clearing existing keys', () => {
    let now = 1000;
    const l = limiter(2, 500, () => now, 2);
    assert.ok(l('key1'));
    assert.ok(l('key2'));
    assert.equal(l('key3'), false);
    assert.ok(l('key1'));
    assert.equal(l('key1'), false);
    now += 600;
    assert.ok(l('key3'));
});

test('clientIp: only trusts X-Real-IP from private/docker/loopback peers', () => {
    assert.ok(isPrivateIp('127.0.0.1'));
    assert.ok(isPrivateIp('::1'));
    assert.ok(isPrivateIp('::ffff:127.0.0.1'));
    assert.ok(isPrivateIp('10.1.2.3'));
    assert.ok(isPrivateIp('172.17.0.2'));
    assert.ok(isPrivateIp('172.31.255.1'));
    assert.ok(isPrivateIp('192.168.1.100'));
    assert.ok(!isPrivateIp('172.32.0.1'));
    assert.ok(!isPrivateIp('8.8.8.8'));
    assert.ok(!isPrivateIp('203.0.113.195'));

    const trustedReq = { socket: { remoteAddress: '172.17.0.2' }, headers: { 'x-real-ip': '203.0.113.50' } };
    assert.equal(clientIp(trustedReq), '203.0.113.50');

    const untrustedReq = { socket: { remoteAddress: '203.0.113.195' }, headers: { 'x-real-ip': '1.2.3.4' } };
    assert.equal(clientIp(untrustedReq), '203.0.113.195');
});

test('logout and account deletion', async () => {
    const s = await setup();
    await s.signIn('one@x.de');
    const c = (await s.call('POST', '/api/circuits', { name: 'A', data: circuit })).json;
    const sh = (await s.call('POST', `/api/circuits/${c.id}/share`)).json.share;
    const cookie = s.getCookie();
    await s.call('POST', '/api/auth/logout');
    s.setCookie(cookie);
    assert.equal((await s.call('GET', '/api/me')).status, 401);
    await s.signIn('one@x.de');
    assert.equal((await s.call('DELETE', '/api/me')).status, 200);
    assert.equal((await s.call('GET', `/api/shared/${sh}`)).status, 404);
    await s.signIn('one@x.de');
    assert.equal((await s.call('GET', '/api/circuits')).json.circuits.length, 0);
    s.close();
});

test('size limits', async () => {
    const s = await setup();
    await s.signIn('one@x.de');
    const big = { components: [], pad: 'x'.repeat(LIMITS.circuitBytes) };
    assert.equal((await s.call('POST', '/api/circuits', { data: big })).status, 413);
    s.close();
});

