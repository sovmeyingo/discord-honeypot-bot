import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';

// Güvenlik korumalarından muaf tutulacak roller (Yöneticiler, yetkililer vb.)
export const SAFE_ROLE_IDS = [
  '1502699586425323601',
  '1520821960282738991',
  '1502671294028709898',
  '1503448163879751790',
  '1503448273648746608',
  '1503448748942954527',
  '1513968435137089556',
  '1502670263010070570',
  '1502711895101276361'
];

/**
 * Kullanıcının güvenlik filtrelerinden muaf olup olmadığını kontrol eder
 * @param {import('discord.js').GuildMember} member 
 */
export function isUserSafe(member) {
  if (!member) return false;
  if (member.user.bot) return true; // Diğer botları filtreleme
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true; // Adminler muaf
  
  return member.roles.cache.some(role => SAFE_ROLE_IDS.includes(role.id));
}

/**
 * Güvenlik olaylarını log kanalına bildirir
 */
export async function logSecurityEvent(guild, title, description) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId || logChannelId === 'YOUR_LOG_CHANNEL_ID_HERE') return;

  try {
    const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (logChannel && logChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(`🛡️ Güvenlik Log: ${title}`)
        .setDescription(description)
        .setColor(0xff0000) // Kırmızı
        .setTimestamp();
      await logChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('[HATA] Güvenlik logu gönderilemedi:', err);
  }
}

// Spam takibi için hafızada tutulan kayıtlar (Kullanıcı ID -> Zaman Damgaları dizisi)
const userMessages = new Map();

/**
 * Anti-Spam Kontrolü (Hızlı mesaj atma)
 */
export async function checkAntiSpam(message) {
  const { author, channel, guild } = message;
  
  let member = message.member;
  if (!member && guild) {
    member = await guild.members.fetch(author.id).catch(() => null);
  }

  if (isUserSafe(member)) return false;

  const now = Date.now();
  const limitTime = 3000; // 3 saniye
  const limitCount = 5; // 3 saniyede maksimum 5 mesaj

  if (!userMessages.has(author.id)) {
    userMessages.set(author.id, []);
  }

  const timestamps = userMessages.get(author.id);
  timestamps.push(now);

  // 3 saniyeden eski kayıtları temizle
  const recentTimestamps = timestamps.filter(t => now - t < limitTime);
  userMessages.set(author.id, recentTimestamps);

  if (recentTimestamps.length > limitCount) {
    try {
      // Mesajı sil
      if (message.deletable) await message.delete().catch(() => null);

      // Üyeyi 10 dakika sustur (Timeout)
      if (member && member.moderatable) {
        await member.timeout(10 * 60 * 1000, 'Anti-Spam: Çok hızlı mesaj gönderimi.');
        
        const warnMsg = await channel.send(`⚠️ ${author}, çok hızlı mesaj gönderdiğiniz için **10 dakika susturuldunuz**!`);
        setTimeout(() => warnMsg.delete().catch(() => {}), 10000);

        await logSecurityEvent(
          guild, 
          'Anti-Spam Koruması', 
          `**${author.tag}** (${author}) hızlı mesaj (spam) attığı için otomatik olarak 10 dakika susturuldu.`
        );
      }
      return true;
    } catch (err) {
      console.error('[HATA] Anti-spam cezası uygulanırken hata:', err);
    }
  }
  return false;
}

// Reklam ve zararlı link filtre kalıpları
const inviteRegex = /(discord\.(gg|io|me|li)\/.+|discord\.com\/invite\/.+)/i;
const scamRegex = /(dlscord|d1scord|discond|discord-app|discord-gift|steamcommunlty|steampowered-gift|gift-nitro|free-nitro)/i;

/**
 * Anti-Link Kontrolü (Zararlı reklam veya phishing linkleri)
 */
