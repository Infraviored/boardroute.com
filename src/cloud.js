// The optional account (server/app.js): sign in by mailed link, save circuits, share them.
// Everything else in the app works without it.

const MESSAGES = {
    BAD_EMAIL: 'That doesn\'t look like an email address.',
    SLOW_DOWN: 'Too many links asked for. Wait a few minutes, then try again.',
    MAIL_FAILED: 'The mail could not be sent. Try again later.',
    LINK_INVALID: 'This sign-in link is used up or expired. Ask for a new one.',
    SIGNED_OUT: 'You are signed out.',
    TOO_LARGE: 'This circuit is too large to save (part photos count too).',
    TOO_MANY: 'You have saved the most circuits there is room for. Delete some first.',
    FULL: 'Your storage is full. Delete some circuits first.',
    NOT_FOUND: 'This circuit doesn\'t exist (any more).',
};

async function api(method, path, body) {
    let res;
    try {
        res = await fetch(path, {
            method,
            credentials: 'same-origin',
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw Object.assign(new Error('No connection to boardroute.com.'), { code: 'OFFLINE' });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(MESSAGES[json.error] || `Something went wrong (${res.status}).`), { code: json.error, status: res.status });
    return json;
}

export const cloud = {
    me: () => api('GET', '/api/me').catch(err => { if (err.status === 401) return null; throw err; }),
    requestLink: (email) => api('POST', '/api/auth/request', { email }),
    verify: (token) => api('POST', '/api/auth/verify', { token }),
    logout: () => api('POST', '/api/auth/logout'),
    deleteAccount: () => api('DELETE', '/api/me'),
    list: () => api('GET', '/api/circuits').then(r => r.circuits),
    get: (id) => api('GET', `/api/circuits/${id}`),
    create: (name, data) => api('POST', '/api/circuits', { name, data }),
    update: (id, fields) => api('PUT', `/api/circuits/${id}`, fields),
    remove: (id) => api('DELETE', `/api/circuits/${id}`),
    share: (id) => api('POST', `/api/circuits/${id}/share`),
    unshare: (id) => api('DELETE', `/api/circuits/${id}/share`),
    shared: (slug) => api('GET', `/api/shared/${slug}`),
};

export const sharedUrl = (slug) => `${window.location.origin}/?c=${slug}`;
export const signInFromHash = (hash) => (/^#signin=([\w-]+)$/.exec(hash || '') || [])[1] || null;
