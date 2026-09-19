var __iconFontOk = false;
  function applyIconFallback(){
    document.documentElement.classList.add('icons-fallback');
  }
  function clearIconFallback(){
    __iconFontOk = true;
    document.documentElement.classList.remove('icons-fallback');
  }
  function iconFontFailed(){ if(!__iconFontOk) applyIconFallback(); }
  function checkIconFontNow(){
    try{
      return !!(document.fonts && document.fonts.check && document.fonts.check('16px "tabler-icons"'));
    }catch(e){ return false; }
  }
  var __iconPollActive = false;
  function pollForIconFont(){
    if(__iconPollActive) return;
    if(!(window.document && document.fonts)){
      return;
    }
    __iconPollActive = true;
    var attempts = 0, maxAttempts = 25;
    var poll = setInterval(function(){
      attempts++;
      if(checkIconFontNow()){
        clearIconFallback();
        clearInterval(poll);
        __iconPollActive = false;
        return;
      }
      if(attempts >= maxAttempts){
        clearInterval(poll);
        __iconPollActive = false;
        if(!__iconFontOk) applyIconFallback();
        var recover = setInterval(function(){
          if(checkIconFontNow()){ clearIconFallback(); clearInterval(recover); }
        },1500);
        setTimeout(function(){ clearInterval(recover); },20000);
      }
    },200);
  }
  function retryIconStylesheet(){
    var oldLink = document.getElementById('icon-font-css');
    if(!oldLink) return;
    var newLink = oldLink.cloneNode();
    var base = oldLink.href.split('?')[0];
    newLink.href = base + '?retry=' + Date.now();
    newLink.onerror = iconFontFailed;
    oldLink.parentNode.replaceChild(newLink, oldLink);
  }
  (function(){
    if(navigator.onLine === false){ applyIconFallback(); return; }
    pollForIconFont();
  })();
  window.addEventListener('offline', applyIconFallback);
  window.addEventListener('online', function(){
    if(__iconFontOk) return;
    retryIconStylesheet();
    pollForIconFont();
  });
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && !__iconFontOk && navigator.onLine !== false){
      retryIconStylesheet();
      pollForIconFont();
    }
  });