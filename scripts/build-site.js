// Static, crawlable explainer pages for the website, built from docs/how-it-works/*.md after
// `vite build`. The app stays at "/"; this adds
//   /how-it-works/                 hub page
//   /how-it-works/<slug>/          one page per article (01-foo-bar.md -> foo-bar)
//   /sitemap.xml, /robots.txt
// Board figures: a comment `<!-- board: <name> | <caption> -->` in the Markdown is replaced by an
// SVG of docs/how-it-works/figures/<name>.json, rendered with the app's own renderer. If a code
// block follows the comment (the text version for Markdown readers), the figure replaces it.
//
//   node scripts/build-site.js [outDir]     (default: dist)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Marked } from 'marked';
import { generateBoardSVG } from '../src/engine/render-utils.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'docs', 'how-it-works');
const OUT = resolve(ROOT, process.argv[2] || 'dist');
const SITE = 'https://boardroute.com';
const BASE = '/how-it-works/';
const TODAY = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// GitHub-compatible heading anchors, so links like 03-...md#repair-instead-of-starting-over keep working
const anchor = (text) => text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
const slugOf = (file) => file.replace(/^\d+-/, '').replace(/\.md$/, '');
const urlOf = (file) => BASE + slugOf(file) + '/';

// Article list and one-line summaries come from the README table.
const readme = readFileSync(join(SRC, 'README.md'), 'utf-8');
const summaries = new Map();
for (const m of readme.matchAll(/^\|\s*\d+\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(.+?)\s*\|$/gm)) summaries.set(m[2], { nav: m[1], summary: m[3] });
const files = readdirSync(SRC).filter(f => /^\d+-.*\.md$/.test(f)).sort();

