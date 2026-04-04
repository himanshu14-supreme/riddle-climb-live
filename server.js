const express = require('express');
const mysql = require('mysql2'); // We use mysql2 for better cloud compatibility
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
require('dotenv').config(); // Loads variables from Render

app.use(express.static(path.join(__dirname, 'public')));

// 1. DATABASE CONNECTION
// These 'process.env' names must match exactly what you typed in Render's Environment tab
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Connected to Railway MySQL Database');
    }
});

// 2. THE RIDDLE API ROUTE
// This is the "bridge" between your game and your database
app.get('/api/riddle', (req, res) => {
    // We use 'riddles' (plural) to match your Railway screenshot
    const query = 'SELECT * FROM riddles ORDER BY RAND() LIMIT 1';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Query Error:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        // Send the random riddle back to the game
        res.json(results[0]);
    });
});

// 3. MULTIPLAYER LOGIC
io.on('connection', (socket) => {
    console.log('A player connected');
    socket.on('playerMove', (data) => {
        socket.broadcast.emit('updateBoard', data);
    });
});

// 4. START SERVER
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 Game Server running on port ${PORT}`);
});
