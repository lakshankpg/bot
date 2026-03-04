const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const yts = require("yt-search");
const { default: makeWASocket, useMultiFileAuthState, delay, getContentType, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, downloadContentFromMessage, DisconnectReason, extractMessageContent } = require('baileys');

// ---------------- CONFIG ----------------
const config = {
    // Bot Identity
    BOT_NAME: 'ð‹ð€ðŠðˆ ðŒðƒ ðŒðˆððˆ ððŽð“',
    BOT_VERSION: '3.0.0',
    OWNER_NAME: 'ð‹ð€ðŠðˆ',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '94789227570',
    PREFIX: '.',
    
    // Group Settings
    GROUP_INVITE_LINK: '',
    AUTO_JOIN_GROUP: 'false',
    
    // Status Settings
    AUTO_VIEW_STATUS: 'false',
    AUTO_LIKE_STATUS: 'false',
    AUTO_LIKE_EMOJI: ['â¤ï¸', 'ðŸ”¥', 'ðŸ‘', 'ðŸŽ‰', 'ðŸ’«', 'âœ¨', 'ðŸŒŸ', 'ðŸ’'],
    AUTO_RECORDING: 'false',
    
    // Images
    LOGO_URL: 'https://files.catbox.moe/3e7u52.jpg',
    BUTTON_IMAGES: {
        ALIVE: 'https://files.catbox.moe/3e7u52.jpg'
    },
    
    // Newsletter Settings
    NEWSLETTER_JID: '',
    
    // General
    MAX_RETRIES: 3,
    OTP_EXPIRY: 300000,
    
    // Auto Reply Settings
    AUTO_REPLY_ENABLED: 'true',
    AUTO_REPLY_MESSAGES: {},
    
    // View Once Settings
    AUTO_DOWNLOAD_VV: 'false',
    SEND_VV_TO_INBOX: 'true'
};

// ---------------- STORAGE ----------------
const sessionsDir = path.join(__dirname, 'sessions');
const dataDir = path.join(__dirname, 'bot_data');
const tempDir = path.join(__dirname, 'temp');

fs.ensureDirSync(sessionsDir);
fs.ensureDirSync(dataDir);
fs.ensureDirSync(tempDir);

const sessionFiles = {
    sessions: path.join(dataDir, 'sessions.json'),
    numbers: path.join(dataDir, 'numbers.json'),
    admins: path.join(dataDir, 'admins.json'),
    newsletters: path.join(dataDir, 'newsletters.json'),
    userConfigs: path.join(dataDir, 'user_configs.json'),
    settings: path.join(dataDir, 'settings.json'),
    autoReply: path.join(dataDir, 'auto_reply.json'),
    groupSettings: path.join(dataDir, 'group_settings.json'),
    buttonSettings: path.join(dataDir, 'button_settings.json')
};

// Initialize storage files
Object.values(sessionFiles).forEach(file => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
});

// Storage helper functions
function readJSON(file) {
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Session management functions
async function saveCredsToFile(number, creds, keys = null) {
    const data = readJSON(sessionFiles.sessions);
    const sanitized = number.replace(/[^0-9]/g, '');
    data[sanitized] = { creds, keys, updatedAt: new Date().toISOString() };
    writeJSON(sessionFiles.sessions, data);
}

async function loadCredsFromFile(number) {
    const data = readJSON(sessionFiles.sessions);
    const sanitized = number.replace(/[^0-9]/g, '');
    return data[sanitized] || null;
}

async function removeSessionFromFile(number) {
    const data = readJSON(sessionFiles.sessions);
    const sanitized = number.replace(/[^0-9]/g, '');
    delete data[sanitized];
    writeJSON(sessionFiles.sessions, data);
    
    const numbers = readJSON(sessionFiles.numbers);
    delete numbers[sanitized];
    writeJSON(sessionFiles.numbers, numbers);
}

async function addNumberToFile(number) {
    const data = readJSON(sessionFiles.numbers);
    const sanitized = number.replace(/[^0-9]/g, '');
    data[sanitized] = { addedAt: new Date().toISOString() };
    writeJSON(sessionFiles.numbers, data);
}

async function getAllNumbersFromFile() {
    const data = readJSON(sessionFiles.numbers);
    return Object.keys(data);
}

// Admin management
async function loadAdminsFromFile() {
    const data = readJSON(sessionFiles.admins);
    return Object.keys(data);
}

async function addAdminToFile(jidOrNumber) {
    const data = readJSON(sessionFiles.admins);
    data[jidOrNumber] = { addedAt: new Date().toISOString() };
    writeJSON(sessionFiles.admins, data);
}

async function removeAdminFromFile(jidOrNumber) {
    const data = readJSON(sessionFiles.admins);
    delete data[jidOrNumber];
    writeJSON(sessionFiles.admins, data);
}

// User config management
async function setUserConfigInFile(number, conf) {
    const data = readJSON(sessionFiles.userConfigs);
    const sanitized = number.replace(/[^0-9]/g, '');
    data[sanitized] = { ...data[sanitized], ...conf, updatedAt: new Date().toISOString() };
    writeJSON(sessionFiles.userConfigs, data);
}

async function loadUserConfigFromFile(number) {
    const data = readJSON(sessionFiles.userConfigs);
    const sanitized = number.replace(/[^0-9]/g, '');
    return data[sanitized] || {};
}

// Newsletter management
async function addNewsletterToFile(jid, emojis = []) {
    const data = readJSON(sessionFiles.newsletters);
    data[jid] = { jid, emojis, addedAt: new Date().toISOString() };
    writeJSON(sessionFiles.newsletters, data);
}

async function removeNewsletterFromFile(jid) {
    const data = readJSON(sessionFiles.newsletters);
    delete data[jid];
    writeJSON(sessionFiles.newsletters, data);
}

async function listNewslettersFromFile() {
    const data = readJSON(sessionFiles.newsletters);
    return Object.values(data);
}

// Auto Reply management
async function getAutoReplyMessages() {
    const data = readJSON(sessionFiles.autoReply);
    return data;
}

async function setAutoReplyMessage(keyword, response) {
    const data = readJSON(sessionFiles.autoReply);
    data[keyword] = { response, createdAt: new Date().toISOString() };
    writeJSON(sessionFiles.autoReply, data);
}

async function deleteAutoReplyMessage(keyword) {
    const data = readJSON(sessionFiles.autoReply);
    delete data[keyword];
    writeJSON(sessionFiles.autoReply, data);
}

// Group Settings management
async function getGroupSetting(groupId, key, defaultValue) {
    const data = readJSON(sessionFiles.groupSettings);
    if (!data[groupId]) data[groupId] = {};
    return data[groupId][key] !== undefined ? data[groupId][key] : defaultValue;
}

async function setGroupSetting(groupId, key, value) {
    const data = readJSON(sessionFiles.groupSettings);
    if (!data[groupId]) data[groupId] = {};
    data[groupId][key] = value;
    writeJSON(sessionFiles.groupSettings, data);
}

// Button Settings management
async function getButtonSetting(groupId) {
    const data = readJSON(sessionFiles.buttonSettings);
    return data[groupId] || { enabled: true };
}

async function setButtonSetting(groupId, setting) {
    const data = readJSON(sessionFiles.buttonSettings);
    data[groupId] = { ...data[groupId], ...setting };
    writeJSON(sessionFiles.buttonSettings, data);
}

// Global settings
async function getGlobalSetting(key, defaultValue) {
    const data = readJSON(sessionFiles.settings);
    return data[key] !== undefined ? data[key] : defaultValue;
}

async function setGlobalSetting(key, value) {
    const data = readJSON(sessionFiles.settings);
    data[key] = value;
    writeJSON(sessionFiles.settings, data);
}

// ---------------- UTILITIES ----------------
function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

// Generate random filename
function generateFileName(ext) {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
}

// Download media function
async function downloadMedia(message, type) {
    try {
        const stream = await downloadContentFromMessage(message, type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    } catch (error) {
        console.error('Download media error:', error);
        return null;
    }
}

const activeSockets = new Map();
const socketCreationTime = new Map();
const otpStore = new Map();

// Fake contact for meta styling
const fakevcard = {
    key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID"
    },
    message: {
        contactMessage: {
            displayName: config.BOT_NAME,
            vcard: `BEGIN:VCARD VERSION:3.0 N:${config.BOT_NAME.replace(/\s+/g, ';')};;;;;;;; FN:${config.BOT_NAME} ORG:WhatsApp Bot TEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER} END:VCARD`
        }
    }
};

// ---------------- GROUP FUNCTIONS ----------------
async function joinGroup(socket) {
    if (config.AUTO_JOIN_GROUP !== 'true' || !config.GROUP_INVITE_LINK) {
        return { status: 'skipped', error: 'Auto join disabled or no invite link' };
    }
    
    let retries = config.MAX_RETRIES;
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) return { status: 'failed', error: 'Invalid group invite link' };
    
    const inviteCode = inviteCodeMatch[1];
    
    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            if (response?.gid) return { status: 'success', gid: response.gid };
            throw new Error('No group ID in response');
        } catch (error) {
            retries--;
            let errorMessage = error.message || 'Unknown error';
            if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
            else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
            else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
            
            if (retries === 0) return { status: 'failed', error: errorMessage };
            await delay(2000 * (config.MAX_RETRIES - retries));
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}

// ---------------- STATUS HANDLERS ----------------
async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
        
        try {
            if (config.AUTO_RECORDING === 'true') {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }
            
            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        break;
                    } catch (error) {
                        retries--;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                        if (retries === 0) throw error;
                    }
                }
            }
            
            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(message.key.remoteJid, { 
                            react: { text: randomEmoji, key: message.key } 
                        }, { statusJidList: [message.key.participant] });
                        break;
                    } catch (error) {
                        retries--;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                        if (retries === 0) throw error;
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

// ---------------- AUTO REPLY HANDLER ----------------
async function handleAutoReply(socket, msg, from, senderNumber, body, isQuoted) {
    if (!body || typeof body !== 'string') return false;
    
    const autoReplyMsgs = await getAutoReplyMessages();
    const lowerBody = body.toLowerCase();
    
    for (const [keyword, data] of Object.entries(autoReplyMsgs)) {
        if (lowerBody.includes(keyword.toLowerCase())) {
            // If it's a quoted message, reply to that specific message
            if (isQuoted) {
                await socket.sendMessage(from, { text: data.response }, { quoted: msg });
            } else {
                await socket.sendMessage(from, { text: data.response });
            }
            return true;
        }
    }
    return false;
}

// ---------------- VIEW ONCE HANDLER ----------------
async function handleViewOnce(socket, msg, from) {
    try {
        // Check if message is view once
        const isViewOnce = msg.message?.viewOnceMessage || 
                          msg.message?.viewOnceMessageV2 || 
                          msg.message?.viewOnceMessageV2Extension;
        
        if (!isViewOnce) return false;
        
        console.log('View Once message detected:', msg.key.id);
        
        // Extract the actual message
        const viewOnceContent = msg.message.viewOnceMessage?.message || 
                               msg.message.viewOnceMessageV2?.message || 
                               msg.message.viewOnceMessageV2Extension?.message;
        
        if (!viewOnceContent) return false;
        
        // Get sender info
        const sender = msg.key.participant || msg.key.remoteJid;
        const senderNumber = sender.split('@')[0];
        
        // Download the media
        let mediaBuffer = null;
        let mediaType = '';
        let fileName = '';
        let caption = '';
        
        if (viewOnceContent.imageMessage) {
            mediaType = 'image';
            caption = viewOnceContent.imageMessage.caption || '';
            fileName = generateFileName('jpg');
            mediaBuffer = await downloadMedia(viewOnceContent.imageMessage, 'image');
        } else if (viewOnceContent.videoMessage) {
            mediaType = 'video';
            caption = viewOnceContent.videoMessage.caption || '';
            fileName = generateFileName('mp4');
            mediaBuffer = await downloadMedia(viewOnceContent.videoMessage, 'video');
        } else if (viewOnceContent.audioMessage) {
            mediaType = 'audio';
            fileName = generateFileName('mp3');
            mediaBuffer = await downloadMedia(viewOnceContent.audioMessage, 'audio');
        } else if (viewOnceContent.documentMessage) {
            mediaType = 'document';
            fileName = viewOnceContent.documentMessage.fileName || generateFileName('pdf');
            mediaBuffer = await downloadMedia(viewOnceContent.documentMessage, 'document');
        }
        
        if (!mediaBuffer) return false;
        
        // Save to temp file
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, mediaBuffer);
        
        // Send to inbox if enabled
        if (config.SEND_VV_TO_INBOX === 'true') {
            const userJid = jidNormalizedUser(socket.user.id);
            const captionText = `ðŸ“¸ *View Once Message Received*\n\nðŸ‘¤ From: @${senderNumber}\nðŸ“± Type: ${mediaType}\nðŸ•’ Time: ${getTimestamp()}\n\n${caption}`;
            
            if (mediaType === 'image') {
                await socket.sendMessage(userJid, { 
                    image: { url: filePath }, 
                    caption: captionText,
                    mentions: [sender]
                });
            } else if (mediaType === 'video') {
                await socket.sendMessage(userJid, { 
                    video: { url: filePath }, 
                    caption: captionText,
                    mentions: [sender]
                });
            } else if (mediaType === 'audio') {
                await socket.sendMessage(userJid, { 
                    audio: { url: filePath }, 
                    mimetype: 'audio/mp4',
                    caption: captionText,
                    mentions: [sender]
                });
            } else if (mediaType === 'document') {
                await socket.sendMessage(userJid, { 
                    document: { url: filePath }, 
                    fileName: fileName,
                    caption: captionText,
                    mentions: [sender]
                });
            }
            
            // Also send to the chat where it was received if requested
            if (from !== userJid) {
                await socket.sendMessage(from, { 
                    text: `âœ… *View Once message saved and sent to your inbox!*\n\nðŸ‘¤ From: @${senderNumber}`,
                    mentions: [sender]
                }, { quoted: msg });
            }
        }
        
        // Clean up temp file
        setTimeout(() => {
            try { fs.unlinkSync(filePath); } catch(e) {}
        }, 5000);
        
        return true;
    } catch (error) {
        console.error('View Once handler error:', error);
        return false;
    }
}

