const express = require('express');
const router = express.Router();
const diskwalaService = require('../services/diskwalaService');

// GET /api/fetch?url=https://www.diskwala.com/app/XXXXX
router.get('/fetch', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL parameter is required',
                example: '/api/fetch?url=https://www.diskwala.com/app/6a99113406ba7ea03dae46ae'
            });
        }

        // Validate DiskWala URL
        if (!url.includes('diskwala.com')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid URL. Please provide a valid DiskWala URL'
            });
        }

        console.log(`🔍 Fetching video from: ${url}`);
        const result = await diskwalaService.fetchVideoLink(url);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Fetch Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/fetch/:id
router.get('/fetch/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const url = `https://www.diskwala.com/app/${id}`;

        console.log(`🔍 Fetching video by ID: ${id}`);
        const result = await diskwalaService.fetchVideoLink(url);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Fetch Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/fetch - For bulk fetching
router.post('/fetch', async (req, res) => {
    try {
        const { urls } = req.body;

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Please provide an array of URLs in body',
                example: { urls: ['https://www.diskwala.com/app/XXXXX'] }
            });
        }

        console.log(`🔍 Bulk fetching ${urls.length} videos...`);

        const results = await Promise.allSettled(
            urls.map(url => diskwalaService.fetchVideoLink(url))
        );

        const data = results.map((result, index) => ({
            url: urls[index],
            success: result.status === 'fulfilled',
            data: result.status === 'fulfilled' ? result.value : null,
            error: result.status === 'rejected' ? result.reason.message : null
        }));

        res.json({
            success: true,
            total: urls.length,
            fetched: data.filter(d => d.success).length,
            failed: data.filter(d => !d.success).length,
            results: data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
