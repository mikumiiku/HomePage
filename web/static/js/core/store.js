/* ============================================================
 * App.store —— 用户侧存档的统一入口（localStorage）
 *
 * 设计约定（详见项目根目录 DATA_MODEL.md）：
 * 1. 每份存档是一个「槽位」(slot)，键名：homepage:e<信封版本>:<gameId>:<slotName>
 * 2. 槽位内容是「信封」(envelope)：{ v: 结构版本, t: 更新时间, d: 数据 }
 * 3. 数据 d 的顶层由稳定分区组成：
 *      best     —— 纪录（最高分/最快时间等，只增不减）
 *      stats    —— 累计统计（局数、总步数等）
 *      settings —— 玩家偏好（难度选择、开关等）
 *      session  —— 进行中的对局（可选，可整体置 null）
 *    新增字段永远加进对应分区，顶层分区名保持不变。
 * 4. 所有游戏槽位的结构集中登记在 schemas.js；结构升级时 version+1，
 *    并在 migrations 里登记旧版本 -> 新版本的迁移函数，读取时链式执行。
 * 5. 读取时用 defaults 补齐缺失字段（老存档遇上新代码不会出现 undefined）。
 * 6. 未知字段永远保留：save 只整体写回 load 出来的对象，游戏代码只改自己认识的键。
 * 7. 存档若来自更高版本（fromFuture，例如玩家曾用更新的客户端游玩），
 *    一律只读，拒绝写回，避免把新结构的数据降级覆盖。
 * ============================================================ */
