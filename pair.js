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
    generateWAMessageFromContent
} = require('baileys');

// Laki MD Mini Bot Configuration
const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['❗', '🧚‍♂️', '🪄', '💓', '🎈', '♻️', '👻', '🥺', '🚀', '🔥'],
    PREFIX: '.',
    MAX_RETRIES: 5,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/HewoNJwVwrD0m4IO1DihaN',
    ADMIN_LIST_PATH: './admin.json',
    RCD_IMAGE_PATH: './laki_md_logo.jpg',
    NEWSLETTER_JID: '120363426375145222@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '94789227570',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbC8OWEBadmatxpZel15',
    BOT_NAME: 'Laki MD Mini Bot',
    BOT_VERSION: 'v2.0',
    BOT_OWNER: 'Lakshan'
};

// GitHub Configuration - Replace with your credentials
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN || 'YOUR_GITHUB_TOKEN_HERE' });
const owner = process.env.GITHUB_OWNER || 'YOUR_GITHUB_USERNAME';
const repo = process.env.GITHUB_REPO || 'laki-md-sessions';

// Active sessions management
const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();
const connectionRetries = new Map();

// Create session directory if not exists
if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// Load admin numbers
function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [config.OWNER_NUMBER];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [config.OWNER_NUMBER];
    }
}

// Format message with beautiful template
function formatMessage(title, content, footer) {
    return `╔═══ *${config.BOT_NAME}* ═══
║
╠══ *${title}*
║
╠══ ${content}
║
╚═══ *${footer}* ═══`;
}

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Get Sri Lanka timestamp
function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

// Clean duplicate session files from GitHub
async function cleanDuplicateFiles(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file => 
            file.name.startsWith(`laki_md_${sanitizedNumber}_`) && file.name.endsWith('.json')
        ).sort((a, b) => {
            const timeA = parseInt(a.name.match(/laki_md_\d+_(\d+)\.json/)?.[1] || 0);
            const timeB = parseInt(b.name.match(/laki_md_\d+_(\d+)\.json/)?.[1] || 0);
            return timeB - timeA;
        });

        const configFiles = data.filter(file => 
            file.name === `config_${sanitizedNumber}.json`
        );

        // Keep only the latest session file
        if (sessionFiles.length > 1) {
            for (let i = 1; i < sessionFiles.length; i++) {
                await octokit.repos.deleteFile({
                    owner,
                    repo,
                    path: `session/${sessionFiles[i].name}`,
                    message: `Delete duplicate session file for ${sanitizedNumber}`,
                    sha: sessionFiles[i].sha
                });
                console.log(`✅ Deleted duplicate session file: ${sessionFiles[i].name}`);
            }
        }

        if (configFiles.length > 0) {
            console.log(`📁 Config file for ${sanitizedNumber} already exists`);
        }
    } catch (error) {
        console.error(`❌ Failed to clean duplicate files for ${number}:`, error.message);
    }
}

// Join WhatsApp group automatically
async function joinGroup(socket) {
    let retries = config.MAX_RETRIES;
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) {
        console.error('❌ Invalid group invite link format');
        return { status: 'failed', error: 'Invalid group invite link' };
    }
    const inviteCode = inviteCodeMatch[1];

    while (retries > 0) {
        try {
            console.log(`🔄 Attempting to join group (${retries} retries left)...`);
            const response = await socket.groupAcceptInvite(inviteCode);
            if (response?.gid) {
                console.log(`✅ Successfully joined group with ID: ${response.gid}`);
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
            console.warn(`⚠️ Failed to join group: ${errorMessage}`);
            
            if (retries === 0) {
                console.error(`❌ Max retries reached for joining group`);
                return { status: 'failed', error: errorMessage };
            }
            await delay(2000 * (config.MAX_RETRIES - retries + 1));
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}

// Send connection notification to admins
async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const groupStatus = groupResult.status === 'success'
        ? `✅ Joined (ID: ${groupResult.gid})`
        : `❌ Failed: ${groupResult.error}`;
    
    const caption = formatMessage(
        '✅ BOT CONNECTED',
        `📱 *Number:* ${number}\n🟢 *Status:* Connected\n👥 *Group:* ${groupStatus}\n⏰ *Time:* ${getSriLankaTimestamp()}`,
        `Powered by ${config.BOT_OWNER}`
    );

    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: config.RCD_IMAGE_PATH },
                    caption: caption
                }
            );
            console.log(`📨 Sent connect notification to admin: ${admin}`);
        } catch (error) {
            console.error(`❌ Failed to send connect message to admin ${admin}:`, error.message);
        }
    }
}

