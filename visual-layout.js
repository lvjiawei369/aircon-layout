/**
 * 飞奕空调管理 - 可视化布局完整交互逻辑
 * 功能：布局切换 / 图片上传 / AI渲染Mock / 画布平移缩放 /
 *       组件拖拽添加 / 移动 / 缩放 / 删除 / 房间-空调关联 /
 *       自动对齐 / 房间名编辑 / 保存恢复
 */

/* ═══════════════════════════════════════
   常量与配置
═══════════════════════════════════════ */
const IMAGES_PATH = 'images/';
const AC_STATES   = ['normal', 'cold'];           // demo 随机显示这两种
const AC_SIZE     = 52;                          // 空调图标尺寸(px)
const MIN_ROOM_W  = 80;
const MIN_ROOM_H  = 60;
const STORAGE_KEY = 'visual_layout_project_001'; // 按项目存储
const AI_RENDER_LIMIT_PER_ZONE    = 5;
const AI_RENDER_LIMIT_PROJECT     = 100;
const AI_RENDER_LIMIT_TOAST_MSG   = '您已经生成了足够多的渲染图，请选择一个使用吧';

/* IndexedDB：存大图 base64，避免 localStorage ~5MB 限制 */
const IDB_NAME = 'feiyi_visual_layout';
const IDB_STORE = 'kv';
const IDB_VERSION = 1;

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
  });
}

function idbSet(key, value) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(IDB_STORE).put(value, key);
  }));
}

function idbGet(key) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const r = tx.objectStore(IDB_STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

/* ═══════════════════════════════════════
   房间数据：每个房间绑定的空调列表
═══════════════════════════════════════ */
const ROOM_DATA = {
  'r-laobangongshi': { name: '老板办公室', acs: [
    { name: '老板办公室-1' },
  ]},
  'r-801': { name: '801会议室', acs: [
    { name: '801会议室-东1' },
    { name: '801会议室-西1' },
  ]},
  'r-caiwubu': { name: '财务部', acs: [
    { name: '财务部-东1' },
    { name: '财务部-西1' },
  ]},
  'r-chanpinbu': { name: '产品部', acs: [
    { name: '产品部-东1南' },
    { name: '产品部-东1北' },
    { name: '产品部-西1' },
  ]},
  'r-yunyingbu': { name: '运营部', acs: [
    { name: '运营部-东1' },
    { name: '运营部-西1' },
  ]},
  'r-zhiliangbu': { name: '质量部', acs: [
    { name: '质量部-1' },
  ]},
  'r-zhizaobu': { name: '制造部', acs: [
    { name: '制造部-东1' },
    { name: '制造部-西1' },
  ]},
  'r-yingjian': { name: '硬件研发', acs: [
    { name: '硬件研发-东1' },
    { name: '硬件研发-中1' },
    { name: '硬件研发-西1' },
  ]},
  'r-ruanjian': { name: '软件研发', acs: [
    { name: '软件研发-东1' },
    { name: '软件研发-中1' },
    { name: '软件研发-西1' },
  ]},
  'r-ceshi': { name: '测试部', acs: [
    { name: '测试部-东1' },
    { name: '测试部-西1' },
  ]},
  'r-hanjie': { name: '硬件焊接室', acs: [
    { name: '硬件焊接室-1' },
  ]},
  'r-803': { name: '803会议室', acs: [{ name: '803会议室-1' }]},
  'r-806': { name: '806会议室', acs: [{ name: '806会议室-1' }]},
  'r-808': { name: '808会议室', acs: [{ name: '808会议室-1' }]},
  'r-810': { name: '810会议室', acs: [{ name: '810会议室-1' }]},
  'r-812': { name: '812会议室', acs: [{ name: '812会议室-1' }]},
  'r-816': { name: '816会议室', acs: [{ name: '816会议室-1' }]},
  'r-8dt': { name: '8层电梯厅', acs: [{ name: '8层电梯厅-1' }]},
  'r-901': { name: '901会议室', acs: [{ name: '901会议室-1' }]},
  'r-jishubu': { name: '技术部', acs: [
    { name: '技术部-东1' },
    { name: '技术部-西1' },
  ]},
  'r-9dt': { name: '9层电梯厅', acs: [{ name: '9层电梯厅-1' }]},
};


/* ═══════════════════════════════════════
   全局状态
═══════════════════════════════════════ */
const S = {
  layout: 'normal',          // 'normal' | 'visual'
  // ── 当前区域缓存（从 S.zones[currentZoneId] 映射过来）──
  phase:  'empty',           // 'empty' | 'setup' | 'canvas'
  originalImageUrl: null,
  currentPreviewUrl: null,
  selectedImageUrl:  null,
  renderHistory: [],
  isEditing: false,
  canvas: { tx: 0, ty: 0, scale: 1 },
  components: [],
  selectedId: null,
  nextId: 1,
  // ── 多区域 ──
  currentZoneId: null,
  zones: {},                 // { zoneId: zoneState }
  projectAiRenderCount: 0,    // 全项目成功 AI 渲染次数（持久化）
  // ── 交互临时状态 ──
  drag: null,
  pan:  null,
  resize: null,
  editingRoomId: null,
  selectedPosBtn: null,
};

/* ═══════════════════════════════════════
   初始化
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  generateAcCards();
  bindUIEvents();
  initZones();
  initTreeToggle();
  await loadFromStorage();
  await purgeStored8FImagesOnce();
  // 若无已存区域，默认选第一个
  if (!S.currentZoneId) {
    const first = document.querySelector('#buildingTree .bt-node[data-zone-id]');
    if (first) S.currentZoneId = first.dataset.zoneId;
  }
  if (S.currentZoneId) {
    if (!S.zones[S.currentZoneId]) S.zones[S.currentZoneId] = defaultZoneState();
    loadZone(S.currentZoneId);
  }
  updateLayoutUI();
  if (S.phase === 'canvas') restoreCanvasBg();
  updateHistoryUI();
  updateZoneUI();
});

/* ── 生成普通视图 AC 卡片 ── */
function generateAcCards() {
  const configs = [
    {room:'会议室1', temp:18, roomTemp:21, state:'cold',  mode:'制冷', fan:'低风', power:'开机'},
    {room:'会议室1', temp:23, roomTemp:21, state:'warm',  mode:'制热', fan:'低风', power:'开机'},
    {room:'会议室1', temp:22, roomTemp:21, state:'fan',   mode:'送风', fan:'低风', power:'开机'},
    {room:'会议室1', temp:24, roomTemp:21, state:'dry',   mode:'除湿', fan:'低风', power:'开机'},
    {room:'会议室1', temp:22, roomTemp:21, state:'off',   mode:'制冷', fan:'低风', power:'关机'},
    {room:'会议室1', temp:22, roomTemp:21, state:'error', mode:'制冷', fan:'低风', power:'关机'},
    {room:'会议室1', temp:22, roomTemp:21, state:'off',   mode:'制冷', fan:'低风', power:'关机'},
    {room:'会议室1', temp:22, roomTemp:21, state:'off',   mode:'制冷', fan:'低风', power:'关机'},
    {room:'会议室1', temp:22, roomTemp:21, state:'off',   mode:'制冷', fan:'低风', power:'关机'},
    {room:'会议室1', temp:22, roomTemp:21, state:'off',   mode:'制冷', fan:'低风', power:'关机'},
    {room:'会议室1', temp:18, roomTemp:21, state:'cold',  mode:'制冷', fan:'低风', power:'开机'},
    {room:'会议室1', temp:23, roomTemp:21, state:'warm',  mode:'制热', fan:'低风', power:'开机'},
  ];
  const stateImg = { cold:'cold.png', warm:'warm.png', fan:'wind.png', dry:'wind.png', off:'normal.png', normal:'normal.png', error:'error.png' };
  const html = configs.map(c => `
    <div class="ac-card ac-${c.state === 'error' ? 'error' : c.state}">
      <div class="card-gradient"></div>
      <div class="card-top">
        <span class="card-room">${c.room}</span>
        <span class="card-icons">📶 🔔</span>
        <span class="card-type">物业</span>
      </div>
      <div class="card-mid">
        <div>
          <div class="card-temp">${c.temp}<sup>℃</sup></div>
          <div class="card-room-temp">室温${c.roomTemp}℃</div>
        </div>
        <img class="card-icon" src="${IMAGES_PATH}${stateImg[c.state]}" alt="${c.state}">
      </div>
      <div class="card-bottom">
        <span class="card-stat">❄ ${c.mode}</span>
        <span class="card-stat">🌀 ${c.fan}</span>
        <span class="card-stat">⚡ ${c.power}</span>
      </div>
    </div>`).join('');
  document.getElementById('acGrid').innerHTML = html;
}

/* ── 绑定所有 UI 事件 ── */
function bindUIEvents() {
  // 图片上传
  document.getElementById('uploadBtn').addEventListener('click', () =>
    document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', handleFileUpload);
  document.getElementById('reuploadBtn').addEventListener('click', reuploadImage);

  // 图片设置阶段
  document.getElementById('useOriginalBtn').addEventListener('click', switchToOriginal);
  document.getElementById('aiRenderBtn').addEventListener('click', startAIRender);
  document.getElementById('regenBtn').addEventListener('click', startAIRender);
  document.getElementById('confirmImageBtn').addEventListener('click', confirmImage);
  document.getElementById('originalThumb').addEventListener('click', switchToOriginal);

  // 画布工具栏
  document.getElementById('replaceImageBtn').addEventListener('click', replaceImage);
  document.getElementById('editModeBtn').addEventListener('click', enterEditMode);
  document.getElementById('exitEditBtn').addEventListener('click', () => exitEditMode(true));
  document.getElementById('saveBtn').addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    saveLayout().catch(err => { console.error(err); showToast('保存失败'); });
  });

  document.addEventListener('mousedown', e => {
    const menu = document.getElementById('canvasContextMenu');
    if (!menu || menu.style.display === 'none') return;
    if (menu.contains(e.target)) return;
    hideCanvasContextMenu();
  }, true);
  document.getElementById('zoomInBtn').addEventListener('click', () => zoom(0.15));
  document.getElementById('zoomOutBtn').addEventListener('click', () => zoom(-0.15));
  document.getElementById('fitBtn').addEventListener('click', fitToView);
  document.getElementById('undoBtn').addEventListener('click', () => undoEdit());
  document.getElementById('redoBtn').addEventListener('click', () => redoEdit());

  // 画布鼠标事件
  const outer = document.getElementById('canvasOuter');
  outer.addEventListener('mousedown', onCanvasMouseDown);
  outer.addEventListener('wheel', onCanvasWheel, { passive: false });

  // 全局鼠标事件
  document.addEventListener('mousemove', onGlobalMouseMove);
  document.addEventListener('mouseup', onGlobalMouseUp);

  // 键盘 Delete
  document.addEventListener('keydown', onKeyDown);

  // 弹窗按钮
  document.getElementById('modalCloseBtn').addEventListener('click', () =>
    document.getElementById('roomModal').style.display = 'none');
  document.getElementById('modalCancelBtn').addEventListener('click', () =>
    document.getElementById('roomModal').style.display = 'none');
  document.getElementById('modalConfirmBtn').addEventListener('click', confirmRoomEdit);
  document.getElementById('roomModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('roomModal').style.display = 'none';
  });
  document.getElementById('roomNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmRoomEdit();
    if (e.key === 'Escape') document.getElementById('roomModal').style.display = 'none';
  });

  // 位置选择按钮
  document.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPos(btn));
  });

  initBuildingTreeCheckboxSync();
}

