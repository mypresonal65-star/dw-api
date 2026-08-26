const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 🛡️ Middleware
// ============================================
app.use(helmet({
  contentSecurityPolicy: false // For video embedding
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});
app.use('/api/', limiter);

// ============================================
// 🔧 Helper: Clean and validate URL
// ============================================
function cleanUrl(url, baseUrl) {
  if (!url) return null;
  
  // Remove quotes and whitespace
  url = url.replace(/^["']|["']$/g, '').trim();
  
  // Handle relative URLs
  if (url.startsWith('//')) {
    url = 'https:' + url;
  } else if (url.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      url = base.origin + url;
    } catch (e) {
      return null;
    }
  }
  
  // Ensure it's a valid URL
  try {
    new URL(url);
    return url;
  } catch (error) {
    return null;
  }
}

// ============================================
// 🎯 Extraction Method 1: Cheerio (Fast)
// ============================================
async function extractWithCheerio(url) {
  const startTime = Date.now();
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.diskwala.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Connection': 'keep-alive'
      },
      timeout: 30000,
      maxRedirects: 5
    });

    const html = response.data;
    const $ = cheerio.load(html);
    let videoUrl = null;
    let foundMethod = null;

    // Pattern 1: Check for video element with src
    $('video[src], video source[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src && (src.includes('.m3u8') || src.includes('.mp4') || src.includes('.webm') || src.includes('.mkv'))) {
        videoUrl = src;
        foundMethod = 'video-tag';
        return false;
      }
    });

    // Pattern 2: Check JavaScript variables
    if (!videoUrl) {
      const scripts = $('script').map((i, el) => $(el).html()).get();
      
      const patterns = [
        // Common video URL patterns
        /(?:file|src|video_url|url|source|videoSrc|videoSource|mediaUrl|playlist|manifest)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|webm|mkv)[^"']*)["']/gi,
        /video_url\s*:\s*["']([^"']+)["']/gi,
        /source\s*:\s*["']([^"']+)["']/gi,
        /url\s*:\s*["']([^"']+)["']/gi,
        /src\s*:\s*["']([^"']+)["']/gi,
        /file\s*:\s*["']([^"']+)["']/gi,
        /manifest\s*:\s*["']([^"']+)["']/gi,
        /playlist\s*:\s*["']([^"']+)["']/gi,
        // Cloud storage patterns
        /https?:\/\/[^\s"']+\.(?:s3|cloudfront|cdn|storage)[^\s"']*\.(?:m3u8|mp4|webm)[^\s"']*/gi
      ];

      for (let script of scripts) {
        if (!script) continue;
        
        for (let pattern of patterns) {
          let match;
          while ((match = pattern.exec(script)) !== null) {
            const potentialUrl = match[1] || match[0];
            if (potentialUrl && (potentialUrl.includes('.m3u8') || potentialUrl.includes('.mp4') || potentialUrl.includes('.webm'))) {
              videoUrl = potentialUrl;
              foundMethod = 'script-variable';
              break;
            }
          }
          if (videoUrl) break;
        }
        if (videoUrl) break;
      }
    }

    // Pattern 3: Data attributes
    if (!videoUrl) {
      $('[data-video-url], [data-src], [data-file], [data-source], [data-href]').each((i, el) => {
        const src = $(el).attr('data-video-url') || $(el).attr('data-src') || $(el).attr('data-file') || $(el).attr('data-source') || $(el).attr('data-href');
        if (src && (src.includes('.m3u8') || src.includes('.mp4') || src.includes('.webm'))) {
          videoUrl = src;
          foundMethod = 'data-attribute';
          return false;
        }
      });
    }

    // Pattern 4: Window/global variables
    if (!videoUrl) {
      const windowVars = html.match(/window\.(?:video_url|file|src|source|mediaUrl|playlist|manifest)\s*=\s*["']([^"']+)["']/gi);
      if (windowVars) {
        for (let match of windowVars) {
          const extracted = match.match(/["']([^"']+)["']/);
          if (extracted && extracted[1] && (extracted[1].includes('.m3u8') || extracted[1].includes('.mp4') || extracted[1].includes('.webm'))) {
            videoUrl = extracted[1];
            foundMethod = 'window-variable';
            break;
          }
        }
      }
    }

    // Pattern 5: Full page scan (last resort)
    if (!videoUrl) {
      const matches = html.match(/https?:\/\/[^\s"']+\.(?:m3u8|mp4|webm|mkv)[^\s"']*/gi);
      if (matches && matches.length > 0) {
        // Filter out common false positives
        const validMatches = matches.filter(m => 
          !m.includes('.js') && 
          !m.includes('.css') && 
          !m.includes('.html') &&
          !m.includes('.xml') &&
          !m.includes('.json')
        );
        if (validMatches.length > 0) {
          videoUrl = validMatches[0];
          foundMethod = 'full-page-scan';
        }
      }
    }

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return { 
      videoUrl: videoUrl ? cleanUrl(videoUrl, url) : null, 
      method: foundMethod,
      timeTaken
    };

  } catch (error) {
    console.error('Cheerio extraction error:', error.message);
    return { videoUrl: null, method: null, error: error.message };
  }
}

