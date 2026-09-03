require('dotenv').config();
const express = require('express');
const cors = require('cors');
const videoRoutes = require('./routes/video');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', videoRoutes);

// Root route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🎬 DiskWala Video Fetcher API',
        endpoints: {
            fetchVideo: {
                method: 'GET',
                url: '/api/fetch?url=DISKWALA_URL',
                description: 'Fetch actual video link from DiskWala URL'
            },
            fetchById: {
                method: 'GET',
                url: '/api/fetch/:id',
                description: 'Fetch video by DiskWala ID'
            }
        },
        example: '/api/fetch?url=https://www.diskwala.com/app/6a99113406ba7ea03dae46ae'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: err.message
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/fetch?url=YOUR_DISKWALA_URL`);
});
