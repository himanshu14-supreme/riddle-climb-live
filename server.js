const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
require('dotenv').config();

app.use(express.static(path.join(__dirname, 'public')));

// Fallback DB connection (prevents crashing if not setup locally)
let db;
try {
    db = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'riddle_db',
        port: process.env.DB_PORT || 3306
    });
} catch(e) {
    console.log("DB Connection Warning - Running purely on sockets.");
}

const rooms = {}; 
const socketToRoom = {};

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // --- ROOM HANDLING ---
    socket.on('joinRoom', (data) => {
        const { roomId, playerName, maxPlayers, avatar } = data;
        
        if (!rooms[roomId]) {
            rooms[roomId] = { 
                players: [], 
                maxPlayers: parseInt(maxPlayers) || 2, 
                state: 'WAITING',
                turnIndex: 0
            };
        }

        const room = rooms[roomId];

        if (room.players.length < room.maxPlayers && room.state === 'WAITING') {
            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            
            room.players.push({ 
                id: socket.id, 
                name: playerName, 
                avatar: avatar || 'avatar_default',
                isHost: room.players.length === 0, 
                pos: 1, // Start at 1 on the Battlefield
                stunned: false
            });

            io.to(roomId).emit('playerCountUpdate', {
                count: room.players.length, 
                max: room.maxPlayers, 
                players: room.players 
            });
        }
    });

    socket.on('startGameSignal', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.state = 'PLAYING';
            io.to(roomId).emit('initGame', { players: room.players });
        }
    });

    // --- GAMEPLAY (Triggered after Client Dice Roll) ---
    socket.on('requestRiddle', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        // Dummy Riddle Fetch (Replace with db.query in production)
        const dummyRiddle = {
            question: "I speak without a mouth and hear without ears. What am I?",
            option_a: "A shadow", option_b: "An echo", option_c: "A ghost", option_d: "The wind",
            answer: "An echo"
        };
        
        room.state = { answers: [], riddle: dummyRiddle };
        io.to(roomId).emit('startRiddleRound', dummyRiddle);
    });

    socket.on('submitAnswer', (data) => {
        const room = rooms[data.roomId];
        if (!room || !room.state || !room.state.answers) return;

        // Ensure user hasn't answered yet
        if (!room.state.answers.find(a => a.id === socket.id)) {
            room.state.answers.push({
                id: socket.id,
                isCorrect: (data.selected === room.state.riddle.answer)
            });
        }

        // When all players answer, resolve round
        if (room.state.answers.length === room.players.length) {
            room.state.answers.forEach(ans => {
                const player = room.players.find(p => p.id === ans.id);
                if (ans.isCorrect && !player.stunned) {
                    player.pos = Math.min(100, player.pos + Math.floor(Math.random() * 6) + 1);
                } else if (player.stunned) {
                    player.stunned = false; // Remove stun next turn
                }
            });

            io.to(data.roomId).emit('roundResults', { players: room.players });
            room.state = 'PLAYING';
        }
    });

    // --- DISCONNECTS ---
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('playerCountUpdate', {
                    count: room.players.length,
                    max: room.maxPlayers,
                    players: room.players
                });
            }
            delete socketToRoom[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
