var storage = {
  target: chrome.storage.local,
  set: function(obj, callback) {
    this.target.set(obj, callback);
  },
  get: function(name, callback) {
    this.target.get(name, callback);
  }
};

// The popup closes as soon as Google's window takes focus, so the actual flow
// runs in the service worker and reports back through storage.
function signInWithGoogle(callback) {
  chrome.runtime.sendMessage({ type: 'sign-in' }, function(response) {
    if (!response) {
      callback(new Error('Sign in did not finish. Open the popup and try again.'));
      return;
    }
    if (response.error) {
      callback(new Error(response.error));
      return;
    }
    callback(null, response.email);
  });
}

function resumeSignIn(callback) {
  chrome.runtime.sendMessage({ type: 'resume' }, function(response) {
    if (!response || !response.email) {
      callback();
      return;
    }
    callback(response.email);
  });
}

function signOut(callback) {
  chrome.runtime.sendMessage({ type: 'sign-out' }, function() {
    storage.target.remove(['email', 'userId'], function() {
      callback();
    });
  });
}

var popup = {
  getTabDomain: function(callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      var match = tabs[0].url.match(/^[\w-]+:\/{2,}\[?([\w\.:-]+)\]?(?::[0-9]*)?/);
      callback(match ? match[1] : '');
    });
  },
  addDomainToHtml: function(callback) {
    var _this = this;
    popup.getTabDomain(function(domain){
      _this.text(domain);
      callback();
    })
  },
  getWhitelistedDomains: function(callback) {
    storage.get('whitelistedDomains', callback);
  },
  addDomainToWhitelist: function(domain, callback) {
    popup.getWhitelistedDomains(function(data){
      if (data.whitelistedDomains) {
        if (data.whitelistedDomains.indexOf(domain) === -1) {
          data.whitelistedDomains.push(domain);
          storage.set({ 'whitelistedDomains': data.whitelistedDomains }, callback);
        }
      } else {
        storage.set({ 'whitelistedDomains': [domain] }, callback);
      }
    })
  },
  removeDomainFromWhitelist: function(domain, callback) {
    popup.getWhitelistedDomains(function(data){
      if (data.whitelistedDomains) {
        if (data.whitelistedDomains.indexOf(domain) !== -1) {
          data.whitelistedDomains.splice(data.whitelistedDomains.indexOf(domain), 1);
          storage.set({ 'whitelistedDomains': data.whitelistedDomains }, callback);
        }
      }
    })
  },
  setDefaultAddOrRemoveDomain: function(domain) {
    popup.getWhitelistedDomains(function(data){
      if (data.whitelistedDomains) {
        if (data.whitelistedDomains.indexOf(domain) !== -1) {
          localAddDomainToWhitelist();
        }
      }
    })
  },
  getClickBaitsMarkedByYou: function (callback) {
    storage.get('clickBaitsMarkedByYou', callback);
  },
  getTotalClickbaitsOnPage: function (callback) {
    storage.get('totalClickbaitsOnPage', callback);
  }
};

function localAddDomainToWhitelist() {
  $('.never-hide-from-domain-js').addClass('hide');
  $('.remove-domain-from-whitelist-js').removeClass('hide');
  $('.remove-domain-js').text($('.domain-js').text());
}
function localRemoveDomainFromWhitelist() {
  $('.remove-domain-from-whitelist-js').addClass('hide');
  $('.never-hide-from-domain-js').removeClass('hide');
}

function renderAccount(email) {
  if (email) {
    $('.clickbait-account-signin-js').addClass('hide');
    $('.clickbait-account-signed-in-js').removeClass('hide');
    $('.clickbait-account-email-js').text(email);
    $('.clickbait-ai-unlocked-js').removeClass('hide');
    $('.clickbait-ai-locked-js').addClass('hide');
  } else {
    $('.clickbait-account-signin-js')
      .removeClass('hide')
      .prop('disabled', false)
      .text('Sign in with Google');
    $('.clickbait-account-signed-in-js').addClass('hide');
    $('.clickbait-account-email-js').text('');
    $('.clickbait-ai-unlocked-js').addClass('hide');
    $('.clickbait-ai-locked-js').removeClass('hide');
  }
}

