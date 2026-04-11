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
app.use(express.json());

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'railway', // Use 'railway' as seen in your screenshot
    port: process.env.DB_PORT || 34744         // Add this line
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        createDatabase();
    } else {
        console.log('✅ Database connected');
        createTables();
    }
});

function createDatabase() {
    const tempDb = mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 34744 // Add this line here too
    });
    // ... rest of your code
    
    tempDb.connect((err) => {
        if (err) return;
        tempDb.query('CREATE DATABASE IF NOT EXISTS ludo_game', (err) => {
            if (err) return;
            tempDb.end();
            db.connect((err) => {
                if (!err) createTables();
            });
        });
    });
}

function createTables() {
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            coins INT DEFAULT 600,
            xp INT DEFAULT 0,
            inventory TEXT DEFAULT '["avatar_default", "ability_none"]',
            selectedAvatar VARCHAR(50) DEFAULT 'avatar_default',
            selectedAbility VARCHAR(50) DEFAULT 'ability_none',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    db.query(createUsersTable, (err) => {
        if (!err) {
            db.query('SELECT COUNT(*) as count FROM users', (err, results) => {
                if (!err && results[0].count === 0) {
                    db.query('INSERT INTO users (username, password, coins, xp) VALUES (?, ?, ?, ?)',
                    ['testuser', 'test123', 1000, 100]);
                }
            });
        }
    });
}

const rooms = {};
const socketToRoom = {};
const userSessions = {};

const RIDDLES = [
    { q: "What has keys but can't open locks?", options: ["Piano", "Door", "Map", "Computer"], answer: "Piano" },
    { q: "I speak without a mouth and hear without ears.", options: ["Echo", "Ghost", "Wind", "Sound"], answer: "Echo" },
    { q: "The more of this there is, the less you see.", options: ["Darkness", "Light", "Fog", "Shadow"], answer: "Darkness" },
    { q: "What gets wetter the more it dries?", options: ["Towel", "Soap", "Sponge", "Rain"], answer: "Towel" },
    { q: "I have cities but no houses. What am I?", options: ["Map", "Country", "Globe", "Atlas"], answer: "Map" },
    { q: "What can travel around the world while staying in a corner?", options: ["Stamp", "Letter", "Plane", "Bird"], answer: "Stamp" }
];

const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];
const START_OFFSETS = [0, 13, 26, 39]; // Red, Green, Yellow, Blue

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getAbsolutePosition(playerIdx, progress) {
    if (progress < 0 || progress > 50) return -1;
    return (START_OFFSETS[playerIdx % 4] + progress) % 52;
}

