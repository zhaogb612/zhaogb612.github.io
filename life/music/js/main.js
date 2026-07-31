/* ============================================================
   简乐播放器 - 主逻辑
   数据经本地代理（server.js）转发，规避浏览器跨域限制：
     搜索 → 网易云音乐官方接口
     解析 → 并行请求 祈杰 Meting-API（api.qijieya.cn/meting）、
            网易云解析聚合站（onechara.eu.org / api.bugpk.com）、
            备源 GD音乐台（music-api.gdstudio.xyz/api.php）
   说明：对搜索、封面、歌词均做了缓存以减少请求
   ============================================================ */

'use strict';

/* ---------------- 配置与常量 ---------------- */
const API_BASE = '/api';    // 本地代理（server.js），同源无跨域
/* 直连模式数据源（静态博客无后端）：按顺序轮换，前一个源不可用（网络/CORS/空结果）时自动切换下一个。
   两源均为 meting 协议、支持 CORS；i-meto 搜索在浏览器实测可用（VIP 歌曲仅 45s 试听），qijieya 搜索在浏览器被拦但 url 接口可用 */
const DIRECT_SOURCES = [
  'https://api.i-meto.com/meting/api',  // i-meto：字段 title/author
  'https://api.qijieya.cn/meting',      // 祈杰：字段 name/artist
];
let directIdx = 0; // 当前直连源下标
/* 祈杰 type=url 播放接口（注意末尾斜杠，避免 301）：VIP 完整解析（浏览器实测返回全曲，
   而 i-meto 对 VIP 只给 45s 试听）、免签名、支持 CORS */
const VIP_URL_API = 'https://api.qijieya.cn/meting/';
let apiMode = 'proxy';      // proxy: /api 代理（本地开发） | direct: 直连（静态部署）
const SOURCE = 'netease';   // 音乐源
const COUNT = 30;           // 每次搜索返回条数
const SETTINGS_KEY = 'jy-player-settings';

/* 探测本地 /api 代理是否可用：可用走代理（本地开发），否则切换直连（博客静态部署） */
async function probeApi() {
  try {
    const res = await fetch(`${API_BASE}/search?keywords=test&limit=1`);
    if (res.ok) { apiMode = 'proxy'; return; }
  } catch { /* 无代理 → 直连 */ }
  apiMode = 'direct';
}
function isDirect() { return apiMode === 'direct'; }
function directBase() { return DIRECT_SOURCES[directIdx]; }
/* 拼当前直连源的 meting 请求地址（server=netease 固定） */
function directUrl(params) {
  const u = new URL(directBase());
  u.searchParams.set('server', 'netease');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}
/* 统一两种源的搜索返回字段（qijieya: name/artist，i-meto: title/author） */
function parseDirectSong(s) {
  const m = String(s.url || '').match(/[?&]id=(\d+)/);
  const sid = m ? m[1] : String(s.id || '');
  const artist = Array.isArray(s.artist)
    ? s.artist
    : String(s.artist || s.author || '').split('/').map((t) => t.trim()).filter(Boolean);
  return {
    id: sid,
    name: s.name || s.title || '',
    artist,
    album: s.album || '',
    pic: s.pic || '',   // 源返回的封面接口（302 或带 auth），可直接用于 <img>
    url: s.url || '',   // 源返回的播放接口（302 或带 auth），可直接用于 <audio>
    lrc: s.lrc || '',   // 源返回的歌词接口（i-meto 带 auth）
    pic_id: sid,
    lyric_id: sid,
    source: 'netease',
  };
}
/* 直连搜索：当前源失败/空结果时自动轮换下一个源，全部源尝试完才返回空 */
async function directSearch(keyword, tried = 0) {
  if (tried >= DIRECT_SOURCES.length) return [];
  try {
    const data = await fetchJson(directUrl({ type: 'search', id: keyword, limit: COUNT }));
    const list = Array.isArray(data) ? data : [];
    if (list.length) return list.map(parseDirectSong);
  } catch (err) {
    console.warn(`直连源 ${directBase()} 搜索失败，切换备用源：`, err);
  }
  directIdx = (directIdx + 1) % DIRECT_SOURCES.length;
  return directSearch(keyword, tried + 1);
}

/* ---------------- DOM 引用 ---------------- */
const audio = document.getElementById('audio');
audio.crossOrigin = 'anonymous'; // 直连跨域音频（i-meto → 网易云 CDN）需 CORS 批准，否则经 WebAudio 可视化时被静音（有进度无声）
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const disc = document.getElementById('disc');
const coverImg = document.getElementById('coverImg');
const coverFallback = document.getElementById('coverFallback');
const coverLoader = document.getElementById('coverLoader');
const songName = document.getElementById('songName');
const songArtist = document.getElementById('songArtist');
const songAlbum = document.getElementById('songAlbum');
const btnPlay = document.getElementById('btnPlay');
const btnMode = document.getElementById('btnMode');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const progress = document.getElementById('progress');
const progressFill = document.getElementById('progressFill');
const timeCurrent = document.getElementById('timeCurrent');
const timeTotal = document.getElementById('timeTotal');
const btnMute = document.getElementById('btnMute');
const volSlider = document.getElementById('volSlider');
const volumeWrap = document.getElementById('volumeWrap');
const btnPlaylist = document.getElementById('btnPlaylist');
const btnVisual = document.getElementById('btnVisual');
const playlistPanel = document.getElementById('playlistPanel');
const plClose = document.getElementById('plClose');
const plClear = document.getElementById('plClear');
const plCount = document.getElementById('plCount');
const plBody = document.getElementById('plBody');
const lyricsBox = document.getElementById('lyricsBox');
const visCanvas = document.getElementById('visualizer');
const visWrap = document.getElementById('visualizer').parentElement;
const searchModal = document.getElementById('searchModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const settingsModal = document.getElementById('settingsModal');
const btnSettings = document.getElementById('btnSettings');
const btnClean = document.getElementById('btnClean');
const bgArt = document.getElementById('bgArt');
const cacheStats = document.getElementById('cacheStats');
const btnClearCache = document.getElementById('btnClearCache');
const toastEl = document.getElementById('toast');

/* ---------------- 状态 ---------------- */
const state = {
  playlist: [],   // 当前搜索结果列表
  index: -1,      // 当前歌曲下标
  current: null,  // 当前歌曲对象
  loading: false,
  urlLoaded: false, // 当前歌曲播放链接是否已就绪
};

const picCache = new Map();     // pic_id -> 封面 url
const lyricCache = new Map();   // lyric_id -> {lyric, tlyric}
const searchCache = new Map();  // 关键词 -> 搜索结果（避免重复搜索）
let searchSeq = 0;              // 搜索请求序号，防止过期响应覆盖新结果
let lrcItems = [];              // 解析后的歌词 {time, text, translation}
let lastLrcIndex = -1;
let scrubbing = false;
let pendingSeek = null;
let currentResults = [];        // 当前弹窗中的搜索结果
let lastVolume = 0.8;

/* 播放模式：loop 列表循环 / single 单曲循环 / shuffle 随机播放 / list 顺序播放 */
const MODE_NAMES = { loop: '列表循环', single: '单曲循环', shuffle: '随机播放', list: '顺序播放' };
const MODE_ORDER = ['loop', 'single', 'shuffle', 'list'];
let playMode = localStorage.getItem('jy-player-mode') || 'loop';
if (!(playMode in MODE_NAMES)) playMode = 'loop';

/* 用户播放列表（持久化到 localStorage） */
const PLAYLIST_KEY = 'jy-user-playlist';
let userPlaylist = loadPlaylist();
let playlistSnapshot = null; // 当前队列来源为播放列表时的快照

function loadPlaylist() {
  try {
    const arr = JSON.parse(localStorage.getItem(PLAYLIST_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function savePlaylist() {
  try { localStorage.setItem(PLAYLIST_KEY, JSON.stringify(userPlaylist)); } catch { /* 忽略 */ }
}

function setMode(mode, silent) {
  playMode = mode;
  try { localStorage.setItem('jy-player-mode', mode); } catch { /* 忽略 */ }
  btnMode.querySelectorAll('svg').forEach((s) => {
    s.classList.toggle('active', s.classList.contains(`m-ico-${mode}`));
  });
  btnMode.title = `播放模式：${MODE_NAMES[mode]}`;
  if (!silent) toast(`播放模式：${MODE_NAMES[mode]}`);
}

btnMode.addEventListener('click', () => {
  setMode(MODE_ORDER[(MODE_ORDER.indexOf(playMode) + 1) % MODE_ORDER.length]);
});

/* ---------------- 设置 ---------------- */
const DEFAULT_SETTINGS = {
  theme: 'red',          // 主题配色 red/blue/green/purple/orange/custom
  themeColor: '#ff4757', // 自定义主题色（theme 为 custom 时生效）
  cornerStyle: 'rounded', // 圆角样式 rounded/less/square
  coverStyle: 'vinyl',   // vinyl 黑胶唱片 / circle 圆形 / square 圆角方形
  lyricAlign: 'center',  // left 左对齐 / center 居中 / right 右对齐
  lyricEffect: 'zoom',   // 歌词动画 karaoke 卡拉OK / zoom 高亮放大 / color 仅高亮 / none 无效果
  lyricFont: 'mono',     // 歌词字体 default/serif/kaiti/fangsong/mono
  lyricSize: 'large',    // 歌词字号 small/medium/large
  visStyle: 'wave',      // 音频可视化样式 bar 柱状 / wave 波形 / dot 圆点
  visGain: 1.0,          // 可视化波动灵敏度（0.5~2.5），影响柱高/圆点尺寸
  background: 'dynamic', // 背景样式 default 默认 / glass 玻璃 / frosted 毛玻璃 / gradient 静态渐变 / dynamic 动态背景
  panelOpacity: 10,      // 面板背景不透明度（0~100），控制左右面板与歌词背景的可见程度
  showTranslation: true, // 是否显示歌词翻译
  keybinds: {            // 自定义快捷键（组合键 -> 动作），空字符串表示未设置
    togglePlay: ' ',        // 播放 / 暂停
    prev: 'ArrowLeft',      // 上一曲 ←
    next: 'ArrowRight',     // 下一曲 →
    seekBack: 'Control+ArrowLeft',  // 快退 5 秒 Ctrl+←
    seekFwd: 'Control+ArrowRight',  // 快进 5 秒 Ctrl+→
    volDown: 'ArrowDown',   // 音量减小
    volUp: 'ArrowUp',       // 音量增大
    mute: 'j',              // 静音切换 J
    toggleDark: 'k',        // 白天 / 黑夜
    
    toggleClean: '`',       // 沉浸模式 ` ~ 键
    togglePlaylist: 'Tab',  // 播放列表 Tab
    openSettings: 'Control+Alt+ ',  // 打开设置 Ctrl+Alt+空格
  },
  keybindVersion: 4,  // 快捷键默认值版本：升级时自动重置为新的默认绑定
};
/* 各背景样式的默认面板不透明度（%）：切换样式时重置为该默认值 */
const PANEL_OPACITY_DEFAULTS = { default: 100, glass: 0, frosted: 26, gradient: 10, dynamic: 10 };

/* 快捷键动作的中文名称（设置面板行标签） */
const KEY_LABELS = {
  togglePlay: '播放 / 暂停', prev: '上一曲', next: '下一曲',
  seekBack: '快退 5 秒', seekFwd: '快进 5 秒',
  volDown: '音量减小', volUp: '音量增大', mute: '静音切换',
  toggleDark: '白天 / 黑夜', toggleClean: '沉浸模式',
  togglePlaylist: '播放列表', openSettings: '打开设置',
};
/* 按键显示名（设置面板） */
const KEY_NAME_MAP = {
  ' ': '空格', 'ArrowUp': '↑', 'ArrowDown': '↓',
  'ArrowLeft': '←', 'ArrowRight': '→',
  'Escape': 'Esc', 'Enter': '回车', 'Tab': 'Tab',
  'Backspace': '退格', 'Delete': 'Delete', 'Insert': 'Insert',
  '`': '`~',
};
/* 修饰键显示名 */
const MOD_NAME_MAP = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win' };
function keyDisplayName(key) {
  if (!key) return '未设置';
  const parts = key.split('+');
  const last = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => MOD_NAME_MAP[m] || m);
  let name;
  if (last === ' ') name = '空格';
  else if (KEY_NAME_MAP[last]) name = KEY_NAME_MAP[last];
  else if (/^[a-z0-9]$/.test(last)) name = last.toUpperCase();
  else name = last;
  return mods.length ? `${mods.join('+')}+${name}` : name;
}
/* 按键规范化：空格保留，修饰键忽略（不单独绑定），字母统一小写，返回「修饰键+按键」组合串 */
function normalizeKey(key, mods = {}) {
  const parts = [];
  if (mods.ctrl) parts.push('Control');
  if (mods.alt) parts.push('Alt');
  if (mods.shift) parts.push('Shift');
  if (mods.meta) parts.push('Meta');
  let k;
  if (key === ' ') k = ' ';
  else if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return ''; // 纯修饰键按下不绑定
  else if (/^[a-zA-Z]$/.test(key)) k = key.toLowerCase();
  else k = key;
  // 中文键盘的 `~ 键可能输出 ·，Shift+` 输出 ~：统一为 `，并去掉 Shift 修饰（`、~、· 视为同一键）
  if (k === '·' || k === '~') {
    k = '`';
    const rest = parts.filter((p) => p !== 'Shift');
    return rest.length ? `${rest.join('+')}+${k}` : k;
  }
  return parts.length ? `${parts.join('+')}+${k}` : k;
}
/* 由当前设置生成 按键 -> 动作 映射 */
function buildKeyMap() {
  const map = {};
  const kb = settings.keybinds || {};
  for (const [action, key] of Object.entries(kb)) {
    if (key) map[key] = action;
  }
  return map;
}
let keyMap = {}; // 在 applySettings 中重建（settings 加载完成后）
/* 同步快捷键设置面板的按键显示 */
function renderKeybindsUI() {
  const kb = settings.keybinds || {};
  document.querySelectorAll('.key-input').forEach((btn) => {
    const key = kb[btn.dataset.action] || '';
    btn.textContent = keyDisplayName(key);
    btn.classList.toggle('has-key', !!key);
  });
}
let settings = loadSettings();

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const s = { ...DEFAULT_SETTINGS, ...saved };
    // 旧版本设置缺少 panelOpacity 时，按当前背景样式的默认不透明度补齐
    if (!('panelOpacity' in saved)) s.panelOpacity = PANEL_OPACITY_DEFAULTS[s.background] ?? 100;
    // 快捷键默认值版本升级：重置为新的默认绑定
    if (saved.keybindVersion !== DEFAULT_SETTINGS.keybindVersion) {
      s.keybinds = { ...DEFAULT_SETTINGS.keybinds };
      s.keybindVersion = DEFAULT_SETTINGS.keybindVersion;
    }
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/* 将十六进制颜色加深指定百分比，用于生成 --accent-dark */
function darkenColor(hex, percent = 0.15) {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * (1 - percent))));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * (1 - percent))));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * (1 - percent))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 忽略 */ }
}

