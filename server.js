const express = require('express');
const mysql = require('mysql2');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
require('dotenv').config();

app.use(express.static(path.join(__dirname, 'public')));

// DATABASE CONNECTION
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

// RIDDLE API
app.get('/api/riddle', (req, res) => {
    const query = 'SELECT * FROM riddles ORDER BY RAND() LIMIT 1';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        res.json(results[0]);
    });
});

// SOCKET.IO ROOM & WAITING LOGIC
io.on('connection', (socket) => {
    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        
        // Count players in this specific room
        const clients = io.sockets.adapter.rooms.get(roomId);
        const numClients = clients ? clients.size : 0;

        // Update everyone in that room with the new count
        io.to(roomId).emit('playerCountUpdate', numClients);
    });

    socket.on('startGameSignal', (roomId) => {
        // Send signal to all players in room to switch from Waiting to Game screen
        io.to(roomId).emit('initGame');
    });

    socket.on('playerMove', (data) => {
        socket.to(data.roomId).emit('updateBoard', data);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));
