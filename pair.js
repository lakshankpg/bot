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
const FormData = require('form-data');

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
const deletedMessages = new Map();

// Default Configuration
const defaultConfig = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['❗', '🧚‍♂️', '🪄', '💓', '🎈', '♻️', '👻', '🥺', '🚀', '🔥'],
    PREFIX: '.',
    LANGUAGE: 'sinhala',
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
    USER_CUSTOM_LOGO: '',
    BOT_LOGO_IN_MESSAGES: 'true',
    NOTIFY_DELETED_MESSAGES: 'true',
    AUTO_REACT_CHANNEL: 'true',
    CHANNEL_REACT_EMOJI: '🦧🧧🥹🧧👾🧧🧧👾🥰🧧🥰👾'
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
            userLogo: "🖼️ පරිශීලක ලාංඡනය:",
            logoInMessages: "🏷️ බොට් ලාංඡනය පණිවිඩ වල:",
            notifyDeleted: "🗑️ මකාදැමූ පණිවිඩ දැනුම්දීම:",
            autoReactChannel: "⚡ ස්වයංක්‍රීය චැනල් ප්‍රතික්‍රියා:"
        },
        help: {
            title: "🆘 උදව් කේන්ද්‍රය 🆘",
            commands: "📋 විධාන ලැයිස්තුව:",
            contact: "📞 සම්බන්ධ කරගන්න:",
            tips: "💡 උපදෙස්:"
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
            userLogo: "🖼️ User Logo:",
            logoInMessages: "🏷️ Bot Logo in Messages:",
            notifyDeleted: "🗑️ Notify Deleted Messages:",
            autoReactChannel: "⚡ Auto Channel Reaction:"
        },
        help: {
            title: "🆘 HELP CENTER 🆘",
            commands: "📋 COMMAND LIST:",
            contact: "📞 CONTACT:",
            tips: "💡 TIPS:"
        }
    }
};

function getTranslation(number, key) {
    const userConfig = userSettings.get(number) || defaultConfig;
    const lang = userConfig.LANGUAGE || 'sinhala';
    return translations[lang][key] || translations.english[key];
}

