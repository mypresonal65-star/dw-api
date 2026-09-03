const axios = require('axios');

class DiskWalaService {
    constructor() {
        // Hum isi API ko as a source use karenge jo aapne dhunda hai
        this.helperApi = 'https://diskwaladownloader.flowvideoplayer.com/searchVideo';
        
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://flowvideoplayer.com',
            'Referer': 'https://flowvideoplayer.com/'
        };
    }

    async fetchVideoLink(targetUrl) {
        try {
            console.log(`🚀 Fetching via Bypass API for: ${targetUrl}`);

            // 1. Clean the URL (remove extra spaces/slashes)
            const cleanUrl = targetUrl.trim();

            // 2. Call the Discovery API
            const response = await axios.get(this.helperApi, {
                params: { url: cleanUrl },
                headers: this.headers,
                timeout: 10000
            });

            const result = response.data;

            // DiskWala Downloader API typically returns data in 'data' object or directly
            if (result && (result.status === true || result.success === true || result.data)) {
                
                // Response format handle kar rahe hain (based on flowvideoplayer structure)
                const videoData = result.data || result;

                return {
                    success: true,
                    title: videoData.title || videoData.file_name || "DiskWala Video",
                    videoUrl: videoData.file_url || videoData.download_url || videoData.url,
                    thumbnail: videoData.thumbnail || videoData.poster || null,
                    fileSize: videoData.file_size || videoData.size || null,
                    source: 'DiskWala Bypass API',
                    originalUrl: cleanUrl
                };
            } else {
                throw new Error(result.message || 'Bypass API could not find the video.');
            }

        } catch (error) {
            console.error('❌ Bypass API Error:', error.message);
            
            // Agar Bypass API fail ho jaye, tabhi purana basic method try karein
            return await this.fallbackMethod(targetUrl);
        }
    }

    // Backup method agar helper API down ho jaye
    async fallbackMethod(url) {
        try {
            console.log('⚠️ Falling back to direct extraction...');
            const response = await axios.get(url, { headers: this.headers });
            const html = response.data;
            
            // Regex to find direct mp4/m3u8 in scripts
            const match = html.match(/(https?:\/\/[^"']*\.(?:mp4|m3u8)[^"']*)/i);
            
            if (match) {
                return {
                    success: true,
                    videoUrl: match[0],
                    method: 'Regex Fallback',
                    originalUrl: url
                };
            }
            throw new Error('All methods failed to fetch video.');
        } catch (e) {
            throw new Error('Video not found or link expired.');
        }
    }
}

module.exports = new DiskWalaService();
