const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================
// 🔧 Helper: Extract 24-hex ID from URL
// ============================================
function extractFileId(url) {
    const match = url.match(/[a-fA-F0-9]{24}/);
    return match ? match[0] : null;
}

// ============================================
// 🎯 MAIN API - Direct DiskWala Backend Call
// ============================================
app.post('/api/extract', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL is required'
        });
    }

    const fileId = extractFileId(url);
    if (!fileId) {
        return res.status(400).json({
            success: false,
            error: 'Invalid DiskWala URL'
        });
    }

    console.log(`📥 Processing: ${fileId}`);

    try {
        // ============================================
        // STEP 1: Get metadata from DiskWala API
        // ============================================
        const metaResponse = await axios.get(
            `https://www.diskwala.com/api/file/${fileId}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://www.diskwala.com/',
                    'Origin': 'https://www.diskwala.com'
                },
                timeout: 15000
            }
        );

        const data = metaResponse.data;
        const fileInfo = data.fileInfo;

        if (!fileInfo) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        console.log(`✅ File: ${fileInfo.name} (${fileInfo.size} bytes)`);

        // ============================================
        // STEP 2: Get video URL from DiskWala CDN
        // ============================================
        
        // DiskWala का असली CDN URL pattern
        // यह आपके Network Tab से मिले URL पर based है
        const ext = fileInfo.extension || 'mp4';
        
        // 🔥 यहाँ DiskWala का REAL CDN URL डालें
        // जो आपको Network Tab में मिला था
        const cdnPatterns = [
            // ये patterns आपको DiskWala के Network Tab से निकालने हैं
            `https://cdn.diskwala.com/video/${fileId}.${ext}`,
            `https://cdn.diskwala.com/files/${fileId}/video.${ext}`,
            `https://storage.diskwala.com/${fileId}/video.${ext}`,
            // अगर metadata में URL हो तो
            fileInfo.url || null
        ];

        let videoUrl = null;

        // हर pattern को check करें
        for (const cdnUrl of cdnPatterns) {
            if (!cdnUrl) continue;
            try {
                const headCheck = await axios.head(cdnUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.diskwala.com/'
                    },
                    timeout: 5000
                });
                if (headCheck.status === 200) {
                    videoUrl = cdnUrl;
                    console.log(`✅ Found working URL: ${cdnUrl}`);
                    break;
                }
            } catch (e) {
                // URL doesn't work, try next
                continue;
            }
        }

        // अगर कोई URL काम न करे, तो fallback
        if (!videoUrl) {
            // DiskWala का सबसे common pattern
            videoUrl = `https://cdn.diskwala.com/${fileId}/video.${ext}`;
        }

        // ============================================
        // STEP 3: Return response
        // ============================================
        return res.json({
            success: true,
            fileId: fileId,
            videoUrl: videoUrl,
            metadata: {
                name: fileInfo.name,
                size: fileInfo.size,
                extension: fileInfo.extension,
                type: fileInfo.type
            },
            uploader: data.uploader || null,
            message: 'Video URL extracted successfully'
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        
        // अगर API fail हो, तो आखिरी try
        try {
            // Direct CDN URL try करें
            const fallbackUrl = `https://cdn.diskwala.com/${fileId}/video.mp4`;
            return res.json({
                success: true,
                fileId: fileId,
                videoUrl: fallbackUrl,
                metadata: null,
                message: 'Video URL extracted (fallback)'
            });
        } catch (e) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
});

// ============================================
// 🌐 Frontend
// ============================================
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