// Send OTP for config updates
async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
        '🔐 OTP VERIFICATION',
        `Your OTP for config update is: *${otp}*\n⏰ This OTP will expire in 5 minutes.`,
        config.BOT_NAME
    );

    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`✅ OTP ${otp} sent to ${number}`);
    } catch (error) {
        console.error(`❌ Failed to send OTP to ${number}:`, error.message);
        throw error;
    }
}

// Update bot's about status
async function updateAboutStatus(socket) {
    const aboutStatus = `${config.BOT_NAME} | ${config.BOT_VERSION} | Active 🚀`;
    try {
        await socket.updateProfileStatus(aboutStatus);
        console.log(`✅ Updated About status to: ${aboutStatus}`);
    } catch (error) {
        console.error('❌ Failed to update About status:', error.message);
    }
}

// Update bot's story status
async function updateStoryStatus(socket, number) {
    const statusMessage = `${config.BOT_NAME} Connected! 🎉\n📱 Number: ${number}\n⏰ Connected at: ${getSriLankaTimestamp()}\n🚀 Powered by ${config.BOT_OWNER}`;
    try {
        await socket.sendMessage('status@broadcast', { text: statusMessage });
        console.log(`📢 Posted story status`);
    } catch (error) {
        console.error('❌ Failed to post story status:', error.message);
    }
}

// Newsletter auto-reaction handler
function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== config.NEWSLETTER_JID) return;

        try {
            const emojis = ['❤️', '🔥', '🚀', '🎉', '⭐', '💯'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('⚠️ No valid newsletterServerId found');
                return;
            }

            let retries = 3;
            while (retries > 0) {
                try {
                    await socket.newsletterReactMessage(
                        config.NEWSLETTER_JID,
                        messageId.toString(),
                        randomEmoji
                    );
                    console.log(`✅ Reacted to newsletter message ${messageId} with ${randomEmoji}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Failed to react to newsletter, retries left: ${retries}`, error.message);
                    if (retries === 0) throw error;
                    await delay(1000);
                }
            }
        } catch (error) {
            console.error('❌ Newsletter reaction error:', error.message);
        }
    });
}

// Auto view and react to status updates
async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            // Auto recording presence
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            // Auto view status
            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = 3;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        console.log(`👀 Viewed status from ${message.key.participant}`);
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000);
                    }
                }
            }

            // Auto react to status
            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = 3;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`❤️ Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Status handler error:', error.message);
        }
    });
}

// Handle message deletion notifications
async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();
        
        const message = formatMessage(
            '🗑️ MESSAGE DELETED',
            `A message was deleted from your chat.\n👤 From: ${messageKey.remoteJid}\n⏰ Time: ${deletionTime}`,
            config.BOT_NAME
        );

        try {
            await socket.sendMessage(userJid, {
                image: { url: config.RCD_IMAGE_PATH },
                caption: message
            });
            console.log(`📨 Notified ${number} about message deletion`);
        } catch (error) {
            console.error('❌ Failed to send deletion notification:', error.message);
        }
    });
}

// Image resizing function
async function resize(image, width, height) {
    try {
        const img = await Jimp.read(image);
        const buffer = await img.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
        return buffer;
    } catch (error) {
        console.error('❌ Image resize error:', error.message);
        throw error;
    }
}

// Capitalize first letter
function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// Generate serial number
const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}

// Setup all command handlers
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;

        // Extract command from message
        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            if (text.startsWith(config.PREFIX)) {
                const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }
        else if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(config.PREFIX)) {
                const parts = buttonId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        if (!command) return;

        try {
            switch (command) {
                case 'alive':
                case 'start': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    const botInfo = `
╔═══════════════════════════════╗
║     🚀 *${config.BOT_NAME}* 🚀     ║
╠═══════════════════════════════╣
║ 📊 *Version:* ${config.BOT_VERSION}
║ 👑 *Owner:* ${config.BOT_OWNER}
║ 📱 *Your Number:* ${number}
║ ⏳ *Uptime:* ${hours}h ${minutes}m ${seconds}s
║ 👥 *Active Sessions:* ${activeSockets.size}
║ 🔗 *Channel:* ${config.CHANNEL_LINK}
╠═══════════════════════════════╣
║ 💡 *Use* .menu *for commands*
╚═══════════════════════════════╝
                    `.trim();

                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: botInfo,
                        contextInfo: {
                            mentionedJid: [`${config.OWNER_NUMBER}@s.whatsapp.net`],
                            forwardingScore: 999,
                            isForwarded: true
                        }
                    });
                    break;
                }

                case 'menu':
                case 'help': {
                    const menuText = `
