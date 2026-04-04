const express = require('express');
const mysql = require('mysql2');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
require('dotenv').config();

// FIX: Serve files from the root directory instead of /public
app.use(express.static(__dirname)); 

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect((err) => {
    if (err) console.error('❌ DB Error:', err.message);
});

app.get('/api/riddle', (req, res) => {
    db.query('SELECT * FROM riddles ORDER BY RAND() LIMIT 1', (err, results) => {
        if (err) return res.status(500).json({ error: 'Query failed' });
        res.json(results[0]);
    });
});

const roomPlayers = {}; 

io.on('connection', (socket) => {
    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        socket.join(roomId);
        if (!roomPlayers[roomId]) roomPlayers[roomId] = [];
        if (roomPlayers[roomId].length < 2) {
            roomPlayers[roomId].push({ id: socket.id, name: playerName || "Guest" });
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
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🚀 Server Live on Port ${PORT}`));