/** 建筑树 data-room-id → 画布上对应房间（含旧数据无 treeRoomId 时按房间名匹配） */
function findCanvasRoomsByTreeRoomId(treeRoomId) {
  const meta = ROOM_DATA[treeRoomId];
  const byName = meta?.name;
  return S.components.filter(c => {
    if (c.type !== 'room') return false;
    if (c.treeRoomId === treeRoomId) return true;
    if (!c.treeRoomId && byName && c.name === byName) return true;
    return false;
  });
}

/** 左侧勾选房间时，同步勾选/取消该房间在画布内的所有空调 */
function applyTreeRoomCheckboxToCanvas(treeRoomId, checked) {
  if (S.layout !== 'visual' || S.phase !== 'canvas') return;
  const rooms = findCanvasRoomsByTreeRoomId(treeRoomId);
  let changed = false;
  rooms.forEach(room => {
    if (!room.acIds || !room.acIds.length) return;
    room.acIds.forEach(acId => {
      const ac = getComp(acId);
      if (ac && ac.type === 'ac' && !!ac.checked !== checked) {
        ac.checked = checked;
        changed = true;
      }
    });
  });
  if (changed) {
    renderComponents();
    recordEditHistory();
  }
}

function initBuildingTreeCheckboxSync() {
  const tree = document.getElementById('buildingTree');
  if (!tree) return;
  tree.addEventListener('change', e => {
    const t = e.target;
    if (!t.classList || !t.classList.contains('bt-cb')) return;
    const node = t.closest('.bt-node[data-room-id]');
    if (!node || !node.classList.contains('lv3')) return;
    const treeRoomId = node.dataset.roomId;
    if (!treeRoomId) return;
    applyTreeRoomCheckboxToCanvas(treeRoomId, t.checked);
  });
}

/* ═══════════════════════════════════════
   布局切换
═══════════════════════════════════════ */
function switchLayout(mode) {
  S.layout = mode;
  localStorage.setItem(STORAGE_KEY + '_layout', mode);
  updateLayoutUI();
}

function updateLayoutUI() {
  const isVisual = S.layout === 'visual';
  document.getElementById('normalView').style.display   = isVisual ? 'none' : '';
  document.getElementById('visualView').style.display   = isVisual ? 'flex' : 'none';
  document.getElementById('normalLayoutBtn').classList.toggle('active', !isVisual);
  document.getElementById('visualLayoutBtn').classList.toggle('active', isVisual);
  document.getElementById('normalToolbar').style.display = isVisual ? 'none' : '';
  if (isVisual) showPhase(S.phase);
  updateZoneUI();
}

function showPhase(phase) {
  S.phase = phase;
  document.getElementById('emptyState').style.display       = phase === 'empty'  ? 'flex' : 'none';
  document.getElementById('imageSetupPhase').style.display  = phase === 'setup'  ? 'flex' : 'none';
  document.getElementById('canvasPhase').style.display      = phase === 'canvas' ? 'flex' : 'none';
}

/* ═══════════════════════════════════════
   多区域管理
═══════════════════════════════════════ */
function defaultZoneState() {
  return {
    phase: 'empty', originalImageUrl: null, currentPreviewUrl: null,
    selectedImageUrl: null, renderHistory: [], isEditing: false,
    canvas: { tx: 0, ty: 0, scale: 1 }, components: [], selectedId: null, nextId: 1,
    aiRenderCount: 0,
  };
}

function ensureCurrentZoneId() {
  if (S.currentZoneId) return;
  const first = document.querySelector('#buildingTree .bt-node[data-zone-id]');
  if (first) S.currentZoneId = first.dataset.zoneId;
}

function saveCurrentZone() {
  ensureCurrentZoneId();
  if (!S.currentZoneId) return;
  const zid = S.currentZoneId;
  const prev = S.zones[zid] || {};
  S.zones[zid] = {
    phase: S.phase, originalImageUrl: S.originalImageUrl,
    currentPreviewUrl: S.currentPreviewUrl, selectedImageUrl: S.selectedImageUrl,
    renderHistory: S.renderHistory, isEditing: false,
    canvas: { ...S.canvas }, components: S.components.map(c => ({ ...c })),
    selectedId: S.selectedId, nextId: S.nextId,
    aiRenderCount: prev.aiRenderCount ?? 0,
  };
}

function loadZone(zoneId) {
  const z = S.zones[zoneId] || defaultZoneState();
  S.phase            = z.phase            ?? 'empty';
  S.originalImageUrl = z.originalImageUrl ?? null;
  S.currentPreviewUrl= z.currentPreviewUrl?? null;
  S.selectedImageUrl = z.selectedImageUrl ?? null;
  S.renderHistory    = z.renderHistory    ?? [];
  S.isEditing        = false;
  S.canvas           = { ...(z.canvas || { tx:0, ty:0, scale:1 }) };
  S.components       = (z.components || []).map(c => ({ ...c }));
  S.selectedId       = null;
  S.nextId           = z.nextId ?? 1;
  S.drag = null; S.pan = null; S.resize = null; S.editingRoomId = null;
}

function switchZone(zoneId) {
  if (S.currentZoneId === zoneId) return;
  // 退出编辑模式 UI（不弹 toast）
  if (S.isEditing) {
    S.isEditing = false;
    hideEditDragGuide();
    const cp = document.getElementById('compPanel');
    if (cp) cp.style.display = 'none';
    document.getElementById('editModeBtn').style.display  = 'flex';
    document.getElementById('exitEditBtn').style.display  = 'none';
    document.getElementById('saveBtn').style.display      = 'none';
    const ur = document.getElementById('undoRedoGroup');
    if (ur) ur.style.display = 'none';
    resetEditHistory();
    const pill = document.getElementById('modePill');
    if (pill) {
      pill.querySelector('.mode-dot').className = 'mode-dot view-mode';
      document.getElementById('modeText').textContent = '查看模式';
    }
    try { document.getElementById('canvasOuter').style.cursor = 'grab'; } catch(_) {}
    document.getElementById('buildingPanel').classList.remove('edit-mode');
    document.querySelectorAll('#buildingTree .bt-cb').forEach(cb => { cb.disabled = false; });
    removeBuildingTreeDrag();
  }
  saveCurrentZone();
  S.currentZoneId = zoneId;
  if (!S.zones[zoneId]) S.zones[zoneId] = defaultZoneState();
  loadZone(zoneId);
  if (S.layout === 'visual') {
    showPhase(S.phase);
    if (S.phase === 'canvas') restoreCanvasBg();
    else { document.getElementById('canvasInner').querySelectorAll('.room-comp,.ac-comp').forEach(e=>e.remove()); }
    updateHistoryUI();
    // 恢复 setup 阶段预览图
    if (S.phase === 'setup' && S.currentPreviewUrl) {
      document.getElementById('previewImg').src = S.currentPreviewUrl;
      document.getElementById('originalThumbImg').src = S.originalImageUrl || '';
    }
  }
  updateZoneUI();
}

function restoreCanvasBg() {
  if (!S.selectedImageUrl) return;
  const bg = document.getElementById('canvasBg');
  if (!bg) return;
  bg.src = S.selectedImageUrl;
  bg.onload = () => {
    bg.style.width  = bg.naturalWidth  + 'px';
    bg.style.height = bg.naturalHeight + 'px';
    applyCanvasTransform();
    renderComponents();
  };
}

