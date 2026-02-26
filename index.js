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

const {
    joinQueue,
    leaveQueue,
    getQueue,
    resetQueue,
    checkQueueExpiration
} = require("./systems/queueSystem");

const {
    ensurePlayer,
    getStats
} = require("./systems/eloSystem");

const { createBalancedTeams } = require("./systems/teamSystem");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

client.once("ready", () => {
    console.log("BOT READY");
});

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

        ensurePlayer(interaction.user.id);

        const result = joinQueue(interaction.user.id);
        if (result?.error) {
            return interaction.reply({
                content: result.error,
                ephemeral: true
            });
        }

        const queue = getQueue();

        if (queue.length === 6) {

            const { team1, team2 } = createBalancedTeams(queue);

            const matchEmbed = new EmbedBuilder()
                .setTitle("⚔️ MATCH FOUND ⚔️")
                .setColor(0x00FF00)
                .setDescription(
                    `**Team 1**\n${team1.map(p =>
                        `<@${p.id}> ${p.isCaptain ? "👑" : ""}`
                    ).join("\n")}\n\n` +
                    `**Team 2**\n${team2.map(p =>
                        `<@${p.id}> ${p.isCaptain ? "👑" : ""}`
                    ).join("\n")}`
                );

            await interaction.channel.send({
                content: queue.map(id => `<@${id}>`).join(" "),
                embeds: [matchEmbed]
            });

            const lobbyVoice = await interaction.guild.channels.create({
                name: "LOBBY 3V3 DRAFT",
                type: 2
            });

            await interaction.channel.send(
                "All players must join **LOBBY 3V3 DRAFT** within 240 seconds."
            );

            global.currentDraft = {
                team1,
                team2,
                lobbyVoiceId: lobbyVoice.id,
                textChannelId: interaction.channel.id
            };

            // ⏳ Auto disband after 240 sec
            global.currentDraft.timeout = setTimeout(async () => {

                if (!global.currentDraft) return;

                const guild = interaction.guild;
                const lobby = guild.channels.cache.get(global.currentDraft.lobbyVoiceId);

                if (lobby) await lobby.delete().catch(() => {});

                const textChannel = guild.channels.cache.get(global.currentDraft.textChannelId);
                if (textChannel) {
                    textChannel.send("❌ Lobby disbanded. Not all players joined in time.");
                }

                global.currentDraft = null;

            }, 240000);

            resetQueue();

            return interaction.update({
                embeds: [createQueueEmbed()],
                components: [createQueueButtons()]
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

// ============================
// VOICE LISTENER
// ============================

client.on("voiceStateUpdate", async (oldState, newState) => {

    if (!global.currentDraft) return;

    const draft = global.currentDraft;
    const lobbyVoice = newState.guild.channels.cache.get(draft.lobbyVoiceId);
    if (!lobbyVoice) return;

    const allPlayers = [
        ...draft.team1.map(p => p.id),
        ...draft.team2.map(p => p.id)
    ];

    const playersInLobby = lobbyVoice.members.filter(member =>
        allPlayers.includes(member.id)
    );

    if (playersInLobby.size === 6) {

        if (draft.timeout) clearTimeout(draft.timeout);

        const team1Voice = await newState.guild.channels.create({
            name: "TEAM 1",
            type: 2
        });

        const team2Voice = await newState.guild.channels.create({
            name: "TEAM 2",
            type: 2
        });

        for (const id of draft.team1.map(p => p.id)) {
            const member = await newState.guild.members.fetch(id);
            if (member.voice.channel) {
                await member.voice.setChannel(team1Voice);
            }
        }

        for (const id of draft.team2.map(p => p.id)) {
            const member = await newState.guild.members.fetch(id);
            if (member.voice.channel) {
                await member.voice.setChannel(team2Voice);
            }
        }

        const textChannel = newState.guild.channels.cache.get(draft.textChannelId);
        if (textChannel) {
            textChannel.send("🔥 All players connected. Draft phase starting...");
        }

        global.currentDraft = null;
    }
});

client.login(process.env.TOKEN);