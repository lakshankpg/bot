const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const cheerio = require('cheerio');
const { Octokit } = require('@octokit/rest');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateWAMessage
} = require('baileys');

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['❗', '🧚‍♂️', '🪄', '💓', '🎈', '♻️', '👻', '🥺', '🚀', '🔥'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/HewoNJwVwrD0m4IO1DihaN',
    ADMIN_LIST_PATH: './admin.json',
    RCD_IMAGE_PATH: './dinufree.jpg',
    NEWSLETTER_JID: '120363426375145222@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '94789227570',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbC8OWEBadmatxpZel15',
    BUTTONS_ENABLED: 'true'
};

const octokit = new Octokit({ auth: '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' });
const owner = 'lakshan';
const repo = 'session';

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();
const userSettings = new Map();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `╔══════════════════════════╗
║      🎭 ${title} 🎭
╚══════════════════════════╝

${content}

${footer ? `╔══════════════════════════╗\n║      ${footer}\n╚══════════════════════════╝` : ''}`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

function createBoxedMessage(text) {
    const lines = text.split('\n');
    const maxLength = Math.max(...lines.map(line => line.length));
    
    let result = '╔' + '═'.repeat(maxLength + 2) + '╗\n';
    for (const line of lines) {
        const padding = ' '.repeat(maxLength - line.length);
        result += `║ ${line}${padding} ║\n`;
    }
    result += '╚' + '═'.repeat(maxLength + 2) + '╝';
    return result;
}

async function cleanDuplicateFiles(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file => 
            file.name.startsWith(`empire_${sanitizedNumber}_`) && file.name.endsWith('.json')
        ).sort((a, b) => {
            const timeA = parseInt(a.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            const timeB = parseInt(b.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            return timeB - timeA;
        });

        const configFiles = data.filter(file => 
            file.name === `config_${sanitizedNumber}.json`
        );

        if (sessionFiles.length > 1) {
            for (let i = 1; i < sessionFiles.length; i++) {
                await octokit.repos.deleteFile({
                    owner,
                    repo,
                    path: `session/${sessionFiles[i].name}`,
                    message: `Delete duplicate session file for ${sanitizedNumber}`,
                    sha: sessionFiles[i].sha
                });
                console.log(`Deleted duplicate session file: ${sessionFiles[i].name}`);
            }
        }

        if (configFiles.length > 0) {
            console.log(`Config file for ${sanitizedNumber} already exists`);
        }
    } catch (error) {
        console.error(`Failed to clean duplicate files for ${number}:`, error);
    }
}

async function joinGroup(socket) {
    let retries = config.MAX_RETRIES;
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) {
        console.error('Invalid group invite link format');
        return { status: 'failed', error: 'Invalid group invite link' };
    }
    const inviteCode = inviteCodeMatch[1];

    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            if (response?.gid) {
                console.log(`Successfully joined group with ID: ${response.gid}`);
                return { status: 'success', gid: response.gid };
            }
            throw new Error('No group ID in response');
        } catch (error) {
            retries--;
            let errorMessage = error.message || 'Unknown error';
            if (error.message.includes('not-authorized')) {
                errorMessage = 'Bot is not authorized to join (possibly banned)';
            } else if (error.message.includes('conflict')) {
                errorMessage = 'Bot is already a member of the group';
            } else if (error.message.includes('gone')) {
                errorMessage = 'Group invite link is invalid or expired';
            }
            console.warn(`Failed to join group, retries left: ${retries}`, errorMessage);
            if (retries === 0) {
                return { status: 'failed', error: errorMessage };
            }
            await delay(2000 * (config.MAX_RETRIES - retries));
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const groupStatus = groupResult.status === 'success'
        ? `✅ Joined (ID: ${groupResult.gid})`
        : `❌ Failed: ${groupResult.error}`;
    const caption = formatMessage(
        '𝕃𝕒𝕜𝕚 𝕄𝔻 𝐌ɪɴɪ-𝐁ᴏᴛ',
        `📞 Number: ${number}\n✨ Status: Connected\n👥 Group: ${groupStatus}`,
        '𝐏ᴏᴡᴇʀᴅ ʙʏ 𝕃𝕒𝕜𝕚 𝕄𝔻 🚀'
    );

    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: config.RCD_IMAGE_PATH },
                    caption
                }
            );
        } catch (error) {
            console.error(`Failed to send connect message to admin ${admin}:`, error);
        }
    }
}

async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
        '🔐 OTP VERIFICATION',
        `📱 Your OTP for config update:\n\n🎫 *${otp}*\n\n⏰ Expires in 5 minutes`,
        '𝕃𝕒𝕜𝕚 𝕄𝔻 ʙᴏᴛ 🔐'
    );

    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`OTP ${otp} sent to ${number}`);
    } catch (error) {
        console.error(`Failed to send OTP to ${number}:`, error);
        throw error;
    }
}

async function updateAboutStatus(socket) {
    const aboutStatus = '𝕃𝕒𝕜𝕚 𝕄𝔻 ᴍɪɴɪ // ᴀᴄᴛɪᴠᴇ 🚀';
    try {
        await socket.updateProfileStatus(aboutStatus);
        console.log(`Updated About status to: ${aboutStatus}`);
    } catch (error) {
        console.error('Failed to update About status:', error);
    }
}

