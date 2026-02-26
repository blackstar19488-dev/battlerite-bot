let queue = [];
let queueTimestamps = {};

function joinQueue(userId) {

    if (queue.includes(userId)) {
        return { error: "You are already in queue." };
    }

    queue.push(userId);
    queueTimestamps[userId] = Date.now();

    return { success: true };
}

function leaveQueue(userId) {
    queue = queue.filter(id => id !== userId);
    delete queueTimestamps[userId];
}

function getQueue() {
    return queue;
}

function isQueueFull() {
    return queue.length >= 6;
}

function resetQueue() {
    queue = [];
    queueTimestamps = {};
}

function checkQueueExpiration() {

    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    queue.forEach(userId => {
        if (now - queueTimestamps[userId] > ONE_HOUR) {
            leaveQueue(userId);
        }
    });
}

module.exports = {
    joinQueue,
    leaveQueue,
    getQueue,
    isQueueFull,
    resetQueue,
    checkQueueExpiration
};