╔═══════════════════════════════╗
║     📜 *${config.BOT_NAME} MENU*     ║
╠═══════════════════════════════╣
║ 🔹 *${config.PREFIX}alive* - Bot status
║ 🔹 *${config.PREFIX}menu* - This menu
║ 🔹 *${config.PREFIX}ping* - Check latency
║ 🔹 *${config.PREFIX}system* - System info
║ 🔹 *${config.PREFIX}runtime* - Uptime stats
╠═══════════════════════════════╣
║ 🎵 *${config.PREFIX}song* - Download songs
║ 🎬 *${config.PREFIX}tiktok* - TikTok download
║ 📘 *${config.PREFIX}fb* - Facebook download
║ 🏏 *${config.PREFIX}cricket* - Cricket news
║ 📰 *${config.PREFIX}news* - Latest news
╠═══════════════════════════════╣
║ 🤖 *${config.PREFIX}ai* - AI chat
║ 🌤️ *${config.PREFIX}weather* - Weather info
║ 🆔 *${config.PREFIX}jid* - Get JID
║ 👤 *${config.PREFIX}owner* - Contact owner
╠═══════════════════════════════╣
║ 🗑️ *${config.PREFIX}deleteme* - Delete session
║ ⚙️ *${config.PREFIX}status* - Bot settings
║ 🔄 *${config.PREFIX}restart* - Restart bot
╚═══════════════════════════════╝
                    `.trim();

                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: menuText
                    });
                    break;
                }

                case 'system': {
                    const systemInfo = `
╔═══════════════════════════════╗
║     ⚙️ *SYSTEM STATUS* ⚙️     ║
╠═══════════════════════════════╣
║ 🤖 *Bot:* ${config.BOT_NAME}
║ 📱 *Your Number:* ${number}
║ 🟢 *Status:* Connected
║ 👀 *Auto-View:* ${config.AUTO_VIEW_STATUS}
║ ❤️ *Auto-Like:* ${config.AUTO_LIKE_STATUS}
║ ⏺️ *Auto-Recording:* ${config.AUTO_RECORDING}
╠═══════════════════════════════╣
║ 📊 *Active Sessions:* ${activeSockets.size}
║ 💾 *Memory:* ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB
║ 🚀 *Uptime:* ${Math.floor(process.uptime())}s
╚═══════════════════════════════╝
                    `;

                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: systemInfo
                    });
                    break;
                }

                case 'weather': {
                    if (!args.length) {
                        await socket.sendMessage(sender, {
                            text: `❌ Please provide a city name!\n📌 Usage: ${config.PREFIX}weather Colombo`
                        });
                        break;
                    }

                    try {
                        const city = args.join(' ');
                        const apiKey = '2d61a72574c11c4f36173b627f8cb177'; // Replace with your OpenWeather API key
                        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
                        
                        const response = await axios.get(url);
                        const data = response.data;
                        
                        const weatherInfo = `
╔═══════════════════════════════╗
║     🌤️ *WEATHER REPORT* 🌤️     ║
╠═══════════════════════════════╣
║ 🌍 *Location:* ${data.name}, ${data.sys.country}
║ 🌡️ *Temperature:* ${data.main.temp}°C
║ 💨 *Feels Like:* ${data.main.feels_like}°C
║ 💧 *Humidity:* ${data.main.humidity}%
║ ☁️ *Condition:* ${data.weather[0].main}
║ 📝 *Description:* ${data.weather[0].description}
║ 💨 *Wind Speed:* ${data.wind.speed} m/s
║ 📊 *Pressure:* ${data.main.pressure} hPa
╚═══════════════════════════════╝
                        `;

                        await socket.sendMessage(sender, {
                            text: weatherInfo
                        });
                    } catch (error) {
                        await socket.sendMessage(sender, {
                            text: '❌ Could not fetch weather information. Please check the city name and try again.'
                        });
                    }
                    break;
                }

                case 'jid': {
                    try {
                        await socket.sendMessage(sender, {
                            text: `📱 *Your JID:* ${sender}`
                        });
                        await socket.sendMessage(sender, { 
                            react: { text: '✅', key: msg.key } 
                        });
                    } catch (error) {
                        await socket.sendMessage(sender, { 
                            react: { text: '❌', key: msg.key } 
                        });
                        await socket.sendMessage(sender, {
                            text: '❌ Error retrieving JID!'
                        });
                    }
                    break;
                }

                case 'news': {
                    try {
                        const response = await axios.get('https://suhas-bro-api.vercel.app/news/lnw');
                        const data = response.data;

                        if (data.status && data.result) {
                            const { title, desc, date, link } = data.result;
                            let thumbnailUrl = 'https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?w=400&h=300&fit=crop';
                            
                            try {
                                const pageResponse = await axios.get(link);
                                const $ = cheerio.load(pageResponse.data);
                                const ogImage = $('meta[property="og:image"]').attr('content');
                                if (ogImage) {
                                    thumbnailUrl = ogImage;
                                }
                            } catch (err) {
                                console.warn('Could not fetch thumbnail:', err.message);
                            }

                            const newsText = `
