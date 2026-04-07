const TOTAL = 56;

function move(player, roll) {
    if (player.pos === -1) {
        if (roll === 6) player.pos = 0;
        return;
    }

    player.pos += roll;

    if (player.pos > TOTAL) player.pos = TOTAL;
}

function collision(players, p) {
    return players.find(x =>
        x.id !== p.id &&
        x.pos === p.pos &&
        x.pos !== -1 &&
        x.pos !== TOTAL
    );
}

module.exports = { move, collision };