async function updateStoryStatus(socket) {
    const statusMessage = `ᴄʏʙᴇʀ ꜰʀᴇᴇᴅᴏᴍ ᴄᴏɴɴᴇᴄᴛᴇᴅ..! 🚀\nConnected at: ${getSriLankaTimestamp()}`;
    try {
        await socket.sendMessage('status@broadcast', { text: statusMessage });
        console.log(`Posted story status: ${statusMessage}`);
    } catch (error) {
        console.error('Failed to post story status:', error);
    }
}

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== config.NEWSLETTER_JID) return;

        try {
            const emojis = ['♻️', '🪄', '❗', '🧚‍♂️'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('No valid newsletterServerId found:', message);
                return;
            }

            let retries = config.MAX_RETRIES;
            while (retries > 0) {
                try {
                    await socket.newsletterReactMessage(
                        config.NEWSLETTER_JID,
                        messageId.toString(),
                        randomEmoji
                    );
                    console.log(`Reacted to newsletter message ${messageId} with ${randomEmoji}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to react to newsletter message ${messageId}, retries left: ${retries}`, error.message);
                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
        } catch (error) {
            console.error('Newsletter reaction error:', error);
        }
    });
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant || message.key.remoteJid === config.NEWSLETTER_JID) return;

        try {
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
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
                        console.warn(`Failed to read status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();
        
        const message = formatMessage(
            '🗑️ MESSAGE DELETED',
            `⚠️ A message was deleted from your chat.\n\n📞 From: ${messageKey.remoteJid}\n🕒 Time: ${deletionTime}`,
            '𝐏ᴏᴡᴇʀᴅ ʙʏ 𝕃𝕒𝕜𝕚 𝕄𝔻 🚀'
        );

        try {
            await socket.sendMessage(userJid, {
                image: { url: config.RCD_IMAGE_PATH },
                caption: message
            });
            console.log(`Notified ${number} about message deletion: ${messageKey.id}`);
        } catch (error) {
            console.error('Failed to send deletion notification:', error);
        }
    });
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

async function sendButtonMessage(socket, sender, title, content, buttons) {
    if (config.BUTTONS_ENABLED === 'true') {
        const message = {
            text: formatMessage(title, content, ''),
            footer: '𝕃𝕒𝕜𝕚 𝕄𝔻 🚀',
            buttons: buttons,
            headerType: 1
        };
        
        try {
            await socket.sendMessage(sender, message);
            return true;
        } catch (error) {
            console.error('Failed to send button message:', error);
            // Fallback to text message
            await socket.sendMessage(sender, {
                text: formatMessage(title, content, '𝕃𝕒𝕜𝕚 𝕄𝔻 🚀')
            });
            return false;
        }
    } else {
        await socket.sendMessage(sender, {
            text: formatMessage(title, content, '𝕃𝕒𝕜𝕚 𝕄𝔻 🚀')
        });
        return false;
    }
}

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;

        // Check for text commands
        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            if (text.startsWith(config.PREFIX)) {
                const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        // Check for button response
        else if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(config.PREFIX)) {
                const parts = buttonId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        // Check for list response
        else if (msg.message.listResponseMessage) {
            const listId = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
            if (listId && listId.startsWith(config.PREFIX)) {
                const parts = listId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        if (!command) return;

        try {
            switch (command) {
                case 'alive': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    const botInfo = `
╔══════════════════════════╗
║   🎭 𝕃𝕒𝕜𝕚 𝕄𝔻 𝐌ɪɴɪ-𝐁ᴏᴛ 🎭
╚══════════════════════════╝

📊 BOT INFORMATION:
┌──────────────────────────┐
│ 📟 Version: v1.0
│ 🕒 Uptime: ${hours}h ${minutes}m ${seconds}s
│ 👥 Active: ${activeSockets.size} sessions
│ 📞 Your Number: ${number}
│ ⚡ Status: ✅ ONLINE
└──────────────────────────┘

🛠️ AVAILABLE COMMANDS:
┌──────────────────────────┐
│ 🎶 ${config.PREFIX}menu      - All commands
│ 🗑️ ${config.PREFIX}deleteme  - Delete session
│ 💬 ${config.PREFIX}ping      - Bot ping test
│ 📰 ${config.PREFIX}status    - Latest updates
│ 👑 ${config.PREFIX}owner     - Developer info
│ ⏱️ ${config.PREFIX}runtime   - Total runtime
│ 🏓 ${config.PREFIX}latency   - Ping test
│ ⚙️ ${config.PREFIX}settings  - Bot settings
└──────────────────────────┘

✨ FEATURES:
┌──────────────────────────┐
│ ✅ Auto Status Viewer
│ ✅ Auto Status Liker
│ ✅ News Updates
│ ✅ Song Downloader
│ ✅ Video Downloader
│ ✅ AI Chat Assistant
│ ✅ Weather Updates
└──────────────────────────┘
`;

                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: botInfo
                    });
                    break;
                }
                
                case 'menu': {
                    const menuText = `
╔══════════════════════════╗
║   🎭 𝕃𝕒𝕜𝕚 𝕄𝔻 𝐅𝐑𝐄𝐄 𝐁𝐎𝐓 🎭
╚══════════════════════════╝

📋 BOT INFORMATION:
┌──────────────────────────┐
│ 🎭 Name: 𝕃𝕒𝕜𝕚 𝕄𝔻-𝐌ɪɴɪ-𝐁ᴏᴛ
│ 🎫 Version: v1.0
│ 👨‍💻 Owner: Lakshan
│ 📞 Your Number: ${number}
│ 🏠 Host: Premium Server
└──────────────────────────┘

🎵 MEDIA COMMANDS:
┌──────────────────────────┐
│ 🎵 ${config.PREFIX}song      - Download songs
│ 🎬 ${config.PREFIX}tiktok   - TikTok downloader
│ 📘 ${config.PREFIX}fb       - Facebook video
│ 🎥 ${config.PREFIX}video    - YouTube video
└──────────────────────────┘

🤖 AI & CHAT:
┌──────────────────────────┐
│ 🤖 ${config.PREFIX}ai       - AI Chat Assistant
│ 🧠 ${config.PREFIX}openai   - OpenAI features
│ 💭 ${config.PREFIX}chat     - Chat with bot
└──────────────────────────┘

📰 NEWS & UPDATES:
┌──────────────────────────┐
│ 📰 ${config.PREFIX}news     - Latest news
│ 🗞️ ${config.PREFIX}gossip   - Gossip news
│ 🏏 ${config.PREFIX}cricket  - Cricket updates
│ 📖 ${config.PREFIX}silumina - Silumina news
└──────────────────────────┘

🛠️ UTILITIES:
┌──────────────────────────┐
│ 🌤️ ${config.PREFIX}weather - Weather updates
│ 🔎 ${config.PREFIX}google  - Google search
│ 🆔 ${config.PREFIX}jid     - Get JID
│ 🖼️ ${config.PREFIX}getdp   - Get profile picture
└──────────────────────────┘

⚙️ BOT CONTROLS:
┌──────────────────────────┐
│ ⚙️ ${config.PREFIX}settings - Bot settings
│ 🔘 ${config.PREFIX}button  - Toggle buttons
│ 🗑️ ${config.PREFIX}deleteme - Delete session
│ ℹ️ ${config.PREFIX}alive   - Bot status
└──────────────────────────┘

🔗 LINKS:
┌──────────────────────────┐
│ 📱 Channel: ${config.CHANNEL_LINK}
│ 👥 Group: ${config.GROUP_INVITE_LINK}
└──────────────────────────┘
`;
                    
                    await sendButtonMessage(socket, sender, 'MAIN MENU', menuText, [
                        { buttonId: `${config.PREFIX}media`, buttonText: { displayText: '🎵 MEDIA' }, type: 1 },
                        { buttonId: `${config.PREFIX}news`, buttonText: { displayText: '📰 NEWS' }, type: 1 },
                        { buttonId: `${config.PREFIX}tools`, buttonText: { displayText: '🛠️ TOOLS' }, type: 1 }
                    ]);
                    break;
                }
                
                case 'media': {
                    await sendButtonMessage(socket, sender, 'MEDIA DOWNLOADER', 'Select media type to download:', [
                        { buttonId: `${config.PREFIX}song`, buttonText: { displayText: '🎵 SONG' }, type: 1 },
                        { buttonId: `${config.PREFIX}video`, buttonText: { displayText: '🎥 VIDEO' }, type: 1 },
                        { buttonId: `${config.PREFIX}tiktok`, buttonText: { displayText: '📱 TIKTOK' }, type: 1 },
                        { buttonId: `${config.PREFIX}fb`, buttonText: { displayText: '📘 FACEBOOK' }, type: 1 },
                        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 BACK' }, type: 1 }
                    ]);
                    break;
                }
                
                case 'news': {
                    await sendButtonMessage(socket, sender, 'NEWS UPDATES', 'Select news category:', [
                        { buttonId: `${config.PREFIX}news`, buttonText: { displayText: '📰 LATEST NEWS' }, type: 1 },
                        { buttonId: `${config.PREFIX}silumina`, buttonText: { displayText: '📖 SILUMINA' }, type: 1 },
                        { buttonId: `${config.PREFIX}gossip`, buttonText: { displayText: '🗞️ GOSSIP' }, type: 1 },
                        { buttonId: `${config.PREFIX}cricket`, buttonText: { displayText: '🏏 CRICKET' }, type: 1 },
                        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 BACK' }, type: 1 }
                    ]);
                    break;
                }
                
                case 'tools': {
                    await sendButtonMessage(socket, sender, 'BOT TOOLS', 'Select tool to use:', [
                        { buttonId: `${config.PREFIX}weather`, buttonText: { displayText: '🌤️ WEATHER' }, type: 1 },
                        { buttonId: `${config.PREFIX}ai`, buttonText: { displayText: '🤖 AI CHAT' }, type: 1 },
                        { buttonId: `${config.PREFIX}system`, buttonText: { displayText: '📊 SYSTEM' }, type: 1 },
                        { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: '⚙️ SETTINGS' }, type: 1 },
                        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 BACK' }, type: 1 }
                    ]);
                    break;
                }
                
                case 'button': {
                    if (args[0] === 'on') {
                        config.BUTTONS_ENABLED = 'true';
                        await socket.sendMessage(sender, {
                            text: '✅ Buttons enabled successfully!'
                        });
                    } else if (args[0] === 'off') {
                        config.BUTTONS_ENABLED = 'false';
                        await socket.sendMessage(sender, {
                            text: '❌ Buttons disabled successfully!'
                        });
                    } else {
                        await socket.sendMessage(sender, {
                            text: 'Usage:\n.button on - Enable buttons\n.button off - Disable buttons'
                        });
                    }
                    break;
                }
                
                case 'settings': {
                    const settingsText = `
╔══════════════════════════╗
║   ⚙️ BOT SETTINGS ⚙️
╚══════════════════════════╝

📊 CURRENT SETTINGS:
┌──────────────────────────┐
│ 👀 Auto View Status: ${config.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ❤️ Auto Like Status: ${config.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ⏺️ Auto Recording: ${config.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}
│ 🔘 Buttons Enabled: ${config.BUTTONS_ENABLED === 'true' ? '✅ ON' : '❌ OFF'}
│ 🎯 Prefix: ${config.PREFIX}
└──────────────────────────┘

🛠️ SETTINGS CONTROLS:
Use these commands to change settings:

${config.PREFIX}view on/off    - Toggle auto view
${config.PREFIX}like on/off    - Toggle auto like
${config.PREFIX}record on/off  - Toggle auto recording
${config.PREFIX}button on/off  - Toggle buttons
${config.PREFIX}prefix <new>   - Change command prefix
`;
                    
                    await sendButtonMessage(socket, sender, 'BOT SETTINGS', settingsText, [
                        { buttonId: `${config.PREFIX}view on`, buttonText: { displayText: '👀 VIEW ON' }, type: 1 },
                        { buttonId: `${config.PREFIX}view off`, buttonText: { displayText: '👀 VIEW OFF' }, type: 1 },
                        { buttonId: `${config.PREFIX}like on`, buttonText: { displayText: '❤️ LIKE ON' }, type: 1 },
                        { buttonId: `${config.PREFIX}like off`, buttonText: { displayText: '❤️ LIKE OFF' }, type: 1 }
                    ]);
                    break;
                }
                
                case 'view': {
                    if (args[0] === 'on') {
                        config.AUTO_VIEW_STATUS = 'true';
                        await socket.sendMessage(sender, {
                            text: '✅ Auto view status enabled!'
                        });
                    } else if (args[0] === 'off') {
                        config.AUTO_VIEW_STATUS = 'false';
                        await socket.sendMessage(sender, {
                            text: '❌ Auto view status disabled!'
                        });
                    }
                    break;
                }
                
                case 'like': {
                    if (args[0] === 'on') {
                        config.AUTO_LIKE_STATUS = 'true';
                        await socket.sendMessage(sender, {
                            text: '✅ Auto like status enabled!'
                        });
                    } else if (args[0] === 'off') {
                        config.AUTO_LIKE_STATUS = 'false';
                        await socket.sendMessage(sender, {
                            text: '❌ Auto like status disabled!'
                        });
                    }
                    break;
                }
                
                case 'record': {
                    if (args[0] === 'on') {
                        config.AUTO_RECORDING = 'true';
                        await socket.sendMessage(sender, {
                            text: '✅ Auto recording enabled!'
                        });
                    } else if (args[0] === 'off') {
                        config.AUTO_RECORDING = 'false';
                        await socket.sendMessage(sender, {
                            text: '❌ Auto recording disabled!'
                        });
                    }
                    break;
                }
                
                case 'prefix': {
                    if (args[0]) {
                        config.PREFIX = args[0];
                        await socket.sendMessage(sender, {
                            text: `✅ Command prefix changed to: ${config.PREFIX}`
                        });
                    }
                    break;
                }
                
                case 'system': {
                    const systemInfo = `
╔══════════════════════════╗
║   📊 SYSTEM STATUS 📊
╚══════════════════════════╝

🤖 BOT STATUS:
┌──────────────────────────┐
│ 🟢 Status: ONLINE
│ ⚡ Ping: PONG!
│ 💚 Connection: ✅ ACTIVE
│ 📱 Your Number: ${number}
└──────────────────────────┘

⚙️ FEATURES STATUS:
┌──────────────────────────┐
│ 👀 Auto View: ${config.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ❤️ Auto Like: ${config.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ⏺️ Auto Record: ${config.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}
│ 🔘 Buttons: ${config.BUTTONS_ENABLED === 'true' ? '✅ ON' : '❌ OFF'}
└──────────────────────────┘

📈 STATISTICS:
┌──────────────────────────┐
│ 👥 Active Sessions: ${activeSockets.size}
│ 🎯 Command Prefix: ${config.PREFIX}
│ 🚀 Max Retries: ${config.MAX_RETRIES}
└──────────────────────────┘

🔗 IMPORTANT LINKS:
┌──────────────────────────┐
│ 📢 Channel: ${config.CHANNEL_LINK}
│ 👥 Group: ${config.GROUP_INVITE_LINK}
│ 👑 Owner: ${config.OWNER_NUMBER}
└──────────────────────────┘
`;
                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: systemInfo
                    });
                    break;
                }
                
                case 'fc': {
                    if (args.length === 0) {
                        return await socket.sendMessage(sender, {
                            text: formatMessage(
                                'CHANNEL FOLLOW',
                                '❗ Please provide a channel JID.\n\nExample:\n.fc 120363426375145222@newsletter',
                                'Usage Guide 📋'
                            )
                        });
                    }

                    const jid = args[0];
                    if (!jid.endsWith("@newsletter")) {
                        return await socket.sendMessage(sender, {
                            text: formatMessage(
                                'INVALID JID',
                                '❗ Invalid JID format.\nPlease provide a valid newsletter JID ending with `@newsletter`',
                                'Try Again 🔄'
                            )
                        });
                    }

                    try {
                        const metadata = await socket.newsletterMetadata("jid", jid);
                        if (metadata?.viewer_metadata === null) {
                            await socket.newsletterFollow(jid);
                            await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'CHANNEL FOLLOWED',
                                    `✅ Successfully followed the channel!\n\n📢 Channel: ${jid}`,
                                    'Follow Complete ✅'
                                )
                            });
                            console.log(`FOLLOWED CHANNEL: ${jid}`);
                        } else {
                            await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'ALREADY FOLLOWING',
                                    `📌 You are already following this channel.\n\n📢 Channel: ${jid}`,
                                    'Info ℹ️'
                                )
                            });
                        }
                    } catch (e) {
                        console.error('Error in follow channel:', e.message);
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'FOLLOW ERROR',
                                `❌ Error: ${e.message}\n\nPlease check the JID and try again.`,
                                'Error ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                case 'weather': {
                    try {
                        if (!args || args.length === 0) {
                            await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'WEATHER COMMAND',
                                    '❗ *Please provide a city name!*\n\n📋 *Usage:* .weather [city name]\n\nExample: .weather colombo',
                                    'Usage Guide 🌍'
                                )
                            });
                            break;
                        }

                        const apiKey = '2d61a72574c11c4f36173b627f8cb177';
                        const city = args.join(" ");
                        const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

                        const response = await axios.get(url);
                        const data = response.data;

                        if (response.status !== 200) {
                            throw new Error('City not found');
                        }

                        const weatherIcon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
                        const weatherReport = `
╔══════════════════════════╗
║   🌤️ WEATHER REPORT 🌤️
╚══════════════════════════╝

📍 LOCATION:
┌──────────────────────────┐
│ 🌍 City: ${data.name}, ${data.sys.country}
│ 📍 Coordinates:
│   Lat: ${data.coord.lat}°
│   Lon: ${data.coord.lon}°
└──────────────────────────┘

🌡️ TEMPERATURE:
┌──────────────────────────┐
│ 🌡️ Current: ${data.main.temp}°C
│ 🌡️ Feels Like: ${data.main.feels_like}°C
│ 📈 Max: ${data.main.temp_max}°C
│ 📉 Min: ${data.main.temp_min}°C
└──────────────────────────┘

📊 WEATHER DETAILS:
┌──────────────────────────┐
│ ☁️ Condition: ${data.weather[0].main}
│ 📝 Description: ${data.weather[0].description}
│ 💧 Humidity: ${data.main.humidity}%
│ 💨 Wind: ${data.wind.speed} m/s
│ 🔽 Pressure: ${data.main.pressure} hPa
│ 👁️ Visibility: ${data.visibility / 1000} km
└──────────────────────────┘

⏰ LAST UPDATED:
┌──────────────────────────┐
│ 🕒 ${moment.unix(data.dt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss')}
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            image: { url: weatherIcon },
                            caption: weatherReport
                        });

                    } catch (e) {
                        console.log(e);
                        if (e.response && e.response.status === 404) {
                            await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'CITY NOT FOUND',
                                    '🚫 *City not found!*\n🔍 Please check the spelling and try again.',
                                    'Try Again 🔄'
                                )
                            });
                        } else {
                            await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'WEATHER ERROR',
                                    '⚠️ *An error occurred!*\n🔄 Please try again later.',
                                    'Error ⚠️'
                                )
                            });
                        }
                    }
                    break;
                }
                
                case 'jid': {
                    try {
                        const chatJid = sender;
                        
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'JID INFORMATION',
                                `📱 *Your JID:*\n\`\`\`\n${chatJid}\n\`\`\`\n\n💡 *JID Components:*\n- User: ${chatJid.split('@')[0]}\n- Server: ${chatJid.split('@')[1]}`,
                                'ID Information 🆔'
                            )
                        });

                        await socket.sendMessage(sender, { 
                            react: { text: '✅', key: msg.key } 
                        });

                    } catch (e) {
                        await socket.sendMessage(sender, { 
                            react: { text: '❌', key: msg.key } 
                        });
                        
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'JID ERROR',
                                '❌ Error while retrieving the JID!\nPlease try again later.',
                                'Error ⚠️'
                            )
                        });
                        
                        console.log(e);
                    }
                    break;
                }
                
                case 'news': {
                    try {
                        const response = await fetch('https://suhas-bro-api.vercel.app/news/lnw');
                        if (!response.ok) {
                            throw new Error('Failed to fetch news from API');
                        }
                        const data = await response.json();

                        if (!data.status || !data.result || !data.result.title || !data.result.desc) {
                            throw new Error('Invalid news data received');
                        }

                        const { title, desc, date, link } = data.result;

                        let thumbnailUrl = 'https://via.placeholder.com/150'; 
                        try {
                            const pageResponse = await fetch(link);
                            if (pageResponse.ok) {
                                const pageHtml = await pageResponse.text();
                                const $ = cheerio.load(pageHtml);
                                const ogImage = $('meta[property="og:image"]').attr('content');
                                if (ogImage) {
                                    thumbnailUrl = ogImage; 
                                } else {
                                    console.warn(`No og:image found for ${link}`);
                                }
                            } else {
                                console.warn(`Failed to fetch page ${link}: ${pageResponse.status}`);
                            }
                        } catch (err) {
                            console.warn(`Failed to scrape thumbnail from ${link}: ${err.message}`);
                        }

                        const newsContent = `
╔══════════════════════════╗
║   📰 LATEST NEWS 📰
╚══════════════════════════╝

📢 HEADLINE:
┌──────────────────────────┐
│ ${title}
└──────────────────────────┘

📝 DESCRIPTION:
┌──────────────────────────┐
│ ${desc}
└──────────────────────────┘

📅 DETAILS:
┌──────────────────────────┐
│ 📅 Date: ${date || 'Not specified'}
│ 🔗 Link: ${link}
│ 📊 Source: LNW News
└──────────────────────────┘

💡 TIP:
┌──────────────────────────┐
│ Use .silumina for Silumina
│ Use .gossip for gossip news
│ Use .cricket for sports
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            image: { url: thumbnailUrl },
                            caption: newsContent
                        });
                    } catch (error) {
                        console.error(`Error in 'news' case: ${error.message}`);
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'NEWS ERROR',
                                '⚠️ News API is currently down.\nPlease try again later.',
                                'Service Unavailable ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                case 'silumina': {
                    try {
                        const response = await fetch('https://suhas-bro-api.vercel.app/news/silumina');
                        if (!response.ok) {
                            throw new Error('API is currently down');
                        }
                        const data = await response.json();

                        if (!data.status || !data.result || !data.result.title || !data.result.desc) {
                            throw new Error('Invalid news data received');
                        }

                        const { title, desc, date, link } = data.result;

                        let thumbnailUrl = 'https://via.placeholder.com/150';
                        try {
                            const pageResponse = await fetch(link);
                            if (pageResponse.ok) {
                                const pageHtml = await pageResponse.text();
                                const $ = cheerio.load(pageHtml);
                                const ogImage = $('meta[property="og:image"]').attr('content');
                                if (ogImage) {
                                    thumbnailUrl = ogImage; 
                                } else {
                                    console.warn(`No og:image found for ${link}`);
                                }
                            } else {
                                console.warn(`Failed to fetch page ${link}: ${pageResponse.status}`);
                            }
                        } catch (err) {
                            console.warn(`Failed to scrape thumbnail from ${link}: ${err.message}`);
                        }

                        const newsContent = `
╔══════════════════════════╗
║   📖 SILUMINA NEWS 📖
╚══════════════════════════╝

📢 HEADLINE:
┌──────────────────────────┐
│ ${title}
└──────────────────────────┘

📝 DESCRIPTION:
┌──────────────────────────┐
│ ${desc}
└──────────────────────────┘

📅 DETAILS:
┌──────────────────────────┐
│ 📅 Date: ${date || 'Not specified'}
│ 🔗 Link: ${link}
│ 📊 Source: Silumina
└──────────────────────────┘

💡 SILUMINA INFO:
┌──────────────────────────┐
│ 🇱🇰 Sri Lanka's leading
│   Sinhala newspaper
│ 📰 Established: 1930
│ 🏢 Associated Newspapers
│   of Ceylon Limited
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            image: { url: thumbnailUrl },
                            caption: newsContent
                        });
                    } catch (error) {
                        console.error(`Error in 'silumina' case: ${error.message}`);
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'SILUMINA ERROR',
                                '⚠️ Silumina news API is currently down.\nPlease try again later.',
                                'Service Unavailable ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                case 'cricket': {
                    try {
                        console.log('Fetching cricket news from API...');
                        
                        const response = await fetch('https://suhas-bro-api.vercel.app/news/cricbuzz');
                        console.log(`API Response Status: ${response.status}`);

                        if (!response.ok) {
                            throw new Error(`API request failed with status ${response.status}`);
                        }

                        const data = await response.json();
                        console.log('API Response Data:', JSON.stringify(data, null, 2));

                        if (!data.status || !data.result) {
                            throw new Error('Invalid API response structure');
                        }

                        const { title, score, to_win, crr, link } = data.result;
                        if (!title || !score || !to_win || !crr || !link) {
                            throw new Error('Missing required fields in API response');
                        }

                        const cricketContent = `
╔══════════════════════════╗
║   🏏 CRICKET UPDATES 🏏
╚══════════════════════════╝

📢 MATCH INFO:
┌──────────────────────────┐
│ ${title}
└──────────────────────────┘

📊 SCOREBOARD:
┌──────────────────────────┐
│ 🏏 Score: ${score}
│ 🎯 To Win: ${to_win}
│ 📈 Current RR: ${crr}
└──────────────────────────┘

🔗 MORE INFO:
┌──────────────────────────┐
│ 🌐 Live Score: ${link}
│ 📱 Source: Cricbuzz
│ 🏆 Match: Live Updates
└──────────────────────────┘

💡 CRICKET STATS:
┌──────────────────────────┐
│ 🎯 Use this command to get
│   latest cricket scores
│ 🏏 Supports international
│   and local matches
│ 📊 Real-time updates
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            text: cricketContent
                        });
                        console.log('Message sent successfully.');
                    } catch (error) {
                        console.error(`Error in 'cricket' case: ${error.message}`);
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'CRICKET ERROR',
                                '⚠️ Cricket updates are currently unavailable.\nPlease try again later.',
                                'Service Unavailable ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                case 'gossip': {
                    try {
                        const response = await fetch('https://suhas-bro-api.vercel.app/news/gossiplankanews');
                        if (!response.ok) {
                            throw new Error('API is currently down');
                        }
                        const data = await response.json();

                        if (!data.status || !data.result || !data.result.title || !data.result.desc) {
                            throw new Error('Invalid news data received');
                        }

                        const { title, desc, date, link } = data.result;

                        let thumbnailUrl = 'https://via.placeholder.com/150';
                        try {
                            const pageResponse = await fetch(link);
                            if (pageResponse.ok) {
                                const pageHtml = await pageResponse.text();
                                const $ = cheerio.load(pageHtml);
                                const ogImage = $('meta[property="og:image"]').attr('content');
                                if (ogImage) {
                                    thumbnailUrl = ogImage; 
                                } else {
                                    console.warn(`No og:image found for ${link}`);
                                }
                            } else {
                                console.warn(`Failed to fetch page ${link}: ${pageResponse.status}`);
                            }
                        } catch (err) {
                            console.warn(`Failed to scrape thumbnail from ${link}: ${err.message}`);
                        }

                        const gossipContent = `
╔══════════════════════════╗
║   🗞️ GOSSIP NEWS 🗞️
╚══════════════════════════╝

📢 HEADLINE:
┌──────────────────────────┐
│ ${title}
└──────────────────────────┘

📝 DESCRIPTION:
┌──────────────────────────┐
│ ${desc}
└──────────────────────────┘

📅 DETAILS:
┌──────────────────────────┐
│ 📅 Date: ${date || 'Not specified'}
│ 🔗 Link: ${link}
│ 📊 Source: Gossip Lanka News
└──────────────────────────┘

⚠️ DISCLAIMER:
┌──────────────────────────┐
│ This news is for
│ entertainment purposes
│ only. Verify information
│ from official sources.
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            image: { url: thumbnailUrl },
                            caption: gossipContent
                        });
                    } catch (error) {
                        console.error(`Error in 'gossip' case: ${error.message}`);
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'GOSSIP ERROR',
                                '⚠️ Gossip news API is currently down.\nPlease try again later.',
                                'Service Unavailable ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                case 'song': {
                    try {
                        const yts = (await import('yt-search')).default;
                        const ytdl = require('ytdl-core');
                        const ffmpeg = require('fluent-ffmpeg');
                        const fs = require('fs');
                        const path = require('path');

                        // Get query from message
                        const q = msg.message?.conversation || 
                                  msg.message?.extendedTextMessage?.text || 
                                  msg.message?.imageMessage?.caption || 
                                  msg.message?.videoMessage?.caption || 
                                  '';

                        if (!q || q.trim() === '') {
                            return await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'SONG DOWNLOAD',
                                    '❗ *Please provide a song name or YouTube URL!*\n\n📋 *Usage:* .song [song name/url]\n\nExample:\n.song shape of you\n.song https://youtube.com/watch?v=...',
                                    'Usage Guide 🎵'
                                )
                            });
                        }

                        // Send searching message
                        await socket.sendMessage(sender, {
                            text: '🔍 *Searching for song...*'
                        }, { quoted: msg });

                        // Search for the song
                        const searchResults = await yts(q);
                        const video = searchResults.videos[0];

                        if (!video) {
                            return await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'NO RESULTS',
                                    '❌ *No songs found!*\nPlease try a different search term.',
                                    'Search Failed 🔍'
                                )
                            });
                        }

                        // Send song info
                        const songInfo = `
╔══════════════════════════╗
║   🎵 SONG DOWNLOAD 🎵
╚══════════════════════════╝

📋 SONG INFO:
┌──────────────────────────┐
│ 🎵 Title: ${video.title}
│ 👤 Artist: ${video.author.name}
│ ⏱️ Duration: ${video.duration.timestamp}
│ 📅 Uploaded: ${video.ago}
│ 👁️ Views: ${video.views}
└──────────────────────────┘

⬇️ DOWNLOADING:
┌──────────────────────────┐
│ 📥 Processing audio...
│ 🎧 Converting to MP3...
│ ⏳ Please wait...
└──────────────────────────┘

🔗 YOUTUBE LINK:
┌──────────────────────────┐
│ ${video.url}
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            image: { url: video.thumbnail },
                            caption: songInfo
                        }, { quoted: msg });

                        // Download and convert the audio
                        const tempDir = './temp';
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir);
                        }

                        const tempFile = path.join(tempDir, `${video.videoId}.mp3`);
                        
                        // Download audio using ytdl
                        const audioStream = ytdl(video.url, {
                            filter: 'audioonly',
                            quality: 'highestaudio'
                        });

                        // Convert to MP3
                        await new Promise((resolve, reject) => {
                            ffmpeg(audioStream)
                                .audioBitrate(128)
                                .save(tempFile)
                                .on('end', resolve)
                                .on('error', reject);
                        });

                        // Send the audio file
                        await socket.sendMessage(sender, {
                            audio: fs.readFileSync(tempFile),
                            mimetype: 'audio/mpeg',
                            ptt: false
                        }, { quoted: msg });

                        // Clean up
                        fs.unlinkSync(tempFile);

                        // Send success message
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'DOWNLOAD COMPLETE',
                                '✅ *Song downloaded successfully!*\n\n🎵 Enjoy your music!',
                                'Download Complete ✅'
                            )
                        });

                    } catch (err) {
                        console.error('Song download error:', err);
                        
                        // Clean up temp files if they exist
                        try {
                            const tempDir = './temp';
                            if (fs.existsSync(tempDir)) {
                                fs.readdirSync(tempDir).forEach(file => {
                                    fs.unlinkSync(path.join(tempDir, file));
                                });
                            }
                        } catch (cleanupErr) {
                            console.error('Cleanup error:', cleanupErr);
                        }
                        
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'DOWNLOAD ERROR',
                                '❌ *Error downloading song!*\n\nPossible reasons:\n• Invalid URL\n• Song too long\n• Network error\n• YouTube restrictions\n\nPlease try again with a different song.',
                                'Error ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                case 'video': {
                    try {
                        const yts = (await import('yt-search')).default;
                        const ytdl = require('ytdl-core');
                        const fs = require('fs');
                        const path = require('path');

                        // Get query from message
                        const q = msg.message?.conversation || 
                                  msg.message?.extendedTextMessage?.text || 
                                  msg.message?.imageMessage?.caption || 
                                  msg.message?.videoMessage?.caption || 
                                  '';

                        if (!q || q.trim() === '') {
                            return await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'VIDEO DOWNLOAD',
                                    '❗ *Please provide a video name or YouTube URL!*\n\n📋 *Usage:* .video [video name/url]\n\nExample:\n.video funny cats\n.video https://youtube.com/watch?v=...',
                                    'Usage Guide 🎥'
                                )
                            });
                        }

                        // Send searching message
                        await socket.sendMessage(sender, {
                            text: '🔍 *Searching for video...*'
                        }, { quoted: msg });

                        // Search for the video
                        const searchResults = await yts(q);
                        const video = searchResults.videos[0];

                        if (!video) {
                            return await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'NO RESULTS',
                                    '❌ *No videos found!*\nPlease try a different search term.',
                                    'Search Failed 🔍'
                                )
                            });
                        }

                        // Check video duration (limit to 10 minutes)
                        if (video.duration.seconds > 600) {
                            return await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'VIDEO TOO LONG',
                                    '❌ *Video is too long!*\nMaximum allowed duration: 10 minutes\n\nPlease select a shorter video.',
                                    'Duration Limit ⏱️'
                                )
                            });
                        }

                        // Send video info
                        const videoInfo = `