╔═══════════════════════════════╗
║     📰 *LATEST NEWS* 📰     ║
╠═══════════════════════════════╣
║ 📢 *${title}*
║
║ ${desc}
║
║ 📅 *Date:* ${date}
║ 🔗 *Link:* ${link}
╚═══════════════════════════════╝
                            `;

                            await socket.sendMessage(sender, {
                                image: { url: thumbnailUrl },
                                caption: newsText
                            });
                        } else {
                            throw new Error('Invalid news data');
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, {
                            text: '❌ Could not fetch news at the moment. Please try again later.'
                        });
                    }
                    break;
                }

                case 'cricket': {
                    try {
                        const response = await axios.get('https://suhas-bro-api.vercel.app/news/cricbuzz');
                        const data = response.data;

                        if (data.status && data.result) {
                            const { title, score, to_win, crr, link } = data.result;
                            
                            const cricketText = `
╔═══════════════════════════════╗
║     🏏 *CRICKET UPDATE* 🏏     ║
╠═══════════════════════════════╣
║ 📢 *${title}*
║
║ 🏏 *Score:* ${score}
║ 🎯 *To Win:* ${to_win}
║ 📈 *Current RR:* ${crr}
║ 🔗 *More Info:* ${link}
╚═══════════════════════════════╝
                            `;

                            await socket.sendMessage(sender, {
                                text: cricketText
                            });
                        } else {
                            throw new Error('Invalid cricket data');
                        }
                    } catch (error) {
                        await socket.sendMessage(sender, {
                            text: '❌ Could not fetch cricket updates. Please try again later.'
                        });
                    }
                    break;
                }

                case 'song': {
                    const yts = require('yt-search');
                    const q = msg.message?.conversation || 
                              msg.message?.extendedTextMessage?.text || 
                              args.join(' ') || '';

                    if (!q) {
                        await socket.sendMessage(sender, {
                            text: `❌ Please provide a song name or YouTube URL!\n📌 Usage: ${config.PREFIX}song <song name>`
                        });
                        break;
                    }

                    try {
                        const search = await yts(q);
                        const video = search.videos[0];
                        
                        if (!video) {
                            await socket.sendMessage(sender, {
                                text: '❌ No songs found!'
                            });
                            break;
                        }

                        const songInfo = `
