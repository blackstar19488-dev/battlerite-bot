const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const {
    joinQueue,
    leaveQueue,
    getQueue,
    isQueueFull,
    checkQueueExpiration,
    resetQueue
} = require("./systems/queueSystem");

const {
    ensurePlayer,
    getStats,
    getAllStats
} = require("./systems/eloSystem");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});


// ============================
// QUEUE CLEANER (1h timeout)
// ============================

setInterval(() => {
    checkQueueExpiration();
}, 5 * 60 * 1000);


// ============================
// EMBEDS
// ============================

function createQueueEmbed() {
    const queue = getQueue();

    const description = queue.length === 0
        ? "Queue is empty."
        : queue.map((id, i) => {
            const stats = getStats(id);
            return `#${i + 1} | ${stats?.ign} 🏆 ELO: ${stats?.elo || 1000}`;
        }).join("\n──────────────\n");

    return new EmbedBuilder()
        .setTitle("🔥 Battlerite 3v3 Queue")
        .setDescription(description)
        .setColor(0xFF0000)
        .setFooter({ text: `Queue: ${queue.length}/6` });
}

function createQueueButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("join").setLabel("Join").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("leave").setLabel("Leave").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("leaderboard").setLabel("Leaderboard").setStyle(ButtonStyle.Secondary)
    );
}

function createLeaderboardEmbed() {
    const stats = getAllStats();
    const sorted = Object.keys(stats)
        .sort((a, b) => stats[b].elo - stats[a].elo);

    const description = sorted.length === 0
        ? "No players yet."
        : sorted.map((id, i) => {
            const s = stats[id];
            return `#${i + 1} | ${s.ign} 🏆 ELO: ${s.elo} | W:${s.wins} L:${s.losses}`;
        }).join("\n──────────────\n");

    return new EmbedBuilder()
        .setTitle("📊 Battlerite Leaderboard")
        .setDescription(description)
        .setColor(0xFFD700);
}


// ============================
// !queue COMMAND
// ============================

client.on("messageCreate", async message => {
    if (message.content === "!queue") {
        await message.channel.send({
            embeds: [createQueueEmbed()],
            components: [createQueueButtons()]
        });
    }
});


// ============================
// INTERACTIONS
// ============================

client.on("interactionCreate", async interaction => {

    if (interaction.isButton()) {

        // JOIN BUTTON
       if (interaction.customId === "join") {

    const stats = getStats(interaction.user.id);

    if (!stats) {
        const modal = new ModalBuilder()
            .setCustomId("ignModal")
            .setTitle("Enter your In Game Name");

        const ignInput = new TextInputBuilder()
            .setCustomId("ignInput")
            .setLabel("Your Battlerite IGN")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(ignInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
    }

    const result = joinQueue(interaction.user, stats.ign);

    if (result.error) {
        return interaction.reply({ content: result.error, ephemeral: true });
    }

    await interaction.update({
        embeds: [createQueueEmbed()],
        components: [createQueueButtons()]
    });

    if (isQueueFull()) {
        interaction.followUp({
            content: "⚔️ 6 Players reached. Draft system will trigger here.",
        });
    }
}

        // LEADERBOARD
        if (interaction.customId === "leaderboard") {
            await interaction.reply({
                embeds: [createLeaderboardEmbed()],
                ephemeral: true
            });
        }
    }

    // IGN MODAL SUBMIT
    if (interaction.isModalSubmit()) {

        if (interaction.customId === "ignModal") {

            const ign = interaction.fields.getTextInputValue("ignInput");

            ensurePlayer(interaction.user.id, ign);

            joinQueue(interaction.user, ign);

            await interaction.reply({
                content: `Registered as **${ign}** and joined the queue.`,
                ephemeral: true
            });
        }
    }
});


client.login(process.env.TOKEN);