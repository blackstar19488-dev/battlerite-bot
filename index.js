
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");

/* ================= CLIENT ================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.once("ready", () => {
    console.log("🔥 FULL DRAFT SYSTEM READY");
});

/* ================= DATA ================= */

let queue = [];

let stats = fs.existsSync("./stats.json")
    ? JSON.parse(fs.readFileSync("./stats.json"))
    : {};

function saveStats(){
    fs.writeFileSync("./stats.json", JSON.stringify(stats, null, 2));
}

function ensurePlayer(id){
    if(!stats[id]){
        stats[id] = { elo:1000, wins:0, losses:0 };
        saveStats();
    }
}

/* ================= CHAMPIONS ================= */

const ALL_CHAMPIONS = [
"Alysia","Ashka","Bakko","Blossom","Croak","Destiny","Ezmo",
"Freya","Iva","Jade","Jamila","Jumong","Lucie","Oldur","Pearl",
"Pestilus","Poloma","Raigon","Rook","Ruh Kaan","Shen Rao",
"Shifu","Sirius","Taya","Thorn","Ulric","Varesh"
];

/* ================= MATCH STATE ================= */

let match = resetMatch();

function resetMatch(){
    return {
        active:false,
        phase:null,
        teamA:[],
        teamB:[],
        captainA:null,
        captainB:null,
        available:[...ALL_CHAMPIONS],
        picks:{},
        turn:null,
        timeout:null,
        voiceCategory:null,
        voiceA:null,
        voiceB:null,
        channel:null
    };
}

/* ================= QUEUE ================= */

function buildQueueEmbed(){
    return new EmbedBuilder()
        .setTitle("🔥 Battlerite 3v3 Queue")
        .setColor(0xFF0000)
        .setDescription(
            queue.length===0
            ? "Queue empty."
            : queue.map((id,i)=>`#${i+1} <@${id}> | ELO: ${stats[id]?.elo||1000}`).join("\n")
        )
        .setFooter({text:`${queue.length}/6`});
}

function buildQueueButtons(){
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("join").setLabel("Join").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("leave").setLabel("Leave").setStyle(ButtonStyle.Danger)
    );
}

client.on("messageCreate", async msg=>{
    if(msg.author.bot) return;
    if(msg.content==="!queue"){
        await msg.channel.send({
            embeds:[buildQueueEmbed()],
            components:[buildQueueButtons()]
        });
    }
});

/* ================= TEAM BALANCE ================= */

function balance(players){
    const sorted=[...players].sort((a,b)=>stats[b].elo-stats[a].elo);
    const A=[],B=[];
    sorted.forEach((id,i)=> i%2===0?A.push(id):B.push(id));
    return {A,B};
}

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction=>{

    if(!interaction.isButton()) return;

    /* ===== QUEUE ===== */

    if(interaction.customId==="join"){
        if(match.active) return interaction.reply({content:"Match running.",ephemeral:true});
        ensurePlayer(interaction.user.id);
        if(queue.includes(interaction.user.id))
            return interaction.reply({content:"Already queued.",ephemeral:true});
        if(queue.length>=6)
            return interaction.reply({content:"Queue full.",ephemeral:true});

        queue.push(interaction.user.id);

        await interaction.update({
            embeds:[buildQueueEmbed()],
            components:[buildQueueButtons()]
        });

        if(queue.length===6){
            startMatch(queue, interaction.channel);
            queue=[];
        }
    }

    if(interaction.customId==="leave"){
        queue=queue.filter(id=>id!==interaction.user.id);
        await interaction.update({
            embeds:[buildQueueEmbed()],
            components:[buildQueueButtons()]
        });
    }

    /* ===== DRAFT BUTTONS ===== */

    if(match.active && interaction.customId.startsWith("champ_")){
        if(interaction.user.id!==match.turn)
            return interaction.reply({content:"Not your turn.",ephemeral:true});

        const champ=interaction.customId.replace("champ_","");
        if(!match.available.includes(champ))
            return interaction.reply({content:"Unavailable.",ephemeral:true});

        clearTimeout(match.timeout);

        match.available=match.available.filter(c=>c!==champ);

        if(match.phase==="banA"){
            await interaction.update({content:`🚫 Team A banned ${champ}`,components:[]});
            match.phase="banB";
            match.turn=match.captainB;
            sendDraft();
        }
        else if(match.phase==="banB"){
            await interaction.update({content:`🚫 Team B banned ${champ}`,components:[]});
            match.phase="pick";
            match.turn=match.teamA[0];
            sendDraft();
        }
        else{
            match.picks[interaction.user.id]=champ;
            await interaction.update({content:`✅ <@${interaction.user.id}> picked ${champ}`,components:[]});
            nextPick();
        }
    }

    /* ===== VOTE ===== */

    if(match.active && interaction.customId==="voteA"){
        finishMatch("A");
        await interaction.reply({content:"Team A wins!",ephemeral:true});
    }

    if(match.active && interaction.customId==="voteB"){
        finishMatch("B");
        await interaction.reply({content:"Team B wins!",ephemeral:true});
    }
});