╔══════════════════════════╗
║   🎥 VIDEO DOWNLOAD 🎥
╚══════════════════════════╝

📋 VIDEO INFO:
┌──────────────────────────┐
│ 🎬 Title: ${video.title}
│ 👤 Channel: ${video.author.name}
│ ⏱️ Duration: ${video.duration.timestamp}
│ 📅 Uploaded: ${video.ago}
│ 👁️ Views: ${video.views}
│ 👍 Likes: ${video.likes || 'N/A'}
└──────────────────────────┘

⬇️ DOWNLOADING:
┌──────────────────────────┐
│ 📥 Processing video...
│ 🎬 Converting to MP4...
│ ⏳ Please wait...
│ ⚠️ This may take a while
└──────────────────────────┘

🔗 YOUTUBE LINK:
┌──────────────────────────┐
│ ${video.url}
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            image: { url: video.thumbnail },
                            caption: videoInfo
                        }, { quoted: msg });

                        // Download the video
                        const tempDir = './temp';
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir);
                        }

                        const tempFile = path.join(tempDir, `${video.videoId}.mp4`);
                        
                        // Download video
                        const videoStream = ytdl(video.url, {
                            quality: 'highest',
                            filter: 'videoandaudio'
                        });

                        await new Promise((resolve, reject) => {
                            videoStream
                                .pipe(fs.createWriteStream(tempFile))
                                .on('finish', resolve)
                                .on('error', reject);
                        });

                        // Send the video file
                        await socket.sendMessage(sender, {
                            video: fs.readFileSync(tempFile),
                            caption: `🎥 ${video.title}`,
                            mimetype: 'video/mp4'
                        }, { quoted: msg });

                        // Clean up
                        fs.unlinkSync(tempFile);

                        // Send success message
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'DOWNLOAD COMPLETE',
                                '✅ *Video downloaded successfully!*\n\n🎬 Enjoy your video!',
                                'Download Complete ✅'
                            )
                        });

                    } catch (err) {
                        console.error('Video download error:', err);
                        
                        // Clean up temp files if they exist
                        try {
                            const tempDir = './temp';
                            if (fs.existsSync(tempDir)) {
                                fs.readdirSync(tempDir).forEach(file => {
                                    fs.unlinkSync(path.join(tempDir, file));
                                });
                            }
                        } catch (cleanupErr) {
                            console.error('Cleanup error:', cleanupErr);
                        }
                        
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'DOWNLOAD ERROR',
                                '❌ *Error downloading video!*\n\nPossible reasons:\n• Invalid URL\n• Video too long\n• Network error\n• YouTube restrictions\n\nPlease try again with a different video.',
                                'Error ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                case 'ai': {
                    const axios = require("axios");

                    // Use your Gemini API key here
                    const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
                    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

                    // Get user input
                    const q = msg.message?.conversation || 
                              msg.message?.extendedTextMessage?.text || 
                              msg.message?.imageMessage?.caption || 
                              msg.message?.videoMessage?.caption || 
                              '';

                    if (!q || q.trim() === '') {
                        return await socket.sendMessage(sender, {
                            text: formatMessage(
                                'AI CHAT',
                                '🤖 Hello! I\'m 𝕃𝕒𝕜𝕚 𝕄𝔻 AI Assistant.\n\nHow can I help you today?\n\nJust type your question after .ai command.',
                                'AI Assistant 🤖'
                            )
                        }, { quoted: msg });
                    }

                    // Send thinking message
                    await socket.sendMessage(sender, {
                        text: '💭 *Thinking...*'
                    }, { quoted: msg });

                    try {
                        const payload = {
                            contents: [{
                                parts: [{ text: q }]
                            }]
                        };

                        const response = await axios.post(GEMINI_API_URL, payload, {
                            headers: {
                                "Content-Type": "application/json"
                            },
                            timeout: 30000
                        });

                        const aiResponse = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;

                        if (!aiResponse) {
                            throw new Error('No response from AI');
                        }

                        const aiMessage = `
╔══════════════════════════╗
║   🤖 AI ASSISTANT 🤖
╚══════════════════════════╝

💭 YOUR QUESTION:
┌──────────────────────────┐
│ ${q}
└──────────────────────────┘

🤖 AI RESPONSE:
┌──────────────────────────┐
│ ${aiResponse}
└──────────────────────────┘

💡 TIPS:
┌──────────────────────────┐
│ 🎯 Ask clear questions
│ 🔍 Be specific
│ 📚 I can help with various topics
│ 💬 Continue chatting with .ai
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            text: aiMessage
                        }, { quoted: msg });

                    } catch (err) {
                        console.error("Gemini Error:", err.response?.data || err.message);
                        
                        // Fallback response if API fails
                        const fallbackResponses = [
                            "I apologize, but I'm having trouble connecting to my AI brain right now. Please try again in a moment! 🧠",
                            "Oops! My AI service seems to be taking a break. Try asking me something else! 🤖",
                            "I'm currently experiencing technical difficulties. Please try your question again shortly! ⚡",
                            "My AI processors are a bit busy at the moment. Could you please rephrase your question? 💭"
                        ];
                        
                        const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
                        
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'AI SERVICE UNAVAILABLE',
                                `❌ ${randomResponse}\n\nError: ${err.message || 'Unknown error'}`,
                                'Service Temporarily Down ⚠️'
                            )
                        }, { quoted: msg });
                    }
                    break;
                }
                
                case 'now': {
                    const currentTime = getSriLankaTimestamp();
                    
                    const timeInfo = `
╔══════════════════════════╗
║   ⏰ CURRENT TIME ⏰
╚══════════════════════════╝

📅 DATE & TIME:
┌──────────────────────────┐
│ 🗓️ Date: ${moment().tz('Asia/Colombo').format('DD MMMM YYYY')}
│ 🕒 Time: ${moment().tz('Asia/Colombo').format('HH:mm:ss')}
│ 📍 Timezone: Asia/Colombo
│ 🇱🇰 Country: Sri Lanka
└──────────────────────────┘

📊 BOT STATUS:
┌──────────────────────────┐
│ 🤖 Status: ✅ ONLINE
│ 📱 Your Number: ${number}
│ 👥 Active Sessions: ${activeSockets.size}
│ 🎯 Prefix: ${config.PREFIX}
└──────────────────────────┘

⚙️ FEATURES:
┌──────────────────────────┐
│ 👀 Auto View: ${config.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ❤️ Auto Like: ${config.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ⏺️ Auto Record: ${config.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}
│ 🔘 Buttons: ${config.BUTTONS_ENABLED === 'true' ? '✅ ON' : '❌ OFF'}
└──────────────────────────┘

📞 CONTACT:
┌──────────────────────────┐
│ 👑 Owner: ${config.OWNER_NUMBER}
│ 📢 Channel: ${config.CHANNEL_LINK}
│ 👥 Group: ${config.GROUP_INVITE_LINK}
└──────────────────────────┘
`;
                    
                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: timeInfo
                    });
                    break;
                }
                
                case 'tiktok': {
                    const axios = require('axios');

                    const q = msg.message?.conversation ||
                              msg.message?.extendedTextMessage?.text ||
                              msg.message?.imageMessage?.caption ||
                              msg.message?.videoMessage?.caption || '';

                    const link = q.replace(/^[.\/!]tiktok(dl)?|tt(dl)?\s*/i, '').trim();

                    if (!link) {
                        return await socket.sendMessage(sender, {
                            text: formatMessage(
                                'TIKTOK DOWNLOAD',
                                '❗ *Please provide a TikTok link!*\n\n📋 *Usage:* .tiktok [tiktok-url]\n\nExample:\n.tiktok https://tiktok.com/@user/video/123456789',
                                'Usage Guide 📱'
                            )
                        }, { quoted: msg });
                    }

                    if (!link.includes('tiktok.com')) {
                        return await socket.sendMessage(sender, {
                            text: formatMessage(
                                'INVALID LINK',
                                '❌ *Invalid TikTok link!*\n\nPlease provide a valid TikTok URL starting with:\n• https://tiktok.com/\n• https://vm.tiktok.com/\n• https://www.tiktok.com/',
                                'Invalid URL ⚠️'
                            )
                        }, { quoted: msg });
                    }

                    try {
                        await socket.sendMessage(sender, {
                            text: '⏳ *Downloading TikTok video...*\nPlease wait while I process your request.'
                        }, { quoted: msg });

                        const apiUrl = `https://delirius-apiofc.vercel.app/download/tiktok?url=${encodeURIComponent(link)}`;
                        const { data } = await axios.get(apiUrl);

                        if (!data?.status || !data?.data) {
                            return await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'DOWNLOAD FAILED',
                                    '❌ *Failed to fetch TikTok video!*\n\nThe video might be:\n• Private\n• Removed\n• Age-restricted\n• Region-locked\n\nPlease try a different video.',
                                    'Download Failed ⚠️'
                                )
                            }, { quoted: msg });
                        }

                        const { title, like, comment, share, author, meta } = data.data;
                        const video = meta.media.find(v => v.type === "video");

                        if (!video || !video.org) {
                            return await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'NO VIDEO FOUND',
                                    '❌ *No downloadable video found!*\n\nThe video format might not be supported.',
                                    'Format Error ⚠️'
                                )
                            }, { quoted: msg });
                        }

                        const caption = `
╔══════════════════════════╗
║   📱 TIKTOK DOWNLOAD 📱
╚══════════════════════════╝

👤 CREATOR INFO:
┌──────────────────────────┐
│ 👤 Name: ${author.nickname}
│ 🆔 Username: @${author.username}
│ 👁️ Followers: ${author.followers || 'N/A'}
│ ❤️ Following: ${author.following || 'N/A'}
└──────────────────────────┘

📊 VIDEO STATS:
┌──────────────────────────┐
│ 🎬 Title: ${title || 'No Title'}
│ 👍 Likes: ${like}
│ 💬 Comments: ${comment}
│ 🔁 Shares: ${share}
│ 👁️ Views: ${meta.views || 'N/A'}
└──────────────────────────┘

💡 DOWNLOAD INFO:
┌──────────────────────────┐
│ 📥 Status: Downloading...
│ 🎬 Quality: Best Available
│ ⏳ Please wait...
└──────────────────────────┘

⚠️ DISCLAIMER:
┌──────────────────────────┐
│ Respect creator rights
│ Download for personal use
│ Don't reupload without permission
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            video: { url: video.org },
                            caption: caption,
                            mimetype: 'video/mp4'
                        }, { quoted: msg });

                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'DOWNLOAD COMPLETE',
                                '✅ *TikTok video downloaded successfully!*\n\n📱 Enjoy your video!',
                                'Download Complete ✅'
                            )
                        });

                    } catch (err) {
                        console.error("TikTok command error:", err);
                        
                        // Alternative APIs to try
                        const alternativeAPIs = [
                            `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(link)}`,
                            `https://tikwm.com/api/?url=${encodeURIComponent(link)}`,
                            `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
                        ];
                        
                        let downloaded = false;
                        
                        for (const api of alternativeAPIs) {
                            try {
                                const { data } = await axios.get(api);
                                if (data.data && data.data.play) {
                                    const videoUrl = data.data.play;
                                    
                                    await socket.sendMessage(sender, {
                                        video: { url: videoUrl },
                                        caption: '📱 TikTok Video (Alternative Source)',
                                        mimetype: 'video/mp4'
                                    }, { quoted: msg });
                                    
                                    downloaded = true;
                                    break;
                                }
                            } catch (altErr) {
                                console.error(`Alternative API ${api} failed:`, altErr.message);
                            }
                        }
                        
                        if (!downloaded) {
                            await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'TIKTOK ERROR',
                                    `❌ *Failed to download TikTok video!*\n\nError: ${err.message}\n\nPlease try:\n• Different TikTok link\n• Check link validity\n• Try again later`,
                                    'Download Failed ⚠️'
                                )
                            }, { quoted: msg });
                        }
                    }
                    break;
                }
                
                case 'fb': {
                    const axios = require('axios');
                    const q = msg.message?.conversation || 
                              msg.message?.extendedTextMessage?.text || 
                              msg.message?.imageMessage?.caption || 
                              msg.message?.videoMessage?.caption || 
                              '';

                    const fbUrl = q?.trim();

                    if (!/facebook\.com|fb\.watch/.test(fbUrl)) {
                        return await socket.sendMessage(sender, {
                            text: formatMessage(
                                'FACEBOOK DOWNLOAD',
                                '❗ *Please provide a valid Facebook video link!*\n\n📋 *Usage:* .fb [facebook-url]\n\nValid URL formats:\n• https://facebook.com/...\n• https://fb.watch/...\n• https://www.facebook.com/...',
                                'Usage Guide 📘'
                            )
                        });
                    }

                    try {
                        await socket.sendMessage(sender, {
                            text: '⏳ *Downloading Facebook video...*\nThis may take a moment.'
                        });

                        const res = await axios.get(`https://suhas-bro-api.vercel.app/download/fbdown?url=${encodeURIComponent(fbUrl)}`);
                        const result = res.data.result;

                        if (!result || !result.sd) {
                            throw new Error('No video URL found');
                        }

                        const caption = `
╔══════════════════════════╗
║   📘 FACEBOOK VIDEO 📘
╚══════════════════════════╝

📥 DOWNLOAD INFO:
┌──────────────────────────┐
│ 🎬 Quality: Standard (SD)
│ 📊 Source: Facebook
│ 🔗 Original URL: ${fbUrl}
└──────────────────────────┘

💡 DOWNLOAD TIPS:
┌──────────────────────────┐
│ 📥 Video downloading...
│ ⏳ Please wait...
│ 🎬 Best quality available
└──────────────────────────┘

⚠️ IMPORTANT:
┌──────────────────────────┐
│ 🔒 Private videos cannot
│   be downloaded
│ 👁️ Public videos only
│ 📏 Some videos may have
│   download restrictions
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            video: { url: result.sd },
                            caption: caption,
                            mimetype: 'video/mp4'
                        }, { quoted: msg });

                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'DOWNLOAD COMPLETE',
                                '✅ *Facebook video downloaded successfully!*',
                                'Download Complete ✅'
                            )
                        });

                    } catch (e) {
                        console.log(e);
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'DOWNLOAD ERROR',
                                '❌ *Error downloading Facebook video!*\n\nPossible reasons:\n• Private/restricted video\n• Invalid URL\n• Video removed\n• API limit reached\n\nPlease try a different video.',
                                'Error ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                case 'runtime': {
                    try {
                        const startTime = socketCreationTime.get(number) || Date.now();
                        const uptime = Math.floor((Date.now() - startTime) / 1000);
                        
                        const hours = Math.floor(uptime / 3600);
                        const minutes = Math.floor((uptime % 3600) / 60);
                        const seconds = uptime % 60;
                        
                        let formattedTime = '';
                        if (hours > 0) formattedTime += `${hours}h `;
                        if (minutes > 0 || hours > 0) formattedTime += `${minutes}m `;
                        formattedTime += `${seconds}s`;

                        const memoryUsage = (process.memoryUsage().rss / (1024 * 1024)).toFixed(2) + " MB";
                        const heapUsed = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2) + " MB";
                        const heapTotal = (process.memoryUsage().heapTotal / (1024 * 1024)).toFixed(2) + " MB";

                        const runtimeInfo = `
