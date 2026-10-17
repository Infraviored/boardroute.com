// The boardroute API: optional accounts that can only save circuits and share them.
//
// Sign-in is a link by mail, no password: POST /api/auth/request mails a one-time link
// (https://boardroute.com/#signin=<token>, 20 minutes); the page posts the token to
// /api/auth/verify and gets a session cookie. The token sits after '#', so it reaches neither
// server logs nor referrers, and mail scanners that open links can't use it up (only the page's
// POST does). An account is created on its first sign-in.
//
// CSRF: the session cookie is SameSite=Lax (not sent on cross-site POST/PUT/DELETE), and
// requests that change something must carry this site's Origin.
import { createHash, randomBytes } from 'node:crypto';

const MIN = 60e3, DAY = 24 * 60 * MIN;
export const LIMITS = {
    linkMs: 20 * MIN,
    sessionMs: 180 * DAY,
    bodyBytes: 4 << 20,     // a circuit with a few part photos
    circuitBytes: 3 << 20,
    userBytes: 50 << 20,
    circuits: 300,
    nameChars: 100,
};

const sha = (s) => createHash('sha256').update(s).digest('base64url');
const token = (bytes) => randomBytes(bytes).toString('base64url');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
    constructor(status, code) { super(code); this.status = status; this.code = code; }
}

// a few requests per key and window, in memory (a restart forgets it, that's fine)
export function limiter(max, windowMs, now, cap = 10000) {
    const hits = new Map();
    const prune = (t) => {
        const cutoff = t - windowMs;
        for (const [k, v] of hits) {
            const active = v.filter(x => x > cutoff);
            if (active.length === 0) hits.delete(k);
            else hits.set(k, active);
        }
    };
    return (key) => {
        const t = now(), cutoff = t - windowMs;
        let list = (hits.get(key) || []).filter(x => x > cutoff);
        if (list.length >= max) return false;
        if (!hits.has(key) && hits.size >= cap) {
            prune(t);
            if (hits.size >= cap) return false;
        }
        list.push(t);
        hits.set(key, list);
        return true;
    };
}

export function isPrivateIp(ip) {
    if (!ip) return false;
    const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    if (v4 === '::1' || ip === '::1') return true;
    const parts = v4.split('.').map(Number);
    if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
        const [a, b] = parts;
        if (a === 127) return true;                       // 127.0.0.0/8
        if (a === 10) return true;                        // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
        if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    }
    return false;
}

export function clientIp(req) {
    const peer = req.socket?.remoteAddress || '';
    if (isPrivateIp(peer) && req.headers['x-real-ip']) {
        const xReal = req.headers['x-real-ip'];
        const ip = typeof xReal === 'string' ? xReal.split(',')[0].trim() : '';
        if (ip) return ip;
    }
    return peer;
}

