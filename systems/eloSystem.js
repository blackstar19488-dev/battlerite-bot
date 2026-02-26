const fs = require("fs");
const path = require("path");

const DATA_FOLDER = path.join(__dirname, "../data");
const FILE_PATH = path.join(DATA_FOLDER, "stats.json");

// Create data folder if it doesn't exist
if (!fs.existsSync(DATA_FOLDER)) {
    fs.mkdirSync(DATA_FOLDER);
}

// Create stats.json if it doesn't exist
if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
}

let stats = JSON.parse(fs.readFileSync(FILE_PATH));

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