function initZones() {
  let counter = 0, lv1Label = '';
  document.querySelectorAll('#buildingTree .bt-node').forEach(node => {
    if (node.classList.contains('lv1')) {
      lv1Label = node.querySelector('.bt-label')?.textContent.trim() || '';
      return;
    }
    if (!node.classList.contains('lv2')) return; // lv3 不是区域
    const label = node.querySelector('.bt-label')?.textContent.trim() || '楼层';
    if (!node.dataset.zoneId) {
      node.dataset.zoneId = 'z' + (++counter);
    }
    if (!node.dataset.zoneLabel) {
      node.dataset.zoneLabel = lv1Label ? `${lv1Label} · ${label}` : label;
    }
    // 楼层切换交由 initTreeToggle 的 lv2 整行点击统一处理（整行热区）
  });
}

/* ═══════════════════════════════════════
   建筑树展开/折叠
═══════════════════════════════════════ */
function initTreeToggle() {
  document.querySelectorAll('#buildingTree .bt-node.lv1, #buildingTree .bt-node.lv2').forEach(node => {
    const arrow = node.querySelector('.bt-arrow');
    if (!arrow) return;
    arrow.style.cursor = 'pointer';

    // lv2 整行点击触发展开/折叠（排除 checkbox）
    if (node.classList.contains('lv2')) {
      node.style.cursor = 'pointer';
      node.addEventListener('click', e => {
        // 如果点击的是 checkbox，不触发展开/折叠
        if (e.target.classList.contains('bt-cb')) return;
        e.stopPropagation();
        toggleNode(node, arrow);
        if (S.layout === 'visual' && node.dataset.zoneId) {
          switchZone(node.dataset.zoneId);
        }
      });
    }

    arrow.addEventListener('click', e => {
      e.stopPropagation();
      toggleNode(node, arrow);
      if (node.classList.contains('lv2') && S.layout === 'visual' && node.dataset.zoneId) {
        switchZone(node.dataset.zoneId);
      }
    });
  });
}

function toggleNode(node, arrow) {
  const isOpen = node.classList.toggle('open');
  arrow.textContent = isOpen ? '▼' : '▶';
  arrow.classList.toggle('open', isOpen);
  // 控制子节点显示
  let sibling = node.nextElementSibling;
  if (node.classList.contains('lv1')) {
    // lv1：树结构平铺，需遍历所有 lv2 和 lv3 后代
    let lastLv2 = null;
    while (sibling && (sibling.classList.contains('lv2') || sibling.classList.contains('lv3'))) {
      if (!isOpen) {
        sibling.style.display = 'none';
      } else if (sibling.classList.contains('lv2')) {
        sibling.style.display = '';
        lastLv2 = sibling;
      } else {
        // lv3：仅当所属 lv2 处于展开状态时才显示
        sibling.style.display = (lastLv2 && lastLv2.classList.contains('open')) ? '' : 'none';
      }
      sibling = sibling.nextElementSibling;
    }
  } else {
    // lv2：切换其直属 lv3 子节点
    while (sibling && sibling.classList.contains('lv3')) {
      sibling.style.display = isOpen ? '' : 'none';
      sibling = sibling.nextElementSibling;
    }
  }
}


function updateZoneUI() {
  const isVisual = S.layout === 'visual';
  document.querySelectorAll('#buildingTree .bt-node[data-zone-id]').forEach(node => {
    node.classList.toggle('zone-active', isVisual && node.dataset.zoneId === S.currentZoneId);
    const zone = S.zones[node.dataset.zoneId];
    node.classList.toggle('zone-has-image', !!(zone?.selectedImageUrl));
  });
  const nameEl = document.getElementById('zoneCurrentName');
  if (nameEl) {
    if (S.currentZoneId) {
      const node = document.querySelector(`#buildingTree .bt-node[data-zone-id="${S.currentZoneId}"]`);
      nameEl.textContent = node?.dataset.zoneLabel || S.currentZoneId;
    } else {
      nameEl.textContent = '请在左侧选择楼层';
    }
  }
}

/* ═══════════════════════════════════════
   图片处理
═══════════════════════════════════════ */
function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const url = ev.target.result; // data URL
    S.originalImageUrl  = url;
    S.currentPreviewUrl = url;
    document.getElementById('previewImg').src = url;
    document.getElementById('originalThumbImg').src = url;
    document.getElementById('aiBadge').style.display = 'none';
    document.getElementById('regenBtn').style.display = 'none';
    showPhase('setup');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function reuploadImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target.result;
      S.originalImageUrl  = url;
      S.currentPreviewUrl = url;
      document.getElementById('previewImg').src = url;
      document.getElementById('originalThumbImg').src = url;
      document.getElementById('aiBadge').style.display = 'none';
      document.getElementById('regenBtn').style.display = 'none';
      // 清空渲染历史
      S.renderHistory = [];
      updateHistoryUI();
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function replaceImage() {
  if (!confirm('更换底图后将保留现有组件位置，确认继续？')) return;
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target.result; // data URL
      S.originalImageUrl  = url;
      S.currentPreviewUrl = url;
      document.getElementById('previewImg').src = url;
      document.getElementById('originalThumbImg').src = url;
      document.getElementById('aiBadge').style.display = 'none';
      document.getElementById('regenBtn').style.display = 'none';
      showPhase('setup');
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function switchToOriginal() {
  if (!S.originalImageUrl) return;
  S.currentPreviewUrl = S.originalImageUrl;
  document.getElementById('previewImg').src = S.originalImageUrl;
  document.getElementById('aiBadge').style.display = 'none';
  markHistoryActive(null);
}

/* ── AI 渲染（调用 Packey API） ── */
async function startAIRender() {
  if (!S.originalImageUrl) { showToast('请先上传图片'); return; }
  ensureCurrentZoneId();
  if (!S.currentZoneId) { showToast('请先选择楼层'); return; }
  const zoneCount = S.zones[S.currentZoneId]?.aiRenderCount ?? 0;
  const proj = S.projectAiRenderCount ?? 0;
  if (proj >= AI_RENDER_LIMIT_PROJECT || zoneCount >= AI_RENDER_LIMIT_PER_ZONE) {
    showToast(AI_RENDER_LIMIT_TOAST_MSG);
    return;
  }

  const aiBtn  = document.getElementById('aiRenderBtn');
  const rgnBtn = document.getElementById('regenBtn');
  const loading = document.getElementById('aiLoading');
  aiBtn.disabled = true;
  if (rgnBtn) rgnBtn.disabled = true;
  loading.style.display = 'flex';

  try {
    const rendered = await callGeminiAPI(S.originalImageUrl);

    const label = `渲染 #${S.renderHistory.length + 1}`;
    S.renderHistory.push({ url: rendered, label });
    updateHistoryUI();

    S.currentPreviewUrl = rendered;
    document.getElementById('previewImg').src = rendered;
    document.getElementById('aiBadge').style.display = 'flex';
    rgnBtn.style.display = 'flex';
    markHistoryActive(S.renderHistory.length - 1);

    const zid = S.currentZoneId;
    if (!S.zones[zid]) S.zones[zid] = defaultZoneState();
    S.zones[zid].aiRenderCount = (S.zones[zid].aiRenderCount || 0) + 1;
    S.projectAiRenderCount = (S.projectAiRenderCount || 0) + 1;
    try {
      await persistLayoutToStorage();
    } catch (e) {
      console.warn('AI 渲染次数已更新，但持久化失败', e);
    }
  } catch (err) {
    console.error('[PackeyAPI]', err);
    const msg = err && err.message ? String(err.message) : '未知错误';
    showToast('AI 渲染失败：' + msg);
  } finally {
    loading.style.display = 'none';
    aiBtn.disabled = false;
    if (rgnBtn) rgnBtn.disabled = false;
  }
}

/* ── 历史记录 UI ── */
function updateHistoryUI() {
  const list = document.getElementById('renderHistory');
  if (S.renderHistory.length === 0) {
    list.innerHTML = '<div class="history-empty">暂无生成记录</div>';
    return;
  }
  list.innerHTML = S.renderHistory.map((item, i) => `
    <div class="history-item" data-index="${i}" onclick="selectHistoryItem(${i})">
      <img src="${item.url}" alt="${item.label}">
      <div class="history-item-label">${item.label}</div>
    </div>`).join('');
  markHistoryActive(S.renderHistory.length - 1);
}

function selectHistoryItem(index) {
  const item = S.renderHistory[index];
  if (!item) return;
  S.currentPreviewUrl = item.url;
  document.getElementById('previewImg').src = item.url;
  document.getElementById('aiBadge').style.display = 'flex';
  document.getElementById('regenBtn').style.display = 'flex';
  markHistoryActive(index);
}

function markHistoryActive(index) {
  document.querySelectorAll('.history-item').forEach((el, i) =>
    el.classList.toggle('active', i === index));
}

function confirmImage() {
  if (!S.currentPreviewUrl) { showToast('请先选择或生成图片'); return; }
  S.selectedImageUrl = S.currentPreviewUrl;
  document.getElementById('canvasBg').src = S.selectedImageUrl;
  showPhase('canvas');
  const img = document.getElementById('canvasBg');
  let didEnter = false;
  const afterBgReady = () => {
    if (didEnter || !img.naturalWidth) return;
    didEnter = true;
    img.style.width  = img.naturalWidth + 'px';
    img.style.height = img.naturalHeight + 'px';
    fitToView();
    enterEditMode();
  };
  img.onload = () => afterBgReady();
  if (img.complete && img.naturalWidth > 0) afterBgReady();
}

/* ═══════════════════════════════════════
   画布 平移 / 缩放
═══════════════════════════════════════ */
function applyCanvasTransform() {
  const { tx, ty, scale } = S.canvas;
  document.getElementById('canvasInner').style.transform =
    `translate(${tx}px, ${ty}px) scale(${scale})`;
  document.getElementById('zoomVal').textContent = Math.round(scale * 100) + '%';
}

function zoom(delta, pivotX, pivotY) {
  const outer = document.getElementById('canvasOuter');
  const rect  = outer.getBoundingClientRect();
  const cx = pivotX !== undefined ? pivotX : rect.width  / 2;
  const cy = pivotY !== undefined ? pivotY : rect.height / 2;
  const oldScale = S.canvas.scale;
  const newScale = Math.max(0.15, Math.min(5, oldScale + delta));
  const ratio = newScale / oldScale;
  S.canvas.tx = cx - ratio * (cx - S.canvas.tx);
  S.canvas.ty = cy - ratio * (cy - S.canvas.ty);
  S.canvas.scale = newScale;
  applyCanvasTransform();
}

function fitToView() {
  const outer = document.getElementById('canvasOuter');
  const bg    = document.getElementById('canvasBg');
  if (!bg.naturalWidth) return;
  const ow = outer.clientWidth  - 40;
  const oh = outer.clientHeight - 40;
  const scale = Math.min(ow / bg.naturalWidth, oh / bg.naturalHeight, 1);
  S.canvas.scale = scale;
  S.canvas.tx = (outer.clientWidth  - bg.naturalWidth  * scale) / 2;
  S.canvas.ty = (outer.clientHeight - bg.naturalHeight * scale) / 2;
  applyCanvasTransform();
}

function onCanvasWheel(e) {
  e.preventDefault();
  const outer = document.getElementById('canvasOuter');
  const rect  = outer.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const delta = e.deltaY < 0 ? 0.1 : -0.1;
  zoom(delta * S.canvas.scale * 0.6, px, py);
}

/* ═══════════════════════════════════════
   屏幕坐标 → 画布内容坐标
═══════════════════════════════════════ */
function screenToCanvas(screenX, screenY) {
  const outer = document.getElementById('canvasOuter');
  const rect  = outer.getBoundingClientRect();
  return {
    x: (screenX - rect.left  - S.canvas.tx) / S.canvas.scale,
    y: (screenY - rect.top   - S.canvas.ty) / S.canvas.scale,
  };
}

/* ═══════════════════════════════════════
   编辑模式 — 撤销 / 重做
═══════════════════════════════════════ */
const MAX_EDIT_HISTORY = 50;
let editHistory = [];
let editHistoryIndex = -1;
const FIRST_EDIT_DRAG_GUIDE_KEY = 'feiyi_first_edit_drag_guide_done_v2';

function cloneComponentForHistory(c) {
  if (c.type === 'room') {
    return { ...c, acIds: c.acIds ? [...c.acIds] : [] };
  }
  return { ...c };
}
function cloneEditSnapshot() {
  return {
    components: S.components.map(cloneComponentForHistory),
    nextId: S.nextId,
    canvas: { ...S.canvas },
  };
}
function applyEditSnapshot(snap) {
  S.components = snap.components.map(cloneComponentForHistory);
  S.nextId = snap.nextId;
  S.canvas = { ...snap.canvas };
  S.selectedId = null;
  applyCanvasTransform();
  renderComponents();
}
function resetEditHistory() {
  editHistory = [];
  editHistoryIndex = -1;
}
function initEditHistory() {
  resetEditHistory();
  editHistory = [cloneEditSnapshot()];
  editHistoryIndex = 0;
  updateUndoRedoUI();
}
function recordEditHistory() {
  if (!S.isEditing) return;
  const snap = cloneEditSnapshot();
  editHistory = editHistory.slice(0, editHistoryIndex + 1);
  editHistory.push(snap);
  if (editHistory.length > MAX_EDIT_HISTORY) editHistory.shift();
  editHistoryIndex = editHistory.length - 1;
  updateUndoRedoUI();
}
function undoEdit() {
  if (!S.isEditing || editHistoryIndex <= 0) return;
  editHistoryIndex--;
  applyEditSnapshot(editHistory[editHistoryIndex]);
  updateUndoRedoUI();
}
function redoEdit() {
  if (!S.isEditing || editHistoryIndex >= editHistory.length - 1) return;
  editHistoryIndex++;
  applyEditSnapshot(editHistory[editHistoryIndex]);
  updateUndoRedoUI();
}
function updateUndoRedoUI() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (!undoBtn || !redoBtn) return;
  undoBtn.disabled = editHistoryIndex <= 0;
  redoBtn.disabled = editHistoryIndex >= editHistory.length - 1;
}

