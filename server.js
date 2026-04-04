const express = require('express');
const mysql = require('mysql2');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
require('dotenv').config();

app.use(express.static(path.join(__dirname, 'public')));

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect((err) => {
    if (err) console.error('❌ Database connection failed:', err.message);
    else console.log('✅ Connected to Railway MySQL Database');
});

app.get('/api/riddle', (req, res) => {
    const query = 'SELECT * FROM riddles ORDER BY RAND() LIMIT 1';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        res.json(results[0]);
    });
});

// MULTIPLAYER ROOM LOGIC
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);
    });

    socket.on('playerMove', (data) => {
        // Only broadcast to people in the same room
        socket.to(data.roomId).emit('updateBoard', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 Game Server running on port ${PORT}`);
});
