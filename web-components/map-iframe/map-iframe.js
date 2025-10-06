//helper function to normalise standard google maps links into embed links
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
    } catch (err) { console.error('map-iframe: toEmbed URL parse failed', err); }
    return href;
}

//find amount of columns and calculate iframe-map size (2 columns = 50%, 3 = 33% ect.)
function computeWidthPct(node) {
    const cell = node.closest('td') || node.parentElement;
    const row = cell && cell.closest('tr');
    if (!row) return '100%';
    const cols = Array.prototype.filter.call(row.children, (c) => c.tagName === 'TD' || c.tagName === 'TH');
    const count = Math.max(1, cols.length);
    return `${Math.round(100 / count)}%`;
}

//fixes issue where iframe element gets reverted to an "a" html element
function findMarkers(root) {
    const out = [];
    root.querySelectorAll('a').forEach((a) => {
        if ((a.textContent || '').trim() === '(map-iframe)') out.push(a);
    });
    root.querySelectorAll('p,div,span').forEach((el) => {
        if (!el.childElementCount && (el.textContent || '').trim() === '(map-iframe)') out.push(el);
    });
    return out;
}

//finds the url to embed
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

//lazy loader
function lazySetSrc(iframe, src) {
    const assign = () => { if (!iframe.src) iframe.src = src; };

    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                assign();
                io.disconnect();
            }
        }, { rootMargin: '400px' }); // start a bit before it enters view
        io.observe(iframe);
    } else {
        // Fallback: rely on native lazy-loading where supported
        iframe.loading = 'lazy';
        assign();
    }
}

//replaces "a" elements with iframe
function replaceMarkerWithIframe(marker) {
    const href = findMapsHrefNear(marker);
    if (!href) return;

    const src = toEmbed(href);
    if (!src) return;

    const iframe = document.createElement('iframe');
    iframe.className = 'embed-map';
    iframe.setAttribute('allowfullscreen', '');
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.loading = 'lazy'; // hint for native lazy loaders

    // css
    iframe.style.setProperty('--mi-height', '420px'); // used if no aspect
    iframe.style.setProperty('--mi-aspect', '1/1');   // square by default

    // width based on table columns
    iframe.style.width = computeWidthPct(marker);

    // accessible title
    const cell = marker.closest('td') || marker.parentElement;
    const linkForTitle = marker.tagName === 'A' ? marker : cell?.querySelector('a[href*="google.com/maps"]');
    const title = (linkForTitle && (linkForTitle.getAttribute('aria-label') || linkForTitle.getAttribute('title'))) || 'Map';
    iframe.title = title;

    // removes nearby link to avoid duplicate UI
    if (linkForTitle && linkForTitle !== marker) linkForTitle.remove();

    marker.replaceWith(iframe);

    // defer the network until near viewport
    lazySetSrc(iframe, src);
}

function run(root = document) {
    const markers = findMarkers(root);
    if (!markers.length) return;
    markers.forEach(replaceMarkerWithIframe);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => run(document));
} else {
    run(document);
}

export default run;
