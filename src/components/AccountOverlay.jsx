import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, Mail, Save, Link2, Link2Off, Trash2, LogOut, FolderOpen, Check } from 'lucide-react';
import { ModalShell, Button } from './ui';
import { cloud, sharedUrl } from '../cloud.js';

const when = (t) => {
    const d = new Date(t), today = new Date();
    return d.toDateString() === today.toDateString()
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

/**
 * The optional account: sign in by mailed link, then save the board, open saved circuits and
 * share them with a short link. `current` is the saved circuit the board came from (or null).
 */
export function AccountOverlay({ isOpen, onClose, account, setAccount, current, setCurrent, hasBoard, getBoardData, onOpenCircuit }) {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [list, setList] = useState(null);
    const [name, setName] = useState('');
    const [confirm, setConfirm] = useState(null); // circuit id | 'account'
    const [copied, setCopied] = useState(null);

    const run = useCallback(async (fn) => {
        setBusy(true); setError(null);
        try { return await fn(); } catch (err) {
            if (err.code === 'SIGNED_OUT') setAccount(null);
            setError(err.message);
        } finally { setBusy(false); }
    }, [setAccount]);

    const refresh = useCallback(() => run(async () => setList(await cloud.list())), [run]);
    useEffect(() => {
        if (isOpen && account) refresh();
        if (isOpen) { setConfirm(null); setError(null); setName(current?.name || ''); }
    }, [isOpen, account, refresh, current]);

    if (!isOpen) return null;

    const requestLink = (e) => {
        e.preventDefault();
        run(async () => { await cloud.requestLink(email); setSent(email.trim()); });
    };

    const save = (asNew) => run(async () => {
        const data = getBoardData();
        const n = name.trim() || 'Untitled';
        const c = current && !asNew ? await cloud.update(current.id, { name: n, data }) : await cloud.create(n, data);
        setCurrent({ id: c.id, name: c.name });
        setName(c.name);
        await refresh();
    });

    const copyLink = async (slug, id) => {
        try { await navigator.clipboard.writeText(sharedUrl(slug)); setCopied(id); setTimeout(() => setCopied(c => (c === id ? null : c)), 1800); }
        catch { setError('Copy failed. The link is ' + sharedUrl(slug)); }
    };
    const share = (c) => run(async () => {
        const s = await cloud.share(c.id);
        await refresh();
        await copyLink(s.share, c.id);
    });
    const unshare = (c) => run(async () => { await cloud.unshare(c.id); await refresh(); });
    const remove = (c) => run(async () => {
        await cloud.remove(c.id);
        if (current?.id === c.id) setCurrent(null);
        setConfirm(null);
        await refresh();
    });
    const open = (c) => run(async () => { const full = await cloud.get(c.id); onOpenCircuit(full); onClose(); });
    const logout = () => run(async () => { await cloud.logout(); setAccount(null); setList(null); setCurrent(null); });
    const deleteAccount = () => run(async () => { await cloud.deleteAccount(); setAccount(null); setList(null); setCurrent(null); setConfirm(null); });

    return (
        <ModalShell isOpen onClose={onClose} maxWidth="560px" ariaLabel="Account" className="acc-modal">
            <ModalShell.Header title={account ? 'My circuits' : 'Save & share'} icon={<Cloud size={18} />} onClose={onClose}>
                {account && <span className="acc-email" title={account.email}>{account.email}</span>}
            </ModalShell.Header>
            <ModalShell.Body className="acc-body">
                {!account ? (
                    sent ? (
                        <div className="acc-sent">
                            <Mail size={28} />
                            <p>We sent a sign-in link to <b>{sent}</b>.</p>
                            <p className="acc-hint">Open it in this browser to sign in here. It works once and for 20 minutes.</p>
                            <Button variant="ghost" size="sm" onClick={() => setSent(null)}>Use another address</Button>
                        </div>
                    ) : (
                        <form className="acc-signin" onSubmit={requestLink}>
                            <p>Keep your circuits on boardroute.com and share them with a short link. No password: we mail you a link to sign in.</p>
                            <div className="acc-row">
                                <input className="acc-input" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email address" />
                                <Button type="submit" variant="primary" disabled={busy || !email.trim()} icon={<Mail size={15} />}>Send link</Button>
                            </div>
                            <p className="acc-hint">Without an account everything works as before; the board stays in this browser. <a href="/privacy/" target="_blank" rel="noopener">Privacy</a></p>
                        </form>
                    )
                ) : (
                    <>
                        <form className="acc-save" onSubmit={e => { e.preventDefault(); save(false); }}>
                            <input className="acc-input" value={name} onChange={e => setName(e.target.value)} placeholder="Name of this circuit" maxLength={100} aria-label="Circuit name" />
                            <Button type="submit" variant="primary" disabled={busy || !hasBoard} icon={<Save size={15} />}>{current ? 'Save' : 'Save board'}</Button>
                            {current && <Button variant="secondary" disabled={busy || !hasBoard} onClick={() => save(true)}>Save as new</Button>}
                        </form>
                        {current && <p className="acc-hint acc-current">The board is <b>{current.name}</b>; Save overwrites it.</p>}
                        <div className="acc-list">
                            {list === null ? <p className="acc-hint">Loading…</p>
                                : !list.length ? <p className="acc-hint">Nothing saved yet.</p>
                                    : list.map(c => (
                                        <div key={c.id} className={`acc-item ${current?.id === c.id ? 'current' : ''}`}>
                                            <button className="acc-open" onClick={() => open(c)} disabled={busy} title="Open on the board">
                                                <FolderOpen size={15} />
                                                <span className="acc-name">{c.name}</span>
                                                <span className="acc-meta">{when(c.updated)}</span>
                                            </button>
                                            {confirm === c.id ? (
                                                <span className="acc-actions">
                                                    <Button size="sm" variant="danger" onClick={() => remove(c)} disabled={busy}>Delete</Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Keep</Button>
                                                </span>
                                            ) : (
                                                <span className="acc-actions">
                                                    {c.share ? <>
                                                        <Button size="sm" variant="accent" onClick={() => copyLink(c.share, c.id)} icon={copied === c.id ? <Check size={14} /> : <Link2 size={14} />}>{copied === c.id ? 'Copied' : 'Link'}</Button>
                                                        <button className="acc-icon" onClick={() => unshare(c)} disabled={busy} title="Stop sharing: the link stops working" aria-label="Stop sharing"><Link2Off size={15} /></button>
                                                    </> : <Button size="sm" variant="secondary" onClick={() => share(c)} disabled={busy} icon={<Link2 size={14} />} title="Make a link anyone can open (it shows the latest saved version)">Share</Button>}
                                                    <button className="acc-icon" onClick={() => setConfirm(c.id)} disabled={busy} title="Delete" aria-label="Delete"><Trash2 size={15} /></button>
                                                </span>
                                            )}
                                        </div>
                                    ))}
                        </div>
                    </>
                )}
                {error && <p className="acc-error" role="alert">{error}</p>}
            </ModalShell.Body>
            {account && (
                <ModalShell.Footer align="between">
                    {confirm === 'account' ? <>
                        <span className="acc-hint">Delete the account and all saved circuits? Shared links stop working.</span>
                        <span className="acc-actions">
                            <Button size="sm" variant="danger" onClick={deleteAccount} disabled={busy}>Delete all</Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Keep</Button>
                        </span>
                    </> : <>
                        <Button size="sm" variant="ghost" onClick={() => setConfirm('account')}>Delete account</Button>
                        <Button size="sm" variant="secondary" onClick={logout} disabled={busy} icon={<LogOut size={14} />}>Sign out</Button>
                    </>}
                </ModalShell.Footer>
            )}
        </ModalShell>
    );
}