╔═══════════════════════════════╗
║     🎵 *NOW PLAYING* 🎵     ║
╠═══════════════════════════════╣
║ 🎶 *Title:* ${video.title}
║ 👤 *Artist:* ${video.author.name}
║ ⏱️ *Duration:* ${video.duration.timestamp}
║ 👁️ *Views:* ${video.views}
║ 📅 *Uploaded:* ${video.ago}
║ 🔗 *URL:* ${video.url}
╚═══════════════════════════════╝
                        `;

                        await socket.sendMessage(sender, {
                            image: { url: video.thumbnail },
                            caption: songInfo
                        });

                        // Download and send audio
                        await socket.sendMessage(sender, { 
                            react: { text: '⏬', key: msg.key } 
                        });

                        // Note: You need to implement actual audio download logic here
                        await delay(2000);
                        
                        await socket.sendMessage(sender, { 
                            react: { text: '✅', key: msg.key } 
                        });
                        
                        await socket.sendMessage(sender, {
                            text: '⚠️ Audio download feature is currently being updated. Please check back soon!'
                        });

                    } catch (error) {
                        console.error('Song error:', error);
                        await socket.sendMessage(sender, {
                            text: '❌ Error downloading song!'
                        });
                    }
                    break;
                }

                case 'tiktok': {
                    if (!args.length) {
                        await socket.sendMessage(sender, {
                            text: `❌ Please provide a TikTok URL!\n📌 Usage: ${config.PREFIX}tiktok <url>`
                        });
                        break;
                    }

                    const url = args[0];
                    if (!url.includes('tiktok.com')) {
                        await socket.sendMessage(sender, {
                            text: '❌ Invalid TikTok URL!'
                        });
                        break;
                    }

                    try {
                        await socket.sendMessage(sender, { 
                            react: { text: '⏬', key: msg.key } 
                        });
                        
                        // Note: Implement TikTok download logic here
                        await delay(2000);
                        
                        await socket.sendMessage(sender, { 
                            react: { text: '✅', key: msg.key } 
                        });
                        
                        await socket.sendMessage(sender, {
                            text: '⚠️ TikTok download feature is currently being updated. Please check back soon!'
                        });

                    } catch (error) {
                        console.error('TikTok error:', error);
                        await socket.sendMessage(sender, {
                            text: '❌ Error downloading TikTok video!'
                        });
                    }
                    break;
                }

                case 'ai': {
                    const q = msg.message?.conversation || 
                              msg.message?.extendedTextMessage?.text || 
                              args.join(' ') || '';

                    if (!q) {
                        await socket.sendMessage(sender, {
                            text: '🤖 Hello! I am Laki MD AI. How can I help you today?'
                        });
                        break;
                    }

                    try {
                        // Simple AI response (replace with actual AI API)
                        const responses = [
                            "I'm Laki MD AI, here to help you!",
                            "That's an interesting question!",
                            "Let me think about that...",
                            "I'm still learning, but I'll do my best to help!",
                            "Thanks for asking! Here's what I think..."
                        ];
                        
                        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                        
                        await socket.sendMessage(sender, {
                            text: `🤖 *Laki MD AI:* ${randomResponse}\n\n*Your question:* ${q}`
                        });

                    } catch (error) {
                        await socket.sendMessage(sender, {
                            text: '❌ AI service is currently unavailable. Please try again later.'
                        });
                    }
                    break;
                }

                case 'ping':
                case 'speed': {
                    const start = Date.now();
                    await socket.sendMessage(sender, { 
                        react: { text: '🏓', key: msg.key } 
                    });
                    const latency = Date.now() - start;
                    
                    await socket.sendMessage(sender, {
                        text: `🏓 *Pong!*\n⏱️ Latency: ${latency}ms\n🚀 Speed: Excellent!`
                    });
                    break;
                }

                case 'runtime': {
                    const startTime = socketCreationTime.get(number) || Date.now();
                    const uptime = Math.floor((Date.now() - startTime) / 1000);
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    const runtimeInfo = `
╔═══════════════════════════════╗
║     ⏱️ *RUNTIME STATS* ⏱️     ║
╠═══════════════════════════════╣
║ 📱 *Your Number:* ${number}
║ ⏳ *Uptime:* ${hours}h ${minutes}m ${seconds}s
║ 👥 *Active Sessions:* ${activeSockets.size}
║ 💾 *Memory Usage:* ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB
║ 🚀 *Bot Version:* ${config.BOT_VERSION}
╚═══════════════════════════════╝
                    `;

                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: runtimeInfo
                    });
                    break;
                }

                case 'owner': {
                    const ownerInfo = `
╔═══════════════════════════════╗
║     👑 *BOT OWNER* 👑     ║
╠═══════════════════════════════╣
║ *Name:* ${config.BOT_OWNER}
║ *Number:* ${config.OWNER_NUMBER}
║ *Bot:* ${config.BOT_NAME}
║ *Version:* ${config.BOT_VERSION}
║ *Channel:* ${config.CHANNEL_LINK}
╠═══════════════════════════════╣
║ 💬 *Contact for support:* 
║ ${config.OWNER_NUMBER}
╚═══════════════════════════════╝
                    `;

                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: ownerInfo
                    });
                    break;
                }

                case 'deleteme': {
                    const confirmationText = `