function hideEditDragGuide() {
  const workspace = document.getElementById('canvasWorkspace');
  if (workspace) workspace.classList.remove('first-drag-guide-active');
  const bubble = document.getElementById('editDragGuideBubble');
  if (bubble) bubble.remove();
}

function showFirstEditDragGuideOnce() {
  if (localStorage.getItem(FIRST_EDIT_DRAG_GUIDE_KEY)) return;
  const building = document.getElementById('buildingPanel');
  const workspace = document.getElementById('canvasWorkspace');
  if (!building || !workspace) return;
  workspace.classList.add('first-drag-guide-active');
  const bubble = document.createElement('div');
  bubble.id = 'editDragGuideBubble';
  bubble.className = 'edit-drag-guide-bubble';
  bubble.innerHTML = `
    <span class="guide-hand-icon" aria-hidden="true">👈</span>
    <span class="edit-drag-guide-tip-inline">按住左侧房间，拖到右侧画布</span>
  `;
  const rect = building.getBoundingClientRect();
  bubble.style.left = (rect.right + 14) + 'px';
  bubble.style.top = (rect.top + 130) + 'px';
  document.body.appendChild(bubble);
}

function completeFirstEditDragGuide() {
  localStorage.setItem(FIRST_EDIT_DRAG_GUIDE_KEY, '1');
  hideEditDragGuide();
}

/* ═══════════════════════════════════════
   编辑模式
═══════════════════════════════════════ */
function enterEditMode() {
  // 进入编辑前保存快照，用于「不保存退出」时恢复
  S._editSnapshot = {
    components: S.components.map(c => cloneComponentForHistory(c)),
    nextId: S.nextId,
    canvas: { ...S.canvas },
  };
  S.components.forEach(c => {
    if (c.type === 'ac') c.checked = false;
  });
  document.querySelectorAll('#buildingTree .bt-node.lv3[data-room-id] .bt-cb').forEach(cb => {
    cb.checked = false;
  });
  document.querySelectorAll('#buildingTree .bt-cb').forEach(cb => { cb.disabled = true; });
  S.isEditing = true;
  const cp = document.getElementById('compPanel');
  if (cp) cp.style.display = 'flex';
  document.getElementById('editModeBtn').style.display = 'none';
  document.getElementById('exitEditBtn').style.display = 'flex';
  document.getElementById('saveBtn').style.display     = 'flex';
  const ur = document.getElementById('undoRedoGroup');
  if (ur) ur.style.display = 'flex';
  const pill = document.getElementById('modePill');
  pill.querySelector('.mode-dot').className = 'mode-dot edit-mode';
  document.getElementById('modeText').textContent = '编辑模式';
  document.getElementById('canvasOuter').style.cursor = '';
  document.getElementById('buildingPanel').classList.add('edit-mode');
  initBuildingTreeDrag();
  showFirstEditDragGuideOnce();
  renderComponents();
  initEditHistory();
}

function exitEditMode(discard = true) {
  // discard=true：不保存，恢复快照；discard=false：保存后调用，不恢复
  if (discard && S._editSnapshot) {
    S.components = S._editSnapshot.components;
    S.nextId     = S._editSnapshot.nextId;
    S.canvas     = S._editSnapshot.canvas;
  }
  S._editSnapshot = null;
  hideEditDragGuide();
  S.isEditing = false;
  deselectAll();
  const cp2 = document.getElementById('compPanel');
  if (cp2) cp2.style.display = 'none';
  document.getElementById('editModeBtn').style.display = 'flex';
  document.getElementById('exitEditBtn').style.display = 'none';
  document.getElementById('saveBtn').style.display     = 'none';
  const ur = document.getElementById('undoRedoGroup');
  if (ur) ur.style.display = 'none';
  resetEditHistory();
  const pill = document.getElementById('modePill');
  pill.querySelector('.mode-dot').className = 'mode-dot view-mode';
  document.getElementById('modeText').textContent = '查看模式';
  document.getElementById('canvasOuter').style.cursor = '';
  document.getElementById('buildingPanel').classList.remove('edit-mode');
  document.querySelectorAll('#buildingTree .bt-cb').forEach(cb => { cb.disabled = false; });
  removeBuildingTreeDrag();
  applyCanvasTransform();
  renderComponents();
}

