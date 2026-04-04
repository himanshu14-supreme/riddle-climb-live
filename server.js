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
// Changed from createConnection to createPool for better stability on Railway
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

// Verify connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ DB Error:', err.message);
    } else {
        console.log('✅ Connected to Railway MySQL');
        connection.release(); // Return the connection to the pool
    }
});

// --- 2. API ROUTES ---

app.get('/api/riddle', (req, res) => {
    // Picks one random riddle from your new table
    db.query('SELECT * FROM riddles ORDER BY RAND() LIMIT 1', (err, results) => {
        if (err) {
            console.error('Query Error:', err);
            return res.status(500).json({ error: 'Query failed' });
        }
        res.json(results[0]);
    });
});

// --- 3. SOCKET.IO REAL-TIME LOGIC ---

const roomPlayers = {}; 

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        socket.join(roomId);
        
        if (!roomPlayers[roomId]) roomPlayers[roomId] = [];
        
        // Only allow 2 players per room
        if (roomPlayers[roomId].length < 2) {
            roomPlayers[roomId].push({ id: socket.id, name: playerName || "Guest" });
        }

        io.to(roomId).emit('playerCountUpdate', {
            count: roomPlayers[roomId].length,
            players: roomPlayers[roomId] 
        });
    });

    socket.on('startGameSignal', (roomId) => {
        if (roomPlayers[roomId] && roomPlayers[roomId].length >= 2) {
            io.to(roomId).emit('initGame', roomPlayers[roomId]);
        }
    });

    // Handles normal movement updates
    socket.on('playerMove', (data) => {
        socket.to(data.roomId).emit('updateBoard', data);
    });

    // STEAL LOGIC: Synchronizes the riddle popup for the stealer
    socket.on('triggerSteal', (data) => {
        // Sends the specific riddle and stealer info to the opponent
        socket.to(data.roomId).emit('receiveSteal', data);
    });

    socket.on('disconnect', () => {
        // Optional: Clean up roomPlayers if someone leaves
        console.log(`User disconnected: ${socket.id}`);
    });
});

// --- 4. SERVER START ---

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 Server Live on Port ${PORT}`);
    console.log(`Targeting Database: ${process.env.DB_NAME}`);
});
