const axios = require('axios');

class DiskWalaService {
    constructor() {
        // Base API endpoint extracted from flowvideoplayer
        this.searchApi = 'https://diskwaladownloader.flowvideoplayer.com/searchVideo';
        
        // Zaroori headers taaki request block na ho
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://flowvideoplayer.com',
            'Referer': 'https://flowvideoplayer.com/',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache'
        };
    }

    /**
     * Main method: DiskWala URL se video data fetch karna
     */
    async fetchVideoLink(targetUrl) {
        try {
            console.log(`📡 Fetching from FlowVideo API: ${targetUrl}`);

            // 1. URL ko clean karein
            const cleanUrl = targetUrl.trim();

            // 2. FlowVideo Search API ko call karein
            // Note: Ye API 'url' query parameter leti hai
            const response = await axios.get(this.searchApi, {
                params: { url: cleanUrl },
                headers: this.headers,
                timeout: 15000 // 15 seconds timeout
            });

            const result = response.data;

            // 3. Response validation (FlowVideo API structure)
            if (result && (result.status === true || result.data)) {
                
                // FlowVideo API aksar data object me values bhejti hai
                const videoData = result.data || result;

                // Kuch API versions me direct values hoti hain, kuch me nested
                const finalUrl = videoData.file_url || videoData.url || videoData.download_url;
                const fileName = videoData.title || videoData.file_name || "DiskWala_Video";

                if (!finalUrl) {
                    throw new Error("API returned success but no video URL found.");
                }

                return {
                    success: true,
                    title: fileName,
                    videoUrl: finalUrl,
                    thumbnail: videoData.thumbnail || videoData.poster || null,
                    fileSize: videoData.file_size || videoData.size || "Unknown",
                    fileType: videoData.file_type || "video/mp4",
                    engine: 'FlowVideo-Bypass',
                    originalUrl: cleanUrl
                };

            } else {
                // Agar status false hai ya data nahi mila
                throw new Error(result.message || "Video not found or link expired.");
            }

        } catch (error) {
            console.error('❌ DiskWala Fetch Error:', error.message);
            
            // Agar pehla method fail ho, to fallback regex use karein (optional backup)
            return await this.fallbackRegexMethod(targetUrl);
        }
    }

    /**
     * Fallback Method: Agar main API down ho to direct page se link nikalne ki koshish karna
     */
    async fallbackRegexMethod(url) {
        try {
            console.log('⚠️ Attempting Fallback Extraction...');
            const response = await axios.get(url, { 
                headers: { 'User-Agent': this.headers['User-Agent'] } 
            });
            
            const html = response.data;

            // Regex for common video patterns in scripts
            const patterns = [
                /"file"\s*:\s*"([^"]+)"/,
                /"url"\s*:\s*"([^"]+)"/,
                /https?:\/\/[^"']+\.(?:mp4|m3u8|mkv)[^"']*/
            ];

            for (let pattern of patterns) {
                const match = html.match(pattern);
                if (match) {
                    const videoLink = match[1] || match[0];
                    if (videoLink.includes('http')) {
                        return {
                            success: true,
                            videoUrl: videoLink,
                            engine: 'Fallback-Regex',
                            originalUrl: url
                        };
                    }
                }
            }

            throw new Error("All methods failed to extract video link.");
        } catch (e) {
            throw new Error(`Extraction Failed: ${e.message}`);
        }
    }
}

module.exports = new DiskWalaService();
