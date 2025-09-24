// start.js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  getContentType,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require("path");
const P = require("pino");
const os = require("os");
const express = require("express");
const app = express();

// Config & Session
const config = require("./src/config/settings.cjs");
const ownerNumber = ["94786073208"]; // Keep your owner number
const port = config.PORT || 8000;

// Ensure sessions folder exists
const SESSION_DIR = "./sessions";
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Express server (keep alive)
app.get("/", (req, res) => {
  res.send("✅ GIYU-MD is running!");
});
app.listen(port, () => {
  console.log(`🌐 Server running on http://localhost:${port}`);
});

// ========================
// Main Bot Connection
// ========================
async function connectToWA() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: true, // Show QR if needed
    browser: Browsers.macOS("Firefox"),
    auth: state,
    version,
    getMessage: async (key) => {
      return { conversation: "Hello!" };
    },
  });

  // Save credentials whenever updated
  conn.ev.on("creds.update", saveCreds);

  // Connection events
  conn.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📱 Scan QR code to log in");
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect.error instanceof Boom &&
          lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut);
      console.log(`❌ Connection closed. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(connectToWA, 3000);
      }
    } else if (connection === "open") {
      console.log("✅ Connected to WhatsApp!");
      sendStartupMessage(conn);
    }
  });

  // Message handler
  conn.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const mek = messages[0];
    if (!mek.message) return;

    // Handle ephemeral messages
    mek.message =
      getContentType(mek.message) === "ephemeralMessage"
        ? mek.message.ephemeralMessage.message
        : mek.message;

    // Auto-read status
    if (
      mek.key.remoteJid === "status@broadcast" &&
      config.AUTOREADSTATUS
    ) {
      await conn.readMessages([mek.key]);
      if (config.EMOJI) {
        await conn.sendMessage(mek.key.remoteJid, {
          react: { text: config.EMOJI, key: mek.key },
        });
      }
      return;
    }

    // Auto-read messages (if ALLWAYSONLINE is false)
    if (!config.ALLWAYSONLINE && mek.key.remoteJid !== "status@broadcast") {
      await conn.readMessages([mek.key]);
    }

    // Load utils & command handler
    const { sms } = require("./src/utils/msg");
    const { getGroupAdmins } = require("./src/utils/functions");
    const { loadCommands, handleCommand } = require("./src/utils/commandHandler");

    const m = sms(conn, mek);
    const from = mek.key.remoteJid;
    const type = getContentType(mek.message);
    const body =
      type === "conversation"
        ? mek.message.conversation
        : type === "extendedTextMessage"
        ? mek.message.extendedTextMessage.text
        : type === "imageMessage" && mek.message.imageMessage.caption
        ? mek.message.imageMessage.caption
        : type === "videoMessage" && mek.message.videoMessage.caption
        ? mek.message.videoMessage.caption
        : "";

    const prefix = config.PREFIX;
    const isCmd = body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase() : "";
    const args = body.trim().split(/ +/).slice(1);
    const q = args.join(" ");

    const isGroup = from.endsWith("@g.us");
    const sender = mek.key.fromMe
      ? conn.user.id.split(":")[0] + "@s.whatsapp.net"
      : mek.key.participant || mek.key.remoteJid;
    const senderNumber = sender.split("@")[0];
    const botNumber = conn.user.id.split(":")[0];
    const isMe = botNumber.includes(senderNumber);
    const isOwner = ownerNumber.includes(senderNumber) || isMe || config.SUDO.includes(senderNumber);

    const botNumber2 = jidNormalizedUser(conn.user.id);
    let groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins;
    if (isGroup) {
      try {
        groupMetadata = await conn.groupMetadata(from);
        groupName = groupMetadata.subject;
        participants = groupMetadata.participants;
        groupAdmins = getGroupAdmins(participants);
        isBotAdmins = groupAdmins.includes(botNumber2);
        isAdmins = groupAdmins.includes(sender);
      } catch (e) {
        console.error("Group metadata error:", e);
      }
    }

    const reply = (text) => conn.sendMessage(from, { text }, { quoted: mek });

    // Custom download function (optional)
    conn.downloadAndSaveMediaMessage = async (message, filename, appendExtension = true) => {
      // ... (same as your logic - keep if needed)
    };

    // Handle command
    if (isCmd) {
      handleCommand(conn, mek, m, {
        from,
        prefix,
        body,
        command,
        args,
        q,
        isGroup,
        sender,
        senderNumber,
        botNumber,
        botNumber2,
        pushname: mek.pushName || "User",
        isMe,
        isOwner,
        groupMetadata,
        groupName,
        participants,
        groupAdmins,
        isBotAdmins,
        isAdmins,
        reply,
      });
    }
  });

  // Send startup message
  async function sendStartupMessage(conn) {
    const up = `
🚀 **GIYU-MD 💚 Connected Successfully!** ✅ 

--- **🎉 Welcome to GIYU-MD WH BOT 💚!** 🎉 
✦» 𝚅𝚎𝚛𝚜𝚒𝚘𝚗 : ${require("./package.json").version}
✦» 𝙿𝚕𝚊𝚝𝚏𝚘𝚛𝚖 : ${os.platform()}
✦» 𝙷𝚘𝚜𝚝 : ${os.hostname()}
✦» 𝙾𝚆𝙽𝙴𝚁: ${config.BOT_NUMBER}

--- **Current Settings:**
✦» **PREFIX:** ${config.PREFIX}
✦» **MODE:** ${config.MODE}
✦» **AUTO READ STATUS:** ${config.AUTOREADSTATUS ? "Enabled" : "Disabled"}
✦» **READ CMD:** ${config.READCMD ? "Enabled" : "Disabled"}
✦» **WELCOME:** ${config.WELCOME ? "Enabled" : "Disabled"}
✦» **ANTI LINK:** ${config.ANTILINK ? "Enabled" : "Disabled"}

--- Thank you for using **GIYU-MD 💚**. Enjoy! 😊`;

    await conn.sendMessage(conn.user.id, { text: up });
  }
}

// Start bot after 4 seconds
setTimeout(connectToWA, 4000);