// ---------------- COMMAND HANDLERS ----------------
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast') return;
        
        const type = getContentType(msg.message);
        if (!msg.message) return;
        
        msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? 
            msg.message.ephemeralMessage.message : msg.message;
        
        const from = msg.key.remoteJid;
        const sender = from;
        const nowsender = msg.key.fromMe ? 
            (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : 
            (msg.key.participant || msg.key.remoteJid);
        const senderNumber = (nowsender || '').split('@')[0];
        const botNumber = socket.user.id ? socket.user.id.split(':')[0] : '';
        const isOwner = senderNumber === config.OWNER_NUMBER.replace(/[^0-9]/g, '');
        const isGroup = from.endsWith('@g.us');
        
        // Check if message is quoted
        const isQuoted = !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        
        const body = (type === 'conversation') ? msg.message.conversation :
            (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text :
            (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption :
            (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption :
            (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId :
            (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId :
            (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') : '';
        
        // Handle View Once messages automatically if enabled
        if (config.AUTO_DOWNLOAD_VV === 'true') {
            await handleViewOnce(socket, msg, from);
        }
        
        if (!body || typeof body !== 'string') return;
        
        // Handle auto reply (with quoted support)
        if (config.AUTO_REPLY_ENABLED === 'true') {
            const autoReplied = await handleAutoReply(socket, msg, from, senderNumber, body, isQuoted);
        }
        
        const prefix = config.PREFIX;
        const isCmd = body && body.startsWith && body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
        const args = body.trim().split(/ +/).slice(1);
        
        if (!command) return;
        
        try {
            // Check button settings for this chat
            const buttonSetting = await getButtonSetting(from);
            
            switch (command) {
                // ============ MAIN MENU ============
                case 'menu':
                case 'help':
                case 'start':
                case 'commands':
                case 'cmd':
                case 'list':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸŽ", key: msg.key } });
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    const userCfg = await loadUserConfigFromFile(number);
                    const botName = userCfg.botName || config.BOT_NAME;
                    const logo = userCfg.logo || config.LOGO_URL;
                    
                    const text = `â•­â”€ã€Œ *${botName}* ã€â”€âž¤
â”‚
â”‚ ðŸ‘¤ *Owner:* ${config.OWNER_NAME}
â”‚ âœï¸ *Prefix:* ${config.PREFIX}
â”‚ ðŸ§¬ *Version:* ${config.BOT_VERSION}
â”‚ â° *Uptime:* ${hours}h ${minutes}m ${seconds}s
â”‚ ðŸ“Š *Type:* Multi-Device
â”‚
â”œâ”€ã€Œ *MAIN MENU* ã€â”€âž¤
â”‚
â”‚ 1ï¸âƒ£ ðŸ‘‘ *OWNER COMMANDS* (${config.PREFIX}owner)
â”‚ 2ï¸âƒ£ ðŸ“¥ *DOWNLOAD MENU* (${config.PREFIX}download)
â”‚ 3ï¸âƒ£ ðŸ› ï¸ *TOOLS MENU* (${config.PREFIX}tools)
â”‚ 4ï¸âƒ£ âš™ï¸ *SETTINGS MENU* (${config.PREFIX}settings)
â”‚ 5ï¸âƒ£ ðŸŽ¨ *CREATIVE MENU* (${config.PREFIX}creative)
â”‚ 6ï¸âƒ£ ðŸ‘¥ *GROUP MENU* (${config.PREFIX}groupmenu)
â”‚ 7ï¸âƒ£ ðŸ¤– *AUTO REPLY* (${config.PREFIX}autoreplymenu)
â”‚ 8ï¸âƒ£ ðŸ”˜ *BUTTON MENU* (${config.PREFIX}buttonmenu)
â”‚ 9ï¸âƒ£ ðŸ“¸ *VV/DP MENU* (${config.PREFIX}vvmenu)
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *${botName}*`.trim();

                    if (buttonSetting.enabled) {
                        const buttons = [
                            { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "ðŸ‘‘ OWNER" }, type: 1 },
                            { buttonId: `${config.PREFIX}download`, buttonText: { displayText: "ðŸ“¥ DOWNLOAD" }, type: 1 },
                            { buttonId: `${config.PREFIX}tools`, buttonText: { displayText: "ðŸ› ï¸ TOOLS" }, type: 1 },
                            { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: "âš™ï¸ SETTINGS" }, type: 1 },
                            { buttonId: `${config.PREFIX}vvmenu`, buttonText: { displayText: "ðŸ“¸ VV/DP" }, type: 1 }
                        ];
                        
                        let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);
                        await socket.sendMessage(sender, { 
                            image: imagePayload, 
                            caption: text, 
                            footer: `â–¶ ${botName}`, 
                            buttons, 
                            headerType: 4 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ VV/DP MENU ============
                case 'vvmenu':
                case 'vvcommands':
                case 'dpmenu':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸ“¸", key: msg.key } });
                    
                    const text = `â•­â”€ã€Œ ðŸ“¸ *VV/DP COMMANDS* ã€â”€âž¤
â”‚
â”œâ”€ã€Œ ðŸ‘¤ *PROFILE PICTURE* ã€
â”‚ âœ¦ ${config.PREFIX}getdp [@tag] - Get profile pic
â”‚ âœ¦ ${config.PREFIX}getmydp - Get your own DP
â”‚ âœ¦ ${config.PREFIX}getgpdp - Get group DP
â”‚ âœ¦ ${config.PREFIX}savedp [@tag] - Save DP to inbox
â”‚
â”œâ”€ã€Œ ðŸ‘ï¸ *VIEW ONCE (VV)* ã€
â”‚ âœ¦ ${config.PREFIX}vv - View/view once message (reply to VV)
â”‚ âœ¦ ${config.PREFIX}getvv - Get view once content
â”‚ âœ¦ ${config.PREFIX}vvtoinbox [on/off] - Auto send VV to inbox
â”‚ âœ¦ ${config.PREFIX}autovv [on/off] - Auto download VV
â”‚
â”œâ”€ã€Œ âš™ï¸ *VV SETTINGS* ã€
â”‚ âœ¦ ${config.PREFIX}vvstatus - Check VV settings
â”‚ âœ¦ ${config.PREFIX}vvinbox [on/off]
â”‚ âœ¦ ${config.PREFIX}vvdownload [on/off]
â”‚
â”œâ”€ã€Œ ðŸ“ *HOW TO USE* ã€
â”‚ 1. Reply to a view once message with .vv
â”‚ 2. The bot will save and send it to your inbox
â”‚ 3. Use .getdp @user to get profile picture
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *View Once & DP Commands*`.trim();

                    if (buttonSetting.enabled) {
                        const buttons = [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MAIN MENU" }, type: 1 },
                            { buttonId: `${config.PREFIX}vvstatus`, buttonText: { displayText: "ðŸ“Š STATUS" }, type: 1 }
                        ];
                        await socket.sendMessage(sender, { 
                            text, 
                            footer: "ðŸ“¸ VV/DP Commands", 
                            buttons 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ GET DP COMMAND ============
                case 'getdp':
                case 'dp':
                case 'profilepic':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸ–¼ï¸", key: msg.key } });
                    
                    let targetJid = null;
                    
                    // Check if replying to a message or tagging someone
                    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
                        targetJid = msg.message.extendedTextMessage.contextInfo.participant;
                    } else if (args[0]) {
                        // Check if it's a mention
                        if (args[0].startsWith('@')) {
                            const mentioned = args[0].replace('@', '');
                            targetJid = mentioned.includes('@') ? mentioned : `${mentioned}@s.whatsapp.net`;
                        } else {
                            // Assume it's a phone number
                            targetJid = `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                        }
                    } else {
                        // Get sender's own DP
                        targetJid = sender;
                    }
                    
                    try {
                        await socket.sendMessage(sender, { text: '*ðŸ” Fetching profile picture...*' }, { quoted: fakevcard });
                        
                        // Get profile picture
                        const ppUrl = await socket.profilePictureUrl(targetJid, 'image');
                        
                        if (ppUrl) {
                            await socket.sendMessage(sender, { 
                                image: { url: ppUrl },
                                caption: `âœ… *Profile Picture*\n\nðŸ‘¤ User: @${targetJid.split('@')[0]}\nðŸ•’ Time: ${getTimestamp()}`,
                                mentions: [targetJid]
                            }, { quoted: fakevcard });
                            
                            // Also send to inbox if requested
                            if (args.includes('--inbox') || args.includes('-i')) {
                                const userJid = jidNormalizedUser(socket.user.id);
                                await socket.sendMessage(userJid, { 
                                    image: { url: ppUrl },
                                    caption: `ðŸ“¸ *Profile Picture Saved*\n\nðŸ‘¤ User: @${targetJid.split('@')[0]}\nðŸ•’ Time: ${getTimestamp()}`,
                                    mentions: [targetJid]
                                });
                            }
                        } else {
                            await socket.sendMessage(sender, { 
                                text: 'âŒ User has no profile picture or it\'s private.' 
                            }, { quoted: fakevcard });
                        }
                    } catch (error) {
                        console.error('Get DP error:', error);
                        await socket.sendMessage(sender, { 
                            text: 'âŒ Failed to get profile picture. User may have no DP or it\'s private.' 
                        }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ GET MY DP ============
                case 'getmydp':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸ–¼ï¸", key: msg.key } });
                    
                    try {
                        await socket.sendMessage(sender, { text: '*ðŸ” Fetching your profile picture...*' }, { quoted: fakevcard });
                        
                        const ppUrl = await socket.profilePictureUrl(sender, 'image');
                        
                        if (ppUrl) {
                            await socket.sendMessage(sender, { 
                                image: { url: ppUrl },
                                caption: `âœ… *Your Profile Picture*\n\nðŸ‘¤ User: @${sender.split('@')[0]}\nðŸ•’ Time: ${getTimestamp()}`,
                                mentions: [sender]
                            }, { quoted: fakevcard });
                        } else {
                            await socket.sendMessage(sender, { 
                                text: 'âŒ You don\'t have a profile picture or it\'s private.' 
                            }, { quoted: fakevcard });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { 
                            text: 'âŒ Failed to get your profile picture.' 
                        }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ GET GROUP DP ============
                case 'getgpdp':
                case 'groupdp':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    await socket.sendMessage(sender, { react: { text: "ðŸ–¼ï¸", key: msg.key } });
                    
                    try {
                        await socket.sendMessage(sender, { text: '*ðŸ” Fetching group picture...*' }, { quoted: fakevcard });
                        
                        const ppUrl = await socket.profilePictureUrl(from, 'image');
                        
                        if (ppUrl) {
                            await socket.sendMessage(sender, { 
                                image: { url: ppUrl },
                                caption: `âœ… *Group Profile Picture*\n\nðŸ‘¥ Group: ${from.split('@')[0]}\nðŸ•’ Time: ${getTimestamp()}`
                            }, { quoted: fakevcard });
                        } else {
                            await socket.sendMessage(sender, { 
                                text: 'âŒ Group has no profile picture.' 
                            }, { quoted: fakevcard });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { 
                            text: 'âŒ Failed to get group picture.' 
                        }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ SAVE DP ============
                case 'savedp':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸ’¾", key: msg.key } });
                    
                    let targetJid = null;
                    
                    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
                        targetJid = msg.message.extendedTextMessage.contextInfo.participant;
                    } else if (args[0]) {
                        if (args[0].startsWith('@')) {
                            const mentioned = args[0].replace('@', '');
                            targetJid = mentioned.includes('@') ? mentioned : `${mentioned}@s.whatsapp.net`;
                        } else {
                            targetJid = `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                        }
                    } else {
                        targetJid = sender;
                    }
                    
                    try {
                        await socket.sendMessage(sender, { text: '*ðŸ” Fetching and saving profile picture...*' }, { quoted: fakevcard });
                        
                        const ppUrl = await socket.profilePictureUrl(targetJid, 'image');
                        
                        if (ppUrl) {
                            // Download the image
                            const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                            const buffer = Buffer.from(response.data);
                            
                            // Save to temp
                            const fileName = `dp_${targetJid.split('@')[0]}_${Date.now()}.jpg`;
                            const filePath = path.join(tempDir, fileName);
                            fs.writeFileSync(filePath, buffer);
                            
                            // Send to user's inbox
                            const userJid = jidNormalizedUser(socket.user.id);
                            await socket.sendMessage(userJid, { 
                                image: { url: filePath },
                                caption: `ðŸ“¸ *Profile Picture Saved*\n\nðŸ‘¤ User: @${targetJid.split('@')[0]}\nðŸ•’ Time: ${getTimestamp()}`,
                                mentions: [targetJid]
                            });
                            
                            await socket.sendMessage(sender, { 
                                text: `âœ… Profile picture saved to your inbox!` 
                            }, { quoted: fakevcard });
                            
                            // Clean up
                            setTimeout(() => {
                                try { fs.unlinkSync(filePath); } catch(e) {}
                            }, 5000);
                        } else {
                            await socket.sendMessage(sender, { 
                                text: 'âŒ User has no profile picture.' 
                            }, { quoted: fakevcard });
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, { 
                            text: 'âŒ Failed to save profile picture.' 
                        }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ VIEW ONCE COMMAND ============
                case 'vv':
                case 'getvv':
                case 'viewonce':
                {
                    if (!isQuoted) {
                        await socket.sendMessage(sender, { 
                            text: `âŒ Please reply to a view once message with ${config.PREFIX}vv` 
                        }, { quoted: msg });
                        break;
                    }
                    
                    await socket.sendMessage(sender, { react: { text: "ðŸ‘ï¸", key: msg.key } });
                    await socket.sendMessage(sender, { text: '*ðŸ“¸ Processing view once message...*' }, { quoted: fakevcard });
                    
                    try {
                        // Check if quoted message is view once
                        const isViewOnce = quotedMsg?.viewOnceMessage || 
                                          quotedMsg?.viewOnceMessageV2 || 
                                          quotedMsg?.viewOnceMessageV2Extension;
                        
                        if (!isViewOnce) {
                            await socket.sendMessage(sender, { 
                                text: 'âŒ This is not a view once message!' 
                            }, { quoted: fakevcard });
                            break;
                        }
                        
                        // Extract the actual message
                        const viewOnceContent = quotedMsg.viewOnceMessage?.message || 
                                               quotedMsg.viewOnceMessageV2?.message || 
                                               quotedMsg.viewOnceMessageV2Extension?.message;
                        
                        if (!viewOnceContent) {
                            await socket.sendMessage(sender, { 
                                text: 'âŒ Could not extract view once content.' 
                            }, { quoted: fakevcard });
                            break;
                        }
                        
                        // Download and send the media
                        let mediaBuffer = null;
                        let mediaType = '';
                        let caption = '';
                        
                        if (viewOnceContent.imageMessage) {
                            mediaType = 'image';
                            caption = viewOnceContent.imageMessage.caption || '';
                            mediaBuffer = await downloadMedia(viewOnceContent.imageMessage, 'image');
                        } else if (viewOnceContent.videoMessage) {
                            mediaType = 'video';
                            caption = viewOnceContent.videoMessage.caption || '';
                            mediaBuffer = await downloadMedia(viewOnceContent.videoMessage, 'video');
                        } else if (viewOnceContent.audioMessage) {
                            mediaType = 'audio';
                            mediaBuffer = await downloadMedia(viewOnceContent.audioMessage, 'audio');
                        } else if (viewOnceContent.documentMessage) {
                            mediaType = 'document';
                            caption = viewOnceContent.documentMessage.fileName || 'document';
                            mediaBuffer = await downloadMedia(viewOnceContent.documentMessage, 'document');
                        }
                        
                        if (!mediaBuffer) {
                            await socket.sendMessage(sender, { 
                                text: 'âŒ Failed to download media.' 
                            }, { quoted: fakevcard });
                            break;
                        }
                        
                        // Save to temp
                        const fileName = `vv_${Date.now()}.${mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'mp3' : 'bin'}`;
                        const filePath = path.join(tempDir, fileName);
                        fs.writeFileSync(filePath, mediaBuffer);
                        
                        const captionText = `ðŸ“¸ *View Once Message*\n\nðŸ‘¤ From: @${quotedParticipant?.split('@')[0] || 'Unknown'}\nðŸ“± Type: ${mediaType}\nðŸ•’ Time: ${getTimestamp()}\n\n${caption}`;
                        
                        // Send to user's inbox
                        const userJid = jidNormalizedUser(socket.user.id);
                        
                        if (mediaType === 'image') {
                            await socket.sendMessage(userJid, { 
                                image: { url: filePath }, 
                                caption: captionText,
                                mentions: quotedParticipant ? [quotedParticipant] : []
                            });
                        } else if (mediaType === 'video') {
                            await socket.sendMessage(userJid, { 
                                video: { url: filePath }, 
                                caption: captionText,
                                mentions: quotedParticipant ? [quotedParticipant] : []
                            });
                        } else if (mediaType === 'audio') {
                            await socket.sendMessage(userJid, { 
                                audio: { url: filePath }, 
                                mimetype: 'audio/mp4',
                                caption: captionText,
                                mentions: quotedParticipant ? [quotedParticipant] : []
                            });
                        } else if (mediaType === 'document') {
                            await socket.sendMessage(userJid, { 
                                document: { url: filePath }, 
                                fileName: fileName,
                                caption: captionText,
                                mentions: quotedParticipant ? [quotedParticipant] : []
                            });
                        }
                        
                        // Confirm to user
                        await socket.sendMessage(sender, { 
                            text: `âœ… *View Once message saved and sent to your inbox!*` 
                        }, { quoted: fakevcard });
                        
                        // Clean up
                        setTimeout(() => {
                            try { fs.unlinkSync(filePath); } catch(e) {}
                        }, 10000);
                        
                    } catch (error) {
                        console.error('VV command error:', error);
                        await socket.sendMessage(sender, { 
                            text: 'âŒ Failed to process view once message.' 
                        }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ VV SETTINGS ============
                case 'vvtoinbox':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Permission denied.' }, { quoted: msg });
                        break;
                    }
                    
                    const state = args[0]?.toLowerCase();
                    if (state === 'on' || state === 'off') {
                        config.SEND_VV_TO_INBOX = state === 'on' ? 'true' : 'false';
                        await setGlobalSetting('SEND_VV_TO_INBOX', config.SEND_VV_TO_INBOX);
                        await socket.sendMessage(sender, { 
                            text: `âœ… Send VV to inbox set to: *${state}*` 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { 
                            text: `Usage: ${config.PREFIX}vvtoinbox [on/off]\nCurrent: ${config.SEND_VV_TO_INBOX === 'true' ? 'ON âœ…' : 'OFF âŒ'}` 
                        }, { quoted: msg });
                    }
                    break;
                }
                
                case 'autovv':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Permission denied.' }, { quoted: msg });
                        break;
                    }
                    
                    const state = args[0]?.toLowerCase();
                    if (state === 'on' || state === 'off') {
                        config.AUTO_DOWNLOAD_VV = state === 'on' ? 'true' : 'false';
                        await setGlobalSetting('AUTO_DOWNLOAD_VV', config.AUTO_DOWNLOAD_VV);
                        await socket.sendMessage(sender, { 
                            text: `âœ… Auto download VV set to: *${state}*` 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { 
                            text: `Usage: ${config.PREFIX}autovv [on/off]\nCurrent: ${config.AUTO_DOWNLOAD_VV === 'true' ? 'ON âœ…' : 'OFF âŒ'}` 
                        }, { quoted: msg });
                    }
                    break;
                }
                
                case 'vvstatus':
                {
                    const status = `â•­â”€ã€Œ ðŸ“¸ *VV SYSTEM STATUS* ã€â”€âž¤
â”‚
â”‚ ðŸ”„ Auto Download: ${config.AUTO_DOWNLOAD_VV === 'true' ? 'ON âœ…' : 'OFF âŒ'}
â”‚ ðŸ“¬ Send to Inbox: ${config.SEND_VV_TO_INBOX === 'true' ? 'ON âœ…' : 'OFF âŒ'}
â”‚
â”‚ *Commands Available:*
â”‚ âœ¦ ${config.PREFIX}vv - Manual VV download
â”‚ âœ¦ ${config.PREFIX}autovv [on/off]
â”‚ âœ¦ ${config.PREFIX}vvtoinbox [on/off]
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—`;

                    await socket.sendMessage(sender, { text: status }, { quoted: fakevcard });
                    break;
                }
                
                // ============ ENHANCED AUTO REPLY SETTINGS ============
                case 'addreply':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    const input = args.join(' ');
                    const [keyword, ...responseParts] = input.split('|');
                    
                    if (!keyword || responseParts.length === 0) {
                        await socket.sendMessage(sender, { 
                            text: `Usage: ${config.PREFIX}addreply keyword|response` 
                        }, { quoted: msg });
                        break;
                    }
                    
                    const response = responseParts.join('|').trim();
                    await setAutoReplyMessage(keyword.trim(), response);
                    await socket.sendMessage(sender, { 
                        text: `âœ… *Auto reply added!*\n\nðŸ”‘ Keyword: *${keyword.trim()}*\nðŸ’¬ Response: ${response.substring(0, 50)}${response.length > 50 ? '...' : ''}` 
                    }, { quoted: fakevcard });
                    break;
                }
                
                case 'testreply':
                {
                    const keyword = args[0];
                    if (!keyword) {
                        await socket.sendMessage(sender, { 
                            text: `Usage: ${config.PREFIX}testreply [keyword]` 
                        }, { quoted: msg });
                        break;
                    }
                    
                    const autoReplyMsgs = await getAutoReplyMessages();
                    if (autoReplyMsgs[keyword]) {
                        await socket.sendMessage(sender, { 
                            text: `âœ… *Auto Reply Test*\n\nKeyword: *${keyword}*\nResponse: ${autoReplyMsgs[keyword].response}` 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { 
                            text: `âŒ No auto reply found for keyword: *${keyword}*` 
                        }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ OWNER COMMANDS (30+) ============
                case 'owner':
                case 'ownercommands':
                case 'ownerhelp':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸ‘‘", key: msg.key } });
                    
                    const text = `â•­â”€ã€Œ ðŸ‘‘ *OWNER COMMANDS* ã€â”€âž¤
â”‚
â”œâ”€ã€Œ *BOT MANAGEMENT* ã€
â”‚ âœ¦ ${config.PREFIX}setname [name]
â”‚ âœ¦ ${config.PREFIX}setlogo [url]
â”‚ âœ¦ ${config.PREFIX}setprefix [symbol]
â”‚ âœ¦ ${config.PREFIX}setbotbio
â”‚ âœ¦ ${config.PREFIX}setstatus [text]
â”‚ âœ¦ ${config.PREFIX}setpp [image]
â”‚ âœ¦ ${config.PREFIX}deleteme
â”‚ âœ¦ ${config.PREFIX}restart
â”‚ âœ¦ ${config.PREFIX}shutdown
â”‚ âœ¦ ${config.PREFIX}update
â”‚
â”œâ”€ã€Œ *SESSION MANAGEMENT* ã€
â”‚ âœ¦ ${config.PREFIX}listsessions
â”‚ âœ¦ ${config.PREFIX}viewsessions
â”‚ âœ¦ ${config.PREFIX}killsession [number]
â”‚ âœ¦ ${config.PREFIX}blocksession [number]
â”‚ âœ¦ ${config.PREFIX}unblocksession [number]
â”‚ âœ¦ ${config.PREFIX}clearsessions
â”‚
â”œâ”€ã€Œ *ADMIN MANAGEMENT* ã€
â”‚ âœ¦ ${config.PREFIX}addadmin [number]
â”‚ âœ¦ ${config.PREFIX}removeadmin [number]
â”‚ âœ¦ ${config.PREFIX}listadmins
â”‚ âœ¦ ${config.PREFIX}promote [number]
â”‚ âœ¦ ${config.PREFIX}demote [number]
â”‚
â”œâ”€ã€Œ *BROADCAST* ã€
â”‚ âœ¦ ${config.PREFIX}bc [message]
â”‚ âœ¦ ${config.PREFIX}bcimage [caption]
â”‚ âœ¦ ${config.PREFIX}bcvideo [caption]
â”‚ âœ¦ ${config.PREFIX}bcgroups [message]
â”‚ âœ¦ ${config.PREFIX}bccontacts [message]
â”‚
â”œâ”€ã€Œ *SYSTEM* ã€
â”‚ âœ¦ ${config.PREFIX}stats
â”‚ âœ¦ ${config.PREFIX}systeminfo
â”‚ âœ¦ ${config.PREFIX}botinfo
â”‚ âœ¦ ${config.PREFIX}serverinfo
â”‚ âœ¦ ${config.PREFIX}performance
â”‚ âœ¦ ${config.PREFIX}memory
â”‚ âœ¦ ${config.PREFIX}cpu
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *Owner Only Commands*`.trim();

                    if (buttonSetting.enabled) {
                        const buttons = [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MAIN MENU" }, type: 1 },
                            { buttonId: `${config.PREFIX}stats`, buttonText: { displayText: "ðŸ“Š STATS" }, type: 1 }
                        ];
                        await socket.sendMessage(sender, { 
                            text, 
                            footer: "ðŸ‘‘ Owner Commands", 
                            buttons 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ GROUP COMMANDS (30+) ============
                case 'group':
                case 'groupmenu':
                case 'groupcommands':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    await socket.sendMessage(sender, { react: { text: "ðŸ‘¥", key: msg.key } });
                    
                    const text = `â•­â”€ã€Œ ðŸ‘¥ *GROUP COMMANDS* ã€â”€âž¤
â”‚
â”œâ”€ã€Œ *GROUP MANAGEMENT* ã€
â”‚ âœ¦ ${config.PREFIX}groupinfo
â”‚ âœ¦ ${config.PREFIX}grouplink
â”‚ âœ¦ ${config.PREFIX}revoke
â”‚ âœ¦ ${config.PREFIX}setgroupname [name]
â”‚ âœ¦ ${config.PREFIX}setgroupdesc [text]
â”‚ âœ¦ ${config.PREFIX}setgrouppp [image]
â”‚ âœ¦ ${config.PREFIX}lockgroup
â”‚ âœ¦ ${config.PREFIX}unlockgroup
â”‚ âœ¦ ${config.PREFIX}announceon
â”‚ âœ¦ ${config.PREFIX}announceoff
â”‚
â”œâ”€ã€Œ *MEMBER MANAGEMENT* ã€
â”‚ âœ¦ ${config.PREFIX}add [number]
â”‚ âœ¦ ${config.PREFIX}kick @tag
â”‚ âœ¦ ${config.PREFIX}remove @tag
â”‚ âœ¦ ${config.PREFIX}promote @tag
â”‚ âœ¦ ${config.PREFIX}demote @tag
â”‚ âœ¦ ${config.PREFIX}mentionall
â”‚ âœ¦ ${config.PREFIX}tagall
â”‚ âœ¦ ${config.PREFIX}hidetag [text]
â”‚ âœ¦ ${config.PREFIX}getadmin
â”‚ âœ¦ ${config.PREFIX}getowner
â”‚
â”œâ”€ã€Œ *GROUP SETTINGS* ã€
â”‚ âœ¦ ${config.PREFIX}welcome [on/off]
â”‚ âœ¦ ${config.PREFIX}goodbye [on/off]
â”‚ âœ¦ ${config.PREFIX}antilink [on/off]
â”‚ âœ¦ ${config.PREFIX}antispam [on/off]
â”‚ âœ¦ ${config.PREFIX}antiviewonce [on/off]
â”‚ âœ¦ ${config.PREFIX}antidelete [on/off]
â”‚ âœ¦ ${config.PREFIX}filter [on/off]
â”‚ âœ¦ ${config.PREFIX}nsfw [on/off]
â”‚ âœ¦ ${config.PREFIX}simsimi [on/off]
â”‚
â”œâ”€ã€Œ *GROUP INFO* ã€
â”‚ âœ¦ ${config.PREFIX}admins
â”‚ âœ¦ ${config.PREFIX}members
â”‚ âœ¦ ${config.PREFIX}invitelist
â”‚ âœ¦ ${config.PREFIX}requestlist
â”‚ âœ¦ ${config.PREFIX}pending
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *Group Management Commands*`.trim();

                    if (buttonSetting.enabled) {
                        const buttons = [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MAIN MENU" }, type: 1 },
                            { buttonId: `${config.PREFIX}groupinfo`, buttonText: { displayText: "ðŸ“Š GROUP INFO" }, type: 1 }
                        ];
                        await socket.sendMessage(sender, { 
                            text, 
                            footer: "ðŸ‘¥ Group Commands", 
                            buttons 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ DOWNLOAD MENU ============
                case 'download':
                case 'downloadmenu':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸ“¥", key: msg.key } });
                    
                    const text = `â•­â”€ã€Œ ðŸ“¥ *DOWNLOAD MENU* ã€â”€âž¤
â”‚
â”œâ”€ã€Œ ðŸŽµ *AUDIO/MUSIC* ã€
â”‚ âœ¦ ${config.PREFIX}song [query]
â”‚ âœ¦ ${config.PREFIX}ytmp3 [url]
â”‚ âœ¦ ${config.PREFIX}play [song name]
â”‚ âœ¦ ${config.PREFIX}spotify [url]
â”‚ âœ¦ ${config.PREFIX}deezer [url]
â”‚ âœ¦ ${config.PREFIX}soundcloud [url]
â”‚
â”œâ”€ã€Œ ðŸŽ¬ *VIDEO* ã€
â”‚ âœ¦ ${config.PREFIX}ytmp4 [url]
â”‚ âœ¦ ${config.PREFIX}video [query]
â”‚ âœ¦ ${config.PREFIX}ytplay [video]
â”‚ âœ¦ ${config.PREFIX}tiktok [url]
â”‚ âœ¦ ${config.PREFIX}tiktoknowm [url]
â”‚ âœ¦ ${config.PREFIX}instagram [url]
â”‚ âœ¦ ${config.PREFIX}fbvideo [url]
â”‚ âœ¦ ${config.PREFIX}twitter [url]
â”‚ âœ¦ ${config.PREFIX}terabox [url]
â”‚
â”œâ”€ã€Œ ðŸ“± *SOCIAL MEDIA* ã€
â”‚ âœ¦ ${config.PREFIX}igphoto [url]
â”‚ âœ¦ ${config.PREFIX}igvideo [url]
â”‚ âœ¦ ${config.PREFIX}igstory [username]
â”‚ âœ¦ ${config.PREFIX}fbphoto [url]
â”‚ âœ¦ ${config.PREFIX}pinterest [query]
â”‚ âœ¦ ${config.PREFIX}threads [url]
â”‚ âœ¦ ${config.PREFIX}snaptik [url]
â”‚
â”œâ”€ã€Œ ðŸ“ *FILES/DOCUMENTS* ã€
â”‚ âœ¦ ${config.PREFIX}mediafire [url]
â”‚ âœ¦ ${config.PREFIX}apksearch [app]
â”‚ âœ¦ ${config.PREFIX}apkdownload [app]
â”‚ âœ¦ ${config.PREFIX}modapk [app]
â”‚ âœ¦ ${config.PREFIX}pdf [query]
â”‚ âœ¦ ${config.PREFIX}doc [query]
â”‚
â”œâ”€ã€Œ ðŸ” *SEARCH* ã€
â”‚ âœ¦ ${config.PREFIX}yts [query]
â”‚ âœ¦ ${config.PREFIX}google [query]
â”‚ âœ¦ ${config.PREFIX}image [query]
â”‚ âœ¦ ${config.PREFIX}wallpaper [query]
â”‚ âœ¦ ${config.PREFIX}wikimedia [query]
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *Download Commands*`.trim();

                    if (buttonSetting.enabled) {
                        const buttons = [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MAIN MENU" }, type: 1 },
                            { buttonId: `${config.PREFIX}song`, buttonText: { displayText: "ðŸŽµ SONG" }, type: 1 }
                        ];
                        await socket.sendMessage(sender, { 
                            text, 
                            footer: "ðŸ“¥ Download Commands", 
                            buttons 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ TOOLS MENU ============
                case 'tools':
                case 'toolmenu':
                case 'utilities':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸ› ï¸", key: msg.key } });
                    
                    const text = `â•­â”€ã€Œ ðŸ› ï¸ *TOOLS MENU* ã€â”€âž¤
â”‚
â”œâ”€ã€Œ ðŸ“Š *BOT STATUS* ã€
â”‚ âœ¦ ${config.PREFIX}ping
â”‚ âœ¦ ${config.PREFIX}alive
â”‚ âœ¦ ${config.PREFIX}speed
â”‚ âœ¦ ${config.PREFIX}uptime
â”‚ âœ¦ ${config.PREFIX}runtime
â”‚
â”œâ”€ã€Œ ðŸ” *INFO TOOLS* ã€
â”‚ âœ¦ ${config.PREFIX}sticker
â”‚ âœ¦ ${config.PREFIX}toimg
â”‚ âœ¦ ${config.PREFIX}tovid
â”‚ âœ¦ ${config.PREFIX}tomp3
â”‚ âœ¦ ${config.PREFIX}quote
â”‚ âœ¦ ${config.PREFIX}weather [city]
â”‚ âœ¦ ${config.PREFIX}time [country]
â”‚ âœ¦ ${config.PREFIX}date
â”‚
â”œâ”€ã€Œ ðŸŽ¯ *UTILITIES* ã€
â”‚ âœ¦ ${config.PREFIX}calc [expression]
â”‚ âœ¦ ${config.PREFIX}math [expression]
â”‚ âœ¦ ${config.PREFIX}qr [text]
â”‚ âœ¦ ${config.PREFIX}qrread [image]
â”‚ âœ¦ ${config.PREFIX}shorten [url]
â”‚ âœ¦ ${config.PREFIX}translate [lang] [text]
â”‚ âœ¦ ${config.PREFIX}define [word]
â”‚ âœ¦ ${config.PREFIX}spell [text]
â”‚
â”œâ”€ã€Œ ðŸ”¢ *CONVERTERS* ã€
â”‚ âœ¦ ${config.PREFIX}currency [amount] [from] [to]
â”‚ âœ¦ ${config.PREFIX}unit [value] [from] [to]
â”‚ âœ¦ ${config.PREFIX}json [text]
â”‚ âœ¦ ${config.PREFIX}b64encode [text]
â”‚ âœ¦ ${config.PREFIX}b64decode [text]
â”‚
â”œâ”€ã€Œ ðŸŒ *WEB TOOLS* ã€
â”‚ âœ¦ ${config.PREFIX}webcheck [url]
â”‚ âœ¦ ${config.PREFIX}whois [domain]
â”‚ âœ¦ ${config.PREFIX}headers [url]
â”‚ âœ¦ ${config.PREFIX}ipinfo [ip]
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *Tools & Utilities*`.trim();

                    if (buttonSetting.enabled) {
                        const buttons = [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MAIN MENU" }, type: 1 },
                            { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "âš¡ PING" }, type: 1 }
                        ];
                        await socket.sendMessage(sender, { 
                            text, 
                            footer: "ðŸ› ï¸ Tools Menu", 
                            buttons 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ SETTINGS MENU ============
                case 'settings':
                case 'setting':
                case 'config':
                {
                    await socket.sendMessage(sender, { react: { text: "âš™ï¸", key: msg.key } });
                    
                    const text = `â•­â”€ã€Œ âš™ï¸ *SETTINGS MENU* ã€â”€âž¤
â”‚
â”œâ”€ã€Œ ðŸ¤– *BOT CUSTOMIZATION* ã€
â”‚ âœ¦ ${config.PREFIX}setname [name]
â”‚ âœ¦ ${config.PREFIX}setlogo [url]
â”‚ âœ¦ ${config.PREFIX}setprefix [symbol]
â”‚ âœ¦ ${config.PREFIX}resetconfig
â”‚ âœ¦ ${config.PREFIX}viewconfig
â”‚
â”œâ”€ã€Œ ðŸ”§ *FEATURE SETTINGS* ã€
â”‚ âœ¦ ${config.PREFIX}autostatus [on/off]
â”‚ âœ¦ ${config.PREFIX}autorecord [on/off]
â”‚ âœ¦ ${config.PREFIX}autogroup [on/off]
â”‚ âœ¦ ${config.PREFIX}autoread [on/off]
â”‚ âœ¦ ${config.PREFIX}autobio [on/off]
â”‚ âœ¦ ${config.PREFIX}autovv [on/off]
â”‚ âœ¦ ${config.PREFIX}vvtoinbox [on/off]
â”‚
â”œâ”€ã€Œ ðŸŽ¨ *DISPLAY SETTINGS* ã€
â”‚ âœ¦ ${config.PREFIX}themecolor [color]
â”‚ âœ¦ ${config.PREFIX}setfooter [text]
â”‚ âœ¦ ${config.PREFIX}setheader [text]
â”‚ âœ¦ ${config.PREFIX}setemojistyle [style]
â”‚
â”œâ”€ã€Œ ðŸ” *PRIVACY SETTINGS* ã€
â”‚ âœ¦ ${config.PREFIX}block [number]
â”‚ âœ¦ ${config.PREFIX}unblock [number]
â”‚ âœ¦ ${config.PREFIX}blocklist
â”‚ âœ¦ ${config.PREFIX}privacy [setting]
â”‚
â”œâ”€ã€Œ ðŸ—‘ï¸ *SESSION MANAGEMENT* ã€
â”‚ âœ¦ ${config.PREFIX}deleteme
â”‚ âœ¦ ${config.PREFIX}restart
â”‚ âœ¦ ${config.PREFIX}logout
â”‚ âœ¦ ${config.PREFIX}clearcache
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *Configuration Settings*`.trim();

                    if (buttonSetting.enabled) {
                        const buttons = [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MAIN MENU" }, type: 1 },
                            { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "ðŸ‘‘ OWNER" }, type: 1 }
                        ];
                        await socket.sendMessage(sender, { 
                            text, 
                            footer: "âš™ï¸ Settings Menu", 
                            buttons 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ CREATIVE MENU ============
                case 'creative':
                case 'creativemenu':
                case 'fun':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸŽ¨", key: msg.key } });
                    
                    const text = `â•­â”€ã€Œ ðŸŽ¨ *CREATIVE MENU* ã€â”€âž¤
â”‚
â”œâ”€ã€Œ ðŸ¤– *AI FEATURES* ã€
â”‚ âœ¦ ${config.PREFIX}ai [message]
â”‚ âœ¦ ${config.PREFIX}gpt [prompt]
â”‚ âœ¦ ${config.PREFIX}bard [question]
â”‚ âœ¦ ${config.PREFIX}gemini [prompt]
â”‚ âœ¦ ${config.PREFIX}llama [message]
â”‚ âœ¦ ${config.PREFIX}claude [question]
â”‚
â”œâ”€ã€Œ âœï¸ *TEXT TOOLS* ã€
â”‚ âœ¦ ${config.PREFIX}fancy [text]
â”‚ âœ¦ ${config.PREFIX}glitch [text]
â”‚ âœ¦ ${config.PREFIX}font [text]
â”‚ âœ¦ ${config.PREFIX}style [text]
â”‚ âœ¦ ${config.PREFIX}reverse [text]
â”‚ âœ¦ ${config.PREFIX}count [text]
â”‚
â”œâ”€ã€Œ ðŸ–¼ï¸ *IMAGE TOOLS* ã€
â”‚ âœ¦ ${config.PREFIX}sticker
â”‚ âœ¦ ${config.PREFIX}circle
â”‚ âœ¦ ${config.PREFIX}blur
â”‚ âœ¦ ${config.PREFIX}bright
â”‚ âœ¦ ${config.PREFIX}dark
â”‚ âœ¦ ${config.PREFIX}greyscale
â”‚ âœ¦ ${config.PREFIX}invert
â”‚ âœ¦ ${config.PREFIX}mirror
â”‚
â”œâ”€ã€Œ ðŸŽ® *GAMES* ã€
â”‚ âœ¦ ${config.PREFIX}ttt [@tag]
â”‚ âœ¦ ${config.PREFIX}rps [choice]
â”‚ âœ¦ ${config.PREFIX}dice
â”‚ âœ¦ ${config.PREFIX}flipcoin
â”‚ âœ¦ ${config.PREFIX}guessnumber
â”‚ âœ¦ ${config.PREFIX}mathquiz
â”‚
â”œâ”€ã€Œ ðŸŽµ *AUDIO TOOLS* ã€
â”‚ âœ¦ ${config.PREFIX}bass [audio]
â”‚ âœ¦ ${config.PREFIX}slow [audio]
â”‚ âœ¦ ${config.PREFIX}fast [audio]
â”‚ âœ¦ ${config.PREFIX}vibes [audio]
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *Creative & Fun Commands*`.trim();

                    if (buttonSetting.enabled) {
                        const buttons = [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MAIN MENU" }, type: 1 },
                            { buttonId: `${config.PREFIX}ai`, buttonText: { displayText: "ðŸ¤– AI" }, type: 1 }
                        ];
                        await socket.sendMessage(sender, { 
                            text, 
                            footer: "ðŸŽ¨ Creative Menu", 
                            buttons 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ AUTO REPLY MENU ============
                case 'autoreply':
                case 'autoreplymenu':
                case 'automessage':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    await socket.sendMessage(sender, { react: { text: "ðŸ¤–", key: msg.key } });
                    
                    const autoReplyMsgs = await getAutoReplyMessages();
                    let autoList = '';
                    let index = 1;
                    
                    for (const [keyword, data] of Object.entries(autoReplyMsgs)) {
                        autoList += `${index}. *${keyword}* âžœ ${data.response.substring(0, 30)}...\n`;
                        index++;
                        if (index > 10) break;
                    }
                    
                    const text = `â•­â”€ã€Œ ðŸ¤– *AUTO REPLY MENU* ã€â”€âž¤
â”‚
â”œâ”€ã€Œ *STATUS* ã€
â”‚ ðŸ“¢ Auto Reply: ${config.AUTO_REPLY_ENABLED === 'true' ? 'ON âœ…' : 'OFF âŒ'}
â”‚
â”œâ”€ã€Œ *COMMANDS* ã€
â”‚ âœ¦ ${config.PREFIX}addreply [keyword]|[response]
â”‚ âœ¦ ${config.PREFIX}delreply [keyword]
â”‚ âœ¦ ${config.PREFIX}listreply
â”‚ âœ¦ ${config.PREFIX}replyon
â”‚ âœ¦ ${config.PREFIX}replyoff
â”‚ âœ¦ ${config.PREFIX}editreply [keyword]|[new response]
â”‚ âœ¦ ${config.PREFIX}testreply [keyword]
â”‚ âœ¦ ${config.PREFIX}cleareply
â”‚
â”œâ”€ã€Œ *ACTIVE REPLIES* ã€
${autoList || 'â”‚ âš ï¸ No auto replies set'}
â”‚
â”œâ”€ã€Œ *FEATURES* ã€
â”‚ â€¢ Auto reply works with quoted messages
â”‚ â€¢ Replies to the specific quoted message
â”‚ â€¢ Multiple keywords supported
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *Auto Reply System*`.trim();

                    if (buttonSetting.enabled) {
                        const buttons = [
                            { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MAIN MENU" }, type: 1 },
                            { buttonId: `${config.PREFIX}listreply`, buttonText: { displayText: "ðŸ“‹ LIST" }, type: 1 }
                        ];
                        await socket.sendMessage(sender, { 
                            text, 
                            footer: "ðŸ¤– Auto Reply", 
                            buttons 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ BUTTON MENU ============
                case 'button':
                case 'buttonmenu':
                case 'btns':
                {
                    await socket.sendMessage(sender, { react: { text: "ðŸ”˜", key: msg.key } });
                    
                    const currentSetting = await getButtonSetting(from);
                    const status = currentSetting.enabled ? 'ON âœ…' : 'OFF âŒ';
                    
                    const text = `â•­â”€ã€Œ ðŸ”˜ *BUTTON SETTINGS* ã€â”€âž¤
â”‚
â”‚ ðŸ“ *Chat:* ${from.includes('g.us') ? 'Group' : 'Private'}
â”‚ ðŸ”˜ *Status:* ${status}
â”‚
â”œâ”€ã€Œ *COMMANDS* ã€
â”‚ âœ¦ ${config.PREFIX}buttonon
â”‚ âœ¦ ${config.PREFIX}buttonoff
â”‚ âœ¦ ${config.PREFIX}buttonstatus
â”‚
â”œâ”€ã€Œ *DESCRIPTION* ã€
â”‚ Buttons add interactive elements to messages.
â”‚ When ON: Commands show with interactive buttons
â”‚ When OFF: Commands show as plain text
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *Button Configuration*`.trim();

                    const buttons = [
                        { buttonId: `${config.PREFIX}buttonon`, buttonText: { displayText: "ðŸ”˜ ON" }, type: 1 },
                        { buttonId: `${config.PREFIX}buttonoff`, buttonText: { displayText: "ðŸ”˜ OFF" }, type: 1 },
                        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MENU" }, type: 1 }
                    ];
                    
                    await socket.sendMessage(sender, { 
                        text, 
                        footer: "ðŸ”˜ Button Settings", 
                        buttons 
                    }, { quoted: fakevcard });
                    break;
                }
                
                // ============ BUTTON CONTROL ============
                case 'buttonon':
                {
                    await setButtonSetting(from, { enabled: true });
                    await socket.sendMessage(sender, { 
                        text: 'âœ… Buttons enabled for this chat!', 
                        footer: 'ðŸ”˜ Button Settings' 
                    }, { quoted: fakevcard });
                    break;
                }
                
                case 'buttonoff':
                {
                    await setButtonSetting(from, { enabled: false });
                    await socket.sendMessage(sender, { 
                        text: 'âœ… Buttons disabled for this chat!', 
                        footer: 'ðŸ”˜ Button Settings' 
                    }, { quoted: fakevcard });
                    break;
                }
                
                case 'buttonstatus':
                {
                    const currentSetting = await getButtonSetting(from);
                    const status = currentSetting.enabled ? 'ON âœ…' : 'OFF âŒ';
                    await socket.sendMessage(sender, { 
                        text: `ðŸ”˜ Buttons are: *${status}* for this chat`, 
                        footer: 'Button Status' 
                    }, { quoted: fakevcard });
                    break;
                }
                
                // ============ AUTO REPLY MANAGEMENT ============
                case 'addreply':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    const input = args.join(' ');
                    const [keyword, ...responseParts] = input.split('|');
                    
                    if (!keyword || responseParts.length === 0) {
                        await socket.sendMessage(sender, { 
                            text: `Usage: ${config.PREFIX}addreply keyword|response` 
                        }, { quoted: msg });
                        break;
                    }
                    
                    const response = responseParts.join('|').trim();
                    await setAutoReplyMessage(keyword.trim(), response);
                    await socket.sendMessage(sender, { 
                        text: `âœ… Auto reply added!\n\nKeyword: *${keyword.trim()}*\nResponse: ${response.substring(0, 50)}${response.length > 50 ? '...' : ''}` 
                    }, { quoted: fakevcard });
                    break;
                }
                
                case 'delreply':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    const keyword = args[0];
                    if (!keyword) {
                        await socket.sendMessage(sender, { 
                            text: `Usage: ${config.PREFIX}delreply [keyword]` 
                        }, { quoted: msg });
                        break;
                    }
                    
                    await deleteAutoReplyMessage(keyword);
                    await socket.sendMessage(sender, { 
                        text: `âœ… Auto reply deleted for keyword: *${keyword}*` 
                    }, { quoted: fakevcard });
                    break;
                }
                
                case 'listreply':
                {
                    const autoReplyMsgs = await getAutoReplyMessages();
                    let replyText = '*ðŸ“‹ Auto Reply List*\n\n';
                    
                    if (Object.keys(autoReplyMsgs).length === 0) {
                        replyText += 'No auto replies configured yet.';
                    } else {
                        let index = 1;
                        for (const [keyword, data] of Object.entries(autoReplyMsgs)) {
                            replyText += `${index}. *${keyword}*\n   â†³ ${data.response.substring(0, 50)}${data.response.length > 50 ? '...' : ''}\n\n`;
                            index++;
                        }
                    }
                    
                    await socket.sendMessage(sender, { text: replyText }, { quoted: fakevcard });
                    break;
                }
                
                case 'replyon':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    config.AUTO_REPLY_ENABLED = 'true';
                    await setGlobalSetting('AUTO_REPLY_ENABLED', 'true');
                    await socket.sendMessage(sender, { 
                        text: 'âœ… Auto Reply system *ENABLED*' 
                    }, { quoted: fakevcard });
                    break;
                }
                
                case 'replyoff':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    config.AUTO_REPLY_ENABLED = 'false';
                    await setGlobalSetting('AUTO_REPLY_ENABLED', 'false');
                    await socket.sendMessage(sender, { 
                        text: 'âœ… Auto Reply system *DISABLED*' 
                    }, { quoted: fakevcard });
                    break;
                }
                
                case 'editreply':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    const input = args.join(' ');
                    const [keyword, ...responseParts] = input.split('|');
                    
                    if (!keyword || responseParts.length === 0) {
                        await socket.sendMessage(sender, { 
                            text: `Usage: ${config.PREFIX}editreply keyword|new response` 
                        }, { quoted: msg });
                        break;
                    }
                    
                    const response = responseParts.join('|').trim();
                    await setAutoReplyMessage(keyword.trim(), response);
                    await socket.sendMessage(sender, { 
                        text: `âœ… Auto reply updated for keyword: *${keyword.trim()}*` 
                    }, { quoted: fakevcard });
                    break;
                }
                
                case 'testreply':
                {
                    const keyword = args[0];
                    if (!keyword) {
                        await socket.sendMessage(sender, { 
                            text: `Usage: ${config.PREFIX}testreply [keyword]` 
                        }, { quoted: msg });
                        break;
                    }
                    
                    const autoReplyMsgs = await getAutoReplyMessages();
                    if (autoReplyMsgs[keyword]) {
                        await socket.sendMessage(sender, { 
                            text: `âœ… *Auto Reply Test*\n\nKeyword: *${keyword}*\nResponse: ${autoReplyMsgs[keyword].response}` 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { 
                            text: `âŒ No auto reply found for keyword: *${keyword}*` 
                        }, { quoted: fakevcard });
                    }
                    break;
                }
                
                case 'cleareply':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    writeJSON(sessionFiles.autoReply, {});
                    await socket.sendMessage(sender, { 
                        text: 'âœ… All auto replies cleared!' 
                    }, { quoted: fakevcard });
                    break;
                }
                
                // ============ BOT CUSTOMIZATION ============
                case 'setname':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    if (!args[0]) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}setname [new bot name]` }, { quoted: msg });
                        break;
                    }
                    
                    const newName = args.join(' ');
                    await setUserConfigInFile(number, { botName: newName });
                    await socket.sendMessage(sender, { text: `âœ… Bot name changed to: *${newName}*` }, { quoted: fakevcard });
                    break;
                }
                
                case 'setlogo':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    if (!args[0]) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}setlogo [image url]` }, { quoted: msg });
                        break;
                    }
                    
                    const logoUrl = args[0];
                    await setUserConfigInFile(number, { logo: logoUrl });
                    await socket.sendMessage(sender, { text: `âœ… Bot logo changed!` }, { quoted: fakevcard });
                    break;
                }
                
                case 'setprefix':
                {
                    if (!isOwner) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner only command.' }, { quoted: msg });
                        break;
                    }
                    
                    if (!args[0]) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}setprefix [symbol]` }, { quoted: msg });
                        break;
                    }
                    
                    config.PREFIX = args[0];
                    await socket.sendMessage(sender, { text: `âœ… Bot prefix changed to: *${args[0]}*` }, { quoted: fakevcard });
                    break;
                }
                
                case 'resetconfig':
                {
                    if (!isOwner && !(await loadAdminsFromFile()).includes(senderNumber)) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner/Admin only command.' }, { quoted: msg });
                        break;
                    }
                    
                    await setUserConfigInFile(number, {});
                    await socket.sendMessage(sender, { text: `âœ… Bot configuration reset to default!` }, { quoted: fakevcard });
                    break;
                }
                
                case 'viewconfig':
                {
                    const userCfg = await loadUserConfigFromFile(number);
                    const botName = userCfg.botName || config.BOT_NAME;
                    const logo = userCfg.logo || config.LOGO_URL;
                    
                    const configText = `â•­â”€ã€Œ âš™ï¸ *BOT CONFIG* ã€â”€âž¤
â”‚
â”‚ ðŸ¤– *Name:* ${botName}
â”‚ ðŸ–¼ï¸ *Logo:* ${logo.substring(0, 50)}...
â”‚ âœï¸ *Prefix:* ${config.PREFIX}
â”‚ ðŸ“Š *Version:* ${config.BOT_VERSION}
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—`;

                    await socket.sendMessage(sender, { text: configText }, { quoted: fakevcard });
                    break;
                }
                
                // ============ FEATURE SETTINGS ============
                case 'autostatus':
                {
                    const state = args[0]?.toLowerCase();
                    if (state === 'on' || state === 'off') {
                        config.AUTO_VIEW_STATUS = state === 'on' ? 'true' : 'false';
                        config.AUTO_LIKE_STATUS = state === 'on' ? 'true' : 'false';
                        await setGlobalSetting('AUTO_VIEW_STATUS', config.AUTO_VIEW_STATUS);
                        await setGlobalSetting('AUTO_LIKE_STATUS', config.AUTO_LIKE_STATUS);
                        await socket.sendMessage(sender, { text: `âœ… Auto Status set to: *${state}*` }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}autostatus [on/off]\nCurrent: ${config.AUTO_VIEW_STATUS === 'true' ? 'ON âœ…' : 'OFF âŒ'}` }, { quoted: msg });
                    }
                    break;
                }
                
                case 'autorecord':
                {
                    const state = args[0]?.toLowerCase();
                    if (state === 'on' || state === 'off') {
                        config.AUTO_RECORDING = state === 'on' ? 'true' : 'false';
                        await setGlobalSetting('AUTO_RECORDING', config.AUTO_RECORDING);
                        await socket.sendMessage(sender, { text: `âœ… Auto Recording set to: *${state}*` }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}autorecord [on/off]\nCurrent: ${config.AUTO_RECORDING === 'true' ? 'ON âœ…' : 'OFF âŒ'}` }, { quoted: msg });
                    }
                    break;
                }
                
                case 'autogroup':
                {
                    const state = args[0]?.toLowerCase();
                    if (state === 'on' || state === 'off') {
                        config.AUTO_JOIN_GROUP = state === 'on' ? 'true' : 'false';
                        await setGlobalSetting('AUTO_JOIN_GROUP', config.AUTO_JOIN_GROUP);
                        await socket.sendMessage(sender, { text: `âœ… Auto Group Join set to: *${state}*` }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}autogroup [on/off]\nCurrent: ${config.AUTO_JOIN_GROUP === 'true' ? 'ON âœ…' : 'OFF âŒ'}` }, { quoted: msg });
                    }
                    break;
                }
                
                // ============ DOWNLOAD COMMANDS ============
                case 'song':
                case 'play':
                {
                    const query = args.join(' ');
                    if (!query) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}song [song name]` }, { quoted: msg });
                        break;
                    }
                    
                    try {
                        await socket.sendMessage(sender, { react: { text: "ðŸŽµ", key: msg.key } });
                        await socket.sendMessage(sender, { text: '*ðŸ” Searching for song...*' }, { quoted: fakevcard });
                        
                        const search = await yts(query);
                        if (!search?.videos?.length) {
                            await socket.sendMessage(sender, { text: 'âŒ No results found!' }, { quoted: fakevcard });
                            break;
                        }
                        
                        const video = search.videos[0];
                        const api = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(video.url)}`;
                        const res = await axios.get(api, { timeout: 60000 });
                        
                        if (!res?.data?.result?.download) throw "API_FAILED";
                        
                        await socket.sendMessage(sender, { 
                            audio: { url: res.data.result.download }, 
                            mimetype: "audio/mpeg", 
                            ptt: false 
                        }, { quoted: fakevcard });
                        
                        await socket.sendMessage(sender, { 
                            text: `âœ… *${video.title}*\nâ±ï¸ ${video.timestamp}\nðŸ“Š ${video.views} views` 
                        }, { quoted: fakevcard });
                        
                    } catch (err) {
                        console.error("song error:", err);
                        await socket.sendMessage(sender, { text: 'âŒ Failed to download song.' }, { quoted: fakevcard });
                    }
                    break;
                }
                
                case 'ts': {
    const axios = require('axios');

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const query = q.replace(/^[.\/!]ts\s*/i, '').trim();

    if (!query) {
        return await socket.sendMessage(sender, {
            text: '[â—] TikTok à¶‘à¶šà·š à¶¸à·œà¶šà¶¯à·Šà¶¯ à¶¶à¶½à¶±à·Šà¶± à¶•à¶±à·™ à¶šà·’à¶ºà¶´à¶‚! ðŸ”'
        }, { quoted: msg });
    }

    async function tiktokSearch(query) {
        try {
            const searchParams = new URLSearchParams({
                keywords: query,
                count: '10',
                cursor: '0',
                HD: '1'
            });

            const response = await axios.post("https://tikwm.com/api/feed/search", searchParams, {
                headers: {
                    'Content-Type': "application/x-www-form-urlencoded; charset=UTF-8",
                    'Cookie': "current_language=en",
                    'User-Agent': "Mozilla/5.0"
                }
            });

            const videos = response.data?.data?.videos;
            if (!videos || videos.length === 0) {
                return { status: false, result: "No videos found." };
            }

            return {
                status: true,
                result: videos.map(video => ({
                    description: video.title || "No description",
                    videoUrl: video.play || ""
                }))
            };
        } catch (err) {
            return { status: false, result: err.message };
        }
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    try {
        const searchResults = await tiktokSearch(query);
        if (!searchResults.status) throw new Error(searchResults.result);

        const results = searchResults.result;
        shuffleArray(results);

        const selected = results.slice(0, 6);

        const cards = await Promise.all(selected.map(async (vid) => {
            const videoBuffer = await axios.get(vid.videoUrl, { responseType: "arraybuffer" });

            const media = await prepareWAMessageMedia({ video: videoBuffer.data }, {
                upload: socket.waUploadToServer
            });

            return {
                body: proto.Message.InteractiveMessage.Body.fromObject({ text: '' }),
                footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: "laki md mini ðð™¾ðšƒ" }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: vid.description,
                    hasMediaAttachment: true,
                    videoMessage: media.videoMessage // ðŸŽ¥ Real video preview
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [] // âŒ No buttons
                })
            };
        }));

        const msgContent = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: `ðŸ”Ž *TikTok Search:* ${query}` },
                        footer: { text: "> ðð™¾ðš†ð™´ðšð™³ ððšˆ lakshan-ðŒð™³" },
                        header: { hasMediaAttachment: false },
                        carouselMessage: { cards }
                    })
                }
            }
        }, { quoted: msg });

        await socket.relayMessage(sender, msgContent.message, { messageId: msgContent.key.id });

    } catch (err) {
        await socket.sendMessage(sender, {
            text: `âŒ Error: ${err.message}`
        }, { quoted: msg });
    }

    break;
            }
                
                case 'mediafire':
                {
                    const url = args[0];
                    if (!url) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}mediafire [mediafire url]` }, { quoted: msg });
                        break;
                    }
                    
                    try {
                        await socket.sendMessage(sender, { react: { text: "ðŸ“¥", key: msg.key } });
                        await socket.sendMessage(sender, { text: '*ðŸ“ Fetching MediaFire file...*' }, { quoted: fakevcard });
                        
                        const api = `https://tharuzz-ofc-apis.vercel.app/api/download/mediafire?url=${encodeURIComponent(url)}`;
                        const { data } = await axios.get(api);
                        
                        if (!data.success || !data.result) {
                            await socket.sendMessage(sender, { text: 'âŒ Failed to fetch file.' }, { quoted: fakevcard });
                            break;
                        }
                        
                        await socket.sendMessage(sender, { 
                            document: { url: data.result.url }, 
                            fileName: data.result.filename, 
                            caption: `ðŸ“ *${data.result.filename}*\nðŸ“ Size: ${data.result.size}\nðŸ“Š Type: ${data.result.ext}` 
                        }, { quoted: fakevcard });
                        
                    } catch (err) {
                        console.error("mediafire error:", err);
                        await socket.sendMessage(sender, { text: 'âŒ Failed to download file.' }, { quoted: fakevcard });
                    }
                    break;
                }
                
                case 'ytmp4':
                case 'video':
                {
                    const query = args.join(' ');
                    if (!query) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}video [song name or url]` }, { quoted: msg });
                        break;
                    }
                    
                    try {
                        await socket.sendMessage(sender, { react: { text: "ðŸŽ¬", key: msg.key } });
                        await socket.sendMessage(sender, { text: '*ðŸ” Searching video...*' }, { quoted: fakevcard });
                        
                        let videoUrl = query;
                        if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
                            const search = await yts(query);
                            if (!search?.videos?.length) throw "No results";
                            videoUrl = search.videos[0].url;
                        }
                        
                        const api = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(videoUrl)}`;
                        const res = await axios.get(api, { timeout: 60000 });
                        
                        if (!res?.data?.result?.download) throw "API_FAILED";
                        
                        await socket.sendMessage(sender, { 
                            video: { url: res.data.result.download },
                            caption: `âœ… *${res.data.result.title || 'Video'}*`
                        }, { quoted: fakevcard });
                        
                    } catch (err) {
                        console.error("video error:", err);
                        await socket.sendMessage(sender, { text: 'âŒ Failed to download video.' }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ AI COMMANDS ============
                case 'ai':
                case 'gpt':
                case 'chat':
                {
                    const prompt = args.join(' ');
                    if (!prompt) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}ai [your message]` }, { quoted: msg });
                        break;
                    }
                    
                    try {
                        await socket.sendMessage(sender, { react: { text: "ðŸ¤–", key: msg.key } });
                        await socket.sendMessage(sender, { text: '*ðŸ§  AI thinking...*' }, { quoted: fakevcard });
                        
                        const apiUrl = `https://api.malvin.gleeze.com/ai/openai?text=${encodeURIComponent(prompt)}`;
                        const response = await axios.get(apiUrl, { timeout: 30000 });
                        
                        const aiReply = response?.data?.result || response?.data?.response || 'No response from AI';
                        
                        await socket.sendMessage(sender, { 
                            text: aiReply,
                            footer: "ðŸ¤– AI Response"
                        }, { quoted: fakevcard });
                        
                    } catch (err) {
                        console.error("AI error:", err);
                        await socket.sendMessage(sender, { text: 'âŒ AI service unavailable.' }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ STICKER COMMANDS ============
                case 'sticker':
                case 's':
                {
                    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    
                    if (!quotedMsg) {
                        await socket.sendMessage(sender, { text: 'âŒ Please reply to an image/video with caption .sticker' }, { quoted: msg });
                        break;
                    }
                    
                    try {
                        await socket.sendMessage(sender, { react: { text: "ðŸŽ¨", key: msg.key } });
                        await socket.sendMessage(sender, { text: '*ðŸ–¼ï¸ Creating sticker...*' }, { quoted: fakevcard });
                        
                        let media;
                        if (quotedMsg.imageMessage) {
                            media = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
                        } else if (quotedMsg.videoMessage) {
                            media = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
                        } else {
                            await socket.sendMessage(sender, { text: 'âŒ Unsupported media type' }, { quoted: msg });
                            break;
                        }
                        
                        let buffer = Buffer.from([]);
                        for await (const chunk of media) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        
                        await socket.sendMessage(sender, { 
                            sticker: buffer 
                        }, { quoted: fakevcard });
                        
                    } catch (err) {
                        console.error("sticker error:", err);
                        await socket.sendMessage(sender, { text: 'âŒ Failed to create sticker.' }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ TOOLS COMMANDS ============
                case 'ping':
                {
                    const start = Date.now();
                    const latency = Date.now() - (msg.messageTimestamp * 1000 || Date.now());
                    const end = Date.now() - start;
                    
                    const text = `â•­â”€ã€Œ ðŸ“¡ *PING* ã€â”€âž¤
â”‚
â”‚ ðŸš€ *Response:* ${end}ms
â”‚ âš¡ *Latency:* ${latency}ms
â”‚ ðŸ•’ *Time:* ${new Date().toLocaleString()}
â”‚ ðŸ“Š *Active:* ${activeSockets.size}
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—`;

                    await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    break;
                }
                
                case 'alive':
                {
                    const userCfg = await loadUserConfigFromFile(number);
                    const botName = userCfg.botName || config.BOT_NAME;
                    const logo = userCfg.logo || config.LOGO_URL;
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    const text = `â•­â”€ã€Œ *${botName} - ALIVE* ã€â”€âž¤
â”‚
â”‚ ðŸ‘¤ *Owner:* ${config.OWNER_NAME}
â”‚ âœï¸ *Prefix:* ${config.PREFIX}
â”‚ ðŸ§¬ *Version:* ${config.BOT_VERSION}
â”‚ â° *Uptime:* ${hours}h ${minutes}m ${seconds}s
â”‚ ðŸ“Š *Platform:* ${process.platform}
â”‚ ðŸ’» *Memory:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *${botName} is Online!*`;

                    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);
                    
                    if (buttonSetting.enabled) {
                        await socket.sendMessage(sender, { 
                            image: imagePayload, 
                            caption: text, 
                            footer: `âœ… ${botName} is running`, 
                            buttons: [
                                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "ðŸ“œ MENU" }, type: 1 },
                                { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "âš¡ PING" }, type: 1 }
                            ], 
                            headerType: 4 
                        }, { quoted: fakevcard });
                    } else {
                        await socket.sendMessage(sender, { 
                            image: imagePayload, 
                            caption: text 
                        }, { quoted: fakevcard });
                    }
                    break;
                }
                
                case 'calc':
                case 'calculate':
                {
                    const expression = args.join(' ');
                    if (!expression) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}calc [expression]` }, { quoted: msg });
                        break;
                    }
                    
                    try {
                        const result = eval(expression);
                        await socket.sendMessage(sender, { 
                            text: `ðŸ“ *Expression:* ${expression}\nâœ… *Result:* ${result}` 
                        }, { quoted: fakevcard });
                    } catch (e) {
                        await socket.sendMessage(sender, { text: 'âŒ Invalid expression' }, { quoted: msg });
                    }
                    break;
                }
                
                case 'qr':
                {
                    const text = args.join(' ');
                    if (!text) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}qr [text]` }, { quoted: msg });
                        break;
                    }
                    
                    try {
                        await socket.sendMessage(sender, { react: { text: "ðŸ“±", key: msg.key } });
                        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
                        await socket.sendMessage(sender, { 
                            image: { url: qrUrl },
                            caption: `âœ… QR Code for: ${text}`
                        }, { quoted: fakevcard });
                    } catch (err) {
                        await socket.sendMessage(sender, { text: 'âŒ Failed to generate QR code' }, { quoted: fakevcard });
                    }
                    break;
                }
                
                case 'weather':
                {
                    const city = args.join(' ');
                    if (!city) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}weather [city]` }, { quoted: msg });
                        break;
                    }
                    
                    try {
                        await socket.sendMessage(sender, { react: { text: "ðŸŒ¤ï¸", key: msg.key } });
                        const apiKey = 'YOUR_API_KEY'; // Replace with actual API key
                        const url = `http://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`;
                        const { data } = await axios.get(url);
                        
                        const weatherText = `â•­â”€ã€Œ ðŸŒ¤ï¸ *WEATHER* ã€â”€âž¤
â”‚
â”‚ ðŸŒ† *City:* ${data.name}, ${data.sys.country}
â”‚ ðŸŒ¡ï¸ *Temp:* ${data.main.temp}Â°C
â”‚ ðŸ¤” *Feels like:* ${data.main.feels_like}Â°C
â”‚ ðŸ’§ *Humidity:* ${data.main.humidity}%
â”‚ ðŸ’¨ *Wind:* ${data.wind.speed} m/s
â”‚ â˜ï¸ *Condition:* ${data.weather[0].description}
â”‚ ðŸ“Š *Pressure:* ${data.main.pressure} hPa
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—`;

                        await socket.sendMessage(sender, { text: weatherText }, { quoted: fakevcard });
                    } catch (err) {
                        await socket.sendMessage(sender, { text: 'âŒ City not found or API error' }, { quoted: fakevcard });
                    }
                    break;
                }
                
                // ============ SESSION MANAGEMENT ============
                case 'deleteme':
                {
                    const sanitized = number.replace(/[^0-9]/g, '');
                    
                    if (!isOwner && senderNumber !== sanitized) {
                        await socket.sendMessage(sender, { text: 'âŒ Permission denied.' }, { quoted: msg });
                        break;
                    }
                    
                    try {
                        await removeSessionFromFile(sanitized);
                        
                        const sessionPath = path.join(sessionsDir, `session_${sanitized}`);
                        if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath);
                        
                        try { socket.ws?.close(); } catch(e) {}
                        activeSockets.delete(sanitized);
                        socketCreationTime.delete(sanitized);
                        
                        await socket.sendMessage(sender, { text: 'âœ… Session deleted successfully!' }, { quoted: fakevcard });
                    } catch (err) {
                        console.error('deleteme error:', err);
                        await socket.sendMessage(sender, { text: 'âŒ Failed to delete session.' }, { quoted: msg });
                    }
                    break;
                }
                
                case 'listsessions':
                case 'bots':
                {
                    const admins = await loadAdminsFromFile();
                    if (!isOwner && !admins.includes(senderNumber) && !admins.includes(nowsender)) {
                        await socket.sendMessage(sender, { text: 'âŒ Permission denied.' }, { quoted: msg });
                        break;
                    }
                    
                    const activeCount = activeSockets.size;
                    const activeNumbers = Array.from(activeSockets.keys());
                    
                    let text = `â•­â”€ã€Œ ðŸ¤– *ACTIVE SESSIONS* ã€â”€âž¤\nâ”‚\nâ”‚ ðŸ“Š *Total Active:* ${activeCount}\nâ”‚\n`;
                    
                    if (activeCount > 0) {
                        text += `â”‚ ðŸ“± *Active Numbers:*\n`;
                        activeNumbers.forEach((num, index) => {
                            text += `â”‚ ${index + 1}. ${num}\n`;
                        });
                    } else {
                        text += `â”‚ âš ï¸ No active sessions\n`;
                    }
                    
                    text += `â”‚\nâ•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—\n\n> ðŸ•’ ${getTimestamp()}`;
                    
                    await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    break;
                }
                
                case 'stats':
                {
                    const userCfg = await loadUserConfigFromFile(number);
                    const botName = userCfg.botName || config.BOT_NAME;
                    const allNumbers = await getAllNumbersFromFile();
                    const admins = await loadAdminsFromFile();
                    const newsletters = await listNewslettersFromFile();
                    const autoReplyMsgs = await getAutoReplyMessages();
                    
                    const memoryUsage = process.memoryUsage();
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    const text = `â•­â”€ã€Œ ðŸ“Š *BOT STATISTICS* ã€â”€âž¤
â”‚
â”‚ ðŸ¤– *Bot Name:* ${botName}
â”‚ ðŸ‘¤ *Owner:* ${config.OWNER_NAME}
â”‚ ðŸ‘¥ *Registered:* ${allNumbers.length}
â”‚ ðŸ‘‘ *Admins:* ${admins.length}
â”‚ ðŸ“° *Newsletters:* ${newsletters.length}
â”‚ âš¡ *Active:* ${activeSockets.size}
â”‚ ðŸ¤– *Auto Replies:* ${Object.keys(autoReplyMsgs).length}
â”‚
â”œâ”€ã€Œ ðŸ’» *SYSTEM* ã€
â”‚ â° *Uptime:* ${hours}h ${minutes}m ${seconds}s
â”‚ ðŸ’¾ *Heap:* ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
â”‚ ðŸ“Š *Total:* ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB
â”‚ ðŸ–¥ï¸ *Platform:* ${process.platform}
â”‚
â”œâ”€ã€Œ ðŸ•’ *SERVER TIME* ã€
â”‚ ðŸ“… ${getTimestamp()}
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—`;

                    await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    break;
                }
                
                // ============ ADMIN MANAGEMENT ============
                case 'addadmin':
                {
                    if (!isOwner) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner only command.' }, { quoted: msg });
                        break;
                    }
                    
                    const target = args[0];
                    if (!target) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}addadmin [number]` }, { quoted: msg });
                        break;
                    }
                    
                    await addAdminToFile(target);
                    await socket.sendMessage(sender, { text: `âœ… Admin added: ${target}` }, { quoted: fakevcard });
                    break;
                }
                
                case 'removeadmin':
                {
                    if (!isOwner) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner only command.' }, { quoted: msg });
                        break;
                    }
                    
                    const target = args[0];
                    if (!target) {
                        await socket.sendMessage(sender, { text: `Usage: ${config.PREFIX}removeadmin [number]` }, { quoted: msg });
                        break;
                    }
                    
                    await removeAdminFromFile(target);
                    await socket.sendMessage(sender, { text: `âœ… Admin removed: ${target}` }, { quoted: fakevcard });
                    break;
                }
                
                case 'listadmins':
                {
                    const admins = await loadAdminsFromFile();
                    let text = `â•­â”€ã€Œ ðŸ‘‘ *ADMIN LIST* ã€â”€âž¤\nâ”‚\n`;
                    
                    if (admins.length > 0) {
                        text += `â”‚ ðŸ‘¤ *Owner:* ${config.OWNER_NUMBER}\nâ”‚\n`;
                        admins.forEach((admin, index) => {
                            text += `â”‚ ${index + 1}. ${admin}\n`;
                        });
                    } else {
                        text += `â”‚ No admins added yet\n`;
                    }
                    
                    text += `â”‚\nâ•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—`;
                    
                    await socket.sendMessage(sender, { text }, { quoted: fakevcard });
                    break;
                }
                
                // ============ RESTART ============
                case 'restart':
                {
                    if (!isOwner) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner only command.' }, { quoted: msg });
                        break;
                    }
                    
                    await socket.sendMessage(sender, { text: 'ðŸ”„ *Restarting bot...*\nâ±ï¸ Please wait 5 seconds' }, { quoted: fakevcard });
                    
                    setTimeout(() => {
                        process.exit(0);
                    }, 2000);
                    break;
                }
                
                case 'shutdown':
                {
                    if (!isOwner) {
                        await socket.sendMessage(sender, { text: 'âŒ Owner only command.' }, { quoted: msg });
                        break;
                    }
                    
                    await socket.sendMessage(sender, { text: 'ðŸ”´ *Shutting down bot...*\nðŸ‘‹ Goodbye!' }, { quoted: fakevcard });
                    
                    setTimeout(() => {
                        process.exit(0);
                    }, 1000);
                    break;
                }
                
                // ============ GROUP MANAGEMENT ============
                case 'tagall':
                case 'mentionall':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    try {
                        const groupMetadata = await socket.groupMetadata(from);
                        const participants = groupMetadata.participants;
                        let mentions = [];
                        let text = 'â•­â”€ã€Œ ðŸ‘¥ *MENTION ALL* ã€â”€âž¤\nâ”‚\n';
                        
                        participants.forEach(p => {
                            mentions.push(p.id);
                            text += `â”‚ ðŸ‘¤ @${p.id.split('@')[0]}\n`;
                        });
                        
                        text += `â”‚\nâ•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—\n\n> *Total: ${participants.length} members*`;
                        
                        await socket.sendMessage(from, { 
                            text, 
                            mentions 
                        }, { quoted: msg });
                        
                    } catch (e) {
                        await socket.sendMessage(sender, { text: 'âŒ Failed to tag members' }, { quoted: msg });
                    }
                    break;
                }
                
                case 'hidetag':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    const text = args.join(' ') || ' ';
                    
                    try {
                        const groupMetadata = await socket.groupMetadata(from);
                        const participants = groupMetadata.participants;
                        let mentions = participants.map(p => p.id);
                        
                        await socket.sendMessage(from, { 
                            text, 
                            mentions 
                        }, { quoted: msg });
                        
                    } catch (e) {
                        await socket.sendMessage(sender, { text: 'âŒ Failed to send hidden tag' }, { quoted: msg });
                    }
                    break;
                }
                
                case 'admins':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    try {
                        const groupMetadata = await socket.groupMetadata(from);
                        const admins = groupMetadata.participants.filter(p => p.admin);
                        let text = `â•­â”€ã€Œ ðŸ‘‘ *GROUP ADMINS* ã€â”€âž¤\nâ”‚\nâ”‚ ðŸ“› *${groupMetadata.subject}*\nâ”‚ ðŸ‘¥ *Total Admins:* ${admins.length}\nâ”‚\n`;
                        
                        admins.forEach((admin, index) => {
                            const role = admin.admin === 'superadmin' ? 'ðŸ‘‘ Owner' : 'ðŸ‘® Admin';
                            text += `â”‚ ${index + 1}. @${admin.id.split('@')[0]} (${role})\n`;
                        });
                        
                        text += `â”‚\nâ•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—`;
                        
                        await socket.sendMessage(from, { 
                            text, 
                            mentions: admins.map(a => a.id)
                        }, { quoted: msg });
                        
                    } catch (e) {
                        await socket.sendMessage(sender, { text: 'âŒ Failed to get admins' }, { quoted: msg });
                    }
                    break;
                }
                
                case 'grouplink':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    try {
                        const code = await socket.groupInviteCode(from);
                        const link = `https://chat.whatsapp.com/${code}`;
                        await socket.sendMessage(sender, { 
                            text: `ðŸ”— *Group Link:*\n${link}` 
                        }, { quoted: fakevcard });
                    } catch (e) {
                        await socket.sendMessage(sender, { text: 'âŒ Failed to get group link' }, { quoted: msg });
                    }
                    break;
                }
                
                case 'revoke':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    try {
                        await socket.groupRevokeInvite(from);
                        const code = await socket.groupInviteCode(from);
                        const link = `https://chat.whatsapp.com/${code}`;
                        await socket.sendMessage(sender, { 
                            text: `âœ… *Group link revoked!*\nðŸ”— *New Link:*\n${link}` 
                        }, { quoted: fakevcard });
                    } catch (e) {
                        await socket.sendMessage(sender, { text: 'âŒ Failed to revoke link' }, { quoted: msg });
                    }
                    break;
                }
                
                case 'kick':
                case 'remove':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    if (!msg.message.extendedTextMessage?.contextInfo?.participant) {
                        await socket.sendMessage(sender, { text: 'âŒ Please reply to or tag a user to kick' }, { quoted: msg });
                        return;
                    }
                    
                    try {
                        const userToKick = msg.message.extendedTextMessage.contextInfo.participant;
                        await socket.groupParticipantsUpdate(from, [userToKick], 'remove');
                        await socket.sendMessage(sender, { 
                            text: `âœ… @${userToKick.split('@')[0]} removed from group`,
                            mentions: [userToKick]
                        }, { quoted: fakevcard });
                    } catch (e) {
                        await socket.sendMessage(sender, { text: 'âŒ Failed to remove user' }, { quoted: msg });
                    }
                    break;
                }
                
                case 'promote':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    if (!msg.message.extendedTextMessage?.contextInfo?.participant) {
                        await socket.sendMessage(sender, { text: 'âŒ Please reply to or tag a user to promote' }, { quoted: msg });
                        return;
                    }
                    
                    try {
                        const userToPromote = msg.message.extendedTextMessage.contextInfo.participant;
                        await socket.groupParticipantsUpdate(from, [userToPromote], 'promote');
                        await socket.sendMessage(sender, { 
                            text: `âœ… @${userToPromote.split('@')[0]} promoted to admin`,
                            mentions: [userToPromote]
                        }, { quoted: fakevcard });
                    } catch (e) {
                        await socket.sendMessage(sender, { text: 'âŒ Failed to promote user' }, { quoted: msg });
                    }
                    break;
                }
                
                case 'demote':
                {
                    if (!isGroup) {
                        await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups!' }, { quoted: msg });
                        return;
                    }
                    
                    if (!msg.message.extendedTextMessage?.contextInfo?.participant) {
                        await socket.sendMessage(sender, { text: 'âŒ Please reply to or tag a user to demote' }, { quoted: msg });
                        return;
                    }
                    
                    try {
                        const userToDemote = msg.message.extendedTextMessage.contextInfo.participant;
                        await socket.groupParticipantsUpdate(from, [userToDemote], 'demote');
                        await socket.sendMessage(sender, { 
                            text: `âœ… @${userToDemote.split('@')[0]} demoted from admin`,
                            mentions: [userToDemote]
                        }, { quoted: fakevcard });
                    } catch (e) {
                        await socket.sendMessage(sender, { text: 'âŒ Failed to demote user' }, { quoted: msg });
                    }
                    break;
                }
                
                // ============ DEFAULT ============
                default:
                    // Unknown command
                    break;
            }
        } catch (err) {
            console.error('Command handler error:', err);
            try {
                await socket.sendMessage(sender, { text: 'âŒ An error occurred while processing your command.' }, { quoted: fakevcard });
            } catch(e) {}
        }
    });
}

