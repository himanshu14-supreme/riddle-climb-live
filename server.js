const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
require('dotenv').config();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ludo_game'
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
        password: process.env.DB_PASSWORD || ''
    });
    
    tempDb.connect((err) => {
        if (err) {
            console.error('❌ Cannot connect to MySQL:', err.message);
            return;
        }
        
        tempDb.query('CREATE DATABASE IF NOT EXISTS ludo_game', (err) => {
            if (err) {
                console.error('❌ Cannot create database:', err.message);
                return;
            }
            console.log('✅ Database created');
            tempDb.end();
            
            db.connect((err) => {
                if (err) {
                    console.error('❌ Still cannot connect:', err.message);
                    return;
                }
                createTables();
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
        if (err) {
            console.error('❌ Cannot create users table:', err.message);
            return;
        }
        console.log('✅ Users table ready');
        
        db.query('SELECT COUNT(*) as count FROM users', (err, results) => {
            if (!err && results[0].count === 0) {
                db.query(
                    'INSERT INTO users (username, password, coins, xp) VALUES (?, ?, ?, ?)',
                    ['testuser', 'test123', 1000, 100],
                    (err) => {
                        if (!err) console.log('✅ Test user ready: testuser / test123');
                    }
                );
            }
        });
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

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);
    
    socket.on('auth_register', (data) => {
        const { user, pass } = data;
        
        if (!user || !pass) {
            socket.emit('auth_error', 'Username and password required');
            return;
        }
        
        db.query('SELECT * FROM users WHERE username = ?', [user], (err, results) => {
            if (err) {
                console.error('Register check error:', err);
                socket.emit('auth_error', 'Database error');
                return;
            }
            
            if (results && results.length > 0) {
                socket.emit('auth_error', 'Username already exists');
                return;
            }
            
            db.query(
                'INSERT INTO users (username, password, coins, xp, inventory, selectedAvatar, selectedAbility) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user, pass, 600, 0, '["avatar_default", "ability_none"]', 'avatar_default', 'ability_none'],
                (err) => {
                    if (err) {
                        console.error('Register insert error:', err);
                        socket.emit('auth_error', 'Registration failed');
                        return;
                    }
                    
                    socket.username = user;
                    userSessions[socket.id] = { username: user, coins: 600, xp: 0 };
                    console.log('✅ User registered:', user);
                    
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
        
        if (!user || !pass) {
            socket.emit('auth_error', 'Username and password required');
            return;
        }
        
        db.query('SELECT * FROM users WHERE username = ? AND password = ?', [user, pass], (err, results) => {
            if (err) {
                console.error('Login query error:', err);
                socket.emit('auth_error', 'Database error');
                return;
            }
            
            if (!results || results.length === 0) {
                socket.emit('auth_error', 'Invalid username or password');
                return;
            }
            
            const u = results[0];
            socket.username = u.username;
            
            let inventory = ['avatar_default', 'ability_none'];
            try {
                if (u.inventory && u.inventory !== '') {
                    inventory = JSON.parse(u.inventory);
                }
            } catch (e) {
                console.log('Inventory parse error, using default');
            }
            
            userSessions[socket.id] = {
                username: u.username,
                coins: u.coins || 600,
                xp: u.xp || 0,
                inventory: inventory,
                selectedAvatar: u.selectedAvatar || 'avatar_default',
                selectedAbility: u.selectedAbility || 'ability_none'
            };
            
            console.log('✅ User logged in:', user);
            
            socket.emit('auth_success', {
                username: u.username,
                coins: u.coins || 600,
                xp: u.xp || 0,
                inventory: inventory,
                selectedAvatar: u.selectedAvatar || 'avatar_default',
                selectedAbility: u.selectedAbility || 'ability_none'
            });
        });
    });

    socket.on('save_data', (data) => {
        if (!socket.username) return;
        
        db.query(
            'UPDATE users SET coins = ?, xp = ?, inventory = ?, selectedAvatar = ?, selectedAbility = ? WHERE username = ?',
            [data.coins, data.xp, JSON.stringify(data.inventory), data.selectedAvatar, data.selectedAbility, socket.username],
            (err) => {
                if (err) {
                    console.error('Save error:', err);
                } else {
                    console.log('✅ Data saved for:', socket.username);
                    userSessions[socket.id] = data;
                }
            }
        );
    });

    socket.on('createRoom', (data) => {
        const roomId = generateRoomCode();
        
        rooms[roomId] = {
            id: roomId,
            name: data.name || 'Game Room',
            host: socket.id,
            players: [{
                id: socket.id,
                name: socket.username || `Guest_${Math.floor(Math.random() * 9999)}`,
                position: -1,
                stunned: false,
                selectedAvatar: 'avatar_default',
                selectedAbility: 'ability_none'
            }],
            state: 'LOBBY',
            currentTurnIndex: 0,
            duel: null
        };
        
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        
        console.log('✅ Room created:', roomId);
        
        socket.emit('roomCreated', { roomId });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
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
        
        console.log('✅ Player joined room:', roomId);
        
        socket.emit('roomJoined', { roomId, isHost: false });
        io.to(roomId).emit('updatePlayers', rooms[roomId].players);
    });

    socket.on('leaveRoom', (roomId) => {
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
    });

    socket.on('startGame', (roomId) => {
        if (!rooms[roomId] || rooms[roomId].host !== socket.id) {
            socket.emit('auth_error', 'Only host can start');
            return;
        }
        
        rooms[roomId].state = 'PLAYING';
        rooms[roomId].currentTurnIndex = 0;
        
        console.log('✅ Game started in room:', roomId);
        
        io.to(roomId).emit('gameStarted');
        
        setTimeout(() => {
            const activePlayer = rooms[roomId].players[rooms[roomId].currentTurnIndex];
            io.to(roomId).emit('turnUpdate', {
                activePlayerId: activePlayer.id,
                activePlayerName: activePlayer.name
            });
        }, 500);
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
                const nextPlayer = room.players[room.currentTurnIndex];
                io.to(roomId).emit('turnUpdate', {
                    activePlayerId: nextPlayer.id,
                    activePlayerName: nextPlayer.name
                });
            }, 2000);
            return;
        }
        
        if (currentPlayer.position === -1) {
            currentPlayer.position = 0;
        } else {
            currentPlayer.position += roll;
            if (currentPlayer.position >= 52) {
                currentPlayer.position = 52;
                io.to(roomId).emit('gameEnded', { msg: `${currentPlayer.name} won!` });
                delete rooms[roomId];
                return;
            }
        }
        
        io.to(roomId).emit('diceRolled', { roll, players: room.players });
        
        const otherPlayer = room.players.find(p => p.id !== socket.id && p.position === currentPlayer.position && p.position !== -1);
        
        if (otherPlayer) {
            setTimeout(() => {
                startDuel(roomId, currentPlayer, otherPlayer);
            }, 1500);
        } else {
            setTimeout(() => {
                room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
                const nextPlayer = room.players[room.currentTurnIndex];
                io.to(roomId).emit('turnUpdate', {
                    activePlayerId: nextPlayer.id,
                    activePlayerName: nextPlayer.name
                });
            }, 1500);
        }
    });

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
            }
        });
        
        setTimeout(() => {
            if (rooms[roomId]) {
                resolveDuel(roomId, 'timeout');
            }
        }, 16000);
    }

    socket.on('submitDuelAnswer', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.state !== 'DUEL') return;
        
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
            msg = `⚔️ ${attacker.name} won the duel!`;
        } else if (defAns === riddle.answer && attAns !== riddle.answer) {
            winner = defender;
            loser = attacker;
            msg = `⚔️ ${defender.name} won the duel!`;
        } else if (attAns === riddle.answer && defAns === riddle.answer) {
            winner = attacker;
            loser = defender;
            msg = `⚔️ Both correct! ${attacker.name} wins!`;
        } else {
            winner = defender;
            loser = attacker;
            msg = `⚔️ ${defender.name} wins!`;
        }
        
        loser.stunned = true;
        loser.position = -1;
        
        io.to(roomId).emit('duelEnded', {
            msg: msg,
            players: room.players
        });
        
        room.state = 'PLAYING';
        room.duel = null;
        
        setTimeout(() => {
            if (rooms[roomId]) {
                room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
                const nextPlayer = room.players[room.currentTurnIndex];
                io.to(roomId).emit('turnUpdate', {
                    activePlayerId: nextPlayer.id,
                    activePlayerName: nextPlayer.name
                });
            }
        }, 3000);
    }

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
        delete userSessions[socket.id];
        console.log('❌ User disconnected:', socket.id);
    });

    socket.on('leaveGame', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('updatePlayers', rooms[roomId].players);
            }
        }
        delete socketToRoom[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🎮 Ludo Battlefield running on port ${PORT}`);
    console.log(`🌐 Open: http://localhost:${PORT}`);
});
