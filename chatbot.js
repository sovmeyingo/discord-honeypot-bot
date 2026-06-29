import fs from 'fs';
import path from 'path';

const memoryFilePath = path.resolve('memory.json');

// Belleği yükle
function loadMemory() {
  try {
    if (fs.existsSync(memoryFilePath)) {
      const data = fs.readFileSync(memoryFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[CHATBOT] Bellek dosyası yüklenemedi, yeni bellek oluşturuluyor:', err);
  }
  return {};
}

// Belleği kaydet
function saveMemory(memory) {
  try {
    fs.writeFileSync(memoryFilePath, JSON.stringify(memory, null, 2), 'utf-8');
  } catch (err) {
    console.error('[CHATBOT] Bellek dosyası kaydedilemedi:', err);
  }
}

// OpenAI Uyumlu API'ler için (Groq, OpenRouter)
async function askOpenAICompatible(prompt, userMemory, apiKey, provider) {
  let url, model;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  if (provider === 'groq') {
    url = 'https://api.groq.com/openai/v1/chat/completions';
    model = 'llama-3.1-8b-instant'; // Groq üzerinde ücretsiz ve hızlı Llama 3.1 modeli
  } else if (provider === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/chat/completions';
    model = 'meta-llama/llama-3-8b-instruct:free'; // OpenRouter ücretsiz Llama 3 modeli
    headers['HTTP-Referer'] = 'https://github.com/discord-honeypot-bot';
    headers['X-Title'] = 'Discord Honeypot Bot';
  }

  const history = userMemory.history || [];
  const profile = userMemory.profile || 'Kullanıcı hakkında henüz hiçbir şey bilinmiyor.';
  const lastTopic = userMemory.lastTopic || 'Henüz bir konu konuşulmadı.';

  const systemInstruction = `Sen bir Discord sunucusunda çalışan zeki, samimi ve yardımsever bir yapay zeka asistanısın. Kullanıcılar sana "ai " yazarak ulaşıyor. 
Konuştuğun kullanıcı hakkında bilinen bilgiler şunlar:
[KULLANICI_PROFİLİ]
${profile}

En son konuştuğunuz konu: ${lastTopic}

Görevlerin:
1. Sohbet geçmişine ve kullanıcı hakkındaki bilgilere dayanarak samimi, doğal ve yardımcı bir cevap ver.
2. Bu konuşma sırasında kullanıcının kendisi hakkında verdiği yeni bilgileri (örneğin ismi, hobileri, ilgi alanları veya bahsettiği önemli şeyler) tespit et.
3. Cevabının en sonuna tam olarak şu formatta güncellenmiş bilgileri ekle:
|||{"profile": "kullanıcı hakkında bilinen tüm güncel bilgilerin tek cümlelik özeti", "lastTopic": "şu an konuşulan ana konu"}|||
Bu JSON bloğu cevabın sonunda mutlaka olmalı ve kullanıcı hakkında yeni bir şey öğrenmediysen bile mevcut bilgileri koruyarak yer almalı. Kullanıcı bu JSON kısmını görmeyecektir.`;

  const messages = [
    { role: 'system', content: systemInstruction }
  ];

  // Sohbet geçmişini ekle (OpenAI formatı için assistant ve user rolleri kullanılır)
  history.forEach(item => {
    messages.push({
      role: item.role === 'model' ? 'assistant' : item.role,
      content: item.content
    });
  });

  // Yeni soruyu ekle
  messages.push({ role: 'user', content: prompt });

  const payload = {
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 800
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${provider.toUpperCase()} API Hatası (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const rawResponse = result.choices?.[0]?.message?.content;
  if (!rawResponse) {
    throw new Error(`${provider.toUpperCase()} boş yanıt döndürdü.`);
  }

  return rawResponse;
}

// Gemini API'sine istek gönder
async function askGemini(prompt, userMemory, geminiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`;
  
  const history = userMemory.history || [];
  const profile = userMemory.profile || 'Kullanıcı hakkında henüz hiçbir şey bilinmiyor.';
  const lastTopic = userMemory.lastTopic || 'Henüz bir konu konuşulmadı.';

  const chatContents = history.map(item => ({
    role: item.role === 'assistant' ? 'model' : item.role,
    parts: [{ text: item.content }]
  }));

  chatContents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });

  const systemInstruction = `Sen bir Discord sunucusunda çalışan zeki, samimi ve yardımsever bir yapay zeka asistanısın. Kullanıcılar sana "ai " yazarak ulaşıyor. 
Konuştuğun kullanıcı hakkında bilinen bilgiler şunlar:
[KULLANICI_PROFİLİ]
${profile}

En son konuştuğunuz konu: ${lastTopic}

Görevlerin:
1. Sohbet geçmişine ve kullanıcı hakkındaki bilgilere dayanarak samimi, doğal ve yardımcı bir cevap ver.
2. Bu konuşma sırasında kullanıcının kendisi hakkında verdiği yeni bilgileri (örneğin ismi, hobileri, ilgi alanları veya bahsettiği önemli şeyler) tespit et.
3. Cevabının en sonuna tam olarak şu formatta güncellenmiş bilgileri ekle:
|||{"profile": "kullanıcı hakkında bilinen tüm güncel bilgilerin tek cümlelik özeti", "lastTopic": "şu an konuşulan ana konu"}|||
Bu JSON bloğu cevabın sonunda mutlaka olmalı ve kullanıcı hakkında yeni bir şey öğrenmediysen bile mevcut bilgileri koruyarak yer almalı. Kullanıcı bu JSON kısmını görmeyecektir.`;

  const payload = {
    contents: chatContents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Hatası (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) {
    throw new Error('Gemini API boş yanıt döndürdü.');
  }

  return rawText;
}

// API Ninjas Chatbot API'sine istek gönder (Hafızasız Fallback)
async function askApiNinjas(prompt, apiKey) {
  const url = `https://api.api-ninjas.com/v1/chatbot?text=${encodeURIComponent(prompt)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Ninjas Hatası (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return result.response || 'Bir cevap alınamadı.';
}

export async function handleChatbotMessage(message) {
  const content = message.content;
  
  const triggerRegex = /^ai\s+(.+)$/i;
  const match = content.match(triggerRegex);
  
  if (!match) return;
  
  const userPrompt = match[1].trim();
  if (!userPrompt) return;

  const groqKey = process.env.GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiNinjasKey = process.env.API_NINJAS_KEY || 'oeSNLor4nQRwVUyKvf1f42XHlfBulJe9KMeJtvjh';

  try {
    await message.channel.sendTyping();
  } catch (err) {
    // Yazıyor durumunu tetikleyemezsek hatayı yut
  }

  const userId = message.author.id;
  const memory = loadMemory();

  if (!memory[userId]) {
    memory[userId] = {
      profile: `Kullanıcının Discord adı: ${message.author.displayName || message.author.username}.`,
      lastTopic: 'Sohbet yeni başladı.',
      history: []
    };
  }

  const userMemory = memory[userId];

  try {
    let rawResponse = '';
    let isMemorySupported = false;

    if (groqKey && groqKey !== 'YOUR_GROQ_KEY') {
      // 1. Groq (Llama 3) - Hafızalı
      rawResponse = await askOpenAICompatible(userPrompt, userMemory, groqKey, 'groq');
      isMemorySupported = true;
    } else if (openrouterKey && openrouterKey !== 'YOUR_OPENROUTER_KEY') {
      // 2. OpenRouter (Llama 3 Free) - Hafızalı
      rawResponse = await askOpenAICompatible(userPrompt, userMemory, openrouterKey, 'openrouter');
      isMemorySupported = true;
    } else if (geminiKey && geminiKey !== 'YOUR_GEMINI_KEY') {
      // 3. Gemini - Hafızalı
      rawResponse = await askGemini(userPrompt, userMemory, geminiKey);
      isMemorySupported = true;
    } else if (apiNinjasKey) {
      // 4. API Ninjas - Hafızasız Fallback
      const reply = await askApiNinjas(userPrompt, apiNinjasKey);
      await message.reply(reply);
      return;
    } else {
      await message.reply('⚠️ Yapay Zeka sohbet özelliğini kullanabilmek için lütfen `.env` dosyasına `GROQ_API_KEY`, `OPENROUTER_API_KEY` veya `GEMINI_API_KEY` ekleyin!');
      return;
    }

    if (isMemorySupported) {
      const separator = '|||';
      const parts = rawResponse.split(separator);
      let reply = parts[0].trim();
      
      if (parts[1]) {
        try {
          const parsed = JSON.parse(parts[1].trim());
          userMemory.profile = parsed.profile || userMemory.profile;
          userMemory.lastTopic = parsed.lastTopic || userMemory.lastTopic;
        } catch (e) {
          // JSON ayrıştırma hatasını yut
        }
      }

      // Geçmişe ekle (Son 10 soru-cevap çiftini tut)
      userMemory.history.push({ role: 'user', content: userPrompt });
      userMemory.history.push({ role: 'assistant', content: reply });
      if (userMemory.history.length > 20) {
        userMemory.history = userMemory.history.slice(-20);
      }

      saveMemory(memory);
      await message.reply(reply);
    }
  } catch (error) {
    console.error('[CHATBOT HATA]', error);
    await message.reply('❌ Üzgünüm, yapay zeka servisine bağlanırken bir hata oluştu.');
  }
}
