/* 主页导航页：背景图裁剪 UI（默认油画 → 用户上传替换）。
   壁纸本身由 common.js 的 M.wallpaper 全站应用，这里只管上传/裁剪与重置按钮。 */
(function (M) {
  'use strict';
  var hero = document.getElementById('hero');
  if (!hero) return;
  var S = M.store;
  var actions = document.getElementById('hero-actions');

  /* 亮暗各一张壁纸，互不影响；null = 该主题回到默认油画（取值见 home.css 的 --oil-painting）。 */
  function field() { return M.theme.isDark() ? 'heroImageDark' : 'heroImage'; }

  /* 重置按钮只在当前主题确实有自定义壁纸时出现（没有就是空按钮）。 */
  function syncReset() {
    if (!actions) return;
    var s = S.load('app', 'appearance');
    actions.classList.toggle('can-reset', !s.fromFuture && !!s.data[field()]);
  }
  syncReset();
  // 换主题即换画：重置按钮跟着当前主题那张图出现或收起。
  window.addEventListener('themechange', syncReset);

  var btn = document.getElementById('bg-upload');
  if (!btn) return;
  var modal = null, cropper = null;

  function closeModal() {
    if (cropper) { cropper.destroy(); cropper = null; }
    if (modal) { modal.close(); modal.remove(); modal = null; }
    btn.focus();
  }

  function openModal(dataURL) {
    modal = document.createElement('dialog');
    modal.setAttribute('aria-labelledby', 'crop-heading');
    modal.className = 'crop-modal';
    modal.innerHTML =
      '<div class="crop-card">' +
      '<h2 id="crop-heading" class="crop-heading">调整背景图片</h2>' +
      '  <div class="crop-box"><img alt="选择背景区域"></div>' +
      '  <div class="crop-actions">' +
      '    <button type="button" class="btn" data-act="reset">恢复默认</button>' +
      '    <span class="crop-spacer"></span>' +
      '    <button type="button" class="btn" data-act="cancel" autofocus>取消</button>' +
      '    <button type="button" class="btn primary" data-act="save">保存应用</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.showModal();
    modal.addEventListener('cancel', function (e) { e.preventDefault(); closeModal(); });

    // 图片解码完成前裁剪器还不存在，此时「保存应用」要明确不可用，而不是点了没反应。
    var saveBtn = modal.querySelector('[data-act="save"]');
    if (saveBtn) saveBtn.disabled = true;

    var img = modal.querySelector('img');
    img.onload = function () {
      cropper = new window.Cropper(img, {
        viewMode: 1,
        autoCropArea: 0.9,
        background: false,
        movable: true,
        zoomable: true,
        aspectRatio: hero.clientWidth / Math.max(1, hero.clientHeight),
      });
      if (saveBtn) saveBtn.disabled = false;
    };
    img.onerror = function () { M.toast('无法读取图片，请选择其他图片'); closeModal(); };
    img.src = dataURL;

    modal.addEventListener('click', function (e) {
      var button = e.target.closest('button');
      if (!button) return;
      var act = button.dataset.act;
      if (act === 'cancel') {
        closeModal();
      } else if (act === 'reset') {
        S.update('app', 'appearance', function (d) { d[field()] = null; });
        M.wallpaper.apply(S.load('app', 'appearance').data);
        syncReset();
        M.toast('已恢复默认背景');
        closeModal();
      } else if (act === 'save') {
        if (!cropper) { M.toast('图片还在加载，请稍候'); return; }
        var canvas = cropper.getCroppedCanvas({
          maxWidth: 1600,
          maxHeight: 900,
          fillColor: getComputedStyle(document.documentElement).getPropertyValue('--card').trim(),
          imageSmoothingQuality: 'high',
        });
        if (!canvas) return;
        var next = canvas.toDataURL('image/jpeg', 0.85);
        var state = S.load('app', 'appearance');
        if (state.fromFuture) { M.toast('存档版本较新，无法覆盖'); return; }
        state.data[field()] = next;
        if (S.save('app', 'appearance', state.data)) {
          M.wallpaper.apply(state.data);
          syncReset();
          M.toast('背景已更新');
          closeModal();
        }
      }
    });
  }

  btn.addEventListener('click', function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) { M.toast('图片太大了，请选 15MB 以内的'); return; }
      var reader = new FileReader();
      reader.onerror = function () { M.toast('图片读取失败，请重试'); };
      reader.onload = function () { openModal(String(reader.result)); };
      reader.readAsDataURL(file);
    });
    input.click();
  });

  // 滑出的重置按钮：只清掉当前亮暗主题那一张，另一主题保持不变。
  var resetBtn = document.getElementById('bg-reset');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    var state = S.load('app', 'appearance');
    if (state.fromFuture) { M.toast('存档版本较新，无法覆盖'); return; }
    if (!state.data[field()]) return;
    state.data[field()] = null;
    if (!S.save('app', 'appearance', state.data)) return;
    M.wallpaper.apply(state.data);
    syncReset();
    M.toast('已恢复默认背景');
    btn.focus(); // 按钮随后收起，把焦点交还给更换按钮，键盘操作不丢位置
  });
})(window.App);
