const { fetchPage } = require('./fetch-page');
const { assertSafeUrl } = require('./ssrf');

function log(step, detail) {
    if (detail !== undefined) {
        console.log('[html-fetch]', step, detail);
    } else {
        console.log('[html-fetch]', step);
    }
}

const IMAGE_EXTENSIONS_RE = /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)(\?|#|$)/i;
const MAX_INTERCEPTED_IMAGES = 200;

/**
 * Detect whether an axios-fetched body looks like a JavaScript SPA shell that
 * hasn't been hydrated yet (e.g. Next.js or Create React App).
 * @param {string} body
 * @returns {boolean}
 */
function looksLikeSpa(body) {
    if (!body || typeof body !== 'string') return false;
    // Next.js / CRA / Vite root markers
    if (/<div[^>]+id=["'](__next|root|app)["']/i.test(body)) return true;
    // Fallback: very few images AND very little visible text → shell page
    const imgCount = (body.match(/<img[\s>]/gi) || []).length;
    const visibleText = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (imgCount < 3 && visibleText.length < 500) return true;
    return false;
}

/**
 * Some sites block non-browser HTTP clients (403 / bot walls) or render entirely
 * client-side (SPAs). This uses Playwright to retrieve the fully-rendered HTML
 * along with image URLs observed over the network.
 *
 * @param {string} pageUrl
 * @param {{ warnings?: string[] }} [ctx]
 * @returns {Promise<{
 *   finalUrl: string,
 *   status: number,
 *   body: string,
 *   usedPlaywright: true,
 *   interceptedImageUrls: string[],
 *   playwrightProductTiles: { title: string, images: string[] }[],
 * }>}
 */
async function fetchHtmlWithPlaywright(pageUrl, ctx = {}) {
    const warnings = ctx.warnings || [];
    let chromium;
    try {
        ({ chromium } = require('playwright'));
    } catch {
        const err = new Error(
            'Blocked fetch and Playwright unavailable (install playwright and run `npx playwright install chromium`).'
        );
        err.status = 502;
        throw err;
    }

    await assertSafeUrl(pageUrl);

    const t0 = Date.now();
    let browser;
    /** @type {Set<string>} */
    const interceptedImages = new Set();

    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage({
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
        });

        // Capture image URLs from network traffic before navigating
        page.on('response', (response) => {
            if (interceptedImages.size >= MAX_INTERCEPTED_IMAGES) return;
            try {
                const resourceType = response.request().resourceType();
                const url = response.url();
                if (resourceType === 'image' || IMAGE_EXTENSIONS_RE.test(url)) {
                    if (url.startsWith('http://') || url.startsWith('https://')) {
                        interceptedImages.add(url);
                    }
                }
            } catch {
                // ignore listener errors
            }
        });

        // Navigate — prefer networkidle so React/Vue hydration + lazy-load fire
        let resp;
        try {
            resp = await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
        } catch (e) {
            // networkidle can hang on pages with persistent WebSocket connections;
            // fall back to domcontentloaded + a brief wait
            warnings.push(`networkidle timeout, falling back: ${e.message || String(e)}`);
            resp = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise((r) => setTimeout(r, 3000));
        }

        // Scroll through the page to trigger intersection-observer lazy loading.
        // Cap at 20 viewport-height increments to avoid infinite-scroll loops.
        try {
            await page.evaluate(async () => {
                const distance = window.innerHeight;
                const maxScrolls = 20;
                let count = 0;
                while (count < maxScrolls) {
                    const prevHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    count++;
                    await new Promise((r) => setTimeout(r, 300));
                    // Stop early if we have reached the bottom and page isn't growing
                    if (
                        window.scrollY + window.innerHeight >= document.body.scrollHeight &&
                        document.body.scrollHeight === prevHeight
                    ) {
                        break;
                    }
                }
                window.scrollTo(0, 0);
            });
        } catch {
            // scroll errors are non-fatal
        }

        // Short wait for any lazy-load network requests triggered by scrolling
        try {
            await page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch {
            await new Promise((r) => setTimeout(r, 1000));
        }

        // Collect rendered img[src] from the live DOM (catches browser-cached images
        // whose network response may have been missed by the listener)
        try {
            const domImgUrls = await page.evaluate(() =>
                Array.from(document.querySelectorAll('img[src]'))
                    .map((img) => img.src)
                    .filter((src) => src && (src.startsWith('http://') || src.startsWith('https://')))
            );
            for (const u of domImgUrls) {
                if (interceptedImages.size < MAX_INTERCEPTED_IMAGES) interceptedImages.add(u);
            }
        } catch {
            // non-fatal
        }

        /** @type {{ title: string, images: string[] }[]} */
        let playwrightProductTiles = [];
        try {
            playwrightProductTiles = await page.evaluate(() => {
                /** @type {{ title: string, images: string[] }[]} */
                const tiles = [];
                const seen = new Set();

                function absUrl(u) {
                    try {
                        return new URL(u, location.href).href;
                    } catch {
                        return '';
                    }
                }

                function bestFromSrcset(ss) {
                    if (!ss) return '';
                    let best = '';
                    let bestScore = 0;
                    for (const part of ss.split(',')) {
                        const bits = part.trim().split(/\s+/);
                        if (!bits[0]) continue;
                        let score = 1;
                        for (let i = 1; i < bits.length; i++) {
                            const m = bits[i].match(/^(\d+)w$/i);
                            if (m) score = Math.max(score, parseInt(m[1], 10));
                        }
                        if (score > bestScore) {
                            bestScore = score;
                            best = bits[0];
                        }
                    }
                    return best;
                }

                function imgUrl(img) {
                    let u = img.currentSrc || img.src || '';
                    if (!u || u.startsWith('data:')) {
                        const ss = img.getAttribute('srcset') || img.getAttribute('data-srcset');
                        u = bestFromSrcset(ss || '');
                    }
                    return absUrl(u);
                }

                function isExcluded(el) {
                    return !!el.closest(
                        'header, footer, nav, [role="navigation"], [role="banner"], [role="contentinfo"], aside[class*="nav" i]'
                    );
                }

                function goodImg(img) {
                    if (isExcluded(img)) return false;
                    const nw = img.naturalWidth;
                    const nh = img.naturalHeight;
                    if (nw > 0 && nh > 0 && (nw < 48 || nh < 48)) return false;
                    const r = img.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0 && (r.width < 48 || r.height < 48)) return false;
                    const alt = (img.alt || '').toLowerCase();
                    if (alt === 'logo' || alt.includes('icon') || alt.includes('payment')) return false;
                    return true;
                }

                function extractTitle(card, firstImg) {
                    const h = card.querySelector('h1,h2,h3,h4,h5,h6');
                    let t = h?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) || '';
                    if (!t) {
                        const link = card.querySelector('a[href]');
                        if (link) {
                            const clone = link.cloneNode(true);
                            clone.querySelectorAll('img, svg, picture').forEach((n) => n.remove());
                            t = clone.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) || '';
                        }
                    }
                    if (!t) t = (firstImg.alt || '').trim().slice(0, 200);
                    return t;
                }

                function addTile(title, urls) {
                    if (!title || title.length < 2 || !urls.length) return;
                    const key = title.toLowerCase().slice(0, 80) + '|' + urls[0];
                    if (seen.has(key)) return;
                    seen.add(key);
                    tiles.push({ title, images: urls.slice(0, 1) });
                }

                const root = document.querySelector('main') || document.body;
                const selectors = [
                    'article',
                    '[role="listitem"]',
                    'li',
                    'a[href*="/product/"]',
                    'a[href*="/products/"]',
                    'a[href*="/p/"]',
                    'a[href*="/shop/"]',
                    '[data-product-id]',
                    '[data-testid*="product" i]',
                ].join(', ');

                for (const card of Array.from(root.querySelectorAll(selectors))) {
                    if (tiles.length >= 80) break;
                    if (isExcluded(card)) continue;
                    const imgs = Array.from(card.querySelectorAll('img')).filter(goodImg);
                    if (!imgs.length) continue;
                    /** @type {string[]} */
                    const urls = [];
                    for (const im of imgs) {
                        const u = imgUrl(im);
                        if (u && /^https?:\/\//.test(u) && !urls.includes(u)) urls.push(u);
                        if (urls.length >= 1) break;
                    }
                    if (!urls.length) continue;
                    const title = extractTitle(card, imgs[0]);
                    if (!title) continue;
                    addTile(title, urls);
                }

                if (tiles.length < 4) {
                    const allImgs = Array.from(document.querySelectorAll('img')).filter(goodImg);
                    for (const img of allImgs) {
                        if (tiles.length >= 60) break;
                        if (isExcluded(img)) continue;
                        const u = imgUrl(img);
                        if (!u || !/^https?:\/\//.test(u)) continue;

                        let card = img.parentElement;
                        let depth = 0;
                        while (card && depth < 12) {
                            const tag = card.tagName.toLowerCase();
                            if (tag === 'article' || tag === 'li' || tag === 'a') break;
                            if (card.parentElement === root || card === root) break;
                            const subImgs = card.querySelectorAll('img');
                            if (subImgs.length > 6) {
                                card = card.parentElement;
                                depth++;
                                continue;
                            }
                            const hasHeading = card.querySelector('h1,h2,h3,h4,h5,h6');
                            if (hasHeading && subImgs.length <= 5) break;
                            card = card.parentElement;
                            depth++;
                        }
                        if (!card || card === document.body || card === document.documentElement) continue;
                        if (isExcluded(card)) continue;

                        const title = extractTitle(card, img);
                        if (!title) continue;
                        /** @type {string[]} */
                        const cardUrls = [];
                        for (const im of card.querySelectorAll('img')) {
                            if (!goodImg(im)) continue;
                            const cu = imgUrl(im);
                            if (cu && /^https?:\/\//.test(cu) && !cardUrls.includes(cu)) cardUrls.push(cu);
                            if (cardUrls.length >= 1) break;
                        }
                        if (cardUrls.length) addTile(title, cardUrls);
                    }
                }

                return tiles;
            });
        } catch {
            // non-fatal
        }

        const body = await page.content();
        const finalUrl = page.url();
        const status = typeof resp?.status === 'function' ? resp.status() : 200;
        await browser.close();
        browser = null;

        log('step:playwright_html:done', {
            ms: Date.now() - t0,
            finalUrl,
            httpStatus: status,
            bodyChars: body?.length ?? 0,
            interceptedImages: interceptedImages.size,
            playwrightTiles: playwrightProductTiles.length,
        });

        return {
            finalUrl,
            status,
            body: typeof body === 'string' ? body : String(body),
            usedPlaywright: true,
            interceptedImageUrls: [...interceptedImages],
            playwrightProductTiles,
        };
    } catch (e) {
        warnings.push(`Playwright HTML fetch failed: ${e.message || String(e)}`);
        const err = new Error(`Playwright HTML fetch failed: ${e.message || String(e)}`);
        err.status = 502;
        throw err;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch {
                /* ignore */
            }
        }
    }
}

/**
 * Try axios fetch; on HTTP 403 OR when the page looks like an unhydrated SPA shell,
 * retry with Playwright HTML.
 *
 * @param {string} url
 * @param {{
 *   warnings?: string[],
 *   onFallback?: () => void,
 *   forcePlaywright?: boolean,
 * }} [ctx]
 * @returns {Promise<{
 *   finalUrl: string,
 *   status: number,
 *   body: string,
 *   usedPlaywright: boolean,
 *   interceptedImageUrls: string[],
 *   playwrightProductTiles: { title: string, images: string[] }[],
 * }>}
 */
async function fetchPageWithPlaywrightFallback(url, ctx = {}) {
    // When forcePlaywright is set, skip the axios attempt entirely.
    if (ctx.forcePlaywright) {
        log('step:force_playwright', { url });
        ctx.onFallback?.();
        return fetchHtmlWithPlaywright(url, { warnings: ctx.warnings });
    }

    try {
        const result = await fetchPage(url);
        if (looksLikeSpa(result.body)) {
            log('step:spa_detected', { url });
            ctx.onFallback?.();
            return fetchHtmlWithPlaywright(url, { warnings: ctx.warnings });
        }
        return {
            ...result,
            usedPlaywright: false,
            interceptedImageUrls: [],
            playwrightProductTiles: [],
        };
    } catch (e) {
        const msg = e?.message || String(e);
        if (/^HTTP\s+403\b/.test(msg)) {
            ctx.onFallback?.();
            return fetchHtmlWithPlaywright(url, { warnings: ctx.warnings });
        }
        throw e;
    }
}

module.exports = {
    fetchHtmlWithPlaywright,
    fetchPageWithPlaywrightFallback,
};