╔═══════════════════════════════╗
║     ⚠️ *CONFIRM DELETION* ⚠️     ║
╠═══════════════════════════════╣
║ Are you sure you want to delete
║ your session? This will:
║
║ ❌ Remove your session data
║ ❌ Log out from WhatsApp
║ ❌ Delete all saved info
║
║ *This action cannot be undone!*
║
║ Reply with *YES* to confirm
║ or *NO* to cancel.
╚═══════════════════════════════╝
                    `;

                    await socket.sendMessage(sender, {
                        text: confirmationText
                    });

                    // Set up confirmation handler
                    const confirmationHandler = async (confirmationMsg) => {
                        if (confirmationMsg.key.remoteJid === sender) {
                            const text = confirmationMsg.message?.conversation || 
                                        confirmationMsg.message?.extendedTextMessage?.text || '';
                            
                            if (text.toUpperCase() === 'YES') {
                                // Delete session
                                const sessionPath = path.join(SESSION_BASE_PATH, `session_${number}`);
                                if (fs.existsSync(sessionPath)) {
                                    await fs.remove(sessionPath);
                                }
                                
                                // Delete from GitHub
                                await deleteSessionFromGitHub(number);
                                
                                // Close socket
                                if (activeSockets.has(number)) {
                                    activeSockets.get(number).ws.close();
                                    activeSockets.delete(number);
                                    socketCreationTime.delete(number);
                                }
                                
                                await socket.sendMessage(sender, {
                                    text: '✅ Session deleted successfully! Goodbye! 👋'
                                });
                                
                                // Remove this listener
                                socket.ev.off('messages.upsert', confirmationHandler);
                                
                            } else if (text.toUpperCase() === 'NO') {
                                await socket.sendMessage(sender, {
                                    text: '✅ Session deletion cancelled.'
                                });
                                socket.ev.off('messages.upsert', confirmationHandler);
                            }
                        }
                    };

                    // Add temporary listener for confirmation
                    socket.ev.on('messages.upsert', confirmationHandler);
                    
                    // Remove listener after 30 seconds
                    setTimeout(() => {
                        socket.ev.off('messages.upsert', confirmationHandler);
                    }, 30000);
                    
                    break;
                }

                case 'restart': {
                    const admins = loadAdmins();
                    const senderNumber = sender.replace(/@s\.whatsapp\.net/, '');
                    
                    if (!admins.includes(senderNumber)) {
                        await socket.sendMessage(sender, {
                            text: '❌ This command is only available for admins!'
                        });
                        break;
                    }
                    
                    await socket.sendMessage(sender, {
                        text: '🔄 Restarting bot...'
                    });
                    
                    setTimeout(() => {
                        process.exit(0);
                    }, 1000);
                    break;
                }

                default: {
                    await socket.sendMessage(sender, {
                        text: `❌ Unknown command: ${command}\n💡 Use ${config.PREFIX}menu to see all available commands.`
                    });
                }
            }
        } catch (error) {
            console.error('Command handler error:', error);
            await socket.sendMessage(sender, {
                text: '❌ An error occurred while processing your command. Please try again.'
            });
        }
    });
}

// Setup message handlers
function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        // Auto recording presence
        if (config.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
            } catch (error) {
                // Ignore presence errors
            }
        }
    });
}

// Delete session from GitHub
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
            try {
                await octokit.repos.deleteFile({
                    owner,
                    repo,
                    path: `session/${file.name}`,
                    message: `Delete session for ${sanitizedNumber}`,
                    sha: file.sha
                });
                console.log(`✅ Deleted session file: ${file.name}`);
            } catch (error) {
                console.error(`❌ Failed to delete ${file.name}:`, error.message);
            }
        }
    } catch (error) {
        console.error('❌ Failed to delete session from GitHub:', error.message);
    }
}

// Restore session from GitHub
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
        console.error('❌ Session restore failed:', error.message);
        return null;
    }
}

// Load user configuration
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
        console.log(`📝 Using default config for ${number}`);
        return { ...config };
    }
}

// Update user configuration
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
            // File doesn't exist, will create new
        }

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: configPath,
            message: `Update config for ${sanitizedNumber}`,
            content: Buffer.from(JSON.stringify(newConfig, null, 2)).toString('base64'),
            sha
        });
        console.log(`✅ Updated config for ${sanitizedNumber}`);
    } catch (error) {
        console.error('❌ Failed to update config:', error.message);
        throw error;
    }
}

// Setup auto restart with improved reconnection logic
function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error?.output?.statusCode;
            
            console.log(`🔌 Connection closed for ${number}:`, error?.message || 'Unknown error');
            
            // Don't reconnect for authentication errors
            if (statusCode === 401 || statusCode === 403) {
                console.log(`❌ Authentication failed for ${number}. Removing session...`);
                activeSockets.delete(number);
                socketCreationTime.delete(number);
                return;
            }
            
            // Implement exponential backoff for reconnection
            const retryCount = connectionRetries.get(number) || 0;
            if (retryCount < 5) {
                const delayTime = Math.min(30000, 2000 * Math.pow(2, retryCount));
                console.log(`🔄 Reconnecting ${number} in ${delayTime/1000} seconds (attempt ${retryCount + 1})...`);
                
                connectionRetries.set(number, retryCount + 1);
                
                setTimeout(async () => {
                    try {
                        activeSockets.delete(number);
                        const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                        await EmpirePair(number, mockRes);
                    } catch (error) {
                        console.error(`❌ Reconnection failed for ${number}:`, error.message);
                    }
                }, delayTime);
            } else {
                console.log(`❌ Max reconnection attempts reached for ${number}`);
                activeSockets.delete(number);
                socketCreationTime.delete(number);
                connectionRetries.delete(number);
            }
        }
        
        if (connection === 'open') {
            console.log(`✅ Connection established for ${number}`);
            connectionRetries.delete(number);
        }
    });
}

// Main pairing function
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    // Check if already connected
    if (activeSockets.has(sanitizedNumber)) {
        console.log(`ℹ️ ${sanitizedNumber} is already connected`);
        if (!res.headersSent) {
            return res.status(200).send({ 
                status: 'already_connected',
                message: 'This number is already connected to the bot.'
            });
        }
        return;
    }
    
    console.log(`🚀 Starting pairing process for ${sanitizedNumber}...`);
    
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    
    try {
        // Clean duplicate files
        await cleanDuplicateFiles(sanitizedNumber);
        
        // Restore session from GitHub if available
        const restoredCreds = await restoreSession(sanitizedNumber);
        if (restoredCreds) {
            await fs.ensureDir(sessionPath);
            await fs.writeFile(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
            console.log(`✅ Restored session for ${sanitizedNumber}`);
        }
        
        // Setup authentication state
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: 'error' }); // Only log errors in production
        
        // Create WhatsApp socket
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
            generateHighQualityLinkPreview: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000
        });
        
        // Store creation time
        socketCreationTime.set(sanitizedNumber, Date.now());
        
        // Setup all handlers
        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        handleMessageRevocation(socket, sanitizedNumber);
        
        // Handle pairing code request for new sessions
        if (!socket.authState.creds.registered) {
            console.log(`📱 Requesting pairing code for ${sanitizedNumber}...`);
            
            let retries = config.MAX_RETRIES;
            let code;
            
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    console.log(`✅ Pairing code generated for ${sanitizedNumber}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Failed to request pairing code (${retries} retries left):`, error.message);
                    if (retries === 0) {
                        if (!res.headersSent) {
                            return res.status(500).send({ 
                                error: 'Failed to generate pairing code. Please try again.'
                            });
                        }
                        return;
                    }
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            
            if (!res.headersSent) {
                return res.send({ 
                    code,
                    message: 'Scan the QR code or use this code in your WhatsApp linked devices section.'
                });
            }
        }
        
        // Save credentials when updated
        socket.ev.on('creds.update', async () => {
            await saveCreds();
            
            try {
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
                console.log(`✅ Updated GitHub session for ${sanitizedNumber}`);
            } catch (error) {
                console.error(`❌ Failed to update GitHub session:`, error.message);
            }
        });
        
        // Handle connection updates
        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            
            if (connection === 'open') {
                console.log(`✅ WhatsApp connected for ${sanitizedNumber}`);
                
                try {
                    await delay(2000);
                    const userJid = jidNormalizedUser(socket.user.id);
                    
                    // Update bot status
                    await updateAboutStatus(socket);
                    await updateStoryStatus(socket, sanitizedNumber);
                    
                    // Join group
                    const groupResult = await joinGroup(socket);
                    
                    // Follow newsletter
                    try {
                        await socket.newsletterFollow(config.NEWSLETTER_JID);
                        console.log(`✅ Auto-followed newsletter channel`);
                    } catch (error) {
                        console.log(`ℹ️ Newsletter follow failed:`, error.message);
                    }
                    
                    // Load or create config
                    try {
                        await loadUserConfig(sanitizedNumber);
                    } catch (error) {
                        await updateUserConfig(sanitizedNumber, config);
                    }
                    
                    // Store active socket
                    activeSockets.set(sanitizedNumber, socket);
                    
                    // Send welcome message
                    const welcomeMessage = formatMessage(
                        '🎉 WELCOME TO LAKI MD MINI BOT',
                        `✅ *Successfully Connected!*\n\n📱 *Your Number:* ${sanitizedNumber}\n🤖 *Bot:* ${config.BOT_NAME}\n🚀 *Version:* ${config.BOT_VERSION}\n\n💡 *Use* .menu *to see all commands*\n👑 *Owner:* ${config.BOT_OWNER}`,
                        'Enjoy using the bot!'
                    );
                    
                    await socket.sendMessage(userJid, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: welcomeMessage
                    });
                    
                    // Send admin notification
                    await sendAdminConnectMessage(socket, sanitizedNumber, groupResult);
                    
                    // Update numbers list
                    let numbers = [];
                    if (fs.existsSync(NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(await fs.readFile(NUMBER_LIST_PATH, 'utf8'));
                    }
                    
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        await fs.writeFile(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                        await updateNumberListOnGitHub(sanitizedNumber);
                    }
                    
                    console.log(`🎯 ${sanitizedNumber} is now fully connected and ready!`);
                    
                } catch (error) {
                    console.error(`❌ Connection setup error for ${sanitizedNumber}:`, error);
                    
                    // Try to restart the process
                    try {
                        exec(`pm2 restart ${process.env.PM2_NAME || 'laki-md-bot'}`);
                    } catch (restartError) {
                        console.error('❌ Failed to restart process:', restartError.message);
                    }
                }
            }
        });
        
    } catch (error) {
        console.error(`❌ Pairing error for ${sanitizedNumber}:`, error);
        socketCreationTime.delete(sanitizedNumber);
        
        if (!res.headersSent) {
            res.status(500).send({ 
                error: 'Pairing failed. Please try again.',
                details: error.message
            });
        }
    }
}

// API Routes
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ 
            error: 'Number parameter is required',
            example: '/pair?number=94789227570'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({
        status: 'success',
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys()),
        timestamp: getSriLankaTimestamp()
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        bot: config.BOT_NAME,
        version: config.BOT_VERSION,
        message: `${config.BOT_NAME} is running smoothly!`,
        active_sessions: activeSockets.size,
        uptime: Math.floor(process.uptime()),
        timestamp: getSriLankaTimestamp()
    });
});

router.get('/connect-all', async (req, res) => {
    try {
        if (!fs.existsSync(NUMBER_LIST_PATH)) {
            return res.status(404).send({ 
                error: 'No numbers found to connect',
                message: 'The numbers.json file does not exist.'
            });
        }

        const numbers = JSON.parse(await fs.readFile(NUMBER_LIST_PATH, 'utf8'));
        if (numbers.length === 0) {
            return res.status(404).send({ 
                error: 'No numbers found to connect',
                message: 'The numbers.json file is empty.'
            });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            try {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
                await delay(1000); // Delay between connections
            } catch (error) {
                results.push({ number, status: 'failed', error: error.message });
            }
        }

        res.status(200).send({
            status: 'success',
            message: `Connection process initiated for ${results.length} numbers`,
            connections: results
        });
    } catch (error) {
        console.error('Connect all error:', error);
        res.status(500).send({ 
            error: 'Failed to connect all bots',
            details: error.message
        });
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
            return res.status(404).send({ 
                error: 'No session files found',
                message: 'No session files found in the GitHub repository.'
            });
        }

        const results = [];
        for (const file of sessionFiles) {
            const match = file.name.match(/creds_(\d+)\.json/);
            if (!match) {
                results.push({ file: file.name, status: 'skipped', reason: 'invalid_file_name' });
                continue;
            }

            const number = match[1];
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            try {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
                await delay(1000);
            } catch (error) {
                results.push({ number, status: 'failed', error: error.message });
            }
        }

        res.status(200).send({
            status: 'success',
            message: `Reconnection process completed`,
            total_files: sessionFiles.length,
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ 
            error: 'Failed to reconnect bots',
            details: error.message
        });
    }
});

router.get('/stats', (req, res) => {
    const memoryUsage = process.memoryUsage();
    
    res.status(200).send({
        status: 'success',
        bot: {
            name: config.BOT_NAME,
            version: config.BOT_VERSION,
            owner: config.BOT_OWNER
        },
        system: {
            uptime: Math.floor(process.uptime()),
            memory: {
                rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
                heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
            },
            node_version: process.version,
            platform: process.platform
        },
        sessions: {
            active: activeSockets.size,
            total_created: socketCreationTime.size
        },
        timestamp: getSriLankaTimestamp()
    });
});

// Update number list on GitHub
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

// Auto reconnect from GitHub on startup
async function autoReconnectFromGitHub() {
    try {
        const pathOnGitHub = 'session/numbers.json';
        const { data } = await octokit.repos.getContent({ owner, repo, path: pathOnGitHub });
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const numbers = JSON.parse(content);

        console.log(`🔁 Found ${numbers.length} numbers to reconnect from GitHub`);
        
        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                try {
                    const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                    await EmpirePair(number, mockRes);
                    console.log(`✅ Reconnected from GitHub: ${number}`);
                    await delay(2000); // Delay to avoid rate limiting
                } catch (error) {
                    console.error(`❌ Failed to reconnect ${number}:`, error.message);
                }
            }
        }
    } catch (error) {
        console.error('❌ autoReconnectFromGitHub error:', error.message);
    }
}

// Start auto reconnection on startup
setTimeout(() => {
    autoReconnectFromGitHub();
}, 10000);

// Cleanup on exit
process.on('exit', () => {
    console.log('🔄 Cleaning up before exit...');
    activeSockets.forEach((socket, number) => {
        try {
            socket.ws.close();
        } catch (error) {
            // Ignore close errors
        }
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    
    try {
        fs.emptyDirSync(SESSION_BASE_PATH);
    } catch (error) {
        // Ignore cleanup errors
    }
    
    console.log('👋 Cleanup completed. Goodbye!');
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught exception:', err);
    
    try {
        exec(`pm2 restart ${process.env.PM2_NAME || 'laki-md-bot'}`);
    } catch (error) {
        console.error('❌ Failed to restart process:', error.message);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = router;
