const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ----------------------------
// Variables
// ----------------------------
let lobby = [];
let leaderboardMessageId = null;

// ----------------------------
// Stats.json
// ----------------------------
let stats = {};
const statsFile = './stats.json';
if (fs.existsSync(statsFile)) stats = JSON.parse(fs.readFileSync(statsFile));
function saveStats() { fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2)); }

// ----------------------------
// ELO system
// ----------------------------
function averageElo(team) {
    if (team.length === 0) return 1000;
    return team.reduce((a,p) => a + (stats[p]?.elo || 1000), 0) / team.length;
}

function updateElo(winnerTeam, loserTeam) {
    const K = 30;
    const calc = (ratingA, ratingB, win) => {
        const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA)/400));
        return ratingA + K*(win - expected);
    };
    winnerTeam.forEach(p => {
        if(!stats[p]) stats[p] = { elo:1000, wins:0, losses:0 };
        stats[p].elo = Math.round(calc(stats[p].elo, averageElo(loserTeam), 1));
        stats[p].wins += 1;
    });
    loserTeam.forEach(p => {
        if(!stats[p]) stats[p] = { elo:1000, wins:0, losses:0 };
        stats[p].elo = Math.round(calc(stats[p].elo, averageElo(winnerTeam), 0));
        stats[p].losses += 1;
    });
    saveStats();
}

// ----------------------------
// Balanced teams
// ----------------------------
function makeBalancedTeams(players){
    const sorted = [...players].sort((a,b) => (stats[b]?.elo||1000)-(stats[a]?.elo||1000));
    const team1=[], team2=[];
    sorted.forEach(p => {
        if(averageElo(team1) <= averageElo(team2)) team1.push(p);
        else team2.push(p);
    });
    return [team1, team2];
}

// ----------------------------
// Lobby Embed
// ----------------------------
function createLobbyEmbed() {
    const embed = new EmbedBuilder()
        .setTitle("🔥 Battlerite 3v3 Lobby")
        .setDescription(
            lobby.length === 0
                ? "Lobby is empty"
                : lobby.map((p,i) => `#${i+1} | ${p} 🏆 ELO: ${stats[p]?.elo || 1000} | 🥇 W:${stats[p]?.wins||0} L:${stats[p]?.losses||0}`).join("\n──────────────\n")
        )
        .setColor(0xFF0000)
        .setFooter({ text: `Lobby: ${lobby.length}/6 players` });
    return embed;
}

// ----------------------------
// Lobby Buttons
// ----------------------------
function createLobbyButtons() {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('Join').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('list').setLabel('Show Lobby').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('reset').setLabel('Reset Lobby').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('leaderboard').setLabel('Leaderboard').setStyle(ButtonStyle.Secondary)
    );
    return row;
}

// ----------------------------
// Leaderboard Embed
// ----------------------------
function createLeaderboardEmbed() {
    const sorted = Object.keys(stats).sort((a,b) => (stats[b]?.elo||1000)-(stats[a]?.elo||1000));
    const description = sorted.map((p,i) => `#${i+1} | ${p} 🏆 ELO: ${stats[p]?.elo || 1000} | 🥇 W:${stats[p]?.wins||0} L:${stats[p]?.losses||0}`).join("\n──────────────\n");
    const embed = new EmbedBuilder()
        .setTitle("📊 Battlerite Leaderboard")
        .setDescription(description || "No players yet")
        .setColor(0xFFD700);
    return embed;
}

// ----------------------------
// Command !lobby
// ----------------------------
client.on("messageCreate", async message => {
    if(message.content === "!lobby"){
        await message.channel.send({
            embeds: [createLobbyEmbed()],
            components: [createLobbyButtons()]
        });
    }

    // Commande pour épingler le leaderboard
    if(message.content === "!leaderboard"){
        const lbMessage = await message.channel.send({ embeds: [createLeaderboardEmbed()] });
        leaderboardMessageId = lbMessage.id;
        lbMessage.pin();
    }
});

// ----------------------------
// Button Interactions
// ----------------------------
client.on("interactionCreate", async interaction => {
    if(!interaction.isButton()) return;
    const user = interaction.user.username;

    switch(interaction.customId){
        case 'join':
            if(!lobby.includes(user)) lobby.push(user);
            await interaction.update({ embeds: [createLobbyEmbed()], components: [createLobbyButtons()] });

            // Auto start 3v3 when 6 players
            if(lobby.length === 6){
                const [team1, team2] = makeBalancedTeams(lobby);
                const embed = new EmbedBuilder()
                    .setTitle("⚔️ 3v3 Match Ready!")
                    .setDescription(
                        `**Team 1:**\n${team1.map(p=>`${p} 🏆 ${stats[p]?.elo||1000}`).join("\n")}\n\n` +
                        `**Team 2:**\n${team2.map(p=>`${p} 🏆 ${stats[p]?.elo||1000}`).join("\n")}`
                    )
                    .setColor(0x00FF00);
                interaction.channel.send({ embeds: [embed] });

                // Update stats (ici, team1 est gagnante par défaut, tu peux changer)
                updateElo(team1, team2);

                lobby = []; // reset lobby
            }
            break;

        case 'leave':
            lobby = lobby.filter(p => p !== user);
            await interaction.update({ embeds: [createLobbyEmbed()], components: [createLobbyButtons()] });
            break;

        case 'list':
            await interaction.reply({ embeds: [createLobbyEmbed()], ephemeral: true });
            break;

        case 'reset':
            lobby = [];
            await interaction.update({ embeds: [createLobbyEmbed()], components: [createLobbyButtons()] });
            break;

        case 'leaderboard':
            await interaction.reply({ embeds: [createLeaderboardEmbed()], ephemeral: true });
            break;
    }
});

// ----------------------------
// Run Bot
// ----------------------------
client.login(process.env.TOKEN);