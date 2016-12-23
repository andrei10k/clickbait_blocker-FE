var storage = {
	target: chrome.storage.local,
	set: function (obj, callback) {
		this.target.set(obj, callback);
	},
	get: function (name, callback) {
		this.target.get(name, callback);
	}
};

var content = {
	getGeneralRelevance: function(callback) {
		storage.get('generalRelevance', callback);
	},
	getCustomRelevanceDomains: function(callback) {
		storage.get('customRelevanceDomains', callback);
	},
	markAsClickbaitPopover: function (link) {
		var html = '<div class="clickbait-blocker-chrome-extension-buttons-wrapper clickbait-mark-js" data-url="' + link.attr('href') + '" style="top: ' + (link.offset().top - 30) + 'px;left: ' + link.offset().left + 'px">' +
			'<div class="clickbait-blocker-chrome-extension-mark clickbait-mark-js" data-url="' + link.attr('href') + '"></div>' +
			'Mark as clickbait' +
			'</div>';

		content.removeMarkAsClickbaitPopover();

		$('body').append(html).on('mousemove', function(e){
			content.checkMouseOverTolerance(e, link, 'mark');
		});


		setTimeout(function(){
			$('.clickbait-blocker-chrome-extension-buttons-wrapper').data('data-original-dom-link', link);
		}, 100)
	},
	mouseOverLink: function () {
		var _this = this;
		if (!this.attr('href') || !checkIfUrl(this.attr('href'))) return false;

		content.ifDomainIsNotWhitelisted(content.getPageDomain(), function () {
			content.markAsClickbaitPopover(_this);
		});

	},
	confirmInfirmPopover: function (link) {
		var html = '<div class="clickbait-blocker-chrome-extension-reveal-buttons-wrapper" style="top: ' + (link.offset().top - 45) + 'px;left: ' + link.offset().left + 'px">' +
			'<div class="clickbait-blocker-chrome-extension-confirm-label">Is this clickbait?</div>' +
			'<div class="clickbait-blocker-chrome-extension-confirm clickbait-confirm clickbait-blocker-chrome-extension-confirm clickbait-confirm-js" data-url="' + link.attr('href') + '"></div>' +
			'<div class="clickbait-blocker-chrome-extension-infirm clickbait-infirm clickbait-blocker-chrome-extension-infirm clickbait-infirm-js" data-url="' + link.attr('href') + '"></div>' +
			'</div>';

		content.removeConfirmInfirmPopover();

		$('body').append(html).on('mousemove', function(e){
			content.checkMouseOverTolerance(e, link, 'confirm');
		});

		setTimeout(function() {
			$('.clickbait-blocker-chrome-extension-reveal-buttons-wrapper').data('data-original-dom-link', link);
		}, 100);
	},
	mouseOverRevealedLink: function () {
		var _this = this;
		content.ifDomainIsNotWhitelisted(content.getPageDomain(), function () {
			content.confirmInfirmPopover(_this);
		});
	},
	mouseOverClickbait: function () {
		var _this = this;
		content.ifDomainIsNotWhitelisted(content.getPageDomain(), function () {
			content.revealOriginalLinkPopover(_this);
		});
	},
	removeConfirmInfirmPopover: function () {
		$('body').off('mousemove');
		$('.clickbait-blocker-chrome-extension-reveal-buttons-wrapper').remove();
	},
	removeMarkAsClickbaitPopover: function () {
		$('body').off('mousemove');
		$('.clickbait-blocker-chrome-extension-buttons-wrapper').remove();
	},
	checkMouseOverTolerance: function(e, link, popover){
		var linkX = link.offset().left,
				linkWidth = link.width(),
				linkHeight = link.height(),
				heights,
				widths,
				linkY = link.offset().top;

		if (link.children().length > 0) {
			heights = link.children().map(function ()	{
					return $(this).height() + $(this).offset().top;
			}).get();
			widths = link.children().map(function () {
				return $(this).width() + $(this).offset().left;
			}).get();

			linkHeight = Math.max.apply(null, heights);
			linkWidth = Math.max.apply(null, widths);
		}
		else {
			linkWidth += linkX;
			linkHeight += linkY;
		}

		if (e.pageX < linkX && (linkX - e.pageX > 100)) {
			content.determinePopupToRemove(popover);
		}
		else if (e.pageX > linkX && (e.pageX > 100 + linkWidth)) {
			content.determinePopupToRemove(popover);
		}
		else if (e.pageY < linkY && (linkY - e.pageY > 100)) {
			content.determinePopupToRemove(popover);
		}
		else if (e.pageY > linkY && (e.pageY > 100 + linkHeight)) {
			content.determinePopupToRemove(popover);
		}
	},
	determinePopupToRemove: function(popover) {
		if (popover === 'mark') {
			content.removeMarkAsClickbaitPopover();
		}
		else if (popover === 'reveal') {
			content.removeshowOriginalLinkPopover();
		}
		else if (popover === 'confirm') {
			content.removeConfirmInfirmPopover();
		}
	},
	removeshowOriginalLinkPopover: function () {
		$('body').off('mousemove');
		$('.clickbait-blocker-chrome-extension-reveal-original-wrapper').remove();
	},
	getWhitelistedDomains: function (callback) {
		storage.get('whitelistedDomains', callback);
	},
	addDomainToWhitelist: function(domain, callback) {
		content.getWhitelistedDomains(function(data){
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
	addPredefinedListToWhitelist: function() {
		var list = [
			"www.google.com",
			"www.google.ro",
			"www.youtube.com",
			"twitter.com",
			"mg.mail.yahoo.com",
			"mail.google.com",
			"stackoverflow.com",
			"github.com",
			"en.wikipedia.com",
			"medium.com",
			"www.bing.com",
			"www.amazon.com",
			"www.reddit.com",
			"www.emag.ro"
		];

		content.getWhitelistedDomains(function (data) {
			if (!data.whitelistedDomains || !data.whitelistedDomains.length) {
				storage.set({'whitelistedDomains': list});
			}
		});
	},
	ifDomainIsNotWhitelisted: function (domain, callback) {
		content.getWhitelistedDomains(function (data) {
			if (data.whitelistedDomains) {
				if (data.whitelistedDomains.indexOf(domain) === -1) {
					callback();
				}
			} else {
				callback();
			}
		})
	},
	getPageDomain: function () {
		if (window.location.port) {
			return window.location.hostname + ':' + window.location.port;
		}
		return window.location.hostname;
	},
	getPageUrl: function () {
		return window.location.href;
	},
	anchorHasChildren: function () {
		return !!this.children().length;
	},
	anchorHasBackgroundImage: function () {
		return this.css('background-image').indexOf('url') !== -1;
	},
	markAsClickBait: function (callback) {
		var _this = this;

		content.getClickBaitsMarkedByYou(function (data) {
			var customObj = {
				domain: content.getPageDomain(),
				link: $(_this).attr('data-url')
			};

			function apiWrapper() {
				API({
					url: 'https://clickbait-blocker.herokuapp.com/api/clickbait',
					method: 'POST',
					data: {
						pageUrl: content.getPageUrl(),
						pageDomain: content.getPageDomain(),
						clickBaitLink: $(_this).attr('data-url'),
						upVotes: 1,
						downVotes: 0
					}
				}, callback);
			}

			if (data.clickBaitsMarkedByYou) {
				if (!checkIfArrayHasObjectWithProps(data.clickBaitsMarkedByYou, ['domain', 'link'], [customObj.domain, customObj.link]).isInArray) {
					apiWrapper();
				} else {
					callback();
				}
			} else {
				apiWrapper();
			}
		});
	},
	getClickBaitsMarkedByYou: function (callback) {
		storage.get('clickBaitsMarkedByYou', callback);
	},
	addClickBaitMarkedByYou: function (customObj, callback) {
		content.getClickBaitsMarkedByYou(function (data) {
			if (data.clickBaitsMarkedByYou) {
				if (!checkIfArrayHasObjectWithProps(data.clickBaitsMarkedByYou, ['domain', 'link'], [customObj.domain, customObj.link]).isInArray) {
					data.clickBaitsMarkedByYou.push(customObj);
					storage.set({'clickBaitsMarkedByYou': data.clickBaitsMarkedByYou}, callback);
				}
			} else {
				storage.set({'clickBaitsMarkedByYou': [customObj]}, callback);
			}

			content.removeInfirmedClickbait(customObj);
		})
	},
	revealOriginalLink: function (similarLinks) {
		var link = similarLinks && $(this) || $(this).parent().data('data-clickbait-dom-link') || $(this).data('data-clickbait-dom-link') ,
			children = link.children().clone();
		link.attr('href', link.attr('data-original-href'))
		.text(link.attr('data-original-text'))
		.append(children)
		.removeAttr('data-original-text')
		.removeAttr('data-original-href')
		.removeClass('marked-as-clickbait-js clickbait-blocker-chrome-extension text')
		.addClass('clickbait-blocker-chrome-extension marked-as-clickbait-revealed-js');

		link.find('.marked-as-clickbait-hidden-js').removeClass('marked-as-clickbait-hidden-js clickbait-blocker-chrome-extension transparent');

		if (link.attr('data-original-background')) {
			link.css('background-image', link.attr('data-original-background'))
			.removeAttr('data-original-background');
		}

		content.removeshowOriginalLinkPopover();
	},
	revealOriginalLinkPopover: function (link) {
		var votesHtml = $(link).attr('clickbait-upvotes') ? '<div title="This is clickbait!" class="clickbait-blocker-chrome-extension-reveal-original-vote clickbait-downvotes"> '+ $(link).attr('clickbait-upvotes') +' </div>' +
			'<div title="Not clickbait!" class="clickbait-blocker-chrome-extension-reveal-original-vote clickbait-upvotes"> '+ $(link).attr('clickbait-downvotes') +' </div>' : '';
		var html = '<div class="clickbait-blocker-chrome-extension-reveal-original-wrapper" style="top: ' + (link.offset().top - 30) + 'px;left: ' + link.offset().left + 'px">' +
				'<a class="clickbait-blocker-chrome-extension-reveal-original clickbait-reveal-original-js">Show original link</a>' +
				votesHtml +
			'</div>';

		content.removeshowOriginalLinkPopover();

		$('body').append(html).on('mousemove', function(e){
			content.checkMouseOverTolerance(e, link, 'reveal');
		});

		setTimeout(function() {
			$('.clickbait-blocker-chrome-extension-reveal-original-wrapper').data('data-clickbait-dom-link', link);
		}, 100);
	},
	getInfirmedClickbaits: function (callback) {
		storage.get('infirmedClickbaits', callback);
	},
	addInfirmedClickbait: function (customObj, callback) {
		content.getInfirmedClickbaits(function (data) {
			if (data.infirmedClickbaits) {
				if (!checkIfArrayHasObjectWithProps(data.infirmedClickbaits, ['domain', 'link'], [customObj.domain, customObj.link]).isInArray) {
					data.infirmedClickbaits.push(customObj);
					storage.set({'infirmedClickbaits': data.infirmedClickbaits}, callback);
				}
			} else {
				storage.set({'infirmedClickbaits': [customObj]}, callback);
			}
		})
	},
	removeInfirmedClickbait: function (customObj) {
		content.getInfirmedClickbaits(function (data) {
			if (data.infirmedClickbaits) {
				if (checkIfArrayHasObjectWithProps(data.infirmedClickbaits, ['domain', 'link'], [customObj.domain, customObj.link]).isInArray) {
					data.infirmedClickbaits.splice(checkIfArrayHasObjectWithProps(data.infirmedClickbaits, ['domain', 'link'], [customObj.domain, customObj.link]).position, 1);
					storage.set({ 'infirmedClickbaits': data.infirmedClickbaits });
				}
			}
		})
	},
	removeClickBaitMarkedByYou: function (customObj) {
		content.getClickBaitsMarkedByYou(function (data) {
			if (data.clickBaitsMarkedByYou) {
				if (checkIfArrayHasObjectWithProps(data.clickBaitsMarkedByYou, ['domain', 'link'], [customObj.domain, customObj.link]).isInArray) {
					data.clickBaitsMarkedByYou.splice(checkIfArrayHasObjectWithProps(data.clickBaitsMarkedByYou, ['domain', 'link'], [customObj.domain, customObj.link]).position, 1);
					storage.set({ 'clickBaitsMarkedByYou': data.clickBaitsMarkedByYou });
				}
			}
		})
	},
	infirmClickBait: function (callback) {
		var _this = this;
		content.addInfirmedClickbait({
			domain: content.getPageDomain(),
			link: $(_this).attr('data-url')
		}, function() {
			API({
				url: 'https://clickbait-blocker.herokuapp.com/api/clickbait',
				method: 'POST',
				data: {
					pageUrl: content.getPageUrl(),
					pageDomain: content.getPageDomain(),
					clickBaitLink: $(_this).attr('data-url'),
					upVotes: 0,
					downVotes: 1
				}
			}, callback);
		});

		content.removeClickBaitMarkedByYou({
			domain: content.getPageDomain(),
			link: $(_this).attr('data-url')
		});
	},
	getClickBaits: function (callback) {
		var domain = content.getPageDomain();

		content.getGeneralRelevance(function(data){
			var relevance = data.generalRelevance || 0;

			content.ifDomainIsNotWhitelisted(domain, function () {
				content.getCustomRelevanceDomains(function(data){
					if (data.customRelevanceDomains && checkIfArrayHasObjectWithProp(data.customRelevanceDomains, 'domain', domain).isInArray) {
						relevance = data.customRelevanceDomains[checkIfArrayHasObjectWithProp(data.customRelevanceDomains, 'domain', domain).position]['relevance'];
					}

					API({
						url: 'https://clickbait-blocker.herokuapp.com/api/clickbait',
						method: 'GET',
						data: {
							pageDomain: domain,
							relevance: relevance
						}
					}, callback);
				})
			});
		});
	},
	hideClickbaits: function(response) {
		function loopAndHide(value) {
			$('a[href="' + value.clickBaitLink + '"]').each(function() {
				var _that = this;
				$(_that).attr('clickbait-upVotes', value.upVotes).attr('clickbait-downVotes', value.downVotes);
				content.getClickBaitsMarkedByYou(function (data) {
					if (!(data.clickBaitsMarkedByYou && checkIfArrayHasObjectWithProps(data.clickBaitsMarkedByYou, ['domain', 'link'], [content.getPageDomain(), value.clickBaitLink]).isInArray)) {
						content.hideOriginalTitle.call(_that, false, true);
					}
				});
			});
		}

		response.forEach(function(value) {
			content.getInfirmedClickbaits(function (data) {
				if (data.infirmedClickbaits) {
					if (!checkIfArrayHasObjectWithProps(data.infirmedClickbaits, ['domain', 'link'], [content.getPageDomain(), value.clickBaitLink]).isInArray) {
						loopAndHide(value);
					}
				} else {
					loopAndHide(value);
				}
			});
		});

		content.getClickBaitsMarkedByYou(function (data) {
			var domain = content.getPageDomain();

			if (data.clickBaitsMarkedByYou) {
				if (checkIfArrayHasObjectWithProp(data.clickBaitsMarkedByYou, 'domain', domain).isInArray) {
					data.clickBaitsMarkedByYou.forEach(function(value){
						$('a[href="' + value.link + '"]').each(function() {
							content.hideOriginalTitle.call(this, true, true);
						});
					});
				}
			}
		});
	},
	hideOriginalTitle: function (byYou, similarLinks) {
		var text = byYou && 'You marked this article as clickbait' || 'This article was marked as clickbait',
			link = similarLinks && $(this) || $(this).parent().data('data-original-dom-link') || $(this).data('data-original-dom-link'),
			initialText = link.clone().children().remove().end().text().trim(),
			children = link.children().clone();
		link.attr('data-original-href', link.attr('href'))
		.attr('data-original-text', initialText)
		.attr('href', 'javascript:;')
		.removeClass('marked-as-clickbait-revealed-js')
		.addClass('marked-as-clickbait-js clickbait-blocker-chrome-extension text');

		link.text(text).append(children);

		if (content.anchorHasChildren.call(link)) {
			link.children().each(function () {
				$(this).addClass('marked-as-clickbait-hidden-js clickbait-blocker-chrome-extension transparent');
			});
		}

		if (content.anchorHasBackgroundImage.call(link)) {
			link.attr('data-original-background', link.css('background-image'))
			.css('background-image', '');
		}
	},
	setTotalClickbaitsOnPage: function (customObj, callback) {
		storage.set(customObj, callback);
	}
};

var API = function (options, callback) {
		var url = options.url || 'localhost:3000/api/clickbait',
			method = options.method || 'GET',
			data = options.data || {};

		$.ajax({
			url: url,
			method: method,
			data: data,
			success: function (response) {
				callback && callback(response);
			}
		});
	},
	checkIfUrl = function (url) {
		return !(url.length === 1 || url.indexOf('javascript:') >= 0);
	};

$(function () {

	content.addPredefinedListToWhitelist();

	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		if (request.action === 'show_original_titles') {
			$('.marked-as-clickbait-js').each(function () {
				content.revealOriginalLink.call(this, true);
			});
		}

		if (request.action === 'get_total_clickbaits') {
			var obj = {
				'totalClickbaitsOnPage': $('.marked-as-clickbait-js').length
			};
			content.setTotalClickbaitsOnPage(obj);
		}
	});

	content.getClickBaits(function(response){
		content.hideClickbaits(response);
	});

	$('body').on('mouseover', 'a:not(.marked-as-clickbait-revealed-js)', function () {
		content.mouseOverLink.call($(this));
	});

	$('body').on('mouseover', '.marked-as-clickbait-js', function () {
		content.mouseOverClickbait.call($(this));
	});

	$('body').on('mouseover', '.marked-as-clickbait-revealed-js', function () {
		content.mouseOverRevealedLink.call($(this));
	});

	$('body').on('click', function (e) {
		if (!$(e.target).parents(".clickbait-blocker-chrome-extension-buttons-wrapper").length && !$(e.target).hasClass('clickbait-blocker-chrome-extension-buttons-wrapper')) {
			content.removeMarkAsClickbaitPopover();
		}
		if (!$(e.target).parents(".clickbait-blocker-chrome-extension-reveal-original-wrapper").length) {
			content.removeshowOriginalLinkPopover();
		}
		if (!$(e.target).parents(".clickbait-blocker-chrome-extension-reveal-buttons-wrapper").length) {
			content.removeConfirmInfirmPopover();
		}
	});

	$('body').on('click', '.clickbait-reveal-original-js', function () {
		var link = $(this).parent().data('data-clickbait-dom-link').attr('data-original-href');

		$('a[data-original-href="' + link + '"]').each(function() {
			content.revealOriginalLink.call(this, true);
		});
	});

	$('body').on('click', '.clickbait-mark-js', function (e) {
		var _this = this,
			  that = _this;
		e.stopPropagation();
		$('.clickbait-blocker-chrome-extension-mark').addClass('loading');
		content.markAsClickBait.call(_this, function () {
			content.hideOriginalTitle.call(_this, true);
			content.removeMarkAsClickbaitPopover();
			content.addClickBaitMarkedByYou({
				domain: content.getPageDomain(),
				link: $(_this).attr('data-url')
			});

			$('a[href="' + $(that).attr('data-url') + '"]').each(function() {
				content.hideOriginalTitle.call(this, true, true);
			});
		});
	});

	$('body').on('click', '.clickbait-confirm-js', function (e) {
		var _this = this;
		$('.clickbait-blocker-chrome-extension-confirm').addClass('loading');
		content.markAsClickBait.call(_this, function () {

			$('a[href="' + $(_this).attr('data-url') + '"]').each(function() {
				content.hideOriginalTitle.call(this, true, true);
			});

			content.removeConfirmInfirmPopover();
			content.addClickBaitMarkedByYou({
				domain: content.getPageDomain(),
				link: $(_this).attr('data-url')
			});
		});
	});

	$('body').on('click', '.clickbait-infirm-js', function (e) {
		var _this = this;
		$('.clickbait-blocker-chrome-extension-infirm').addClass('loading');
		content.infirmClickBait.call(_this, function(){
			var link = $(_this).parent().data('data-original-dom-link');
			link.removeClass('clickbait-blocker-chrome-extension marked-as-clickbait-revealed-js');
			content.removeConfirmInfirmPopover();

			$('a[href="' + $(_this).attr('data-url') + '"]').not(_this).each(function() {
				$(this).removeClass('clickbait-blocker-chrome-extension marked-as-clickbait-revealed-js');
			});
		});
	});

});

function checkIfArrayHasObjectWithProps(array, props, values) {
	var isInArray = false,
		position = null;
	if (array.length) {
		array.forEach(function (value, index) {
			if (value[props[0]] == values[0] && value[props[1]] == values[1]) {
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