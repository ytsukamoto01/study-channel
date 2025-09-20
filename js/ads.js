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

    if (!document.querySelector('.side-ad.side-ad-left')) {
      const left = createSideAd('left');
      if (left) document.body.appendChild(left);
    }

    if (!document.querySelector('.side-ad.side-ad-right')) {
      const right = createSideAd('right');
      if (right) document.body.appendChild(right);
    }
  }

  function requestAds(context = document) {
    const ads = context.querySelectorAll('ins.adsbygoogle:not([data-adsense-loaded])');
    ads.forEach(ad => {
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

  document.addEventListener('DOMContentLoaded', () => {
    ensureSideAds();
    requestAds();
  });

  window.adsenseHelpers = {
    requestAds,
    renderInlineAdMarkup,
    shouldShowInlineAds
  };
})();
