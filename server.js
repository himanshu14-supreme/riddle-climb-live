const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
require('dotenv').config();

// Serves files from the /public folder
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. DATABASE CONFIGURATION ---
// Using a Pool instead of a single connection for better stability and automatic reconnection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verify the database connection pool is working
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database Connection Error:', err.message);
    } else {
        console.log('✅ Connected to MySQL Database Pool');
        connection.release(); // Important: release the connection back to the pool
    }
});

// --- 2. API ROUTES ---

app.get('/api/riddle', (req, res) => {
    // Picks one random riddle from your database
    db.query('SELECT * FROM riddles ORDER BY RAND() LIMIT 1', (err, results) => {
        if (err) {
            console.error('❌ Query Error:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'No riddles found in the database. Please add some!' });
        }
        
        // Send the random riddle to the frontend
        res.json(results[0]);
    });
});

// --- 3. SOCKET.IO MULTIPLAYER LOGIC ---

const roomPlayers = {}; 

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handles joining a specific room
    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        socket.join(roomId);
        
        if (!roomPlayers[roomId]) {
            roomPlayers[roomId] = [];
        }
        
        // Only allow a maximum of 2 players per room
        if (roomPlayers[roomId].length < 2) {
            roomPlayers[roomId].push({ id: socket.id, name: playerName || "Guest" });
        }

        // Notify everyone in the room about the current player count
        io.to(roomId).emit('playerCountUpdate', {
            count: roomPlayers[roomId].length,
            players: roomPlayers[roomId] 
        });
    });

    // Triggers when a player clicks "Start Game"
    socket.on('startGameSignal', (roomId) => {
        if (roomPlayers[roomId] && roomPlayers[roomId].length >= 2) {
            io.to(roomId).emit('initGame', roomPlayers[roomId]);
        }
    });

    // Synchronizes player positions and turn rotation
    socket.on('playerMove', (data) => {
        // Broadcasts to everyone in the room EXCEPT the sender
        socket.to(data.roomId).emit('updateBoard', data);
    });

    // STEAL LOGIC: Synchronizes the riddle popup for the opponent when someone fails
    socket.on('triggerSteal', (data) => {
        // Sends the specific riddle and stealer identity to the opponent
        socket.to(data.roomId).emit('receiveSteal', data);
    });

    // Basic cleanup when a user leaves
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Optional: You could loop through roomPlayers here to remove the disconnected user
    });
});

// --- 4. SERVER START ---

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