// ---------------- MESSAGE HANDLERS ----------------
function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        
        if (config.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
            } catch (e) {}
        }
        
        // Auto download view once if enabled
        if (config.AUTO_DOWNLOAD_VV === 'true') {
            await handleViewOnce(socket, msg, msg.key.remoteJid);
        }
    });
}

// ---------------- SESSION SETUP ----------------
async function setupBotSession(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(sessionsDir, `session_${sanitizedNumber}`);
    
    // Check if already active
    if (activeSockets.has(sanitizedNumber)) {
        if (!res.headersSent) res.send({ status: 'already_connected' });
        return;
    }
    
    // Load saved creds if any
    const savedCreds = await loadCredsFromFile(sanitizedNumber);
    if (savedCreds?.creds) {
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(savedCreds.creds, null, 2));
        if (savedCreds.keys) {
            fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(savedCreds.keys, null, 2));
        }
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, { level: 'silent' })
            },
            printQRInTerminal: false,
            logger: { level: 'silent' },
            browser: Browsers.macOS('Safari')
        });
        
        socketCreationTime.set(sanitizedNumber, Date.now());
        
        // Setup handlers
        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket);
        
        // Request pairing code if not registered
        if (!socket.authState.creds.registered) {
            try {
                const code = await socket.requestPairingCode(sanitizedNumber);
                if (!res.headersSent) res.send({ code });
            } catch (error) {
                if (!res.headersSent) res.status(500).send({ error: 'Failed to get pairing code' });
            }
        } else {
            if (!res.headersSent) res.send({ status: 'already_registered' });
        }
        
        // Save creds when updated
        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = fs.readFileSync(path.join(sessionPath, 'creds.json'), 'utf8');
            const credsObj = JSON.parse(fileContent);
            await saveCredsToFile(sanitizedNumber, credsObj, state.keys || null);
        });
        
        // Connection updates
        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            
            if (connection === 'open') {
                try {
                    await delay(2000);
                    
                    // Add to active sockets
                    activeSockets.set(sanitizedNumber, socket);
                    
                    // Add to numbers list
                    await addNumberToFile(sanitizedNumber);
                    
                    // Join group if enabled
                    const groupResult = await joinGroup(socket);
                    
                    // Load user config
                    const userCfg = await loadUserConfigFromFile(sanitizedNumber);
                    const botName = userCfg.botName || config.BOT_NAME;
                    const logo = userCfg.logo || config.LOGO_URL;
                    
                    // Send welcome message
                    const userJid = jidNormalizedUser(socket.user.id);
                    const welcomeText = `â•­â”€ã€Œ âœ… *CONNECTED* ã€â”€âž¤
â”‚
â”‚ ðŸ¤– *Bot:* ${botName}
â”‚ ðŸ“ž *Number:* ${sanitizedNumber}
â”‚ ðŸ“Š *Status:* Connected & Active
â”‚ ðŸ•’ *Time:* ${getTimestamp()}
â”‚
${groupResult.status === 'success' ? 'â”‚ âœ… Joined group successfully!\n' : ''}
${groupResult.status === 'failed' ? 'â”‚ âš ï¸ Could not join group\n' : ''}
â”‚
â”‚ âœ¨ Type ${config.PREFIX}menu to start!
â”‚
â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â—

> *${botName}*`;
                    
                    try {
                        if (String(logo).startsWith('http')) {
                            await socket.sendMessage(userJid, { 
                                image: { url: logo }, 
                                caption: welcomeText 
                            });
                        } else {
                            await socket.sendMessage(userJid, { text: welcomeText });
                        }
                    } catch (e) {
                        await socket.sendMessage(userJid, { text: welcomeText });
                    }
                    
                    console.log(`âœ… Bot connected: ${sanitizedNumber}`);
                } catch (e) {
                    console.error('Connection open error:', e);
                }
            }
            
            if (connection === 'close') {
                // Cleanup on disconnect
                try {
                    if (fs.existsSync(sessionPath)) {
                        fs.removeSync(sessionPath);
                    }
                } catch(e) {}
                
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                console.log(`âŒ Bot disconnected: ${sanitizedNumber}`);
            }
        });
        
        // Auto-restart on logout
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 401) {
                    // Logged out, cleanup
                    await removeSessionFromFile(sanitizedNumber);
                    activeSockets.delete(sanitizedNumber);
                    socketCreationTime.delete(sanitizedNumber);
                }
            }
        });
        
    } catch (error) {
        console.error('Session setup error:', error);
        if (!res.headersSent) res.status(500).send({ error: 'Failed to setup session' });
    }
}

