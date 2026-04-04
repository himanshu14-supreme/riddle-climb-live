const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
require('dotenv').config();

app.use(express.static(path.join(__dirname, 'public')));

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10
});

const roomPlayers = {}; 
const socketToRoom = {}; // Track which room a socket belongs to

io.on('connection', (socket) => {
    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        socket.join(roomId);
        socketToRoom[socket.id] = roomId; // Store mapping
        
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
        if (roomPlayers[roomId] && roomPlayers[roomId].length >= 2) {
            io.to(roomId).emit('initGame', roomPlayers[roomId]);
        }
    });

    socket.on('playerMove', (data) => {
        socket.to(data.roomId).emit('updateBoard', data);
    });

    socket.on('triggerSteal', (data) => {
        socket.to(data.roomId).emit('receiveSteal', data);
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && roomPlayers[roomId]) {
            // Find the player who left
            const leaver = roomPlayers[roomId].find(p => p.id === socket.id);
            if (leaver) {
                // Notify the other player in the room
                socket.to(roomId).emit('playerLeft', { name: leaver.name });
            }
            // Clean up the room data
            roomPlayers[roomId] = roomPlayers[roomId].filter(p => p.id !== socket.id);
            delete socketToRoom[socket.id];
            
            if (roomPlayers[roomId].length === 0) {
                delete roomPlayers[roomId];
            }
        }
    });
});

app.get('/api/riddle', (req, res) => {
    db.query('SELECT * FROM riddles ORDER BY RAND() LIMIT 1', (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: 'DB Error' });
        res.json(results[0]);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
