const axios = require('axios');

class DiskWalaService {
    constructor() {
        // ✅ Bypass API - जो आपने खोजा है
        this.helperApi = 'https://diskwaladownloader.flowvideoplayer.com/searchVideo';
        
        // ✅ Headers - FlowVideoPlayer की तरह दिखने के लिए
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://flowvideoplayer.com',
            'Referer': 'https://flowvideoplayer.com/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site'
        };
    }

    /**
     * 🚀 मुख्य मेथड - Bypass API से वीडियो लिंक प्राप्त करें
     */
    async fetchVideoLink(targetUrl) {
        try {
            console.log(`🚀 [Bypass API] Requesting for: ${targetUrl}`);

            // 1️⃣ URL को साफ (Clean) करें
            const cleanUrl = targetUrl.trim();

            // 2️⃣ Bypass API को कॉल करें
            const response = await axios.get(this.helperApi, {
                params: { url: cleanUrl },
                headers: this.headers,
                timeout: 15000 // 15 सेकंड टाइमआउट
            });

            // 3️⃣ रिस्पॉन्स डेटा को पार्स करें
            const result = response.data;
            console.log('📦 Bypass API Response:', JSON.stringify(result).substring(0, 200));

            // 4️⃣ सफलता की जाँच करें (कई तरह के रिस्पॉन्स फॉर्मेट के लिए)
            const isSuccess = result && (
                result.status === true || 
                result.success === true || 
                (result.data && result.data.file_url) ||
                (result.file_url)
            );

            if (!isSuccess) {
                throw new Error(result.message || 'Bypass API returned no video data.');
            }

            // 5️⃣ वीडियो डेटा निकालें (अलग-अलग फॉर्मेट सपोर्ट)
            const videoData = result.data || result;
            
            // 🎯 वीडियो URL ढूंढें (कई संभावित कीज़)
            const videoUrl = videoData.file_url || 
                            videoData.download_url || 
                            videoData.url || 
                            videoData.link || 
                            videoData.video_url ||
                            videoData.direct_link ||
                            null;

            if (!videoUrl) {
                throw new Error('No video URL found in Bypass API response.');
            }

            // 6️⃣ फॉर्मेटेड रिजल्ट लौटाएं
            return {
                success: true,
                title: videoData.title || videoData.file_name || videoData.name || 'DiskWala Video',
                videoUrl: videoUrl,
                thumbnail: videoData.thumbnail || videoData.poster || videoData.thumb || null,
                fileSize: videoData.file_size || videoData.size || videoData.filesize || null,
                duration: videoData.duration || null,
                source: 'DiskWala Bypass API',
                originalUrl: cleanUrl,
                rawData: videoData // डीबगिंग के लिए
            };

        } catch (error) {
            console.error('❌ Bypass API Error:', error.message);
            
            // 🔄 अगर Bypass API फेल हो, तो फॉलबैक मेथड आज़माएं
            return await this.fallbackMethod(targetUrl);
        }
    }

    /**
     * 🔄 फॉलबैक मेथड - अगर Bypass API डाउन हो या काम न करे
     */
    async fallbackMethod(url) {
        try {
            console.log('⚠️ [Fallback] Trying direct HTML extraction...');
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.headers['User-Agent'],
                    'Accept': 'text/html'
                },
                timeout: 10000
            });

            const html = response.data;
            
            // 🎯 Regex से वीडियो URL ढूंढें
            const patterns = [
                /(https?:\/\/[^"']*\.(?:mp4|m3u8|mkv|webm|avi)[^"']*)/i,
                /(https?:\/\/[^"']*\/download\/[^"']+)/i,
                /(https?:\/\/[^"']*\/stream\/[^"']+)/i
            ];

            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[0]) {
                    return {
                        success: true,
                        videoUrl: match[0],
                        title: 'DiskWala Video (Fallback)',
                        method: 'Regex Fallback',
                        originalUrl: url
                    };
                }
            }

            throw new Error('No video URL found in HTML fallback.');

        } catch (error) {
            console.error('❌ Fallback failed:', error.message);
            throw new Error(`All methods failed: ${error.message}`);
        }
    }

    /**
     * 🧪 हेल्पर: URL को वैलिडेट करें
     */
    isValidDiskWalaUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.includes('diskwala.com') || 
                   urlObj.pathname.includes('/app/');
        } catch {
            return false;
        }
    }
}

module.exports = new DiskWalaService();
