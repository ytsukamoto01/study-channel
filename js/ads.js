const ADSENSE_CLIENT_ID = 'ca-pub-5122489446866147';

function pushGoogleAds() {
  const adsArray = window.adsbygoogle || [];
  window.adsbygoogle = adsArray;

  const adElements = document.querySelectorAll('ins.adsbygoogle');
  adElements.forEach((element) => {
    if (!element.getAttribute('data-ad-client')) {
      element.setAttribute('data-ad-client', ADSENSE_CLIENT_ID);
    }

    if (!element.getAttribute('data-adsbygoogle-status')) {
      try {
        adsArray.push({});
      } catch (error) {
        console.warn('AdSense push failed', error);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  pushGoogleAds();
});

document.addEventListener('ads:refresh', () => {
  pushGoogleAds();
});
