var storage = {
	target: chrome.storage.local,
	set: function(obj, callback) {
		this.target.set(obj, callback);
	},
	get: function(name, callback) {
		this.target.get(name, callback);
	}
};

var options = {
	changeGeneralRelevance: function() {
		var value = $(this).val();
		storage.set({ 'generalRelevance': value });
	},
	getGeneralRelevance: function(callback) {
		storage.get('generalRelevance', callback);
	},
	setDefaultGeneralRelevance: function() {
		var _this = this;
		options.getGeneralRelevance(function(data){
      _this.val(data.generalRelevance || 0);
		});
	},
	appendDynamicHtml: function(data, templateId, parentSelector) {
		var template = $(templateId).html();
		var html = Mustache.to_html(template, data);
		$(parentSelector).html(html);
	},
  getWhitelistedDomains: function(callback) {
	  storage.get('whitelistedDomains', callback);
  },
  removeDomainFromWhitelist: function(domain, callback) {
    options.getWhitelistedDomains(function(data){
      if (data.whitelistedDomains) {
        if (data.whitelistedDomains.indexOf(domain) !== -1) {
          data.whitelistedDomains.splice(data.whitelistedDomains.indexOf(domain), 1);
          storage.set({ 'whitelistedDomains': data.whitelistedDomains }, callback);
        }
      }
    })
  },
  removeCustomRelevanceDomain: function(customDomain, callback) {
    options.getCustomRelevanceDomains(function(data){
      if (data.customRelevanceDomains) {
        if (checkIfArrayHasObjectWithProp(data.customRelevanceDomains, 'domain', customDomain.domain).isInArray) {
          data.customRelevanceDomains.splice(checkIfArrayHasObjectWithProp(data.customRelevanceDomains, 'domain', customDomain.domain).position, 1);
          storage.set({ 'customRelevanceDomains': data.customRelevanceDomains }, callback);
        }
      }
    })
  },
  addCustomRelevanceDomain: function(customDomain, callback) {
	options.getCustomRelevanceDomains(function(data){
	  if (data.customRelevanceDomains) {
		if (!checkIfArrayHasObjectWithProp(data.customRelevanceDomains, 'domain', customDomain.domain).isInArray) {
		  data.customRelevanceDomains.push(customDomain);
		  storage.set({ 'customRelevanceDomains': data.customRelevanceDomains }, callback);
		} else {
		  options.resetAddCustomRelevanceDomains();
		}
	  } else {
		storage.set({ 'customRelevanceDomains': [customDomain] }, callback);
	  }
	})
  },
  getCustomRelevanceDomains: function(callback) {
	  storage.get('customRelevanceDomains', callback);
  },
  resetAddCustomRelevanceDomains: function() {
    $('.custom-domain-input-js').val('');
    $('#custom-relevance-select').val(0);
    $('.custom-domain-row-container-js').addClass('hide');
  }
};