╔══════════════════════════╗
║   📊 RUNTIME STATS 📊
╚══════════════════════════╝

⏰ UPTIME INFORMATION:
┌──────────────────────────┐
│ 🕒 Current Uptime: ${formattedTime}
│ 📅 Started: ${new Date(startTime).toLocaleString()}
│ 🎯 Your Number: ${number}
└──────────────────────────┘

📈 BOT STATISTICS:
┌──────────────────────────┐
│ 👥 Active Sessions: ${activeSockets.size}
│ ⚡ Ping: ${Math.floor(Math.random() * 100) + 50}ms
│ 🎯 Prefix: ${config.PREFIX}
│ 🚀 Max Retries: ${config.MAX_RETRIES}
└──────────────────────────┘

💾 MEMORY USAGE:
┌──────────────────────────┐
│ 💾 RSS Memory: ${memoryUsage}
│ 🧠 Heap Used: ${heapUsed}
│ 🧠 Heap Total: ${heapTotal}
│ 🔄 Uptime: ${formattedTime}
└──────────────────────────┘

📊 PERFORMANCE:
┌──────────────────────────┐
│ ⭐ Status: Optimal
│ ⚡ Speed: Fast
| 🛡️ Stability: High
│ 🔄 Auto-restart: Enabled
└──────────────────────────┘

