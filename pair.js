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

// Global Variables
const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();
const userSettings = new Map();

// Default Configuration
const defaultConfig = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['❗', '🧚‍♂️', '🪄', '💓', '🎈', '♻️', '👻', '🥺', '🚀', '🔥'],
    PREFIX: '.',
    LANGUAGE: 'sinhala', // 'sinhala' or 'english'
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/HewoNJwVwrD0m4IO1DihaN',
    ADMIN_LIST_PATH: './admin.json',
    RCD_IMAGE_PATH: './dinufree.jpg',
    NEWSLETTER_JID: '120363426375145222@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '94789227570',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbC8OWEBadmatxpZel15',
    BUTTONS_ENABLED: 'true',
    USER_LOGO_ENABLED: 'true',
    BOT_NAME: '𝕃𝕒𝕜𝕚 𝕄𝔻',
    USER_CUSTOM_NAME: '',
    USER_CUSTOM_LOGO: ''
};

const octokit = new Octokit({ auth: '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' });
const owner = 'lakshan';
const repo = 'session';

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// Language Translations
const translations = {
    sinhala: {
        alive: {
            title: "🎭 𝕃𝕒𝕜𝕚 𝕄𝔻 𝐌ɪɴɪ-𝐁ᴏᴛ 🎭",
            info: "🤖 බොට් තොරතුරු:",
            version: "📟 සංස්කරණය: v1.0",
            uptime: "🕒 ක්‍රියාකාරී කාලය:",
            active: "👥 සක්‍රීය සැසි:",
            yourNumber: "📞 ඔබගේ අංකය:",
            status: "⚡ තත්වය:",
            commands: "🛠️ ලබාගත හැකි විධාන:",
            features: "✨ විශේෂාංග:"
        },
        menu: {
            title: "🎭 𝕃𝕒𝕜𝕚 𝕄𝔻 𝐅𝐑𝐄𝐄 𝐁𝐎𝐓 🎭",
            info: "📋 බොට් තොරතුරු:",
            media: "🎵 මාධ්‍ය විධාන:",
            ai: "🤖 AI & සංවාද:",
            news: "📰 පුවත් & යාවත්කාලීන:",
            tools: "🛠️ උපකරණ:",
            controls: "⚙️ බොට් පාලනය:",
            links: "🔗 සබැඳි:"
        },
        settings: {
            title: "⚙️ බොට් සැකසුම් ⚙️",
            current: "📊 වර්තමාන සැකසුම්:",
            controls: "🛠️ සැකසුම් පාලනය:",
            viewStatus: "👀 ස්වයංක්‍රීය තත්වය නැරඹීම:",
            likeStatus: "❤️ ස්වයංක්‍රීය තත්වය පසුතැවීම:",
            recording: "⏺️ ස්වයංක්‍රීය පටිගත කිරීම:",
            buttons: "🔘 බොත්තම්:",
            prefix: "🎯 උපසර්ගය:",
            language: "🌐 භාෂාව:",
            botName: "🤖 බොට් නාමය:",
            userLogo: "🖼️ පරිශීලක ලාංඡනය:"
        }
    },
    english: {
        alive: {
            title: "🎭 𝕃𝕒𝕜𝕚 𝕄𝔻 𝐌ɪɴɪ-𝐁ᴏᴛ 🎭",
            info: "🤖 BOT INFORMATION:",
            version: "📟 Version: v1.0",
            uptime: "🕒 Uptime:",
            active: "👥 Active:",
            yourNumber: "📞 Your Number:",
            status: "⚡ Status:",
            commands: "🛠️ AVAILABLE COMMANDS:",
            features: "✨ FEATURES:"
        },
        menu: {
            title: "🎭 𝕃𝕒𝕜𝕚 𝕄𝔻 𝐅𝐑𝐄𝐄 𝐁𝐎𝐓 🎭",
            info: "📋 BOT INFORMATION:",
            media: "🎵 MEDIA COMMANDS:",
            ai: "🤖 AI & CHAT:",
            news: "📰 NEWS & UPDATES:",
            tools: "🛠️ UTILITIES:",
            controls: "⚙️ BOT CONTROLS:",
            links: "🔗 LINKS:"
        },
        settings: {
            title: "⚙️ BOT SETTINGS ⚙️",
            current: "📊 CURRENT SETTINGS:",
            controls: "🛠️ SETTINGS CONTROLS:",
            viewStatus: "👀 Auto View Status:",
            likeStatus: "❤️ Auto Like Status:",
            recording: "⏺️ Auto Recording:",
            buttons: "🔘 Buttons Enabled:",
            prefix: "🎯 Prefix:",
            language: "🌐 Language:",
            botName: "🤖 Bot Name:",
            userLogo: "🖼️ User Logo:"
        }
    }
};