function renderStats(stats) {
  var data = stats || {};
  $('.clickbait-stat-hidden-js').text(data.hidden || 0);
  $('.clickbait-stat-previews-js').text(data.previews || 0);
}

function renderQuota(usage) {
  if (!usage || !usage.summarizeRemaining) {
    $('.clickbait-quota-js').text('');
    return;
  }
  $('.clickbait-quota-js').text(
    'AI left today: ' + usage.summarizeRemaining + ' previews, ' + usage.rankRemaining + ' scans'
  );
}

$(function(){

  storage.get(['email', 'token'], function(data) {
    renderAccount(data.email);

    if (data.email && !data.token) {
      // Signed in before session tokens existed: trade the email for one.
      chrome.runtime.sendMessage({ type: 'refresh-session' }, function() {
        // Nothing to render: the next popup open picks the token up.
      });
      return;
    }

    if (!data.email) {
      // A previous attempt may have completed after this popup closed.
      resumeSignIn(function(email) {
        renderAccount(email);
      });
    }
  });

  $('.clickbait-account-signin-js').on('click', function() {
    var button = $(this);
    button.prop('disabled', true).text('Signing in...');
    $('.clickbait-account-error-js').addClass('hide').text('');

    signInWithGoogle(function(error, email) {
      if (error) {
        button.prop('disabled', false).text('Sign in with Google');
        $('.clickbait-account-error-js').removeClass('hide').text(error.message);
        return;
      }
      renderAccount(email);
    });
  });

  $('.clickbait-account-signout-js').on('click', function() {
    signOut(function() {
      renderAccount('');
    });
  });

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
    chrome.tabs.sendMessage(tabs[0].id, {action: "get_total_clickbaits"}, function(response) {
          // No content script on chrome:// pages and the like.
          if (chrome.runtime.lastError) { return; }
          popup.getTotalClickbaitsOnPage(function(data) {
              if (data.totalClickbaitsOnPage) {
                  $('.clickbaits-no-js').text(data.totalClickbaitsOnPage);
                }
          });
    });
  });

  $('body').on('click', '.show-original-titles-js', function(){
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
      chrome.tabs.sendMessage(tabs[0].id, {action: "show_original_titles"}, function() {
        $('.show-original-titles-js').removeClass('show-original-titles-js').addClass('clickbait-blocker-chrome-extension clickbait-disabled');
      });
    });
  });

  popup.getClickBaitsMarkedByYou(function(data){
    popup.getTabDomain(function(domain){
      if (data.clickBaitsMarkedByYou) {
        if (checkIfArrayHasObjectWithProp(data.clickBaitsMarkedByYou, 'domain', domain).isInArray) {
          $('.marked-by-you-no-js').text(checkIfArrayHasObjectWithProp(data.clickBaitsMarkedByYou, 'domain', domain).count);
        }
      }
    })
  });

  $('.options-page-js').on('click', function(){
    chrome.runtime.openOptionsPage();
  });

  $('.never-hide-from-domain-js').on('click', function(){
    var domain = $('.domain-js').text();
    if (!domain) { return; }
    popup.addDomainToWhitelist(domain, function(){
      localAddDomainToWhitelist();
    });
  });

  $('.remove-domain-from-whitelist-js').on('click', function(){
    var domain = $('.domain-js').text();
    if (!domain) { return; }
    popup.removeDomainFromWhitelist(domain, function(){
      localRemoveDomainFromWhitelist();
    });
  });

  popup.addDomainToHtml.call($('.domain-js'), function(){
    popup.setDefaultAddOrRemoveDomain($('.domain-js').text());
  });

  storage.get(['aiEnabled', 'aiUsage', 'stats'], function(data) {
    $('.clickbait-ai-toggle-js').prop('checked', data.aiEnabled !== false);
    renderQuota(data.aiUsage);
    renderStats(data.stats);
  });

  $('.clickbait-ai-toggle-js').on('change', function() {
    storage.set({ aiEnabled: $(this).is(':checked') });
  });

  function resetScanButton(button) {
    button.prop('disabled', false).text('Scan page with AI');
  }

  function requestScan(tabId, callback) {
    chrome.tabs.sendMessage(tabId, {action: 'scan_page'}, function(result) {
      // null marks "nothing listening in that tab", which is not a scan failure.
      callback(chrome.runtime.lastError ? null : result);
    });
  }

  function showScanResult(button, result) {
    resetScanButton(button);

    if (!result) {
      $('.clickbait-quota-js').text('This page cannot be scanned. Refresh it and try again.');
      return;
    }

    if (result.error) {
      $('.clickbait-quota-js').text(
        result.auth ? 'Sign in again to use AI.' : 'Scan failed, try again in a moment.'
      );
      return;
    }

    $('.clickbait-quota-js').text(result.scanned + ' links scored' + (result.cached ? ' (cached)' : ''));
  }

  $('.clickbait-scan-js').on('click', function() {
    var button = $(this);
    button.prop('disabled', true).text('Scanning...');

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      var tab = tabs && tabs[0];

      if (!tab || !/^https?:/i.test(tab.url || '')) {
        resetScanButton(button);
        $('.clickbait-quota-js').text('Open a normal web page first.');
        return;
      }

      requestScan(tab.id, function(result) {
        if (result !== null) {
          showScanResult(button, result);
          return;
        }

        // The tab predates this extension load: nothing is attached. Clear the
        // loaded flag so a fresh copy can take over, and check whether our
        // jQuery already lives in this isolated world (re-running it would
        // reset the jQuery data cache the page may rely on).
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function() {
            window.__clickbaitBlockerLoaded = false;
            return typeof window.jQuery !== 'undefined';
          }
        }, function(results) {
          var hasJquery = results && results[0] && results[0].result;
          var files = hasJquery
            ? ['js/build/content.js']
            : ['vendor/js/jquery-2.2.4.min.js', 'js/build/content.js'];

          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: files
          }, function() {
            if (chrome.runtime.lastError) {
              showScanResult(button, null);
              return;
            }

            setTimeout(function() {
              requestScan(tab.id, function(retryResult) {
                showScanResult(button, retryResult);
              });
            }, 400);
          });
        });
      });
    });
  });

  popup.getTabDomain(function(domain) {
    if (!domain) {
      return;
    }

    storage.get(['domainFeedback', 'customRelevanceDomains'], function(data) {
      var feedback = (data.domainFeedback || {})[domain];
      if (feedback) {
        var total = (feedback.revealed || 0) + (feedback.accepted || 0);
        if (total >= 4 && (feedback.revealed || 0) / total > 0.6) {
          $('.clickbait-suggestion-text-js').text('You reveal most links on ' + domain + '.');
          $('.clickbait-suggestion-js').removeClass('hide');
        }
      }

      var custom = (data.customRelevanceDomains || []).filter(function(item) {
        return item.domain === domain;
      })[0];
      $('.clickbait-domain-relevance-js').val(custom ? custom.relevance : '');
    });

    $('.clickbait-suggestion-action-js').on('click', function(e) {
      e.preventDefault();
      popup.addDomainToWhitelist(domain, function() {
        $('.clickbait-suggestion-js').addClass('hide');
        localAddDomainToWhitelist();
      });
    });

    $('.clickbait-domain-relevance-js').on('change', function() {
      var relevance = $(this).val();

      storage.get('customRelevanceDomains', function(data) {
        var list = (data.customRelevanceDomains || []).filter(function(item) {
          return item.domain !== domain;
        });

        if (relevance !== '' && Number(relevance) >= 0) {
          list.push({ domain: domain, relevance: Number(relevance) });
        }

        storage.set({ customRelevanceDomains: list });
      });
    });
  });

});

function checkIfArrayHasObjectWithProp(array, prop, val) {
  var isInArray = false,
    position = null,
    count = 0;
  if (array.length) {
    array.forEach(function(value, index){
      if (value[prop] == val) {
        isInArray = true;
        position = index;
        count ++;
      }
    });
  }

  return {
    isInArray: isInArray,
    position: position,
    count: count
  };
}