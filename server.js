const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
require('dotenv').config();

app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ludo_game'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection error:', err);
        return;
    }
    console.log('✅ Database connected');
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

function updateTurn(roomId) {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];
    if(room.players.length === 0) return;
    const activePlayer = room.players[room.currentTurnIndex];
    io.to(roomId).emit('turnUpdate', {
        activePlayerId: activePlayer.id,
        activePlayerName: activePlayer.name
    });
}

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
        riddle: { q: riddle.q, options: riddle.options }
    });
    
    setTimeout(() => {
        if (rooms[roomId] && rooms[roomId].duel) {
            resolveDuel(roomId, 'timeout');
        }
    }, 16000);
}

function resolveDuel(roomId, reason) {
    const room = rooms[roomId];
    if (!room || !room.duel) return;
    
    const { attacker, defender, riddle, answers } = room.duel;
    const attAns = answers[attacker.id];
    const defAns = answers[defender.id];
    
    // Safety check if a player disconnected during duel
    const attackerExists = room.players.find(p => p.id === attacker.id);
    const defenderExists = room.players.find(p => p.id === defender.id);

    let winner, loser, msg;

    if (!attackerExists) {
        winner = defender; loser = attacker; msg = `⚔️ Attacker fled! ${defender.name} wins by default.`;
    } else if (!defenderExists) {
        winner = attacker; loser = defender; msg = `⚔️ Defender fled! ${attacker.name} wins by default.`;
    } else {
        if (attAns === riddle.answer && defAns !== riddle.answer) {
            winner = attacker; loser = defender; msg = `⚔️ ${attacker.name} won the duel!`;
        } else if (defAns === riddle.answer && attAns !== riddle.answer) {
            winner = defender; loser = attacker; msg = `⚔️ ${defender.name} won the duel!`;
        } else if (attAns === riddle.answer && defAns === riddle.answer) {
            winner = attacker; loser = defender; msg = `⚔️ Both correct! Attacker ${attacker.name} wins tiebreaker!`;
        } else {
            winner = defender; loser = attacker; msg = `⚔️ Both missed! Defender ${defender.name} survives!`;
        }
    }
    
    if (loser && room.players.find(p => p.id === loser.id)) {
        const actualLoser = room.players.find(p => p.id === loser.id);
        actualLoser.stunned = true;
        actualLoser.position = -1;
    }
    
    io.to(roomId).emit('duelEnded', { msg: msg, players: room.players });
    room.state = 'PLAYING';
    room.duel = null;
    
    setTimeout(() => {
        if (rooms[roomId]) {
            room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
            updateTurn(roomId);
        }
    }, 3000);
}