// ============================================
// 🕷️ Extraction Method 2: Puppeteer (Thorough)
// ============================================
async function extractWithPuppeteer(url) {
  const startTime = Date.now();
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set user agent and headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Referer': 'https://www.diskwala.com/',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    });
    
    // Navigate to page
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    // Wait a bit for any dynamic content
    await page.waitForTimeout(2000);

    // Execute JavaScript in page context
    const videoUrl = await page.evaluate(() => {
      // Function to check if URL is a video
      const isVideoUrl = (url) => {
        if (!url) return false;
        return url.includes('.m3u8') || url.includes('.mp4') || url.includes('.webm') || url.includes('.mkv');
      };

      // Try 1: Video element
      const video = document.querySelector('video');
      if (video) {
        if (isVideoUrl(video.src)) return video.src;
        const sources = video.querySelectorAll('source');
        for (let source of sources) {
          if (isVideoUrl(source.src)) return source.src;
        }
      }

      // Try 2: Source elements anywhere
      const allSources = document.querySelectorAll('source');
      for (let source of allSources) {
        if (isVideoUrl(source.src)) return source.src;
      }

      // Try 3: Script tags
      const scripts = document.querySelectorAll('script');
      const patterns = [
        /(?:file|src|video_url|url|source|videoSrc|mediaUrl|playlist|manifest)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|webm|mkv)[^"']*)["']/i,
        /https?:\/\/[^\s"']+\.(?:s3|cloudfront|cdn|storage)[^\s"']*\.(?:m3u8|mp4|webm)[^\s"']*/i
      ];
      
      for (let script of scripts) {
        const content = script.textContent || script.innerHTML || '';
        for (let pattern of patterns) {
          const match = content.match(pattern);
          if (match) {
            const url = match[1] || match[0];
            if (isVideoUrl(url)) return url;
          }
        }
      }

      // Try 4: Data attributes
      const elements = document.querySelectorAll('[data-video-url], [data-src], [data-file], [data-source]');
      for (let el of elements) {
        const src = el.getAttribute('data-video-url') || el.getAttribute('data-src') || el.getAttribute('data-file') || el.getAttribute('data-source');
        if (isVideoUrl(src)) return src;
      }

      // Try 5: Window object
      if (window.video_url && isVideoUrl(window.video_url)) return window.video_url;
      if (window.file && isVideoUrl(window.file)) return window.file;
      if (window.src && isVideoUrl(window.src)) return window.src;
      if (window.mediaUrl && isVideoUrl(window.mediaUrl)) return window.mediaUrl;
      if (window.playlist && isVideoUrl(window.playlist)) return window.playlist;
      if (window.manifest && isVideoUrl(window.manifest)) return window.manifest;

      // Try 6: Body text search
      const bodyText = document.body.innerText || '';
      const urlMatches = bodyText.match(/https?:\/\/[^\s"']+\.(?:m3u8|mp4|webm|mkv)[^\s"']*/gi);
      if (urlMatches && urlMatches.length > 0) {
        return urlMatches[0];
      }

      return null;
    });

    await browser.close();
    
    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    return { 
      videoUrl: videoUrl ? cleanUrl(videoUrl, url) : null, 
      method: 'puppeteer',
      timeTaken
    };

  } catch (error) {
    console.error('Puppeteer extraction error:', error.message);
    if (browser) await browser.close();
    return { videoUrl: null, method: null, error: error.message };
  }
}

// ============================================
// 🎯 Main Extraction Function
// ============================================
async function extractVideo(url, usePuppeteer = false) {
  // First try with Cheerio (fast)
  let result = await extractWithCheerio(url);
  
  // If not found and puppeteer is allowed, try that
  if (!result.videoUrl && usePuppeteer) {
    console.log('🔄 Cheerio failed, trying Puppeteer...');
    result = await extractWithPuppeteer(url);
  }
  
  // If still not found and we haven't tried puppeteer yet, try it as fallback
  if (!result.videoUrl && !usePuppeteer) {
    console.log('🔄 Trying Puppeteer as fallback...');
    result = await extractWithPuppeteer(url);
  }
  
  return result;
}

// ============================================
// 📡 API Endpoints
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Extract video URL
app.post('/api/extract', async (req, res) => {
  const { url, usePuppeteer = false } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required',
      message: 'Please provide a DiskWala share URL'
    });
  }

  // Validate URL format
  if (!url.includes('diskwala.com')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL',
      message: 'URL must be from diskwala.com domain'
    });
  }

  try {
    console.log(`📥 Processing: ${url}`);
    
    const result = await extractVideo(url, usePuppeteer);

    if (result.videoUrl) {
      return res.json({
        success: true,
        videoUrl: result.videoUrl,
        method: result.method,
        timeTaken: result.timeTaken,
        message: 'Video URL extracted successfully'
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'Video URL not found',
        message: 'Could not extract video URL. The page might be protected or use DRM.',
        debug: result.error || 'No video URL found in page'
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// Get embed code
app.post('/api/embed', async (req, res) => {
  const { url, usePuppeteer = false, width = '100%', height = 'auto' } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required'
    });
  }

  try {
    // First extract the video URL
    const result = await extractVideo(url, usePuppeteer);

    if (!result.videoUrl) {
      return res.status(404).json({
        success: false,
        error: 'Could not extract video URL'
      });
    }

    // Generate embed code
    const embedCode = `
<!-- DiskWala Video Embed -->
<div id="diskwala-player-container" style="position:relative; width:${width}; max-width:900px; margin:0 auto; background:#000; border-radius:12px; overflow:hidden;">
  <video 
    id="diskwala-video" 
    controls 
    controlslist="nodownload" 
    disablePictureInPicture
    style="width:100%; height:${height}; display:block;"
    src="${result.videoUrl}"
    preload="metadata"
    playsinline
  ></video>
  <div style="position:absolute; bottom:10px; right:15px; color:#666; font-size:12px; font-family:sans-serif; pointer-events:none; background:rgba(0,0,0,0.5); padding:2px 10px; border-radius:4px;">
    🔒 डाउनलोड अक्षम
  </div>
</div>
<script>
  (function() {
    const video = document.getElementById('diskwala-video');
    if (video) {
      // Disable right-click (Save As)
      video.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
      });
      
      // Disable keyboard shortcuts for saving
      video.addEventListener('keydown', function(e) {
        if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          return false;
        }
      });
      
      // Auto-play if possible
      video.addEventListener('loadedmetadata', function() {
        console.log('🎬 DiskWala video loaded');
      });
    }
  })();
</script>
<noscript>
  <p style="color:#999; text-align:center; padding:20px;">
    ⚠️ JavaScript enabled required to play video
  </p>
</noscript>
`;

    return res.json({
      success: true,
      videoUrl: result.videoUrl,
      method: result.method,
      timeTaken: result.timeTaken,
      embedCode: embedCode.trim(),
      embedHtml: embedCode.trim(),
      message: 'Embed code generated successfully'
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 🌐 Serve Frontend
// ============================================
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// ============================================
// 🚀 Start Server
// ============================================
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`\n📌 API Endpoints:`);
  console.log(`   POST /api/extract - Extract video URL`);
  console.log(`   POST /api/embed   - Get embed code`);
  console.log(`   GET  /api/health  - Health check`);
  console.log(`\n🔧 Features:`);
  console.log(`   ✅ Self-contained (no external proxy)`);
  console.log(`   ✅ Dual extraction methods (Cheerio + Puppeteer)`);
  console.log(`   ✅ Automatic fallback if first method fails`);
  console.log(`   ✅ Rate limiting and security headers`);
  console.log(`   ✅ Download disabled by default\n`);
});
