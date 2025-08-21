// Replace "(map-iframe)" markers with a REAL <iframe class="embed-map">.
// Pulls the Google Maps URL from the marker link itself, or from the first
// google.com/maps link in the same table cell. Sizes width = 100% / colCount.

function toEmbed(href) {
    try {
        const u = new URL(href, window.location.href);
        if (u.origin === 'https://www.google.com' && u.pathname.startsWith('/maps/embed')) {
            return u.toString();
        }
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
    const cell = node.closest('td') || node.parentElement;
    const row = cell && cell.closest('tr');
    if (!row) return '100%';
    const cols = Array.prototype.filter.call(row.children, (c) => c.tagName === 'TD' || c.tagName === 'TH');
    const count = Math.max(1, cols.length);
    return `${Math.round(100 / count)}%`;
}

function findMarkerCandidates(root) {
    const list = [];
    // anchors whose text is "(map-iframe)"
    root.querySelectorAll('a').forEach((a) => {
        if ((a.textContent || '').trim() === '(map-iframe)') list.push(a);
    });
    // plain text wrappers: p/div/span exactly "(map-iframe)"
    root.querySelectorAll('p,div,span').forEach((el) => {
        if (el.childElementCount === 0 && (el.textContent || '').trim() === '(map-iframe)') list.push(el);
    });
    return list;
}

function findMapsHrefNear(node) {
    if (node.tagName === 'A') {
        const h = node.getAttribute('href') || '';
        if (h) return h;
    }
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

    // Set defaults inline too, so no “Cannot resolve” warnings appear
    iframe.style.setProperty('--mi-height', '420px'); // default; override below if you want
    iframe.style.setProperty('--mi-aspect', '1/1');   // default square; delete this line for fixed height

    // Width based on table column count
    iframe.style.width = computeWidthPct(marker);

    // Accessible title
    const cell = marker.closest('td') || marker.parentElement;
    const linkForTitle = marker.tagName === 'A' ? marker : cell?.querySelector('a[href*="google.com/maps"]');
    const title = (linkForTitle && (linkForTitle.getAttribute('aria-label') || linkForTitle.getAttribute('title'))) || 'Map';
    iframe.title = title;

    // Remove the nearby link if marker wasn’t the link itself (to avoid duplicates)
    if (linkForTitle && linkForTitle !== marker) linkForTitle.remove();

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
