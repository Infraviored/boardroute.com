// Mail through Brevo's SMTP relay (smtp-relay.brevo.com:587, the account's SMTP login in
// BOARDROUTE_SMTP_HOST/_PORT/_USER/_PASSWORD). Without it, outside production, a mail is written
// to the log instead, so the sign-in can be walked locally.
import nodemailer from 'nodemailer';

const env = process.env;
const configured = () => Boolean(env.BOARDROUTE_SMTP_HOST && env.BOARDROUTE_SMTP_USER && env.BOARDROUTE_SMTP_PASSWORD);

let transport = null;
function smtp() {
    if (!transport) {
        const port = Number(env.BOARDROUTE_SMTP_PORT) || 587;
        transport = nodemailer.createTransport({
            host: env.BOARDROUTE_SMTP_HOST,
            port,
            secure: port === 465,
            requireTLS: port !== 465,
            auth: { user: env.BOARDROUTE_SMTP_USER, pass: env.BOARDROUTE_SMTP_PASSWORD },
        });
    }
    return transport;
}

export async function sendMail({ to, subject, text, html }) {
    if (!configured()) {
        if (env.NODE_ENV === 'production') throw Object.assign(new Error('mail is not configured'), { code: 'MAIL_UNAVAILABLE' });
        console.log(`[mail, not sent] to ${to}: ${subject}\n${text}`);
        return;
    }
    await smtp().sendMail({
        from: { name: env.BOARDROUTE_MAIL_FROM_NAME || 'boardroute', address: env.BOARDROUTE_MAIL_FROM || 'no-reply@boardroute.com' },
        to, subject, text, html,
    });
}

// The sign-in mail: one link, plain text plus a small HTML twin.
export function signInMail(link) {
    const text = `Hi,\n\nopen this link to sign in to boardroute:\n\n${link}\n\nIt works once and for 20 minutes. If you didn't ask for it, just ignore this mail.\n\nboardroute.com`;
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0d1117;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#e6edf3">
<div style="max-width:440px;margin:0 auto;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:28px">
<div style="font-size:20px;font-weight:700;margin-bottom:18px">board<span style="color:#58a6ff">route.com</span></div>
<p style="margin:0 0 20px;line-height:1.5">Open this link to sign in.</p>
<a href="${link}" style="display:inline-block;background:#238636;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:7px">Sign in</a>
<p style="margin:22px 0 0;font-size:13px;color:#8b949e;line-height:1.5">It works once and for 20 minutes. If you didn't ask for it, just ignore this mail.</p>
</div></body></html>`;
    return { subject: 'Your boardroute sign-in link', text, html };
}