function rewriteHref(href) {
    const m = href.match(/^(\d+-[\w-]+\.md)(#.*)?$/);
    return m ? urlOf(m[1]) + (m[2] || '') : href;
}

function boardFigure(name, caption) {
    const L = JSON.parse(readFileSync(join(SRC, 'figures', `${name}.json`), 'utf-8'));
    const comps = L.components.map(c => ({ ...c, name: c.id, pins: c.pins.map(p => ({ ...p, col: c.ox + p.dCol, row: c.oy + p.dRow })) }));
    const svg = generateBoardSVG(comps, L.wires)
        .replace(/@import url\([^)]*\);?/, '') // the page already loads the fonts
        .replace('<svg ', `<svg role="img" aria-label="${esc(caption)}" `);
    return `<figure class="board">${svg}<figcaption>${esc(caption)}</figcaption></figure>`;
}

function render(md) {
    const headings = [];
    const marked = new Marked({
        gfm: true,
        walkTokens(t) { if (t.type === 'link') t.href = rewriteHref(t.href); },
        renderer: {
            heading({ tokens, depth, text }) {
                const id = anchor(text);
                const inner = this.parser.parseInline(tokens);
                if (depth === 2 || depth === 3) headings.push({ depth, id, text: stripTags(inner) });
                if (depth === 1) return `<h1>${inner}</h1>\n`;
                return `<h${depth} id="${id}"><a class="hash" href="#${id}" aria-hidden="true">#</a>${inner}</h${depth}>\n`;
            },
        },
    });
    // figure markers (optionally swallowing the text-version code block after them)
    // (placeholders, swapped in after parsing: indented SVG markup would otherwise become a code block)
    const figures = [];
    md = md.replace(/<!--\s*board:\s*([\w-]+)\s*\|\s*([\s\S]*?)-->\s*(```[\s\S]*?```)?/g, (_, name, cap) => {
        figures.push(boardFigure(name, cap.trim()));
        return `\n\nFIGURE${figures.length - 1}\n\n`;
    });
    // tables scroll sideways on phones instead of widening the page
    const html = marked.parse(md).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>')
        .replace(/<p>FIGURE(\d+)<\/p>/g, (_, i) => figures[i]);
    return { html, headings };
}

const ANALYTICS = `<script data-goatcounter="${SITE}/stats/count" async src="/stats/count.js"></script>`;

function page({ title, description, path, body, jsonld, type = 'article' }) {
    const url = SITE + path;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/boardroute-icon.png">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="boardroute">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0d1117">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;800&display=swap">
<link rel="stylesheet" href="${BASE}site.css">
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
${ANALYTICS}
</head>
<body>
<header class="site-head">
  <a class="logo" href="/">board<em>route.com</em></a>
  <nav><a href="${BASE}">How it works</a><a href="${BASE}faq/">FAQ</a></nav>
  <a class="cta" href="/">Open the autorouter →</a>
</header>
${body}
<footer class="site-foot">
  <div class="foot-cols">
    <div><a class="logo" href="/">board<em>route.com</em></a><p>Free perfboard autorouter that runs in your browser. Nothing is uploaded.</p></div>
    <div><h4>How it works</h4><ul>${files.map(f => `<li><a href="${urlOf(f)}">${esc(summaries.get(f)?.nav || slugOf(f))}</a></li>`).join('')}</ul></div>
  </div>
</footer>
</body>
</html>
`;
}

function breadcrumb(items) {
    return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })) };
}

// Q&A pairs for FAQPage structured data: each "### question" with the paragraphs after it.
function faqEntries(md) {
    return [...md.matchAll(/^### (.+)\n\n([\s\S]*?)(?=\n### |\n→ |$(?![\s\S]))/gm)].map(([, q, a]) => ({
        '@type': 'Question', name: q.trim(),
        acceptedAnswer: { '@type': 'Answer', text: stripTags(new Marked().parse(a.replace(/→ \[[^\]]+\]\([^)]+\)/g, ''))).trim().replace(/\s+/g, ' ') },
    }));
}

mkdirSync(join(OUT, 'how-it-works'), { recursive: true });
writeFileSync(join(OUT, 'how-it-works', 'site.css'), readFileSync(join(ROOT, 'scripts', 'site.css')));

const articles = files.map(f => {
    const md = readFileSync(join(SRC, f), 'utf-8');
    const title = md.match(/^# (.+)$/m)[1];
    const meta = summaries.get(f) || { nav: title, summary: '' };
    return { f, md, title, ...meta, path: urlOf(f) };
});

articles.forEach((a, i) => {
    const { html, headings } = render(a.md);
    const prev = articles[i - 1], next = articles[i + 1];
    const toc = headings.filter(h => h.depth === 2);
    const isFaq = a.f.includes('faq');
    const body = `<main class="article-layout">
  <aside class="toc">
    <p class="toc-title">How it works</p>
    <ol>${articles.map(b => `<li${b === a ? ' class="here"' : ''}><a href="${b.path}">${esc(b.nav)}</a></li>`).join('')}</ol>
    ${toc.length > 1 && !isFaq ? `<p class="toc-title">On this page</p><ul>${toc.map(h => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul>` : ''}
  </aside>
  <article class="prose">
    <p class="crumbs"><a href="${BASE}">How it works</a> · Part ${i + 1} of ${articles.length}</p>
    ${html}
    <nav class="pager">${prev ? `<a class="prev" href="${prev.path}"><span>Previous</span>${esc(prev.nav)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.path}"><span>Next</span>${esc(next.nav)}</a>` : ''}</nav>
    <aside class="try"><p><strong>Try it on your own circuit.</strong> Describe the parts and their pins, press Wire and then Compact, and watch the board shrink. It runs in your browser and is free.</p><a class="cta" href="/">Open the autorouter →</a></aside>
  </article>
</main>`;
    const jsonld = [
        { '@context': 'https://schema.org', '@type': 'TechArticle', headline: a.title, description: a.summary, url: SITE + a.path, dateModified: TODAY, inLanguage: 'en', image: `${SITE}/og-image.png`, publisher: { '@type': 'Organization', name: 'boardroute', url: SITE + '/' } },
        breadcrumb([['boardroute', '/'], ['How it works', BASE], [a.nav, a.path]]),
    ];
    if (isFaq) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqEntries(a.md) });
    const dir = join(OUT, 'how-it-works', slugOf(a.f));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), page({ title: `${a.title} · boardroute`, description: a.summary, path: a.path, body, jsonld }));
});

// Hub page
const hubBody = `<main class="hub">
  <section class="hero">
    <h1>How boardroute lays out your perfboard</h1>
    <p class="lead">boardroute turns a circuit into a compact perfboard layout: it places the parts, wires every connection without crossings, and keeps shrinking the board. These pages explain how, without assuming you know graph theory or routing algorithms.</p>
    ${boardFigure('blinker555', 'A 555 LED blinker, laid out by boardroute on 8 × 7 = 56 holes.')}
  </section>
  <ol class="cards">${articles.map((a, i) => `<li><a href="${a.path}"><span class="num">${i + 1}</span><h2>${esc(a.nav)}</h2><p>${esc(a.summary)}</p></a></li>`).join('')}</ol>
</main>`;
writeFileSync(join(OUT, 'how-it-works', 'index.html'), page({
    title: 'How the perfboard autorouter works · boardroute',
    description: 'How boardroute places parts, routes wires without crossings, proves when a circuit needs jumper wires, and shrinks perfboard layouts. Plain-language explanations with examples.',
    path: BASE, body: hubBody, type: 'website',
    jsonld: [breadcrumb([['boardroute', '/'], ['How it works', BASE]]),
        { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: articles.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + a.path, name: a.nav })) }],
}));

// Sitemap + robots
const urls = ['/', BASE, ...articles.map(a => a.path)];
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /stats/\n\nSitemap: ${SITE}/sitemap.xml\n`);

if (!existsSync(join(OUT, 'index.html'))) console.warn(`note: ${OUT}/index.html missing -- run vite build first`);
console.log(`site: ${articles.length} articles + hub, sitemap with ${urls.length} URLs -> ${OUT}`);
