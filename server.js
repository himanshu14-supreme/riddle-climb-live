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

const rooms = {}; 
const socketToRoom = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', (data) => {
        const { roomId, playerName, maxPlayers } = data;
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], maxPlayers: parseInt(maxPlayers) || 2, state: null };
        }
        const room = rooms[roomId];
        if (room.players.length < room.maxPlayers) {
            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            const isHost = room.players.length === 0;
            room.players.push({ id: socket.id, name: playerName || "Guest", isHost: isHost, pos: 100 });
            io.to(roomId).emit('playerCountUpdate', { count: room.players.length, max: room.maxPlayers, players: room.players });
        } else {
            socket.emit('error', 'Room is full.');
        }
    });

    socket.on('startGameSignal', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length >= 2) {
            io.to(roomId).emit('initGame', { players: room.players });
        }
    });

    socket.on('requestRiddle', (roomId) => {
        db.query('SELECT * FROM riddles ORDER BY RAND() LIMIT 1', (err, results) => {
            if (err || results.length === 0) return;
            rooms[roomId].state = { answers: [], riddle: results[0] };
            io.to(roomId).emit('startRiddleRound', results[0]);
        });
    });

    socket.on('submitAnswer', (data) => {
        const { roomId, selected, timeTaken } = data;
        const room = rooms[roomId];
        if (!room || !room.state) return;

        if (room.state.answers.some(a => a.socketId === socket.id)) return;

        room.state.answers.push({
            socketId: socket.id,
            isCorrect: selected === room.state.riddle.answer,
            time: timeTaken
        });

        if (room.state.answers.length === room.players.length) {
            const sortedAnswers = [...room.state.answers].sort((a, b) => a.time - b.time);
            const results = [];
            let correctCount = 0;

            sortedAnswers.forEach((ans) => {
                const player = room.players.find(p => p.id === ans.socketId);
                let steps = 0;
                if (ans.isCorrect) {
                    correctCount++;
                    steps = correctCount === 1 ? 3 : (correctCount === 2 ? 2 : 1);
                    player.pos = Math.max(1, player.pos - steps);
                }
                results.push({ name: player.name, time: (ans.time / 1000).toFixed(2), steps, isCorrect: ans.isCorrect });
            });

            io.to(roomId).emit('roundResults', { players: room.players, results, correctAnswer: room.state.riddle.answer });
            room.state = null;
        }
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
            else io.to(roomId).emit('playerLeft');
            delete socketToRoom[socket.id];
        }
    });
});

http.listen(process.env.PORT || 3000, () => console.log('🚀 Server Live'));