// ---------------- API ROUTES ----------------
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).send({ error: 'Number parameter required' });
    await setupBotSession(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({ 
        botName: config.BOT_NAME, 
        count: activeSockets.size, 
        numbers: Array.from(activeSockets.keys()), 
        timestamp: getTimestamp() 
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({ 
        status: 'active', 
        botName: config.BOT_NAME, 
        message: 'Bot is running', 
        activeSessions: activeSockets.size 
    });
});

// Admin API routes
router.post('/admin/add', async (req, res) => {
    const { jid } = req.body;
    if (!jid) return res.status(400).send({ error: 'jid required' });
    await addAdminToFile(jid);
    res.status(200).send({ status: 'ok', jid });
});

router.post('/admin/remove', async (req, res) => {
    const { jid } = req.body;
    if (!jid) return res.status(400).send({ error: 'jid required' });
    await removeAdminFromFile(jid);
    res.status(200).send({ status: 'ok', jid });
});

router.get('/admin/list', async (req, res) => {
    const list = await loadAdminsFromFile();
    res.status(200).send({ status: 'ok', admins: list });
});

// Newsletter API routes
router.post('/newsletter/add', async (req, res) => {
    const { jid, emojis } = req.body;
    if (!jid) return res.status(400).send({ error: 'jid required' });
    await addNewsletterToFile(jid, emojis || []);
    res.status(200).send({ status: 'ok', jid });
});

router.post('/newsletter/remove', async (req, res) => {
    const { jid } = req.body;
    if (!jid) return res.status(400).send({ error: 'jid required' });
    await removeNewsletterFromFile(jid);
    res.status(200).send({ status: 'ok', jid });
});

router.get('/newsletter/list', async (req, res) => {
    const list = await listNewslettersFromFile();
    res.status(200).send({ status: 'ok', channels: list });
});

// Session management API
router.get('/api/sessions', async (req, res) => {
    const data = readJSON(sessionFiles.sessions);
    const sessions = Object.entries(data).map(([number, info]) => ({ 
        number, 
        updatedAt: info.updatedAt 
    }));
    res.json({ ok: true, sessions });
});

router.get('/api/active', (req, res) => {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
});

router.post('/api/session/delete', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    
    const sanitized = number.replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    
    if (running) {
        try { running.ws?.close(); } catch(e) {}
        activeSockets.delete(sanitized);
        socketCreationTime.delete(sanitized);
    }
    
    await removeSessionFromFile(sanitized);
    
    const sessionPath = path.join(sessionsDir, `session_${sanitized}`);
    if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath);
    
    res.json({ ok: true, message: `Session ${sanitized} removed` });
});

// Auto-reconnect on startup
(async () => {
    try {
        const numbers = await getAllNumbersFromFile();
        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await setupBotSession(number, mockRes);
                await delay(1000);
            }
        }
    } catch(e) {
        console.error('Auto-reconnect error:', e);
    }
})();

module.exports = router;
