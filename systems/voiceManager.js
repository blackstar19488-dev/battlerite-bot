let voiceLobbyChannel = null;
let team1Voice = null;
let team2Voice = null;

async function createLobbyVoice(guild) {
    voiceLobbyChannel = await guild.channels.create({
        name: "LOBBY 3V3 DRAFT",
        type: 2
    });
    return voiceLobbyChannel;
}

async function createTeamVoices(guild) {
    team1Voice = await guild.channels.create({
        name: "TEAM 1",
        type: 2
    });

    team2Voice = await guild.channels.create({
        name: "TEAM 2",
        type: 2
    });

    return { team1Voice, team2Voice };
}

async function movePlayersToTeams(guild, draft) {

    for (const id of draft.team1) {
        const member = await guild.members.fetch(id);
        if (member.voice.channel) {
            await member.voice.setChannel(team1Voice);
        }
    }

    for (const id of draft.team2) {
        const member = await guild.members.fetch(id);
        if (member.voice.channel) {
            await member.voice.setChannel(team2Voice);
        }
    }
}

function getLobbyChannel() {
    return voiceLobbyChannel;
}

async function deleteVoiceChannels() {
    if (voiceLobbyChannel) await voiceLobbyChannel.delete();
    if (team1Voice) await team1Voice.delete();
    if (team2Voice) await team2Voice.delete();

    voiceLobbyChannel = null;
    team1Voice = null;
    team2Voice = null;
}

module.exports = {
    createLobbyVoice,
    createTeamVoices,
    movePlayersToTeams,
    getLobbyChannel,
    deleteVoiceChannels
};