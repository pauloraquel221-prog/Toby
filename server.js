const fs = require('fs');
const path = require('path');
const express = require('express');
const { addonBuilder } = require('stremio-addon-sdk');
const getRouter = require('stremio-addon-sdk/src/getRouter');

const SPORTS_GENRES = [
  'Todos',
  'Futebol',
  'UFC / Lutas',
  'Boxe',
  'Automobilismo',
  'Basquete / NFL',
  'Canais Esportivos'
];

const manifest = {
  id: 'org.iracema.esportes',
  version: '1.0.0',
  name: 'FUTUFC-TV',
  description: 'Catálogo dedicado a esportes, futebol, UFC, boxe e eventos ao vivo',
  resources: ['catalog', 'meta', 'stream'],
  types: ['tv'],
  idPrefixes: ['iracema_esportes_'],
  catalogs: [
    {
      type: 'tv',
      id: 'iracema_esportes_tv',
      name: 'FUTUFC-TV',
      extra: [
        { name: 'genre', isRequired: false, options: SPORTS_GENRES },
        { name: 'search', isRequired: false }
      ]
    }
  ]
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function classifySportGenre(item) {
  const text = normalizeText(`${item.name || ''} ${item.category || ''} ${item.program || ''}`);

  if (/\b(ufc|combate|mma|sft|fight pass|jungle fight|bellator|pfl|one championship|luta)\b/.test(text)) {
    return 'UFC / Lutas';
  }
  if (/\b(boxe|boxing|dazn boxing|triller|fite)\b/.test(text)) {
    return 'Boxe';
  }
  if (/\b(f1|formula 1|motogp|nascar|indy|automobilismo|stock car)\b/.test(text)) {
    return 'Automobilismo';
  }
  if (/\b(nba|nfl|basquete|basketball|futebol americano|redzone)\b/.test(text)) {
    return 'Basquete / NFL';
  }
  if (/\b(futebol|soccer|football|premiere|brasileirao|libertadores|sul-americana|champions|laliga|la liga|premier league|serie a|copa do brasil|cazetv|caze tv|goat|getv|ge tv|ge fast|nosso futebol|paramount|sport tv|eleven|estaduais|prime video)\b/.test(text)) {
    return 'Futebol';
  }
  if (/\b(sportv|espn|bandsports|band sports|tnt sports|fox sports|sky sports|bein|eurosport|movistar|tyc|tudn|dsports|directv|nsports|fuel tv|red bull|fifa\+|pluto tv esportes|sportynet|xsports|x sports|dazn|disney\+|nfl|barretos|esporte|sport|sports)\b/.test(text)) {
    return 'Canais Esportivos';
  }
  return null;
}

const builder = new addonBuilder(manifest);

const BLOCKED_ENTERTAINMENT_RE = /\b(filme|filmes|serie|series|série|séries|documentario|documentário|novela|novelas|anime|animes|dorama|desenho|desenhos|infantil|kids|cartoon|cinema|temporada|episodio|episódio)\b|\bS\d{1,2}E\d{1,3}\b|\[L\]|\[DUB\]|\[LEG\]|\b(19\d{2}|20[0-2][0-4])\b/i;
const itemsById = new Map();

// === IRACEMA_NAMES_QUALITY_PATCH_START ===
function getDefaultNovoMundoUrl() {
  try {
    const nmPath = path.join(process.env.HOME || '', 'iracema-esportes-render', 'provedor', 'xtream', '105-env-novomundo.json');
    if (fs.existsSync(nmPath)) {
      const cfg = JSON.parse(fs.readFileSync(nmPath, 'utf8'));
      if (cfg && typeof cfg.playlistUrl === 'string' && cfg.playlistUrl.trim()) {
        return cfg.playlistUrl.trim();
      }
    }
  } catch (_) {}
  return null;
}

function cleanDisplayName(rawName) {
  let s = String(rawName || '').trim();

  if (s.includes('http://') || s.includes('https://') || /x_\d+,y_\d+/i.test(s) || /c_fill/i.test(s)) {
    const commaParts = s.split(',').map(p => p.trim()).filter(Boolean);
    const cleanPart = [...commaParts].reverse().find(p =>
      !/^https?:\/\//i.test(p) &&
      !p.includes('false)/') &&
      !/x_\d+,y_\d+/i.test(p) &&
      !/c_fill/i.test(p) &&
      !/group-title=/i.test(p)
    );
    if (cleanPart) {
      s = cleanPart;
    } else if (/ge[ _-]?fast|ge[ _-]?tv|getv/i.test(s)) {
      s = 'GE TV';
    } else if (/red[ _-]?bull/i.test(s)) {
      s = 'Red Bull TV';
    }
  }

  const replacements = [
    [/\bcaze[ _-]?tv\b/gi, 'Cazé TV'],
    [/\bparamount\s*\+\b/gi, 'Paramount+'],
    [/\bband[ _-]?sports\b/gi, 'BandSports'],
    [/\b(ge[ _-]?fast|getv|ge[ _-]?tv)\b/gi, 'GE TV'],
    [/\bsporty[ _-]?net\b/gi, 'SportyNet'],
    [/\bx[ _-]?sports\b/gi, 'Xsports'],
    [/\bsport[ _-]?tv\b/gi, 'Sport TV'],
    [/\bsportv\b/gi, 'SporTV'],
    [/\belevensports\b|\beleven[ _-]?sports\b/gi, 'Eleven Sports'],
    [/\bnsports\b/gi, 'NSports'],
    [/\bcanal[ _-]?goat\b/gi, 'Canal GOAT'],
    [/\bred[ _-]?bull([ _-]?tv)?\b/gi, 'Red Bull TV'],
    [/\bprime[ _-]?video\b/gi, 'Prime Video'],
    [/\bdisney\s*\+\b/gi, 'Disney+']
  ];

  for (const [re, rep] of replacements) {
    s = s.replace(re, rep);
  }

  return s.replace(/\s+/g, ' ').trim() || 'Canal Esportivo';
}

function normalizeStreamBaseName(name) {
  return cleanDisplayName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, ' ')
    .replace(/\b(4k|uhd|fhd|full\s*hd|hd|sd|h265|hevc)\b/gi, ' ')
    .replace(/\b(1|2|3|4)\s*$/g, ' ')
    .replace(/\s*[-–—|:/]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractQualityRank(name) {
  const s = String(name || '').toUpperCase();
  if (/\b4K\b/.test(s)) return { rank: 1, tag: '4K' };
  if (/\bUHD\b/.test(s)) return { rank: 2, tag: 'UHD' };
  if (/\bFHD\b|FULL\s*HD/.test(s)) return { rank: 3, tag: 'FHD' };
  if (/H265|HEVC/.test(s)) return { rank: 3, tag: 'HEVC' };
  if (/\bHD\b/.test(s)) return { rank: 4, tag: 'HD' };
  if (/\bSD\b/.test(s)) return { rank: 5, tag: 'SD' };
  return { rank: 6, tag: 'AUTO' };
}
// === IRACEMA_NAMES_QUALITY_PATCH_END ===


function getDefaultNovoMundoUrl() {
  try {
    const nmPath = path.join(process.env.HOME || "", "iracema-esportes-render", "provedor", "xtream", "105-env-novomundo.json");
    if (fs.existsSync(nmPath)) {
      const cfg = JSON.parse(fs.readFileSync(nmPath, "utf8"));
      if (cfg && typeof cfg.playlistUrl === "string" && cfg.playlistUrl.trim()) {
        return cfg.playlistUrl.trim();
      }
    }
  } catch (_) {}
  return null;
}

function normalizeStreamBaseName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, " ")
    .replace(/\b(4k|uhd|fhd|full\s*hd|hd|sd|h265|hevc)\b/gi, " ")
    .replace(/\s*[-–—|:/]+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractQualityRank(name) {
  const s = String(name || "").toUpperCase();
  if (/\b4K\b/.test(s)) return { rank: 1, tag: "4K" };
  if (/\bUHD\b/.test(s)) return { rank: 2, tag: "UHD" };
  if (/\bFHD\b|FULL\s*HD/.test(s)) return { rank: 3, tag: "FHD" };
  if (/\bHD\b/.test(s)) return { rank: 4, tag: "HD" };
  if (/\bSD\b/.test(s)) return { rank: 5, tag: "SD" };
  return { rank: 6, tag: "AUTO" };
}


function isBlockedEntertainment(text) {
  return BLOCKED_ENTERTAINMENT_RE.test(normalizeText(text));
}

function parseM3uContent(content) {
  const lines = String(content || '').split(/\r?\n/);
  const parsed = [];
  let pending = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const commaIdx = line.indexOf(',');
      const title = commaIdx !== -1 ? line.slice(commaIdx + 1).trim() : line;
      pending = {
        name: cleanDisplayName(title),
        category: groupMatch ? groupMatch[1].trim() : '',
        poster: logoMatch && logoMatch[1] ? logoMatch[1].trim() : undefined
      };
    } else if (!line.startsWith('#') && pending) {
      const idBase = normalizeText(`${pending.name}_${line}`).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || String(parsed.length + 1);
      parsed.push({
        id: idBase,
        name: pending.name,
        category: pending.category,
        poster: pending.poster,
        streamUrl: line
      });
      pending = null;
    }
  }
  return parsed;
}

