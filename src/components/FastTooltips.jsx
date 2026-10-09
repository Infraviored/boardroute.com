import { useEffect } from 'react';

// The browser shows `title` tooltips only after a second or two. This shows the same text after
// 150 ms for every element with a title, app-wide: while hovered, the title moves to
// data-tip (so the native tooltip stays away) and a small box is placed next to the element.
const DELAY = 150;

export function FastTooltips() {
    useEffect(() => {
        const tip = document.createElement('div');
        tip.className = 'fast-tip';
        tip.setAttribute('role', 'tooltip');
        document.body.appendChild(tip);
        let el = null, timer = 0;

        const hide = () => {
            clearTimeout(timer);
            tip.classList.remove('show');
            if (el?.hasAttribute('data-tip')) {
                // React may have set a new title meanwhile; keep that one
                if (!el.hasAttribute('title')) el.setAttribute('title', el.getAttribute('data-tip'));
                el.removeAttribute('data-tip');
            }
            el = null;
        };
        const place = () => {
            if (!el) return;
            const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect(), m = 8;
            let x, y;
            if (r.right > innerWidth - 140) { x = r.left - t.width - m; y = r.top + (r.height - t.height) / 2; } // right edge: to the left
            else {
                x = r.left + (r.width - t.width) / 2;
                y = r.top - t.height - m;
                if (y < 4) y = r.bottom + m;
            }
            tip.style.left = Math.max(4, Math.min(innerWidth - t.width - 4, x)) + 'px';
            tip.style.top = Math.max(4, Math.min(innerHeight - t.height - 4, y)) + 'px';
        };
        const over = (e) => {
            const target = e.target.closest?.('[title], [data-tip]');
            if (target === el) return;
            hide();
            if (!target || e.pointerType === 'touch') return;
            const text = target.getAttribute('title') || target.getAttribute('data-tip');
            if (!text) return;
            el = target;
            el.setAttribute('data-tip', text);
            el.removeAttribute('title');
            timer = setTimeout(() => { tip.textContent = el?.getAttribute('data-tip') || text; place(); tip.classList.add('show'); }, DELAY);
        };
        const out = (e) => { if (el && !el.contains(e.relatedTarget)) hide(); };

        document.addEventListener('pointerover', over);
        document.addEventListener('pointerout', out);
        document.addEventListener('pointerdown', hide, true);
        window.addEventListener('scroll', hide, true);
        return () => {
            hide();
            document.removeEventListener('pointerover', over);
            document.removeEventListener('pointerout', out);
            document.removeEventListener('pointerdown', hide, true);
            window.removeEventListener('scroll', hide, true);
            tip.remove();
        };
    }, []);
    return null;
}