io.on('connection', (socket) => {
    
    socket.on('auth_register', (data) => {
        const { user, pass } = data;
        if (!user || !pass) return socket.emit('auth_error', 'Username and password required');
        
        db.query('SELECT * FROM users WHERE username = ?', [user], (err, results) => {
            if (results && results.length > 0) return socket.emit('auth_error', 'Username already exists');
            
            db.query(
                'INSERT INTO users (username, password, coins, xp, inventory, selectedAvatar, selectedAbility) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user, pass, 600, 0, '["avatar_default", "ability_none"]', 'avatar_default', 'ability_none'],
                (err) => {
                    if (err) return socket.emit('auth_error', 'Registration failed');
                    socket.username = user;
                    userSessions[socket.id] = { username: user, coins: 600, xp: 0, inventory: ['avatar_default', 'ability_none'], selectedAvatar: 'avatar_default', selectedAbility: 'ability_none' };
                    socket.emit('auth_success', userSessions[socket.id]);
                }
            );
        });
    });

    socket.on('auth_login', (data) => {
        const { user, pass } = data;
        if (!user || !pass) return socket.emit('auth_error', 'Username and password required');
        
        db.query('SELECT * FROM users WHERE username = ? AND password = ?', [user, pass], (err, results) => {
            if (!results || results.length === 0) return socket.emit('auth_error', 'Invalid username or password');
            const u = results[0];
            socket.username = u.username;
            let inventory = ['avatar_default', 'ability_none'];
            try { if (u.inventory) inventory = JSON.parse(u.inventory); } catch (e) {}
            
            userSessions[socket.id] = { 
                username: u.username, 
                coins: u.coins || 600, 
                xp: u.xp || 0, 
                inventory: inventory, 
                selectedAvatar: u.selectedAvatar || 'avatar_default', 
                selectedAbility: u.selectedAbility || 'ability_none' 
            };
            socket.emit('auth_success', userSessions[socket.id]);
        });
    });

    socket.on('save_data', (data) => {
        if (!socket.username) return;
        
        if (userSessions[socket.id]) {
            userSessions[socket.id].coins = data.coins;
            userSessions[socket.id].xp = data.xp;
            userSessions[socket.id].inventory = data.inventory;
            userSessions[socket.id].selectedAvatar = data.selectedAvatar;
            userSessions[socket.id].selectedAbility = data.selectedAbility;
        }

        db.query(
            'UPDATE users SET coins = ?, xp = ?, inventory = ?, selectedAvatar = ?, selectedAbility = ? WHERE username = ?',
            [data.coins, data.xp, JSON.stringify(data.inventory), data.selectedAvatar, data.selectedAbility, socket.username]
        );
    });

    socket.on('getLeaderboard', () => {
        db.query('SELECT username, xp FROM users ORDER BY xp DESC LIMIT 10', (err, results) => {
            if (!err) socket.emit('leaderboardData', results);
        });
    });

    socket.on('createRoom', (data) => {
        const roomId = generateRoomCode();
        const session = userSessions[socket.id] || {};
        rooms[roomId] = {
            id: roomId,
            name: data.name || 'Game Room',
            host: socket.id,
            players: [{
                id: socket.id,
                name: socket.username || `Guest_${Math.floor(Math.random() * 9999)}`,
                tokens: [{progress: -1}, {progress: -1}, {progress: -1}, {progress: -1}],
                stunned: false,
                selectedAvatar: session.selectedAvatar || 'avatar_default',
                selectedAbility: session.selectedAbility || 'ability_none'
            }],
            state: 'LOBBY',
            currentTurnIndex: 0,
            currentRoll: 0,
            validMoves: [],
            duel: null
        };
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        socket.emit('roomCreated', { roomId: roomId });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
    });

    socket.on('joinRoom', (roomCode) => {
        const roomId = roomCode.toUpperCase();
        if (!rooms[roomId]) return socket.emit('auth_error', 'Room not found');
        if (rooms[roomId].state !== 'LOBBY') return socket.emit('auth_error', 'Game already started');
        if (rooms[roomId].players.length >= 4) return socket.emit('auth_error', 'Room is full');
        
        const session = userSessions[socket.id] || {};
        rooms[roomId].players.push({
            id: socket.id,
            name: socket.username || `Guest_${Math.floor(Math.random() * 9999)}`,
            tokens: [{progress: -1}, {progress: -1}, {progress: -1}, {progress: -1}],
            stunned: false,
            selectedAvatar: session.selectedAvatar || 'avatar_default',
            selectedAbility: session.selectedAbility || 'ability_none'
        });
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        socket.emit('roomJoined', { roomId: roomId, isHost: false });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
    });

    socket.on('startGame', (roomId) => {
        if (!rooms[roomId] || rooms[roomId].host !== socket.id) return socket.emit('auth_error', 'Only host can start');
        rooms[roomId].state = 'PLAYING';
        rooms[roomId].currentTurnIndex = 0;
        io.to(roomId).emit('gameStarted');
        
        setTimeout(() => {
            const activePlayer = rooms[roomId].players[rooms[roomId].currentTurnIndex];
            io.to(roomId).emit('turnUpdate', { activePlayerId: activePlayer.id, activePlayerName: activePlayer.name });
            io.to(roomId).emit('boardUpdated', { players: rooms[roomId].players });
        }, 500);
    });

    socket.on('rollDice', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'PLAYING') return;
        
        const currentPlayerIdx = room.currentTurnIndex;
        const currentPlayer = room.players[currentPlayerIdx];
        if (currentPlayer.id !== socket.id) return;
        
        let roll = Math.floor(Math.random() * 6) + 1;
        room.currentRoll = roll;
        
        // Stun Check
        if (currentPlayer.stunned) {
            currentPlayer.stunned = false;
            io.to(roomId).emit('diceRolled', { roll, validMoves: [], players: room.players });
            io.to(roomId).emit('updatePlayers', room.players);
            setTimeout(() => nextTurn(roomId), 2000);
            return;
        }
        
        // SMART ABILITY LOGIC: Valid Moves Calculation
        let validMoves = [];
        const hasHaste = currentPlayer.selectedAbility === 'ability_haste';

        currentPlayer.tokens.forEach((t, idx) => {
            if (t.progress === -1 && roll === 6) {
                validMoves.push(idx); 
            } else if (t.progress >= 0) {
                if (hasHaste) {
                    // Boots of Haste: Over-rolls are permitted, they will be capped at 56 during movement
                    validMoves.push(idx);
                } else if (t.progress + roll <= 56) {
                    // Standard rules: Requires exact roll to reach 56
                    validMoves.push(idx); 
                }
            }
        });
        
        if (validMoves.length === 0) {
            io.to(roomId).emit('diceRolled', { roll, validMoves: [], players: room.players });
            setTimeout(() => nextTurn(roomId), 2000);
        } else {
            room.state = 'WAITING_FOR_MOVE';
            room.validMoves = validMoves;
            io.to(roomId).emit('diceRolled', { roll, validMoves, players: room.players });
        }
    });

    socket.on('moveToken', (data) => {
        const { roomId, tokenIdx } = data;
        const room = rooms[roomId];
        if (!room || room.state !== 'WAITING_FOR_MOVE') return;
        
        const currentPlayerIdx = room.currentTurnIndex;
        const currentPlayer = room.players[currentPlayerIdx];
        if (currentPlayer.id !== socket.id || !room.validMoves.includes(tokenIdx)) return;
        
        const token = currentPlayer.tokens[tokenIdx];
        const roll = room.currentRoll;
        
        if (token.progress === -1) {
            token.progress = 0; 
        } else {
            token.progress += roll;
            
            // Apply Haste Cap logic: If they overshoot 56, stop them exactly at 56
            if (currentPlayer.selectedAbility === 'ability_haste' && token.progress > 56) {
                token.progress = 56;
            }
        }
        
        room.state = 'PLAYING';
        
        // Check for Win 
        const hasWon = currentPlayer.tokens.every(t => t.progress === 56);
        if (hasWon) {
            io.to(roomId).emit('boardUpdated', { players: room.players });
            io.to(roomId).emit('gameEnded', { msg: `👑 ${currentPlayer.name} WON THE GAME!` });
            
            if (currentPlayer.name && !currentPlayer.name.startsWith('Guest')) {
                db.query('UPDATE users SET xp = xp + 200, coins = coins + 100 WHERE username = ?', [currentPlayer.name]);
            }
            
            delete rooms[roomId];
            return;
        }
        
        // Check for Duel
        const absPos = getAbsolutePosition(currentPlayerIdx, token.progress);
        let duelDefender = null;
        let defenderTokenIdx = -1;
        
        if (absPos !== -1 && !SAFE_ZONES.includes(absPos)) {
            for (let i = 0; i < room.players.length; i++) {
                if (i === currentPlayerIdx) continue;
                const opp = room.players[i];
                for (let j = 0; j < 4; j++) {
                    if (getAbsolutePosition(i, opp.tokens[j].progress) === absPos) {
                        duelDefender = opp;
                        defenderTokenIdx = j;
                        break;
                    }
                }
                if (duelDefender) break;
            }
        }
        
        if (duelDefender) {
            io.to(roomId).emit('boardUpdated', { players: room.players });
            startDuel(roomId, currentPlayer, tokenIdx, duelDefender, defenderTokenIdx);
        } else {
            io.to(roomId).emit('boardUpdated', { players: room.players });

            // SMART ABILITY LOGIC: Extra Turn Evaluation
            const isLucky = currentPlayer.selectedAbility === 'ability_lucky';
            
            if (roll === 6 || (roll === 1 && isLucky)) {
                let msg = roll === 6 ? "Rolled a 6! Roll again." : "Lucky Dice! Extra roll for rolling a 1.";
                io.to(roomId).emit('turnUpdate', { activePlayerId: currentPlayer.id, activePlayerName: currentPlayer.name, msg: msg });
            } else {
                nextTurn(roomId);
            }
        }
    });

    function nextTurn(roomId) {
        const room = rooms[roomId];
        if (!room) return;
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
        const nextPlayer = room.players[room.currentTurnIndex];
        io.to(roomId).emit('turnUpdate', { activePlayerId: nextPlayer.id, activePlayerName: nextPlayer.name });
    }

    function startDuel(roomId, attacker, attTokenIdx, defender, defTokenIdx) {
        const room = rooms[roomId];
        if (!room) return;
        const riddle = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
        room.state = 'DUEL';
        room.duel = { attacker, attTokenIdx, defender, defTokenIdx, riddle, answers: {} };
        
        io.to(roomId).emit('startDuel', { riddle: { q: riddle.q, options: riddle.options } });
        setTimeout(() => { if (rooms[roomId]) resolveDuel(roomId, 'timeout'); }, 16000);
    }

    socket.on('submitDuelAnswer', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.state !== 'DUEL') return;
        room.duel.answers[socket.id] = data.answer;
        if (Object.keys(room.duel.answers).length === 2) resolveDuel(data.roomId, 'answered');
    });

    function resolveDuel(roomId, reason) {
        const room = rooms[roomId];
        if (!room || !room.duel) return;
        
        const { attacker, attTokenIdx, defender, defTokenIdx, riddle, answers } = room.duel;
        const attAns = answers[attacker.id];
        const defAns = answers[defender.id];
        
        let winner, loser, msg, loserTokenIdx;
        
        if (attAns === riddle.answer && defAns !== riddle.answer) {
            winner = attacker; loser = defender; loserTokenIdx = defTokenIdx;
            msg = `⚔️ ${attacker.name} won the duel!`;
        } else if (defAns === riddle.answer && attAns !== riddle.answer) {
            winner = defender; loser = attacker; loserTokenIdx = attTokenIdx;
            msg = `⚔️ ${defender.name} won the duel!`;
        } else if (attAns === riddle.answer && defAns === riddle.answer) {
            winner = attacker; loser = defender; loserTokenIdx = defTokenIdx;
            msg = `⚔️ Both correct! Attacker ${attacker.name} wins!`;
        } else {
            winner = defender; loser = attacker; loserTokenIdx = attTokenIdx;
            msg = `⚔️ ${defender.name} wins by default!`;
        }
        
        // Base Duel Rewards
        if (winner.name && !winner.name.startsWith('Guest')) {
            db.query('UPDATE users SET xp = xp + 50, coins = coins + 20 WHERE username = ?', [winner.name]);
            
            // SMART ABILITY LOGIC: Fortune Coin Steal
            if (winner.selectedAbility === 'ability_fortune' && loser.name && !loser.name.startsWith('Guest')) {
                db.query('UPDATE users SET coins = GREATEST(0, coins - 50) WHERE username = ?', [loser.name]);
                db.query('UPDATE users SET coins = coins + 50 WHERE username = ?', [winner.name]);
                msg += ` (Stole 50 coins!)`;
            }
        }

        // Apply Punishments to Loser & Check for Shield Ability
        if (loser.selectedAbility !== 'ability_shield') {
            loser.stunned = true; // Player loses next turn if they don't have shield
        } else {
            msg += ` (Shield protected ${loser.name} from stun!)`;
        }
        loser.tokens[loserTokenIdx].progress = -1; // Token still sent to base
        
        io.to(roomId).emit('duelEnded', { msg: msg, players: room.players });
        
        room.state = 'PLAYING';
        room.duel = null;
        
        setTimeout(() => {
            if (rooms[roomId]) nextTurn(roomId);
        }, 3000);
    }

    socket.on('leaveRoom', (roomId) => leaveRoomHandler(roomId, socket));
    socket.on('leaveGame', (roomId) => leaveRoomHandler(roomId, socket));
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId) leaveRoomHandler(roomId, socket);
        delete userSessions[socket.id];
    });

    function leaveRoomHandler(roomId, socket) {
        if (rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('updatePlayers', rooms[roomId].players);
            }
        }
        socket.leave(roomId);
        delete socketToRoom[socket.id];
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🎮 Ludo Battlefield running on port ${PORT}`);
});
