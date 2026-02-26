const fs = require("fs");

const FILE_PATH = "./data/stats.json";

let stats = {};

if (fs.existsSync(FILE_PATH)) {
    stats = JSON.parse(fs.readFileSync(FILE_PATH));
}

function save() {
    fs.writeFileSync(FILE_PATH, JSON.stringify(stats, null, 2));
}

function ensurePlayer(userId) {
    if (!stats[userId]) {
        stats[userId] = {
            elo: 1000,
            wins: 0,
            losses: 0
        };
        save();
    }
}

function getStats(userId) {
    return stats[userId];
}

function getAllStats() {
    return stats;
}

module.exports = {
    ensurePlayer,
    getStats,
    getAllStats
};