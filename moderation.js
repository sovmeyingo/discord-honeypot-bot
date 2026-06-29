import fs from 'fs';
import path from 'path';

const infractionsFilePath = path.resolve('infractions.json');

// Yetkili rol ID'leri
const MODERATOR_ROLES = ['1502699586425323601', '1502670263010070570', '1503448273648746608'];

// Sicil verilerini yükle
function loadInfractions() {
  try {
    if (fs.existsSync(infractionsFilePath)) {
      const data = fs.readFileSync(infractionsFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[MOD] Sicil verileri yüklenirken hata:', err);
  }
  return {};
}

// Sicil verilerini kaydet
function saveInfractions(data) {
  try {
    fs.writeFileSync(infractionsFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[MOD] Sicil verileri kaydedilirken hata:', err);
  }
}

/**
 * Kullanıcının yetkili olup olmadığını kontrol eder (Belirli roller veya Yönetici yetkisi)
 * @param {import('discord.js').GuildMember} member 
 */
export function isModerator(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  return member.roles.cache.some(role => MODERATOR_ROLES.includes(role.id));
}

/**
 * Kullanıcının siciline ceza ekler
 * @param {string} userId 
 * @param {string} type - 'UYARI', 'TIMEOUT', 'BAN', 'KICK'
 * @param {string} reason 
 * @param {string} moderatorId 
 */
export function addInfraction(userId, type, reason, moderatorId) {
  const data = loadInfractions();
  if (!data[userId]) {
    data[userId] = [];
  }
  
  const caseId = `#${Math.floor(1000 + Math.random() * 9000)}`;
  const infraction = {
    id: caseId,
    type: type.toUpperCase(),
    reason: reason || 'Sebep belirtilmedi.',
    moderator: moderatorId,
    timestamp: Date.now()
  };
  
  data[userId].push(infraction);
  saveInfractions(data);
  return infraction;
}

/**
 * Kullanıcının sicil geçmişini getirir
 * @param {string} userId 
 */
export function getInfractions(userId) {
  const data = loadInfractions();
  return data[userId] || [];
}

/**
 * Kullanıcının sicil geçmişini tamamen temizler
 * @param {string} userId 
 */
export function clearInfractions(userId) {
  const data = loadInfractions();
  if (data[userId]) {
    delete data[userId];
    saveInfractions(data);
    return true;
  }
  return false;
}