export async function checkAntiLink(message) {
  const { content, author, channel, guild } = message;

  let member = message.member;
  if (!member && guild) {
    member = await guild.members.fetch(author.id).catch(() => null);
  }

  if (isUserSafe(member)) return false;

  const hasLink = /https?:\/\/[^\s]+/i.test(content);
  if (!hasLink) return false;

  let shouldDelete = false;
  let reason = '';
  let penalty = 'delete'; // delete (silme) veya timeout (susturma)

  if (scamRegex.test(content)) {
    shouldDelete = true;
    reason = 'Şüpheli dolandırıcılık/phishing (sahte hediye/nitro) linki.';
    penalty = 'timeout';
  } else if (inviteRegex.test(content)) {
    shouldDelete = true;
    reason = 'Farklı sunucu davet linki paylaşımı.';
    penalty = 'delete';
  }

  if (shouldDelete) {
    try {
      if (message.deletable) await message.delete().catch(() => null);

      if (penalty === 'timeout' && member && member.moderatable) {
        // Şüpheli link paylaşan hesabı 1 saat sustur
        await member.timeout(1 * 60 * 60 * 1000, `Anti-Link: ${reason}`);
        
        const warnMsg = await channel.send(`⚠️ ${author}, zararlı/şüpheli link paylaştığı için **1 saat susturuldu**!`);
        setTimeout(() => warnMsg.delete().catch(() => {}), 10000);
      } else {
        // Davet linki için sadece sil ve uyar
        const warnMsg = await channel.send(`⚠️ ${author}, bu sunucuda davet linki paylaşımı yasaktır!`);
        setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      }

      await logSecurityEvent(
        guild,
        'Zararlı Link Engeli',
        `**${author.tag}** (${author}) tarafından paylaşılan mesaj engellendi.\n**Sebep:** ${reason}\n**Mesaj İçeriği:** \`${content.slice(0, 500)}\``
      );
      return true;
    } catch (err) {
      console.error('[HATA] Anti-link işlemi sırasında hata:', err);
    }
  }
  return false;
}

// Zararlı olabilecek dosya uzantıları
const dangerousExtensions = ['.exe', '.scr', '.bat', '.cmd', '.msi', '.vbs', '.lnk'];

/**
 * Anti-Malware Kontrolü (Zararlı dosya yükleme engeli)
 */
export async function checkAntiMalware(message) {
  const { attachments, author, channel, guild } = message;

  let member = message.member;
  if (!member && guild) {
    member = await guild.members.fetch(author.id).catch(() => null);
  }

  if (isUserSafe(member)) return false;
  if (attachments.size === 0) return false;

  let hasMalware = false;
  let fileName = '';

  for (const [id, attachment] of attachments) {
    const ext = attachment.name.substring(attachment.name.lastIndexOf('.')).toLowerCase();
    if (dangerousExtensions.includes(ext)) {
      hasMalware = true;
      fileName = attachment.name;
      break;
    }
  }

  if (hasMalware) {
    try {
      if (message.deletable) await message.delete().catch(() => null);

      if (member && member.moderatable) {
        // Zararlı yazılım paylaşmaya çalışanı 24 saat sustur
        await member.timeout(24 * 60 * 60 * 1000, `Anti-Malware: Zararlı dosya yükleme teşebbüsü (${fileName}).`);
        
        const warnMsg = await channel.send(`⚠️ ${author}, sunucuya zararlı olabilecek şüpheli dosya yüklemeye çalıştığı için **24 saat susturuldu**!`);
        setTimeout(() => warnMsg.delete().catch(() => {}), 10000);
      }

      await logSecurityEvent(
        guild,
        'Zararlı Dosya Engeli',
        `**${author.tag}** (${author}) sunucuya zararlı uzantıda dosya yüklemeye çalıştı.\n**Dosya Adı:** \`${fileName}\``
      );
      return true;
    } catch (err) {
      console.error('[HATA] Anti-malware işlemi sırasında hata:', err);
    }
  }
  return false;
}

/**
 * AI Destekli Küfür ve Hakaret Kontrolü
 */
