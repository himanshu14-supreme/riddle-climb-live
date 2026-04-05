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
    
    // --- AUTHENTICATION ---
    socket.on('auth_register', (data) => {
        const { user, pass } = data;
        db.query('SELECT * FROM users WHERE username = ?', [user], (err, results) => {
            if (results.length > 0) {
                socket.emit('auth_error', 'Username already exists.');
            } else {
                db.query('INSERT INTO users (username, password) VALUES (?, ?)', [user, pass], (err, result) => {
                    if (err) return socket.emit('auth_error', 'Database error.');
                    socket.emit('auth_success', {
                        username: user, coins: 600, xp: 0,
                        inventory: ['avatar_default', 'ability_none'],
                        selectedAvatar: 'avatar_default', selectedAbility: 'ability_none'
                    });
                });
            }
        });
    });

    socket.on('auth_login', (data) => {
        const { user, pass } = data;
        db.query('SELECT * FROM users WHERE username = ? AND password = ?', [user, pass], (err, results) => {
            if (results.length > 0) {
                const u = results[0];
                socket.emit('auth_success', {
                    username: u.username, coins: u.coins, xp: u.xp,
                    inventory: typeof u.inventory === 'string' ? JSON.parse(u.inventory) : u.inventory,
                    selectedAvatar: u.selectedAvatar, selectedAbility: u.selectedAbility
                });
                socket.username = u.username;
            } else {
                socket.emit('auth_error', 'Invalid credentials.');
            }
        });
    });

    socket.on('save_data', (data) => {
        if (socket.username) {
            db.query(`UPDATE users SET coins = ?, xp = ?, inventory = ?, selectedAvatar = ?, selectedAbility = ? WHERE username = ?`,
                [data.coins, data.xp, JSON.stringify(data.inventory), data.selectedAvatar, data.selectedAbility, socket.username]);
        }
    });

    // --- GAME LOGIC ---
    socket.on('joinRoom', (data) => {
        const { roomId, playerName, maxPlayers, avatar, ability } = data;
        
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
                id: socket.id, name: playerName, 
                avatar: avatar || 'avatar_default', ability: ability || 'ability_none',
                isHost: room.players.length === 0, pos: 100 
            });

            io.to(roomId).emit('playerCountUpdate', {
                count: room.players.length, max: room.maxPlayers, players: room.players 
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
            if (err || results.length === 0) return; 
            
            // Start server-side timeout buffer (31 seconds)
            room.state = { 
                answers: [], 
                riddle: results[0],
                timer: setTimeout(() => evaluateRound(roomId), 31000) 
            };
            io.to(roomId).emit('startRiddleRound', results[0]);
        });
    });

    socket.on('submitAnswer', (data) => {
        const room = rooms[data.roomId];
        if (!room || !room.state) return;

        if (room.state.answers.find(a => a.id === socket.id)) return;

        room.state.answers.push({
            id: socket.id,
            isCorrect: (data.selected === room.state.riddle.answer),
            time: data.timeTaken || 30000
        });

        // If everyone answered before the timeout, evaluate early
        if (room.state.answers.length === room.players.length) {
            evaluateRound(data.roomId);
        }
    });

    // Centralized logic to evaluate rounds
    function evaluateRound(roomId) {
        const room = rooms[roomId];
        if (!room || !room.state) return;

        clearTimeout(room.state.timer); // Cancel the backup timeout

        // Fill in missing answers (for players who disconnected or timed out)
        room.players.forEach(p => {
            if (!room.state.answers.find(a => a.id === p.id)) {
                room.state.answers.push({ id: p.id, isCorrect: false, time: 30000 });
            }
        });

        const sorted = [...room.state.answers].sort((a, b) => a.time - b.time);
        const results = [];
        let correctFound = 0;
        let winner = null;
        const correctAnswer = room.state.riddle.answer;

        sorted.forEach((ans) => {
            const player = room.players.find(p => p.id === ans.id);
            if (!player) return; // Ignore if player left
            let steps = 0;

            if (ans.isCorrect) {
                correctFound++;
                steps = correctFound === 1 ? 3 : (correctFound === 2 ? 2 : 1);
                player.pos = Math.max(1, player.pos - steps);

                if (player.ability === 'ability_fire_sword') {
                    room.players.forEach((rival, idx) => {
                        if (rival.id !== player.id && rival.pos === player.pos) {
                            rival.pos = Math.min(100, rival.pos + 10);
                            io.to(roomId).emit('abilityTriggered', { victimIdx: idx });
                        }
                    });
                }

                if (player.pos === 1 && !winner) winner = player;
            }

            results.push({ name: player.name, time: (ans.time/1000).toFixed(2), steps, isCorrect: ans.isCorrect });
        });

        // Pass the correctAnswer down to the clients so they can color the UI
        io.to(roomId).emit('roundResults', { players: room.players, results, correctAnswer });
        
        if (winner) {
            setTimeout(() => {
                io.to(roomId).emit('gameOver', winner);
                delete rooms[roomId];
            }, 5500); // Wait long enough for animations to finish
        }
        room.state = null;
    }

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            // Feature 3: Find the player who left and emit to the room
            const disconnectedPlayer = rooms[roomId].players.find(p => p.id === socket.id);
            if (disconnectedPlayer) {
                io.to(roomId).emit('playerDisconnected', disconnectedPlayer.name);
            }

            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                if (rooms[roomId].state) clearTimeout(rooms[roomId].state.timer);
                delete rooms[roomId];
            } else {
                // If players remain, optionally re-emit the player count update so waiting rooms update dynamically
                io.to(roomId).emit('playerCountUpdate', {
                    count: rooms[roomId].players.length, max: rooms[roomId].maxPlayers, players: rooms[roomId].players 
                });
            }
            delete socketToRoom[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
