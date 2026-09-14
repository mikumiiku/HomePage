/* 主页导航页：背景图（羊皮纸色 → 用户上传替换）+ 裁剪流程 */
(function (M) {
  'use strict';
  var hero = document.getElementById('hero');
  if (!hero) return;
  var S = M.store;

  function apply(data) {
    hero.classList.toggle('has-custom-bg', !!data.heroImage);
    if (data.heroImage) {
      hero.style.backgroundImage = 'url("' + data.heroImage + '")';
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
    } else {
      hero.style.backgroundImage = '';
      hero.style.backgroundSize = '';
      hero.style.backgroundPosition = '';
    }
  }

  var st = S.load('app', 'appearance');
  if (!st.fromFuture) apply(st.data);

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
        S.update('app', 'appearance', function (d) { d.heroImage = null; });
        apply(S.load('app', 'appearance').data);
        M.toast('已恢复默认背景');
        closeModal();
      } else if (act === 'save') {
        if (!cropper) return;
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
        state.data.heroImage = next;
        if (S.save('app', 'appearance', state.data)) {
          apply(state.data);
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
})(window.App);
