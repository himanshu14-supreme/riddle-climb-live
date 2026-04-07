const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
require('dotenv').config();

app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ludo_game',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const rooms = {};
const socketToRoom = {};

const RIDDLES = [
    { q: "What has keys but can't open locks?", options: ["Piano", "Door", "Map", "Computer"], answer: "Piano" },
    { q: "I speak without a mouth and hear without ears.", options: ["Echo", "Ghost", "Wind", "Sound"], answer: "Echo" },
    { q: "The more of this there is, the less you see.", options: ["Darkness", "Light", "Fog", "Shadow"], answer: "Darkness" },
    { q: "What gets wetter the more it dries?", options: ["Towel", "Soap", "Sponge", "Rain"], answer: "Towel" },
    { q: "I have cities but no houses. What am I?", options: ["Map", "Country", "Globe", "Atlas"], answer: "Map" },
    { q: "What can travel around the world while staying in a corner?", options: ["Stamp", "Letter", "Plane", "Bird"], answer: "Stamp" }
];

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
    // ==================== AUTHENTICATION ====================
    socket.on('auth_register', (data) => {
        const { user, pass } = data;
        
        db.query('SELECT * FROM users WHERE username = ?', [user], (err, results) => {
            if (err) {
                socket.emit('auth_error', 'Database error');
                return;
            }
            
            if (results && results.length > 0) {
                socket.emit('auth_error', 'Username already exists');
                return;
            }
            
            db.query(
                'INSERT INTO users (username, password, coins, xp, inventory, selectedAvatar, selectedAbility) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user, pass, 600, 0, JSON.stringify(['avatar_default', 'ability_none']), 'avatar_default', 'ability_none'],
                (err2) => {
                    if (err2) {
                        socket.emit('auth_error', 'Registration failed');
                        return;
                    }
                    
                    socket.username = user;
                    socket.emit('auth_success', {
                        username: user,
                        coins: 600,
                        xp: 0,
                        inventory: ['avatar_default', 'ability_none'],
                        selectedAvatar: 'avatar_default',
                        selectedAbility: 'ability_none'
                    });
                }
            );
        });
    });

    socket.on('auth_login', (data) => {
        const { user, pass } = data;
        
        db.query('SELECT * FROM users WHERE username = ? AND password = ?', [user, pass], (err, results) => {
            if (err) {
                socket.emit('auth_error', 'Database error');
                return;
            }
            
            if (results && results.length > 0) {
                const u = results[0];
                socket.username = u.username;
                
                const inventory = typeof u.inventory === 'string' ? JSON.parse(u.inventory) : u.inventory;
                
                socket.emit('auth_success', {
                    username: u.username,
                    coins: u.coins || 600,
                    xp: u.xp || 0,
                    inventory: inventory || ['avatar_default', 'ability_none'],
                    selectedAvatar: u.selectedAvatar || 'avatar_default',
                    selectedAbility: u.selectedAbility || 'ability_none'
                });
            } else {
                socket.emit('auth_error', 'Invalid username or password');
            }
        });
    });

    socket.on('save_data', (data) => {
        if (socket.username) {
            db.query(
                'UPDATE users SET coins=?, xp=?, inventory=?, selectedAvatar=?, selectedAbility=? WHERE username=?',
                [data.coins, data.xp, JSON.stringify(data.inventory), data.selectedAvatar, data.selectedAbility, socket.username],
                (err) => {
                    if (err) console.error('Save data error:', err);
                }
            );
        }
    });
    // ==================== ROOM MANAGEMENT ====================
    socket.on('createRoom', (data) => {
        const roomId = generateRoomCode();
        
        rooms[roomId] = {
            id: roomId,
            name: data.name || 'Game Room',
            host: socket.id,
            players: [
                {
                    id: socket.id,
                    name: socket.username || `Guest_${Math.floor(Math.random() * 9999)}`,
                    position: -1,
                    stunned: false,
                    selectedAvatar: 'avatar_default',
                    selectedAbility: 'ability_none'
                }
            ],
            state: 'LOBBY',
            currentTurnIndex: 0,
            duel: null
        };
        
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        
        socket.emit('roomCreated', { roomId });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
        
        console.log(`Room ${roomId} created by ${socket.username}`);
    });

    socket.on('joinRoom', (roomCode) => {
        const roomId = roomCode.toUpperCase();
        
        if (!rooms[roomId]) {
            socket.emit('auth_error', 'Room not found');
            return;
        }
        
        if (rooms[roomId].state !== 'LOBBY') {
            socket.emit('auth_error', 'Game already started');
            return;
        }
        
        if (rooms[roomId].players.length >= 4) {
            socket.emit('auth_error', 'Room is full');
            return;
        }
        
        rooms[roomId].players.push({
            id: socket.id,
            name: socket.username || `Guest_${Math.floor(Math.random() * 9999)}`,
            position: -1,
            stunned: false,
            selectedAvatar: 'avatar_default',
            selectedAbility: 'ability_none'
        });
        
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        
        socket.emit('roomJoined', {
            roomId,
            isHost: false
        });
        
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
        
        console.log(`Player ${socket.username} joined room ${roomId}`);
    });

    socket.on('leaveRoom', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted (empty)`);
            } else {
                io.to(roomId).emit('updatePlayers', rooms[roomId].players);
            }
        }
        
        socket.leave(roomId);
        delete socketToRoom[socket.id];
    });
    // ==================== GAME LOGIC ====================
    socket.on('startGame', (roomId) => {
        if (!rooms[roomId] || rooms[roomId].host !== socket.id) {
            socket.emit('auth_error', 'Only host can start game');
            return;
        }
        
        rooms[roomId].state = 'PLAYING';
        rooms[roomId].currentTurnIndex = 0;
        
        io.to(roomId).emit('gameStarted');
        
        setTimeout(() => {
            updateTurn(roomId);
        }, 1000);
        
        console.log(`Game started in room ${roomId}`);
    });

    socket.on('rollDice', (roomId) => {
        if (!rooms[roomId] || rooms[roomId].state !== 'PLAYING') {
            return;
        }
        
        const room = rooms[roomId];
        const currentPlayer = room.players[room.currentTurnIndex];
        
        if (currentPlayer.id !== socket.id) {
            socket.emit('auth_error', 'Not your turn');
            return;
        }
        
        const roll = Math.floor(Math.random() * 6) + 1;
        
        // Handle stunned player
        if (currentPlayer.stunned) {
            currentPlayer.stunned = false;
            currentPlayer.position = -1;
            
            io.to(roomId).emit('diceRolled', { 
                roll, 
                players: room.players 
            });
            
            setTimeout(() => {
                room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
                updateTurn(roomId);
            }, 2000);
            
            return;
        }
        
        // Move player
        if (currentPlayer.position === -1) {
            currentPlayer.position = 0;
        } else {
            currentPlayer.position += roll;
            
            if (currentPlayer.position >= 56) {
                currentPlayer.position = 56;
                io.to(roomId).emit('gameEnded', { 
                    msg: `${currentPlayer.name} won the game!` 
                });
                rooms[roomId].state = 'LOBBY';
                delete rooms[roomId];
                return;
            }
        }
        
        io.to(roomId).emit('diceRolled', { 
            roll, 
            players: room.players 
        });
        
        // Check for collision (duel)
        const otherPlayer = room.players.find(p => p.id !== socket.id && p.position === currentPlayer.position && p.position !== -1);
        
        if (otherPlayer) {
            setTimeout(() => {
                startDuel(roomId, currentPlayer, otherPlayer);
            }, 1500);
        } else {
            setTimeout(() => {
                room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
                updateTurn(roomId);
            }, 1500);
        }
    });

    function updateTurn(roomId) {
        if (!rooms[roomId]) return;
        
        const room = rooms[roomId];
        const activePlayer = room.players[room.currentTurnIndex];
        
        io.to(roomId).emit('turnUpdate', {
            activePlayerId: activePlayer.id,
            activePlayerName: activePlayer.name
        });
    }
    // ==================== DUEL SYSTEM ====================
    function startDuel(roomId, attacker, defender) {
        if (!rooms[roomId]) return;
        
        const riddle = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
        const room = rooms[roomId];
        
        room.state = 'DUEL';
        room.duel = {
            attacker: attacker,
            defender: defender,
            riddle: riddle,
            answers: {}
        };
        
        io.to(roomId).emit('startDuel', {
            riddle: {
                q: riddle.q,
                options: riddle.options
            },
            p1: attacker.id,
            p2: defender.id
        });
        
        setTimeout(() => {
            resolveDuel(roomId, 'timeout');
        }, 16000);
    }

    socket.on('submitDuelAnswer', (data) => {
        const room = rooms[data.roomId];
        
        if (!room || room.state !== 'DUEL') {
            return;
        }
        
        room.duel.answers[socket.id] = data.answer;
        
        if (Object.keys(room.duel.answers).length === 2) {
            resolveDuel(data.roomId, 'answered');
        }
    });

    function resolveDuel(roomId, reason) {
        const room = rooms[roomId];
        
        if (!room || !room.duel) return;
        
        const { attacker, defender, riddle, answers } = room.duel;
        const attAns = answers[attacker.id];
        const defAns = answers[defender.id];
        
        let winner = attacker;
        let loser = defender;
        let msg = '';
        
        if (attAns === riddle.answer && defAns !== riddle.answer) {
            winner = attacker;
            loser = defender;
            msg = `⚔️ ${attacker.name} won the duel! ${defender.name} was sent back to base!`;
        } else if (defAns === riddle.answer && attAns !== riddle.answer) {
            winner = defender;
            loser = attacker;
            msg = `⚔️ ${defender.name} won the duel! ${attacker.name} was sent back to base!`;
        } else if (attAns === riddle.answer && defAns === riddle.answer) {
            winner = attacker;
            loser = defender;
            msg = `⚔️ Both answered correctly! ${attacker.name} wins (attacked first)!`;
        } else {
            winner = defender;
            loser = attacker;
            msg = `⚔️ Both answered wrong! ${defender.name} wins by default!`;
        }
        
        loser.stunned = true;
        loser.position = -1;
        
        io.to(roomId).emit('duelEnded', {
            msg,
            players: room.players
        });
        
        room.state = 'PLAYING';
        room.duel = null;
        
        setTimeout(() => {
            if (rooms[roomId]) {
                room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
                updateTurn(roomId);
            }
        }, 3000);
    }

    // ==================== DISCONNECT ====================
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        
        if (roomId && rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('updatePlayers', rooms[roomId].players);
            }
        }
        
        delete socketToRoom[socket.id];
        console.log(`Player ${socket.id} disconnected`);
    });

    socket.on('leaveGame', (roomId) => {
        socket.emit('disconnect');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🎮 Ludo Battlefield server running on port ${PORT}`);
});
io.on('connection', (socket) => {