/* ================= START MATCH ================= */

function startMatch(players, channel){

    const {A,B}=balance(players);

    match=resetMatch();
    match.active=true;
    match.phase="banA";
    match.teamA=A;
    match.teamB=B;
    match.captainA=A[0];
    match.captainB=B[0];
    match.turn=match.captainA;
    match.channel=channel;

    channel.send(`⚔️ MATCH FOUND\nTeam A Captain: <@${A[0]}>\nTeam B Captain: <@${B[0]}>`);
    sendDraft();
}

/* ================= DRAFT ================= */

function sendDraft(){

    const embed=new EmbedBuilder()
        .setTitle("🎯 Draft Phase")
        .setDescription(`Phase: ${match.phase}\nTurn: <@${match.turn}>`)
        .setColor(0x00AEFF);

    const rows=[];
    for(let i=0;i<match.available.length;i+=5){
        const row=new ActionRowBuilder();
        match.available.slice(i,i+5).forEach(c=>{
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId("champ_"+c)
                    .setLabel(c)
                    .setStyle(ButtonStyle.Primary)
            );
        });
        rows.push(row);
    }

    match.channel.send({embeds:[embed],components:rows});
    startTimeout();
}

function startTimeout(){
    match.timeout=setTimeout(()=>{
        const random=match.available[Math.floor(Math.random()*match.available.length)];
        match.channel.send("⏰ Auto select "+random);
        match.available=match.available.filter(c=>c!==random);
        nextPick();
    },240000);
}

function nextPick(){

    const order=[
        ...match.teamA,
        ...match.teamB
    ];

    const picked=Object.keys(match.picks).length;
    if(picked>=6){
        finishDraft();
        return;
    }

    match.turn=order[picked];
    sendDraft();
}

/* ================= FINISH DRAFT ================= */

async function finishDraft(){

    clearTimeout(match.timeout);

    const embed=new EmbedBuilder()
        .setTitle("⚔️ MATCH READY")
        .setDescription(
            "**Team A**\n"+match.teamA.map(id=>`<@${id}> → ${match.picks[id]||"?"}`).join("\n")+
            "\n\n**Team B**\n"+match.teamB.map(id=>`<@${id}> → ${match.picks[id]||"?"}`).join("\n")
        );

    await match.channel.send({embeds:[embed]});
    await createVoice();
    sendVote();
}

/* ================= VOICE ================= */

async function createVoice(){

    const guild=match.channel.guild;

    match.voiceCategory=await guild.channels.create({
        name:"MATCH VOICE",
        type:ChannelType.GuildCategory
    });

    match.voiceA=await guild.channels.create({
        name:"Team A",
        type:ChannelType.GuildVoice,
        parent:match.voiceCategory.id
    });

    match.voiceB=await guild.channels.create({
        name:"Team B",
        type:ChannelType.GuildVoice,
        parent:match.voiceCategory.id
    });
}

/* ================= VOTE ================= */

function sendVote(){

    const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("voteA").setLabel("Team A Win").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("voteB").setLabel("Team B Win").setStyle(ButtonStyle.Danger)
    );

    match.channel.send({content:"Select winner:",components:[row]});
}

/* ================= FINISH MATCH ================= */

async function finishMatch(winner){

    const winners=winner==="A"?match.teamA:match.teamB;
    const losers=winner==="A"?match.teamB:match.teamA;

    winners.forEach(id=>{
        stats[id].elo+=25;
        stats[id].wins++;
    });

    losers.forEach(id=>{
        stats[id].elo-=25;
        stats[id].losses++;
    });

    saveStats();

    await match.channel.send("🏆 ELO Updated (+25 / -25)");

    if(match.voiceCategory) await match.voiceCategory.delete().catch(()=>{});

    match=resetMatch();
}

client.login(process.env.TOKEN);