export async function checkToxicity(message) {
  const { author, channel, guild, content } = message;
  if (!content) return false;

  let member = message.member;
  if (!member && guild) {
    member = await guild.members.fetch(author.id).catch(() => null);
  }

  // Güvenli kullanıcı ise es geç
  if (isUserSafe(member)) return false;

  // Hızlı Yerel Filtre (API Limitlerini korumak için sadece şüpheli kelimeler içeriyorsa AI'ye soracağız)
  // Türkçe en sık kullanılan kaba kelimeler/küfür harfleri listesi
  const localProfanityRegex = /(amk|sik|orospu|piç|göt|meme|yarrak|taşşak|o\.ç|kahpe|orospuçocuğu|siktir|amcık|meme|kaltak|yavşak|puşt|keke|pezevenk|gavat|şerefsiz|orospu çocuğu)/i;
  
  if (!localProfanityRegex.test(content.toLowerCase())) {
    return false; // Şüpheli kelime barındırmıyorsa AI çağrısı yapıp limiti harcamayalım
  }

  const groqKey = process.env.GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiKey = groqKey || openrouterKey || geminiKey;
  
  if (!apiKey || apiKey === 'YOUR_GROQ_KEY' || apiKey === 'YOUR_OPENROUTER_KEY' || apiKey === 'YOUR_GEMINI_KEY') {
    // API anahtarı yoksa sadece yerel filtreyle doğrudan sil (Fallback)
    await deleteAndWarn(message, author, channel, guild, 'Yerel Filtre (Ağır Küfür)');
    return true;
  }

  try {
    let result = '';
    const systemPrompt = `Görevin, aşağıdaki cümlenin bir insana yönelik ağır/ciddi bir küfür veya doğrudan kişisel bir hakaret içerip içermediğini analiz etmektir. 
Arkadaşça kullanılan şakalaşma kelimelerini (örn: "lan", "salak", "manyak", "kanka", "amk" gibi samimi veya tepki amaçlı kelimeler birine hakaret olarak yöneltilmediyse) es geç. Sadece bir kişiye yönelik kaba, ağır küfürleri veya ciddi kişisel hakaretleri yakala.
Eğer cümle ağır küfür/hakaret içeriyorsa sadece "EVET" yaz. İçermiyorsa sadece "HAYIR" yaz. Başka hiçbir açıklama yapma.`;

    if (groqKey && groqKey !== 'YOUR_GROQ_KEY') {
      result = await askAICompletions(content, systemPrompt, groqKey, 'https://api.groq.com/openai/v1/chat/completions', 'llama-3.1-8b-instant');
    } else if (openrouterKey && openrouterKey !== 'YOUR_OPENROUTER_KEY') {
      result = await askAICompletions(content, systemPrompt, openrouterKey, 'https://openrouter.ai/api/v1/chat/completions', 'meta-llama/llama-3-8b-instruct:free');
    } else if (geminiKey && geminiKey !== 'YOUR_GEMINI_KEY') {
      result = await askGeminiCompletions(content, systemPrompt, geminiKey);
    }

    if (result.trim().toUpperCase().includes('EVET')) {
      await deleteAndWarn(message, author, channel, guild, 'Yapay Zeka Filtresi (Ağır Küfür/Hakaret)');
      return true;
    }
  } catch (err) {
    console.error('[AI KÜFÜR FİLTRESİ HATA]', err);
    // Hata durumunda yerel filtreden geçtiği için yine de silebiliriz (güvenli tarafta kalmak için)
    await deleteAndWarn(message, author, channel, guild, 'Yerel Süzgeç (Hata Durumu)');
    return true;
  }

  return false;
}

// Mesajı silip uyarı veren yardımcı fonksiyon
async function deleteAndWarn(message, author, channel, guild, filterType) {
  try {
    if (message.deletable) await message.delete().catch(() => null);
    
    // Siciline ceza ekle
    const { addInfraction } = await import('./moderation.js');
    addInfraction(author.id, 'UYARI', `Otomatik Filtre: Küfür/Hakaret kullanımı.`, 'SYSTEM');

    const warnMsg = await channel.send(`⚠️ ${author}, sunucumuzda küfür ve hakaret kullanımı yasaktır! (Mesajınız otomatik olarak silindi ve sicilinize uyarı eklendi).`);
    setTimeout(() => warnMsg.delete().catch(() => {}), 10000);

    await logSecurityEvent(
      guild,
      'Küfür / Hakaret Engeli',
      `**Kullanıcı:** ${author.tag} (${author})\n**Filtre:** ${filterType}\n**Mesaj:** ||${message.content}||\n\n*Not: Mesaj otomatik olarak silindi ve sicile uyarı eklendi.*`
    );
  } catch (err) {
    console.error('[SECURITY DELETE HATA]', err);
  }
}

// AI Yardımcıları
async function askAICompletions(prompt, systemPrompt, apiKey, url, model) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/discord-honeypot-bot',
      'X-Title': 'Discord Honeypot Bot'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 10
    })
  });
  if (!response.ok) return 'HAYIR';
  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'HAYIR';
}

async function askGeminiCompletions(prompt, systemPrompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nAnaliz edilecek cümle: "${prompt}"` }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 10 }
    })
  });
  if (!response.ok) return 'HAYIR';
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'HAYIR';
}