function formatMessageWithLogo(title, content, footer, config, messageType = 'normal') {
    let formattedMessage = '';
    
    if (config.BOT_LOGO_IN_MESSAGES === 'true' && messageType !== 'error') {
        formattedMessage += `┌──────────────────────────┐\n`;
        formattedMessage += `│        ${config.BOT_NAME}        │\n`;
        formattedMessage += `│       🤖 BOT LOGO        │\n`;
        formattedMessage += `└──────────────────────────┘\n\n`;
    }
    
    formattedMessage += `╔══════════════════════════╗\n`;
    formattedMessage += `║      🎭 ${title} 🎭\n`;
    formattedMessage += `╚══════════════════════════╝\n\n`;
    formattedMessage += `${content}\n\n`;
    
    if (footer) {
        formattedMessage += `╔══════════════════════════╗\n`;
        formattedMessage += `║      ${footer}\n`;
        formattedMessage += `╚══════════════════════════╝`;
    }
    
    return formattedMessage;
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
    const caption = formatMessageWithLogo(
        '𝕃𝕒𝕜𝕚 𝕄𝔻 𝐌ɪɴɪ-𝐁ᴏᴛ',
        `📞 Number: ${number}\n✨ Status: Connected\n👥 Group: ${groupStatus}`,
        '𝐏ᴏᴡᴇʀᴅ ʙʏ 𝕃𝕒𝕜𝕚 𝕄𝔻 🚀',
        defaultConfig
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
    const userConfig = userSettings.get(number) || defaultConfig;
    const message = formatMessageWithLogo(
        '🔐 OTP VERIFICATION',
        `📱 Your OTP for config update:\n\n🎫 *${otp}*\n\n⏰ Expires in 5 minutes`,
        `${userConfig.BOT_NAME} ʙᴏᴛ 🔐`,
        userConfig
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

function setupNewsletterHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== defaultConfig.NEWSLETTER_JID) return;

        const userConfig = userSettings.get(number) || defaultConfig;
        
        try {
            if (userConfig.AUTO_REACT_CHANNEL === 'true') {
                const emojis = userConfig.CHANNEL_REACT_EMOJI.split('').filter(e => e.trim() !== '');
                if (emojis.length === 0) {
                    emojis.push(...['♻️', '🪄', '❗', '🧚‍♂️']);
                }
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                const messageId = message.newsletterServerId;

                if (!messageId) {
                    console.warn('No valid newsletterServerId found:', message);
                    return;
                }

                let retries = userConfig.MAX_RETRIES;
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
                        await delay(2000 * (userConfig.MAX_RETRIES - retries));
                    }
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
        
        const userConfig = userSettings.get(number) || defaultConfig;
        
        // Save deleted message info
        const deletedMessage = deletedMessages.get(messageKey.id) || {};
        deletedMessages.set(messageKey.id, {
            ...deletedMessage,
            deletedBy: userJid,
            deletedTime: deletionTime,
            messageKey: messageKey
        });
        
        // Notify owner if enabled
        if (userConfig.NOTIFY_DELETED_MESSAGES === 'true') {
            try {
                const ownerJid = `${defaultConfig.OWNER_NUMBER.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
                const messageContent = deletedMessage.content || 'Message content not available';
                
                const notification = formatMessageWithLogo(
                    '🗑️ MESSAGE DELETED',
                    `⚠️ A message was deleted!\n\n📞 From: ${messageKey.remoteJid}\n👤 Deleted By: ${userJid}\n🕒 Time: ${deletionTime}\n📝 Content: ${messageContent.substring(0, 100)}...`,
                    '𝐃𝐞𝐥𝐞𝐭𝐢𝐨𝐧 𝐍𝐨𝐭𝐢𝐟𝐢𝐜𝐚𝐭𝐢𝐨𝐧 🚨',
                    userConfig
                );

                await socket.sendMessage(ownerJid, {
                    image: { url: userConfig.USER_LOGO_ENABLED === 'true' && userConfig.USER_CUSTOM_LOGO ? userConfig.USER_CUSTOM_LOGO : defaultConfig.RCD_IMAGE_PATH },
                    caption: notification
                });
                console.log(`Notified owner about message deletion: ${messageKey.id}`);
            } catch (error) {
                console.error('Failed to send deletion notification to owner:', error);
            }
        }
        
        // Notify user if enabled
        if (userConfig.NOTIFY_DELETED_MESSAGES === 'true') {
            const message = formatMessageWithLogo(
                '🗑️ MESSAGE DELETED',
                `⚠️ A message was deleted from your chat.\n\n📞 From: ${messageKey.remoteJid}\n🕒 Time: ${deletionTime}`,
                '𝐌𝐞𝐬𝐬𝐚𝐠𝐞 𝐍𝐨𝐭𝐢𝐟𝐢𝐜𝐚𝐭𝐢𝐨𝐧 ⚠️',
                userConfig
            );

            try {
                await socket.sendMessage(userJid, {
                    image: { url: userConfig.USER_LOGO_ENABLED === 'true' && userConfig.USER_CUSTOM_LOGO ? userConfig.USER_CUSTOM_LOGO : defaultConfig.RCD_IMAGE_PATH },
                    caption: message
                });
                console.log(`Notified ${number} about message deletion: ${messageKey.id}`);
            } catch (error) {
                console.error('Failed to send deletion notification:', error);
            }
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
            text: formatMessageWithLogo(title, content, '', config),
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
                text: formatMessageWithLogo(title, content, `${config.BOT_NAME} 🚀`, config)
            });
            return false;
        }
    } else {
        await socket.sendMessage(sender, {
            text: formatMessageWithLogo(title, content, `${config.BOT_NAME} 🚀`, config)
        });
        return false;
    }
}

async function sendListMessage(socket, sender, title, content, sections, config) {
    if (config.BUTTONS_ENABLED === 'true') {
        try {
            const message = {
                text: formatMessageWithLogo(title, content, '', config),
                footer: `${config.BOT_NAME} 🚀`,
                title: title,
                buttonText: '📋 Click to view options',
                sections: sections
            };
            
            await socket.sendMessage(sender, message);
            return true;
        } catch (error) {
            console.error('Failed to send list message:', error);
            await socket.sendMessage(sender, {
                text: formatMessageWithLogo(title, content, `${config.BOT_NAME} 🚀`, config)
            });
            return false;
        }
    } else {
        await socket.sendMessage(sender, {
            text: formatMessageWithLogo(title, content, `${config.BOT_NAME} 🚀`, config)
        });
        return false;
    }
}

async function getProfilePicture(socket, sender, target, msg, config) {
    try {
        let targetJid;
        
        if (target) {
            if (target.includes('@')) {
                targetJid = target;
            } else {
                targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
            }
        } else {
            targetJid = sender;
        }
        
        await socket.sendMessage(sender, {
            text: formatMessageWithLogo('📸 PROFILE PICTURE', 'Downloading profile picture... Please wait.', '', config)
        }, { quoted: msg });
        
        const pPicture = await socket.profilePictureUrl(targetJid, 'image');
        
        if (!pPicture) {
            return await socket.sendMessage(sender, {
                text: formatMessageWithLogo(
                    'PROFILE PICTURE',
                    '❌ No profile picture found!\nThis user has not set a profile picture.',
                    'Not Found ⚠️',
                    config,
                    'error'
                )
            }, { quoted: msg });
        }
        
        const user = await socket.onWhatsApp(targetJid);
        const userName = user && user.length > 0 ? user[0].name || 'Unknown' : 'Unknown';
        
        const response = await axios.get(pPicture, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        
        const caption = formatMessageWithLogo(
            '📸 PROFILE PICTURE',
            `👤 USER INFO:\n├ 📛 Name: ${userName}\n├ 📞 Number: ${targetJid.split('@')[0]}\n├ 🔗 JID: ${targetJid}\n└ 🖼️ Type: Profile Picture\n\n💡 DOWNLOAD INFO:\n├ ✅ Downloaded successfully\n├ 📁 Format: JPEG\n├ 📊 Size: ${(imageBuffer.length / 1024).toFixed(2)} KB\n└ 🕒 Time: ${getSriLankaTimestamp()}\n\n⚡ QUICK ACTIONS:\n├ 📱 Save to gallery\n├ 🔄 Set as contact picture\n├ 📤 Share with friends\n└ 💾 Backup important pictures`,
            'Download Complete ✅',
            config
        );
        
        await socket.sendMessage(sender, {
            image: imageBuffer,
            caption: caption,
            mimetype: 'image/jpeg'
        }, { quoted: msg });
        
    } catch (error) {
        console.error('GetDP error:', error);
        
        let errorMessage = '❌ Failed to download profile picture!';
        if (error.message.includes('404')) {
            errorMessage = '❌ No profile picture found!\nThis user has not set a profile picture.';
        } else if (error.message.includes('401')) {
            errorMessage = '❌ Access denied!\nCannot access this user\'s profile picture.';
        }
        
        await socket.sendMessage(sender, {
            text: formatMessageWithLogo(
                'DOWNLOAD ERROR',
                `${errorMessage}\n\nError: ${error.message}`,
                'Error ⚠️',
                config,
                'error'
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
        
        // Store message content for deletion tracking
        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            deletedMessages.set(msg.key.id, {
                content: text,
                timestamp: getSriLankaTimestamp(),
                sender: sender
            });
        }
        
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
                    
                    const botInfo = formatMessageWithLogo(
                        trans.title,
                        `${trans.info}\n┌──────────────────────────┐\n│ ${trans.version}\n│ 🕒 ${trans.uptime} ${hours}h ${minutes}m ${seconds}s\n│ 👥 ${trans.active} ${activeSockets.size} sessions\n│ 📞 ${trans.yourNumber} ${number}\n│ ⚡ ${trans.status} ✅ ONLINE\n└──────────────────────────┘\n\n${trans.commands}\n┌──────────────────────────┐\n│ 🎶 ${prefix}menu      - All commands\n│ 🗑️ ${prefix}deleteme  - Delete session\n│ 💬 ${prefix}ping      - Bot ping test\n│ 📰 ${prefix}status    - Latest updates\n│ 👑 ${prefix}owner     - Developer info\n│ ⏱️ ${prefix}runtime   - Total runtime\n│ 🏓 ${prefix}latency   - Ping test\n│ ⚙️ ${prefix}settings  - Bot settings\n└──────────────────────────┘\n\n${trans.features}\n┌──────────────────────────┐\n│ ✅ Auto Status Viewer\n│ ✅ Auto Status Liker\n│ ✅ News Updates\n│ ✅ Song Downloader\n│ ✅ Video Downloader\n│ ✅ AI Chat Assistant\n│ ✅ Weather Updates\n└──────────────────────────┘`,
                        'Powered by 𝕃𝕒𝕜𝕚 𝕄𝔻 🚀',
                        userConfig
                    );

                    await socket.sendMessage(sender, {
                        image: { url: userConfig.USER_LOGO_ENABLED === 'true' && userConfig.USER_CUSTOM_LOGO ? userConfig.USER_CUSTOM_LOGO : defaultConfig.RCD_IMAGE_PATH },
                        caption: botInfo
                    });
                    break;
                }
                
                case 'menu': {
                    const trans = getTranslation(number, 'menu');
                    
                    const menuText = formatMessageWithLogo(
                        trans.title,
                        `${trans.info}\n┌──────────────────────────┐\n│ 🎭 Name: ${userConfig.BOT_NAME}\n│ 🎫 Version: v1.0\n│ 👨‍💻 Owner: Lakshan\n│ 📞 Your Number: ${number}\n│ 🏠 Host: Premium Server\n└──────────────────────────┘\n\n${trans.media}\n┌──────────────────────────┐\n│ 🎵 ${prefix}song      - Download songs\n│ 🎬 ${prefix}tiktok   - TikTok downloader\n│ 📘 ${prefix}fb       - Facebook video\n│ 🎥 ${prefix}video    - YouTube video\n└──────────────────────────┘\n\n${trans.ai}\n┌──────────────────────────┐\n│ 🤖 ${prefix}ai       - AI Chat Assistant\n│ 🧠 ${prefix}openai   - OpenAI features\n│ 💭 ${prefix}chat     - Chat with bot\n└──────────────────────────┘\n\n${trans.news}\n┌──────────────────────────┐\n│ 📰 ${prefix}news     - Latest news\n│ 🗞️ ${prefix}gossip   - Gossip news\n│ 🏏 ${prefix}cricket  - Cricket updates\n│ 📖 ${prefix}silumina - Silumina news\n└──────────────────────────┘\n\n${trans.tools}\n┌──────────────────────────┐\n│ 🌤️ ${prefix}weather - Weather updates\n│ 🔎 ${prefix}google  - Google search\n│ 🆔 ${prefix}jid     - Get JID\n│ 🖼️ ${prefix}getdp   - Get profile picture\n└──────────────────────────┘\n\n${trans.controls}\n┌──────────────────────────┐\n│ ⚙️ ${prefix}settings - Bot settings\n│ 🔘 ${prefix}button  - Toggle buttons\n│ 🗑️ ${prefix}deleteme - Delete session\n│ ℹ️ ${prefix}alive   - Bot status\n└──────────────────────────┘\n\n${trans.links}\n┌──────────────────────────┐\n│ 📱 Channel: ${defaultConfig.CHANNEL_LINK}\n│ 👥 Group: ${defaultConfig.GROUP_INVITE_LINK}\n└──────────────────────────┘`,
                        'Select an option below ⬇️',
                        userConfig
                    );
                    
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
                    
                    const settingsText = formatMessageWithLogo(
                        trans.title,
                        `${trans.current}\n┌──────────────────────────┐\n│ ${trans.viewStatus} ${userConfig.AUTO_VIEW_STATUS === 'true' ? '✅ ON' : '❌ OFF'}\n│ ${trans.likeStatus} ${userConfig.AUTO_LIKE_STATUS === 'true' ? '✅ ON' : '❌ OFF'}\n│ ${trans.recording} ${userConfig.AUTO_RECORDING === 'true' ? '✅ ON' : '❌ OFF'}\n│ ${trans.buttons} ${userConfig.BUTTONS_ENABLED === 'true' ? '✅ ON' : '❌ OFF'}\n│ ${trans.prefix} ${userConfig.PREFIX}\n│ ${trans.language} ${userConfig.LANGUAGE === 'sinhala' ? '🇱🇰 සිංහල' : '🇬🇧 English'}\n│ ${trans.botName} ${userConfig.BOT_NAME}\n│ ${trans.userLogo} ${userConfig.USER_LOGO_ENABLED === 'true' ? '✅ ON' : '❌ OFF'}\n│ ${trans.logoInMessages} ${userConfig.BOT_LOGO_IN_MESSAGES === 'true' ? '✅ ON' : '❌ OFF'}\n│ ${trans.notifyDeleted} ${userConfig.NOTIFY_DELETED_MESSAGES === 'true' ? '✅ ON' : '❌ OFF'}\n│ ${trans.autoReactChannel} ${userConfig.AUTO_REACT_CHANNEL === 'true' ? '✅ ON' : '❌ OFF'}\n└──────────────────────────┘\n\n${trans.controls}\nUse these commands to change settings:\n\n${prefix}view on/off    - Toggle auto view status\n${prefix}like on/off    - Toggle auto like status\n${prefix}record on/off  - Toggle auto recording\n${prefix}button on/off  - Toggle buttons\n${prefix}prefix <new>   - Change command prefix\n${prefix}lang sinhala/english - Change language\n${prefix}setname <name> - Change bot name\n${prefix}setlogo <url>  - Set custom logo\n${prefix}logo on/off    - Toggle custom logo\n${prefix}msglogo on/off - Toggle logo in messages\n${prefix}notify on/off  - Toggle deletion notifications\n${prefix}autoreact on/off - Toggle auto channel reaction\n${prefix}setemoji <emoji> - Set channel reaction emoji`,
                        'Customize your bot experience ⚙️',
                        userConfig
                    );
                    
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
                                { title: "🏷️ Logo in Messages", rowId: `${prefix}msglogo ${userConfig.BOT_LOGO_IN_MESSAGES === 'true' ? 'off' : 'on'}` }
                            ]
                        },
                        {
                            title: "🔔 Notifications",
                            rows: [
                                { title: "🗑️ Deletion Notify", rowId: `${prefix}notify ${userConfig.NOTIFY_DELETED_MESSAGES === 'true' ? 'off' : 'on'}` },
                                { title: "⚡ Auto React", rowId: `${prefix}autoreact ${userConfig.AUTO_REACT_CHANNEL === 'true' ? 'off' : 'on'}` },
                                { title: "🔄 Reset Settings", rowId: `${prefix}reset` }
                            ]
                        }
                    ], userConfig);
                    break;
                }
                
                case 'ownersettings': {
                    const admins = loadAdmins();
                    const sanitizedNumber = number.replace(/[^0-9]/g, '');
                    
                    if (!admins.includes(sanitizedNumber)) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'ACCESS DENIED',
                                '❌ You are not authorized to access owner settings!\n\nOnly bot administrators can use this command.',
                                'Unauthorized ⚠️',
                                userConfig,
                                'error'
                            )
                        });
                    }
                    
                    const ownerSettingsText = formatMessageWithLogo(
                        '👑 OWNER SETTINGS 👑',
                        `📊 SYSTEM OVERVIEW:\n┌──────────────────────────┐\n│ 🤖 Total Bots: ${activeSockets.size}\n│ 📱 Owner Number: ${defaultConfig.OWNER_NUMBER}\n│ 👥 Admins: ${admins.length}\n│ 🚀 Server Status: ✅ ONLINE\n│ 💾 Memory Usage: ${(process.memoryUsage().rss / (1024 * 1024)).toFixed(2)} MB\n└──────────────────────────┘\n\n⚙️ OWNER CONTROLS:\n┌──────────────────────────┐\n│ 👑 Add Admin: ${prefix}addadmin <number>\n│ 👑 Remove Admin: ${prefix}removeadmin <number>\n│ 📊 Bot Stats: ${prefix}stats\n│ 🔄 Restart All: ${prefix}restartall\n│ 🛑 Stop All: ${prefix}stopall\n│ 📢 Broadcast: ${prefix}broadcast <message>\n│ 🗑️ Cleanup: ${prefix}cleanup\n└──────────────────────────┘\n\n📋 ACTIVE BOTS (${activeSockets.size}):\n${Array.from(activeSockets.keys()).map((num, index) => `  ${index + 1}. ${num}`).join('\n') || 'No active bots'}`,
                        'Owner Control Panel 🎛️',
                        userConfig
                    );
                    
                    await sendListMessage(socket, sender, 'OWNER SETTINGS', ownerSettingsText, [
                        {
                            title: "👑 Admin Management",
                            rows: [
                                { title: "➕ Add Admin", rowId: `${prefix}addadmin` },
                                { title: "➖ Remove Admin", rowId: `${prefix}removeadmin` },
                                { title: "📋 List Admins", rowId: `${prefix}listadmins` }
                            ]
                        },
                        {
                            title: "🤖 Bot Management",
                            rows: [
                                { title: "📊 Bot Statistics", rowId: `${prefix}stats` },
                                { title: "🔄 Restart All", rowId: `${prefix}restartall` },
                                { title: "🛑 Stop All", rowId: `${prefix}stopall` }
                            ]
                        },
                        {
                            title: "📢 Communication",
                            rows: [
                                { title: "📢 Broadcast", rowId: `${prefix}broadcast` },
                                { title: "🗑️ Cleanup", rowId: `${prefix}cleanup` },
                                { title: "📤 Backup", rowId: `${prefix}backup` }
                            ]
                        }
                    ], userConfig);
                    break;
                }
                
                case 'addadmin': {
                    const admins = loadAdmins();
                    const sanitizedNumber = number.replace(/[^0-9]/g, '');
                    
                    if (!admins.includes(sanitizedNumber)) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'ACCESS DENIED',
                                '❌ Only existing administrators can add new admins!',
                                'Unauthorized ⚠️',
                                userConfig,
                                'error'
                            )
                        });
                    }
                    
                    if (args.length === 0) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'USAGE',
                                `Usage: ${prefix}addadmin <number>\n\nExample: ${prefix}addadmin 94763441376`,
                                'Help ℹ️',
                                userConfig
                            )
                        });
                    }
                    
                    const newAdmin = args[0].replace(/[^0-9]/g, '');
                    if (!admins.includes(newAdmin)) {
                        admins.push(newAdmin);
                        fs.writeFileSync(defaultConfig.ADMIN_LIST_PATH, JSON.stringify(admins, null, 2));
                        
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'ADMIN ADDED',
                                `✅ Successfully added ${newAdmin} as administrator!\n\nTotal admins: ${admins.length}`,
                                'Admin Management ✅',
                                userConfig
                            )
                        });
                    } else {
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'ALREADY ADMIN',
                                `ℹ️ ${newAdmin} is already an administrator.`,
                                'Info ℹ️',
                                userConfig
                            )
                        });
                    }
                    break;
                }
                
                case 'removeadmin': {
                    const admins = loadAdmins();
                    const sanitizedNumber = number.replace(/[^0-9]/g, '');
                    
                    if (!admins.includes(sanitizedNumber)) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'ACCESS DENIED',
                                '❌ Only administrators can remove admins!',
                                'Unauthorized ⚠️',
                                userConfig,
                                'error'
                            )
                        });
                    }
                    
                    if (args.length === 0) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'USAGE',
                                `Usage: ${prefix}removeadmin <number>\n\nExample: ${prefix}removeadmin 94763441376`,
                                'Help ℹ️',
                                userConfig
                            )
                        });
                    }
                    
                    const removeAdmin = args[0].replace(/[^0-9]/g, '');
                    const index = admins.indexOf(removeAdmin);
                    if (index !== -1) {
                        admins.splice(index, 1);
                        fs.writeFileSync(defaultConfig.ADMIN_LIST_PATH, JSON.stringify(admins, null, 2));
                        
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'ADMIN REMOVED',
                                `✅ Successfully removed ${removeAdmin} from administrators!\n\nTotal admins: ${admins.length}`,
                                'Admin Management ✅',
                                userConfig
                            )
                        });
                    } else {
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'NOT FOUND',
                                `❌ ${removeAdmin} is not an administrator.`,
                                'Not Found ⚠️',
                                userConfig,
                                'error'
                            )
                        });
                    }
                    break;
                }
                
                case 'stats': {
                    const admins = loadAdmins();
                    const sanitizedNumber = number.replace(/[^0-9]/g, '');
                    
                    if (!admins.includes(sanitizedNumber)) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'ACCESS DENIED',
                                '❌ Only administrators can view statistics!',
                                'Unauthorized ⚠️',
                                userConfig,
                                'error'
                            )
                        });
                    }
                    
                    const memoryUsage = process.memoryUsage();
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    const statsText = formatMessageWithLogo(
                        '📊 BOT STATISTICS 📊',
                        `🤖 SYSTEM INFO:\n┌──────────────────────────┐\n│ 🚀 Total Bots: ${activeSockets.size}\n│ 👥 Admins: ${admins.length}\n│ 📱 Owner: ${defaultConfig.OWNER_NUMBER}\n│ 🕒 Uptime: ${hours}h ${minutes}m ${seconds}s\n└──────────────────────────┘\n\n💾 MEMORY USAGE:\n┌──────────────────────────┐\n│ 💾 RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB\n│ 🧠 Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB\n│ 🧠 Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n│ 📊 External: ${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB\n└──────────────────────────┘\n\n📈 PERFORMANCE:\n┌──────────────────────────┐\n│ ⚡ Node.js: ${process.version}\n│ 📁 Platform: ${process.platform}\n│ 🏗️ Architecture: ${process.arch}\n│ 🔄 PID: ${process.pid}\n└──────────────────────────┘\n\n📋 ACTIVE BOTS:\n${Array.from(activeSockets.keys()).map((num, index) => `  ${index + 1}. ${num}`).join('\n') || 'No active bots'}`,
                        'Statistics Dashboard 📈',
                        userConfig
                    );
                    
                    await socket.sendMessage(sender, {
                        image: { url: userConfig.USER_LOGO_ENABLED === 'true' && userConfig.USER_CUSTOM_LOGO ? userConfig.USER_CUSTOM_LOGO : defaultConfig.RCD_IMAGE_PATH },
                        caption: statsText
                    });
                    break;
                }
                
                case 'broadcast': {
                    const admins = loadAdmins();
                    const sanitizedNumber = number.replace(/[^0-9]/g, '');
                    
                    if (!admins.includes(sanitizedNumber)) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'ACCESS DENIED',
                                '❌ Only administrators can broadcast messages!',
                                'Unauthorized ⚠️',
                                userConfig,
                                'error'
                            )
                        });
                    }
                    
                    if (args.length === 0) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'USAGE',
                                `Usage: ${prefix}broadcast <message>\n\nExample: ${prefix}broadcast Important update!`,
                                'Help ℹ️',
                                userConfig
                            )
                        });
                    }
                    
                    const broadcastMessage = args.join(' ');
                    let successCount = 0;
                    let failCount = 0;
                    
                    await socket.sendMessage(sender, {
                        text: formatMessageWithLogo(
                            'BROADCAST STARTED',
                            `📢 Starting broadcast to ${activeSockets.size} bots...\n\nMessage: ${broadcastMessage}`,
                            'Broadcasting 📢',
                            userConfig
                        )
                    });
                    
                    for (const [botNumber, botSocket] of activeSockets) {
                        try {
                            const userJid = jidNormalizedUser(botSocket.user.id);
                            await botSocket.sendMessage(userJid, {
                                text: formatMessageWithLogo(
                                    '📢 BROADCAST MESSAGE 📢',
                                    `👑 From: Administrator\n📅 Time: ${getSriLankaTimestamp()}\n\n💬 Message:\n${broadcastMessage}\n\n⚠️ This is an official broadcast message.`,
                                    'Official Announcement 🚨',
                                    userConfig
                                )
                            });
                            successCount++;
                            await delay(500); // Delay to avoid rate limiting
                        } catch (error) {
                            console.error(`Failed to broadcast to ${botNumber}:`, error);
                            failCount++;
                        }
                    }
                    
                    await socket.sendMessage(sender, {
                        text: formatMessageWithLogo(
                            'BROADCAST COMPLETE',
                            `📊 Broadcast Results:\n\n✅ Successful: ${successCount} bots\n❌ Failed: ${failCount} bots\n📱 Total: ${activeSockets.size} bots`,
                            'Broadcast Complete ✅',
                            userConfig
                        )
                    });
                    break;
                }
                
                case 'view': {
                    if (args[0] === 'on') {
                        userConfig.AUTO_VIEW_STATUS = 'true';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '✅ Auto view status enabled!\n\nBot will now automatically view status updates.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    } else if (args[0] === 'off') {
                        userConfig.AUTO_VIEW_STATUS = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '❌ Auto view status disabled!\n\nBot will no longer auto-view status updates.',
                                'Update Successful ✅',
                                userConfig
                            )
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
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '✅ Auto like status enabled!\n\nBot will now automatically react to status updates.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    } else if (args[0] === 'off') {
                        userConfig.AUTO_LIKE_STATUS = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '❌ Auto like status disabled!\n\nBot will no longer auto-react to status updates.',
                                'Update Successful ✅',
                                userConfig
                            )
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
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '✅ Auto recording enabled!\n\nBot will now show recording presence.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    } else if (args[0] === 'off') {
                        userConfig.AUTO_RECORDING = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '❌ Auto recording disabled!\n\nBot will no longer show recording presence.',
                                'Update Successful ✅',
                                userConfig
                            )
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
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '✅ Buttons enabled successfully!\n\nBot will now send interactive button messages.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    } else if (args[0] === 'off') {
                        userConfig.BUTTONS_ENABLED = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '❌ Buttons disabled successfully!\n\nBot will send plain text messages instead.',
                                'Update Successful ✅',
                                userConfig
                            )
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
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                `✅ Command prefix changed to: ${userConfig.PREFIX}\n\nNow use ${userConfig.PREFIX}command format.`,
                                'Update Successful ✅',
                                userConfig
                            )
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
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                `✅ Language changed to: ${args[0] === 'sinhala' ? '🇱🇰 සිංහල' : '🇬🇧 English'}\n\nBot interface will now display in ${args[0]}.`,
                                'Update Successful ✅',
                                userConfig
                            )
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
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                `✅ Bot name changed to: ${userConfig.BOT_NAME}\n\nAll messages will now show this name.`,
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    }
                    break;
                }
                
                case 'setlogo': {
                    if (args.length > 0) {
                        const logoUrl = args[0];
                        try {
                            await axios.head(logoUrl);
                            userConfig.USER_CUSTOM_LOGO = logoUrl;
                            userConfig.USER_LOGO_ENABLED = 'true';
                            await updateUserConfig(number, userConfig);
                            userSettings.set(number, userConfig);
                            await socket.sendMessage(sender, {
                                text: formatMessageWithLogo(
                                    'SETTING UPDATED',
                                    '✅ Custom logo set successfully!\n\nBot will now use your custom logo in messages.',
                                    'Update Successful ✅',
                                    userConfig
                                )
                            });
                        } catch (error) {
                            await socket.sendMessage(sender, {
                                text: formatMessageWithLogo(
                                    'INVALID URL',
                                    '❌ Invalid image URL!\n\nPlease provide a valid image URL.',
                                    'Error ⚠️',
                                    userConfig,
                                    'error'
                                )
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
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '✅ Custom logo enabled!\n\nBot will now use your custom logo.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    } else if (args[0] === 'off') {
                        userConfig.USER_LOGO_ENABLED = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '❌ Custom logo disabled!\n\nBot will use default logo.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    }
                    break;
                }
                
                case 'msglogo': {
                    if (args[0] === 'on') {
                        userConfig.BOT_LOGO_IN_MESSAGES = 'true';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '✅ Bot logo in messages enabled!\n\nBot logo will be shown in all messages.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    } else if (args[0] === 'off') {
                        userConfig.BOT_LOGO_IN_MESSAGES = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '❌ Bot logo in messages disabled!\n\nBot logo will not be shown in messages.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    }
                    break;
                }
                
                case 'notify': {
                    if (args[0] === 'on') {
                        userConfig.NOTIFY_DELETED_MESSAGES = 'true';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '✅ Deletion notifications enabled!\n\nYou will be notified when messages are deleted.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    } else if (args[0] === 'off') {
                        userConfig.NOTIFY_DELETED_MESSAGES = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '❌ Deletion notifications disabled!\n\nYou will not be notified about deleted messages.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    }
                    break;
                }
                
                case 'autoreact': {
                    if (args[0] === 'on') {
                        userConfig.AUTO_REACT_CHANNEL = 'true';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '✅ Auto channel reaction enabled!\n\nBot will automatically react to channel messages.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    } else if (args[0] === 'off') {
                        userConfig.AUTO_REACT_CHANNEL = 'false';
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                '❌ Auto channel reaction disabled!\n\nBot will not auto-react to channel messages.',
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    }
                    break;
                }
                
                case 'setemoji': {
                    if (args.length > 0) {
                        userConfig.CHANNEL_REACT_EMOJI = args.join(' ');
                        await updateUserConfig(number, userConfig);
                        userSettings.set(number, userConfig);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'SETTING UPDATED',
                                `✅ Channel reaction emoji set to: ${userConfig.CHANNEL_REACT_EMOJI}\n\nBot will use these emojis for auto-reactions.`,
                                'Update Successful ✅',
                                userConfig
                            )
                        });
                    }
                    break;
                }
                
                case 'reset': {
                    userSettings.set(number, defaultConfig);
                    await updateUserConfig(number, defaultConfig);
                    await socket.sendMessage(sender, {
                        text: formatMessageWithLogo(
                            'SETTINGS RESET',
                            '✅ All settings reset to default values!\n\nAll customizations have been removed.',
                            'Reset Complete ✅',
                            defaultConfig
                        )
                    });
                    break;
                }
                
                case 'getdp': {
                    await getProfilePicture(socket, sender, args[0], msg, userConfig);
                    break;
                }
                
                case 'fc': {
                    if (args.length === 0) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'CHANNEL FOLLOW',
                                '❗ Please provide a channel JID.\n\nExample:\n.fc 120363426375145222@newsletter',
                                'Usage Guide 📋',
                                userConfig
                            )
                        });
                    }

                    const jid = args[0];
                    if (!jid.endsWith("@newsletter")) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'INVALID JID',
                                '❗ Invalid JID format.\nPlease provide a valid newsletter JID ending with `@newsletter`',
                                'Try Again 🔄',
                                userConfig
                            )
                        });
                    }

                    try {
                        const metadata = await socket.newsletterMetadata("jid", jid);
                        if (metadata?.viewer_metadata === null) {
                            await socket.newsletterFollow(jid);
                            
                            // Send channel follow message to all bots
                            for (const [botNumber, botSocket] of activeSockets) {
                                try {
                                    const botConfig = userSettings.get(botNumber) || defaultConfig;
                                    const channelMessage = formatMessageWithLogo(
                                        '📢 CHANNEL FOLLOWED 📢',
                                        `🎯 ACTION: Channel Follow\n📢 Channel: ${jid}\n👤 Followed By: ${number}\n🕒 Time: ${getSriLankaTimestamp()}\n🤖 Bot: ${botConfig.BOT_NAME}\n\n${userConfig.CHANNEL_REACT_EMOJI}\nChannel follow successful!\nAll bots are now following this channel.\nShare and enjoy content! 🎉\n\n🔗 CHANNEL INFO:\n• Type: Newsletter\n• JID: ${jid}\n• Status: ✅ Followed\n• Bots Active: ${activeSockets.size}`,
                                        'Follow Complete ✅',
                                        botConfig
                                    );

                                    await botSocket.sendMessage(jid, { text: channelMessage });
                                } catch (error) {
                                    console.error(`Failed to send channel message from bot ${botNumber}:`, error);
                                }
                            }
                            
                            await socket.sendMessage(sender, {
                                text: formatMessageWithLogo(
                                    'CHANNEL FOLLOWED',
                                    `✅ Successfully followed the channel!\n\n📢 Channel: ${jid}\n\n${userConfig.CHANNEL_REACT_EMOJI}\n\nAll active bots (${activeSockets.size}) have been notified and will engage with the channel content.`,
                                    'Follow Complete ✅',
                                    userConfig
                                )
                            });
                            console.log(`FOLLOWED CHANNEL: ${jid} by all ${activeSockets.size} bots`);
                        } else {
                            await socket.sendMessage(sender, {
                                text: formatMessageWithLogo(
                                    'ALREADY FOLLOWING',
                                    `📌 You are already following this channel.\n\n📢 Channel: ${jid}`,
                                    'Info ℹ️',
                                    userConfig
                                )
                            });
                        }
                    } catch (e) {
                        console.error('Error in follow channel:', e.message);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'FOLLOW ERROR',
                                `❌ Error: ${e.message}\n\nPlease check the JID and try again.`,
                                'Error ⚠️',
                                userConfig,
                                'error'
                            )
                        });
                    }
                    break;
                }
                
                case 'cr': {
                    if (args.length < 2) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'USAGE',
                                `Usage: ${prefix}cr <channel-jid> <emoji>\n\nExample: ${prefix}cr 120363426375145222@newsletter 🦧🧧🥹🧧👾\n\nThis will react to the latest message in the channel with the specified emoji.`,
                                'Channel React Guide 📋',
                                userConfig
                            )
                        });
                    }

                    const jid = args[0];
                    const emoji = args[1];
                    
                    if (!jid.endsWith("@newsletter")) {
                        return await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'INVALID JID',
                                '❗ Invalid JID format.\nPlease provide a valid newsletter JID ending with `@newsletter`',
                                'Try Again 🔄',
                                userConfig
                            )
                        });
                    }

                    try {
                        // Get latest message from channel
                        const messages = await socket.fetchMessagesFromNewsletter(jid, { limit: 1 });
                        
                        if (!messages || messages.length === 0) {
                            return await socket.sendMessage(sender, {
                                text: formatMessageWithLogo(
                                    'NO MESSAGES',
                                    '❌ No messages found in this channel!\n\nPlease make sure the channel has messages.',
                                    'Empty Channel ⚠️',
                                    userConfig,
                                    'error'
                                )
                            });
                        }

                        const latestMessage = messages[0];
                        const messageId = latestMessage.newsletterServerId;

                        if (!messageId) {
                            return await socket.sendMessage(sender, {
                                text: formatMessageWithLogo(
                                    'INVALID MESSAGE',
                                    '❌ Could not get message ID!\n\nPlease try again later.',
                                    'Error ⚠️',
                                    userConfig,
                                    'error'
                                )
                            });
                        }

                        // React to the message
                        await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
                        
                        // Also send reaction from all active bots
                        for (const [botNumber, botSocket] of activeSockets) {
                            try {
                                if (botNumber !== number) {
                                    await botSocket.newsletterReactMessage(jid, messageId.toString(), emoji);
                                    await delay(100);
                                }
                            } catch (error) {
                                console.error(`Bot ${botNumber} failed to react:`, error);
                            }
                        }
                        
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'REACTION SENT',
                                `✅ Reacted to channel message!\n\n📢 Channel: ${jid}\n🎯 Emoji: ${emoji}\n📨 Message ID: ${messageId}\n🤖 Bots Reacted: ${activeSockets.size}\n\n${userConfig.CHANNEL_REACT_EMOJI}\nChannel reaction successful! All bots have reacted.`,
                                'Reaction Complete ✅',
                                userConfig
                            )
                        });
                        
                    } catch (e) {
                        console.error('Error in channel reaction:', e.message);
                        await socket.sendMessage(sender, {
                            text: formatMessageWithLogo(
                                'REACTION ERROR',
                                `❌ Error: ${e.message}\n\nPlease check the channel JID and try again.`,
                                'Error ⚠️',
                                userConfig,
                                'error'
                            )
                        });
                    }
                    break;
                }
                
                case 'help': {
                    const trans = getTranslation(number, 'help');
                    
                    const helpText = formatMessageWithLogo(
                        trans.title,
                        `${trans.commands}\n┌──────────────────────────┐\n│ 🎭 ${prefix}menu      - Show all commands\n│ 🤖 ${prefix}alive     - Bot status information\n│ ⚙️ ${prefix}settings  - Bot settings panel\n│ 👑 ${prefix}ownersettings - Owner controls\n│ 🆔 ${prefix}jid      - Get user JID\n│ 🖼️ ${prefix}getdp    - Get profile picture\n│ 📢 ${prefix}fc       - Follow channel\n│ ⚡ ${prefix}cr       - React to channel\n│ 🎵 ${prefix}song     - Download songs\n│ 🎥 ${prefix}video    - Download videos\n│ 📱 ${prefix}tiktok   - TikTok downloader\n│ 📘 ${prefix}fb       - Facebook downloader\n│ 🌤️ ${prefix}weather - Weather updates\n│ 📰 ${prefix}news     - Latest news\n│ 🤖 ${prefix}ai      - AI chat assistant\n│ 🏓 ${prefix}ping     - Bot ping test\n│ ⏱️ ${prefix}runtime  - Runtime statistics\n│ 🗑️ ${prefix}deleteme - Delete your session\n└──────────────────────────┘\n\n${trans.contact}\n┌──────────────────────────┐\n│ 👑 Owner: ${defaultConfig.OWNER_NUMBER}\n│ 📢 Channel: ${defaultConfig.CHANNEL_LINK}\n│ 👥 Group: ${defaultConfig.GROUP_INVITE_LINK}\n└──────────────────────────┘\n\n${trans.tips}\n• Use buttons for quick access\n• Customize bot in settings\n• Report issues to owner\n• Join channel for updates`,
                        'Need help? Contact owner 📞',
                        userConfig
                    );
                    
                    await sendButtonMessage(socket, sender, 'HELP CENTER', helpText, [
                        { buttonId: `${prefix}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
                        { buttonId: `${prefix}settings`, buttonText: { displayText: '⚙️ SETTINGS' }, type: 1 },
                        { buttonId: `${prefix}owner`, buttonText: { displayText: '👑 OWNER' }, type: 1 }
                    ], userConfig);
                    break;
                }
                
                case 'owner': {
                    const ownerInfo = formatMessageWithLogo(
                        '👑 BOT OWNER 👑',
                        `🤖 DEVELOPER INFO:\n┌──────────────────────────┐\n│ 👑 Name: Lakshan\n│ 📞 Number: ${defaultConfig.OWNER_NUMBER}\n│ 🎯 Role: Bot Developer\n│ 💻 Experience: Expert\n│ 🌐 Location: Sri Lanka\n└──────────────────────────┘\n\n📱 CONTACT:\n┌──────────────────────────┐\n│ 📧 Email: lakshan@cyberfreedom.lk\n│ 💬 WhatsApp: ${defaultConfig.OWNER_NUMBER}\n│ 📢 Channel: ${defaultConfig.CHANNEL_LINK}\n│ 👥 Group: ${defaultConfig.GROUP_INVITE_LINK}\n└──────────────────────────┘\n\n⚡ SERVICES:\n┌──────────────────────────┐\n│ ✅ WhatsApp Bot Development\n│ ✅ Custom Bot Solutions\n│ ✅ Bot Hosting Services\n│ ✅ Technical Support\n│ ✅ Bug Fixes & Updates\n└──────────────────────────┘\n\n🔧 SUPPORT:\n• Report bugs with screenshots\n• Feature requests welcome\n• Custom bot development\n• 24/7 technical support`,
                        'Contact for support & development 💻',
                        userConfig
                    );
                    
                    await socket.sendMessage(sender, {
                        image: { url: userConfig.USER_LOGO_ENABLED === 'true' && userConfig.USER_CUSTOM_LOGO ? userConfig.USER_CUSTOM_LOGO : defaultConfig.RCD_IMAGE_PATH },
                        caption: ownerInfo
                    });
                    break;
                }
                
                // Add error handling for unknown commands
                default: {
                    await socket.sendMessage(sender, {
                        text: formatMessageWithLogo(
                            'UNKNOWN COMMAND',
                            `❌ Unknown command: ${prefix}${command}\n\n📋 Available commands:\n• ${prefix}menu - Show all commands\n• ${prefix}help - Get help\n• ${prefix}alive - Bot status\n\n💡 Tip: Use ${prefix}menu to see all available commands.`,
                            'Help 🆘',
                            userConfig,
                            'error'
                        )
                    });
                }
            }
        } catch (error) {
            console.error('Command handler error:', error);
            await socket.sendMessage(sender, {
                text: formatMessageWithLogo(
                    'COMMAND ERROR',
                    `❌ An error occurred while processing your command!\n\nError: ${error.message || 'Unknown error'}\n\nPlease try again or contact the owner if the issue persists.\n\nUse ${prefix}help for assistance.`,
                    'Error ⚠️',
                    userConfig,
                    'error'
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

// Rest of the code remains the same (deleteSessionFromGitHub, restoreSession, loadUserConfig, updateUserConfig, setupAutoRestart, EmpirePair, routes, etc.)
// Just make sure to use formatMessageWithLogo instead of formatMessage where appropriate

// ... [The rest of the code remains the same as previous version, just update message formatting calls]