/* ═══════════════════════════════════════
   从建筑树拖入房间：创建房间 + 绑定空调
═══════════════════════════════════════ */
function createRoomWithACs(cx, cy, roomId) {
  const data = ROOM_DATA[roomId];
  if (!data) return null;
  const n = data.acs.length;

  // 根据空调数量估算房间尺寸
  const pad = 16, colGap = 8, rowGap = 26;
  const cols = Math.min(4, Math.max(1, n));
  const rows = Math.ceil(n / cols);
  const roomW = Math.max(200, pad * 2 + cols * (AC_SIZE + colGap) - colGap);
  const roomH = Math.max(140, 30 + pad + rows * (AC_SIZE + rowGap) - rowGap + pad);

  const id = 'room-' + (S.nextId++);
  S.components.push({
    id, type: 'room',
    x: cx - roomW / 2, y: cy - roomH / 2,
    w: roomW, h: roomH,
    name: data.name, namePos: 'top-left',
    acIds: [],
    treeRoomId: roomId,
  });

  data.acs.forEach(acDef => {
    const acId = 'ac-' + (S.nextId++);
    const state = AC_STATES[Math.floor(Math.random() * AC_STATES.length)];
    S.components.push({
      id: acId, type: 'ac',
      x: 0, y: 0,
      state,
      roomId: id,
      sourceName: acDef.name,
      checked: false,
    });
    const room = getComp(id);
    if (room) room.acIds.push(acId);
  });

  autoAlignACsInRoom(id);
  return id;
}

/* ═══════════════════════════════════════
   组件 CRUD
═══════════════════════════════════════ */
function createRoom(x, y) {
  const id = 'room-' + (S.nextId++);
  S.components.push({
    id, type: 'room',
    x: x - 100, y: y - 70,
    w: 200, h: 140,
    name: '', namePos: 'top-left',
  });
  return id;
}

function createAC(x, y, sourceName) {
  const id = 'ac-' + (S.nextId++);
  const state = AC_STATES[Math.floor(Math.random() * AC_STATES.length)];
  S.components.push({
    id, type: 'ac',
    x: x - AC_SIZE / 2,
    y: y - AC_SIZE / 2,
    state,
    roomId: null,
    sourceName: sourceName || '',
    checked: false,
  });
  return id;
}

function getComp(id) { return S.components.find(c => c.id === id) || null; }

/** 画布空调悬浮卡片用的演示状态（与列表卡片风格一致） */
function getACHoverStatus(ac) {
  const room = ac.roomId ? getComp(ac.roomId) : null;
  let roomTitle = room?.name || '';
  if (!roomTitle && ac.sourceName) {
    roomTitle = ac.sourceName.replace(/-\d+[^-]*$/, '').trim() || ac.sourceName;
  }
  if (!roomTitle) roomTitle = '空调';
  const modeMap = {
    cold: '制冷', warm: '制热', fan: '送风', dry: '除湿',
    off: '关机', normal: '自动', error: '故障',
  };
  const mode = modeMap[ac.state] || '制冷';
  let h = 0;
  for (let i = 0; i < String(ac.id).length; i++) h = (h + ac.id.charCodeAt(i)) | 0;
  const setTemp = 18 + (Math.abs(h) % 8);
  const roomTemp = 20 + (Math.abs(h >> 3) % 4);
  const powerOn = ac.state !== 'off' && ac.state !== 'error';
  return {
    roomTitle, setTemp, roomTemp, mode,
    fan: '低风',
    powerLabel: powerOn ? '开机' : '关机',
  };
}

function deleteComponent(id) {
  const comp = getComp(id);
  if (!comp) return;
  if (S.isEditing && comp.type === 'ac' && comp.roomId) {
    showToast('编辑模式下，房间内空调不支持删除');
    return;
  }
  const confirmMsg = comp.type === 'room'
    ? '确定删除该房间及房内所有空调吗？'
    : '确定删除该空调吗？';
  if (!confirm(confirmMsg)) return;
  if (comp.type === 'room') {
    const removeIds = new Set([id]);
    S.components.forEach(c => {
      if (c.type === 'ac' && c.roomId === id) removeIds.add(c.id);
    });
    if (S.selectedId && removeIds.has(S.selectedId)) S.selectedId = null;
    S.components = S.components.filter(c => !removeIds.has(c.id));
    renderComponents();
    recordEditHistory();
    showToast('已删除房间及房内空调');
    return;
  }
  if (comp.type === 'ac' && comp.roomId) {
    const room = getComp(comp.roomId);
    if (room && room.acIds) {
      room.acIds = room.acIds.filter(a => a !== id);
    }
  }
  S.components = S.components.filter(c => c.id !== id);
  if (S.selectedId === id) S.selectedId = null;
  renderComponents();
  recordEditHistory();
  showToast('已删除');
}

function deselectAll() {
  S.selectedId = null;
  renderComponents();
}

function selectComponent(id) {
  const oldId = S.selectedId;
  S.selectedId = id;
  // 就地更新 selected 类，不重建 DOM（避免破坏双击计时）
  if (oldId) {
    const oldEl = document.querySelector(`#canvasInner [data-id="${oldId}"]`);
    if (oldEl) oldEl.classList.remove('selected');
  }
  if (id) {
    const el = document.querySelector(`#canvasInner [data-id="${id}"]`);
    if (el) el.classList.add('selected');
  }
}

/* ═══════════════════════════════════════
   房间–空调 关联 + 自动对齐
═══════════════════════════════════════ */
function checkACRoomAssoc(acId) {
  const ac = getComp(acId);
  if (!ac) return;
  const acCx = ac.x + AC_SIZE / 2;
  const acCy = ac.y + AC_SIZE / 2;

  let newRoomId = null;
  // 找最小包含该 AC 的房间（允许层叠时选最小面积）
  let minArea = Infinity;
  S.components.forEach(c => {
    if (c.type !== 'room') return;
    if (acCx >= c.x && acCx <= c.x + c.w && acCy >= c.y && acCy <= c.y + c.h) {
      const area = c.w * c.h;
      if (area < minArea) { minArea = area; newRoomId = c.id; }
    }
  });

  const oldRoomId = ac.roomId;
  if (oldRoomId === newRoomId) return;

  // 解除旧关联
  if (oldRoomId) {
    const oldRoom = getComp(oldRoomId);
    if (oldRoom && oldRoom.acIds) oldRoom.acIds = oldRoom.acIds.filter(i => i !== acId);
  }
  ac.roomId = newRoomId;

  // 建立新关联
  if (newRoomId) {
    const newRoom = getComp(newRoomId);
    if (newRoom) {
      if (!newRoom.acIds) newRoom.acIds = [];
      if (!newRoom.acIds.includes(acId)) newRoom.acIds.push(acId);
      autoAlignACsInRoom(newRoomId);
    }
  }
}

function autoAlignACsInRoom(roomId) {
  const room = getComp(roomId);
  if (!room) return;
  const acs = S.components.filter(c => c.type === 'ac' && c.roomId === roomId);
  const n = acs.length;
  if (n === 0) return;

  const pad    = 16;
  const colGap = 8;   // 水平间距
  const rowGap = 26;  // 垂直间距（需容纳来源名称标签约17px + 余量）
  const availW = room.w - pad * 2;
  const availH = room.h - pad * 2;

  const cols = Math.max(1, Math.floor((availW + colGap) / (AC_SIZE + colGap)));
  const effectiveCols = Math.min(cols, n);
  const rows = Math.ceil(n / effectiveCols);

  const totalW = effectiveCols * AC_SIZE + (effectiveCols - 1) * colGap;
  const totalH = rows * AC_SIZE + (rows - 1) * rowGap;

  const startX = room.x + pad + (availW - totalW) / 2;
  const startY = room.y + pad + (availH - totalH) / 2;

  acs.forEach((ac, i) => {
    const col = i % effectiveCols;
    const row = Math.floor(i / effectiveCols);
    ac.x = startX + col * (AC_SIZE + colGap);
    ac.y = startY + row * (AC_SIZE + rowGap);
  });
  renderComponents();
}

/* ═══════════════════════════════════════
   渲染组件到画布
═══════════════════════════════════════ */
function renderComponents() {
  const inner = document.getElementById('canvasInner');
  // 移除所有旧组件 DOM（保留 img.canvas-bg）
  inner.querySelectorAll('.room-comp, .ac-comp').forEach(el => el.remove());

  const editMode = S.isEditing;

  // 先渲染房间（z-index 低），再渲染空调
  S.components.filter(c => c.type === 'room').forEach(room => renderRoom(room, editMode));
  S.components.filter(c => c.type === 'ac').forEach(ac => renderAC(ac, editMode));
}

