
const bcrypt = require('bcrypt');

function setupAuth(io, db) {

    io.on('connection', (socket) => {

        socket.on('auth_register', async ({ user, pass }) => {
            const hash = await bcrypt.hash(pass, 10);

            db.query(
                'INSERT INTO users (username, password, coins, xp, inventory) VALUES (?, ?, 500, 0, ?)',
                [user, hash, JSON.stringify(['avatar_default'])],
                () => {
                    socket.username = user;
                    socket.emit('auth_success', {
                        name: user,
                        coins: 500,
                        xp: 0,
                        inventory: ['avatar_default']
                    });
                }
            );
        });

        socket.on('auth_login', ({ user, pass }) => {
            db.query('SELECT * FROM users WHERE username=?', [user], async (err, res) => {
                if (!res.length) return socket.emit('auth_error', 'Invalid');

                const valid = await bcrypt.compare(pass, res[0].password);
                if (!valid) return socket.emit('auth_error', 'Invalid');

                const u = res[0];

                socket.username = u.username;

                socket.emit('auth_success', {
                    name: u.username,
                    coins: u.coins,
                    xp: u.xp,
                    inventory: JSON.parse(u.inventory || '[]')
                });
            });
        });

    });
}

module.exports = setupAuth;
