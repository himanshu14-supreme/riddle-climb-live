const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
require('dotenv').config();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection Pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10
});

const rooms = {}; 
const socketToRoom = {};

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // --- 1. ROOM HANDLING ---
    socket.on('joinRoom', (data) => {
        const { roomId, playerName, maxPlayers } = data;
        
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
            
            const isHost = room.players.length === 0;
            // All players start at cell 100 (The Bottom)
            room.players.push({ 
                id: socket.id, 
                name: playerName || "Guest", 
                isHost: isHost, 
                pos: 100 
            });

            console.log(`${playerName} joined room ${roomId}`);

            io.to(roomId).emit('playerCountUpdate', {
                count: room.players.length, 
                max: room.maxPlayers, 
                players: room.players 
            });
        } else {
            socket.emit('error', 'The Arena is currently full.');
        }
    });

    // --- 2. GAME START ---
    socket.on('startGameSignal', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length >= 2) {
            io.to(roomId).emit('initGame', { players: room.players, max: room.maxPlayers });
        }
    });

    // --- 3. RIDDLE LOGIC ---
    socket.on('requestRiddle', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        db.query('SELECT * FROM riddles ORDER BY RAND() LIMIT 1', (err, results) => {
            if (err || results.length === 0) {
                console.error("DB Error or No Riddles Found:", err);
                return;
            }
            
            // Initialize round state
            room.state = { 
                answers: [], 
                riddle: results[0] 
            };

            io.to(roomId).emit('startRiddleRound', results[0]);
        });
    });

    // --- 4. ANSWER SUBMISSION & SCORING ---
    socket.on('submitAnswer', (data) => {
        const { roomId, selected, timeTaken } = data;
        const room = rooms[roomId];
        if (!room || !room.state) return;

        // Prevent duplicate submissions from same socket in one round
        if (room.state.answers.find(a => a.socketId === socket.id)) return;

        room.state.answers.push({
            socketId: socket.id,
            isCorrect: (selected === room.state.riddle.answer),
            time: timeTaken,
            selected: selected
        });

        // Check if everyone has submitted
        if (room.state.answers.length === room.players.length) {
            // Sort by fastest time
            const sorted = [...room.state.answers].sort((a, b) => a.time - b.time);
            const roundResults = [];
            let correctCount = 0;
            let matchWinner = null;

            sorted.forEach((ans) => {
                const player = room.players.find(p => p.id === ans.socketId);
                let stepsGained = 0;

                if (ans.isCorrect) {
                    correctCount++;
                    // Scoring logic: 1st=3, 2nd=2, others=1
                    if (correctCount === 1) stepsGained = 3;
                    else if (correctCount === 2) stepsGained = 2;
                    else stepsGained = 1;

                    // Move player (Climbing towards 1)
                    player.pos = Math.max(1, player.pos - stepsGained);

                    // Check if player hit the finish line
                    if (player.pos === 1 && !matchWinner) {
                        matchWinner = player;
                    }
                }

                roundResults.push({
                    name: player.name,
                    time: (ans.time / 1000).toFixed(2),
                    steps: stepsGained,
                    isCorrect: ans.isCorrect
                });
            });

            // Broadcast results for the 1-second leaderboard flash
            io.to(roomId).emit('roundResults', {
                players: room.players,
                results: roundResults,
                correctAnswer: room.state.riddle.answer
            });

            // Handle Victory
            if (matchWinner) {
                // Wait 2.5s: 0.8s (modal highlight) + 1.0s (leaderboard) + 0.7s (buffer)
                setTimeout(() => {
                    io.to(roomId).emit('gameOver', matchWinner);
                    delete rooms[roomId]; // Close room after win
                }, 2500);
            }

            room.state = null; // Reset round state for next roll
        }
    });

    // --- 5. DISCONNECTS ---
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('playerLeft', { id: socket.id });
                // If the host left, reassign host to the next player
                if (room.players.length > 0) {
                    room.players[0].isHost = true;
                    io.to(roomId).emit('playerCountUpdate', {
                        count: room.players.length,
                        max: room.maxPlayers,
                        players: room.players
                    });
                }
            }
            delete socketToRoom[socket.id];
        }
        console.log(`User Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`
    ====================================
    🚀 SERVER ACTIVE ON PORT: ${PORT}
    🎮 ARENA IS READY FOR PLAYERS
    ====================================
    `);
});