export function createApp({ db, send, signInMail, now = Date.now, origin = 'https://boardroute.com', secure = true }) {
    const cookieName = secure ? '__Host-br_session' : 'br_session';
    const perIp = limiter(10, 15 * MIN, now), perEmail = limiter(3, 15 * MIN, now);

    const q = {
        userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
        addUser: db.prepare('INSERT INTO users (email, created, last_login) VALUES (?, ?, ?)'),
        touchUser: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
        delUser: db.prepare('DELETE FROM users WHERE id = ?'),
        addToken: db.prepare('INSERT INTO login_tokens (hash, email, expires) VALUES (?, ?, ?)'),
        takeToken: db.prepare('DELETE FROM login_tokens WHERE hash = ? RETURNING email, expires'),
        addSession: db.prepare('INSERT INTO sessions (hash, user_id, created, expires) VALUES (?, ?, ?, ?)'),
        session: db.prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?'),
        delSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
        list: db.prepare('SELECT id, name, size, created, updated, share FROM circuits WHERE user_id = ? ORDER BY updated DESC'),
        usage: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM circuits WHERE user_id = ?'),
        get: db.prepare('SELECT * FROM circuits WHERE id = ? AND user_id = ?'),
        add: db.prepare('INSERT INTO circuits (id, user_id, name, data, size, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)'),
        update: db.prepare('UPDATE circuits SET name = ?, data = ?, size = ?, updated = ? WHERE id = ? AND user_id = ?'),
        del: db.prepare('DELETE FROM circuits WHERE id = ? AND user_id = ?'),
        setShare: db.prepare('UPDATE circuits SET share = ? WHERE id = ? AND user_id = ?'),
        shared: db.prepare('SELECT name, data, updated FROM circuits WHERE share = ?'),
    };

    const cleanup = () => {
        const t = now();
        db.prepare('DELETE FROM login_tokens WHERE expires <= ?').run(t);
        db.prepare('DELETE FROM sessions WHERE expires <= ?').run(t);
    };

    function cookies(req) {
        const out = {};
        for (const part of (req.headers.cookie || '').split(';')) {
            const i = part.indexOf('=');
            if (i > 0) {
                const k = part.slice(0, i).trim(), val = part.slice(i + 1).trim();
                try { out[k] = decodeURIComponent(val); } catch { /* skip malformed cookie */ }
            }
        }
        return out;
    }
    const setCookie = (res, value, maxAgeS) => res.setHeader('Set-Cookie',
        `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure ? '; Secure' : ''}`);

    function user(req) {
        const c = cookies(req)[cookieName];
        return c ? q.session.get(sha(c), now()) || null : null;
    }
    function needUser(req) {
        const u = user(req);
        if (!u) throw new HttpError(401, 'SIGNED_OUT');
        return u;
    }

    function body(req, res) {
        return new Promise((resolve, reject) => {
            if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reject(new HttpError(415, 'JSON_ONLY'));
            const chunks = [];
            let n = 0, tooLarge = false;
            req.on('data', (c) => {
                if (tooLarge) return;
                n += c.length;
                if (n > LIMITS.bodyBytes) {
                    tooLarge = true;
                    if (res && !res.headersSent) {
                        res.setHeader('Connection', 'close');
                        res.on('finish', () => req.destroy());
                    }
                    req.resume();
                    reject(new HttpError(413, 'TOO_LARGE'));
                    return;
                }
                chunks.push(c);
            });
            req.on('end', () => {
                if (tooLarge) return;
                try {
                    const raw = Buffer.concat(chunks).toString('utf8').trim() || '{}';
                    const val = JSON.parse(raw);
                    if (!val || typeof val !== 'object' || Array.isArray(val)) {
                        return reject(new HttpError(400, 'BAD_JSON'));
                    }
                    resolve(val);
                } catch {
                    reject(new HttpError(400, 'BAD_JSON'));
                }
            });
            req.on('error', (err) => {
                if (!tooLarge) reject(err);
            });
        });
    }

    const cleanName = (s) => (typeof s === 'string' ? s.trim().slice(0, LIMITS.nameChars) : '') || 'Untitled';
    function cleanData(d) {
        if (!d || typeof d !== 'object' || !Array.isArray(d.components)) throw new HttpError(400, 'BAD_CIRCUIT');
        const json = JSON.stringify(d), size = Buffer.byteLength(json);
        if (size > LIMITS.circuitBytes) throw new HttpError(413, 'TOO_LARGE');
        return { json, size };
    }
    function roomFor(u, size, replacing = 0) {
        const { n, bytes } = q.usage.get(u.id);
        if (!replacing && n >= LIMITS.circuits) throw new HttpError(409, 'TOO_MANY');
        if (bytes - replacing + size > LIMITS.userBytes) throw new HttpError(409, 'FULL');
    }
    const summary = (c) => ({ id: c.id, name: c.name, size: c.size, created: c.created, updated: c.updated, share: c.share || null });

    async function route(req, res, path) {
        const m = req.method;
        let p;

        if (m === 'POST' && path === '/api/auth/request') {
            const { email: raw } = await body(req, res);
            const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
            if (email.length > 254 || !EMAIL.test(email)) throw new HttpError(400, 'BAD_EMAIL');
            const ip = clientIp(req);
            if (!perIp(ip) || !perEmail(email)) throw new HttpError(429, 'SLOW_DOWN');
            const t = token(32);
            q.addToken.run(sha(t), email, now() + LIMITS.linkMs);
            try {
                await send({ to: email, ...signInMail(`${origin}/#signin=${t}`) });
            } catch (err) {
                console.error('sign-in mail', err.message);
                throw new HttpError(503, 'MAIL_FAILED');
            }
            return { ok: true };
        }

        if (m === 'POST' && path === '/api/auth/verify') {
            const { token: t } = await body(req, res);
            const row = typeof t === 'string' && t.length < 100 ? q.takeToken.get(sha(t)) : null;
            if (!row || row.expires <= now()) throw new HttpError(400, 'LINK_INVALID');
            let u = q.userByEmail.get(row.email);
            if (!u) { q.addUser.run(row.email, now(), now()); u = q.userByEmail.get(row.email); } else q.touchUser.run(now(), u.id);
            const s = token(32);
            q.addSession.run(sha(s), u.id, now(), now() + LIMITS.sessionMs);
            setCookie(res, s, Math.round(LIMITS.sessionMs / 1000));
            cleanup();
            return { email: u.email };
        }

        if (m === 'GET' && path === '/api/me') {
            const u = needUser(req), { n, bytes } = q.usage.get(u.id);
            return { email: u.email, circuits: n, bytes, limits: { circuits: LIMITS.circuits, bytes: LIMITS.userBytes } };
        }

        if (m === 'POST' && path === '/api/auth/logout') {
            const c = cookies(req)[cookieName];
            if (c) q.delSession.run(sha(c));
            setCookie(res, '', 0);
            return { ok: true };
        }

        if (m === 'DELETE' && path === '/api/me') {
            const u = needUser(req);
            q.delUser.run(u.id); // circuits and sessions go with it (ON DELETE CASCADE)
            setCookie(res, '', 0);
            return { ok: true };
        }

        if (path === '/api/circuits') {
            const u = needUser(req);
            if (m === 'GET') return { circuits: q.list.all(u.id).map(summary) };
            if (m === 'POST') {
                const b = await body(req, res), { json, size } = cleanData(b.data);
                roomFor(u, size);
                const id = token(9), t = now();
                q.add.run(id, u.id, cleanName(b.name), json, size, t, t);
                return summary(q.get.get(id, u.id));
            }
        }

        if ((p = path.match(/^\/api\/circuits\/([\w-]{1,40})$/))) {
            const u = needUser(req), c = q.get.get(p[1], u.id);
            if (!c) throw new HttpError(404, 'NOT_FOUND');
            if (m === 'GET') return { ...summary(c), data: JSON.parse(c.data) };
            if (m === 'PUT') {
                const b = await body(req, res);
                let json = c.data, size = c.size;
                if (b.data !== undefined) ({ json, size } = cleanData(b.data));
                roomFor(u, size, c.size);
                q.update.run(b.name !== undefined ? cleanName(b.name) : c.name, json, size, now(), c.id, u.id);
                return summary(q.get.get(c.id, u.id));
            }
            if (m === 'DELETE') { q.del.run(c.id, u.id); return { ok: true }; }
        }

        if ((p = path.match(/^\/api\/circuits\/([\w-]{1,40})\/share$/))) {
            const u = needUser(req), c = q.get.get(p[1], u.id);
            if (!c) throw new HttpError(404, 'NOT_FOUND');
            if (m === 'POST') {
                if (!c.share) q.setShare.run(token(9), c.id, u.id);
                return summary(q.get.get(c.id, u.id));
            }
            if (m === 'DELETE') { q.setShare.run(null, c.id, u.id); return summary(q.get.get(c.id, u.id)); }
        }

        if (m === 'GET' && (p = path.match(/^\/api\/shared\/([\w-]{1,40})$/))) {
            const c = q.shared.get(p[1]);
            if (!c) throw new HttpError(404, 'NOT_FOUND');
            return { name: c.name, updated: c.updated, data: JSON.parse(c.data) };
        }

        throw new HttpError(404, 'NO_SUCH_ROUTE');
    }

    async function handle(req, res) {
        const path = new URL(req.url, 'http://x').pathname;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
            if (req.method !== 'GET' && req.headers.origin !== origin) throw new HttpError(403, 'WRONG_ORIGIN');
            const out = await route(req, res, path);
            res.end(JSON.stringify(out));
        } catch (err) {
            const status = err instanceof HttpError ? err.status : 500;
            if (status === 500) console.error(err);
            res.statusCode = status;
            res.end(JSON.stringify({ error: err instanceof HttpError ? err.code : 'SERVER_ERROR' }));
        }
    }

    return { handle, cleanup };
}
