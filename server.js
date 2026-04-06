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
            if (err) return socket.emit('auth_error', 'Database Error. Setup your tables!');
            if (results && results.length > 0) return socket.emit('auth_error', 'Username exists.');
            
            db.query('INSERT INTO users (username, password) VALUES (?, ?)', [user, pass], (err2) => {
                if (err2) return socket.emit('auth_error', 'Failed to register.');
                socket.emit('auth_success', {
                    username: user, coins: 600, xp: 0,
                    inventory: ['avatar_default', 'ability_none'],
                    selectedAvatar: 'avatar_default', selectedAbility: 'ability_none'
                });
            });
        });
    });

    socket.on('auth_login', (data) => {
        const { user, pass } = data;
        db.query('SELECT * FROM users WHERE username = ? AND password = ?', [user, pass], (err, results) => {
            if (err) return socket.emit('auth_error', 'Database Error.');
            if (results && results.length > 0) {
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
            db.query(`UPDATE users SET coins=?, xp=?, inventory=?, selectedAvatar=?, selectedAbility=? WHERE username=?`,
                [data.coins, data.xp, JSON.stringify(data.inventory), data.selectedAvatar, data.selectedAbility, socket.username]);
        }
    });

    // --- ROOM SETUP ---
    socket.on('joinRoom', (data) => {
        const { roomId, playerName, maxPlayers, avatar, ability } = data;
        
        if (!rooms[roomId]) {
            rooms[roomId] = { 
                players: [], 
                maxPlayers: parseInt(maxPlayers) || 2, 
                turnIndex: 0,
                state: 'WAITING', 
                duel: null
            };
        }

        const room = rooms[roomId];
        if (room.players.length < room.maxPlayers && room.state === 'WAITING') {
            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            
            room.players.push({ 
                id: socket.id, name: playerName, 
                avatar: avatar || 'avatar_default', ability: ability || 'ability_none',
                isHost: room.players.length === 0, pos: 100, stunned: false
            });

            io.to(roomId).emit('playerCountUpdate', {
                count: room.players.length, max: room.maxPlayers, players: room.players 
            });
        }
    });

    socket.on('startGameSignal', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.state = 'PLAYING';
            io.to(roomId).emit('initGame', { players: room.players });
            startNextTurn(roomId);
        }
    });

    // --- TURN & DICE LOGIC ---
    function startNextTurn(roomId) {
        const room = rooms[roomId];
        if(!room) return;

        let safetyCounter = 0;
        while (room.players[room.turnIndex].stunned && safetyCounter < room.players.length) {
            room.players[room.turnIndex].stunned = false; 
            io.to(roomId).emit('stunRecovered', room.players[room.turnIndex].id);
            room.turnIndex = (room.turnIndex + 1) % room.players.length;
            safetyCounter++;
        }

        const activePlayer = room.players[room.turnIndex];
        io.to(roomId).emit('turnUpdate', { activePlayerId: activePlayer.id, name: activePlayer.name });
    }

    socket.on('rollDice', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'PLAYING') return;
        
        const activePlayer = room.players[room.turnIndex];
        if (activePlayer.id !== socket.id) return; 

        const diceValue = Math.floor(Math.random() * 6) + 1;
        activePlayer.pos = Math.max(1, activePlayer.pos - diceValue);

        io.to(roomId).emit('diceRolled', { id: activePlayer.id, dice: diceValue, pos: activePlayer.pos });

        setTimeout(() => {
            if (activePlayer.pos === 1) {
                io.to(roomId).emit('gameOver', activePlayer);
                delete rooms[roomId];
                return;
            }

            const victim = room.players.find(p => p.pos === activePlayer.pos && p.id !== activePlayer.id);
            if (victim) {
                initiateDuel(roomId, activePlayer, victim);
            } else {
                room.turnIndex = (room.turnIndex + 1) % room.players.length;
                startNextTurn(roomId);
            }
        }, 1500); 
    });

    // --- DUEL LOGIC ---
    function initiateDuel(roomId, attacker, defender) {
        const room = rooms[roomId];
        room.state = 'DUELING';
        
        db.query('SELECT * FROM riddles ORDER BY RAND() LIMIT 1', (err, results) => {
            let activeRiddle;

            // BUG FIX: Provide a fallback riddle if the DB fails so the game doesn't hang!
            if (err || !results || results.length === 0) {
                activeRiddle = {
                    question: "I speak without a mouth and hear without ears. What am I?",
                    option_a: "A shadow", option_b: "An echo", option_c: "A ghost", option_d: "The wind",
                    answer: "An echo"
                };
            } else {
                activeRiddle = results[0];
            }
            
            room.duel = {
                attacker: attacker,
                defender: defender,
                riddle: activeRiddle,
                answers: 0, 
                timer: setTimeout(() => resolveDuel(roomId, null, "timeout"), 30000)
            };

            io.to(roomId).emit('duelStarted', {
                attackerId: attacker.id, attackerName: attacker.name,
                defenderId: defender.id, defenderName: defender.name,
                riddle: activeRiddle
            });
        });
    }

    socket.on('submitDuelAnswer', (data) => {
        const { roomId, selected } = data;
        const room = rooms[roomId];
        if (!room || room.state !== 'DUELING') return;

        const duel = room.duel;
        const isCorrect = (selected === duel.riddle.answer);
        
        if (isCorrect) {
            resolveDuel(roomId, socket.id, "win");
        } else {
            duel.answers++;
            if (duel.answers >= 2) {
                resolveDuel(roomId, null, "tie");
            } else {
                socket.emit('duelWrongGuess'); 
            }
        }
    });

    function resolveDuel(roomId, winnerId, reason) {
        const room = rooms[roomId];
        if(!room || !room.duel) return;
        clearTimeout(room.duel.timer);

        const attacker = room.duel.attacker;
        const defender = room.duel.defender;
        let winner = null, loser = null, msg = "";

        if (reason === "win") {
            winner = (winnerId === attacker.id) ? attacker : defender;
            loser = (winnerId === attacker.id) ? defender : attacker;
            
            loser.stunned = true;
            loser.pos = Math.min(100, loser.pos + 1); 
            msg = `${winner.name} won the duel! ${loser.name} is stunned!`;
        } else {
            attacker.pos = Math.min(100, attacker.pos + 1);
            msg = `Duel ended in a tie! ${attacker.name} retreated.`;
        }

        io.to(roomId).emit('duelEnded', { msg, players: room.players });
        
        room.state = 'PLAYING';
        room.duel = null;
        room.turnIndex = (room.turnIndex + 1) % room.players.length;
        
        setTimeout(() => startNextTurn(roomId), 3000); 
    }

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            const disconnectedPlayer = rooms[roomId].players.find(p => p.id === socket.id);
            if (disconnectedPlayer) io.to(roomId).emit('playerDisconnected', disconnectedPlayer.name);
            delete rooms[roomId]; 
            delete socketToRoom[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
