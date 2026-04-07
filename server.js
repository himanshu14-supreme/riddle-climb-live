const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
require('dotenv').config();

app.use(express.static(path.join(__dirname, 'public')));

// Restore Database Connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

const rooms = {}; 
const socketToRoom = {};

const riddles = [
    { q: "I speak without a mouth and hear without ears.", options: ["Echo", "Ghost", "Wind", "Shadow"], answer: "Echo" },
    { q: "The more of this there is, the less you see.", options: ["Darkness", "Light", "Fog", "Smoke"], answer: "Darkness" },
    { q: "What has keys but can't open locks?", options: ["Piano", "Map", "Computer", "Door"], answer: "Piano" }
];

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    
    // --- AUTHENTICATION & SAVING ---
    socket.on('auth_register', (data) => {
        const { user, pass } = data;
        db.query('SELECT * FROM users WHERE username = ?', [user], (err, results) => {
            if (err) return socket.emit('auth_error', 'Database Error.');
            if (results && results.length > 0) return socket.emit('auth_error', 'Username exists.');
            
            db.query('INSERT INTO users (username, password, inventory) VALUES (?, ?, ?)', [user, pass, JSON.stringify(['avatar_default', 'ability_none'])], (err2) => {
                if (err2) return socket.emit('auth_error', 'Registration Failed.');
                socket.username = user;
                socket.emit('auth_success', { username: user, coins: 600, xp: 0, inventory: ['avatar_default', 'ability_none'], selectedAvatar: 'avatar_default', selectedAbility: 'ability_none' });
            });
        });
    });

    socket.on('auth_login', (data) => {
        const { user, pass } = data;
        db.query('SELECT * FROM users WHERE username = ? AND password = ?', [user, pass], (err, results) => {
            if (err) return socket.emit('auth_error', 'Database Error.');
            if (results && results.length > 0) {
                const u = results[0];
                socket.username = u.username;
                socket.emit('auth_success', { 
                    username: u.username, coins: u.coins, xp: u.xp, 
                    inventory: typeof u.inventory === 'string' ? JSON.parse(u.inventory) : u.inventory,
                    selectedAvatar: u.selectedAvatar || 'avatar_default', 
                    selectedAbility: u.selectedAbility || 'ability_none' 
                });
            } else socket.emit('auth_error', 'Invalid credentials.');
        });
    });

    socket.on('save_data', (data) => {
        if (socket.username) {
            db.query(`UPDATE users SET coins=?, xp=?, inventory=?, selectedAvatar=?, selectedAbility=? WHERE username=?`,
                [data.coins, data.xp, JSON.stringify(data.inventory), data.selectedAvatar, data.selectedAbility, socket.username]);
        }
    });

    // --- ROOM LOGIC ---
    socket.on('createRoom', () => {
        const roomId = generateRoomCode();
        rooms[roomId] = {
            id: roomId,
            players: [{ id: socket.id, name: socket.username || `Guest_${Math.floor(Math.random()*99)}`, pos: -1, stunned: false }],
            state: 'LOBBY', turnIndex: 0, duel: null
        };
        socket.join(roomId); socketToRoom[socket.id] = roomId;
        socket.emit('roomJoined', { roomId, isHost: true });
        io.to(roomId).emit('updateLobby', rooms[roomId].players);
    });

    socket.on('joinRoom', (roomId) => {
        if (rooms[roomId] && rooms[roomId].state === 'LOBBY' && rooms[roomId].players.length < 4) {
            rooms[roomId].players.push({ id: socket.id, name: socket.username || `Guest_${Math.floor(Math.random()*99)}`, pos: -1, stunned: false });
            socket.join(roomId); socketToRoom[socket.id] = roomId;
            socket.emit('roomJoined', { roomId, isHost: false });
            io.to(roomId).emit('updateLobby', rooms[roomId].players);
        }
    });

    socket.on('startGame', (roomId) => {
        if (rooms[roomId] && rooms[roomId].players[0].id === socket.id) {
            rooms[roomId].state = 'PLAYING';
            io.to(roomId).emit('gameStarted');
            startNextTurn(roomId);
        }
    });

    // --- LUDO MOVEMENT & DUEL LOGIC ---
    socket.on('rollDice', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'PLAYING') return;

        const player = room.players[room.turnIndex];
        if (player.id !== socket.id) return;

        const roll = Math.floor(Math.random() * 6) + 1;
        
        if (player.stunned) {
            player.stunned = false;
            io.to(roomId).emit('diceRolled', { playerName: player.name, roll, players: room.players });
            setTimeout(() => { room.turnIndex = (room.turnIndex + 1) % room.players.length; startNextTurn(roomId); }, 2000);
            return;
        }

        if (player.pos === -1) player.pos = roll - 1; // Simplified entry
        else player.pos += roll;
        if (player.pos >= 56) player.pos = 56;

        io.to(roomId).emit('diceRolled', { playerName: player.name, roll, players: room.players });

        const collisionPlayer = room.players.find(p => p.id !== player.id && p.pos === player.pos && p.pos !== -1 && p.pos !== 56);
        
        setTimeout(() => {
            if (collisionPlayer) {
                room.state = 'DUEL';
                const riddle = riddles[Math.floor(Math.random() * riddles.length)];
                room.duel = { attacker: player, defender: collisionPlayer, riddle: riddle, answers: {}, timer: null };
                io.to(roomId).emit('startDuel', { riddle: { q: riddle.q, options: riddle.options }, p1: player.id, p2: collisionPlayer.id });
                room.duel.timer = setTimeout(() => resolveDuel(roomId, "timeout"), 15000);
            } else if (player.pos === 56) {
                io.to(roomId).emit('duelEnded', { msg: `🏆 ${player.name} WON THE GAME!`, players: room.players });
                room.state = 'LOBBY';
            } else {
                room.turnIndex = (room.turnIndex + 1) % room.players.length;
                startNextTurn(roomId);
            }
        }, 1500);
    });

    socket.on('submitDuelAnswer', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.state !== 'DUEL') return;
        room.duel.answers[socket.id] = data.answer;
        if (Object.keys(room.duel.answers).length === 2) {
            clearTimeout(room.duel.timer); resolveDuel(data.roomId, "answered");
        }
    });

    function resolveDuel(roomId, reason) {
        const room = rooms[roomId];
        if (!room) return;

        const { attacker, defender, riddle, answers } = room.duel;
        const attAns = answers[attacker.id], defAns = answers[defender.id];
        let winner = null, loser = null;

        if (attAns === riddle.answer && defAns !== riddle.answer) { winner = attacker; loser = defender; } 
        else if (defAns === riddle.answer && attAns !== riddle.answer) { winner = defender; loser = attacker; } 
        else if (attAns === riddle.answer && defAns === riddle.answer) { winner = attacker; loser = defender; } 
        else { winner = defender; loser = attacker; }

        loser.stunned = true; loser.pos = -1;
        io.to(roomId).emit('duelEnded', { msg: `⚔️ ${winner.name} won! ${loser.name} was sent to Base!`, players: room.players });
        
        room.state = 'PLAYING'; room.duel = null;
        room.turnIndex = (room.turnIndex + 1) % room.players.length;
        setTimeout(() => startNextTurn(roomId), 3000);
    }

    function startNextTurn(roomId) {
        if (!rooms[roomId] || rooms[roomId].state !== 'PLAYING') return;
        const activePlayer = rooms[roomId].players[rooms[roomId].turnIndex];
        io.to(roomId).emit('turnUpdate', { activePlayerId: activePlayer.id, activePlayerName: activePlayer.name });
    }

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            io.to(roomId).emit('updateLobby', rooms[roomId].players);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
            delete socketToRoom[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));