$(function() {
  var $generalRelevance = $('#general-relevance');
  options.setDefaultGeneralRelevance.call($generalRelevance);
  $generalRelevance.on('keyup', function() {
		options.changeGeneralRelevance.call(this);
	});

  function renderRelevanceCopy(value) {
    $('.relevance-live-copy-js').html('');
    $('.relevance-live-copy-js')
      .append(document.createTextNode('Links with more than '))
      .append($('<b></b>').text(value || 0))
      .append(document.createTextNode(' net clickbait votes will be hidden.'));
  }

  options.getGeneralRelevance(function(data) {
    renderRelevanceCopy(data.generalRelevance);
  });

  $generalRelevance.on('input', function() {
    renderRelevanceCopy($(this).val());
  });

  $('.whitelist-search-js').on('input', function() {
    var term = $(this).val().trim().toLowerCase();
    $('.whitelist-row').each(function() {
      var row = $(this);
      var matches = row.text().toLowerCase().indexOf(term) !== -1;
      row.toggleClass('hide', !matches);
    });
  });

  $('.settings-export-js').on('click', function() {
    storage.get(['generalRelevance', 'whitelistedDomains', 'customRelevanceDomains', 'aiEnabled'], function(data) {
      var payload = JSON.stringify({
        generalRelevance: data.generalRelevance || 0,
        whitelistedDomains: data.whitelistedDomains || [],
        customRelevanceDomains: data.customRelevanceDomains || [],
        aiEnabled: data.aiEnabled !== false
      }, null, 2);

      var url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      var link = document.createElement('a');
      link.href = url;
      link.download = 'clickbait-blocker-settings.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      $('.settings-status-js').text('Settings exported.');
    });
  });

  $('.settings-import-js').on('click', function() {
    $('.settings-import-file-js').trigger('click');
  });

  $('.settings-import-file-js').on('change', function() {
    var file = this.files && this.files[0];
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function() {
      var parsed;

      try {
        parsed = JSON.parse(reader.result);
      } catch (error) {
        $('.settings-status-js').text('That file is not valid JSON.');
        return;
      }

      if (!parsed || typeof parsed !== 'object') {
        $('.settings-status-js').text('That file does not contain settings.');
        return;
      }

      var incoming = {};

      if (parsed.generalRelevance !== undefined) {
        incoming.generalRelevance = Number(parsed.generalRelevance) || 0;
      }
      if (Array.isArray(parsed.whitelistedDomains)) {
        incoming.whitelistedDomains = parsed.whitelistedDomains.map(String);
      }
      if (Array.isArray(parsed.customRelevanceDomains)) {
        incoming.customRelevanceDomains = parsed.customRelevanceDomains
          .filter(function(item) { return item && item.domain; })
          .map(function(item) { return { domain: String(item.domain), relevance: Number(item.relevance) || 0 }; });
      }
      if (parsed.aiEnabled !== undefined) {
        incoming.aiEnabled = parsed.aiEnabled !== false;
      }

      storage.set(incoming, function() {
        $('.settings-status-js').text('Settings imported. Reloading...');
        setTimeout(function() { window.location.reload(); }, 600);
      });
    };

    reader.readAsText(file);
  });

  $('.settings-reset-js').on('click', function() {
    storage.set({
      generalRelevance: 0,
      whitelistedDomains: [],
      customRelevanceDomains: [],
      aiEnabled: true
    }, function() {
      $('.settings-status-js').text('Defaults restored. Reloading...');
      setTimeout(function() { window.location.reload(); }, 600);
    });
  });

  options.getWhitelistedDomains(function(data){
    if (data.whitelistedDomains && data.whitelistedDomains.length) {
      var dataObjForMustache = { whitelist: data.whitelistedDomains };
      $('.no-whitelist-js').addClass('hide');
      $('.whitelist-items-no-js').text(data.whitelistedDomains.length);
      options.appendDynamicHtml(dataObjForMustache, '#whitelist', '.whitelist-container-js');
    }
  });

  options.getCustomRelevanceDomains(function(data){
    if (data.customRelevanceDomains && data.customRelevanceDomains.length) {
      var dataObjForMustache = { customDomain: data.customRelevanceDomains };
      options.appendDynamicHtml(dataObjForMustache, '#custom-domain-list', '.custom-domains-list-js');
    }
  });

  $('body').on('click', '.remove-item-from-whitelist-js', function() {
    var _this = this,
        $whitelistItemsNo = $('.whitelist-items-no-js'),
        whitelistNo = +$whitelistItemsNo.text(),
        domain = $(_this).attr('data-url');
    options.removeDomainFromWhitelist(domain, function(){
      $(_this).parent().remove();
      whitelistNo --;
      if (whitelistNo === 0) {
        $('.no-whitelist-js').removeClass('hide');
      }
      $whitelistItemsNo.text(whitelistNo);
    })
  });

  $('.add-custom-domain-js').on('click', function(){
    $('.custom-domain-row-container-js').removeClass('hide');
  });

  $('body').on('keyup', '.custom-domain-input-js', function() {
    var $customDomainSave = $('.custom-domain-save-js');
    if ($(this).val().trim()) {
      $customDomainSave.removeAttr('disabled');
    } else {
      $customDomainSave.prop('disabled', true);
    }
  });

  $('body').on('click', '.custom-domain-save-js', function(){
    options.addCustomRelevanceDomain({
      domain: $('.custom-domain-input-js').val(),
      relevance: $('#custom-relevance-select').val()
    }, function(){
      options.resetAddCustomRelevanceDomains();
      options.getCustomRelevanceDomains(function(data){
        if (data.customRelevanceDomains && data.customRelevanceDomains.length) {
          var dataObjForMustache = { customDomain: data.customRelevanceDomains };
          options.appendDynamicHtml(dataObjForMustache, '#custom-domain-list', '.custom-domains-list-js');
        }
      });
    });
  });

  $('body').on('click', '.remove-item-from-custom-domains-list-js', function() {
    var _this = this,
      domain = $(_this).attr('data-url');
    options.removeCustomRelevanceDomain({
      domain: domain
    }, function(){
      $(_this).parent().remove();
    })
  });
});

function checkIfArrayHasObjectWithProp(array, prop, val) {
  var isInArray = false,
      position = null;
  if (array.length) {
    array.forEach(function(value, index){
      if (value[prop] == val) {
        isInArray = true;
        position = index;
      }
    });
  }

  return {
    isInArray: isInArray,
    position: position
  };
}