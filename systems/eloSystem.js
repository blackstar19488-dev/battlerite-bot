const fs = require("fs");
const path = require("path");

const statsPath = path.join(__dirname, "../data/stats.json");

let stats = {};
if (fs.existsSync(statsPath)) {
    stats = JSON.parse(fs.readFileSync(statsPath));
}

function saveStats() {
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
}

function ensurePlayer(userId, ign) {
    if (!stats[userId]) {
        stats[userId] = {
            ign: ign || "Unknown",
            elo: 1000,
            wins: 0,
            losses: 0
        };
        saveStats();
    }
}

function getStats(userId) {
    return stats[userId];
}

function getAllStats() {
    return stats;
}

function updateElo(winners, losers) {
    const K = 30;

    const avg = (team) =>
        team.reduce((sum, id) => sum + (stats[id]?.elo || 1000), 0) / team.length;

    const calc = (ratingA, ratingB, win) => {
        const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
        return ratingA + K * (win - expected);
    };

    winners.forEach(id => {
        stats[id].elo = Math.round(calc(stats[id].elo, avg(losers), 1));
        stats[id].wins++;
    });

    losers.forEach(id => {
        stats[id].elo = Math.round(calc(stats[id].elo, avg(winners), 0));
        stats[id].losses++;
    });

    saveStats();
}

module.exports = {
    ensurePlayer,
    getStats,
    getAllStats,
    updateElo
};