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

const {
    startDraft,
    getCurrentDraft,
    getChampions,
    banChampion,
    getBannedChampions
} = require("./systems/draftEngine");

const {
    createLobbyVoice,
    createTeamVoices,
    movePlayersToTeams,
    getLobbyChannel
} = require("./systems/voiceManager");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
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
        new ButtonBuilder().setCustomId("leave").setLabel("Leave").setStyle(ButtonStyle.Danger)
    );
}

// ============================
// BAN BUTTONS
// ============================

function createBanButtons() {

    const champions = getChampions();
    const banned = getBannedChampions();

    const rows = [];
    const allChampions = [
        ...champions.melee,
        ...champions.range,
        ...champions.support
    ];

    let currentRow = new ActionRowBuilder();

    allChampions.forEach(champ => {

        if (currentRow.components.length === 5) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }

        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`ban_${champ}`)
                .setLabel(champ)
                .setStyle(ButtonStyle.Danger)
                .setDisabled(banned.includes(champ))
        );
    });

    if (currentRow.components.length > 0) {
        rows.push(currentRow);
    }

    return rows;
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

    // ============================
    // BAN CLICK
    // ============================

    if (interaction.isButton() && interaction.customId.startsWith("ban_")) {

        const draft = getCurrentDraft();
        if (!draft) return;

        const champion = interaction.customId.replace("ban_", "");

        if (interaction.user.id !== draft.captain1) {
            return interaction.reply({
                content: "Only the Team 1 Captain can ban.",
                ephemeral: true
            });
        }

        banChampion(champion);

        await interaction.update({
            content: `❌ ${champion} has been banned.`,
            components: createBanButtons()
        });

        return;
    }

    // ============================
    // JOIN / LEAVE
    // ============================

    if (interaction.isButton()) {

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

            const result = joinQueue(interaction.user.id, stats.ign);

            if (result?.error) {
                return interaction.reply({ content: result.error, ephemeral: true });
            }

            await interaction.update({
                embeds: [createQueueEmbed()],
                components: [createQueueButtons()]
            });

            if (isQueueFull()) {

                const queue = getQueue();
                const draft = startDraft(queue);

                const formatTeam = (team, captain) =>
                    team.map(id => {
                        const s = getStats(id);
                        const crown = id === captain ? " 👑" : "";
                        return `${s.ign}${crown} — ELO: ${s.elo}`;
                    }).join("\n");

                await createLobbyVoice(interaction.guild);

                const mentions = queue.map(id => `<@${id}>`).join(" ");

                await interaction.channel.send({
                    content: `⚔️ MATCH FOUND\n${mentions}\nJoin **LOBBY 3V3 DRAFT** to start.`,
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("⚔️ 3v3 Draft Ready")
                            .setColor(0x00ff00)
                            .setDescription(
                                `**Team 1**\n${formatTeam(draft.team1, draft.captain1)}\n\n` +
                                `**Team 2**\n${formatTeam(draft.team2, draft.captain2)}`
                            )
                    ]
                });

                resetQueue();
            }
        }

        if (interaction.customId === "leave") {
            leaveQueue(interaction.user.id);

            await interaction.update({
                embeds: [createQueueEmbed()],
                components: [createQueueButtons()]
            });
        }
    }

    // ============================
    // IGN MODAL FIXED
    // ============================

    if (interaction.isModalSubmit()) {

        if (interaction.customId === "ignModal") {

            const ign = interaction.fields.getTextInputValue("ignInput");

            ensurePlayer(interaction.user.id, ign);
            joinQueue(interaction.user.id, ign);

            await interaction.reply({
                content: `Registered as **${ign}** and joined the queue.`,
                ephemeral: true
            });
        }
    }
});

// ============================
// VOICE LISTENER
// ============================

client.on("voiceStateUpdate", async (oldState, newState) => {

    const draft = getCurrentDraft();
    if (!draft) return;

    const lobby = getLobbyChannel();
    if (!lobby) return;

    const playersInLobby = lobby.members.filter(member =>
        draft.team1.includes(member.id) || draft.team2.includes(member.id)
    );

    if (playersInLobby.size === 6) {

        await createTeamVoices(newState.guild);
        await movePlayersToTeams(newState.guild, draft);

        const draftChannel = newState.guild.systemChannel;

        if (draftChannel) {
            draftChannel.send({
                content: "🔴 BAN PHASE\nTeam 1 Captain must ban a champion.",
                components: createBanButtons()
            });
        }
    }
});

client.login(process.env.TOKEN);