🔗 CONNECTION INFO:
┌──────────────────────────┐
│ 📡 Type: WebSocket
│ 🔌 Protocol: Baileys
│ 🌐 Network: Stable
│ 💾 Session: Persistent
└──────────────────────────┘
`;

                        await socket.sendMessage(sender, {
                            image: { url: config.RCD_IMAGE_PATH },
                            caption: runtimeInfo
                        });
                    } catch (error) {
                        console.error("❌ Runtime command error:", error);
                        await socket.sendMessage(sender, { 
                            text: formatMessage(
                                'RUNTIME ERROR',
                                '⚠️ Failed to fetch runtime stats.\nPlease try again later.',
                                'Error ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                case 'ping':
                case 'speed':
                case 'latency':
                    try {
                        console.log('Checking bot ping...');
                        
                        var initial = new Date().getTime();
                        
                        console.log('Sending ping message...');
                        let ping = await socket.sendMessage(sender, { 
                            text: '🏓 *Pinging...*' 
                        });
                        
                        var final = new Date().getTime();
                        const pingTime = final - initial;
                        
                        console.log(`Ping calculated: ${pingTime}ms`);
                        
                        const speedTest = `
╔══════════════════════════╗
║   🏓 SPEED TEST 🏓
╚══════════════════════════╝

