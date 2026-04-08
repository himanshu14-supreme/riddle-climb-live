const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// ==================== IN-MEMORY DATABASE ====================
// Replaced MySQL with an in-memory object so the game works instantly without database setup.
const usersDB = {}; 

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

const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Global coordinate translator for Ludo collisions
function getGlobalCellId(playerIndex, localPos) {
    if (localPos < 0 || localPos > 50) return null; // Safe in bases or home stretches
    const startOffsets = [0, 13, 26, 39]; // Red, Green, Yellow, Blue starting positions
    return (localPos + startOffsets[playerIndex]) % 52;
}

// ==================== DATABASE FUNCTIONS ====================

function registerUser(username, password, callback) {
    if (usersDB[username]) {
        return callback(new Error('Username already exists'), null);
    }
    usersDB[username] = {
        username,
        password,
        coins: 600,
        xp: 0,
        inventory: ['avatar_peasant', 'ability_none'],
        selectedAvatar: 'avatar_peasant',
        selectedAbility: 'ability_none'
    };
    callback(null, usersDB[username]);
}

function loginUser(username, password, callback) {
    const user = usersDB[username];
    if (!user || user.password !== password) {
        return callback(new Error('Invalid credentials'), null);
    }
    callback(null, user);
}

function saveUserData(username, data) {
    if (usersDB[username]) {
        usersDB[username].coins = data.coins;
        usersDB[username].xp = data.xp;
        usersDB[username].inventory = data.inventory;
        usersDB[username].selectedAvatar = data.selectedAvatar;
        usersDB[username].selectedAbility = data.selectedAbility;
    }
}

// ==================== SOCKET CONNECTIONS ====================