function getTranslation(number, key) {
    const userConfig = userSettings.get(number) || defaultConfig;
    const lang = userConfig.LANGUAGE || 'sinhala';
    return translations[lang][key] || translations.english[key];
}

function loadAdmins() {
    try {
        if (fs.existsSync(defaultConfig.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(defaultConfig.ADMIN_LIST_PATH, 'utf8'));
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
    let retries = defaultConfig.MAX_RETRIES;
    const inviteCodeMatch = defaultConfig.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
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
            await delay(2000 * (defaultConfig.MAX_RETRIES - retries));
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
                    image: { url: defaultConfig.RCD_IMAGE_PATH },
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

async function updateAboutStatus(socket, config) {
    const aboutStatus = `${config.BOT_NAME} ᴍɪɴɪ // ᴀᴄᴛɪᴠᴇ 🚀`;
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
        if (!message?.key || message.key.remoteJid !== defaultConfig.NEWSLETTER_JID) return;

        try {
            const emojis = ['♻️', '🪄', '❗', '🧚‍♂️'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('No valid newsletterServerId found:', message);
                return;
            }

            let retries = defaultConfig.MAX_RETRIES;
            while (retries > 0) {
                try {
                    await socket.newsletterReactMessage(
                        defaultConfig.NEWSLETTER_JID,
                        messageId.toString(),
                        randomEmoji
                    );
                    console.log(`Reacted to newsletter message ${messageId} with ${randomEmoji}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to react to newsletter message ${messageId}, retries left: ${retries}`, error.message);
                    if (retries === 0) throw error;
                    await delay(2000 * (defaultConfig.MAX_RETRIES - retries));
                }
            }
        } catch (error) {
            console.error('Newsletter reaction error:', error);
        }
    });
}

async function setupStatusHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant || message.key.remoteJid === defaultConfig.NEWSLETTER_JID) return;

        try {
            const userConfig = userSettings.get(number) || defaultConfig;
            
            if (userConfig.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (userConfig.AUTO_VIEW_STATUS === 'true') {
                let retries = userConfig.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to read status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (userConfig.MAX_RETRIES - retries));
                    }
                }
            }

            if (userConfig.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = userConfig.AUTO_LIKE_EMOJI[Math.floor(Math.random() * userConfig.AUTO_LIKE_EMOJI.length)];
                let retries = userConfig.MAX_RETRIES;
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
                        await delay(1000 * (userConfig.MAX_RETRIES - retries));
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
                image: { url: defaultConfig.RCD_IMAGE_PATH },
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

async function sendButtonMessage(socket, sender, title, content, buttons, config) {
    if (config.BUTTONS_ENABLED === 'true') {
        const message = {
            text: formatMessage(title, content, ''),
            footer: `${config.BOT_NAME} 🚀`,
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
                text: formatMessage(title, content, `${config.BOT_NAME} 🚀`)
            });
            return false;
        }
    } else {
        await socket.sendMessage(sender, {
            text: formatMessage(title, content, `${config.BOT_NAME} 🚀`)
        });
        return false;
    }
}

async function sendListMessage(socket, sender, title, content, sections) {
    try {
        const message = {
            text: formatMessage(title, content, ''),
            footer: '𝕃𝕒𝕜𝕚 𝕄𝔻 🚀',
            title: title,
            buttonText: 'Click to view',
            sections: sections
        };
        
        await socket.sendMessage(sender, message);
        return true;
    } catch (error) {
        console.error('Failed to send list message:', error);
        await socket.sendMessage(sender, {
            text: formatMessage(title, content, '𝕃𝕒𝕜𝕚 𝕄𝔻 🚀')
        });
        return false;
    }
}

