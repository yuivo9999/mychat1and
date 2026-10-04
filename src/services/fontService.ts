import { FontDefinition, CustomFontItem } from '../types';

export const PRESET_CHINESE_FONTS: FontDefinition[] = [
  {
    id: 'system',
    name: '系统默认黑体',
    category: '黑体',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
    previewText: '桑田沧海，天地玄黄',
    description: '操作系统原生推荐，0延迟秒开，最清晰平滑的现代界面',
  },
  {
    id: 'pingfang',
    name: '苹方 / 微软雅黑',
    category: '黑体',
    fontFamily: '"PingFang SC", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif',
    previewText: '春江潮水连海平，海上明月共潮生',
    description: 'macOS 与 Windows 经典旗舰屏显黑体，通透明朗',
  },
  {
    id: 'source-han-sans',
    name: '思源黑体',
    category: '黑体',
    fontFamily: '"Source Han Sans SC", "Noto Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif',
    previewText: '万物皆有裂痕，那是光照进来的地方',
    description: 'Adobe & Google 开源殿堂级无衬线字族，严谨端正',
  },
  {
    id: 'source-han-serif',
    name: '思源宋体',
    category: '宋体',
    fontFamily: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif',
    previewText: '落霞与孤鹜齐飞，秋水共长天一色',
    description: '人文主义典雅衬线宋体，横细竖粗，适合长文深度阅读',
  },
  {
    id: 'lxgw-wenkai',
    name: '霞鹜文楷',
    category: '楷体',
    fontFamily: '"LXGW WenKai Screen", "LXGW WenKai", "STKaiti", "KaiTi", cursive, serif',
    previewText: '人间烟火气，最抚凡人心',
    description: '极受推崇的开源文艺楷体，笔画温润，治愈而富有诗意',
    cdnUrl: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/style.css',
  },
  {
    id: 'kaiti',
    name: '经典楷体',
    category: '楷体',
    fontFamily: '"STKaiti", "KaiTi", "BiauKai", "楷体", "楷体_GB2312", serif',
    previewText: '字字珠玑，如见古风墨韵',
    description: '中华传统毛笔正楷风范，笔锋刚劲，书卷气息浓郁',
  },
  {
    id: 'fangsong',
    name: '清秀仿宋',
    category: '仿宋',
    fontFamily: '"STFangsong", "FangSong", "仿宋", "仿宋_GB2312", serif',
    previewText: '博观而约取，厚积而薄发',
    description: '典雅秀挺的公文与古籍版式字体，清爽严整',
  },
  {
    id: 'lisu',
    name: '古风隶书',
    category: '隶书',
    fontFamily: '"STLiti", "LiSu", "隶书", serif',
    previewText: '古道西风，汉隶风骨蚕头燕尾',
    description: '秦汉隶书金石风韵，波磔微显，气势雄浑庄重',
  },
  {
    id: 'youyuan',
    name: '柔润幼圆',
    category: '圆体',
    fontFamily: '"STYuanti", "YouYuan", "圆体", "Yuanti SC", sans-serif',
    previewText: '温暖圆融，如沐和煦春风',
    description: '转角柔和纯粹，无锐角倒刺，亲和温润易读',
  },
  {
    id: 'xingkai',
    name: '华文行楷',
    category: '行楷',
    fontFamily: '"STXingkai", "Xingkai SC", "行楷", cursive, serif',
    previewText: '行云流水，笔走龙蛇气象万千',
    description: '兼具楷书端庄与行书流美，行笔连绵洒脱',
  },
  {
    id: 'zhongsong',
    name: '华文中宋',
    category: '宋体',
    fontFamily: '"STZhongsong", "SimSun-ExtB", "Zhongsong", serif',
    previewText: '沉稳厚重，典章重器之范',
    description: '笔画浑厚沉稳的中粗宋体，庄严肃穆，结构坚挺',
  },
  {
    id: 'harmony',
    name: '鸿蒙黑体',
    category: '黑体',
    fontFamily: '"HarmonyOS Sans SC", "HONOR Sans", "PingFang SC", sans-serif',
    previewText: '全场景智慧互联，感知时代脉搏',
    description: '华为 HarmonyOS 现代多端屏显字族，多设备自适应',
  },
  {
    id: 'hiragino',
    name: '冬青黑体',
    category: '黑体',
    fontFamily: '"Hiragino Sans GB", "冬青黑体简体中文", sans-serif',
    previewText: '清透细腻，日式美学排版典范',
    description: '苹果 macOS 招牌中文字体之一，字形纤巧清秀',
  },
  {
    id: 'lanting',
    name: '兰亭黑体',
    category: '黑体',
    fontFamily: '"FZLanTingHei-R-GBK", "Lantinghei SC", "Microsoft YaHei", sans-serif',
    previewText: '兰亭流觞，字字骨肉停匀',
    description: '方正经典屏幕排版黑体，中宫外放，重心平稳',
  },
  {
    id: 'zcool-kuaile',
    name: '站酷快乐体',
    category: '手写',
    fontFamily: '"ZCOOL KuaiLe", "STHupo", cursive, sans-serif',
    previewText: '快乐每一刻，灵动生趣巧天工',
    description: '趣味活泼的现代手写萌系字体，个性鲜明富有张力',
    cdnUrl: 'https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap',
  },
  {
    id: 'code-mono',
    name: '极客等宽混排',
    category: '等宽',
    fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", "PingFang SC", monospace',
    previewText: 'const think = async () => AI.solve();',
    description: 'JetBrains Mono 英文等宽与中文苹方无缝混排，极客最爱',
  },
];

