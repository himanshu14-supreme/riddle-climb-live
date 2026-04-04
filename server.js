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
});

app.get('/api/riddle', (req, res) => {
    const query = 'SELECT * FROM riddles ORDER BY RAND() LIMIT 1';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        res.json(results[0]);
    });
});

// MULTIPLAYER LOGIC WITH NAMES
const roomPlayers = {}; // Stores { roomId: [ {id, name}, {id, name} ] }

io.on('connection', (socket) => {
    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        socket.join(roomId);
        
        if (!roomPlayers[roomId]) roomPlayers[roomId] = [];
        
        // Add player if not already in list
        if (roomPlayers[roomId].length < 2) {
            roomPlayers[roomId].push({ id: socket.id, name: playerName });
        }

        io.to(roomId).emit('playerCountUpdate', {
            count: roomPlayers[roomId].length,
            players: roomPlayers[roomId] 
        });
    });

    socket.on('startGameSignal', (roomId) => {
        io.to(roomId).emit('initGame', roomPlayers[roomId]);
    });

    socket.on('playerMove', (data) => {
        socket.to(data.roomId).emit('updateBoard', data);
    });

    socket.on('disconnect', () => {
        // Simple cleanup could be added here
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🚀 Server running`));
