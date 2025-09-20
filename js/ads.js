(function() {
  const ADSENSE_CLIENT_ID = 'ca-pub-5122489446866147';
  const SIDE_AD_MEDIA_QUERY = '(min-width: 1441px)';
  const AD_RETRY_INTERVAL = 500;
  const MAX_AD_LOAD_ATTEMPTS = 10;
  const DEFAULT_SLOT_IDS = {
    desktopLeft: '1234567890',
    desktopRight: '1234567891',
    mobileInline: '1234567892'
  };
  let sideAdResizeTimer = null;

  function getSlotId(name) {
    const body = document.body;
    if (!body) return DEFAULT_SLOT_IDS[name];
    const datasetKey = `adsenseSlot${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    return body.dataset?.[datasetKey] || DEFAULT_SLOT_IDS[name];
  }

  function createSideAd(position) {
    const slotKey = position === 'left' ? 'desktopLeft' : 'desktopRight';
    const slotId = getSlotId(slotKey);
    if (!slotId) return null;

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

    return aside;
  }

  function canShowSideAds() {
    if (window.matchMedia) {
      return window.matchMedia(SIDE_AD_MEDIA_QUERY).matches;
    }
    return window.innerWidth > 1440;
  }

  function ensureSideAds() {
    if (!document.body || !canShowSideAds()) return;

    if (!document.querySelector('.side-ad.side-ad-left')) {
      const left = createSideAd('left');
      if (left) document.body.appendChild(left);
    }

    if (!document.querySelector('.side-ad.side-ad-right')) {
      const right = createSideAd('right');
      if (right) document.body.appendChild(right);
    }
  }

  function removeSideAds() {
    document.querySelectorAll('.side-ad').forEach(ad => ad.remove());
  }

  function updateSideAds() {
    if (!document.body) return;

    if (canShowSideAds()) {
      ensureSideAds();
      requestAds(document.body);
    } else {
      removeSideAds();
    }
  }

  function loadAdWhenReady(ad) {
    if (!ad || ad.getAttribute('data-adsense-loaded') === 'true' || ad.getAttribute('data-adsense-pending') === 'true') {
      return;
    }

    ad.setAttribute('data-adsense-pending', 'true');

    let attempts = 0;
    let intervalId = null;

    const cleanup = () => {
      ad.removeAttribute('data-adsense-pending');
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      window.removeEventListener('resize', onResize);
    };

    const tryLoad = () => {
      if (!ad.isConnected) {
        return false;
      }

      const width = ad.offsetWidth || ad.clientWidth;
      if (width > 0) {
        ad.setAttribute('data-adsense-loaded', 'true');
        (adsbygoogle = window.adsbygoogle || []).push({});
        return true;
      }
      return false;
    };

    const onResize = () => {
      if (tryLoad()) {
        cleanup();
      }
    };

    if (tryLoad()) {
      cleanup();
      return;
    }

    intervalId = window.setInterval(() => {
      attempts += 1;
      if (tryLoad() || attempts >= MAX_AD_LOAD_ATTEMPTS) {
        cleanup();
      }
    }, AD_RETRY_INTERVAL);

    window.addEventListener('resize', onResize);
  }

  function requestAds(context = document) {
    const ads = context.querySelectorAll('ins.adsbygoogle');
    ads.forEach(loadAdWhenReady);
  }

  function renderInlineAdMarkup() {
    const slotId = getSlotId('mobileInline');
    if (!slotId) return '';

    return `
      <div class="inline-ad-container">
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="${ADSENSE_CLIENT_ID}"
             data-ad-slot="${slotId}"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
      </div>
    `;
  }

  function shouldShowInlineAds() {
    if (window.matchMedia) {
      return window.matchMedia('(max-width: 767px)').matches;
    }
    return window.innerWidth <= 767;
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateSideAds();
    requestAds();
  });

  window.addEventListener('resize', () => {
    window.clearTimeout(sideAdResizeTimer);
    sideAdResizeTimer = window.setTimeout(() => {
      updateSideAds();
    }, 200);
  });

  window.adsenseHelpers = {
    requestAds,
    renderInlineAdMarkup,
    shouldShowInlineAds
  };
})();