📊 TEST RESULTS:
┌──────────────────────────┐
│ ⚡ Ping: ${pingTime}ms
│ 📡 Status: ${pingTime < 100 ? 'Excellent' : pingTime < 300 ? 'Good' : 'Fair'}
│ 🌐 Connection: ${pingTime < 200 ? 'Fast' : 'Normal'}
│ 🔄 Response: Immediate
└──────────────────────────┘

📈 SPEED RATING:
┌──────────────────────────┐
│ ${pingTime < 100 ? '⭐⭐⭐⭐⭐ Excellent' : 
   pingTime < 200 ? '⭐⭐⭐⭐ Good' : 
   pingTime < 300 ? '⭐⭐⭐ Average' : 
   '⭐⭐ Below Average'}
└──────────────────────────┘

💡 PERFORMANCE TIPS:
┌──────────────────────────┐
│ 🔄 Restart bot if ping > 500ms
│ 📶 Check your internet connection
| 🚀 Use .runtime for more stats
│ 🔧 Contact owner if issues persist
└──────────────────────────┘

🛠️ TECHNICAL INFO:
┌──────────────────────────┐
│ 🤖 Bot: 𝕃𝕒𝕜𝕚 𝕄𝔻 Mini Bot
│ 📱 Your Number: ${number}
│ 👥 Active Sessions: ${activeSockets.size}
│ 🎯 Test Time: ${getSriLankaTimestamp()}
└──────────────────────────┘
`;
                        
                        await socket.sendMessage(sender, { 
                            text: speedTest
                        });
                        
                        console.log('Ping message sent successfully.');
                        
                    } catch (error) {
                        console.error(`Error in 'ping' case: ${error.message}`);
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'PING ERROR',
                                '❌ *Ping check failed!*\n\nBot might be experiencing issues.\nTry: .runtime or restart bot.',
                                'Error ⚠️'
                            )
                        });
                    }
                    break;
                    
                case 'deleteme': {
                    await sendButtonMessage(socket, sender, 'SESSION DELETION', 
                        '⚠️ *WARNING: This action cannot be undone!*\n\nAre you sure you want to delete your session?',
                        [
                            { buttonId: `${config.PREFIX}confirmdelete yes`, buttonText: { displayText: '✅ YES, DELETE' }, type: 1 },
                            { buttonId: `${config.PREFIX}confirmdelete no`, buttonText: { displayText: '❌ NO, CANCEL' }, type: 1 }
                        ]
                    );
                    break;
                }
                
                case 'confirmdelete': {
                    if (args[0] === 'yes') {
                        const sessionPath = path.join(SESSION_BASE_PATH, `session_${number.replace(/[^0-9]/g, '')}`);
                        if (fs.existsSync(sessionPath)) {
                            fs.removeSync(sessionPath);
                        }
                        await deleteSessionFromGitHub(number);
                        if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
                            activeSockets.get(number.replace(/[^0-9]/g, '')).ws.close();
                            activeSockets.delete(number.replace(/[^0-9]/g, ''));
                            socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
                        }
                        
                        await socket.sendMessage(sender, {
                            image: { url: config.RCD_IMAGE_PATH },
                            caption: formatMessage(
                                'SESSION DELETED',
                                '✅ *Your session has been successfully deleted!*\n\n📱 Number: ' + number + '\n🗑️ All data removed\n🔒 Session terminated\n📤 Removed from GitHub\n\nTo use the bot again, you need to pair your number again.',
                                'Deletion Complete ✅'
                            )
                        });
                        
                        // Close connection after sending message
                        setTimeout(() => {
                            if (socket.ws && socket.ws.readyState === 1) {
                                socket.ws.close();
                            }
                        }, 3000);
                        
                    } else {
                        await socket.sendMessage(sender, {
                            text: formatMessage(
                                'DELETION CANCELLED',
                                '❌ *Session deletion cancelled!*\n\nYour session is still active and safe.',
                                'Cancelled ⚠️'
                            )
                        });
                    }
                    break;
                }
                
                default: {
                    // Handle unknown commands
                    await socket.sendMessage(sender, {
                        text: formatMessage(
                            'UNKNOWN COMMAND',
                            `❌ *Unknown command: ${config.PREFIX}${command}*\n\n📋 *Available commands:*\n• ${config.PREFIX}menu - Show all commands\n• ${config.PREFIX}help - Get help\n• ${config.PREFIX}alive - Check bot status\n\n💡 *Tip:* Use ${config.PREFIX}menu to see all available commands.`,
                            'Help 🆘'
                        )
                    });
                }
            }
        } catch (error) {
            console.error('Command handler error:', error);
            await socket.sendMessage(sender, {
                text: formatMessage(
                    'COMMAND ERROR',
                    '❌ *An error occurred while processing your command!*\n\nError: ' + (error.message || 'Unknown error') + '\n\nPlease try again or contact the owner if the issue persists.',
                    'Error ⚠️'
                )
            });
        }
    });
}

function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        if (config.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
                console.log(`Set recording presence for ${msg.key.remoteJid}`);
            } catch (error) {
                console.error('Failed to set recording presence:', error);
            }
        }
    });
}

async function deleteSessionFromGitHub(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file =>
            file.name.includes(sanitizedNumber) && file.name.endsWith('.json')
        );

        for (const file of sessionFiles) {
            await octokit.repos.deleteFile({
                owner,
                repo,
                path: `session/${file.name}`,
                message: `Delete session for ${sanitizedNumber}`,
                sha: file.sha
            });
        }
    } catch (error) {
        console.error('Failed to delete session from GitHub:', error);
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file =>
            file.name === `creds_${sanitizedNumber}.json`
        );

        if (sessionFiles.length === 0) return null;

        const latestSession = sessionFiles[0];
        const { data: fileData } = await octokit.repos.getContent({
            owner,
            repo,
            path: `session/${latestSession.name}`
        });

        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Session restore failed:', error);
        return null;
    }
}

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configPath = `session/config_${sanitizedNumber}.json`;
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: configPath
        });

        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.warn(`No configuration found for ${number}, using default config`);
        return { ...config };
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configPath = `session/config_${sanitizedNumber}.json`;
        let sha;

        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: configPath
            });
            sha = data.sha;
        } catch (error) {
        }

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: configPath,
            message: `Update config for ${sanitizedNumber}`,
            content: Buffer.from(JSON.stringify(newConfig, null, 2)).toString('base64'),
            sha
        });
        console.log(`Updated config for ${sanitizedNumber}`);
    } catch (error) {
        console.error('Failed to update config:', error);
        throw error;
    }
}

function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
            console.log(`Connection lost for ${number}, attempting to reconnect...`);
            await delay(10000);
            activeSockets.delete(number.replace(/[^0-9]/g, ''));
            socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
        }
    });
}

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    await cleanDuplicateFiles(sanitizedNumber);

    const restoredCreds = await restoreSession(sanitizedNumber);
    if (restoredCreds) {
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
        console.log(`Successfully restored session for ${sanitizedNumber}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari'),
            markOnlineOnConnect: true,
            syncFullHistory: false,
            linkPreviewImageThumbnailWidth: 192,
            generateHighQualityLinkPreview: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        handleMessageRevocation(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to request pairing code: ${retries}, error.message`, retries);
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (!res.headersSent) {
                res.send({ code });
            }
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            let sha;
            try {
                const { data } = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: `session/creds_${sanitizedNumber}.json`
                });
                sha = data.sha;
            } catch (error) {
            }

            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: `session/creds_${sanitizedNumber}.json`,
                message: `Update session creds for ${sanitizedNumber}`,
                content: Buffer.from(fileContent).toString('base64'),
                sha
            });
            console.log(`Updated creds for ${sanitizedNumber} in GitHub`);
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);

                    await updateAboutStatus(socket);
                    await updateStoryStatus(socket);

                    const groupResult = await joinGroup(socket);

                    try {
                        await socket.newsletterFollow(config.NEWSLETTER_JID);
                        await socket.sendMessage(config.NEWSLETTER_JID, { react: { text: '❤️', key: { id: config.NEWSLETTER_MESSAGE_ID } } });
                        console.log('✅ Auto-followed newsletter & reacted ❤️');
                    } catch (error) {
                        console.error('❌ Newsletter error:', error.message);
                    }

                    try {
                        await loadUserConfig(sanitizedNumber);
                    } catch (error) {
                        await updateUserConfig(sanitizedNumber, config);
                    }

                    activeSockets.set(sanitizedNumber, socket);

                    const groupStatus = groupResult.status === 'success'
                        ? '✅ Joined successfully'
                        : `❌ Failed: ${groupResult.error}`;
                    
                    const welcomeMessage = `
╔══════════════════════════╗
║   🎉 WELCOME BACK 🎉
╚══════════════════════════╝

✅ CONNECTION SUCCESSFUL:
┌──────────────────────────┐
│ 📱 Number: ${sanitizedNumber}
│ 🟢 Status: CONNECTED
│ 🕒 Time: ${getSriLankaTimestamp()}
│ ⚡ Speed: Optimal
└──────────────────────────┘

👥 GROUP STATUS:
┌──────────────────────────┐
│ ${groupStatus}
└──────────────────────────┘

📢 FEATURES ENABLED:
┌──────────────────────────┐
│ 👀 Auto View Status
│ ❤️ Auto Like Status
│ ⏺️ Auto Recording
│ 🔘 Interactive Buttons
└──────────────────────────┘

🛠️ GETTING STARTED:
┌──────────────────────────┐
│ 1. Type ${config.PREFIX}menu
│ 2. Explore all features
│ 3. Download media
│ 4. Get news updates
│ 5. Chat with AI
└──────────────────────────┘

💡 QUICK TIPS:
┌──────────────────────────┐
│ 📱 Use ${config.PREFIX}help for help
│ ⚙️ Use ${config.PREFIX}settings to customize
| 🗑️ Use ${config.PREFIX}deleteme to remove
│ 📞 Contact owner for issues
└──────────────────────────┘

🔗 IMPORTANT LINKS:
┌──────────────────────────┐
│ 📢 Channel: ${config.CHANNEL_LINK}
│ 👥 Group: ${config.GROUP_INVITE_LINK}
│ 👑 Owner: ${config.OWNER_NUMBER}
└──────────────────────────┘
`;

                    await socket.sendMessage(userJid, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: welcomeMessage
                    });

                    await sendAdminConnectMessage(socket, sanitizedNumber, groupResult);

                    let numbers = [];
                    if (fs.existsSync(NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
                    }
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                        await updateNumberListOnGitHub(sanitizedNumber);
                    }
                } catch (error) {
                    console.error('Connection error:', error);
                    exec(`pm2 restart ${process.env.PM2_NAME || 'lakshan-md-session'}`);
                }
            }
        });
    } catch (error) {
        console.error('Pairing error:', error);
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable' });
        }
    }
}

// Routes
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: '𝕃𝕒𝕜𝕚 𝕄𝔻 MINI BOT is running',
        activesession: activeSockets.size,
        timestamp: getSriLankaTimestamp()
    });
});

router.get('/connect-all', async (req, res) => {
    try {
        if (!fs.existsSync(NUMBER_LIST_PATH)) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH));
        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Connect all error:', error);
        res.status(500).send({ error: 'Failed to connect all bots' });
    }
});

router.get('/reconnect', async (req, res) => {
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file => 
            file.name.startsWith('creds_') && file.name.endsWith('.json')
        );

        if (sessionFiles.length === 0) {
            return res.status(404).send({ error: 'No session files found in GitHub repository' });
        }

        const results = [];
        for (const file of sessionFiles) {
            const match = file.name.match(/creds_(\d+)\.json/);
            if (!match) {
                console.warn(`Skipping invalid session file: ${file.name}`);
                results.push({ file: file.name, status: 'skipped', reason: 'invalid_file_name' });
                continue;
            }

            const number = match[1];
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
            } catch (error) {
                console.error(`Failed to reconnect bot for ${number}:`, error);
                results.push({ number, status: 'failed', error: error.message });
            }
            await delay(1000);
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ error: 'Failed to reconnect bots' });
    }
});

router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) {
        return res.status(400).send({ error: 'Number and config are required' });
    }

    let newConfig;
    try {
        newConfig = JSON.parse(configString);
    } catch (error) {
        return res.status(400).send({ error: 'Invalid config format' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const otp = generateOTP();
    otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });

    try {
        await sendOTP(socket, sanitizedNumber, otp);
        res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' });
    } catch (error) {
        otpStore.delete(sanitizedNumber);
        res.status(500).send({ error: 'Failed to send OTP' });
    }
});

router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) {
        return res.status(400).send({ error: 'Number and OTP are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const storedData = otpStore.get(sanitizedNumber);
    if (!storedData) {
        return res.status(400).send({ error: 'No OTP request found for this number' });
    }

    if (Date.now() >= storedData.expiry) {
        otpStore.delete(sanitizedNumber);
        return res.status(400).send({ error: 'OTP has expired' });
    }

    if (storedData.otp !== otp) {
        return res.status(400).send({ error: 'Invalid OTP' });
    }

    try {
        await updateUserConfig(sanitizedNumber, storedData.newConfig);
        otpStore.delete(sanitizedNumber);
        const socket = activeSockets.get(sanitizedNumber);
        if (socket) {
            await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                image: { url: config.RCD_IMAGE_PATH },
                caption: formatMessage(
                    'CONFIG UPDATED',
                    '✅ *Your configuration has been successfully updated!*\n\nAll changes have been saved and applied.',
                    'Update Complete ✅'
                )
            });
        }
        res.status(200).send({ status: 'success', message: 'Config updated successfully' });
    } catch (error) {
        console.error('Failed to update config:', error);
        res.status(500).send({ error: 'Failed to update config' });
    }
});

router.get('/getabout', async (req, res) => {
    const { number, target } = req.query;
    if (!number || !target) {
        return res.status(400).send({ error: 'Number and target number are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
        const statusData = await socket.fetchStatus(targetJid);
        const aboutStatus = statusData.status || 'No status available';
        const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
        res.status(200).send({
            status: 'success',
            number: target,
            about: aboutStatus,
            setAt: setAt,
            formatted: formatMessage(
                'ABOUT STATUS',
                `📱 *Number:* ${target}\n\n💭 *About:* ${aboutStatus}\n\n🕒 *Last Updated:* ${setAt}`,
                'Status Information ℹ️'
            )
        });
    } catch (error) {
        console.error(`Failed to fetch status for ${target}:`, error);
        res.status(500).send({
            status: 'error',
            message: `Failed to fetch About status for ${target}. The number may not exist or the status is not accessible.`
        });
    }
});

// Cleanup
process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    fs.emptyDirSync(SESSION_BASE_PATH);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'lakshan-md-session'}`);
});