function applySettings() {
  // 主题配色
  document.body.classList.remove('theme-red', 'theme-blue', 'theme-green', 'theme-purple', 'theme-orange');
  if (settings.theme === 'custom') {
    document.body.style.setProperty('--accent', settings.themeColor);
    document.body.style.setProperty('--accent-dark', darkenColor(settings.themeColor));
  } else {
    document.body.style.removeProperty('--accent');
    document.body.style.removeProperty('--accent-dark');
    document.body.classList.add(`theme-${settings.theme}`);
  }
  readAccent(); // 缓存主题色供画布每帧使用，避免 drawVisualizer 逐帧读取计算样式
  // 圆角样式
  document.body.classList.remove('corner-rounded', 'corner-less', 'corner-square');
  document.body.classList.add(`corner-${settings.cornerStyle}`);
  // 封面样式
  disc.classList.toggle('style-circle', settings.coverStyle === 'circle');
  disc.classList.toggle('style-square', settings.coverStyle === 'square');
  disc.classList.toggle('style-vinyl', settings.coverStyle === 'vinyl');
  // 歌词显示
  lyricsBox.classList.toggle('align-left', settings.lyricAlign === 'left');
  lyricsBox.classList.toggle('align-center', settings.lyricAlign === 'center');
  lyricsBox.classList.toggle('align-right', settings.lyricAlign === 'right');
  lyricsBox.classList.toggle('effect-color', settings.lyricEffect === 'color');
  lyricsBox.classList.toggle('effect-none', settings.lyricEffect === 'none');
  lyricsBox.classList.toggle('effect-zoom', settings.lyricEffect === 'zoom');
  lyricsBox.classList.toggle('effect-karaoke', settings.lyricEffect === 'karaoke');
  lyricsBox.classList.toggle('hide-trans', !settings.showTranslation);
  // 背景样式
  document.body.classList.remove('bg-glass', 'bg-frosted', 'bg-gradient', 'bg-dynamic');
  if (settings.background !== 'default') document.body.classList.add(`bg-${settings.background}`);
  // 面板背景不透明度：统一控制左右面板与歌词背景（CSS 变量 --panel-opacity）
  const panelOp = Math.min(100, Math.max(0, Math.round(Number(settings.panelOpacity) || 100)));
  document.body.style.setProperty('--panel-opacity', `${panelOp}%`);
  // 歌词字体与字号
  ['default', 'serif', 'kaiti', 'fangsong', 'mono'].forEach((f) =>
    lyricsBox.classList.toggle(`font-${f}`, settings.lyricFont === f));
  ['small', 'medium', 'large'].forEach((s) =>
    lyricsBox.classList.toggle(`size-${s}`, settings.lyricSize === s));

  const themeRadio = document.querySelector(`input[name="theme"][value="${settings.theme}"]`);
  const cornerRadio = document.querySelector(`input[name="cornerStyle"][value="${settings.cornerStyle}"]`);
  const coverRadio = document.querySelector(`input[name="coverStyle"][value="${settings.coverStyle}"]`);
  const alignRadio = document.querySelector(`input[name="lyricAlign"][value="${settings.lyricAlign}"]`);
  const effectRadio = document.querySelector(`input[name="lyricEffect"][value="${settings.lyricEffect}"]`);
  const visRadio = document.querySelector(`input[name="visStyle"][value="${settings.visStyle}"]`);
  const bgRadio = document.querySelector(`input[name="background"][value="${settings.background}"]`);
  if (themeRadio) themeRadio.checked = true;
  if (cornerRadio) cornerRadio.checked = true;
  if (coverRadio) coverRadio.checked = true;
  if (alignRadio) alignRadio.checked = true;
  if (effectRadio) effectRadio.checked = true;
  if (visRadio) visRadio.checked = true;
  if (bgRadio) bgRadio.checked = true;
  // 可视化灵敏度：同步滑块与数值显示
  const gain = Number(settings.visGain);
  const gainSlider = document.getElementById('visGain');
  const gainVal = document.getElementById('visGainVal');
  if (gainSlider) gainSlider.value = String(Math.round(Number.isFinite(gain) ? gain * 100 : 120));
  if (gainVal) gainVal.textContent = `${Number.isFinite(gain) ? gain.toFixed(1) : '1.2'}x`;
  // 面板背景不透明度：同步滑块与数值显示
  const opSlider = document.getElementById('panelOpacity');
  const opVal = document.getElementById('panelOpacityVal');
  if (opSlider) opSlider.value = String(panelOp);
  if (opVal) opVal.textContent = `${panelOp}%`;
  document.getElementById('showTranslation').checked = settings.showTranslation;
  document.getElementById('customColor').value = settings.themeColor;
  const fontSel = document.querySelector('select[name="lyricFont"]');
  const sizeSel = document.querySelector('select[name="lyricSize"]');
  if (fontSel) fontSel.value = settings.lyricFont;
  if (sizeSel) sizeSel.value = settings.lyricSize;
  // 快捷键：重建按键映射并同步面板显示
  keyMap = buildKeyMap();
  renderKeybindsUI();
}

