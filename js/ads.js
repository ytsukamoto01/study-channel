(function() {
  const ADSENSE_CLIENT_ID = 'ca-pub-5122489446866147';
  const DEFAULT_SLOT_IDS = {
    desktopLeft: '1234567890',
    desktopRight: '1234567891',
    mobileInline: '1234567892'
  };

  function getSlotId(name) {
    const body = document.body;
    if (!body) return DEFAULT_SLOT_IDS[name];
    const datasetKey = `adsenseSlot${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    return body.dataset?.[datasetKey] || DEFAULT_SLOT_IDS[name];
  }

  const SIDE_AD_MIN_WIDTH = 1441;

  function shouldShowSideAds() {
    if (window.matchMedia) {
      return window.matchMedia(`(min-width: ${SIDE_AD_MIN_WIDTH}px)`).matches;
    }
    return window.innerWidth >= SIDE_AD_MIN_WIDTH;
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

  function ensureSideAds() {
    if (!document.body) return;

    const showSideAds = shouldShowSideAds();
    const leftSelector = '.side-ad.side-ad-left';
    const rightSelector = '.side-ad.side-ad-right';
    const existingLeft = document.querySelector(leftSelector);
    const existingRight = document.querySelector(rightSelector);

    if (!showSideAds) {
      if (existingLeft) existingLeft.remove();
      if (existingRight) existingRight.remove();
      return;
    }

    if (!existingLeft) {
      const left = createSideAd('left');
      if (left) {
        document.body.appendChild(left);
        requestAds(left);
      }
    }

    if (!existingRight) {
      const right = createSideAd('right');
      if (right) {
        document.body.appendChild(right);
        requestAds(right);
      }
    }
  }

  function requestAds(context = document) {
    const ads = context.querySelectorAll('ins.adsbygoogle:not([data-adsense-loaded])');
    ads.forEach(ad => {
      const rect = ad.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      ad.setAttribute('data-adsense-loaded', 'true');
      (adsbygoogle = window.adsbygoogle || []).push({});
    });
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

  function debounce(fn, delay = 200) {
    let timerId;
    return (...args) => {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => {
        fn(...args);
      }, delay);
    };
  }

  const handleResize = debounce(() => {
    ensureSideAds();
    requestAds();
  }, 250);

  document.addEventListener('DOMContentLoaded', () => {
    ensureSideAds();
    requestAds();
    window.addEventListener('resize', handleResize);
  });

  window.adsenseHelpers = {
    requestAds,
    renderInlineAdMarkup,
    shouldShowInlineAds
  };
})();
