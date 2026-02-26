const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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
    getStats
} = require("./systems/eloSystem");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on("ready", () => {
    console.log("BOT READY");
});

// ============================
// CLEANER (queue timeout)
// ============================

setInterval(() => {
    checkQueueExpiration();
}, 5 * 60 * 1000);

// ============================
// EMBED
// ============================

function createQueueEmbed() {

    const queue = getQueue();

    const description = queue.length === 0
        ? "Queue is empty."
        : queue.map((id, i) => {

            const stats = getStats(id);

            return `#${i + 1} | <@${id}> 🏆 ELO: ${stats?.elo || 1000}`;

        }).join("\n──────────────\n");

    return new EmbedBuilder()
        .setTitle("🔥 Battlerite 3v3 Queue")
        .setDescription(description)
        .setColor(0xFF0000)
        .setFooter({ text: `Queue: ${queue.length}/6` });
}

function createQueueButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("join")
            .setLabel("Join")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("leave")
            .setLabel("Leave")
            .setStyle(ButtonStyle.Danger)
    );
}

// ============================
// COMMAND
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

    if (!interaction.isButton()) return;

    if (interaction.customId === "join") {

        // Assure que le joueur existe en base ELO
        ensurePlayer(interaction.user.id);

        const result = joinQueue(interaction.user.id);

        if (result?.error) {
            return interaction.reply({
                content: result.error,
                ephemeral: true
            });
        }

        return interaction.update({
            embeds: [createQueueEmbed()],
            components: [createQueueButtons()]
        });
    }

    if (interaction.customId === "leave") {

        leaveQueue(interaction.user.id);

        return interaction.update({
            embeds: [createQueueEmbed()],
            components: [createQueueButtons()]
        });
    }

});

client.login(process.env.TOKEN);