/* ---------------- 工具函数 ---------------- */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

/* ---------------- API 封装（经本地代理转发，规避跨域） ---------------- */
/* 通用 JSON 请求 */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* 搜索：/api/search?keywords=&limit=；直连模式走 meting search（多源轮换） */
async function searchMusic(keyword) {
  if (isDirect()) return directSearch(keyword);
  try {
    const qs = new URLSearchParams({ keywords: keyword, limit: COUNT }).toString();
    const data = await fetchJson(`${API_BASE}/search?${qs}`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    // 本地代理不可用（博客静态部署）→ 自动切直连重试，保证搜索可用
    console.warn('代理搜索不可用，切换直连模式：', err);
    apiMode = 'direct';
    return searchMusic(keyword);
  }
}

/* 播放：proxy 模式走 /api/stream 代理（服务器端解析并拉流，规避防盗链限速）；
   direct 模式按解析源生成播放接口地址（302 到真实 CDN，<audio> 自动跟随） */
/* 直连播放地址解析源：
   idx 0 = 祈杰 type=url（VIP 完整解析，免签名）
   idx 1 = 搜索返回的签名链接（i-meto，VIP 歌曲仅 45s 试听） */
function directPlayUrl(song, idx) {
  if (idx !== 1) {
    const u = new URL(VIP_URL_API);
    u.searchParams.set('server', 'netease');
    u.searchParams.set('type', 'url');
    u.searchParams.set('id', song.id);
    u.searchParams.set('br', '320');
    u.searchParams.set('_', Date.now());
    return u.toString();
  }
  return song.url || '';
}
async function getSongUrl(song) {
  if (isDirect()) return directPlayUrl(song, song._urlIdx || 0);
  return `${API_BASE}/stream?id=${encodeURIComponent(song.id)}`;
}

/* 封面：直连模式直接用 meting 返回的封面接口地址（302 到图），proxy 模式走 /api/pic */
async function getPicUrl(picId, directUrl) {
  if (isDirect()) return directUrl || '';
  if (!picId) return directUrl || '';
  if (picCache.has(picId)) return picCache.get(picId);
  try {
    const data = await fetchJson(`${API_BASE}/pic?id=${encodeURIComponent(picId)}`);
    const url = data && data.url ? data.url : (directUrl || '');
    if (url) picCache.set(picId, url);
    return url;
  } catch (err) {
    console.warn('封面获取失败：', err);
    return directUrl || '';
  }
}

/* 歌词（含中文翻译）：/api/lyric?id=；直连模式走 meting lrc（纯文本，无翻译；
   i-meto 源需使用搜索返回的带 auth 的 lrc 链接） */
async function getLyric(lyricId, song) {
  if (lyricCache.has(lyricId)) return lyricCache.get(lyricId);
  let result = { lyric: '', tlyric: '' };
  try {
    if (isDirect()) {
      const lrcUrl = (song && song.lrc) || directUrl({ type: 'lrc', id: lyricId });
      const res = await fetch(lrcUrl);
      if (res.ok) result = { lyric: await res.text(), tlyric: '' };
    } else {
      const data = await fetchJson(`${API_BASE}/lyric?id=${encodeURIComponent(lyricId)}`);
      result = { lyric: data.lyric || '', tlyric: data.tlyric || '' };
    }
  } catch (err) {
    if (!isDirect()) {
      // 代理不可用 → 切直连重试（博客静态部署场景）
      apiMode = 'direct';
      console.warn('代理歌词不可用，切换直连：', err);
      try {
        const res = await fetch(directUrl({ type: 'lrc', id: lyricId }));
        if (res.ok) result = { lyric: await res.text(), tlyric: '' };
      } catch (err2) {
        console.warn('直连歌词获取失败：', err2);
      }
    } else {
      console.warn('歌词获取失败：', err);
    }
  }
  lyricCache.set(lyricId, result);
  return result;
}

/* ---------------- 歌词解析 ---------------- */
function parseLrc(text) {
  const items = [];
  if (!text) return items;
  const lineRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const metaRe = /^\s*(?:作词|作曲|编曲|制作|制作人|录音|混音|母带|和声|监制|出品|发行|企划|统筹|OP|SP|原唱|翻唱|词|曲)\s*[:：]/;

  for (const raw of text.split('\n')) {
    lineRe.lastIndex = 0;
    const times = [];
    let m;
    while ((m = lineRe.exec(raw)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      let frac = 0;
      if (m[3]) frac = m[3].length === 3 ? parseInt(m[3], 10) / 1000 : parseInt(m[3], 10) / 100;
      times.push(min * 60 + sec + frac);
    }
    if (!times.length) continue; // 无时间标签的行（含 [ar:] 等元信息）直接跳过
    const text = raw.replace(lineRe, '').trim();
    if (!text || metaRe.test(text)) continue;
    for (const t of times) items.push({ time: t, text });
  }
  items.sort((a, b) => a.time - b.time);
  return items;
}

function mergeLyric(lyric, tlyric) {
  const items = parseLrc(lyric);
  const trans = parseLrc(tlyric);
  const transMap = new Map();
  for (const t of trans) {
    const key = Math.round(t.time * 10);
    if (!transMap.has(key)) transMap.set(key, t.text);
  }
  for (const it of items) it.translation = transMap.get(Math.round(it.time * 10)) || '';
  return items;
}

/* ---------------- 渲染：歌曲信息 / 封面 ---------------- */
function renderSongInfo(song) {
  songName.textContent = song.name || '未知歌曲';
  songArtist.textContent = (song.artist || []).join(' / ') || '未知歌手';
  songAlbum.textContent = song.album || '';
}

function setCover(url) {
  if (url) {
    coverRetries = 0;
    coverImg.dataset.src = url;
    coverImg.src = url;
    coverImg.hidden = false;
    coverFallback.hidden = true;
    // 同步动态背景层：封面融入全局背景
    if (bgArt) {
      bgArt.style.backgroundImage = `url("${url}")`;
      bgArt.hidden = false;
    }
  } else {
    coverImg.dataset.src = '';
    coverImg.removeAttribute('src');
    coverImg.hidden = true;
    coverFallback.hidden = false;
    if (bgArt) { bgArt.hidden = true; bgArt.style.backgroundImage = ''; }
  }
}

/* 封面图片加载失败：重试一次，仍失败则回退到占位图 */
let coverRetries = 0;
coverImg.addEventListener('error', () => {
  const src = coverImg.dataset.src;
  if (src && coverRetries < 1) {
    coverRetries++;
    coverImg.removeAttribute('src');
    setTimeout(() => {
      if (coverImg.dataset.src === src) coverImg.src = src;
    }, 800);
    return;
  }
  coverImg.removeAttribute('src');
  coverImg.hidden = true;
  coverFallback.hidden = false;
  if (bgArt) { bgArt.hidden = true; bgArt.style.backgroundImage = ''; }
});

function setLoading(on) {
  state.loading = on;
  coverLoader.classList.toggle('show', on);
}

/* ---------------- 渲染：歌词 ---------------- */
/* 估计每行歌词文本宽度（与卡拉OK填充宽度一致），避免浏览器布局差异造成错位 */
let _lrcMeasure = null;
function measureLrcWidth(text) {
  if (!_lrcMeasure) {
    _lrcMeasure = document.createElement('span');
    _lrcMeasure.style.position = 'absolute';
    _lrcMeasure.style.visibility = 'hidden';
    _lrcMeasure.style.whiteSpace = 'pre';
    _lrcMeasure.style.pointerEvents = 'none';
    _lrcMeasure.style.left = '-9999px';
    document.body.appendChild(_lrcMeasure);
  }
  _lrcMeasure.textContent = text;
  const activeLine = lyricsBox.querySelector('.lyric-line.active');
  if (activeLine) {
    const cs = getComputedStyle(activeLine);
    _lrcMeasure.style.fontFamily = cs.fontFamily;
    _lrcMeasure.style.fontSize = cs.fontSize;
    _lrcMeasure.style.fontWeight = cs.fontWeight;
    _lrcMeasure.style.letterSpacing = cs.letterSpacing;
  }
  return _lrcMeasure.getBoundingClientRect().width;
}

function renderLyrics() {
  lyricsBox.innerHTML = '';
  lastLrcIndex = -1;
  if (!lrcItems.length) {
    lyricsBox.innerHTML = '<div class="lyrics-empty">纯音乐，请欣赏</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  lrcItems.forEach((it, i) => {
    const div = document.createElement('div');
    div.className = 'lyric-line';
    div.dataset.index = i;
    const text = escapeHtml(it.text);
    // 卡拉OK：同一行两套文字（底层灰色 + 顶层彩色+clip按进度裁剪），
    //         文字位置完全重合，不会出现双层错位/残像。
    div.innerHTML = `<span class="l-main kara-bg">${text}</span>` +
      `<span class="l-kara-fill" aria-hidden="true">${text}</span>` +
      (it.translation ? `<span class="l-trans">${escapeHtml(it.translation)}</span>` : '');
    div.addEventListener('click', () => {
      if (!Number.isFinite(audio.duration)) return;
      audio.currentTime = Math.min(audio.duration, it.time + 0.05);
    });
    frag.appendChild(div);
  });
  lyricsBox.appendChild(frag);
}

function updateLyric(index, immediate) {
  const lines = lyricsBox.children;
  if (!lines.length) return;
  const active = lyricsBox.querySelector('.lyric-line.active');
  if (active) active.classList.remove('active');

  const target = lines[index];
  if (!target) return;
  target.classList.add('active');

  // 卡拉OK：当前行底色文字左偏移 + 文字实际宽度，写入 data-* 供 updateKara 使用，
  // 避免每帧重新测量（同时兼容左/中/右对齐）
  const bg = target.querySelector('.kara-bg');
  const fill = target.querySelector('.l-kara-fill');
  if (bg && fill) {
    const leftPx = bg.offsetLeft;
    const textPx = Math.max(1, measureLrcWidth(lrcItems[index]?.text || ''));
    fill.dataset.karaLeft = String(leftPx);
    fill.dataset.karaWidth = String(textPx);
    // 缓存行内边距，避免 updateKara 每帧读取计算样式
    const csLine = getComputedStyle(target);
    fill.dataset.karaPadLeft = parseFloat(csLine.paddingLeft || '0');
    fill.dataset.karaPadTop = parseFloat(csLine.paddingTop || '0');
  }
  updateKara();

  const boxH = lyricsBox.clientHeight;
  if (lyricsBox.scrollHeight <= boxH) return;
  // 直接定位（无平滑动画），让当前行稳定"浮动"在可视区中部
  const top = target.offsetTop - boxH / 2 + target.offsetHeight / 2;
  lyricsBox.scrollTop = Math.max(0, top);
}

function findLrcIndex(t) {
  let lo = 0, hi = lrcItems.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lrcItems[mid].time <= t) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

/* ---------------- 卡拉OK歌词填充（重写：绝对定位 + clip 裁剪，与 zoom 放大彻底区分开） ---------------- */
function updateKara() {
  const line = lyricsBox.querySelector('.lyric-line.active');
  const fill = line && line.querySelector('.l-kara-fill');
  const bg = line && line.querySelector('.kara-bg');
  if (!line || !fill || !bg) return;
  // 1. 填充层与底色层完全重合：同起点、同宽、同字体属性，避免错位和残像
  const left = parseFloat(fill.dataset.karaLeft || '0');
  const textW = Math.max(1, parseFloat(fill.dataset.karaWidth || '0') || bg.getBoundingClientRect().width);
  const padLeft = parseFloat(fill.dataset.karaPadLeft || '0');
  const padTop = parseFloat(fill.dataset.karaPadTop || '0');
  fill.style.left = `${padLeft + left}px`;
  fill.style.top = `${padTop}px`;
  fill.style.width = `${textW}px`;
  // 2. 仅「卡拉OK」效果模式下使用 clip 裁剪显示进度；其他效果（zoom/color/none）不裁剪、颜色跟随 active 行
  if (settings.lyricEffect !== 'karaoke') {
    fill.style.clip = 'rect(0,0,0,0)'; // 完全隐藏填充层，避免额外颜色叠加
    return;
  }
  const idx = findLrcIndex(audio.currentTime);
  if (idx < 0) { fill.style.clip = 'rect(0,0,0,0)'; return; }
  const it = lrcItems[idx];
  const nextT = idx + 1 < lrcItems.length ? lrcItems[idx + 1].time : it.time + 4;
  const dur = Math.max(0.1, nextT - it.time);
  const p = Math.min(1, Math.max(0, (audio.currentTime - it.time) / dur));
  const clipW = p * textW;
  // 裁剪出已播放的左侧宽度（其余部分隐藏），形成逐字推进的卡拉OK观感
  fill.style.clip = `rect(0, ${clipW}px, 9999px, 0)`;
}

/* ---------------- 音频可视化（WebAudio 频谱） ---------------- */
let audioCtx = null;
let analyser = null;
let visData = null;
const visCtx = visCanvas.getContext('2d');
const VIS_KEY = 'jy-visual';
let visualOn = localStorage.getItem(VIS_KEY) !== '0'; // 默认开启
let accentColor = '#e8483d';  // 缓存主题色，避免每帧读取计算样式
let visW = 0, visH = 0;       // 缓存画布 CSS 尺寸，避免每帧读布局
function readAccent() {
  accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#e8483d';
}

/* 可视化开关（底部按钮） */
function applyVisual(on) {
  visualOn = on;
  btnVisual.classList.toggle('on', on);
  btnVisual.title = on ? '音频可视化：开' : '音频可视化：关';
  visWrap.classList.toggle('show', on && !!state.current);
  try { localStorage.setItem(VIS_KEY, on ? '1' : '0'); } catch { /* 忽略 */ }
  if (!on) { // 关闭时清空画布
    visCtx.clearRect(0, 0, visW || visCanvas.clientWidth, visH || visCanvas.clientHeight);
  }
}
btnVisual.addEventListener('click', () => applyVisual(!visualOn));

function initVisualizer() {
  if (audioCtx) return; // createMediaElementSource 只能调用一次
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    visData = new Uint8Array(analyser.frequencyBinCount);
    const src = audioCtx.createMediaElementSource(audio);
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
    resizeVis();
  } catch (e) {
    console.warn('音频可视化初始化失败：', e);
  }
}

