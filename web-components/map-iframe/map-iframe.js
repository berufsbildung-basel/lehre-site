// Finds "(map-iframe)" markers and replaces them with a real <iframe class="embed-map">.
// ESLint-friendly: no globals, no console.

function toEmbed(href) {
    try {
        const u = new URL(href, window.location.href);
        // Already an embed URL?
        if (u.origin === 'https://www.google.com' && u.pathname.startsWith('/maps/embed')) {
            return u.toString();
        }
        // Convert generic Maps URL to embed-ish (fallback)
        if (u.hostname.includes('google') && u.pathname.startsWith('/maps')) {
            const q = u.searchParams.get('q') || '';
            const out = new URL('https://www.google.com/maps');
            if (q) out.searchParams.set('q', q);
            out.searchParams.set('output', 'embed');
            return out.toString();
        }
    } catch (_) { /* ignore */ }
    return href;
}

function computeWidthPct(node) {
    let pct = '100%';
    const cell = node.closest('td') || node.parentElement;
    const row = cell && cell.closest('tr');
    if (!row) return pct;
    // Count the immediate cells in this row (th/td elements)
    const cols = Array.prototype.filter.call(row.children, (c) => c.tagName === 'TD' || c.tagName === 'TH');
    const count = Math.max(1, cols.length);
    pct = `${Math.round(100 / count)}%`;
    return pct;
}

function findMarkerCandidates(root) {
    const list = [];
    // (1) Anchors whose visible text is "(map-iframe)"
    document.querySelectorAll('a').forEach((a) => {
        if ((a.textContent || '').trim() === '(map-iframe)') list.push(a);
    });
    // (2) Plain text nodes wrapped in p/div/span with exactly "(map-iframe)"
    root.querySelectorAll('p,div,span').forEach((el) => {
        if (el.childElementCount === 0 && (el.textContent || '').trim() === '(map-iframe)') list.push(el);
    });
    return list;
}

function findMapsHrefNear(node) {
    // If node itself is an <a>, use it.
    if (node.tagName === 'A') {
        const h = node.getAttribute('href') || '';
        if (h) return h;
    }
    // Else, look for any Google Maps link in the same table cell
    const cell = node.closest('td') || node.parentElement;
    if (!cell) return '';
    const a = cell.querySelector('a[href*="google.com/maps"]');
    return a ? (a.getAttribute('href') || '') : '';
}

function replaceMarkerWithIframe(marker) {
    const href = findMapsHrefNear(marker);
    if (!href) return;

    const src = toEmbed(href);
    if (!src) return;

    const iframe = document.createElement('iframe');
    iframe.className = 'embed-map';
    iframe.src = src;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.setAttribute('allowfullscreen', '');

    // Title from aria-label/title on the nearest link or marker text
    const a = marker.tagName === 'A' ? marker : (marker.closest('td') || marker.parentElement)?.querySelector('a[href*="google.com/maps"]');
    const t = (a && (a.getAttribute('aria-label') || a.getAttribute('title'))) || 'Map';
    iframe.title = t;

    // Width based on table column count
    iframe.style.width = computeWidthPct(marker);

    // Default to square via CSS var (can be overridden in CSS)
    iframe.style.setProperty('--mi-aspect', '1/1');

    // Remove the nearby link if marker wasn’t the link itself (to avoid duplicate UI)
    if (a && a !== marker) a.remove();

    marker.replaceWith(iframe);
}

function run(root = document) {
    const markers = findMarkerCandidates(root);
    if (!markers.length) return;
    markers.forEach(replaceMarkerWithIframe);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => run(document));
} else {
    run(document);
}

export default run;