function renderRoom(room, editMode) {
  const el = document.createElement('div');
  el.className = 'room-comp' + (editMode ? ' edit-mode' : '') + (S.selectedId === room.id ? ' selected' : '');
  el.dataset.id   = room.id;
  el.dataset.type = 'room';
  el.dataset.hasName = room.name ? 'true' : 'false';
  el.style.cssText = `left:${room.x}px;top:${room.y}px;width:${room.w}px;height:${room.h}px;`;

  const posClass = room.namePos === 'top-left'    ? 'tl'
                 : room.namePos === 'top-right'   ? 'tr'
                 : room.namePos === 'bottom-left' ? 'bl' : 'br';
  const labelBlock = editMode
    ? `<div class="room-label-wrap ${posClass}">
         <span class="room-label-text">${room.name ? escapeHTML(room.name) : '未命名'}</span>
         <button type="button" class="room-delete-btn" title="删除房间">删除</button>
       </div>`
    : `<div class="room-label ${posClass} ${room.name ? '' : 'no-name'}">${escapeHTML(room.name)}</div>`;
  el.innerHTML = `
    <div class="room-body"></div>
    ${labelBlock}
    <div class="room-dblclick-hint">点击房间名编辑</div>
    ${editMode ? `
      <div class="resize-handle nw" data-handle="nw"></div>
      <div class="resize-handle n"  data-handle="n"></div>
      <div class="resize-handle ne" data-handle="ne"></div>
      <div class="resize-handle e"  data-handle="e"></div>
      <div class="resize-handle se" data-handle="se"></div>
      <div class="resize-handle s"  data-handle="s"></div>
      <div class="resize-handle sw" data-handle="sw"></div>
      <div class="resize-handle w"  data-handle="w"></div>
    ` : ''}`;

  if (editMode) {
    el.addEventListener('click', e => {
      if (e.target.closest('.room-delete-btn')) {
        e.preventDefault();
        e.stopPropagation();
        deleteComponent(room.id);
        return;
      }
      if (e.target.closest('.room-label-wrap')) {
        e.preventDefault();
        e.stopPropagation();
        selectComponent(room.id);
        openRoomModal(room.id);
      }
    });
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      selectComponent(room.id);
      showCanvasContextMenu(e.clientX, e.clientY, room.id, 'room');
    });
    el.addEventListener('mousedown', e => {
      if (e.target.closest('.room-delete-btn')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // 房间名区域：不进入拖拽，由 click 打开编辑房间弹窗
      if (e.target.closest('.room-label-wrap')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.target.classList.contains('resize-handle')) {
        startResize(e, room.id, e.target.dataset.handle);
      } else {
        startComponentDrag(e, room.id);
      }
    });
  }

  document.getElementById('canvasInner').appendChild(el);
}

function renderAC(ac, editMode) {
  const el = document.createElement('div');
  const isChecked = !!ac.checked;
  const st = getACHoverStatus(ac);
  el.className = 'ac-comp' + (editMode ? ' edit-mode' : '') + (S.selectedId === ac.id ? ' selected' : '') + (isChecked ? ' ac-checked' : '');
  el.dataset.id   = ac.id;
  el.dataset.type = 'ac';
  el.style.cssText = `left:${ac.x}px;top:${ac.y}px;`;
  el.innerHTML = `
    <div class="ac-hover-card" role="tooltip">
      <div class="ac-hover-card-inner">
        <div class="ahc-head">
          <span class="ahc-title">${escapeHTML(st.roomTitle)}</span>
          <span class="ahc-head-icons" aria-hidden="true">📶 🔔</span>
          <span class="ahc-tag">物业</span>
        </div>
        <div class="ahc-mid">
          <div>
            <div class="ahc-temp-big">${st.setTemp}<span class="ahc-deg">℃</span></div>
            <div class="ahc-temp-sub">室温${st.roomTemp}℃</div>
          </div>
          <div class="ahc-mode-icon" aria-hidden="true">
            <img src="${IMAGES_PATH}${ac.state}.png" alt="" width="40" height="40">
          </div>
        </div>
        <div class="ahc-foot">
          <span>${escapeHTML(st.mode)}</span>
          <span>${escapeHTML(st.fan)}</span>
          <span>${escapeHTML(st.powerLabel)}</span>
        </div>
      </div>
    </div>
    <div class="ac-comp-visual">
      <img src="${IMAGES_PATH}${ac.state}.png" alt="${ac.state}" width="${AC_SIZE}" height="${AC_SIZE}">
      <span class="ac-check-overlay" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="rgba(26,127,240,0.92)" stroke="#fff" stroke-width="1.5"/>
          <path d="M7 12l3 3 6-6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </div>
    <div class="ac-ring"></div>
    ${ac.sourceName ? `<div class="ac-source-name">${escapeHTML(ac.sourceName)}</div>` : ''}`;

  if (editMode) {
    el.addEventListener('mousedown', e => startComponentDrag(e, ac.id));
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      selectComponent(ac.id);
      showCanvasContextMenu(e.clientX, e.clientY, ac.id, 'ac');
    });
  } else {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const c = getComp(ac.id);
      if (!c || c.type !== 'ac') return;
      c.checked = !c.checked;
      renderComponents();
      recordEditHistory();
    });
  }

  document.getElementById('canvasInner').appendChild(el);
}

