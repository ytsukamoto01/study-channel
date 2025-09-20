(function () {
  const ADSENSE_CLIENT_ID = 'ca-pub-5122489446866147';
  const DESKTOP_RAIL_QUERY = '(min-width: 1441px)';
  const AD_RETRY_INTERVAL = 500;
  const MAX_AD_LOAD_ATTEMPTS = 10;

  const rails = { left: null, right: null };
  const pendingAds = new WeakSet();
  const watcherCleanup = new WeakMap();
  let resizeTimer = null;

  function normalizeSlotId(value) {
    if (value == null) {
      return null;
    }

    const trimmed = `${value}`.trim();
    if (!trimmed || trimmed === '0' || trimmed.toLowerCase() === 'null') {
      return null;
    }

    return trimmed;
  }

  function resolveSlotId(slotKey) {
    const datasetKey = `adsenseSlot${slotKey.charAt(0).toUpperCase()}${slotKey.slice(1)}`;
    const bodySlot = normalizeSlotId(document.body?.dataset?.[datasetKey]);

    if (bodySlot) {
      return bodySlot;
    }

    const globalConfig = window.adsenseSlotConfig || window.adsenseSlots;
    if (globalConfig) {
      return normalizeSlotId(globalConfig[slotKey]);
    }

    return null;
  }

  function stopWatching(ad) {
    const cleanup = watcherCleanup.get(ad);
    if (cleanup) {
      cleanup();
    }
    watcherCleanup.delete(ad);
  }

  function markAdLoaded(ad) {
    ad.dataset.adsenseLoaded = 'true';
    ad.removeAttribute('data-adsense-pending');
    stopWatching(ad);
    pendingAds.delete(ad);
  }

  function abandonAd(ad) {
    stopWatching(ad);
    pendingAds.delete(ad);
    ad.removeAttribute('data-adsense-pending');
  }

  function tryPushAd(ad) {
    if (!ad.isConnected) {
      abandonAd(ad);
      return false;
    }

    const width = ad.offsetWidth || ad.clientWidth || Math.round(ad.getBoundingClientRect().width);
    if (width > 0) {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      markAdLoaded(ad);
      return true;
    }

    return false;
  }

  function loadAdWhenReady(ad) {
    if (!ad || ad.dataset.adsenseLoaded === 'true' || pendingAds.has(ad)) {
      return;
    }

    pendingAds.add(ad);
    ad.dataset.adsensePending = 'true';

    if (tryPushAd(ad)) {
      return;
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (!pendingAds.has(ad)) {
          observer.disconnect();
          return;
        }

        tryPushAd(ad);
      });

      observer.observe(ad);
      watcherCleanup.set(ad, () => observer.disconnect());
      return;
    }

    let attempts = 0;

    const onResize = () => {
      if (!pendingAds.has(ad)) {
        return;
      }

      tryPushAd(ad);
    };

    const intervalId = window.setInterval(() => {
      if (!pendingAds.has(ad)) {
        window.clearInterval(intervalId);
        return;
      }

      attempts += 1;
      if (tryPushAd(ad)) {
        return;
      }

      if (attempts >= MAX_AD_LOAD_ATTEMPTS) {
        abandonAd(ad);
      }
    }, AD_RETRY_INTERVAL);

    watcherCleanup.set(ad, () => {
      window.clearInterval(intervalId);
      window.removeEventListener('resize', onResize);
    });

    window.addEventListener('resize', onResize);
  }

  function requestAds(context = document) {
    if (!context) {
      return;
    }

    const ads = context.querySelectorAll('ins.adsbygoogle');
    ads.forEach(loadAdWhenReady);
  }

  function createRail(position) {
    if (!document.body) {
      return null;
    }

    const slotKey = position === 'left' ? 'desktopLeft' : 'desktopRight';
    const slotId = resolveSlotId(slotKey);
    if (!slotId) {
      return null;
    }

    const aside = document.createElement('aside');
    aside.className = `side-ad side-ad-${position}`;

    const inner = document.createElement('div');
    inner.className = 'side-ad-inner';

    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', ADSENSE_CLIENT_ID);
    ins.setAttribute('data-ad-slot', slotId);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');

    inner.appendChild(ins);
    aside.appendChild(inner);

    document.body.appendChild(aside);
    rails[position] = aside;

    requestAds(aside);
    return aside;
  }

  function destroyRail(position) {
    if (rails[position]) {
      rails[position].remove();
      rails[position] = null;
    }
  }

  function shouldShowDesktopRails() {
    if (window.matchMedia) {
      return window.matchMedia(DESKTOP_RAIL_QUERY).matches;
    }

    return window.innerWidth >= 1441;
  }

  function syncRails() {
    if (!document.body) {
      return;
    }

    if (shouldShowDesktopRails()) {
      if (!rails.left) {
        createRail('left');
      }

      if (!rails.right) {
        createRail('right');
      }
    } else {
      destroyRail('left');
      destroyRail('right');
    }
  }

  function renderInlineAdMarkup(options = {}) {
    const slotId = resolveSlotId('mobileInline');
    if (!slotId) {
      return '';
    }

    const indent = typeof options.indent === 'number' && options.indent > 0 ? options.indent : 0;
    const styleAttr = indent ? ` style="--inline-ad-indent: ${indent}px;"` : '';

    return `
      <div class="inline-ad-container"${styleAttr} data-inline-ad="true">
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="${ADSENSE_CLIENT_ID}"
             data-ad-slot="${slotId}"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
      </div>
    `.trim();
  }

  function shouldShowInlineAds() {
    if (window.matchMedia) {
      return window.matchMedia('(max-width: 767px)').matches;
    }

    return window.innerWidth <= 767;
  }

  function handleViewportChange() {
    syncRails();
    if (document.body) {
      requestAds(document.body);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    syncRails();
    requestAds();
  });

  const desktopQuery = window.matchMedia ? window.matchMedia(DESKTOP_RAIL_QUERY) : null;
  if (desktopQuery) {
    const onDesktopChange = () => handleViewportChange();

    if (typeof desktopQuery.addEventListener === 'function') {
      desktopQuery.addEventListener('change', onDesktopChange);
    } else if (typeof desktopQuery.addListener === 'function') {
      desktopQuery.addListener(onDesktopChange);
    }
  }

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      handleViewportChange();
    }, 200);
  });

  window.adsenseHelpers = Object.assign({}, window.adsenseHelpers || {}, {
    requestAds,
    renderInlineAdMarkup,
    shouldShowInlineAds
  });
})();
