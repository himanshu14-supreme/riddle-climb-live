const TOTAL_CELLS = 56;

function movePlayer(player, roll) {
    if (player.pos === -1) {
        if (roll === 6) {
            player.pos = 0;
        }
        return;
    }

    player.pos += roll;

    if (player.pos > TOTAL_CELLS) {
        player.pos = TOTAL_CELLS;
    }
}

function checkCollision(players, currentPlayer) {
    return players.find(p =>
        p.id !== currentPlayer.id &&
        p.pos === currentPlayer.pos &&
        p.pos !== -1 &&
        p.pos !== TOTAL_CELLS
    );
}

module.exports = { movePlayer, checkCollision };
