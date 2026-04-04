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
const roomStates = {}; // Tracks: { roomId: { answers: [], currentRiddle: {}, timer: null } }
const socketToRoom = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        
        if (!roomPlayers[roomId]) roomPlayers[roomId] = [];
        if (roomPlayers[roomId].length < 2) {
            // First player to join is the Host
            const isHost = roomPlayers[roomId].length === 0;
            roomPlayers[roomId].push({ id: socket.id, name: playerName || "Guest", isHost, pos: 100 });
        }

        io.to(roomId).emit('playerCountUpdate', {
            count: roomPlayers[roomId].length,
            players: roomPlayers[roomId] 
        });
    });

    // Only the host can trigger this
    socket.on('startGameSignal', (roomId) => {
        io.to(roomId).emit('initGame', roomPlayers[roomId]);
    });

    // HOST ONLY: Request a riddle for everyone
    socket.on('requestRiddle', (roomId) => {
        db.query('SELECT * FROM riddles ORDER BY RAND() LIMIT 1', (err, results) => {
            if (err || results.length === 0) return;
            
            const riddle = results[0];
            roomStates[roomId] = { 
                answers: [], 
                riddle: riddle,
                startTime: Date.now() 
            };
            
            // Send riddle to everyone in the room at once
            io.to(roomId).emit('startRiddleRound', riddle);
        });
    });

    socket.on('submitAnswer', (data) => {
        const { roomId, selected, timeTaken } = data;
        const state = roomStates[roomId];
        if (!state) return;

        // Record this player's attempt
        state.answers.push({
            socketId: socket.id,
            isCorrect: selected === state.riddle.answer,
            time: timeTaken
        });

        // Check if all joined players have answered
        if (state.answers.length === roomPlayers[roomId].length) {
            processResults(roomId);
        }
    });

    function processResults(roomId) {
        const state = roomStates[roomId];
        const players = roomPlayers[roomId];

        // Filter for correct answers and sort by fastest time
        const winners = state.answers
            .filter(a => a.isCorrect)
            .sort((a, b) => a.time - b.time);

        // Rank 1: 2 steps, Rank 2: 1 step
        winners.forEach((win, index) => {
            const player = players.find(p => p.id === win.socketId);
            const moveSteps = (index === 0) ? 2 : 1;
            player.pos = Math.max(1, player.pos - moveSteps);
        });

        io.to(roomId).emit('roundResults', {
            players: players,
            answers: state.answers // To show who got it right/wrong
        });
        
        delete roomStates[roomId];
    }

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && roomPlayers[roomId]) {
            const leaver = roomPlayers[roomId].find(p => p.id === socket.id);
            if (leaver) socket.to(roomId).emit('playerLeft', { name: leaver.name });
            roomPlayers[roomId] = roomPlayers[roomId].filter(p => p.id !== socket.id);
            if (roomPlayers[roomId].length === 0) delete roomPlayers[roomId];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