(function (M) {
  'use strict';

  var NS = 'homepage';
  var ENVELOPE_VERSION = 1; // 信封/键名结构版本：只有当键名本身或信封字段变化时才 +1
  var PREFIX = NS + ':e' + ENVELOPE_VERSION + ':';

  /* —— 后端抽象：localStorage 不可用（隐私模式/被禁用）时退化为内存，
        页面内一切读写逻辑不感知差异 —— */
  var memoryBacked = {};
  var backend = (function () {
    try {
      var probe = NS + '::probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return {
        kind: 'local',
        get: function (k) { return window.localStorage.getItem(k); },
        set: function (k, v) { window.localStorage.setItem(k, v); },
      };
    } catch (e) {
      return {
        kind: 'memory',
        get: function (k) { return k in memoryBacked ? memoryBacked[k] : null; },
        set: function (k, v) { memoryBacked[k] = v; },
      };
    }
  })();

  /* —— 槽位结构登记表（由 schemas.js 填充） —— */
  var slots = {}; // "gameId::slotName" -> def

  function defineSlot(gameId, slotName, def) {
    if (typeof def.defaults !== 'function') {
      throw new Error('defaults 必须是函数: ' + gameId + '/' + slotName);
    }
    slots[gameId + '::' + slotName] = {
      version: def.version || 1,
      defaults: def.defaults,
      migrations: def.migrations || {},
      bestText: def.bestText || null,
    };
  }

  function slotDef(gameId, slotName) {
    var def = slots[gameId + '::' + slotName];
    if (!def) {
      throw new Error('未登记的存档槽位: ' + gameId + '/' + slotName + '（请先在 schemas.js 登记）');
    }
    return def;
  }

  function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }

  function deepCopy(x) {
    if (Array.isArray(x)) return x.map(deepCopy);
    if (isPlainObject(x)) {
      var o = {};
      Object.keys(x).forEach(function (k) { o[k] = deepCopy(x[k]); });
      return o;
    }
    return x;
  }

  /* 用 defaults 补齐 stored 缺失的字段（递归；标量与数组不深补） */
  function backfill(defaults, stored) {
    Object.keys(defaults).forEach(function (k) {
      var dv = defaults[k];
      if (!(k in stored)) {
        stored[k] = isPlainObject(dv) ? backfill(dv, {}) : deepCopy(dv);
      } else if (isPlainObject(dv) && isPlainObject(stored[k])) {
        backfill(dv, stored[k]);
      }
    });
    return stored;
  }

  function slotKey(gameId, slotName) { return PREFIX + gameId + ':' + slotName; }

  function readEnvelope(gameId, slotName) {
    var raw = backend.get(slotKey(gameId, slotName));
    if (!raw) return null;
    try {
      var env = JSON.parse(raw);
      if (!isPlainObject(env) || !isPlainObject(env.d)) return null;
      return env;
    } catch (e) {
      return null; // 数据损坏视为不存在；如需排查可检查该键的原始内容
    }
  }

  /**
   * 读取槽位。返回：
   * { data, version, isNew, fromFuture, backend }
   * data 已完成迁移与默认值补齐，可直接修改后交给 save()。
   */
  function load(gameId, slotName) {
    var def = slotDef(gameId, slotName);
    var env = readEnvelope(gameId, slotName);
    if (!env) {
      return { data: def.defaults(), version: def.version, isNew: true, fromFuture: false, backend: backend.kind };
    }
    var v = typeof env.v === 'number' ? env.v : 1;
    var data = env.d;
    if (v > def.version) {
      // 来自未来的存档：原样返回且只读
      return { data: data, version: v, isNew: false, fromFuture: true, backend: backend.kind };
    }
    while (v < def.version) {
      var mig = def.migrations[v]; // migrations[v] 把 v 版数据升级到 v+1
      if (mig) data = mig(data) || data;
      v += 1;
    }
    backfill(def.defaults(), data);
    return { data: data, version: def.version, isNew: false, fromFuture: false, backend: backend.kind };
  }

  function save(gameId, slotName, data) {
    var def = slotDef(gameId, slotName);
    if (!isPlainObject(data)) throw new Error('存档数据必须是普通对象');
    try {
      backend.set(slotKey(gameId, slotName), JSON.stringify({ v: def.version, t: Date.now(), d: data }));
      return true;
    } catch (e) {
      if (M.ui && M.ui.toast) M.ui.toast('浏览器存档空间不足，进度可能没有保存');
      return false;
    }
  }

  /** 读取-修改-写回。mutator 直接修改 state.data；来自未来的存档不写回。 */
  function update(gameId, slotName, mutator) {
    var state = load(gameId, slotName);
    if (state.fromFuture) return state;
    mutator(state.data);
    save(gameId, slotName, state.data);
    return state;
  }

  /**
   * 挑战纪录。patch: { 字段: 新值 }，better(newVal, oldVal) 返回 true 才写入。
   * 例：recordBest('2048','main',{score:1234},function(n,o){return n>o;})
   */
  function recordBest(gameId, slotName, patch, better) {
    return update(gameId, slotName, function (d) {
      if (!d.best) d.best = {};
      Object.keys(patch).forEach(function (k) {
        var old = d.best[k];
        if (old === undefined || old === null || old === 0 || better(patch[k], old)) {
          d.best[k] = patch[k];
        }
      });
    });
  }

  /* —— App 级槽位（跨游戏数据，与游戏槽位同一套机制） —— */

  function recordActivity(gameId) {
    update('app', 'activity', function (d) {
      d.counts = d.counts || {};
      d.counts[gameId] = (d.counts[gameId] || 0) + 1;
      d.recent = (d.recent || []).filter(function (x) { return x && x.g !== gameId; });
      d.recent.unshift({ g: gameId, t: Date.now() });
      d.recent = d.recent.slice(0, 12);
    });
  }

  function getActivity() {
    var s = load('app', 'activity');
    return s.fromFuture ? { counts: {}, recent: [] } : s.data;
  }

  /* 首页卡片展示用：返回该游戏 best 分区的文案（无纪录时 null） */
  function bestTextOf(gameId, slotName) {
    var name = slotName || 'main';
    var def = slots[gameId + '::' + name];
    if (!def || !def.bestText) return null;
    var st = load(gameId, name);
    if (st.fromFuture || st.isNew) return null;
    try { return def.bestText(st.data.best); } catch (e) { return null; }
  }

  M.store = {
    defineSlot: defineSlot,
    load: load,
    save: save,
    update: update,
    recordBest: recordBest,
    recordActivity: recordActivity,
    getActivity: getActivity,
    bestText: bestTextOf,
    backendKind: function () { return backend.kind; },
    NS: NS,
    PREFIX: PREFIX,
  };
})(window.App = window.App || {});
