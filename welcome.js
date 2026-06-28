import { logSecurityEvent } from './security.js';

const UNVERIFIED_ROLE_ID = process.env.UNVERIFIED_ROLE_ID;

/**
 * Sunucuya biri katıldığında tetiklenir
 * @param {import('discord.js').GuildMember} member 
 */
export async function handleMemberJoin(member) {
  // 1. Hesap Yaşı Kontrolü (Minimum 3 Gün)
  // 3 gün = 3 * 24 * 60 * 60 * 1000 milisaniye
  const minAgeMs = 3 * 24 * 60 * 60 * 1000;
  const accountAgeMs = Date.now() - member.user.createdTimestamp;

  if (accountAgeMs < minAgeMs) {
    try {
      console.log(`[GÜVENLİK] Şüpheli Hesap Engellendi: ${member.user.tag} (${member.id})`);
      
      // Kullanıcıyı sunucudan at
      await member.kick('Güvenlik: Discord hesabı 3 günden daha yeni (Şüpheli bot/raid hesabı).');

      // Güvenlik loguna bildirim gönder
      await logSecurityEvent(
        member.guild,
        'Yeni Hesap Engeli (Anti-Raid)',
        `Sunucuya katılmaya çalışan **${member.user.tag}** (${member.id}) hesabı **3 günden daha yeni** olduğu için sunucudan otomatik olarak atıldı (kick).`
      );
      return; // İşlemleri sonlandır
    } catch (err) {
      console.error('[HATA] Şüpheli hesap atılırken hata oluştu:', err);
    }
  }

  // 2. Doğrulanmamış Rolünü Tanımlama (1520827364123082953)
  try {
    await member.roles.add(UNVERIFIED_ROLE_ID);
    console.log(`[ROL] ${member.user.tag} sunucuya katıldı. Otomatik "Doğrulanmamış" rolü verildi.`);
  } catch (error) {
    console.error(`[HATA] Otomatik doğrulanmamış rol (${UNVERIFIED_ROLE_ID}) verilirken hata oluştu:`, error);
    console.error(`Botun rolünün, sunucu ayarlarında "Doğrulanmamış" rolünün üstünde olduğundan emin olun.`);
  }
}
