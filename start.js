// start.js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require("path");
const P = require("pino");
const os = require("os");
const express = require("express");
const app = express();

// Load your session config (your session.js)
const sess = require("./session"); // ← your file
const config = require("./src/config/settings.cjs");
const ownerNumber = ["94786073208"];
const port = sess.PORT || 8000;

const SESSION_DIR = "./sessions";

// 🔑 STEP 1: If SESSION_ID exists, decode & save to ./sessions/creds.json (ONCE)
async function initializeSession() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const credsPath = path.join(SESSION_DIR, "creds.json");
  
  // Only decode if creds.json doesn't exist AND SESSION_ID is provided
  if (!fs.existsSync(credsPath) && sess.SESSION_ID) {
    try {
      const base64Data = sess.SESSION_ID.split("GIYU-MD~")[1];
      if (!base64Data) throw new Error("Invalid SESSION_ID format");

      const decodedData = Buffer.from(base64Data, "base64").toString("utf-8");
      const sessionData = JSON.parse(decodedData);
      
      fs.writeFileSync(credsPath, JSON.stringify(sessionData, null, 2));
      console.log("✅ Session restored from SESSION_ID");
    } catch (err) {
      console.error("❌ Session decode failed:", err.message);
      // If decode fails, Baileys will generate new QR
    }
  }
}

// Express server
app.get("/", (req, res) => {
  res.send("✅ GIYU-MD is running!");
});
app.listen(port, () => {
  console.log(`🌐 Server: http://localhost:${port}`);
});

// Main bot
async function connectToWA() {
  await initializeSession(); // ← Initialize session from your SESSION_ID

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: true,
    browser: Browsers.macOS("Firefox"),
    auth: state,
    version,
  });

  conn.ev.on("creds.update", saveCreds);

  conn.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("📱 Scan QR to log in (or use your SESSION_ID)");
    }
    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect.error instanceof Boom &&
          lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) setTimeout(connectToWA, 3000);
    } else if (connection === "open") {
      console.log("✅ Connected!");
      // Send startup message (reuse your logic)
    }
  });

  // ... (rest of your message handling - same as before)
  conn.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const mek = messages[0];
    if (!mek.message) return;
    // ... your command handler logic here
  });
}

setTimeout(connectToWA, 4000);
