const axios = require('axios');
const cheerio = require('cheerio');

class DiskWalaService {

    constructor() {
        this.headers = {
            'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
        };
    }

    /**
     * Main method - Fetch video link from DiskWala URL
     */
    async fetchVideoLink(url) {
        try {
            // Method 1: Direct HTML parsing
            const result = await this.method1_DirectParse(url);
            if (result && result.videoUrl) return result;
        } catch (e) {
            console.log('Method 1 failed:', e.message);
        }

        try {
            // Method 2: API endpoint extraction
            const result = await this.method2_APIEndpoint(url);
            if (result && result.videoUrl) return result;
        } catch (e) {
            console.log('Method 2 failed:', e.message);
        }

        try {
            // Method 3: Follow redirects
            const result = await this.method3_FollowRedirects(url);
            if (result && result.videoUrl) return result;
        } catch (e) {
            console.log('Method 3 failed:', e.message);
        }

        try {
            // Method 4: Puppeteer (Headless Browser)
            const result = await this.method4_Puppeteer(url);
            if (result && result.videoUrl) return result;
        } catch (e) {
            console.log('Method 4 failed:', e.message);
        }

        throw new Error('Could not extract video link. All methods failed.');
    }

    /**
     * Method 1: Direct HTML Parsing with Cheerio
     */
    async method1_DirectParse(url) {
        console.log('📌 Trying Method 1: Direct HTML Parsing...');

        const response = await axios.get(url, {
            headers: this.headers,
            maxRedirects: 10,
            timeout: 15000
        });

        const html = response.data;
        const $ = cheerio.load(html);

        let videoUrl = null;
        let title = $('title').text().trim() || null;
        let thumbnail = null;
        let fileSize = null;
        let fileName = null;

        // Extract from <video> tag
        $('video source').each((i, el) => {
            const src = $(el).attr('src');
            if (src) videoUrl = src;
        });

        if (!videoUrl) {
            $('video').each((i, el) => {
                const src = $(el).attr('src');
                if (src) videoUrl = src;
            });
        }

        // Extract from <a> download link
        if (!videoUrl) {
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().toLowerCase();
                if (href && (text.includes('download') || text.includes('play') ||
                    href.includes('.mp4') || href.includes('.mkv') ||
                    href.includes('.avi') || href.includes('.webm'))) {
                    videoUrl = href;
                }
            });
        }

        // Extract from iframe
        if (!videoUrl) {
            $('iframe').each((i, el) => {
                const src = $(el).attr('src');
                if (src) videoUrl = src;
            });
        }

        // Extract from script tags (inline JS)
        if (!videoUrl) {
            $('script').each((i, el) => {
                const scriptContent = $(el).html();
                if (scriptContent) {
                    // Look for video URLs in scripts
                    const patterns = [
                        /(?:file|src|source|url|video|stream|link)\s*[:=]\s*["']([^"']*\.(?:mp4|mkv|avi|webm|m3u8|flv)[^"']*)/gi,
                        /https?:\/\/[^"'\s]*\.(?:mp4|mkv|avi|webm|m3u8|flv)[^"'\s]*/gi,
                        /"(https?:\/\/[^"]*\/(?:download|stream|video|file)[^"]*)"/gi,
                        /source\s*:\s*["']([^"']+)["']/gi,
                        /file\s*:\s*["']([^"']+)["']/gi,
                        /videoUrl\s*[:=]\s*["']([^"']+)["']/gi,
                        /downloadUrl\s*[:=]\s*["']([^"']+)["']/gi,
                    ];

                    for (const pattern of patterns) {
                        const matches = scriptContent.match(pattern);
                        if (matches && matches.length > 0) {
                            // Clean the match
                            let match = matches[0];
                            const urlMatch = match.match(/https?:\/\/[^"'\s\])]+/);
                            if (urlMatch) {
                                videoUrl = urlMatch[0];
                                break;
                            }
                        }
                    }
                }
            });
        }

        // Extract thumbnail
        $('meta[property="og:image"]').each((i, el) => {
            thumbnail = $(el).attr('content');
        });

        // Extract title from meta
        if (!title || title === '') {
            $('meta[property="og:title"]').each((i, el) => {
                title = $(el).attr('content');
            });
        }

        // Extract file info
        $('span, div, p').each((i, el) => {
            const text = $(el).text();
            if (text.match(/\d+(\.\d+)?\s*(MB|GB|KB)/i)) {
                fileSize = text.match(/\d+(\.\d+)?\s*(MB|GB|KB)/i)[0];
            }
        });

        if (videoUrl) {
            return {
                videoUrl: this.resolveUrl(videoUrl, url),
                title,
                thumbnail,
                fileSize,
                method: 'Direct HTML Parsing',
                originalUrl: url
            };
        }

        return null;
    }

    /**
     * Method 2: Try DiskWala API endpoints
     */
    async method2_APIEndpoint(url) {
        console.log('📌 Trying Method 2: API Endpoint Extraction...');

        const id = this.extractId(url);
        if (!id) throw new Error('Could not extract ID from URL');

        // Try common API patterns
        const apiEndpoints = [
            `https://www.diskwala.com/api/file/${id}`,
            `https://www.diskwala.com/api/v1/file/${id}`,
            `https://www.diskwala.com/api/download/${id}`,
            `https://www.diskwala.com/api/stream/${id}`,
            `https://www.diskwala.com/api/video/${id}`,
            `https://www.diskwala.com/dl/${id}`,
            `https://www.diskwala.com/download/${id}`,
            `https://www.diskwala.com/stream/${id}`,
            `https://www.diskwala.com/file/${id}`,
            `https://www.diskwala.com/v/${id}`,
            `https://www.diskwala.com/w/${id}`,
            `https://www.diskwala.com/e/${id}`,
            `https://www.diskwala.com/embed/${id}`,
        ];

        for (const endpoint of apiEndpoints) {
            try {
                const response = await axios.get(endpoint, {
                    headers: {
                        ...this.headers,
                        'Referer': url,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    maxRedirects: 5,
                    timeout: 10000,
                    validateStatus: (status) => status < 500
                });

                if (response.status === 200) {
                    const data = response.data;

                    // If response is JSON
                    if (typeof data === 'object') {
                        const videoUrl = data.url || data.link || data.file ||
                            data.source || data.stream || data.download ||
                            data.video || data.src ||
                            (data.data && (data.data.url || data.data.link || data.data.file));

                        if (videoUrl) {
                            return {
                                videoUrl,
                                title: data.name || data.title || data.filename || null,
                                fileSize: data.size || data.fileSize || null,
                                thumbnail: data.thumbnail || data.poster || null,
                                method: `API Endpoint: ${endpoint}`,
                                originalUrl: url,
                                rawResponse: data
                            };
                        }
                    }

                    // If response is HTML, try to parse
                    if (typeof data === 'string' && data.includes('http')) {
                        const urlMatch = data.match(/https?:\/\/[^"'\s]*\.(?:mp4|mkv|avi|webm|m3u8)[^"'\s]*/i);
                        if (urlMatch) {
                            return {
                                videoUrl: urlMatch[0],
                                method: `API Endpoint (HTML): ${endpoint}`,
                                originalUrl: url
                            };
                        }
                    }
                }
            } catch (e) {
                // Continue to next endpoint
            }
        }

        return null;
    }

    /**
     * Method 3: Follow all redirects and check final URL
     */
    async method3_FollowRedirects(url) {
        console.log('📌 Trying Method 3: Following Redirects...');

        const id = this.extractId(url);

        const possibleUrls = [
            url,
            `https://www.diskwala.com/app/${id}`,
            `https://diskwala.com/app/${id}`,
        ];

        for (const testUrl of possibleUrls) {
            try {
                // First request - get page and find forms/redirect links
                const response = await axios.get(testUrl, {
                    headers: this.headers,
                    maxRedirects: 0,
                    timeout: 15000,
                    validateStatus: () => true
                });

                // Check if redirect
                if ([301, 302, 303, 307, 308].includes(response.status)) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl && this.isVideoUrl(redirectUrl)) {
                        return {
                            videoUrl: this.resolveUrl(redirectUrl, testUrl),
                            method: 'Redirect Follow',
                            originalUrl: url
                        };
                    }

                    // Follow the redirect
                    if (redirectUrl) {
                        const redirectResponse = await axios.get(
                            this.resolveUrl(redirectUrl, testUrl),
                            {
                                headers: { ...this.headers, Referer: testUrl },
                                maxRedirects: 10,
                                timeout: 15000
                            }
                        );

                        if (this.isVideoUrl(redirectResponse.request?.res?.responseUrl)) {
                            return {
                                videoUrl: redirectResponse.request.res.responseUrl,
                                method: 'Deep Redirect Follow',
                                originalUrl: url
                            };
                        }
                    }
                }

                // Parse HTML for form-based downloads
                if (response.data && typeof response.data === 'string') {
                    const $ = cheerio.load(response.data);

                    // Look for form actions
                    $('form').each((i, el) => {
                        const action = $(el).attr('action');
                        if (action) {
                            console.log(`Found form action: ${action}`);
                        }
                    });

                    // Look for countdown/timer based download links
                    const scriptContent = $('script').text();
                    const downloadLinkMatch = scriptContent.match(
                        /(?:download_link|direct_link|file_link)\s*[:=]\s*["']([^"']+)["']/i
                    );
                    if (downloadLinkMatch) {
                        return {
                            videoUrl: this.resolveUrl(downloadLinkMatch[1], testUrl),
                            method: 'Script Download Link',
                            originalUrl: url
                        };
                    }
                }

            } catch (e) {
                // Continue
            }
        }

        return null;
    }

    /**
     * Method 4: Puppeteer (Headless Browser) - Most Reliable
     */
    async method4_Puppeteer(url) {
        console.log('📌 Trying Method 4: Puppeteer Headless Browser...');

        let browser;
        try {
            const puppeteer = require('puppeteer');

            browser = await puppeteer.launch({
                headless: 'new',
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            });

            const page = await browser.newPage();

            // Set user agent
            await page.setUserAgent(this.headers['User-Agent']);

            // Intercept network requests to find video URLs
            const videoUrls = [];
            const networkRequests = [];

            page.on('request', (request) => {
                const reqUrl = request.url();
                networkRequests.push(reqUrl);

                if (this.isVideoUrl(reqUrl)) {
                    videoUrls.push({
                        url: reqUrl,
                        type: 'request'
                    });
                }
            });

            page.on('response', async (response) => {
                const resUrl = response.url();
                const contentType = response.headers()['content-type'] || '';

                if (contentType.includes('video') ||
                    contentType.includes('octet-stream') ||
                    this.isVideoUrl(resUrl)) {
                    videoUrls.push({
                        url: resUrl,
                        type: 'response',
                        contentType
                    });
                }
            });

            // Navigate to the page
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait a bit for dynamic content
            await page.waitForTimeout(3000);

            // Try clicking download/play buttons
            const buttonSelectors = [
                'button[class*="download"]',
                'a[class*="download"]',
                'button[class*="play"]',
                'a[class*="play"]',
                '#downloadBtn',
                '#download',
                '.download-btn',
                '.download-button',
                'a[href*="download"]',
                'button:has-text("Download")',
                'a:has-text("Download")',
                '.btn-download',
                '[data-action="download"]',
            ];

            for (const selector of buttonSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button) {
                        await button.click();
                        await page.waitForTimeout(3000);
                        break;
                    }
                } catch (e) {
                    // Continue
                }
            }

            // Extract video from page
            const pageVideoUrl = await page.evaluate(() => {
                // Check video elements
                const video = document.querySelector('video');
                if (video) {
                    const source = video.querySelector('source');
                    return source ? source.src : video.src;
                }

                // Check for download links
                const links = document.querySelectorAll('a');
                for (const link of links) {
                    if (link.href && (
                        link.href.includes('.mp4') ||
                        link.href.includes('.mkv') ||
                        link.href.includes('download') ||
                        link.href.includes('stream')
                    )) {
                        return link.href;
                    }
                }

                return null;
            });

            if (pageVideoUrl) {
                videoUrls.push({ url: pageVideoUrl, type: 'dom' });
            }

            // Get page title
            const title = await page.title();

            await browser.close();

            if (videoUrls.length > 0) {
                // Prefer direct video file URLs
                const directVideo = videoUrls.find(v =>
                    v.url.match(/\.(mp4|mkv|avi|webm|m3u8)/i)
                );

                return {
                    videoUrl: directVideo ? directVideo.url : videoUrls[0].url,
                    allVideoUrls: videoUrls.map(v => v.url),
                    title,
                    method: 'Puppeteer Headless Browser',
                    originalUrl: url,
                    totalNetworkRequests: networkRequests.length
                };
            }

            // Log all network requests for debugging
            const potentialVideoRequests = networkRequests.filter(r =>
                r.includes('video') || r.includes('stream') ||
                r.includes('download') || r.includes('file') ||
                r.includes('cdn') || r.includes('media')
            );

            if (potentialVideoRequests.length > 0) {
                return {
                    videoUrl: potentialVideoRequests[0],
                    potentialUrls: potentialVideoRequests,
                    title,
                    method: 'Puppeteer (Potential URLs)',
                    originalUrl: url,
                    note: 'These are potential video URLs found in network requests'
                };
            }

        } catch (e) {
            if (browser) await browser.close();
            throw e;
        }

        return null;
    }

    // ==================== HELPER METHODS ====================

    extractId(url) {
        const match = url.match(/\/app\/([a-zA-Z0-9]+)/);
        return match ? match[1] : url.split('/').pop();
    }

    isVideoUrl(url) {
        if (!url) return false;
        return /\.(mp4|mkv|avi|webm|m3u8|flv|mov|wmv|ts)(\?|$)/i.test(url) ||
            /video/i.test(url) ||
            /stream/i.test(url);
    }

    resolveUrl(relative, base) {
        try {
            return new URL(relative, base).href;
        } catch {
            return relative;
        }
    }
}

module.exports = new DiskWalaService();
