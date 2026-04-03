const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mysql = require('mysql2'); // Add this!
const path = require('path');

// THE CONNECTION BRIDGE
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false } 
});

app.use(express.static(path.join(__dirname, 'public')));

// ADD THIS ROUTE FOR RIDDLES
app.get('/api/riddle', (req, res) => {
    db.query("SELECT * FROM riddles ORDER BY RAND() LIMIT 1", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results[0]);
    });
});

io.on('connection', (socket) => {
    socket.on('playerMove', (data) => {
        socket.broadcast.emit('updateBoard', data);
    });
});

// Render gives you a PORT automatically
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 Game is live on port ${PORT}`);
});
