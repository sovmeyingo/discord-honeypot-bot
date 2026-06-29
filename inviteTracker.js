import { EmbedBuilder } from 'discord.js';

// Davetlerin önbelleği: Map<guildId, Map<inviteCode, uses>>
const guildInvites = new Map();

/**
 * Davet takipçisini başlatır ve mevcut davetleri önbelleğe alır
 * @param {import('discord.js').Client} client 
 */
export async function initInviteTracker(client) {
  console.log('[INVITE] Davet önbelleği hazırlanıyor...');
  for (const guild of client.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      const codeToUses = new Map();
      invites.forEach(inv => codeToUses.set(inv.code, inv.uses));
      guildInvites.set(guild.id, codeToUses);
    } catch (err) {
      // Guild invites fetch fail (usually missing Manage Guild permission)
      console.warn(`[INVITE] ${guild.name} sunucusu için davetler çekilemedi:`, err.message);
    }
  }
  console.log('[INVITE] Davet önbelleği başarıyla yüklendi.');
}

/**
 * Yeni davet oluşturulduğunda önbelleği günceller
 * @param {import('discord.js').Invite} invite 
 */
export function handleInviteCreate(invite) {
  if (!invite.guild) return;
  const invites = guildInvites.get(invite.guild.id) || new Map();
  invites.set(invite.code, invite.uses);
  guildInvites.set(invite.guild.id, invites);
}

/**
 * Davet silindiğinde önbellekten kaldırır
 * @param {import('discord.js').Invite} invite 
 */
export function handleInviteDelete(invite) {
  if (!invite.guild) return;
  const invites = guildInvites.get(invite.guild.id);
  if (invites) {
    invites.delete(invite.code);
  }
}

/**
 * Üye katıldığında daveti tespit eder ve loglar
 * @param {import('discord.js').GuildMember} member 
 */
export async function trackMemberInvite(member) {
  const logChannelId = '1502732801617825812';
  const logChannel = member.guild.channels.cache.get(logChannelId);
  
  try {
    // Sunucunun güncel davet listesini çek
    const currentInvites = await member.guild.invites.fetch();
    const cached = guildInvites.get(member.guild.id);
    
    let usedInvite = null;
    
    // Değişen daveti bul
    for (const inv of currentInvites.values()) {
      const oldUses = cached ? cached.get(inv.code) : null;
      if (oldUses !== null && inv.uses > oldUses) {
        usedInvite = inv;
        break;
      }
    }
    
    // Önbelleği güncelle
    const updatedCache = new Map();
    currentInvites.forEach(inv => updatedCache.set(inv.code, inv.uses));
    guildInvites.set(member.guild.id, updatedCache);
    
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
        
      if (usedInvite) {
        const inviter = usedInvite.inviter;
        const inviterText = inviter ? `<@${inviter.id}> (${inviter.tag})` : 'Bilinmeyen';
        
        embed.setColor('#2ecc71') // Yeşil renk
          .setAuthor({ name: 'Üye Katıldı (Davet Tespit Edildi)', iconURL: member.guild.iconURL() })
          .setDescription(`📥 **Üye:** ${member} (${member.user.tag})\n👤 **Davet Eden:** ${inviterText}\n🔑 **Davet Kodu:** \`${usedInvite.code}\`\n📊 **Toplam Davet Sayısı:** \`${usedInvite.uses}\``);
      } else {
        embed.setColor('#7f8c8d') // Gri renk
          .setAuthor({ name: 'Üye Katıldı (Doğrudan/Vanity)', iconURL: member.guild.iconURL() })
          .setDescription(`📥 **Üye:** ${member} (${member.user.tag})\n🔗 **Giriş Türü:** Özel Link (Vanity URL), Widget veya Bot yardımıyla doğrudan katıldı.`);
      }
      
      await logChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('[INVITE HATA] Katılım takibi sırasında hata:', err);
  }
}
