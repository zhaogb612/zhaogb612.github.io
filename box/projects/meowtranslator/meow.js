'use strict';
/* 喵语翻译器 - 独立翻译引擎 */

// ===== 喵语词典 =====
var meow_sounds = [
  '喵', '喵', '喵', '喵', '咪', '咪', '呜', '嗷', '噜', '啦',
  '喵喵', '喵呜', '咪呜', '嗷呜', '咕噜', '哒', '呀', '哇'
];

var meow_endings = [
  '喵~', '喵喵~', '喵呜~', '咪呜~', '嗷呜~', '喵喵喵~',
  '咪呀~', '嗷嗷~', '咕噜~', '喵嗷~', '咪~', '嗷~'
];

var meow_interjections = [
  '喵', '喵呜', '喵喵', '咪咪', '呜喵', '咕噜', '嗷呜'
];

var meow_actions = [
  '蹭蹭', '打滚', '伸懒腰', '舔爪爪', '摇尾巴', '踩奶',
  '打呼噜', '转圈圈', '扑蝴蝶', '追尾巴', '趴键盘', '挠沙发'
];

var meow_particles = [
  'の', '嘛', '呢', '哟', '啦', '喵', '咪', '嗷'
];

// 根据喵化程度生成不同长度的喵喵尾缀
function meow_tail(mode_id) {
  var count = mode_id + 1; // 1~5个喵
  var result = '';
  for (var i = 0; i < count; i++) {
    result += '喵';
  }
  return result + '~';
}

// 喵喵喵短语池（按程度分组）
var meow_phrases_level = [
  ['喵~'],                                                      // 0
  ['喵喵~', '咪~'],                                             // 1
  ['喵喵喵~', '喵呜~', '咪呜~'],                                 // 2
  ['喵喵喵喵~', '喵呜喵呜~', '嗷呜喵喵~'],                        // 3
  ['喵喵喵喵喵~', '喵呜喵呜喵呜~', '嗷呜~喵喵~咪呜~']              // 4
];

// ===== 翻译模式定义 =====
var meow_modes = [
  { id: 0, name: '轻度喵化', desc: '轻度替换，保留大部分原意' },
  { id: 1, name: '一般喵化', desc: '适度喵化，加入猫语特色' },
  { id: 2, name: '中等喵化', desc: '较多喵化，句子更可爱' },
  { id: 3, name: '重度喵化', desc: '大量喵化，添加猫猫动作' },
  { id: 4, name: '完全喵化', desc: '几乎全部变成喵语，喵星人专属' }
];

// ===== 辅助函数 =====
function meow_random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function meow_should(probability) {
  return Math.random() < probability;
}

function meow_is_chinese(char) {
  return /[\u4e00-\u9fff]/.test(char);
}

function meow_is_punctuation(char) {
  return /[，。！？、；：,.!?;:…~～]/.test(char);
}

function meow_is_space(char) {
  return /[\s\n\r]/.test(char);
}

function meow_is_english(char) {
  return /[a-zA-Z]/.test(char);
}

function meow_is_digit(char) {
  return /[0-9]/.test(char);
}

// ===== 核心翻译函数 =====
function meow_translate(text, mode_id) {
  if (!text || !text.trim()) return '';
  
  var mode = meow_modes[mode_id] || meow_modes[2];
  var result = '';
  var chars = text.split('');
  
  // 根据模式确定概率系数（提高喵化率！）
  var p_base = (mode_id + 1) * 0.18; // 0.18, 0.36, 0.54, 0.72, 0.90
  
  for (var i = 0; i < chars.length; i++) {
    var char = chars[i];
    
    if (meow_is_punctuation(char)) {
      result += meow_translate_punctuation(char, mode_id, p_base);
    } else if (meow_is_space(char)) {
      result += char;
      // 在空格处按概率插入喵喵
      if (mode_id >= 2 && meow_should(p_base * 0.4)) {
        result += meow_random(meow_sounds);
      }
    } else if (meow_is_chinese(char)) {
      result += meow_translate_chinese(char, mode_id, p_base, i, chars.length);
      // 每个字后面按概率额外加喵音
      if (mode_id >= 2 && meow_should(p_base * 0.25)) {
        result += meow_random(['喵', '咪', '呜']);
      }
    } else if (meow_is_english(char)) {
      result += meow_translate_english(char, mode_id, p_base);
    } else if (meow_is_digit(char)) {
      result += meow_translate_digit(char, mode_id, p_base);
    } else {
      result += char;
    }
  }
  
  // 按程度添加喵喵喵尾缀（越长越喵）
  if (mode_id >= 0) {
    var tail_count = mode_id + 1; // 1~5个喵
    var tail = '';
    for (var t = 0; t < tail_count; t++) {
      tail += '喵';
    }
    tail += '~';
    
    if (mode_id >= 3) {
      // 重度以上：再额外加一组
      tail += meow_random(meow_phrases_level[mode_id]);
    }
    
    result += ' ' + tail;
  }
  
  // 重度以上模式，添加动作
  if (mode_id >= 3 && meow_should(p_base * 0.6)) {
    result += '（' + meow_random(meow_actions) + '~）';
  }
  
  return result;
}