const DB_NAME = 'omnichat_fonts_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_fonts';

function openFontDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Register a font file ArrayBuffer into the browser document.fonts
 */
export async function registerFontFace(name: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const font = new FontFace(name, buffer);
    await font.load();
    document.fonts.add(font);
  } catch (err) {
    console.warn(`Failed to register FontFace [${name}]:`, err);
  }
}

/**
 * Load all custom fonts from IndexedDB and register them
 */
export async function initCustomFonts(): Promise<CustomFontItem[]> {
  try {
    const db = await openFontDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = async () => {
        const records = req.result || [];
        const items: CustomFontItem[] = [];
        for (const record of records) {
          items.push({
            id: record.id,
            name: record.name,
            format: record.format,
            fileName: record.fileName,
            fileSize: record.fileSize,
            createdAt: record.createdAt,
          });
          if (record.buffer) {
            await registerFontFace(record.name, record.buffer);
          }
        }
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('initCustomFonts error:', e);
    return [];
  }
}

/**
 * Save user custom uploaded font into IndexedDB and register dynamically
 */
export async function saveCustomFont(
  file: File,
  customName?: string
): Promise<{ item: CustomFontItem; error?: string }> {
  try {
    const buffer = await file.arrayBuffer();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'ttf';
    const validFormats: Array<'ttf' | 'otf' | 'woff' | 'woff2'> = ['ttf', 'otf', 'woff', 'woff2'];
    const format = validFormats.includes(ext as any) ? (ext as 'ttf' | 'otf' | 'woff' | 'woff2') : 'ttf';

    const rawName = customName?.trim() || file.name.replace(/\.[^/.]+$/, '').trim();
    // Clean name for CSS font-family
    const fontName = rawName.replace(/["'`;]/g, '') || `UserFont_${Date.now()}`;
    const id = `custom-font-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const item: CustomFontItem = {
      id,
      name: fontName,
      format,
      fileName: file.name,
      fileSize: file.size,
      createdAt: Date.now(),
    };

    // Save to IndexedDB
    const db = await openFontDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        ...item,
        buffer,
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Register immediately in document.fonts
    await registerFontFace(fontName, buffer);

    return { item };
  } catch (err: any) {
    return { item: null as any, error: err.message || '导入字体失败' };
  }
}

/**
 * Delete a custom font from IndexedDB
 */
export async function deleteCustomFont(id: string): Promise<boolean> {
  try {
    const db = await openFontDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('deleteCustomFont error:', e);
    return false;
  }
}

/**
 * Get raw font buffer for exporting
 */
export async function getCustomFontBuffer(id: string): Promise<{ buffer: ArrayBuffer; item: CustomFontItem } | null> {
  try {
    const db = await openFontDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result && req.result.buffer) {
          resolve({
            buffer: req.result.buffer,
            item: {
              id: req.result.id,
              name: req.result.name,
              format: req.result.format,
              fileName: req.result.fileName,
              fileSize: req.result.fileSize,
              createdAt: req.result.createdAt,
            },
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

/**
 * Export individual font
 */
export async function exportIndividualFont(font: FontDefinition | CustomFontItem): Promise<void> {
  if ('isCustom' in font && font.isCustom || font.id.startsWith('custom-')) {
    // Export raw binary font
    const record = await getCustomFontBuffer(font.id);
    if (record && record.buffer) {
      const blob = new Blob([record.buffer], { type: `font/${record.item.format}` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = record.item.fileName || `${record.item.name}.${record.item.format}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);
      return;
    }
  }

  // Preset font: export standard CSS typography definition package
  const preset = PRESET_CHINESE_FONTS.find(f => f.id === font.id);
  const fontName = preset?.name || font.name;
  const family = preset?.fontFamily || (font as any).fontFamily || font.name;

  const cssContent = `/* OmniChat Typography Export: ${fontName} */
:root {
  --omnichat-font-name: "${fontName}";
  --omnichat-font-family: ${family};
}

body, html, .chat-content {
  font-family: var(--omnichat-font-family);
}
`;

  const blob = new Blob([cssContent], { type: 'text/css;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${font.id || font.name}-font-rule.css`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

/**
 * Apply selected font to the entire document seamlessly
 */
export function applyAppFont(fontIdOrName?: string, customFonts: CustomFontItem[] = []): void {
  if (!fontIdOrName || fontIdOrName === 'system') {
    document.documentElement.style.setProperty(
      '--app-font-family',
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif'
    );
    return;
  }

  // Check if preset
  const preset = PRESET_CHINESE_FONTS.find(f => f.id === fontIdOrName);
  if (preset) {
    document.documentElement.style.setProperty('--app-font-family', preset.fontFamily);
    // If it has CDN URL, load stylesheet dynamically
    if (preset.cdnUrl) {
      const linkId = `webfont-${preset.id}`;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = preset.cdnUrl;
        document.head.appendChild(link);
      }
    }
    return;
  }

  // Check if custom font
  const custom = customFonts.find(c => c.id === fontIdOrName || c.name === fontIdOrName);
  if (custom) {
    document.documentElement.style.setProperty(
      '--app-font-family',
      `"${custom.name}", "PingFang SC", "Microsoft YaHei", sans-serif`
    );
    return;
  }

  // Fallback
  document.documentElement.style.setProperty('--app-font-family', fontIdOrName);
}
