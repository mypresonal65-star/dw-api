const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Helper: Clean URL
function cleanUrl(url, baseUrl) {
  if (!url) return null;
  url = url.replace(/^["']|["']$/g, '').trim();
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      url = base.origin + url;
    } catch (e) { return null; }
  }
  try {
    new URL(url);
    return url;
  } catch (error) { return null; }
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
        'Referer': 'https://www.diskwala.com/',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    });

    const html = response.data;
    const $ = cheerio.load(html);
    let videoUrl = null;
    let foundMethod = null;

    // Pattern 1: Video tag
    $('video[src], video source[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src && (src.includes('.m3u8') || src.includes('.mp4') || src.includes('.webm'))) {
        videoUrl = src;
        foundMethod = 'video-tag';
        return false;
      }
    });

    // Pattern 2: JavaScript variables
    if (!videoUrl) {
      const scripts = $('script').map((i, el) => $(el).html()).get();
      const patterns = [
        /(?:file|src|video_url|url|source|videoSrc|mediaUrl|playlist|manifest)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|webm)[^"']*)["']/gi,
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
      $('[data-video-url], [data-src], [data-file], [data-source]').each((i, el) => {
        const src = $(el).attr('data-video-url') || $(el).attr('data-src') || $(el).attr('data-file') || $(el).attr('data-source');
        if (src && (src.includes('.m3u8') || src.includes('.mp4') || src.includes('.webm'))) {
          videoUrl = src;
          foundMethod = 'data-attribute';
          return false;
        }
      });
    }

    // Pattern 4: Full page scan
    if (!videoUrl) {
      const matches = html.match(/https?:\/\/[^\s"']+\.(?:m3u8|mp4|webm)[^\s"']*/gi);
      if (matches && matches.length > 0) {
        const validMatches = matches.filter(m => 
          !m.includes('.js') && !m.includes('.css') && !m.includes('.html') &&
          !m.includes('.xml') && !m.includes('.json')
        );
        if (validMatches.length > 0) {
          videoUrl = validMatches[0];
          foundMethod = 'full-page-scan';
        }
      }
    }

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    return { videoUrl: videoUrl ? cleanUrl(videoUrl, url) : null, method: foundMethod, timeTaken };
  } catch (error) {
    console.error('Cheerio error:', error.message);
    return { videoUrl: null, method: null, error: error.message };
  }
}

// ============================================
// 🕷️ Extraction Method 2: Puppeteer (Fallback)
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Referer': 'https://www.diskwala.com/' });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const videoUrl = await page.evaluate(() => {
      const isVideoUrl = (url) => url && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.webm'));
      
      const video = document.querySelector('video');
      if (video) {
        if (isVideoUrl(video.src)) return video.src;
        const sources = video.querySelectorAll('source');
        for (let source of sources) {
          if (isVideoUrl(source.src)) return source.src;
        }
      }
      
      const sources = document.querySelectorAll('source');
      for (let source of sources) {
        if (isVideoUrl(source.src)) return source.src;
      }
      
      const scripts = document.querySelectorAll('script');
      const patterns = [
        /(?:file|src|video_url|url|source|videoSrc|mediaUrl|playlist|manifest)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4|webm)[^"']*)["']/i,
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
      
      const elements = document.querySelectorAll('[data-video-url], [data-src], [data-file], [data-source]');
      for (let el of elements) {
        const src = el.getAttribute('data-video-url') || el.getAttribute('data-src') || el.getAttribute('data-file') || el.getAttribute('data-source');
        if (isVideoUrl(src)) return src;
      }
      
      if (window.video_url && isVideoUrl(window.video_url)) return window.video_url;
      if (window.file && isVideoUrl(window.file)) return window.file;
      if (window.src && isVideoUrl(window.src)) return window.src;
      if (window.mediaUrl && isVideoUrl(window.mediaUrl)) return window.mediaUrl;
      
      return null;
    });

    await browser.close();
    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    return { videoUrl: videoUrl ? cleanUrl(videoUrl, url) : null, method: 'puppeteer', timeTaken };
  } catch (error) {
    console.error('Puppeteer error:', error.message);
    if (browser) await browser.close();
    return { videoUrl: null, method: null, error: error.message };
  }
}

// ============================================
// 🎯 Main Extraction Function
// ============================================
async function extractVideo(url, usePuppeteer = false) {
  let result = await extractWithCheerio(url);
  if (!result.videoUrl && usePuppeteer) {
    console.log('🔄 Cheerio failed, trying Puppeteer...');
    result = await extractWithPuppeteer(url);
  }
  if (!result.videoUrl && !usePuppeteer) {
    console.log('🔄 Trying Puppeteer as fallback...');
    result = await extractWithPuppeteer(url);
  }
  return result;
}

// ============================================
// 📡 API Endpoints
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

app.post('/api/extract', async (req, res) => {
  const { url, usePuppeteer = false } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }
  if (!url.includes('diskwala.com')) {
    return res.status(400).json({ success: false, error: 'Invalid URL', message: 'URL must be from diskwala.com' });
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
        debug: result.error || 'No video URL found'
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/embed', async (req, res) => {
  const { url, usePuppeteer = false, width = '100%', height = 'auto' } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  try {
    const result = await extractVideo(url, usePuppeteer);
    if (!result.videoUrl) {
      return res.status(404).json({ success: false, error: 'Could not extract video URL' });
    }

    const embedCode = `
<div style="position:relative; width:${width}; max-width:900px; margin:0 auto; background:#000; border-radius:12px; overflow:hidden;">
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
      video.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
      video.addEventListener('keydown', function(e) {
        if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          return false;
        }
      });
    }
  })();
</script>`;

    return res.json({
      success: true,
      videoUrl: result.videoUrl,
      method: result.method,
      timeTaken: result.timeTaken,
      embedCode: embedCode.trim(),
      message: 'Embed code generated successfully'
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Frontend
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📌 POST /api/extract - Extract video URL`);
  console.log(`📌 POST /api/embed - Get embed code`);
});
