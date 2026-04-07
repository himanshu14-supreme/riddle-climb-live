// server/server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
require('dotenv').config();

const { movePlayer, checkCollision } = require('./gameEngine');
const { rooms, createRoom, joinRoom } = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

io.on('connection', (socket) => {

    // AUTH
    socket.on('auth_register', async ({ user, pass }) => {
        const hash = await bcrypt.hash(pass, 10);

        db.query('INSERT INTO users SET ?', {
            username: user,
            password: hash,
            coins: 500,
            xp: 0,
            inventory: JSON.stringify(['avatar_default'])
        });

        socket.username = user;
        socket.emit('auth_success', { name: user, coins: 500, xp: 0 });
    });

    socket.on('auth_login', ({ user, pass }) => {
        db.query('SELECT * FROM users WHERE username=?', [user], async (err, res) => {
            if (!res.length) return socket.emit('auth_error', 'Invalid');

            const valid = await bcrypt.compare(pass, res[0].password);
            if (!valid) return socket.emit('auth_error', 'Invalid');

            socket.username = user;
            socket.emit('auth_success', res[0]);
        });
    });

    // ROOMS
    socket.on('createRoom', () => {
        const room = createRoom(socket);

        socket.join(room.id);
        socket.emit('roomJoined', { roomId: room.id, isHost: true });

        io.to(room.id).emit('updateLobby', room.players);
    });

    socket.on('joinRoom', (id) => {
        const room = rooms[id];
        if (!room) return;

        joinRoom(room, socket);
        socket.join(id);

        socket.emit('roomJoined', { roomId: id, isHost: false });
        io.to(id).emit('updateLobby', room.players);
    });

    socket.on('rollDice', (roomId) => {
        const room = rooms[roomId];
        const player = room.players[room.turnIndex];

        if (player.id !== socket.id) return;

        const roll = Math.floor(Math.random() * 6) + 1;

        movePlayer(player, roll);

        const hit = checkCollision(room.players, player);

        if (hit) hit.pos = -1;

        room.turnIndex = (room.turnIndex + 1) % room.players.length;

        io.to(roomId).emit('diceRolled', {
            roll,
            players: room.players
        });
    });

});

server.listen(3000, () => console.log("Server running"));
