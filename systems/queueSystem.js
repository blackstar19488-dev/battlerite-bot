const { ensurePlayer, getStats } = require("./eloSystem");

let queue = [];
let queueTimestamps = {};
const QUEUE_TIMEOUT = 60 * 60 * 1000; // 1 hour

function joinQueue(user, ign) {
    ensurePlayer(user.id, ign);

    if (queue.includes(user.id)) {
        return { error: "You are already in queue." };
    }

    if (queue.length >= 6) {
        return { error: "Queue is full." };
    }

    queue.push(user.id);
    queueTimestamps[user.id] = Date.now();

    return { success: true };
}

function leaveQueue(userId) {
    queue = queue.filter(id => id !== userId);
    delete queueTimestamps[userId];
}

function checkQueueExpiration() {
    const now = Date.now();
    queue = queue.filter(id => {
        if (now - queueTimestamps[id] > QUEUE_TIMEOUT) {
            delete queueTimestamps[id];
            return false;
        }
        return true;
    });
}

function getQueue() {
    return queue;
}

function isQueueFull() {
    return queue.length === 6;
}

function resetQueue() {
    queue = [];
    queueTimestamps = {};
}

module.exports = {
    joinQueue,
    leaveQueue,
    checkQueueExpiration,
    getQueue,
    isQueueFull,
    resetQueue
};