// ===== 标点符号翻译 =====
function meow_translate_punctuation(char, mode_id, p_base) {
  var period_replacements = ['……', '……喵', '~', '~~~', '……咪'];
  var exclaim_replacements = ['!', '!!', '喵!', '嗷!', '咪!'];
  var question_replacements = ['?', '??', '喵?', '咪?', '嗷?'];
  
  if (mode_id <= 1 && !meow_should(p_base * 0.5)) {
    return char;
  }
  
  if (/[，,]/.test(char)) {
    if (meow_should(p_base * 0.6)) {
      return '……' + (meow_should(0.5) ? meow_random(meow_interjections) : '');
    }
    return char;
  }
  
  if (/[。.]/.test(char)) {
    if (meow_should(p_base * 0.7)) {
      return meow_random(period_replacements);
    }
    return char;
  }
  
  if (/[！!]/.test(char)) {
    if (meow_should(p_base * 0.8)) {
      return meow_random(exclaim_replacements);
    }
    return char;
  }
  
  if (/[？?]/.test(char)) {
    if (meow_should(p_base * 0.8)) {
      return meow_random(question_replacements);
    }
    return char;
  }
  
  if (/[：:]/.test(char)) {
    if (meow_should(p_base * 0.5)) {
      return '：' + meow_random(meow_interjections) + '：';
    }
    return char;
  }
  
  if (/[；;]/.test(char)) {
    if (meow_should(p_base * 0.5)) {
      return '……';
    }
    return char;
  }
  
  if (/[～~]/.test(char)) {
    if (meow_should(p_base * 0.4)) {
      return '~~~' + meow_random(meow_endings);
    }
    return char;
  }
  
  return char;
}

// ===== 中文字符翻译 =====
function meow_translate_chinese(char, mode_id, p_base, index, length) {
  // 完全喵化模式 —— 几乎全喵
  if (mode_id >= 4 && meow_should(0.92)) {
    return meow_random(meow_sounds);
  }
  
  // 重度喵化模式
  if (mode_id >= 3 && meow_should(p_base * 1.2)) {
    return meow_random(meow_sounds);
  }
  
  // 一般替换
  if (meow_should(p_base)) {
    if (mode_id >= 2 && meow_should(0.4)) {
      // 添加连续猫叫
      var repeat = Math.floor(Math.random() * 2) + 1;
      var sound = '';
      for (var j = 0; j < repeat; j++) {
        sound += meow_random(meow_sounds);
      }
      return sound;
    }
    return meow_random(meow_sounds);
  }
  
  // 保留原文但添加插入喵语
  if (mode_id >= 1 && meow_should(p_base * 0.6)) {
    if (meow_should(0.5)) {
      return char + meow_random(meow_particles);
    }
    return meow_random(meow_interjections) + char;
  }
  
  return char;
}

// ===== 英文字符翻译 =====
function meow_translate_english(char, mode_id, p_base) {
  if (mode_id >= 3 && meow_should(p_base * 0.9)) {
    return meow_random(meow_sounds);
  }
  if (meow_should(p_base * 0.5)) {
    return meow_random(meow_sounds).toLowerCase();
  }
  return char;
}

// ===== 数字翻译 =====
function meow_translate_digit(char, mode_id, p_base) {
  if (mode_id >= 3 && meow_should(p_base * 0.6)) {
    var digit_words = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    var num = parseInt(char, 10);
    if (meow_should(0.5)) {
      return digit_words[num];
    }
    return meow_random(meow_sounds);
  }
  return char;
}

// ===== 批量翻译 - 生成多种结果 =====
function meow_translate_all(text) {
  var results = [];
  for (var i = 0; i < meow_modes.length; i++) {
    var translated = meow_translate(text, i);
    results.push({
      mode: meow_modes[i],
      text: translated
    });
  }
  return results;
}

// ===== 句子级别增强翻译（高级功能） =====
function meow_translate_enhanced(text) {
  if (!text || !text.trim()) return [];
  
  var results = [];
  var sentences = text.split(/[。！？\n!?\n]+/).filter(function(s) { return s.trim(); });
  
  // 为每个句子生成3种不同风格的翻译
  var styles = [
    { name: '日常喵', p: 0.3 },
    { name: '撒娇喵', p: 0.5 },
    { name: '高冷喵', p: 0.7 }
  ];
  
  for (var s = 0; s < styles.length; s++) {
    var style = styles[s];
    var output = '';
    
    for (var i = 0; i < sentences.length; i++) {
      var sentence = sentences[i].trim();
      if (sentence) {
        var mode_id = s === 0 ? 1 : (s === 1 ? 2 : 3);
        output += meow_translate(sentence, mode_id);
        if (i < sentences.length - 1) {
          output += '……喵~';
        }
      }
    }
    
    // 添加不同风格的喵喵结尾
    switch (s) {
      case 0:
        output += ' ' + meow_random(['喵喵~', '咪咪~', '喵呜~']);
        break;
      case 1:
        output += '~ ' + meow_random(meow_actions) + '~ 喵喵喵~';
        break;
      case 2:
        output += meow_random(['喵……', '哼喵……', '……喵。']) + '（' + meow_random(['甩甩尾巴', '舔爪爪', '眯起眼睛', '转过头不理你']) + '）';
        break;
    }
    
    results.push({
      style: style.name,
      text: output
    });
  }
  
  return results;
}

// ===== 获取模式信息 =====
function meow_get_modes() {
  return meow_modes;
}

// ===== 获取随机喵语 =====
function meow_random_tip() {
  var tips = [
    '喵~ 今天也是美好的一天！',
    '咕噜咕噜~ 摸摸头~',
    '嗷呜~ 想睡觉了…',
    '咪咪咪~ 鱼干好好吃！',
    '喵喵喵！快点陪窝玩！',
    '呜喵~ 这个罐罐是窝的！',
    '啾咪~ 你最好啦！',
    '嘶哈！ 是谁在那里！',
    '嗷嗷嗷！ 逗猫棒！ 逗猫棒！',
    '喵…… 别拍照了啦……'
  ];
  return meow_random(tips);
}