function escapeHTML(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══════════════════════════════════════
   从组件面板拖拽新建
═══════════════════════════════════════ */
function startPanelDrag(e, type) {
  if (!S.isEditing) return;
  e.preventDefault();
  const ghost = document.getElementById('dragGhost');
  ghost.className = 'drag-ghost ' + (type === 'room' ? 'room-ghost' : 'ac-ghost');
  if (type === 'ac') {
    ghost.innerHTML = `<img src="${IMAGES_PATH}cold.png" width="${AC_SIZE}" height="${AC_SIZE}">`;
  } else {
    ghost.innerHTML = '';
  }
  ghost.style.display = 'block';
  ghost.style.left = e.clientX + 'px';
  ghost.style.top  = e.clientY + 'px';
  S.drag = { type: 'from-panel', compType: type };
}

/* ═══════════════════════════════════════
   移动已有组件
═══════════════════════════════════════ */
function startComponentDrag(e, id) {
  if (!S.isEditing) return;
  e.preventDefault();
  e.stopPropagation();
  selectComponent(id);
  const comp = getComp(id);
  if (!comp) return;
  const startCanvas = screenToCanvas(e.clientX, e.clientY);
  S.drag = {
    type: 'on-canvas', id,
    offsetX: startCanvas.x - comp.x,
    offsetY: startCanvas.y - comp.y,
    hasMoved: false,         // 标记是否真实移动过
    startX: comp.x,
    startY: comp.y,
  };
  document.getElementById('canvasOuter').classList.add('panning');
}

/* ═══════════════════════════════════════
   拉伸房间
═══════════════════════════════════════ */
function startResize(e, id, handle) {
  e.preventDefault();
  e.stopPropagation();
  const comp = getComp(id);
  if (!comp) return;
  const startCanvas = screenToCanvas(e.clientX, e.clientY);
  S.resize = {
    id, handle,
    startX: startCanvas.x, startY: startCanvas.y,
    origX: comp.x, origY: comp.y, origW: comp.w, origH: comp.h,
  };
}

/* ═══════════════════════════════════════
   画布背景 mousedown（平移）
═══════════════════════════════════════ */
function onCanvasMouseDown(e) {
  // 如果点击的是组件，不触发平移（已在 startComponentDrag 处理）
  if (e.target.closest('.room-comp, .ac-comp')) return;
  e.preventDefault();
  if (S.isEditing) deselectAll();
  // 查看 / 编辑模式：空白处拖拽均可平移画布
  S.pan = { startX: e.clientX, startY: e.clientY, tx: S.canvas.tx, ty: S.canvas.ty };
  document.getElementById('canvasOuter').classList.add('panning');
}

/* ═══════════════════════════════════════
   全局 mousemove
═══════════════════════════════════════ */
function onGlobalMouseMove(e) {
  // 从面板或建筑树拖入
  if (S.drag && (S.drag.type === 'from-panel' || S.drag.type === 'from-building')) {
    const ghost = document.getElementById('dragGhost');
    ghost.style.left = e.clientX + 'px';
    ghost.style.top  = e.clientY + 'px';
    return;
  }
  // 移动已有组件
  if (S.drag && S.drag.type === 'on-canvas') {
    const cp = screenToCanvas(e.clientX, e.clientY);
    const comp = getComp(S.drag.id);
    if (!comp) return;
    const newX = cp.x - S.drag.offsetX;
    const newY = cp.y - S.drag.offsetY;
    // 移动超过 3px 才标记为真实移动
    if (!S.drag.hasMoved && (Math.abs(newX - S.drag.startX) > 3 || Math.abs(newY - S.drag.startY) > 3)) {
      S.drag.hasMoved = true;
    }
    const oldX = comp.x;
    const oldY = comp.y;
    const dx = newX - oldX;
    const dy = newY - oldY;
    comp.x = newX;
    comp.y = newY;
    // 拖动房间时，房内空调同步平移
    if (comp.type === 'room' && comp.acIds && comp.acIds.length) {
      comp.acIds.forEach(acId => {
        const ac = getComp(acId);
        if (ac) { ac.x += dx; ac.y += dy; }
      });
    }
    renderComponents();
    return;
  }
  // 缩放房间
  if (S.resize) {
    const r = S.resize;
    const cp = screenToCanvas(e.clientX, e.clientY);
    const dx = cp.x - r.startX;
    const dy = cp.y - r.startY;
    const comp = getComp(r.id);
    if (!comp) return;
    let { origX: x, origY: y, origW: w, origH: h } = r;
    const h_ = r.handle;
    if (h_.includes('e')) { w = Math.max(MIN_ROOM_W, w + dx); }
    if (h_.includes('s')) { h = Math.max(MIN_ROOM_H, h + dy); }
    if (h_.includes('w')) { const nw = Math.max(MIN_ROOM_W, w - dx); x += w - nw; w = nw; }
    if (h_.includes('n')) { const nh = Math.max(MIN_ROOM_H, h - dy); y += h - nh; h = nh; }
    comp.x = x; comp.y = y; comp.w = w; comp.h = h;
    renderComponents();
    return;
  }
  // 平移画布
  if (S.pan) {
    S.canvas.tx = S.pan.tx + (e.clientX - S.pan.startX);
    S.canvas.ty = S.pan.ty + (e.clientY - S.pan.startY);
    applyCanvasTransform();
    return;
  }
}

/* ═══════════════════════════════════════
   全局 mouseup
═══════════════════════════════════════ */
function onGlobalMouseUp(e) {
  document.getElementById('canvasOuter').classList.remove('panning');

  // 从面板（房间）或建筑树（空调）放入画布
  if (S.drag && (S.drag.type === 'from-panel' || S.drag.type === 'from-building')) {
    const ghost = document.getElementById('dragGhost');
    ghost.style.display = 'none';

    const outer = document.getElementById('canvasOuter');
    const rect  = outer.getBoundingClientRect();
    const isOverCanvas = e.clientX >= rect.left && e.clientX <= rect.right
                      && e.clientY >= rect.top  && e.clientY <= rect.bottom;
    if (isOverCanvas && S.phase === 'canvas') {
      const cp = screenToCanvas(e.clientX, e.clientY);
      let newId;
      if (S.drag.type === 'from-building') {
        newId = createRoomWithACs(cp.x, cp.y, S.drag.roomId);
      } else if (S.drag.compType === 'room') {
        newId = createRoom(cp.x, cp.y);
      } else {
        newId = createAC(cp.x, cp.y);
        checkACRoomAssoc(newId);
      }
      if (newId) selectComponent(newId);
      renderComponents();
      if (newId) {
        recordEditHistory();
        if (S.drag.type === 'from-building') completeFirstEditDragGuide();
      }
    }
    // 恢复建筑树节点样式
    if (S.drag.sourceEl) S.drag.sourceEl.classList.remove('drag-active');
    S.drag = null;
    return;
  }

  // 移动组件结束 → 仅在真实移动时更新关联并重渲染
  if (S.drag && S.drag.type === 'on-canvas') {
    const dragged = S.drag;
    S.drag = null;
    if (dragged.hasMoved) {
      const comp = getComp(dragged.id);
      if (comp && comp.type === 'ac') checkACRoomAssoc(dragged.id);
      if (comp && comp.type === 'room' && comp.acIds && comp.acIds.length > 0) syncRoomACs(dragged.id);
      renderComponents();
      recordEditHistory();
    }
    // 未移动（单击）：不重渲染，保留 DOM，双击计时得以工作
    return;
  }

  // 缩放结束
  if (S.resize) {
    const id = S.resize.id;
    S.resize = null;
    // 重算房间内空调的关联和对齐
    const room = getComp(id);
    if (room && room.acIds && room.acIds.length > 0) autoAlignACsInRoom(id);
    renderComponents();
    recordEditHistory();
    return;
  }

  S.pan = null;
}

/* 房间移动时同步内部空调 */
function syncRoomACs(roomId) {
  const room = getComp(roomId);
  if (!room || !room.acIds) return;
  autoAlignACsInRoom(roomId);
}

/* ═══════════════════════════════════════
   建筑树拖拽：进入编辑模式时注入手柄
═══════════════════════════════════════ */
function initBuildingTreeDrag() {
  const startBuildingRoomDrag = (e, node, roomId, name) => {
    if (!S.isEditing || S.phase !== 'canvas') return;
    if (e.target.closest('.bt-cb')) return;
    e.preventDefault();
    e.stopPropagation();
    node.classList.add('drag-active');

    const ghost = document.getElementById('dragGhost');
    ghost.className = 'drag-ghost room-ghost';
    ghost.innerHTML = `<span style="font-size:11px;color:#fff;padding:2px 6px">${name}</span>`;
    ghost.style.display = 'block';
    ghost.style.left = e.clientX + 'px';
    ghost.style.top  = e.clientY + 'px';

    S.drag = { type: 'from-building', roomId, sourceEl: node };
  };

  const nodes = document.querySelectorAll('.bt-node.lv3[data-room-id]');
  nodes.forEach(node => {
    if (node.querySelector('.bt-drag-handle')) return;
    const label  = node.querySelector('.bt-label');
    const name   = label ? label.textContent.trim() : '房间';
    const roomId = node.dataset.roomId;

    const handle = document.createElement('span');
    handle.className = 'bt-drag-handle';
    handle.innerHTML = `<svg width="9" height="9" viewBox="0 0 24 24"><path d="M5 9l7-7 7 7M5 15l7 7 7-7" stroke="currentColor" stroke-width="2" fill="none"/></svg> 拖入`;
    handle.title = `拖拽「${name}」到画布`;
    node.appendChild(handle);
    node.style.cursor = 'grab';

    handle.addEventListener('mousedown', e => {
      startBuildingRoomDrag(e, node, roomId, name);
    });
    node.addEventListener('mousedown', e => {
      if (e.target.closest('.bt-drag-handle')) return;
      startBuildingRoomDrag(e, node, roomId, name);
    });
  });
}

function removeBuildingTreeDrag() {
  document.querySelectorAll('.bt-node.lv3[data-room-id]').forEach(n => { n.style.cursor = ''; });
  document.querySelectorAll('.bt-drag-handle').forEach(h => h.remove());
  document.querySelectorAll('.bt-node.drag-active').forEach(n => n.classList.remove('drag-active'));
}

/* ═══════════════════════════════════════
   键盘事件
═══════════════════════════════════════ */
function onKeyDown(e) {
  if (!S.isEditing) return;
  // 忽略输入框内（含房间名弹窗）
  if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (e.shiftKey) redoEdit();
    else undoEdit();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    redoEdit();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.selectedId) {
    deleteComponent(S.selectedId);
  }
  if (e.key === 'Escape') {
    hideCanvasContextMenu();
    deselectAll();
  }
}

/* ═══════════════════════════════════════
   房间名编辑弹窗
═══════════════════════════════════════ */
function openRoomModal(roomId) {
  S.editingRoomId = roomId;
  const room = getComp(roomId);
  if (!room) return;
  document.getElementById('roomNameInput').value = room.name || '';
  // 选中对应位置按钮
  document.querySelectorAll('.pos-btn').forEach(btn => {
    const active = btn.dataset.pos === (room.namePos || 'top-left');
    btn.classList.toggle('active', active);
    if (active) S.selectedPosBtn = btn;
  });
  document.getElementById('roomModal').style.display = 'flex';
  setTimeout(() => document.getElementById('roomNameInput').focus(), 50);
}

function closeRoomModal() {
  document.getElementById('roomModal').style.display = 'none';
  S.editingRoomId = null;
}

function selectPos(btn) {
  document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.selectedPosBtn = btn;
}

function confirmRoomEdit() {
  if (!S.editingRoomId) return;
  const room = getComp(S.editingRoomId);
  if (!room) return;
  room.name = document.getElementById('roomNameInput').value.trim();
  const activeBtn = document.querySelector('.pos-btn.active');
  if (activeBtn) room.namePos = activeBtn.dataset.pos;
  document.getElementById('roomModal').style.display = 'none';
  S.editingRoomId = null;
  renderComponents();
  recordEditHistory();
  showToast('房间名已更新');
}

/* ═══════════════════════════════════════
   保存 / 恢复
═══════════════════════════════════════ */
async function persistLayoutToStorage() {
  ensureCurrentZoneId();
  saveCurrentZone();
  const data = {
    version: 2,
    currentZoneId: S.currentZoneId,
    zones: S.zones,
    projectAiRenderCount: S.projectAiRenderCount || 0,
  };
  const json = JSON.stringify(data);
  try {
    await idbSet(STORAGE_KEY, json);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  } catch (err) {
    console.error(err);
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch (err2) {
      console.error(err2);
      throw err2;
    }
  }
}

async function saveLayout() {
  try {
    await persistLayoutToStorage();
  } catch (err) {
    showToast('保存失败，请稍后重试');
    return;
  }
  showToast('✅ 布局已保存');
  exitEditMode(false); // 保存后退出，不恢复快照
  updateZoneUI();
}

/** 按需求清除 8 层（8F，zone z1）已持久化的底图 / AI 历史 / 画布组件；仅执行一次（localStorage 标记） */
async function purgeStored8FImagesOnce() {
  const flagKey = 'feiyi_stored_z1_8f_cleared_v2';
  if (localStorage.getItem(flagKey)) return;
  const prev = S.zones.z1;
  const hadMedia = !!(prev && (
    prev.selectedImageUrl || prev.originalImageUrl
    || (prev.renderHistory && prev.renderHistory.length)
    || (prev.components && prev.components.length)
  ));
  if (prev) S.zones.z1 = defaultZoneState();
  localStorage.setItem(flagKey, '1');
  if (!prev) return;
  const data = {
    version: 2,
    currentZoneId: S.currentZoneId,
    zones: S.zones,
    projectAiRenderCount: S.projectAiRenderCount || 0,
  };
  let json;
  try {
    json = JSON.stringify(data);
  } catch (e) {
    console.warn('清除 8F 后序列化失败', e);
    return;
  }
  try {
    await idbSet(STORAGE_KEY, json);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  } catch (e) {
    console.warn('清除 8F 写回 IndexedDB 失败', e);
    try { localStorage.setItem(STORAGE_KEY, json); } catch (_) {}
  }
  if (hadMedia) showToast('已清除 8 层（8F）已保存的底图与布局');
}