io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);
    
    socket.on('auth_register', (data) => {
        const { user, pass } = data;
        if (!user || !pass) return socket.emit('auth_error', 'Username and password required');
        
        db.query('SELECT * FROM users WHERE username = ?', [user], (err, results) => {
            if (err) return socket.emit('auth_error', 'Database error');
            if (results && results.length > 0) return socket.emit('auth_error', 'Username already exists');
            
            db.query(
                'INSERT INTO users (username, password, coins, xp, inventory, selectedAvatar, selectedAbility) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user, pass, 600, 0, JSON.stringify(['avatar_default', 'ability_none']), 'avatar_default', 'ability_none'],
                (err2) => {
                    if (err2) return socket.emit('auth_error', 'Registration failed');
                    socket.username = user;
                    socket.emit('auth_success', {
                        username: user, coins: 600, xp: 0,
                        inventory: ['avatar_default', 'ability_none'],
                        selectedAvatar: 'avatar_default', selectedAbility: 'ability_none'
                    });
                }
            );
        });
    });

    socket.on('auth_login', (data) => {
        const { user, pass } = data;
        if (!user || !pass) return socket.emit('auth_error', 'Username and password required');
        
        db.query('SELECT * FROM users WHERE username = ? AND password = ?', [user, pass], (err, results) => {
            if (err) return socket.emit('auth_error', 'Database error');
            if (!results || results.length === 0) return socket.emit('auth_error', 'Invalid username or password');
            
            const u = results[0];
            socket.username = u.username;
            socket.userId = u.id;
            
            let inventory = ['avatar_default', 'ability_none'];
            try { inventory = typeof u.inventory === 'string' ? JSON.parse(u.inventory) : u.inventory; } catch (e) {}
            
            socket.emit('auth_success', {
                username: u.username, coins: u.coins || 600, xp: u.xp || 0,
                inventory: inventory, selectedAvatar: u.selectedAvatar || 'avatar_default',
                selectedAbility: u.selectedAbility || 'ability_none'
            });
        });
    });

    socket.on('save_data', (data) => {
        if (!socket.username) return;
        db.query(
            'UPDATE users SET coins=?, xp=?, inventory=?, selectedAvatar=?, selectedAbility=? WHERE username=?',
            [data.coins, data.xp, JSON.stringify(data.inventory), data.selectedAvatar, data.selectedAbility, socket.username]
        );
    });

    socket.on('createRoom', (data) => {
        const roomId = generateRoomCode();
        rooms[roomId] = {
            id: roomId, name: data.name || 'Game Room', host: socket.id,
            players: [{
                id: socket.id, name: socket.username || `Guest_${Math.floor(Math.random() * 9999)}`,
                position: -1, stunned: false, selectedAvatar: 'avatar_default', selectedAbility: 'ability_none'
            }],
            state: 'LOBBY', currentTurnIndex: 0, duel: null
        };
        
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        socket.emit('roomCreated', { roomId });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
    });

    socket.on('joinRoom', (roomCode) => {
        const roomId = roomCode.toUpperCase();
        if (!rooms[roomId]) return socket.emit('auth_error', 'Room not found');
        if (rooms[roomId].state !== 'LOBBY') return socket.emit('auth_error', 'Game already started');
        if (rooms[roomId].players.length >= 4) return socket.emit('auth_error', 'Room is full');
        
        rooms[roomId].players.push({
            id: socket.id, name: socket.username || `Guest_${Math.floor(Math.random() * 9999)}`,
            position: -1, stunned: false, selectedAvatar: 'avatar_default', selectedAbility: 'ability_none'
        });
        
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        socket.emit('roomJoined', { roomId, isHost: false });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
    });

    socket.on('startGame', (roomId) => {
        if (!rooms[roomId] || rooms[roomId].host !== socket.id) return;
        rooms[roomId].state = 'PLAYING';
        rooms[roomId].currentTurnIndex = 0;
        io.to(roomId).emit('gameStarted');
        setTimeout(() => updateTurn(roomId), 500);
    });

    socket.on('rollDice', (roomId) => {
        if (!rooms[roomId] || rooms[roomId].state !== 'PLAYING') return;
        
        const room = rooms[roomId];
        const currentPlayer = room.players[room.currentTurnIndex];
        
        if (currentPlayer.id !== socket.id) return;
        
        const roll = Math.floor(Math.random() * 6) + 1;
        
        if (currentPlayer.stunned) {
            currentPlayer.stunned = false;
            currentPlayer.position = -1;
            io.to(roomId).emit('diceRolled', { roll, players: room.players });
            setTimeout(() => {
                room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
                updateTurn(roomId);
            }, 2000);
            return;
        }
        
        if (currentPlayer.position === -1) {
            if (roll === 6) currentPlayer.position = 0;
        } else {
            currentPlayer.position += roll;
            // Assuming max path length is ~71 based on your LUDO_PATH array
            if (currentPlayer.position >= 71) {
                currentPlayer.position = 71;
                io.to(roomId).emit('diceRolled', { roll, players: room.players });
                io.to(roomId).emit('gameEnded', { msg: `${currentPlayer.name} won!` });
                delete rooms[roomId];
                return;
            }
        }
        
        io.to(roomId).emit('diceRolled', { roll, players: room.players });
        
        const otherPlayer = room.players.find(p => p.id !== socket.id && p.position === currentPlayer.position && p.position !== -1);
        
        if (otherPlayer) {
            setTimeout(() => startDuel(roomId, currentPlayer, otherPlayer), 1500);
        } else {
            setTimeout(() => {
                // Keep turn if rolled a 6
                if(roll !== 6) room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
                updateTurn(roomId);
            }, 1500);
        }
    });

    socket.on('submitDuelAnswer', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.state !== 'DUEL') return;
        room.duel.answers[socket.id] = data.answer;
        if (Object.keys(room.duel.answers).length === 2) resolveDuel(data.roomId, 'answered');
    });

    function handleLeave(socketId) {
        const roomId = socketToRoom[socketId];
        if (roomId && rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socketId);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('updatePlayers', rooms[roomId].players);
                if(rooms[roomId].state === 'DUEL') {
                    resolveDuel(roomId, 'disconnect'); // Force resolve if someone flees
                }
            }
        }
        delete socketToRoom[socketId];
    }

    socket.on('leaveRoom', (roomId) => { handleLeave(socket.id); socket.leave(roomId); });
    socket.on('leaveGame', (roomId) => { handleLeave(socket.id); socket.leave(roomId); });
    socket.on('disconnect', () => { handleLeave(socket.id); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🎮 Ludo Battlefield running on port ${PORT}`));