// NEW: getdp command to download profile picture
async function getProfilePicture(socket, sender, target, msg) {
    try {
        let targetJid;
        
        if (target) {
            // If target is provided
            if (target.includes('@')) {
                targetJid = target;
            } else {
                targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
            }
        } else {
            // If no target, get sender's profile picture
            targetJid = sender;
        }
        
        // Send processing message
        await socket.sendMessage(sender, {
            text: '📸 *Downloading profile picture...*'
        }, { quoted: msg });
        
        // Get profile picture URL
        const pPicture = await socket.profilePictureUrl(targetJid, 'image');
        
        if (!pPicture) {
            return await socket.sendMessage(sender, {
                text: formatMessage(
                    'PROFILE PICTURE',
                    '❌ *No profile picture found!*\n\nThis user has not set a profile picture.',
                    'Not Found ⚠️'
                )
            }, { quoted: msg });
        }
        
        // Get user info
        const user = await socket.onWhatsApp(targetJid);
        const userName = user && user.length > 0 ? user[0].name || 'Unknown' : 'Unknown';
        
        // Download and send the image
        const response = await axios.get(pPicture, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        
        const caption = `
╔══════════════════════════╗
║   📸 PROFILE PICTURE 📸
╚══════════════════════════╝

👤 USER INFO:
┌──────────────────────────┐
│ 📛 Name: ${userName}
│ 📞 Number: ${targetJid.split('@')[0]}
│ 🔗 JID: ${targetJid}
│ 🖼️ Type: Profile Picture
└──────────────────────────┘

💡 DOWNLOAD INFO:
┌──────────────────────────┐
│ ✅ Downloaded successfully
│ 📁 Format: JPEG
│ 📊 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB
│ 🕒 Time: ${getSriLankaTimestamp()}
└──────────────────────────┘

⚡ QUICK ACTIONS:
┌──────────────────────────┐
│ 📱 Save to gallery
│ 🔄 Set as contact picture
│ 📤 Share with friends
│ 💾 Backup important pictures
└──────────────────────────┘
`;
        
        await socket.sendMessage(sender, {
            image: imageBuffer,
            caption: caption,
            mimetype: 'image/jpeg'
        }, { quoted: msg });
        
        // Send success message
        await socket.sendMessage(sender, {
            text: formatMessage(
                'DOWNLOAD COMPLETE',
                '✅ *Profile picture downloaded successfully!*\n\nThe image has been sent to your chat.',
                'Download Complete ✅'
            )
        });
        
    } catch (error) {
        console.error('GetDP error:', error);
        
        let errorMessage = '❌ *Failed to download profile picture!*';
        if (error.message.includes('404')) {
            errorMessage = '❌ *No profile picture found!*\nThis user has not set a profile picture.';
        } else if (error.message.includes('401')) {
            errorMessage = '❌ *Access denied!*\nCannot access this user\'s profile picture.';
        }
        
        await socket.sendMessage(sender, {
            text: formatMessage(
                'DOWNLOAD ERROR',
                `${errorMessage}\n\nError: ${error.message}`,
                'Error ⚠️'
            )
        }, { quoted: msg });
    }
}

async function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === defaultConfig.NEWSLETTER_JID) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;
        
        // Get user config
        const userConfig = userSettings.get(number) || defaultConfig;
        const prefix = userConfig.PREFIX;

        // Check for text commands
        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            if (text.startsWith(prefix)) {
                const parts = text.slice(prefix.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        // Check for button response
        else if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(prefix)) {
                const parts = buttonId.slice(prefix.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        // Check for list response
        else if (msg.message.listResponseMessage) {
            const listId = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
            if (listId && listId.startsWith(prefix)) {
                const parts = listId.slice(prefix.length).trim().split(/\s+/);
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
                    
                    const trans = getTranslation(number, 'alive');
                    
                    const botInfo = `
╔══════════════════════════╗
║   ${trans.title}
╚══════════════════════════╝

${trans.info}
┌──────────────────────────┐
│ ${trans.version}
│ 🕒 ${trans.uptime} ${hours}h ${minutes}m ${seconds}s
│ 👥 ${trans.active} ${activeSockets.size} sessions
│ 📞 ${trans.yourNumber} ${number}
│ ⚡ ${trans.status} ✅ ONLINE
└──────────────────────────┘

${trans.commands}
┌──────────────────────────┐
│ 🎶 ${prefix}menu      - All commands
│ 🗑️ ${prefix}deleteme  - Delete session
│ 💬 ${prefix}ping      - Bot ping test
│ 📰 ${prefix}status    - Latest updates
│ 👑 ${prefix}owner     - Developer info
│ ⏱️ ${prefix}runtime   - Total runtime
│ 🏓 ${prefix}latency   - Ping test
│ ⚙️ ${prefix}settings  - Bot settings
└──────────────────────────┘

${trans.features}
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
                        image: { url: userConfig.USER_LOGO_ENABLED === 'true' && userConfig.USER_CUSTOM_LOGO ? userConfig.USER_CUSTOM_LOGO : defaultConfig.RCD_IMAGE_PATH },
                        caption: botInfo
                    });
                    break;
                }
                
                case 'menu': {
                    const trans = getTranslation(number, 'menu');
                    
                    const menuText = `
╔══════════════════════════╗
║   ${trans.title}
╚══════════════════════════╝

${trans.info}
┌──────────────────────────┐
│ 🎭 Name: ${userConfig.BOT_NAME}
│ 🎫 Version: v1.0
│ 👨‍💻 Owner: Lakshan
│ 📞 Your Number: ${number}
│ 🏠 Host: Premium Server
└──────────────────────────┘

${trans.media}
┌──────────────────────────┐
│ 🎵 ${prefix}song      - Download songs
│ 🎬 ${prefix}tiktok   - TikTok downloader
│ 📘 ${prefix}fb       - Facebook video
│ 🎥 ${prefix}video    - YouTube video
└──────────────────────────┘

${trans.ai}
┌──────────────────────────┐
│ 🤖 ${prefix}ai       - AI Chat Assistant
│ 🧠 ${prefix}openai   - OpenAI features
│ 💭 ${prefix}chat     - Chat with bot
└──────────────────────────┘

${trans.news}
┌──────────────────────────┐
│ 📰 ${prefix}news     - Latest news
│ 🗞️ ${prefix}gossip   - Gossip news
│ 🏏 ${prefix}cricket  - Cricket updates
│ 📖 ${prefix}silumina - Silumina news
└──────────────────────────┘

${trans.tools}
┌──────────────────────────┐
│ 🌤️ ${prefix}weather - Weather updates
│ 🔎 ${prefix}google  - Google search
│ 🆔 ${prefix}jid     - Get JID
│ 🖼️ ${prefix}getdp   - Get profile picture
└──────────────────────────┘

${trans.controls}
┌──────────────────────────┐
│ ⚙️ ${prefix}settings - Bot settings
│ 🔘 ${prefix}button  - Toggle buttons
│ 🗑️ ${prefix}deleteme - Delete session
│ ℹ️ ${prefix}alive   - Bot status
└──────────────────────────┘

${trans.links}
┌──────────────────────────┐
│ 📱 Channel: ${defaultConfig.CHANNEL_LINK}
│ 👥 Group: ${defaultConfig.GROUP_INVITE_LINK}
└──────────────────────────┘
`;
                    
                    await sendButtonMessage(socket, sender, 'MAIN MENU', menuText, [
                        { buttonId: `${prefix}media`, buttonText: { displayText: '🎵 MEDIA' }, type: 1 },
                        { buttonId: `${prefix}news`, buttonText: { displayText: '📰 NEWS' }, type: 1 },
                        { buttonId: `${prefix}tools`, buttonText: { displayText: '🛠️ TOOLS' }, type: 1 },
                        { buttonId: `${prefix}settings`, buttonText: { displayText: '⚙️ SETTINGS' }, type: 1 }
                    ], userConfig);
                    break;
                }
                
                case 'settings': {
                    const trans = getTranslation(number, 'settings');
                    
                    const settingsText = `
╔══════════════════════════╗
║   ${trans.title}
╚══════════════════════════╝

${trans.current}
┌──────────────────────────┐
│ ${trans.viewStatus} ${userConfig.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ${trans.likeStatus} ${userConfig.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ${trans.recording} ${userConfig.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}
│ ${trans.buttons} ${userConfig.BUTTONS_ENABLED === 'true' ? '✅ ON' : '❌ OFF'}
│ ${trans.prefix} ${userConfig.PREFIX}
│ ${trans.language} ${userConfig.LANGUAGE === 'sinhala' ? '🇱🇰 සිංහල' : '🇬🇧 English'}
│ ${trans.botName} ${userConfig.BOT_NAME}
│ ${trans.userLogo} ${userConfig.USER_LOGO_ENABLED === 'true' ? '✅ ON' : '❌ OFF'}
└──────────────────────────┘

${trans.controls}
Use these commands to change settings:

${prefix}view on/off    - Toggle auto view status
${prefix}like on/off    - Toggle auto like status
${prefix}record on/off  - Toggle auto recording
${prefix}button on/off  - Toggle buttons
${prefix}prefix <new>   - Change command prefix
${prefix}lang sinhala/english - Change language
${prefix}setname <name> - Change bot name
${prefix}setlogo <url>  - Set custom logo
${prefix}logo on/off    - Toggle custom logo
`;
                    
                    await sendListMessage(socket, sender, 'SETTINGS PANEL', settingsText, [
                        {
                            title: "⚙️ Status Settings",
                            rows: [
                                { title: "👀 View Status", rowId: `${prefix}view ${userConfig.AUTO_VIEW_STATUS === 'true' ? 'off' : 'on'}` },
                                { title: "❤️ Like Status", rowId: `${prefix}like ${userConfig.AUTO_LIKE_STATUS === 'true' ? 'off' : 'on'}` },
                                { title: "⏺️ Auto Record", rowId: `${prefix}record ${userConfig.AUTO_RECORDING === 'true' ? 'off' : 'on'}` }
                            ]
                        },
                        {
                            title: "🔧 Bot Settings",
                            rows: [
                                { title: "🔘 Buttons", rowId: `${prefix}button ${userConfig.BUTTONS_ENABLED === 'true' ? 'off' : 'on'}` },
                                { title: "🌐 Language", rowId: `${prefix}lang ${userConfig.LANGUAGE === 'sinhala' ? 'english' : 'sinhala'}` },
                                { title: "🤖 Change Prefix", rowId: `${prefix}prefix .` }
                            ]
                        },
                        {
                            title: "🎨 Customization",
                            rows: [
                                { title: "📛 Change Name", rowId: `${prefix}setname ${userConfig.BOT_NAME}` },
                                { title: "🖼️ Logo", rowId: `${prefix}logo ${userConfig.USER_LOGO_ENABLED === 'true' ? 'off' : 'on'}` },
                                { title: "🔄 Reset Settings", rowId: `${prefix}reset` }
                            ]
                        }
                    ]);
                    break;
                }
                
                case 'view': {
                    if (args[0] === 'on') {
                        userConfig.AUTO_VIEW_STATUS = 'true';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '✅ Auto view status enabled!'
                        });
                    } else if (args[0] === 'off') {
                        userConfig.AUTO_VIEW_STATUS = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '❌ Auto view status disabled!'
                        });
                    }
                    break;
                }
                
                case 'like': {
                    if (args[0] === 'on') {
                        userConfig.AUTO_LIKE_STATUS = 'true';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '✅ Auto like status enabled!'
                        });
                    } else if (args[0] === 'off') {
                        userConfig.AUTO_LIKE_STATUS = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '❌ Auto like status disabled!'
                        });
                    }
                    break;
                }
                
                case 'record': {
                    if (args[0] === 'on') {
                        userConfig.AUTO_RECORDING = 'true';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '✅ Auto recording enabled!'
                        });
                    } else if (args[0] === 'off') {
                        userConfig.AUTO_RECORDING = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '❌ Auto recording disabled!'
                        });
                    }
                    break;
                }
                
                case 'button': {
                    if (args[0] === 'on') {
                        userConfig.BUTTONS_ENABLED = 'true';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '✅ Buttons enabled successfully!'
                        });
                    } else if (args[0] === 'off') {
                        userConfig.BUTTONS_ENABLED = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '❌ Buttons disabled successfully!'
                        });
                    }
                    break;
                }
                
                case 'prefix': {
                    if (args[0]) {
                        userConfig.PREFIX = args[0];
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: `✅ Command prefix changed to: ${userConfig.PREFIX}`
                        });
                    }
                    break;
                }
                
                case 'lang':
                case 'language': {
                    if (args[0] === 'sinhala' || args[0] === 'english') {
                        userConfig.LANGUAGE = args[0];
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: `✅ Language changed to: ${args[0] === 'sinhala' ? '🇱🇰 සිංහල' : '🇬🇧 English'}`
                        });
                    }
                    break;
                }
                
                case 'setname': {
                    if (args.length > 0) {
                        userConfig.BOT_NAME = args.join(' ');
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: `✅ Bot name changed to: ${userConfig.BOT_NAME}`
                        });
                    }
                    break;
                }
                
                case 'setlogo': {
                    if (args.length > 0) {
                        const logoUrl = args[0];
                        try {
                            // Verify the URL is valid
                            await axios.head(logoUrl);
                            userConfig.USER_CUSTOM_LOGO = logoUrl;
                            userConfig.USER_LOGO_ENABLED = 'true';
                            await updateUserConfig(number, userConfig);
                            userSettings.set(number, userConfig);
                            await socket.sendMessage(sender, {
                                text: '✅ Custom logo set successfully!'
                            });
                        } catch (error) {
                            await socket.sendMessage(sender, {
                                text: '❌ Invalid image URL!'
                            });
                        }
                    }
                    break;
                }
                
                case 'logo': {
                    if (args[0] === 'on') {
                        userConfig.USER_LOGO_ENABLED = 'true';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '✅ Custom logo enabled!'
                        });
                    } else if (args[0] === 'off') {
                        userConfig.USER_LOGO_ENABLED = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: '❌ Custom logo disabled!'
                        });
                    }
                    break;
                }
                
                case 'reset': {
                    userSettings.set(number, defaultConfig);
                    await updateUserConfig(number, defaultConfig);
                    await socket.sendMessage(sender, {
                        text: '✅ All settings reset to default!'
                    });
                    break;
                }
                
                case 'getdp': {
                    await getProfilePicture(socket, sender, args[0], msg);
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
                            
                            // Send channel follow message to all bots
                            activeSockets.forEach(async (botSocket, botNumber) => {
                                try {
                                    const botConfig = userSettings.get(botNumber) || defaultConfig;
                                    const channelMessage = `
🦧🧧🥹🧧👾🧧🧧👾🥰🧧🥰👾

╔══════════════════════════╗
║   📢 CHANNEL FOLLOWED 📢
╚══════════════════════════╝

🎯 ACTION: Channel Follow
📢 Channel: ${jid}
👤 Followed By: ${number}
🕒 Time: ${getSriLankaTimestamp()}
🤖 Bot: ${botConfig.BOT_NAME}

📝 MESSAGE:
"🦧🧧🥹🧧👾🧧🧧👾🥰🧧🥰👾
Channel follow successful!
All bots are now following this channel.
Share and enjoy content! 🎉"

🔗 CHANNEL INFO:
• Type: Newsletter
• JID: ${jid}
• Status: ✅ Followed
• Bots Active: ${activeSockets.size}

💡 TIP:
• Use .fc command to follow channels
• Stay updated with latest content
• Share with friends
`;

                                    await botSocket.sendMessage(jid, { text: channelMessage });
                                } catch (error) {
                                    console.error(`Failed to send channel message from bot ${botNumber}:`, error);
                                }
                            });
                            
                            await socket.sendMessage(sender, {
                                text: formatMessage(
                                    'CHANNEL FOLLOWED',
                                    `✅ Successfully followed the channel!\n\n📢 Channel: ${jid}\n\n🦧🧧🥹🧧👾🧧🧧👾🥰🧧🥰👾\n\nAll active bots (${activeSockets.size}) have been notified and will engage with the channel content.`,
                                    'Follow Complete ✅'
                                )
                            });
                            console.log(`FOLLOWED CHANNEL: ${jid} by all ${activeSockets.size} bots`);
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
                
                // Add other commands here (weather, jid, news, song, video, ai, tiktok, fb, runtime, ping, deleteme, etc.)
                // The implementation of these commands would be similar to your existing code
                // but using userConfig instead of defaultConfig
                
                default: {
                    // Handle unknown commands
                    await socket.sendMessage(sender, {
                        text: formatMessage(
                            'UNKNOWN COMMAND',
                            `❌ *Unknown command: ${prefix}${command}*\n\n📋 *Available commands:*\n• ${prefix}menu - Show all commands\n• ${prefix}help - Get help\n• ${prefix}alive - Check bot status\n\n💡 *Tip:* Use ${prefix}menu to see all available commands.`,
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

function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === defaultConfig.NEWSLETTER_JID) return;

        const userConfig = userSettings.get(number) || defaultConfig;
        
        if (userConfig.AUTO_RECORDING === 'true') {
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
        const config = JSON.parse(content);
        userSettings.set(sanitizedNumber, config);
        return config;
    } catch (error) {
        console.warn(`No configuration found for ${number}, using default config`);
        const config = { ...defaultConfig };
        userSettings.set(number.replace(/[^0-9]/g, ''), config);
        return config;
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
            // File doesn't exist yet
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
        userSettings.set(sanitizedNumber, newConfig);
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

        // Load user config
        const userConfig = await loadUserConfig(sanitizedNumber);
        
        setupStatusHandlers(socket, sanitizedNumber);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        handleMessageRevocation(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = userConfig.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to request pairing code: ${retries}, error.message`, retries);
                    await delay(2000 * (userConfig.MAX_RETRIES - retries));
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
                // File doesn't exist yet
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

                    await updateAboutStatus(socket, userConfig);
                    await updateStoryStatus(socket);

                    const groupResult = await joinGroup(socket);

                    try {
                        await socket.newsletterFollow(defaultConfig.NEWSLETTER_JID);
                        await socket.sendMessage(defaultConfig.NEWSLETTER_JID, { react: { text: '❤️', key: { id: defaultConfig.NEWSLETTER_MESSAGE_ID } } });
                        console.log('✅ Auto-followed newsletter & reacted ❤️');
                    } catch (error) {
                        console.error('❌ Newsletter error:', error.message);
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
│ 👀 Auto View Status: ${userConfig.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ❤️ Auto Like Status: ${userConfig.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}
│ ⏺️ Auto Recording: ${userConfig.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}
│ 🔘 Interactive Buttons: ${userConfig.BUTTONS_ENABLED === 'true' ? '✅ ON' : '❌ OFF'}
└──────────────────────────┘

🛠️ GETTING STARTED:
┌──────────────────────────┐
│ 1. Type ${userConfig.PREFIX}menu
│ 2. Explore all features
│ 3. Download media
│ 4. Get news updates
│ 5. Chat with AI
└──────────────────────────┘

💡 QUICK TIPS:
┌──────────────────────────┐
│ 📱 Use ${userConfig.PREFIX}help for help
│ ⚙️ Use ${userConfig.PREFIX}settings to customize
| 🗑️ Use ${userConfig.PREFIX}deleteme to remove
│ 📞 Contact owner for issues
└──────────────────────────┘

🔗 IMPORTANT LINKS:
┌──────────────────────────┐
│ 📢 Channel: ${defaultConfig.CHANNEL_LINK}
│ 👥 Group: ${defaultConfig.GROUP_INVITE_LINK}
│ 👑 Owner: ${defaultConfig.OWNER_NUMBER}
└──────────────────────────┘
`;

                    await socket.sendMessage(userJid, {
                        image: { url: userConfig.USER_LOGO_ENABLED === 'true' && userConfig.USER_CUSTOM_LOGO ? userConfig.USER_CUSTOM_LOGO : defaultConfig.RCD_IMAGE_PATH },
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
    otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + defaultConfig.OTP_EXPIRY, newConfig });

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
                image: { url: defaultConfig.RCD_IMAGE_PATH },
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