async function loadFromStorage() {
  const layoutMode = localStorage.getItem(STORAGE_KEY + '_layout') || 'normal';
  S.layout = layoutMode;

  let raw = null;
  try {
    raw = await idbGet(STORAGE_KEY);
  } catch (e) {
    console.warn('IndexedDB 读取失败', e);
  }
  if (!raw) raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.version === 2 && data.zones) {
      // 多区域格式
      S.zones = data.zones;
      if (data.currentZoneId) S.currentZoneId = data.currentZoneId;
      S.projectAiRenderCount = data.projectAiRenderCount ?? 0;
    } else if (data.version === 1) {
      // 旧单区域格式 → 迁移到第一个区域
      // 此时 initZones() 已执行，拿第一个区域 ID
      const firstId = document.querySelector('#buildingTree .bt-node[data-zone-id]')?.dataset.zoneId;
      if (firstId) {
        S.zones[firstId] = {
          phase: data.selectedImageUrl ? 'canvas' : 'empty',
          originalImageUrl: data.selectedImageUrl || null,
          currentPreviewUrl: data.selectedImageUrl || null,
          selectedImageUrl: data.selectedImageUrl || null,
          renderHistory: data.renderHistory || [],
          isEditing: false,
          canvas: data.canvas || { tx:0, ty:0, scale:1 },
          components: data.components || [],
          selectedId: null,
          nextId: data.nextId || 1,
          aiRenderCount: 0,
        };
        S.currentZoneId = firstId;
        S.projectAiRenderCount = 0;
      }
    }
  } catch (err) {
    console.warn('加载布局数据失败', err);
  }
}

/* ═══════════════════════════════════════
   Toast 提示
═══════════════════════════════════════ */
let _toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

/* 画布右键菜单（删除） */
let _canvasCtxMenuEl = null;
function hideCanvasContextMenu() {
  if (_canvasCtxMenuEl) {
    _canvasCtxMenuEl.style.display = 'none';
    _canvasCtxMenuEl.dataset.compId = '';
    _canvasCtxMenuEl.dataset.compType = '';
  }
}
function showCanvasContextMenu(x, y, compId, compType) {
  if (!_canvasCtxMenuEl) {
    _canvasCtxMenuEl = document.createElement('div');
    _canvasCtxMenuEl.id = 'canvasContextMenu';
    _canvasCtxMenuEl.className = 'canvas-ctx-menu';
    document.body.appendChild(_canvasCtxMenuEl);
  }
  _canvasCtxMenuEl.dataset.compId = compId;
  _canvasCtxMenuEl.dataset.compType = compType || '';
  let html = '<button type="button" class="ctx-del">删除</button>';
  if (compType === 'room') {
    html = '<button type="button" class="ctx-align">自动布局</button>' + html;
  }
  _canvasCtxMenuEl.innerHTML = html;
  _canvasCtxMenuEl.querySelector('.ctx-del').addEventListener('click', () => {
    const id = _canvasCtxMenuEl.dataset.compId;
    hideCanvasContextMenu();
    if (id) deleteComponent(id);
  });
  const alignBtn = _canvasCtxMenuEl.querySelector('.ctx-align');
  if (alignBtn) {
    alignBtn.addEventListener('click', () => {
      const id = _canvasCtxMenuEl.dataset.compId;
      hideCanvasContextMenu();
      if (!id) return;
      const n = S.components.filter(c => c.type === 'ac' && c.roomId === id).length;
      if (n === 0) {
        showToast('房间内暂无空调');
        return;
      }
      autoAlignACsInRoom(id);
      recordEditHistory();
      showToast('已自动对齐空调');
    });
  }
  _canvasCtxMenuEl.style.display = 'block';
  _canvasCtxMenuEl.style.position = 'fixed';
  _canvasCtxMenuEl.style.zIndex = '10000';
  _canvasCtxMenuEl.style.left = x + 'px';
  _canvasCtxMenuEl.style.top = y + 'px';
  requestAnimationFrame(() => {
    const r = _canvasCtxMenuEl.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
    if (top + r.height > window.innerHeight - 8) top = window.innerHeight - r.height - 8;
    _canvasCtxMenuEl.style.left = Math.max(8, left) + 'px';
    _canvasCtxMenuEl.style.top = Math.max(8, top) + 'px';
  });
}

/* ═══════════════════════════════════════
   PackyAPI 中转 → Gemini generateContent
   端点：见 PACKEY_ENDPOINT（与 Google REST 一致，parts 使用 camelCase inlineData）
═══════════════════════════════════════ */
const PACKEY_API_KEY = 'sk-E4IWR67BBxxUu3oy2RMGuVNb0Tvz0fmZwJtgQqjCb8D68MKf';
const PACKEY_ENDPOINT = 'https://www.packyapi.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent';
/** 图片生成可能超过 1 分钟，超时后中止并提示，避免一直转圈 */
const PACKEY_FETCH_TIMEOUT_MS = 240000;
const PACKEY_PROMPT   = `将这张建筑平面图转换为3D白模渲染风格图片。

【最高优先级——必须严格执行】
图中所有文字必须100%完全删除，包括但不限于：房间名称、尺寸数字、标注文字、图例说明、比例尺、箭头符号、任何中英文字符。输出图片中绝对不能出现任何文字、数字或符号，违反此规则视为失败。

【线框消除要求】
建筑原有的所有线框（墙线、窗框线、门框线、阳台线等）必须彻底清除。输出图片中不能残留任何建筑轮廓线、边缘线、分隔线、边框线等线条。墙体、地板、家具等所有元素必须呈现为纯色无轮廓的实体表面，如同没有线框的素模或光雕塑。

【渲染风格要求】
将墙体、地板、家具全部渲染为纯白色3D模型风格，保留完整的空间结构和家具形态，家具在地面投下柔和阴影，呈现专业建筑白模渲染的立体空间感。所有表面必须是纯色无纹理无线框的。`;

function extractImageFromGeminiResponse(data) {
  const pf = data?.promptFeedback;
  if (pf?.blockReason) {
    return { error: `请求被拦截（promptFeedback.blockReason: ${pf.blockReason}）` };
  }
  const cands = data?.candidates;
  if (!cands || cands.length === 0) {
    const detail = pf ? JSON.stringify(pf) : JSON.stringify(data).slice(0, 400);
    return { error: `无候选结果（candidates 为空）。${detail}` };
  }
  const c0 = cands[0];
  if (c0.finishReason && c0.finishReason !== 'STOP' && c0.finishReason !== 'FINISH_REASON_STOP') {
    const fr = c0.finishReason;
    if (fr === 'SAFETY' || fr === 'IMAGE_SAFETY' || fr === 'PROHIBITED_CONTENT') {
      return { error: `生成结束原因：${fr}（内容安全策略）` };
    }
  }
  const parts = c0?.content?.parts ?? [];
  for (const p of parts) {
    const raw = p.inline_data || p.inlineData;
    if (raw?.data) {
      const outMime = raw.mime_type || raw.mimeType || 'image/png';
      return { dataUrl: `data:${outMime};base64,${raw.data}` };
    }
  }
  const textFallback = parts.map(p => p.text).filter(Boolean).join(' ') || '';
  return {
    error: '响应中未找到图片 part（inlineData）。' + (textFallback ? `附带文本：${textFallback.slice(0, 200)}` : `原始片段：${JSON.stringify(data).slice(0, 500)}`),
  };
}

async function callGeminiAPI(imageUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PACKEY_FETCH_TIMEOUT_MS);

  try {
    // 1. 读取图片并转 base64
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error('无法读取本地图片');
    const blob = await imgResp.blob();
    const mimeType = (blob.type && blob.type.startsWith('image/')) ? blob.type : 'image/jpeg';
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // 2. 请求体：优先 Google 官方 REST 的 camelCase；若 400 再试 snake_case（部分中转兼容）
    const bodyCamel = {
      contents: [{
        parts: [
          { text: PACKEY_PROMPT },
          { inlineData: { mimeType, data: base64 } },
        ],
      }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    };
    const bodySnake = {
      contents: [{
        parts: [
          { text: PACKEY_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    };

    const fetchOpts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PACKEY_API_KEY}`,
      },
      signal: controller.signal,
    };

    console.log('[PackeyAPI] 发送请求…', PACKEY_ENDPOINT);
    let resp = await fetch(PACKEY_ENDPOINT, { ...fetchOpts, body: JSON.stringify(bodyCamel) });
    let rawText = await resp.text();

    if (!resp.ok && resp.status === 400) {
      console.warn('[PackeyAPI] camelCase 被拒，改用 inline_data 重试');
      resp = await fetch(PACKEY_ENDPOINT, { ...fetchOpts, body: JSON.stringify(bodySnake) });
      rawText = await resp.text();
    }
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      throw new Error(`PackeyAPI 返回非 JSON (${resp.status}): ${rawText.slice(0, 300)}`);
    }

    if (!resp.ok) {
      const msg = data?.error?.message || data?.error || rawText.slice(0, 500);
      throw new Error(`PackeyAPI 请求失败 (${resp.status}): ${msg}`);
    }

    console.log('[PackeyAPI] 响应 keys:', data ? Object.keys(data) : []);

    const extracted = extractImageFromGeminiResponse(data);
    if (extracted.error) {
      console.error('[PackeyAPI] 解析失败', data);
      throw new Error(extracted.error);
    }
    return extracted.dataUrl;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`请求超时（>${Math.round(PACKEY_FETCH_TIMEOUT_MS / 1000)}s），请检查网络或稍后再试`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
