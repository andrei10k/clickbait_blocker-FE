var storage = {
  target: chrome.storage.local,
  set: function(obj, callback) {
    this.target.set(obj, callback);
  },
  get: function(name, callback) {
    this.target.get(name, callback);
  }
};

var popup = {
  getTabDomain: function(callback) {
    chrome.tabs.getSelected(null,function(tab) {
      var domain = tab.url.match(/^[\w-]+:\/{2,}\[?([\w\.:-]+)\]?(?::[0-9]*)?/)[1];
      callback(domain);
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

$(function(){

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
    chrome.tabs.sendMessage(tabs[0].id, {action: "get_total_clickbaits"}, function(response) {
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
    popup.addDomainToWhitelist($('.domain-js').text(), function(){
      localAddDomainToWhitelist();
    });
  });

  $('.remove-domain-from-whitelist-js').on('click', function(){
    popup.removeDomainFromWhitelist($('.domain-js').text(), function(){
      localRemoveDomainFromWhitelist();
    });
  });

  popup.addDomainToHtml.call($('.domain-js'), function(){
    popup.setDefaultAddOrRemoveDomain($('.domain-js').text());
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