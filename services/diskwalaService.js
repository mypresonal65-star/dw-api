const axios = require('axios');
const cheerio = require('cheerio');

class DiskWalaService {
    constructor() {
        this.baseUrl = 'https://diskwaladownloader.flowvideoplayer.com';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
            'Accept': 'application/json, text/plain, */*'
        };
    }

    async fetchVideoLink(targetUrl) {
        try {
            console.log('1. Fetching CSRF Token & Cookies...');
            
            // STEP 1: Get Homepage to extract CSRF Token and Cookies
            const initResponse = await axios.get(this.baseUrl, { headers: this.headers });
            
            // Extract Cookies (Laravel session)
            const cookies = initResponse.headers['set-cookie'];
            const cookieString = cookies ? cookies.map(c => c.split(';')[0]).join('; ') : '';

            // Extract CSRF Token using Cheerio
            const $ = cheerio.load(initResponse.data);
            const csrfToken = $('meta[name="csrf-token"]').attr('content');

            if (!csrfToken) {
                throw new Error("Could not bypass security: CSRF Token not found.");
            }

            console.log('2. Hitting API with Token:', csrfToken);

            // STEP 2: Make POST Request to API
            const apiResponse = await axios.post(`${this.baseUrl}/searchVideo`, 
                { url: targetUrl.trim() },
                {
                    headers: {
                        ...this.headers,
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                        'Cookie': cookieString, // Required for Laravel CSRF validation
                        'Origin': this.baseUrl,
                        'Referer': this.baseUrl + '/'
                    }
                }
            );

            const data = apiResponse.data;

            if (data.status === true && data.response && data.response.length > 0) {
                const videoData = data.response[0];
                
                return {
                    success: true,
                    title: videoData.file_name,
                    fileSize: videoData.file_size,
                    // Note: As per their code, they don't send the actual MP4 link in this API
                    // They only send metadata to trick users into downloading their app
                    rawData: videoData,
                    note: "This API only provides metadata. The site redirects to Play Store for actual playback."
                };
            } else {
                throw new Error(data.message || "Video not found");
            }

        } catch (error) {
            console.error('Error:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new DiskWalaService();