function extractItemsFromJsonData(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const buckets = [data.channels, data.events, data.items, data.data, data.streams];
  const out = [];
  for (const bucket of buckets) {
    if (Array.isArray(bucket)) out.push(...bucket);
  }
  return out;
}

async function readSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${source}`);
    const text = await res.text();
    if (source.toLowerCase().includes('.m3u') || text.trimStart().startsWith('#EXTM3U')) {
      return parseM3uContent(text);
    }
    return extractItemsFromJsonData(JSON.parse(text));
  }

  const resolvedPath = path.resolve(source);
  if (!fs.existsSync(resolvedPath)) return [];
  const content = fs.readFileSync(resolvedPath, 'utf8');
  if (resolvedPath.toLowerCase().endsWith('.m3u') || content.trimStart().startsWith('#EXTM3U')) {
    return parseM3uContent(content);
  }
  return extractItemsFromJsonData(JSON.parse(content));
}

async function loadSportsItems() {
  const defaultNovoMundo = getDefaultNovoMundoUrl();
  const defaultCandidates = defaultNovoMundo
    ? [defaultNovoMundo]
    : [
        path.join(process.env.HOME || '', 'iracema-esportes-render', 'embedTV.json'),
        path.join(process.env.HOME || '', 'iracema-esportes-render', 'playlist-real-full.m3u')
      ];

  const envSources = String(process.env.SPORTS_SOURCES || process.env.SPORTS_SOURCE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const sources = envSources.length ? envSources : defaultCandidates;
  const collected = [];

  for (const srcItem of sources) {
    try {
      const entries = await readSource(srcItem);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i] || {};
        const name = String(entry.name || entry.title || entry.channel_name || '').trim();
        const category = String(entry.category || entry.group || entry.league?.name || entry.sport || '').trim();
        const description = String(entry.description || entry.competition || category || 'Transmissão esportiva').trim();
        const poster = entry.poster || entry.logo || entry.logo_url || entry.image || undefined;
        const streamUrl = entry.streamUrl || entry.url || entry.stream_url || entry.link || entry.embed || null;

        if (!name) continue;
        if (isBlockedEntertainment(`${name} ${category} ${description}`)) continue;

        const rawId = String(entry.id || entry.slug || `item_${i + 1}_${normalizeText(name).replace(/[^a-z0-9]+/g, '_').slice(0, 30)}`);
        collected.push({
          id: rawId,
          name,
          category,
          description,
          poster,
          streamUrl
        });
      }
    } catch (err) {
      console.warn(`[Fonte ignorada] ${srcItem}: ${err.message}`);
    }
  }

  return collected;
}

builder.defineCatalogHandler(async ({ type, id, extra = {} }) => {
  if (type !== 'tv' || id !== 'iracema_esportes_tv') return { metas: [] };

  const rawItems = await loadSportsItems();

  const search = normalizeText(extra.search);
  const selectedGenre = String(extra.genre || 'Todos');

  itemsById.clear();

  const metas = rawItems
    .map((item) => {
      const sportGenre = classifySportGenre(item);
      if (!sportGenre) return null;
      const fullId = `iracema_esportes_${item.id}`;
      const metaObj = {
        id: fullId,
        type: 'tv',
        name: cleanDisplayName(item.name),
        poster: item.poster || undefined,
        posterShape: 'square',
        genres: [sportGenre],
        description: item.description || item.program || 'Transmissão esportiva'
      };
      itemsById.set(fullId, { ...metaObj, streamUrl: item.streamUrl || null });
      return metaObj;
    })
    .filter(Boolean)
    .filter((meta) => {
      if (selectedGenre !== 'Todos' && !meta.genres.includes(selectedGenre)) return false;
      if (search && !normalizeText(`${meta.name} ${meta.description}`).includes(search)) return false;
      return true;
    });

  return { metas };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== 'tv' || !String(id).startsWith('iracema_esportes_')) return { meta: null };
  const cached = itemsById.get(id);
  if (cached) {
    const { streamUrl: _ignored, ...cleanMeta } = cached;
    return { meta: cleanMeta };
  }
  return {
    meta: {
      id,
      type: 'tv',
      name: id.replace('iracema_esportes_', ''),
      posterShape: 'square'
    }
  };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'tv' || !String(id).startsWith('iracema_esportes_')) return { streams: [] };
  const item = itemsById.get(id);
  if (!item || !item.streamUrl) return { streams: [] };

  const targetKey = normalizeStreamBaseName(item.name);
  const candidates = [];

  for (const cand of itemsById.values()) {
    if (!cand || !cand.streamUrl) continue;
    const candKey = normalizeStreamBaseName(cand.name);
    if (cand.id === item.id || (targetKey && candKey === targetKey)) {
      const q = extractQualityRank(cand.name);
      candidates.push({
        rank: q.rank,
        tag: q.tag,
        name: cleanDisplayName(cand.name),
        url: cand.streamUrl
      });
    }
  }

  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  const seenUrls = new Set();
  const streams = [];
  for (const c of candidates) {
    if (seenUrls.has(c.url)) continue;
    seenUrls.add(c.url);
    streams.push({
      name: `FUTUFC-TV [${c.tag}]`,
      title: c.name,
      url: c.url
    });
  }

  if (streams.length === 0) {
    const q = extractQualityRank(item.name);
    streams.push({
      name: `FUTUFC-TV [${q.tag}]`,
      title: cleanDisplayName(item.name),
      url: item.streamUrl
    });
  }

  return { streams };
});

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'iracema-esportes' });
});

app.use(getRouter(builder.getInterface()));

const PORT = Number(process.env.PORT) || 7000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FUTUFC-TV rodando na porta ${PORT}`);
});
