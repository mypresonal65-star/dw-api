require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path'); // Added for serving static frontend files
const videoRoutes = require('./routes/video');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARES
// ==========================================
app.use(cors());
app.use(express.json());

// Frontend static files ko serve karne ke liye setup
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ROUTES
// ==========================================

// 1. Web Player UI Route
app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// 2. API Routes
app.use('/api', videoRoutes);

// 3. Root Route (API Information)
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🎬 DiskWala API & Video Player',
        status: 'Online',
        endpoints: {
            player: {
                method: 'GET',
                url: '/player',
                description: 'Web UI to paste link and play video instantly'
            },
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
        examples: {
            player: '/player',
            api: '/api/fetch?url=https://www.diskwala.com/app/6a99113406ba7ea03dae46ae'
        }
    });
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: err.message
    });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📺 Player UI: http://localhost:${PORT}/player`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/fetch?url=...`);
});
