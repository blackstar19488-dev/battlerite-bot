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
// QUEUE CLEANER
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
            return `#${i + 1} | ${stats?.ign || "Unknown"} 🏆 ELO: ${stats?.elo || 1000}`;
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

    // ========================
    // BUTTONS
    // ========================

    if (interaction.isButton()) {

        if (interaction.customId === "join") {

            const stats = getStats(interaction.user.id);

            // Si pas encore enregistré
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

            joinQueue(interaction.user.id, stats.ign);

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
    }

    // ========================
    // MODAL (SAFE VERSION)
    // ========================

    if (interaction.isModalSubmit()) {

        if (interaction.customId === "ignModal") {

            try {

                const ign = interaction.fields.getTextInputValue("ignInput");

                console.log("IGN RECEIVED:", ign);

                ensurePlayer(interaction.user.id, ign);
                joinQueue(interaction.user.id, ign);

                await interaction.reply({
                    content: `Registered as **${ign}** and joined the queue.`,
                    ephemeral: true
                });

            } catch (error) {

                console.error("MODAL ERROR:", error);

                if (!interaction.replied) {
                    await interaction.reply({
                        content: "Internal error while registering IGN.",
                        ephemeral: true
                    });
                }
            }
        }
    }
});

client.login(process.env.TOKEN);