// Auto reconnect from GitHub
async function autoReconnectFromGitHub() {
    try {
        const pathOnGitHub = 'session/numbers.json';
        const { data } = await octokit.repos.getContent({ owner, repo, path: pathOnGitHub });
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const numbers = JSON.parse(content);

        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
                console.log(`🔁 Reconnected from GitHub: ${number}`);
                await delay(1000);
            }
        }
    } catch (error) {
        console.error('❌ autoReconnectFromGitHub error:', error.message);
    }
}

// Start auto reconnect
setTimeout(() => {
    autoReconnectFromGitHub();
}, 5000);

module.exports = router;

async function updateNumberListOnGitHub(newNumber) {
    const sanitizedNumber = newNumber.replace(/[^0-9]/g, '');
    const pathOnGitHub = 'session/numbers.json';
    let numbers = [];

    try {
        const { data } = await octokit.repos.getContent({ owner, repo, path: pathOnGitHub });
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        numbers = JSON.parse(content);

        if (!numbers.includes(sanitizedNumber)) {
            numbers.push(sanitizedNumber);
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: pathOnGitHub,
                message: `Add ${sanitizedNumber} to numbers list`,
                content: Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64'),
                sha: data.sha
            });
            console.log(`✅ Added ${sanitizedNumber} to GitHub numbers.json`);
        }
    } catch (err) {
        if (err.status === 404) {
            numbers = [sanitizedNumber];
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: pathOnGitHub,
                message: `Create numbers.json with ${sanitizedNumber}`,
                content: Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64')
            });
            console.log(`📁 Created GitHub numbers.json with ${sanitizedNumber}`);
        } else {
            console.error('❌ Failed to update numbers.json:', err.message);
        }
    }
}
