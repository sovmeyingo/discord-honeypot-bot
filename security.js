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
