// node --test test.js: the whole API against an in-memory database and a mail stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDb } from './db.js';
import { createApp, LIMITS } from './app.js';
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
        const res = await fetch(base + path, {
            method,
            headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
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

test('CSRF: foreign origin and non-JSON bodies are refused', async () => {
    const s = await setup();
    await s.signIn('one@x.de');
    assert.equal((await s.call('POST', '/api/circuits', { data: circuit }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await s.call('POST', '/api/circuits', { data: circuit }, { Origin: ORIGIN })).status, 200);
    assert.equal((await s.call('POST', '/api/circuits', { data: circuit }, { 'Content-Type': 'text/plain' })).status, 415);
    s.close();
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