function resizeVis() {
  const dpr = Math.min(2, window.devicePixelRatio || 1); // 限制高分屏画布尺寸，降低填充开销
  const rect = visCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  visW = rect.width;
  visH = rect.height;
  visCanvas.width = Math.round(visW * dpr);
  visCanvas.height = Math.round(visH * dpr);
  visCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* #rrggbb -> rgba()，供 canvas 渐变/透明使用 */
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return `rgba(232,72,61,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* canvas 圆角矩形路径，corners：'TL,TR,BL,BR' 控制四个角 */
function roundRect(ctx, x, y, w, h, r, corners) {
  const cs = new Set((corners || 'TL,TR,BL,BR').split(',').map(function (s) { return s.trim(); }));
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + (cs.has('TL') ? r : 0), y);
  // 顶边 → 右上角
  if (cs.has('TR')) { ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); }
  else ctx.lineTo(x + w, y);
  // 右边 → 右下角
  if (cs.has('BR')) { ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); }
  else ctx.lineTo(x + w, y + h);
  // 底边 → 左下角
  if (cs.has('BL')) { ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); }
  else ctx.lineTo(x, y + h);
  // 左边 → 左上角
  if (cs.has('TL')) { ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); }
  else ctx.lineTo(x, y);
  ctx.closePath();
}

function drawVisualizer() {
  const w = visW || visCanvas.clientWidth;
  const h = visH || visCanvas.clientHeight;
  visCtx.clearRect(0, 0, w, h);
  if (!analyser || audio.paused || !visualOn) return; // 暂停或关闭时保留/清空画面
  const accent = accentColor;
  const style = settings.visStyle || 'bar';
  // 用户可配置的灵敏度（0.5x~2.5x），限制范围避免失真
  const gain = Math.min(2.5, Math.max(0.5, Number(settings.visGain) || 1.2));

  if (style === 'wave') {
    // 频谱柱状：每根独立采样+独立高斯权重（中心高、两边低），帧间平滑 + 上下镜像绘制
    analyser.getByteFrequencyData(visData);
    const bars = 36;
    const gap = 3;
    const bw = (w - gap * (bars - 1)) / bars;
    if (bw <= 0) return;
    const mid = h / 2;
    const maxAmp = h / 2 - 6;
    const N = visData.length;
    // 1. 对数偏移采样 bars 份（与 bar/dot 同算法，保证各频段每根都可见）
    const raw = new Float32Array(bars);
    for (let i = 0; i < bars; i++) {
      const r0 = Math.pow(i / bars, 1.45);
      const r1 = Math.pow((i + 1) / bars, 1.45);
      const a = Math.floor(r0 * N * 0.95);
      const b = Math.max(a + 1, Math.min(N, Math.ceil(r1 * N * 0.95)));
      let mx = 0;
      for (let k = a; k < b; k++) if (visData[k] > mx) mx = visData[k];
      // 高频能量补偿
      const boost = 0.55 + 0.9 * (i / bars);
      raw[i] = Math.min(1, (mx / 255) * boost * gain);
    }
    // 2. 每根独立乘高斯权重（中心最高，两端最低），不再镜像翻折
    const gauss = new Float32Array(bars);
    for (let i = 0; i < bars; i++) {
      const x = (i - (bars - 1) / 2) / ((bars - 1) / 2); // -1 ~ +1，中心=0
      gauss[i] = Math.exp(-(x * x) / (2 * 0.42 * 0.42));
    }
    // 3. 帧间 lerp 平滑
    drawVisualizer._prevWave = drawVisualizer._prevWave || new Float32Array(bars);
    const prev = drawVisualizer._prevWave;
    const vals = new Float32Array(bars);
    for (let i = 0; i < bars; i++) {
      const t = raw[i] * gauss[i];
      vals[i] = prev[i] * 0.6 + t * 0.4;
      prev[i] = vals[i];
    }
    // 4. 渐变（顶深→中线浅）
    const gradUp = visCtx.createLinearGradient(0, mid - maxAmp, 0, mid);
    gradUp.addColorStop(0, hexToRgba(accent, 1));
    gradUp.addColorStop(1, hexToRgba(accent, 0.3));
    const gradDn = visCtx.createLinearGradient(0, mid + maxAmp, 0, mid);
    gradDn.addColorStop(0, hexToRgba(accent, 1));
    gradDn.addColorStop(1, hexToRgba(accent, 0.3));

    const r = Math.min(3, bw / 2);
    for (let i = 0; i < bars; i++) {
      let v = vals[i];
      if (!Number.isFinite(v) || v < 0) v = 0;
      if (v > 1) v = 1;
      const bh = Math.max(2, v * maxAmp);
      const x = i * (bw + gap);
      // 上半柱
      visCtx.globalAlpha = 1;
      visCtx.fillStyle = gradUp;
      roundRect(visCtx, x, mid - bh, bw, bh, r, 'TL,TR');
      visCtx.fill();
      // 下半柱（上下镜像显示）
      visCtx.fillStyle = gradDn;
      roundRect(visCtx, x, mid, bw, bh, r, 'BL,BR');
      visCtx.fill();
    }
    visCtx.globalAlpha = 1;
    return;
  }

  // 柱状 / 圆点：统一处理（对数偏移采样+最小高度+平滑）
  analyser.getByteFrequencyData(visData);
  const bars = style === 'bar' ? 40 : 32;
  const gap = 2;
  const bw = (w - gap * (bars - 1)) / bars;
  if (bw <= 0) return;
  // 对数位置偏移，使中低高频段更均匀可见
  const raw = new Float32Array(bars);
  const N = visData.length;
  for (let i = 0; i < bars; i++) {
    // 采样区间按 log 分布（起点从 0～0.95*N 走指数曲线）
    const r0 = Math.pow(i / bars, 1.45);
    const r1 = Math.pow((i + 1) / bars, 1.45);
    const a = Math.floor(r0 * N * 0.95);
    const b = Math.max(a + 1, Math.min(N, Math.ceil(r1 * N * 0.95)));
    let mx = 0;
    for (let k = a; k < b; k++) if (visData[k] > mx) mx = visData[k];
    // 能量补偿：高频本来就小，提升权重让它也能显示
    const boost = (0.6 + 0.9 * (i / bars)) * gain;
    raw[i] = Math.min(1, (mx / 255) * boost);
  }
  // 帧间平滑（与 wave 一致）
  drawVisualizer._prevBar = drawVisualizer._prevBar || new Float32Array(bars);
  const prev = drawVisualizer._prevBar;
  const vals = new Float32Array(bars);
  for (let i = 0; i < bars; i++) {
    vals[i] = prev[i] * 0.6 + raw[i] * 0.4;
    prev[i] = vals[i];
  }
  // 渐变（顶不透明→底透明）
  const grad = visCtx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, hexToRgba(accent, 1));
  grad.addColorStop(1, hexToRgba(accent, 0.35));
  const r = Math.min(3, bw / 2);
  for (let i = 0; i < bars; i++) {
    let v = vals[i];
    if (!Number.isFinite(v) || v < 0) v = 0;
    if (v > 1) v = 1;
    const x = i * (bw + gap);
    if (style === 'dot') {
      // 圆点：半径随幅度缩放 + 保证 1px 直径
      const base = Math.min(bw, 7);
      const d = Math.max(1, base * (0.35 + v * 0.8));
      const y = h / 2 + (0.5 - v) * (h - 10);
      visCtx.globalAlpha = 0.45 + 0.55 * v;
      visCtx.fillStyle = accent;
      visCtx.beginPath();
      visCtx.arc(x + bw / 2, y, d / 2, 0, Math.PI * 2);
      visCtx.fill();
    } else {
      // bar：最小 2px 高度 + 渐变圆角
      const bh = Math.max(2, v * (h - 6));
      const y = h - bh;
      visCtx.globalAlpha = 0.5 + 0.5 * v;
      visCtx.fillStyle = grad;
      roundRect(visCtx, x, y, bw, bh, r, 'TL,TR');
      visCtx.fill();
    }
  }
  visCtx.globalAlpha = 1;
}

/* 统一动画循环：卡拉OK填充 + 频谱绘制 */
let animRaf = 0;
function animLoop() {
  updateKara();
  drawVisualizer();
  animRaf = requestAnimationFrame(animLoop);
}
function startAnim() { if (!animRaf) animRaf = requestAnimationFrame(animLoop); }
function stopAnim() { if (animRaf) { cancelAnimationFrame(animRaf); animRaf = 0; } }

/* ---------------- 播放控制 ---------------- */
function play() {
  const p = audio.play();
  if (p && p.catch) p.catch(() => { /* 浏览器拦截自动播放时忽略 */ });
}

function pause() { audio.pause(); }

function togglePlay() {
  if (!state.current) { toast('请先搜索并选择一首歌曲'); return; }
  if (!state.urlLoaded) { retryUrl(); return; } // 播放链接未就绪时点击播放会重试
  if (audio.paused) play();
  else pause();
}

/* 播放链接未就绪 / 出错时的重试（点击播放或自动触发）：
   proxy 模式重新请求 /api/stream（服务器端重新解析播放链接），direct 模式换下一个解析源 */
function retryUrl() {
  if (!state.current) return;
  const song = state.current;
  setLoading(true);
  state.urlLoaded = true;
  if (!isDirect()) {
    audio.src = `${API_BASE}/stream?id=${encodeURIComponent(song.id)}&_=${Date.now()}`;
  } else {
    song._urlIdx = ((song._urlIdx || 0) + 1) % 2; // 0=祈杰完整解析 → 1=i-meto 签名链接
    audio.src = directPlayUrl(song, song._urlIdx);
  }
  audio.load();
  play();
}

function loadSong(song, autoplay) {
  if (!song) return;
  state.current = song;
  state.index = song._index >= 0 ? song._index : -1;
  state.urlLoaded = false;
  song._urlRefreshed = false; // 重置"链接失效已刷新"标记
  song._urlIdx = 0;           // 播放源从祈杰完整解析开始（出错时 retryUrl 切换）
  setLoading(true);
  renderSongInfo(song);
  visWrap.classList.toggle('show', visualOn); // 有歌曲且可视化开启时显示
  resizeVis();
  if (playlistPanel.classList.contains('open')) renderPlaylist(); // 同步播放列表高亮

  // 先展示缓存的封面/歌词，避免重复请求
  if (song.pic) setCover(song.pic);
  else if (picCache.has(song.pic_id)) setCover(picCache.get(song.pic_id));
  else setCover('');

  if (lyricCache.has(song.lyric_id || song.id)) {
    const c = lyricCache.get(song.lyric_id || song.id);
    lrcItems = mergeLyric(c.lyric, c.tlyric);
    renderLyrics();
  } else {
    lrcItems = [];
    renderLyrics();
    lyricsBox.innerHTML = '<div class="lyrics-empty">歌词加载中…</div>';
  }

  // 并行拉取：播放链接 / 封面 / 歌词。
  // 三个接口互不影响：单个失败不会影响其余部分，歌曲信息与歌词仍可正常展示。
  Promise.allSettled([
    getSongUrl(song),
    getPicUrl(song.pic_id, song.pic),
    getLyric(song.lyric_id || song.id, song),
  ]).then(([rUrl, rPic, rLyr]) => {
    if (state.current !== song) return; // 用户已切换歌曲，丢弃过期结果
    setLoading(false);

    const url = rUrl.status === 'fulfilled' ? rUrl.value : '';
    setCover(rPic.status === 'fulfilled' ? rPic.value : '');
    lrcItems = mergeLyric(
      rLyr.status === 'fulfilled' ? rLyr.value.lyric : '',
      rLyr.status === 'fulfilled' ? rLyr.value.tlyric : ''
    );
    renderLyrics();
    updateLyric(findLrcIndex(0), true);

    if (url) {
      state.urlLoaded = true;
      audio.src = url;
      if (autoplay) play();
    } else {
      console.error('获取播放链接失败：', song.name);
      toast('获取播放链接失败，点击播放可重试');
    }
  });
}

/* 计算下一首下标（随机模式随机选取，其余顺序+循环） */
function nextIndex() {
  const len = state.playlist.length;
  if (playMode === 'shuffle') {
    if (len <= 1) return state.index;
    let ni;
    do { ni = Math.floor(Math.random() * len); } while (ni === state.index);
    return ni;
  }
  return (state.index + 1) % len;
}

function next() {
  if (!state.playlist.length || state.index < 0) { toast('当前没有可切换的歌曲'); return; }
  loadSong(state.playlist[nextIndex()], true);
}

function prev() {
  if (!state.playlist.length || state.index < 0) { toast('当前没有可切换的歌曲'); return; }
  if (audio.currentTime > 3) { audio.currentTime = 0; return; } // 播放超过 3 秒则回到开头
  const idx = (state.index - 1 + state.playlist.length) % state.playlist.length;
  loadSong(state.playlist[idx], true);
}

/* 歌曲自然结束时的行为（按播放模式） */
function onEnded() {
  if (!state.playlist.length || state.index < 0) return;
  if (playMode === 'single') {          // 单曲循环：重新播放当前歌曲
    audio.currentTime = 0;
    play();
    return;
  }
  if (playMode === 'list' && state.index >= state.playlist.length - 1) {
    return;                             // 顺序播放：列表播完自动停止
  }
  loadSong(state.playlist[nextIndex()], true);
}

/* 播放出错时强制切到下一首（无论何种模式，避免卡在损坏的链接上） */
function skipBroken() {
  const len = state.playlist.length;
  if (!len || state.index < 0) return;
  loadSong(state.playlist[(state.index + 1) % len], true);
}

/* ---------------- 进度条 ---------------- */
function updateProgress() {
  if (scrubbing) return;
  const dur = audio.duration;
  if (!Number.isFinite(dur) || !state.current) return;
  const ratio = (audio.currentTime / dur) * 100;
  progressFill.style.width = `${Math.min(100, Math.max(0, ratio))}%`;
  timeCurrent.textContent = formatTime(audio.currentTime);
  timeTotal.textContent = formatTime(dur);
}

function progressFromEvent(e) {
  const rect = progress.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  return ratio;
}

progress.addEventListener('pointerdown', (e) => {
  if (!state.current) { toast('请先选择一首歌曲'); return; }
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  scrubbing = true;
  progress.classList.add('scrubbing');
  progress.setPointerCapture(e.pointerId);
  const ratio = progressFromEvent(e);
  pendingSeek = ratio * audio.duration;
  progressFill.style.width = `${ratio * 100}%`;
  timeCurrent.textContent = formatTime(pendingSeek);
  e.preventDefault();
});

progress.addEventListener('pointermove', (e) => {
  if (!scrubbing) return;
  const ratio = progressFromEvent(e);
  pendingSeek = ratio * audio.duration;
  progressFill.style.width = `${ratio * 100}%`;
  timeCurrent.textContent = formatTime(pendingSeek);
});

function commitSeek() {
  if (scrubbing) {
    scrubbing = false;
    progress.classList.remove('scrubbing');
    if (pendingSeek != null && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(audio.duration, pendingSeek);
    }
    pendingSeek = null;
  }
}

progress.addEventListener('pointerup', commitSeek);
progress.addEventListener('pointercancel', commitSeek);

/* ---------------- 音量（图标常显示，悬停图标时弹出音量条调节） ---------------- */
function updateVolIcon() {
  const muted = audio.muted || audio.volume === 0;
  btnMute.classList.toggle('is-muted', muted);
  volSlider.disabled = muted; // 静音时置灰不可拖动
  volSlider.style.setProperty('--vol', `${volSlider.value || 0}%`); // 自绘音量条填充比例
}

function setVolume(v) {
  const val = Math.min(100, Math.max(0, v));
  audio.volume = val / 100;
  audio.muted = false;
  volSlider.value = val;
  if (val > 0) lastVolume = val / 100;
  updateVolIcon();
}

volSlider.addEventListener('input', () => {
  audio.volume = volSlider.value / 100;
  audio.muted = audio.volume === 0;
  if (audio.volume > 0) lastVolume = audio.volume;
  updateVolIcon();
});

function toggleMute() {
  if (audio.muted || audio.volume === 0) {
    audio.muted = false;
    audio.volume = lastVolume || 0.8;
    volSlider.value = Math.round(audio.volume * 100);
    toast('已取消静音');
  } else {
    lastVolume = audio.volume;
    audio.muted = true;
    toast('已静音');
  }
  updateVolIcon();
}
btnMute.addEventListener('click', toggleMute);

/* 按住鼠标中键在音量图标上上下滑动，可调节音量（悬停图标时触发） */
let volDrag = null;
volumeWrap.addEventListener('pointerdown', (e) => {
  if (e.button !== 1) return; // 仅响应鼠标中键
  volDrag = {
    startY: e.clientY,
    startVol: (audio.muted ? (lastVolume || 0.8) : audio.volume) * 100,
  };
  volumeWrap.classList.add('dragging');
  try { volumeWrap.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
});
window.addEventListener('pointermove', (e) => {
  if (!volDrag) return;
  const dy = e.clientY - volDrag.startY;
  const newVol = Math.min(100, Math.max(0, volDrag.startVol - (dy / 80) * 100));
  setVolume(newVol);
});
function volDragEnd() {
  if (!volDrag) return;
  volDrag = null;
  volumeWrap.classList.remove('dragging');
}
window.addEventListener('pointerup', volDragEnd);
window.addEventListener('pointercancel', volDragEnd);
/* 中键的自动滚动由 mousedown 触发，必须在 mousedown 上 preventDefault 阻止，
   否则拖动过程中的 move 事件会被浏览器自动滚动吞掉 */
volumeWrap.addEventListener('mousedown', (e) => {
  if (e.button === 1) e.preventDefault();
});
/* 悬停音量图标时滚动滚轮也可调节音量（向上滚增大、向下滚减小） */
volumeWrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  const cur = audio.muted ? 0 : audio.volume * 100;
  setVolume(cur + (e.deltaY < 0 ? 5 : -5));
}, { passive: false });

/* ---------------- 搜索与结果弹窗 ---------------- */

/* 搜索请求自动重试：接口偶发失败/限流时返回空，最多尝试 attempts 次 */
async function fetchSearchWithRetry(keyword, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const list = await searchMusic(keyword);
      if (list.length) return list;
    } catch (err) {
      console.warn(`搜索“${keyword}”第 ${i + 1} 次失败：`, err);
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 800 * (i + 1))); // 递增等待
    }
  }
  return [];
}

async function doSearch() {
  const keyword = searchInput.value.trim();
  if (!keyword) { toast('请输入搜索关键词'); return; }

  const seq = ++searchSeq;
  modalTitle.textContent = `搜索 “${keyword}”`;
  modalBody.innerHTML =
    '<div class="modal-state loading-state">' +
      '<div class="loader-ring"></div>' +
      '<div class="loader-text">正在搜索<span class="dots"><i></i><i></i><i></i></span></div>' +
    '</div>';
  openModal(searchModal);

  let list = searchCache.get(keyword);
  if (!list) {
    list = await fetchSearchWithRetry(keyword);
    // 只缓存成功结果：避免接口瞬断时空结果被缓存，导致后续搜索一直失败
    if (list.length) searchCache.set(keyword, list);
  }
  if (seq !== searchSeq) return; // 已有更新的搜索，丢弃过期响应
  currentResults = list.map((s, i) => ({ ...s, _index: i }));
  renderResults(keyword);
}

function renderResults(keyword) {
  modalTitle.textContent = `搜索 “${keyword}” · 共 ${currentResults.length} 条`;
  if (!currentResults.length) {
    modalBody.innerHTML =
      '<div class="modal-state">未找到相关歌曲<br>' +
      '<span class="modal-hint">第三方解析接口可能存在临时故障，请稍后重试，或尝试更换更完整的关键词</span></div>';
    return;
  }
  modalBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  currentResults.forEach((song, i) => {
    const row = document.createElement('div');
    row.className = 'search-item';
    if (state.current && state.current.id === song.id) row.classList.add('playing');
    const inPl = userPlaylist.some((s) => s.id === song.id);
    row.innerHTML = `
      <span class="item-idx">${String(i + 1).padStart(2, '0')}</span>
      <span class="item-main">
        <span class="item-name">${escapeHtml(song.name)}</span>
        <span class="item-sub">${escapeHtml((song.artist || []).join(' / '))} · ${escapeHtml(song.album || '未知专辑')}</span>
      </span>
      <button class="item-add${inPl ? ' added' : ''}" title="添加到播放列表" aria-label="添加到播放列表">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M12 5v14M5 12h14"></path>
        </svg>
      </button>
      <span class="item-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
      </span>`;
    row.addEventListener('click', () => onPickSong(song));
    const addBtn = row.querySelector('.item-add');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToPlaylist(song, addBtn);
    });
    frag.appendChild(row);
  });
  modalBody.appendChild(frag);
}

function onPickSong(song) {
  closeModal(searchModal);
  if (state.current && state.current.id === song.id) return; // 正在播放同一首，无需重新加载
  state.playlist = currentResults;
  loadSong(song, true);
}

/* ---------------- 弹窗开关（搜索 / 设置通用） ---------------- */
function openModal(m) {
  m.classList.add('open');
  document.body.classList.add('modal-open');
}
function closeModal(m) {
  m.classList.remove('open');
  document.body.classList.remove('modal-open');
}

searchForm.addEventListener('submit', (e) => { e.preventDefault(); doSearch(); });

/* 搜索框一键清空按钮：有输入内容时显示，点击清空并聚焦 */
const searchClear = document.getElementById('searchClear');
function updateSearchClear() {
  searchClear.hidden = !searchInput.value;
}
searchInput.addEventListener('input', updateSearchClear);
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  updateSearchClear();
  searchInput.focus();
});
searchModal.querySelector('.modal-close').addEventListener('click', () => closeModal(searchModal));
searchModal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(searchModal));

/* ---------------- 白天 / 黑夜模式 ---------------- */
const btnDark = document.getElementById('btnDark');
const DARK_KEY = 'jy-dark-mode';

function applyDarkMode(dark) {
  document.body.classList.toggle('dark', dark);
  try { localStorage.setItem(DARK_KEY, dark ? '1' : '0'); } catch { /* 忽略 */ }
}

function toggleDark() {
  applyDarkMode(!document.body.classList.contains('dark'));
  toast(document.body.classList.contains('dark') ? '已切换为黑夜模式' : '已切换为白天模式');
}
btnDark.addEventListener('click', toggleDark);

/* ---------------- 沉浸模式（清屏）：隐藏顶栏与底栏，鼠标靠近边缘时临时显示 ---------------- */
const CLEAN_KEY = 'jy-clean-mode';
let cleanMode = false;
try { cleanMode = localStorage.getItem(CLEAN_KEY) === '1'; } catch { /* 忽略 */ }
const topbarEl = document.querySelector('.topbar');
const controlsEl = document.querySelector('.controls');

function applyClean() {
  document.body.classList.toggle('clean', cleanMode);
  if (!cleanMode) {
    topbarEl.classList.remove('clean-show');
    controlsEl.classList.remove('clean-show');
  }
  btnClean.classList.toggle('active', cleanMode);
  btnClean.title = cleanMode ? '沉浸模式：点击恢复界面' : '沉浸模式：隐藏界面';
  try { localStorage.setItem(CLEAN_KEY, cleanMode ? '1' : '0'); } catch { /* 忽略 */ }
}

function toggleClean() {
  cleanMode = !cleanMode;
  applyClean();
  toast(cleanMode ? '已隐藏界面，鼠标移到顶部/底部可临时显示' : '已恢复完整界面');
}
btnClean.addEventListener('click', toggleClean);

/* 沉浸模式下：鼠标靠近顶部/底部边缘时临时显示对应栏 */
document.addEventListener('mousemove', (e) => {
  if (!cleanMode) return;
  const nearTop = e.clientY < 72;
  const nearBottom = e.clientY > window.innerHeight - 72;
  topbarEl.classList.toggle('clean-show', nearTop);
  controlsEl.classList.toggle('clean-show', nearBottom);
});
document.addEventListener('mouseleave', () => {
  if (!cleanMode) return;
  topbarEl.classList.remove('clean-show');
  controlsEl.classList.remove('clean-show');
});
applyClean();

/* ---------------- 设置面板 ---------------- */
const customColorInput = document.getElementById('customColor');
const customThemeLabel = document.getElementById('customThemeLabel');

/* 更新设置页缓存统计（条数 + 估算大小） */
const byteEnc = new TextEncoder();
function strBytes(s) { try { return byteEnc.encode(s).length; } catch { return s.length * 2; } }
function cacheSize(map) {
  let total = 0;
  for (const [k, v] of map) {
    total += strBytes(k);
    if (typeof v === 'string') total += strBytes(v);
    else total += strBytes(JSON.stringify(v));
  }
  return total;
}
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function updateCacheStats() {
  const s = searchCache, p = picCache, l = lyricCache;
  cacheStats.textContent =
    `搜索 ${s.size} 条 ${fmtSize(cacheSize(s))} · ` +
    `封面 ${p.size} 条 ${fmtSize(cacheSize(p))} · ` +
    `歌词 ${l.size} 条 ${fmtSize(cacheSize(l))}`;
}

/* 清除全部缓存（前端 + 服务器播放链接缓存；直连模式无服务器缓存） */
async function clearAllCache() {
  searchCache.clear();
  picCache.clear();
  lyricCache.clear();
  if (!isDirect()) {
    try { await fetch(`${API_BASE}/clear-cache`); } catch { /* 服务器缓存清除失败不影响前端 */ }
  }
  updateCacheStats();
  toast('缓存已清除');
}

btnClearCache.addEventListener('click', clearAllCache);

/* 设置分区折叠：将每个 .settings-section 整理为「标题栏 + 内容区」，
   标题栏右侧折叠按钮可收起/展开，状态记忆到 localStorage */
const SEC_COLLAPSE_KEY = 'jy-sec-collapsed';
function initSettingsCollapse() {
  const sections = document.querySelectorAll('#settingsModal .settings-section');
  // 无历史记录时默认全部折叠（用户展开/折叠后持久化记忆）
  const allTitles = Array.from(sections)
    .map((sec) => sec.querySelector(':scope > h3'))
    .filter(Boolean)
    .map((h3) => h3.textContent.trim());
  let collapsed;
  try {
    const saved = localStorage.getItem(SEC_COLLAPSE_KEY);
    collapsed = saved ? JSON.parse(saved) : [...allTitles];
  } catch {
    collapsed = [...allTitles];
  }
  sections.forEach((sec) => {
    const h3 = sec.querySelector(':scope > h3');
    if (!h3) return;
    // 标题栏
    const head = document.createElement('div');
    head.className = 'sec-head';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sec-collapse';
    btn.title = '折叠 / 展开';
    btn.setAttribute('aria-label', '折叠 / 展开');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="m6 9 6 6 6-6"></path></svg>';
    head.appendChild(h3);
    head.appendChild(btn);
    sec.insertBefore(head, sec.firstChild);
    // 其余内容包进 sec-body
    const body = document.createElement('div');
    body.className = 'sec-body';
    while (sec.children.length > 1) body.appendChild(sec.children[1]);
    sec.appendChild(body);
    // 恢复折叠状态
    const title = h3.textContent.trim();
    if (collapsed.includes(title)) sec.classList.add('collapsed');
    const toggle = () => {
      const isCollapsed = sec.classList.toggle('collapsed');
      collapsed = isCollapsed
        ? (collapsed.includes(title) ? collapsed : collapsed.concat(title))
        : collapsed.filter((t) => t !== title);
      try { localStorage.setItem(SEC_COLLAPSE_KEY, JSON.stringify(collapsed)); } catch { /* 忽略 */ }
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    head.addEventListener('click', toggle);
  });
}
initSettingsCollapse();

btnSettings.addEventListener('click', () => {
  if (settingsModal.classList.contains('open')) {
    closeModal(settingsModal); // 再点一次 / 再按一次快捷键即关闭
    return;
  }
  applySettings(); // 打开时同步各选项为已保存状态
  updateCacheStats();
  openModal(settingsModal);
});
settingsModal.querySelector('.modal-close').addEventListener('click', () => closeModal(settingsModal));
settingsModal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(settingsModal));

settingsModal.addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'theme') settings.theme = t.value;
  else if (t.name === 'cornerStyle') settings.cornerStyle = t.value;
  else if (t.name === 'coverStyle') settings.coverStyle = t.value;
  else if (t.name === 'lyricAlign') settings.lyricAlign = t.value;
  else if (t.name === 'lyricEffect') settings.lyricEffect = t.value;
  else if (t.name === 'lyricFont') settings.lyricFont = t.value;
  else if (t.name === 'lyricSize') settings.lyricSize = t.value;
  else if (t.name === 'visStyle') settings.visStyle = t.value;
  else if (t.name === 'background') {
    settings.background = t.value;
    // 切换背景样式时，面板背景不透明度重置为该样式的默认值
    settings.panelOpacity = PANEL_OPACITY_DEFAULTS[t.value] ?? 100;
  }
  else if (t.name === 'panelOpacity') {
    settings.panelOpacity = Math.round(parseInt(t.value, 10) || 100);
  }
  else if (t.name === 'visGain') {
    settings.visGain = Math.round(parseInt(t.value, 10) || 120) / 100;
    const gainVal = document.getElementById('visGainVal');
    if (gainVal) gainVal.textContent = `${settings.visGain.toFixed(1)}x`;
  }
  else if (t.id === 'showTranslation') settings.showTranslation = t.checked;
  else if (t.id === 'customColor') {
    settings.theme = 'custom';
    settings.themeColor = t.value;
  }
  else return;
  applySettings(); // 实时预览，点击“保存设置”后写入 localStorage
});

/* 拖动取色时实时预览 */
customColorInput.addEventListener('input', () => {
  settings.theme = 'custom';
  settings.themeColor = customColorInput.value;
  applySettings();
});

/* 拖动可视化灵敏度滑块实时预览 */
document.addEventListener('DOMContentLoaded', () => {
  const gainSlider = document.getElementById('visGain');
  const gainVal = document.getElementById('visGainVal');
  if (gainSlider) gainSlider.addEventListener('input', () => {
    settings.visGain = Math.round(parseInt(gainSlider.value, 10) || 120) / 100;
    if (gainVal) gainVal.textContent = `${settings.visGain.toFixed(1)}x`;
  });
  /* 拖动面板背景不透明度滑块实时预览 */
  const opSlider = document.getElementById('panelOpacity');
  const opVal = document.getElementById('panelOpacityVal');
  if (opSlider) opSlider.addEventListener('input', () => {
    settings.panelOpacity = Math.round(parseInt(opSlider.value, 10) || 100);
    if (opVal) opVal.textContent = `${settings.panelOpacity}%`;
    applySettings();
  });
});

/* 点击「自定义」文字：选中后直接弹出取色器 */
customThemeLabel.addEventListener('click', () => {
  const radio = customThemeLabel.querySelector('input');
  if (radio.checked) {
    customColorInput.click();
  } else {
    // 先让 radio 选中生效（change 事件），再弹出取色器
    setTimeout(() => { if (radio.checked) customColorInput.click(); }, 0);
  }
});

document.getElementById('btnSaveSettings').addEventListener('click', () => {
  saveSettings();
  applySettings();
  toast('设置已保存');
  closeModal(settingsModal);
});

/* 还原默认配置：清除自定义设置，恢复网站默认值（不影响播放列表） */
const btnRestoreDefaults = document.getElementById('btnRestoreDefaults');
const RESTORE_BTN_TEXT = '还原默认配置';
let restoreArmed = false;
let restoreTimer = null;

function resetRestoreBtn() {
  restoreArmed = false;
  btnRestoreDefaults.classList.remove('armed');
  btnRestoreDefaults.textContent = RESTORE_BTN_TEXT;
}

btnRestoreDefaults.addEventListener('click', () => {
  if (!restoreArmed) {
    // 首次点击：进入确认状态，防止误触
    restoreArmed = true;
    btnRestoreDefaults.classList.add('armed');
    btnRestoreDefaults.textContent = '再次点击确认还原';
    toast('再次点击「还原默认配置」确认还原');
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(resetRestoreBtn, 2500);
    return;
  }
  clearTimeout(restoreTimer);
  resetRestoreBtn();
  stopKeyCapture(false); // 终止可能进行中的快捷键录制
  // 还原设置面板中的全部配置
  settings = { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_SETTINGS.keybinds } };
  saveSettings();
  // 还原其余自定义状态：播放模式 / 昼夜 / 沉浸 / 可视化
  setMode('loop', true);
  applyDarkMode(false);
  cleanMode = false;
  applyClean();
  applyVisual(true);
  applySettings();
  toast('已还原默认配置');
});

/* ---------------- 播放列表 ---------------- */
function renderPlaylist() {
  plCount.textContent = userPlaylist.length;
  if (!userPlaylist.length) {
    plBody.innerHTML = '<div class="pl-empty">列表为空，去搜索并点击「+」添加歌曲吧</div>';
    return;
  }
  plBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  userPlaylist.forEach((song, i) => {
    const row = document.createElement('div');
    row.className = 'pl-item';
    if (state.current && state.current.id === song.id) row.classList.add('playing');
    row.innerHTML = `
      <span class="pl-num">${i + 1}</span>
      <span class="pl-main">
        <span class="pl-name">${escapeHtml(song.name)}</span>
        <span class="pl-artist">${escapeHtml((song.artist || []).join(' / '))}</span>
      </span>
      <button class="pl-remove" title="从播放列表移除" aria-label="从播放列表移除">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 6 6 18M6 6l12 12"></path>
        </svg>
      </button>`;
    row.addEventListener('click', () => playFromPlaylist(i));
    row.querySelector('.pl-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromPlaylist(i);
    });
    frag.appendChild(row);
  });
  plBody.appendChild(frag);
}

/* 添加到播放列表（搜索结果里的「+」按钮） */
function addToPlaylist(song, btn) {
  if (userPlaylist.some((s) => s.id === song.id)) {
    toast('该歌曲已在播放列表中');
    flashAdded(btn);
    return;
  }
  userPlaylist.push({
    id: song.id,
    name: song.name,
    artist: song.artist || [],
    album: song.album || '',
    pic: song.pic || '',
    pic_id: song.pic_id || '',
    lyric_id: song.lyric_id || '',
    source: song.source || SOURCE,
  });
  savePlaylist();
  renderPlaylist();
  flashAdded(btn);
  toast(`已添加到播放列表：${song.name}`);
}

function flashAdded(btn) {
  if (!btn) return;
  btn.classList.add('added');
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => btn.classList.remove('added'), 900);
}

function removeFromPlaylist(i) {
  const [removed] = userPlaylist.splice(i, 1);
  savePlaylist();
  // 若当前队列正来自播放列表，同步重建队列快照，保证上一曲/下一曲正确
  if (state.playlist === playlistSnapshot) {
    playlistSnapshot = userPlaylist.map((s, idx) => ({ ...s, _index: idx }));
    state.playlist = playlistSnapshot;
    if (state.index >= state.playlist.length) state.index = state.playlist.length - 1;
  }
  renderPlaylist();
  toast(`已从播放列表移除：${removed.name}`);
}

function playFromPlaylist(i) {
  playlistSnapshot = userPlaylist.map((s, idx) => ({ ...s, _index: idx }));
  state.playlist = playlistSnapshot;
  loadSong(state.playlist[i], true);
}

/* 一键清空播放列表（二次点击确认，防误触） */
let clearArmed = false;
let clearTimer = null;
function clearPlaylist() {
  if (!userPlaylist.length) { toast('播放列表已是空的'); return; }
  if (!clearArmed) {
    clearArmed = true;
    toast('再次点击「清空」确认清空播放列表');
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { clearArmed = false; }, 2500);
    return;
  }
  clearArmed = false;
  clearTimeout(clearTimer);
  userPlaylist.length = 0;
  savePlaylist();
  // 若当前队列正来自播放列表，清空队列快照
  if (state.playlist === playlistSnapshot) {
    playlistSnapshot = [];
    state.playlist = [];
    state.index = -1;
  }
  renderPlaylist();
  toast('播放列表已清空');
}
plClear.addEventListener('click', clearPlaylist);

function togglePlaylist(force) {
  const open = force !== undefined ? force : !playlistPanel.classList.contains('open');
  playlistPanel.classList.toggle('open', open);
  btnPlaylist.classList.toggle('active', open);
  if (open) renderPlaylist();
}

btnPlaylist.addEventListener('click', (e) => { e.stopPropagation(); togglePlaylist(); });
plClose.addEventListener('click', () => togglePlaylist(false));
document.addEventListener('click', (e) => {
  if (playlistPanel.classList.contains('open') &&
      !playlistPanel.contains(e.target) && e.target !== btnPlaylist) {
    togglePlaylist(false);
  }
});

/* ---------------- 音频事件 ---------------- */
audio.addEventListener('play', () => {
  btnPlay.classList.add('is-playing');
  disc.classList.add('playing');
  // 可视化：首次播放时初始化 AudioContext（需用户手势），之后继续复用
  if (!audioCtx) initVisualizer();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  startAnim();
});
audio.addEventListener('pause', () => {
  btnPlay.classList.remove('is-playing');
  disc.classList.remove('playing');
  stopAnim();
});
audio.addEventListener('seeking', updateKara);
audio.addEventListener('timeupdate', () => {
  updateProgress();
  const idx = findLrcIndex(audio.currentTime);
  if (idx !== lastLrcIndex) {
    lastLrcIndex = idx;
    updateLyric(idx, false);
  }
});
audio.addEventListener('loadedmetadata', () => {
  timeTotal.textContent = formatTime(audio.duration);
});
audio.addEventListener('waiting', () => setLoading(true));
audio.addEventListener('playing', () => setLoading(false));
audio.addEventListener('canplay', () => setLoading(false));
audio.addEventListener('ended', onEnded);
audio.addEventListener('error', () => {
  if (state.loading) setLoading(false);
  if (!state.urlLoaded || !state.current) return;
  const song = state.current;
  // 首次出错：若为代理模式则自动切直连重新解析（静态博客无 /api 代理时的兜底）；
  // 直连模式换下一个播放解析源（祈杰完整解析 ↔ i-meto 签名链接）重试
  if (!song._urlRefreshed) {
    song._urlRefreshed = true;
    if (!isDirect()) {
      apiMode = 'direct';
      toast('本地代理不可用，已切换在线解析');
    } else {
      toast('播放链接失效，正在切换解析源…');
    }
    retryUrl();
    return;
  }
  toast('播放出错，即将尝试下一首');
  if (state.playlist.length && state.index >= 0) setTimeout(skipBroken, 600);
});

/* ---------------- 快捷键 ---------------- */
/* 快捷键录制状态：点击设置面板中的按键框后进入录制，按下的下一键作为新绑定 */
let capturingAction = null;
let keyCaptureActive = false;

function startKeyCapture(action) {
  stopKeyCapture(false); // 先取消上一次未完成的录制
  capturingAction = action;
  keyCaptureActive = true;
  const btn = document.querySelector(`.key-input[data-action="${action}"]`);
  if (btn) btn.classList.add('capturing');
}
function stopKeyCapture(render) {
  if (!capturingAction) return;
  const btn = document.querySelector(`.key-input[data-action="${capturingAction}"]`);
  if (btn) btn.classList.remove('capturing');
  capturingAction = null;
  keyCaptureActive = false;
  if (render !== false) renderKeybindsUI();
}

/* 手动跟踪修饰键状态：部分输入法/系统在按下组合键时可能丢失事件的修饰标志
   （如 Ctrl+空格 只上报 空格，Ctrl+← 只上报 ←），以此兜底正确匹配组合键 */
const modHeld = { ctrl: false, alt: false, shift: false, meta: false };
window.addEventListener('keydown', (e) => {
  if (e.key === 'Control') modHeld.ctrl = true;
  else if (e.key === 'Alt') modHeld.alt = true;
  else if (e.key === 'Shift') modHeld.shift = true;
  else if (e.key === 'Meta') modHeld.meta = true;
}, true);
window.addEventListener('keyup', (e) => {
  if (e.key === 'Control') modHeld.ctrl = false;
  else if (e.key === 'Alt') modHeld.alt = false;
  else if (e.key === 'Shift') modHeld.shift = false;
  else if (e.key === 'Meta') modHeld.meta = false;
}, true);
window.addEventListener('blur', () => { modHeld.ctrl = modHeld.alt = modHeld.shift = modHeld.meta = false; });

document.addEventListener('keydown', (e) => {
  // 组合键修饰状态：事件标志优先，丢失时用手动跟踪状态兜底
  const mods = {
    ctrl: e.ctrlKey || modHeld.ctrl,
    alt: e.altKey || modHeld.alt,
    shift: e.shiftKey || modHeld.shift,
    meta: e.metaKey || modHeld.meta,
  };
  // 正在录制快捷键：将按下的按键绑定到当前动作
  if (keyCaptureActive) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { stopKeyCapture(); return; } // 取消录制
    const norm = normalizeKey(e.key, mods);
    if (!norm) return; // 忽略单独按下的修饰键（Shift/Ctrl/Alt/Win）
    const action = capturingAction;
    if (!settings.keybinds) settings.keybinds = {};
    settings.keybinds[action] = norm;
    stopKeyCapture();
    applySettings();
    toast(`已设置「${KEY_LABELS[action] || action}」为 ${keyDisplayName(norm)}`);
    return;
  }

  // 关闭弹窗（始终生效，不因输入框/弹窗状态而忽略）
  if (e.key === 'Escape') {
    closeModal(searchModal);
    closeModal(settingsModal);
    togglePlaylist(false);
    return;
  }
  // 输入法组合输入期间（如拼音选字）不触发快捷键，避免误触
  if (e.isComposing || e.key === 'Process' || e.keyCode === 229) return;
  if (e.target.matches('input, textarea, select')) return;
  if (searchModal.classList.contains('open')) return;
  if (settingsModal.classList.contains('open')) {
    // 设置面板已打开：仅响应「打开设置」快捷键再次触发时关闭面板，其余快捷键忽略
    const openCombo = normalizeKey(e.key, mods);
    const isOpenKey = keyMap[openCombo] === 'openSettings' ||
      (!mods.ctrl && !mods.alt && !mods.meta && !mods.shift &&
        keyMap[normalizeKey(e.key)] === 'openSettings');
    if (isOpenKey) { e.preventDefault(); btnSettings.click(); }
    return;
  }

  // 先匹配「修饰键+按键」组合；未命中且未按任何修饰键（含 Shift）时，回退匹配纯按键，
  // 避免 Shift+J / Shift+Tab / Shift+空格 等误触发成其他快捷键的功能
  const combo = normalizeKey(e.key, mods);
  let action = keyMap[combo];
  if (!action && !mods.ctrl && !mods.alt && !mods.meta && !mods.shift) {
    action = keyMap[normalizeKey(e.key)];
  }
  if (!action) return;
  e.preventDefault();
  switch (action) {
    case 'togglePlay': togglePlay(); break;
    case 'prev': prev(); break;
    case 'next': next(); break;
    case 'seekFwd':
      if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      break;
    case 'seekBack': audio.currentTime = Math.max(0, audio.currentTime - 5); break;
    case 'volUp': setVolume((audio.volume * 100) + 10); break;
    case 'volDown': setVolume((audio.volume * 100) - 10); break;
    case 'mute': toggleMute(); break;
    case 'toggleDark': toggleDark(); break;
    case 'toggleClean': toggleClean(); break;
    case 'togglePlaylist': togglePlaylist(); break;
    case 'openSettings': btnSettings.click(); break;
  }
});

/* 设置面板：点击按键框开始录制，点击 × 清除绑定 */
settingsModal.addEventListener('click', (e) => {
  const inputBtn = e.target.closest('.key-input');
  if (inputBtn) { startKeyCapture(inputBtn.dataset.action); return; }
  const clearBtn = e.target.closest('.key-clear');
  if (clearBtn) {
    stopKeyCapture(false);
    const action = clearBtn.dataset.action;
    if (!settings.keybinds) settings.keybinds = {};
    settings.keybinds[action] = '';
    applySettings();
    toast(`已清除「${KEY_LABELS[action] || action}」快捷键`);
  }
});

/* ---------------- 事件绑定 ---------------- */
btnPlay.addEventListener('click', togglePlay);
btnPrev.addEventListener('click', prev);
btnNext.addEventListener('click', next);

window.addEventListener('resize', () => {
  resizeVis();
  if (lrcItems.length) updateLyric(findLrcIndex(audio.currentTime), true);
});

/* ---------------- 初始化 ---------------- */
audio.volume = 0.8;
volSlider.value = 80;
probeApi(); // 探测本地 /api 代理：可用则走代理，否则切直连（博客静态部署）
applySettings();
updateVolIcon();
setMode(playMode, true);
// 恢复黑夜模式：未手动设置过时跟随系统主题（与博客整体明暗保持一致）
const savedDark = localStorage.getItem(DARK_KEY);
applyDarkMode(savedDark ? savedDark === '1' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
applyVisual(visualOn); // 恢复可视化开关状态（按钮高亮/标题）
// 页面默认不自动播放任何歌曲，等待用户搜索选择
