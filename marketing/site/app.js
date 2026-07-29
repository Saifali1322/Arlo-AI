/* Idle waveform — an open line with nobody talking yet.
   Deliberately calm: a slow travelling swell, not a fake voice. */
(function () {
  var c = document.getElementById('wave');
  if (!c) return;
  var ctx = c.getContext('2d');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t = 0, dpr = 1, w = 0, h = 0;

  function accent() {
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#1B6B4C';
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = c.clientWidth;
    h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    var mid = h / 2;
    var bars = Math.max(24, Math.floor(w / 7));
    var gap = w / bars;
    ctx.fillStyle = accent();
    for (var i = 0; i < bars; i++) {
      var p = i / bars;
      // two slow waves offset, so the swell travels rather than throbs
      var swell = Math.sin(p * 7 - t) * Math.sin(p * 2.3 + t * 0.6);
      // taper at both ends so it sits in the panel rather than colliding
      var taper = Math.sin(p * Math.PI);
      var a = Math.abs(swell) * taper;
      var bh = Math.max(1.5, a * (h * 0.72));
      ctx.globalAlpha = 0.25 + a * 0.55;
      ctx.fillRect(i * gap, mid - bh / 2, Math.max(1.5, gap * 0.42), bh);
    }
    ctx.globalAlpha = 1;
  }

  function frame() {
    t += 0.017;
    draw();
    requestAnimationFrame(frame);
  }

  size();
  draw();
  if (!still) requestAnimationFrame(frame);
  window.addEventListener('resize', function () { size(); draw(); });
})();