io.on('connection', (socket) => {
    console.log(`🔗 User connected: ${socket.id}`);

    socket.on('auth_register', (data) => {
        const { username, password } = data;
        if (!username || !password || username.length < 3) {
            return socket.emit('auth_error', 'Invalid input');
        }
        registerUser(username, password, (err, userData) => {
            if (err) return socket.emit('auth_error', err.message);
            socket.username = username;
            socket.emit('auth_success', userData);
        });
    });

    socket.on('auth_login', (data) => {
        const { username, password } = data;
        if (!username || !password) {
            return socket.emit('auth_error', 'Fill in all fields');
        }
        loginUser(username, password, (err, userData) => {
            if (err) return socket.emit('auth_error', err.message);
            socket.username = username;
            socket.emit('auth_success', userData);
        });
    });

    socket.on('save_data', (data) => {
        if (socket.username) saveUserData(socket.username, data);
    });

    socket.on('createRoom', (data) => {
        const roomId = generateRoomCode();
        const player = {
            id: socket.id,
            name: data.playerData.name || data.playerData.username || "Guest",
            username: data.playerData.username,
            position: -1,
            stunned: false,
            selectedAvatar: data.playerData.selectedAvatar,
            selectedAbility: data.playerData.selectedAbility
        };

        rooms[roomId] = { id: roomId, players: [player], state: 'LOBBY', activePlayerIndex: 0, duel: null };
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;

        socket.emit('roomJoined', { roomId, isHost: true, gameState: rooms[roomId] });
        io.to(roomId).emit('playerListUpdate', rooms[roomId].players);
    });

    socket.on('joinRoom', (data) => {
        const roomId = data.roomCode;
        if (!rooms[roomId]) return socket.emit('auth_error', 'Room not found');
        if (rooms[roomId].state !== 'LOBBY') return socket.emit('auth_error', 'Game already started');
        if (rooms[roomId].players.length >= 4) return socket.emit('auth_error', 'Room is full');

        const player = {
            id: socket.id,
            name: data.playerData.name || data.playerData.username || "Guest",
            username: data.playerData.username,
            position: -1,
            stunned: false,
            selectedAvatar: data.playerData.selectedAvatar,
            selectedAbility: data.playerData.selectedAbility
        };

        rooms[roomId].players.push(player);
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;

        socket.emit('roomJoined', { roomId, isHost: false, gameState: rooms[roomId] });
        io.to(roomId).emit('playerListUpdate', rooms[roomId].players);
    });

    socket.on('startGame', (roomId) => {
        if (!rooms[roomId] || rooms[roomId].players[0].id !== socket.id) return;
        rooms[roomId].state = 'PLAYING';
        rooms[roomId].activePlayerIndex = 0;
        io.to(roomId).emit('gameStarted');
        io.to(roomId).emit('turnUpdate', { activePlayerIndex: 0 });
    });

    socket.on('rollDice', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'PLAYING') return;

        const activePlayer = room.players[room.activePlayerIndex];
        if (activePlayer.id !== socket.id) return;

        const roll = Math.floor(Math.random() * 6) + 1;

        if (activePlayer.stunned) {
            activePlayer.stunned = false;
            io.to(roomId).emit('diceRolled', { roll, players: room.players });
            setTimeout(() => {
                room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;
                io.to(roomId).emit('turnUpdate', { activePlayerIndex: room.activePlayerIndex });
            }, 2000);
            return;
        }

        if (activePlayer.position === -1) {
            activePlayer.position = 0; // Move to start square
        } else {
            activePlayer.position += roll;
            if (activePlayer.position > 56) activePlayer.position = 56; // Cap at center
        }

        io.to(roomId).emit('diceRolled', { roll, players: room.players });

        setTimeout(() => {
            const activeGlobal = getGlobalCellId(room.activePlayerIndex, activePlayer.position);
            
            // Collision detection based on global board position
            const collision = room.players.find((p, idx) => {
                if (p.id === activePlayer.id || p.position === -1) return false;
                const pGlobal = getGlobalCellId(idx, p.position);
                return activeGlobal !== null && activeGlobal === pGlobal;
            });

            if (collision && !SAFE_ZONES.includes(activeGlobal)) {
                room.state = 'DUEL';
                const riddle = getRandom(RIDDLES);
                room.duel = { attacker: activePlayer, defender: collision, riddle, answers: {} };

                io.to(roomId).emit('startDuel', { riddle: { q: riddle.q, options: riddle.options } });
                setTimeout(() => resolveDuel(roomId, 'timeout'), 16000);
            } else if (activePlayer.position === 56) {
                io.to(roomId).emit('gameEnded', { winner: activePlayer.name });
                room.state = 'LOBBY';
            } else {
                room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;
                io.to(roomId).emit('turnUpdate', { activePlayerIndex: room.activePlayerIndex });
            }
        }, 1500);
    });

    socket.on('submitDuelAnswer', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.state !== 'DUEL') return;
        room.duel.answers[socket.id] = data.answer;
        if (Object.keys(room.duel.answers).length === 2) resolveDuel(data.roomId, 'answered');
    });

    function resolveDuel(roomId, reason) {
        const room = rooms[roomId];
        if (!room || !room.duel) return;

        const { attacker, defender, riddle, answers } = room.duel;
        const attAns = answers[attacker.id];
        const defAns = answers[defender.id];

        let winner = attacker, loser = defender;

        if (defAns === riddle.answer && attAns !== riddle.answer) {
            winner = defender;
            loser = attacker;
        }

        loser.stunned = true;
        loser.position = -1; // Send back to base

        io.to(roomId).emit('duelEnded', {
            message: `⚔️ ${winner.name} won! ${loser.name} was sent to Base!`,
            players: room.players
        });

        room.state = 'PLAYING';
        room.duel = null;
        room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;

        setTimeout(() => { io.to(roomId).emit('turnUpdate', { activePlayerIndex: room.activePlayerIndex }); }, 2000);
    }

    socket.on('leaveRoom', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('playerListUpdate', rooms[roomId].players);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
        }
        delete socketToRoom[socket.id];
    });

    socket.on('leaveGame', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('playerListUpdate', rooms[roomId].players);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
        }
        delete socketToRoom[socket.id];
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('playerListUpdate', rooms[roomId].players);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
        }
        delete socketToRoom[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🎮 Ludo Battlefield running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser\n`);
});
