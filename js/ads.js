(function() {
  // Google AdSenseテスト用設定（テスト広告が確実に表示されます）
  const ADSENSE_CLIENT_ID = 'ca-pub-3940256099942544'; // Google公式テストID
  const DEFAULT_SLOT_IDS = {
    desktopLeft: '6300978111',   // テスト用サイドバー広告
    desktopRight: '6300978111',  // テスト用サイドバー広告
    mobileInline: '6300978111'   // テスト用インライン広告
  };

  function getSlotId(name) {
    const body = document.body;
    if (!body) return DEFAULT_SLOT_IDS[name];
    const datasetKey = `adsenseSlot${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    return body.dataset?.[datasetKey] || DEFAULT_SLOT_IDS[name];
  }

  const SIDE_AD_MIN_WIDTH = 1200; // より低い解像度でも表示するように調整

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

    // 複数の広告ユニットを作成（縦に並べる）
    for (let i = 0; i < 3; i++) {
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.style.width = '160px';
      ins.style.height = '250px';
      ins.style.marginBottom = '20px';
      ins.setAttribute('data-ad-client', ADSENSE_CLIENT_ID);
      ins.setAttribute('data-ad-slot', slotId);
      ins.setAttribute('data-ad-format', 'rectangle');
      ins.setAttribute('data-adtest', 'on');
      
      inner.appendChild(ins);
    }

    aside.appendChild(inner);
    return aside;
  }

  function ensureSideAds() {
    const threadsListContainer = document.getElementById('threadsList');
    if (!threadsListContainer) return;

    const showSideAds = shouldShowSideAds();
    console.log('Should show side ads:', showSideAds, 'Window width:', window.innerWidth);
    
    const wrapper = threadsListContainer.parentElement;
    let threadsWrapper = wrapper.querySelector('.threads-list-wrapper');
    
    if (!showSideAds) {
      // 幅が狭い場合は通常のレイアウトに戻す
      if (threadsWrapper) {
        wrapper.appendChild(threadsListContainer);
        threadsWrapper.remove();
      }
      return;
    }

    if (!threadsWrapper) {
      console.log('Creating threads wrapper with side ads');
      
      // 新しいラッパーを作成
      threadsWrapper = document.createElement('div');
      threadsWrapper.className = 'threads-list-wrapper';
      
      // 左側広告を作成
      const leftAd = createSideAd('left');
      if (leftAd) {
        threadsWrapper.appendChild(leftAd);
      }
      
      // スレッドリストを中央に配置
      threadsWrapper.appendChild(threadsListContainer);
      
      // 右側広告を作成
      const rightAd = createSideAd('right');
      if (rightAd) {
        threadsWrapper.appendChild(rightAd);
      }
      
      // ラッパーをコンテナに追加
      wrapper.appendChild(threadsWrapper);
      
      // 広告をリクエスト
      requestAds(threadsWrapper);
    }
  }

  function requestAds(context = document) {
    // AdSenseスクリプトが読み込まれているか確認
    if (!window.adsbygoogle) {
      console.warn('AdSense script not loaded, creating fallback');
      // フォールバックとしてダミー広告を表示
      createFallbackAds(context);
      return;
    }

    const ads = context.querySelectorAll('ins.adsbygoogle:not([data-adsense-loaded])');
    console.log(`Found ${ads.length} unloaded ads`);
    
    ads.forEach((ad, index) => {
      try {
        ad.setAttribute('data-adsense-loaded', 'true');
        (adsbygoogle = window.adsbygoogle || []).push({});
        console.log(`Pushed ad ${index + 1} to AdSense`);
        
        // 3秒後に広告が表示されていない場合はフォールバックを表示
        setTimeout(() => {
          const rect = ad.getBoundingClientRect();
          if (rect.height < 50) {
            console.log('Ad not loaded, showing fallback');
            showFallbackAd(ad);
          }
        }, 3000);
      } catch (error) {
        console.error('Error pushing ad to AdSense:', error);
      }
    });
  }
  
  function createFallbackAds(context) {
    const adContainers = context.querySelectorAll('.adsbygoogle');
    adContainers.forEach(container => {
      showFallbackAd(container);
    });
  }
  
  function showFallbackAd(container) {
    container.innerHTML = `
      <div style="
        width: 100%; 
        height: 250px; 
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        color: white; 
        font-size: 18px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      ">
        <div style="text-align: center;">
          <div style="font-size: 24px; margin-bottom: 8px;">📢</div>
          <div>テスト広告</div>
          <div style="font-size: 14px; opacity: 0.8; margin-top: 4px;">AdSense Demo</div>
        </div>
      </div>
    `;
    container.style.display = 'block';
  }

  function renderInlineAdMarkup() {
    const slotId = getSlotId('mobileInline');
    if (!slotId) return '';

    return `
      <div class="inline-ad-container">
        <ins class="adsbygoogle"
             style="display:block; width:100%; height:250px;"
             data-ad-client="${ADSENSE_CLIENT_ID}"
             data-ad-slot="${slotId}"
             data-ad-format="rectangle"
             data-adtest="on"></ins>
      </div>
    `;
  }

  function shouldShowInlineAds() {
    const isMobile = window.matchMedia ? 
      window.matchMedia('(max-width: 767px)').matches :
      window.innerWidth <= 767;
    console.log('Should show inline ads (mobile):', isMobile, 'Window width:', window.innerWidth);
    return isMobile;
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
    console.log('AdSense helpers initializing');
    ensureSideAds();
    requestAds();
    window.addEventListener('resize', handleResize);
    
    // 初期化後に再度広告をリクエスト（遅延読み込み対応）
    setTimeout(() => {
      console.log('Delayed ad request');
      requestAds();
    }, 1000);
  });

  window.adsenseHelpers = {
    requestAds,
    renderInlineAdMarkup,
    shouldShowInlineAds,
    ensureSideAds
  };
})();
