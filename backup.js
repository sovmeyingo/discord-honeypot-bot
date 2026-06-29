import fs from 'fs';
import path from 'path';

const backupsDir = path.resolve('backups');

// Yedek klasörünü oluştur
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

/**
 * Sunucunun kanallarını, rollerini ve izinlerini yedekler
 * @param {import('discord.js').Guild} guild 
 */
export async function createBackup(guild) {
  const timestamp = Date.now();
  const backupId = `yedek_${guild.id}_${timestamp}`;
  const backupPath = path.join(backupsDir, `${backupId}.json`);

  console.log(`[BACKUP] Sunucu yedekleme başlatıldı: ${guild.name}`);

  // 1. Rolleri Yedekle (botun kendi entegrasyon rolü ve @everyone hariç)
  const roles = [];
  const guildRoles = await guild.roles.fetch();
  guildRoles.forEach(role => {
    if (role.managed) return; // Entegrasyon rolleri atlanmalı
    roles.push({
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      permissions: role.permissions.bitfield.toString(),
      position: role.position,
      mentionable: role.mentionable
    });
  });

  // 2. Kanalları ve Kategorileri Yedekle
  const channels = [];
  const guildChannels = await guild.channels.fetch();
  
  guildChannels.forEach(channel => {
    if (!channel) return;
    
    const overwrites = [];
    channel.permissionOverwrites.cache.forEach(overwrite => {
      // Üyeye özel veya role özel izinler
      let targetName = '';
      if (overwrite.type === 0) { // Rol
        const role = guild.roles.cache.get(overwrite.id);
        targetName = role ? role.name : '@everyone';
      } else { // Üye
        const member = guild.members.cache.get(overwrite.id);
        targetName = member ? member.user.tag : 'Bilinmeyen Üye';
      }
      
      overwrites.push({
        id: overwrite.id,
        type: overwrite.type,
        targetName: targetName,
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString()
      });
    });

    channels.push({
      name: channel.name,
      type: channel.type,
      position: channel.position,
      parentName: channel.parent ? channel.parent.name : null,
      topic: channel.topic || null,
      nsfw: channel.nsfw || false,
      bitrate: channel.bitrate || null,
      userLimit: channel.userLimit || null,
      permissionOverwrites: overwrites
    });
  });

  const backupData = {
    id: backupId,
    guildName: guild.name,
    timestamp: timestamp,
    roles: roles,
    channels: channels
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`[BACKUP] Yedekleme tamamlandı. ID: ${backupId}`);
  return backupId;
}

/**
 * Sunucu yedeğini yükler (Mevcut kanalları siler ve yedekten yeniden oluşturur)
 * @param {import('discord.js').Guild} guild 
 * @param {string} backupId 
 */
export async function loadBackup(guild, backupId) {
  const backupPath = path.join(backupsDir, `${backupId}.json`);
  if (!fs.existsSync(backupPath)) {
    throw new Error('Belirtilen yedek dosyası bulunamadı.');
  }

  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  console.log(`[BACKUP] Yedek yükleniyor: ${backupData.guildName}`);

  // 1. Mevcut kanalları sil (Yıkıcı işlem!)
  const currentChannels = await guild.channels.fetch();
  for (const channel of currentChannels.values()) {
    if (channel) {
      try {
        await channel.delete('Yedek yükleme öncesi kanal temizliği.');
      } catch (err) {
        console.error(`Kanal silinemedi (${channel.name}):`, err.message);
      }
    }
  }

  // 2. Rolleri yeniden yapılandır/oluştur (Bot rolü ve @everyone hariç)
  const createdRoles = new Map();
  // @everyone rolünü map'le
  createdRoles.set('@everyone', guild.roles.everyone);

  for (const roleData of backupData.roles) {
    if (roleData.name === '@everyone') {
      try {
        await guild.roles.everyone.setPermissions(BigInt(roleData.permissions));
      } catch (err) {
        console.error('@everyone izinleri güncellenemedi:', err.message);
      }
      continue;
    }
    
    // Rol zaten varsa güncelle, yoksa oluştur
    let role = guild.roles.cache.find(r => r.name === roleData.name && !r.managed);
    try {
      if (!role) {
        role = await guild.roles.create({
          name: roleData.name,
          color: roleData.color,
          hoist: roleData.hoist,
          permissions: BigInt(roleData.permissions),
          mentionable: roleData.mentionable,
          reason: 'Yedekten geri yükleme.'
        });
      } else {
        await role.edit({
          color: roleData.color,
          hoist: roleData.hoist,
          permissions: BigInt(roleData.permissions),
          mentionable: roleData.mentionable
        });
      }
      createdRoles.set(roleData.name, role);
    } catch (err) {
      console.error(`Rol oluşturulamadı (${roleData.name}):`, err.message);
    }
  }

  // 3. Kategorileri oluştur
  const createdCategories = new Map();
  const categoriesData = backupData.channels.filter(c => c.type === 4); // 4 = GuildCategory
  
  for (const catData of categoriesData) {
    try {
      const category = await guild.channels.create({
        name: catData.name,
        type: 4,
        position: catData.position,
        reason: 'Yedekten geri yükleme (Kategori).'
      });
      createdCategories.set(catData.name, category);
    } catch (err) {
      console.error(`Kategori oluşturulamadı (${catData.name}):`, err.message);
    }
  }

  // 4. Diğer kanalları oluştur (Metin ve Ses)
  const textAndVoiceData = backupData.channels.filter(c => c.type !== 4);
  
  for (const chanData of textAndVoiceData) {
    try {
      const parent = chanData.parentName ? createdCategories.get(chanData.parentName) : null;
      
      // Kanalı oluştur
      const channel = await guild.channels.create({
        name: chanData.name,
        type: chanData.type,
        parent: parent ? parent.id : null,
        position: chanData.position,
        topic: chanData.topic,
        nsfw: chanData.nsfw,
        bitrate: chanData.bitrate || undefined,
        userLimit: chanData.userLimit || undefined,
        reason: 'Yedekten geri yükleme.'
      });

      // İzinleri yapılandır
      const overwrites = [];
      for (const ow of chanData.permissionOverwrites) {
        let targetId = '';
        if (ow.type === 0) { // Rol
          const role = createdRoles.get(ow.targetName);
          if (role) targetId = role.id;
        } else { // Üye
          const member = guild.members.cache.find(m => m.user.tag === ow.targetName);
          if (member) targetId = member.id;
        }

        if (targetId) {
          overwrites.push({
            id: targetId,
            allow: BigInt(ow.allow),
            deny: BigInt(ow.deny)
          });
        }
      }

      if (overwrites.length > 0) {
        await channel.permissionOverwrites.set(overwrites);
      }
    } catch (err) {
      console.error(`Kanal oluşturulamadı (${chanData.name}):`, err.message);
    }
  }

  console.log(`[BACKUP] Yedek başarıyla geri yüklendi.`);
  return backupData;
}

/**
 * Mevcut yedekleri listeler
 */
export function listBackups() {
  if (!fs.existsSync(backupsDir)) return [];
  const files = fs.readdirSync(backupsDir);
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(backupsDir, f), 'utf-8'));
      return {
        id: data.id,
        guildName: data.guildName,
        date: new Date(data.timestamp).toLocaleString('tr-TR'),
        channelsCount: data.channels.length,
        rolesCount: data.roles.length
      };
    });
}
