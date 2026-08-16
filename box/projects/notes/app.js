var Notes = (function() {
  var EXPORT_CSS = [
    'body{max-width:800px;margin:40px auto;padding:0 24px;font:16px/1.9 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;color:#4c4948;background:#fefefe;}',
    'h1{font-size:2em;margin:0 0 0.3em;padding-bottom:0.4em;border-bottom:2px solid rgba(179,71,241,0.15);color:#2c3e50;}',
    'h1:hover:before{color:#b347f1;}',
    'h2{font-size:1.5em;margin:1.5em 0 0.5em;padding-bottom:0.2em;border-bottom:1px solid rgba(179,71,241,0.1);color:#3a3a3a;}',
    'h2:hover:before{color:#b347f1;}',
    'h3{font-size:1.25em;margin:1.4em 0 0.4em;color:#4a4a4a;}',
    'h3:hover:before{color:#b347f1;}',
    'h4{font-size:1.1em;margin:1.2em 0 0.3em;color:#5a5a5a;}',
    'h5{font-size:1em;margin:1em 0 0.3em;color:#666;}',
    'h6{font-size:0.9em;margin:0.8em 0 0.3em;color:#777;}',
    'p{margin:0 0 1em;}',
    'a{color:#b347f1;text-decoration:none;border-bottom:1px solid rgba(179,71,241,0.25);padding:2px 0;transition:all 0.3s;}',
    'a:hover{color:#fefefe;background:rgba(179,71,241,0.8);border-radius:4px;padding:2px 4px;box-shadow:0 8px 12px -3px rgba(66,89,239,0.14);border-bottom-color:transparent;}',
    'pre{background:rgba(179,71,241,0.06);color:#5a3e85;padding:20px 24px;border-radius:10px;overflow-x:auto;font:14px/1.6 "SF Mono",Monaco,"Cascadia Code","Fira Code",monospace;margin:1em 0;border:1px solid rgba(179,71,241,0.15);}',
    'pre code{background:none;padding:0;color:inherit;font-size:inherit;}',
    'code{background:rgba(179,71,241,0.1);color:#b347f1;padding:2px 8px;border-radius:4px;font:13px/1.5 "SF Mono",Monaco,monospace;}',
    'blockquote{margin:1em 0;padding:14px 22px;border-left:4px solid #b347f1;background:rgba(179,71,241,0.04);color:#5a5a5a;border-radius:0 8px 8px 0;}',
    'blockquote p{margin:0.5em 0;}',
    'table{display:table;width:100%;border-spacing:0;border-collapse:collapse;empty-cells:show;margin:1em 0;}',
    'table thead{background:rgba(179,71,241,0.08);}',
    'table thead th{color:#7c3aed;font-weight:600;}',
    'table th,table td{padding:6px 12px;border:1px solid rgba(179,71,241,0.15);vertical-align:middle;}',
    'table tbody tr:hover{background:rgba(179,71,241,0.04);}',
    'ul,ol{margin:0.8em 0;padding-left:1.8em;}',
    'ul li::marker{color:#b347f1;}',
    'ol li::marker{color:#b347f1;}',
    'li{margin:0.4em 0;}',
    'hr{border:none;height:1px;background:linear-gradient(to right,transparent,rgba(179,71,241,0.2),transparent);margin:2em 0;}',
    'img{max-width:100%;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);margin:1em 0;}',
    'strong{color:#2c3e50;}',
    'em{color:#666;}',
    'del{color:#999;}',
    'input[type="checkbox"]{accent-color:#b347f1;margin-right:6px;}',
    '@media(prefers-color-scheme:dark){',
    '  body{background:#191919;color:#c9c9c9;}',
    '  h1{color:#eee;border-bottom-color:rgba(179,71,241,0.2);}',
    '  h2{color:#ddd;border-bottom-color:rgba(179,71,241,0.15);}',
    '  h3{color:#ccc;}',
    '  h4{color:#bbb;}',
    '  h5{color:#aaa;}',
    '  h6{color:#999;}',
    '  a{color:#c084fc;border-bottom-color:rgba(192,132,252,0.3);}',
    '  a:hover{color:#fefefe;background:rgba(179,71,241,0.6);box-shadow:0 8px 12px -3px rgba(139,92,246,0.2);}',
    '  pre{background:rgba(179,71,241,0.08);color:#c4b5fd;border:1px solid rgba(179,71,241,0.15);}',
    '  code{background:rgba(179,71,241,0.14);color:#c084fc;}',
    '  blockquote{background:rgba(179,71,241,0.06);border-left-color:#7c3aed;color:#aaa;}',
    '  table{box-shadow:none;}',
    '  table thead{background:rgba(179,71,241,0.1);}',
    '  table thead th{color:#c084fc;}',
    '  table th,table td{border-color:rgba(179,71,241,0.15);}',
    '  table tbody tr:hover{background:rgba(179,71,241,0.06);}',
    '  hr{background:linear-gradient(to right,transparent,rgba(179,71,241,0.15),transparent);}',
    '  img{box-shadow:0 2px 12px rgba(0,0,0,0.4);}',
    '  strong{color:#ddd;}',
    '  em{color:#999;}',
    '  del{color:#666;}',
    '}',
    '@media(max-width:640px){body{padding:0 16px;font-size:15px;}}'
  ].join('\n');
  var STORAGE_KEY = 'notes_app_v3';
  var notes = [];
  var currentId = null;
  var currentMode = 'edit';
  var currentCatFilter = '';
  var currentSort = 'updated-desc';
  var batchMode = false;
  var selectedIds = {};
  var saveTimer = null;

  var $ = function(id) { return document.getElementById(id); };

  // ========== 数据层 ==========
  function loadNotes() {
    try {
      notes = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch(e) {
      notes = [];
    }
  }

  function saveNotes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function findNote(id) {
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === id) return notes[i];
    }
    return null;
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========== 分类收集 ==========
  function getCategories() {
    var cats = {};
    for (var i = 0; i < notes.length; i++) {
      var c = (notes[i].category || '').trim();
      if (c) cats[c] = true;
    }
    return Object.keys(cats).sort();
  }

  function updateCategoryFilter() {
    var cats = getCategories();
    var container = $('categoryFilter');
    var html = '<span class="cat-filter-item' + (currentCatFilter === '' ? ' active' : '') + '" data-cat="" onclick="Notes.filterByCat(this, \'\')">全部</span>';
    for (var i = 0; i < cats.length; i++) {
      html += '<span class="cat-filter-item' + (cats[i] === currentCatFilter ? ' active' : '') + '" data-cat="' + escapeHtml(cats[i]) + '" onclick="Notes.filterByCat(this, \'' + escapeHtml(cats[i]) + '\')">' + escapeHtml(cats[i]) + '</span>';
    }
    container.innerHTML = html;
  }

  function updateDatalist() {
    var cats = getCategories();
    var html = '';
    for (var i = 0; i < cats.length; i++) {
      html += '<option value="' + escapeHtml(cats[i]) + '">';
    }
    $('categorySuggestions').innerHTML = html;
  }

  // ========== 列表渲染 ==========
  function renderList() {
    var list = $('noteList');
    var filterText = ($('searchInput').value || '').toLowerCase();
    list.innerHTML = '';

    var filtered = notes;
    // 按分类筛选
    if (currentCatFilter) {
      filtered = filtered.filter(function(n) {
        return (n.category || '').trim() === currentCatFilter;
      });
    }
    // 按搜索词筛选
    if (filterText) {
      filtered = filtered.filter(function(n) {
        return (n.title || '').toLowerCase().indexOf(filterText) !== -1 ||
               (n.body || '').toLowerCase().indexOf(filterText) !== -1;
      });
    }

    // 排序
    filtered.sort(function(a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      switch (currentSort) {
        case 'updated-asc': return a.updated - b.updated;
        case 'created-desc': return b.created - a.created;
        case 'created-asc': return a.created - b.created;
        case 'title-asc': return (a.title || '').localeCompare(b.title || '', 'zh');
        case 'title-desc': return (b.title || '').localeCompare(a.title || '', 'zh');
        default: return b.updated - a.updated; // updated-desc
      }
    });

    for (var i = 0; i < filtered.length; i++) {
      var n = filtered[i];
      var item = document.createElement('div');
      item.className = 'note-item' +
        (n.id === currentId ? ' active' : '') +
        (n.pinned ? ' pinned' : '') +
        (batchMode ? ' batch-mode' : '') +
        (selectedIds[n.id] ? ' selected' : '');
      item.setAttribute('data-id', n.id);

      var catHtml = n.category ? '<span class="note-item-cat">' + escapeHtml(n.category) + '</span>' : '';

      item.innerHTML =
        '<input type="checkbox" class="note-checkbox" ' + (selectedIds[n.id] ? 'checked' : '') + '>' +
        '<div class="note-item-content">' +
          '<div class="note-item-title">' + escapeHtml(n.title || '无标题') + '</div>' +
          '<div class="note-item-preview">' + escapeHtml((n.body || '').replace(/\n/g, ' ').substring(0, 30) || '空内容') + '</div>' +
        '</div>' + catHtml;

      // 复选框事件
      var checkbox = item.querySelector('.note-checkbox');
      checkbox.addEventListener('change', (function(id) {
        return function(e) {
          e.stopPropagation();
          if (this.checked) {
            selectedIds[id] = true;
          } else {
            delete selectedIds[id];
          }
          updateBatchCount();
        };
      })(n.id));

      checkbox.addEventListener('click', function(e) {
        e.stopPropagation();
      });

      // 点击整行
      item.addEventListener('click', (function(id) {
        return function(e) {
          if (batchMode) {
            // 批量模式下切换选中
            if (selectedIds[id]) {
              delete selectedIds[id];
            } else {
              selectedIds[id] = true;
            }
            renderList();
            updateBatchCount();
            return;
          }
          selectNote(id);
        };
      })(n.id));

      // 右键置顶
      item.addEventListener('contextmenu', (function(id) {
        return function(e) {
          e.preventDefault();
          if (batchMode) return;
          togglePin(id);
        };
      })(n.id));

      list.appendChild(item);
    }

    $('noteCount').textContent = (currentCatFilter ? '分类 ' + currentCatFilter + ' · ' : '') + notes.length + ' 条便签';
  }

  function filterList() {
    renderList();
  }

  function filterByCat(el, cat) {
    currentCatFilter = cat;
    updateCategoryFilter();
    renderList();
  }

  function changeSort(value) {
    currentSort = value;
    renderList();
  }

  // ========== 批量模式 ==========
  function toggleBatchMode() {
    batchMode = !batchMode;
    var btn = $('btnBatchMode');
    var bar = $('batchBar');
    if (batchMode) {
      btn.classList.add('active');
      bar.style.display = 'flex';
      selectedIds = {};
    } else {
      btn.classList.remove('active');
      bar.style.display = 'none';
      selectedIds = {};
    }
    renderList();
    updateBatchCount();
  }

  function updateBatchCount() {
    var count = Object.keys(selectedIds).length;
    var bar = $('batchBar');
    if (bar.style.display !== 'none') {
      bar.innerHTML =
        '<button class="btn btn-small btn-cancel" onclick="Notes.selectAll()">全选</button>' +
        '<button class="btn btn-small btn-cancel" onclick="Notes.invertSelection()">反选</button>' +
        '<span class="batchbar-spacer"></span>' +
        (count > 0
          ? '<button class="btn btn-small btn-danger" onclick="Notes.batchDelete()">删除选中(' + count + ')</button>'
          : '<button class="btn btn-small btn-danger" disabled>删除选中</button>') +
        ' <button class="btn btn-small btn-cancel" onclick="Notes.toggleBatchMode()">取消</button>';
    }
  }

  function batchDelete() {
    var ids = Object.keys(selectedIds);
    if (ids.length === 0) return;
    if (!confirm('确定删除选中的 ' + ids.length + ' 条便签吗？此操作不可撤销。')) return;

    var idMap = {};
    for (var i = 0; i < ids.length; i++) {
      idMap[ids[i]] = true;
    }
    notes = notes.filter(function(n) { return !idMap[n.id]; });
    saveNotes();

    if (currentId && idMap[currentId]) {
      currentId = null;
      $('noteTitle').value = '';
      $('noteBody').value = '';
      $('noteCategory').value = '';
      $('editorContent').style.display = 'none';
      $('editorEmpty').style.display = 'flex';
      $('notePreview').innerHTML = '';
    }

    selectedIds = {};
    updateCategoryFilter();
    updateDatalist();
    renderList();
    updateBatchCount();
  }

  function selectAll() {
    selectedIds = {};
    var filtered = getFilteredNotes();
    for (var i = 0; i < filtered.length; i++) {
      selectedIds[filtered[i].id] = true;
    }
    renderList();
    updateBatchCount();
  }

  function invertSelection() {
    var filtered = getFilteredNotes();
    var newSelected = {};
    for (var i = 0; i < filtered.length; i++) {
      if (!selectedIds[filtered[i].id]) {
        newSelected[filtered[i].id] = true;
      }
    }
    selectedIds = newSelected;
    renderList();
    updateBatchCount();
  }

  function getFilteredNotes() {
    var filtered = notes;
    var filterText = ($('searchInput').value || '').toLowerCase();
    if (currentCatFilter) {
      filtered = filtered.filter(function(n) { return (n.category || '').trim() === currentCatFilter; });
    }
    if (filterText) {
      filtered = filtered.filter(function(n) {
        return (n.title || '').toLowerCase().indexOf(filterText) !== -1 ||
               (n.body || '').toLowerCase().indexOf(filterText) !== -1;
      });
    }
    return filtered;
  }

  // ========== 选择笔记 ==========
  function selectNote(id) {
    currentId = id;
    var note = findNote(id);
    if (!note) return;

    $('noteTitle').value = note.title || '';
    $('noteBody').value = note.body || '';
    $('noteCategory').value = note.category || '';
    $('noteTime').textContent = '更新于 ' + formatTime(note.updated);
    $('editorEmpty').style.display = 'none';
    $('editorContent').style.display = 'flex';

    // 确保编辑器区域类名正确
    var area = $('editorArea');
    if (!area.className) area.className = 'editor-area';

    updatePreview();
    updateStats();
    updatePinButton();
    renderList();

    if (currentMode === 'edit') {
      $('noteBody').focus();
    }
  }

  // ========== 新建 ==========
  function newNote() {
    var now = Date.now();
    var note = {
      id: 'n' + now,
      title: '',
      body: '',
      category: '',
      pinned: false,
      created: now,
      updated: now
    };
    notes.unshift(note);
    saveNotes();
    currentId = note.id;
    $('noteTitle').value = '';
    $('noteBody').value = '';
    $('noteCategory').value = '';
    $('noteTime').textContent = '创建于 ' + formatTime(now);
    $('editorEmpty').style.display = 'none';
    $('editorContent').style.display = 'flex';
    $('searchInput').value = '';
    currentCatFilter = '';
    updatePreview();
    updateStats();
    updateCategoryFilter();
    updateDatalist();
    renderList();
    setMode('edit');
    $('noteTitle').focus();
  }

  // ========== 删除 ==========
  function deleteNote() {
    if (currentId === null) return;
    if (!confirm('确定删除这条便签吗？')) return;
    notes = notes.filter(function(n) { return n.id !== currentId; });
    saveNotes();
    currentId = null;
    $('noteTitle').value = '';
    $('noteBody').value = '';
    $('noteCategory').value = '';
    $('editorContent').style.display = 'none';
    $('editorEmpty').style.display = 'flex';
    $('notePreview').innerHTML = '';
    updateCategoryFilter();
    updateDatalist();
    renderList();
  }

  // ========== 置顶 ==========
  function togglePin(id) {
    var note = findNote(id);
    if (!note) return;
    note.pinned = !note.pinned;
    saveNotes();
    renderList();
    updatePinButton();
  }

  function togglePinCurrent() {
    if (currentId === null) return;
    togglePin(currentId);
  }

  function updatePinButton() {
    if (currentId === null) return;
    var note = findNote(currentId);
    var btn = $('btnPin');
    if (note && note.pinned) {
      btn.classList.add('pinned');
      btn.innerHTML = '已置顶';
    } else {
      btn.classList.remove('pinned');
      btn.innerHTML = '置顶';
    }
  }

  // ========== 自动保存 ==========
  function autoSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function() {
      if (currentId === null) return;
      var note = findNote(currentId);
      if (!note) return;
      note.title = $('noteTitle').value;
      note.body = $('noteBody').value;
      var newCat = $('noteCategory').value.trim();
      var oldCat = note.category;
      note.category = newCat;
      note.updated = Date.now();
      saveNotes();
      updatePreview();
      updateStats();
      renderList();
      $('noteTime').textContent = '更新于 ' + formatTime(note.updated);
      if (newCat !== oldCat) {
        updateCategoryFilter();
        updateDatalist();
      }
    }, 400);
  }

  // ========== Markdown 解析 ==========
  function parseMarkdown(text) {
    if (!text) return '';
    var html = text;

    // 转义 HTML
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 代码块 - 用占位符保护，防止后续正则误处理内部内容
    var codeBlocks = [];
    html = html.replace(/```(\w*)\r?\n?([\s\S]*?)```/g, function(m, lang, code) {
      codeBlocks.push('<pre><code>' + code + '</code></pre>');
      return '\u0000CB' + (codeBlocks.length - 1) + '\u0000';
    });

    // 行内代码 - 同样用占位符保护
    var inlineCodes = [];
    html = html.replace(/`([^`]+)`/g, function(m, code) {
      inlineCodes.push('<code>' + code + '</code>');
      return '\u0000IC' + (inlineCodes.length - 1) + '\u0000';
    });

    // 图片 - 跳过 URL 中包含 HTML 标签的（已被转义为 &lt; &gt;）
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function(m, alt, url) {
      if (/&lt;|&gt;/.test(url)) return m;
      return '<img src="' + url + '" alt="' + alt + '">';
    });

    // 链接 - 跳过 URL 中包含 HTML 标签的
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(m, text, url) {
      if (/&lt;|&gt;/.test(url)) return m;
      return '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>';
    });

    // 标题
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 粗体+斜体
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // 粗体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 斜体（注意不匹配占位符）
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // 删除线
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // 水平线
    html = html.replace(/^---$/gm, '<hr>');

    // 引用（支持多行连续引用）
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // 表格（匹配连续的表格行）
    html = html.replace(/((?:^\|.+\|\n?)+)/gm, function(match) {
      var lines = match.trim().split('\n');
      if (lines.length < 2) return match;
      var tableHtml = '<table>';
      tableHtml += '<thead><tr>';
      var headers = lines[0].split('|').filter(function(c) { return c.trim(); });
      for (var i = 0; i < headers.length; i++) {
        tableHtml += '<th>' + headers[i].trim() + '</th>';
      }
      tableHtml += '</tr></thead><tbody>';
      var startRow = 1;
      if (lines[1] && /^[\|\s\-:]+$/.test(lines[1])) startRow = 2;
      for (var r = startRow; r < lines.length; r++) {
        tableHtml += '<tr>';
        var cells = lines[r].split('|').filter(function(c) { return c.trim(); });
        for (var c = 0; c < cells.length; c++) {
          tableHtml += '<td>' + cells[c].trim() + '</td>';
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      return tableHtml;
    });

    // 有序列表（至少一位数字 + 点号 + 空格）
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
    // 无序列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

    // 包裹连续的 <li>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, function(m) {
      return '<ul>' + m + '</ul>';
    });

    // 段落
    html = html.replace(/^(?!<[a-z\/]|$)(.+)$/gm, '<p>$1</p>');
    html = html.replace(/<p><\/p>/g, '');

    // 恢复占位符（代码块和行内代码）
    for (var j = 0; j < inlineCodes.length; j++) {
      html = html.replace('\u0000IC' + j + '\u0000', inlineCodes[j]);
    }
    for (var k = 0; k < codeBlocks.length; k++) {
      html = html.replace('\u0000CB' + k + '\u0000', codeBlocks[k]);
    }

    return html;
  }

  // ========== 预览和统计 ==========
  function updatePreview() {
    $('notePreview').innerHTML = parseMarkdown($('noteBody').value);
  }

  function updateStats() {
    var text = $('noteBody').value;
    $('charCount').textContent = text.length;
    var words = text.trim() ? text.trim().split(/\s+/).length : 0;
    $('wordCount').textContent = words;
    $('lineCount').textContent = text ? text.split('\n').length : 0;
  }

  // ========== 模式切换 ==========
  function setMode(mode) {
    currentMode = mode;
    var area = $('editorArea');
    area.className = 'editor-area';
    $('btnEditMode').classList.remove('active');
    $('btnPreviewMode').classList.remove('active');
    $('btnSplitMode').classList.remove('active');

    $('noteBody').style.display = '';
    $('notePreview').style.display = 'none';

    if (mode === 'edit') {
      $('btnEditMode').classList.add('active');
      $('noteBody').focus();
    } else if (mode === 'preview') {
      $('btnPreviewMode').classList.add('active');
      area.classList.add('preview');
      updatePreview();
    } else if (mode === 'split') {
      $('btnSplitMode').classList.add('active');
      area.classList.add('split');
      $('notePreview').style.display = 'block';
      updatePreview();
    }
  }

  // ========== 工具栏操作 ==========
  function getTextarea() {
    return $('noteBody');
  }

  function insertMarkdown(before, after) {
    var ta = getTextarea();
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var text = ta.value;
    var selected = text.substring(start, end);
    var replacement = before + selected + after;
    ta.value = text.substring(0, start) + replacement + text.substring(end);
    ta.focus();
    ta.selectionStart = start + before.length;
    ta.selectionEnd = start + before.length + selected.length;
    autoSave();
  }

  function insertLineStart(prefix) {
    var ta = getTextarea();
    var start = ta.selectionStart;
    var text = ta.value;
    var lineStart = text.lastIndexOf('\n', start - 1) + 1;
    ta.value = text.substring(0, lineStart) + prefix + text.substring(lineStart);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = lineStart + prefix.length;
    $('headingMenu').style.display = 'none';
    autoSave();
  }

  function toggleHeadingMenu() {
    var menu = $('headingMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }

  function insertLine(content) {
    var ta = getTextarea();
    var start = ta.selectionStart;
    var text = ta.value;
    ta.value = text.substring(0, start) + content + text.substring(start);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + content.length;
    autoSave();
  }

  function insertLink() {
    var ta = getTextarea();
    var selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    var url = prompt('链接地址:', 'https://');
    if (!url) return;
    var text = selected || prompt('链接文字:', url);
    if (text === null) return;
    insertMarkdown('[' + (text || url) + '](', url + ')');
  }

  function insertImage() {
    var ta = getTextarea();
    var url = prompt('图片地址:', 'https://');
    if (!url) return;
    var alt = prompt('图片描述:', 'image');
    if (alt === null) return;
    insertMarkdown('![' + (alt || 'image') + '](', url + ')');
  }

  function insertTable() {
    var cols = parseInt(prompt('表格列数 (2-10):', '3'), 10);
    if (!cols || cols < 2 || cols > 10) return;
    var rows = parseInt(prompt('表格行数 (2-20):', '3'), 10);
    if (!rows || rows < 2 || rows > 20) return;

    var table = '\n';
    // 表头
    table += '|';
    for (var c = 0; c < cols; c++) {
      table += ' 列' + (c + 1) + ' |';
    }
    table += '\n';
    // 分隔线
    table += '|';
    for (c = 0; c < cols; c++) {
      table += ' --- |';
    }
    table += '\n';
    // 数据行
    for (var r = 0; r < rows - 1; r++) {
      table += '|';
      for (c = 0; c < cols; c++) {
        table += ' 内容 |';
      }
      table += '\n';
    }

    var ta = getTextarea();
    var start = ta.selectionStart;
    var text = ta.value;
    ta.value = text.substring(0, start) + table + text.substring(start);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + table.length;
    autoSave();
  }

  // ========== 导出 ==========
  function exportMD() {
    if (currentId === null) return;
    var note = findNote(currentId);
    if (!note) return;
    var content = '# ' + (note.title || '无标题') + '\n\n' + note.body;
    downloadFile((note.title || '便签') + '.md', content, 'text/markdown');
  }

  function exportHTML() {
    if (currentId === null) return;
    var note = findNote(currentId);
    if (!note) return;
    var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' +
      escapeHtml(note.title || '便签') + '</title>\n<style>\n' + EXPORT_CSS + '\n</style>\n</head>\n<body>\n' +
      '<h1>' + escapeHtml(note.title || '便签') + '</h1>\n' +
      parseMarkdown(note.body) + '\n</body>\n</html>';
    downloadFile((note.title || '便签') + '.html', html, 'text/html');
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob(['\uFEFF' + content], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function batchExport() {
    if (notes.length === 0) { alert('没有便签可导出'); return; }
    var exportNotes = notes;
    if (currentCatFilter) {
      exportNotes = notes.filter(function(n) { return (n.category || '').trim() === currentCatFilter; });
    }
    $('exportCount').textContent = '共 ' + exportNotes.length + ' 条便签' + (currentCatFilter ? '（分类: ' + currentCatFilter + '）' : '');
    $('exportModal').style.display = 'flex';
    document.querySelector('input[name="exportFormat"][value="md"]').checked = true;
    $('exportZip').checked = false;
  }

  function closeExportModal() {
    $('exportModal').style.display = 'none';
  }

  function doExport() {
    var format = document.querySelector('input[name="exportFormat"]:checked').value;
    var useZip = $('exportZip').checked;

    var exportNotes = notes;
    if (currentCatFilter) {
      exportNotes = notes.filter(function(n) { return (n.category || '').trim() === currentCatFilter; });
    }
    exportNotes.sort(function(a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updated - a.updated;
    });

    closeExportModal();

    if (useZip) {
      exportAsZip(exportNotes, format);
    } else {
      exportAsFiles(exportNotes, format);
    }
  }

  function exportAsZip(exportNotes, format) {
    if (typeof JSZip === 'undefined') {
      alert('ZIP 组件加载失败，将逐个下载文件');
      exportAsFiles(exportNotes, format);
      return;
    }
    var zip = new JSZip();
    var folderName = currentCatFilter ? '便签_' + currentCatFilter : '便签';
    var folder = zip.folder(folderName);

    for (var i = 0; i < exportNotes.length; i++) {
      var n = exportNotes[i];
      var fileName = sanitizeFilename(n.title || '无标题') + (i + 1);
      if (format === 'md') {
        var content = '# ' + (n.title || '无标题') + '\n';
        if (n.category) content += '> 分类: ' + n.category + '\n';
        content += '> ' + formatTime(n.updated) + '\n\n';
        content += n.body;
        folder.file(fileName + '.md', content);
      } else {
        var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' +
          escapeHtml(n.title || '便签') + '</title>\n<style>\n' + EXPORT_CSS + '\n</style>\n</head>\n<body>\n' +
          '<h1>' + escapeHtml(n.title || '便签') + '</h1>\n' +
          (n.category ? '<p style="color:#999;">分类: ' + escapeHtml(n.category) + '</p>\n' : '') +
          parseMarkdown(n.body) + '\n</body>\n</html>';
        folder.file(fileName + '.html', html);
      }
    }

    zip.generateAsync({ type: 'blob' }).then(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = folderName + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function exportAsFiles(exportNotes, format) {
    var delay = 300;
    for (var i = 0; i < exportNotes.length; i++) {
      var n = exportNotes[i];
      var fileName = sanitizeFilename(n.title || '无标题') + (i + 1);
      if (format === 'md') {
        var content = '# ' + (n.title || '无标题') + '\n';
        if (n.category) content += '> 分类: ' + n.category + '\n';
        content += '> ' + formatTime(n.updated) + '\n\n';
        content += n.body;
        downloadFileDelayed(fileName + '.md', content, 'text/markdown', i * delay);
      } else {
        var html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' +
          escapeHtml(n.title || '便签') + '</title>\n<style>\n' + EXPORT_CSS + '\n</style>\n</head>\n<body>\n' +
          '<h1>' + escapeHtml(n.title || '便签') + '</h1>\n' +
          (n.category ? '<p style="color:#999;">分类: ' + escapeHtml(n.category) + '</p>\n' : '') +
          parseMarkdown(n.body) + '\n</body>\n</html>';
        downloadFileDelayed(fileName + '.html', html, 'text/html', i * delay);
      }
    }
  }

  function downloadFileDelayed(filename, content, mime, delay) {
    setTimeout(function() {
      var blob = new Blob(['\uFEFF' + content], { type: mime + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, delay);
  }

  function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 50) || '便签';
  }

  // ========== 键盘快捷键 ==========
  document.addEventListener('keydown', function(e) {
    if (currentId === null) return;
    var ta = $('noteBody');
    if (document.activeElement !== ta && document.activeElement !== $('noteTitle')) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); insertMarkdown('**', '**'); }
      if (e.key === 'i') { e.preventDefault(); insertMarkdown('*', '*'); }
      if (e.key === 's') { e.preventDefault(); autoSave(); }
    }
  });

  // ========== 初始化 ==========
  function init() {
    loadNotes();
    updateCategoryFilter();
    updateDatalist();
    renderList();
    if (notes.length > 0) {
      selectNote(notes[0].id);
    }
    // 点击遮罩关闭弹窗
    $('exportModal').addEventListener('click', function(e) {
      if (e.target === this) closeExportModal();
    });
    // 点击其他区域关闭标题下拉菜单
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.toolbar-group')) {
        $('headingMenu').style.display = 'none';
      }
    });
  }

  // 确保 DOM 就绪后再初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    newNote: newNote,
    deleteNote: deleteNote,
    autoSave: autoSave,
    filterList: filterList,
    filterByCat: filterByCat,
    changeSort: changeSort,
    setMode: setMode,
    toggleBatchMode: toggleBatchMode,
    batchDelete: batchDelete,
    selectAll: selectAll,
    invertSelection: invertSelection,
    togglePinCurrent: togglePinCurrent,
    insertMarkdown: insertMarkdown,
    insertLineStart: insertLineStart,
    toggleHeadingMenu: toggleHeadingMenu,
    insertLine: insertLine,
    insertLink: insertLink,
    insertImage: insertImage,
    insertTable: insertTable,
    exportMD: exportMD,
    exportHTML: exportHTML,
    batchExport: batchExport,
    closeExportModal: closeExportModal,
    doExport: doExport
  };
})();