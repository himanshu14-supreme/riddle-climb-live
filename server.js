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
    port: process.env.DB_PORT || 3306
});

const rooms = {}; 
const socketToRoom = {};

io.on('connection', (socket) => {

    socket.on('joinRoom', (data) => {
        const { roomId, playerName, maxPlayers, avatar } = data;
        
        if (!rooms[roomId]) {
            rooms[roomId] = { 
                players: [], 
                maxPlayers: parseInt(maxPlayers) || 2, 
                state: null 
            };
        }

        const room = rooms[roomId];
        if (room.players.length < room.maxPlayers) {
            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            
            room.players.push({ 
                id: socket.id, 
                name: playerName, 
                avatar: avatar || 'default', // Store their chosen skin
                isHost: room.players.length === 0, 
                pos: 100 
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
        if (room) io.to(roomId).emit('initGame', { players: room.players });
    });

    socket.on('requestRiddle', (roomId) => {
        const room = rooms[roomId];
        db.query('SELECT * FROM riddles ORDER BY RAND() LIMIT 1', (err, results) => {
            if (err) return;
            room.state = { answers: [], riddle: results[0] };
            io.to(roomId).emit('startRiddleRound', results[0]);
        });
    });

    socket.on('submitAnswer', (data) => {
        const room = rooms[data.roomId];
        if (!room || !room.state) return;

        // Prevent double submission
        if (room.state.answers.find(a => a.id === socket.id)) return;

        room.state.answers.push({
            id: socket.id,
            isCorrect: (data.selected === room.state.riddle.answer),
            time: data.timeTaken
        });

        if (room.state.answers.length === room.players.length) {
            const sorted = [...room.state.answers].sort((a, b) => a.time - b.time);
            const results = [];
            let correctFound = 0;
            let winner = null;

            sorted.forEach((ans) => {
                const player = room.players.find(p => p.id === ans.id);
                let steps = 0;

                if (ans.isCorrect) {
                    correctFound++;
                    steps = correctFound === 1 ? 3 : (correctFound === 2 ? 2 : 1);
                    player.pos = Math.max(1, player.pos - steps);

                    // --- ABILITY LOGIC: FIRE SWORD ---
                    if (player.avatar === 'knight') {
                        room.players.forEach((rival, idx) => {
                            if (rival.id !== player.id && rival.pos === player.pos) {
                                rival.pos = Math.min(100, rival.pos + 10); // Knock back 10 steps
                                io.to(data.roomId).emit('abilityTriggered', { victimIdx: idx });
                            }
                        });
                    }

                    if (player.pos === 1 && !winner) winner = player;
                }

                results.push({ name: player.name, time: (ans.time/1000).toFixed(2), steps, isCorrect: ans.isCorrect });
            });

            io.to(data.roomId).emit('roundResults', { players: room.players, results });
            
            if (winner) {
                setTimeout(() => {
                    io.to(data.roomId).emit('gameOver', winner);
                    delete rooms[data.roomId];
                }, 2500);
            }
            room.state = null;
        }
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
            delete socketToRoom[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
