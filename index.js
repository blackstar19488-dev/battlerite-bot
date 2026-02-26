process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const TOKEN = process.env.TOKEN || "MET_TON_TOKEN_ICI";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

let queue = [];
let queueMessageId = null; // ON STOCKE L'ID
let queueChannelId = null; // ON STOCKE LE CHANNEL

// ================= EMBED =================

function buildEmbed() {
    return new EmbedBuilder()
        .setTitle("⚔️ Battlerite 3v3 Queue")
        .setColor(0xff0000)
        .setDescription(
            `Players: **${queue.length}/6**\n\n` +
            (queue.length > 0
                ? queue.map((id, i) => `**${i + 1}.** <@${id}>`).join("\n")
                : "*No players yet*")
        );
}

function buildButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("join")
            .setLabel("JOIN")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("leave")
            .setLabel("LEAVE")
            .setStyle(ButtonStyle.Danger)
    );
}

// ================= UPDATE MESSAGE =================

async function updateQueueMessage() {
    if (!queueMessageId || !queueChannelId) return;

    const channel = await client.channels.fetch(queueChannelId);
    const message = await channel.messages.fetch(queueMessageId);

    await message.edit({
        embeds: [buildEmbed()],
        components: [buildButtons()]
    });
}

// ================= READY =================

client.once("ready", () => {
    console.log("Bot ready");
});

// ================= BUTTONS =================

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === "join") {

        if (queue.includes(interaction.user.id))
            return interaction.reply({ content: "Already in queue.", ephemeral: true });

        if (queue.length >= 6)
            return interaction.reply({ content: "Queue full.", ephemeral: true });

        queue.push(interaction.user.id);

        await interaction.deferUpdate(); // IMPORTANT
        await updateQueueMessage();
    }

    if (interaction.customId === "leave") {

        if (!queue.includes(interaction.user.id))
            return interaction.reply({ content: "Not in queue.", ephemeral: true });

        queue = queue.filter(id => id !== interaction.user.id);

        await interaction.deferUpdate();
        await updateQueueMessage();
    }
});

// ================= COMMAND =================

client.on("messageCreate", async (message) => {

    if (message.content === "!queue") {

        const sent = await message.channel.send({
            embeds: [buildEmbed()],
            components: [buildButtons()]
        });

        queueMessageId = sent.id;
        queueChannelId = message.channel.id;
    }
});

client.login(TOKEN);