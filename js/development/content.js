// The popup re-injects this file into tabs that predate an extension reload. Only
// one copy may bind handlers; a copy that loses its chrome context clears the
// flag in orphan() so the next injection can take over.
(function () {
if (window.__clickbaitBlockerLoaded) {
	return;
}
window.__clickbaitBlockerLoaded = true;
window.__clickbaitBlockerVersion = (function () {
	try {
		return chrome.runtime.getManifest().version;
	} catch (error) {
		return 'dead';
	}
})();

// A reloaded extension leaves this copy running with a dead chrome.* context.
// Every call below becomes a no-op instead of throwing on each hover.
var orphaned = false;

function extensionAlive() {
	try {
		return !!(chrome && chrome.runtime && chrome.runtime.id);
	} catch (error) {
		return false;
	}
}

function orphan() {
	if (orphaned) {
		return;
	}

	orphaned = true;
	window.__clickbaitBlockerLoaded = false;
	window.__clickbaitBlockerOrphaned = true;
	$('.clickbait-blocker-chrome-extension-buttons-wrapper, ' +
		'.clickbait-blocker-chrome-extension-reveal-buttons-wrapper, ' +
		'.clickbait-blocker-chrome-extension-reveal-original-wrapper, ' +
		'.clickbait-ai-wrapper, .clickbait-toast').remove();
}

var storage = {
	target: chrome.storage.local,
	set: function (obj, callback) {
		if (orphaned || !extensionAlive()) {
			orphan();
			callback && callback();
			return;
		}
		try {
			chrome.storage.local.set(obj, callback);
		} catch (error) {
			orphan();
			callback && callback();
		}
	},
	get: function (name, callback) {
		if (orphaned || !extensionAlive()) {
			orphan();
			callback && callback({});
			return;
		}
		try {
			chrome.storage.local.get(name, function (data) {
				callback && callback(data || {});
			});
		} catch (error) {
			orphan();
			callback && callback({});
		}
	},
	remove: function (keys, callback) {
		if (orphaned || !extensionAlive()) {
			callback && callback();
			return;
		}
		try {
			chrome.storage.local.remove(keys, callback);
		} catch (error) {
			callback && callback();
		}
	}
};

// Shared clickbait list. The server answers with access-control-allow-origin: *,
// and MV3 applies the page's CORS rules to content-script requests, so no host
// permission is needed for these calls.
var API_BASE = 'https://clickbaitblockerapi.gotskillz.tech';
var API_URL = API_BASE + '/api/clickbait';

// Injected stylesheets resolve relative urls against the page, not the
// extension, so the icons are published as CSS variables from here instead.
var ICONS = {
	'--cb-icon-plus': 'plus.png',
	'--cb-icon-loading': 'loading.gif',
	'--cb-icon-minus': 'minus.png',
	'--cb-icon-up': 'up.png',
	'--cb-icon-down': 'down.png',
	'--cb-icon-confirm': 'confirm.png',
	'--cb-icon-infirm': 'infirm.png',
	'--cb-icon-ai': 'ai.svg'
};

function setIconUrls() {
	try {
		Object.keys(ICONS).forEach(function (name) {
			document.documentElement.style.setProperty(
				name,
				'url("' + chrome.runtime.getURL('image/' + ICONS[name]) + '")'
			);
		});
	} catch (error) {
		orphan();
	}
}

var CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
var CACHE_LIMIT = 200;
var HEURISTIC_MIN = 60;

var session = { email: '', token: '', aiEnabled: true };

function syncSession(callback) {
	storage.get(['email', 'token', 'aiEnabled'], function (data) {
		session.email = (data && data.email) || '';
		session.token = (data && data.token) || '';
		session.aiEnabled = !data || data.aiEnabled !== false;
		callback && callback();
	});
}

// The popup signs in and out, so the injected copy follows it.
try {
	chrome.storage.onChanged.addListener(function (changes, area) {
		if (area !== 'local') {
			return;
		}
		if (changes.email) {
			session.email = changes.email.newValue || '';
		}
		if (changes.token) {
			session.token = changes.token.newValue || '';
		}
		if (changes.aiEnabled) {
			session.aiEnabled = changes.aiEnabled.newValue !== false;
		}
	});
} catch (error) {
	// The extension was reloaded; this copy cannot listen to storage anymore.
}

var content = {
	getGeneralRelevance: function(callback) {
		storage.get('generalRelevance', callback);
	},
	getCustomRelevanceDomains: function(callback) {
		storage.get('customRelevanceDomains', callback);
	},
	markAsClickbaitPopover: function (link) {
		var html = '<div class="clickbait-blocker-chrome-extension-buttons-wrapper clickbait-mark-js" role="button" tabindex="0" aria-label="Mark as clickbait" data-url="' + link.attr('href') + '" style="top: ' + (link.offset().top - 30) + 'px;left: ' + link.offset().left + 'px">' +
			'<div class="clickbait-blocker-chrome-extension-mark clickbait-mark-js" data-url="' + link.attr('href') + '"></div>' +
			'Mark as clickbait' +
			'</div>';

		content.removeMarkAsClickbaitPopover();

		$('body').append(html).on('mousemove', function(e){
			content.checkMouseOverTolerance(e, link, 'mark');
		});

		// The AI preview is only offered to signed in users who left it enabled.
		if (session.email && session.aiEnabled) {
			$('.clickbait-blocker-chrome-extension-buttons-wrapper')
				.addClass('has-ai')
				.append(
					$('<div class="clickbait-ai-button clickbait-ai-js" role="button" tabindex="0" aria-label="Preview this article with AI" title="Preview this article with AI"></div>')
						.attr('data-url', content.absoluteUrl(link.attr('href')))
						.attr('data-title', $.trim(link.text()))
				);
		}


		setTimeout(function(){
			$('.clickbait-blocker-chrome-extension-buttons-wrapper').data('data-original-dom-link', link);
		}, 100)
	},
	mouseOverLink: function () {
		var _this = this;
		if (orphaned || !extensionAlive()) {
			orphan();
			return false;
		}
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
		if (orphaned) {
			return;
		}
		content.ifDomainIsNotWhitelisted(content.getPageDomain(), function () {
			content.confirmInfirmPopover(_this);
		});
	},
	mouseOverClickbait: function () {
		var _this = this;
		if (orphaned) {
			return;
		}
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
	removeAiSummary: function () {
		if (content.aiXhr) {
			content.aiXhr.abort();
			content.aiXhr = null;
		}
		$('.clickbait-ai-wrapper').remove();
	},
	// Anchor hrefs are often relative; the server needs a fetchable url.
	absoluteUrl: function (href) {
		try {
			return new URL(href, window.location.href).href;
		} catch (error) {
			return href;
		}
	},
	cacheKey: function (url) {
		return 'summary:v2:' + url;
	},
	readCache: function (url, callback) {
		var key = content.cacheKey(url);
		storage.get([key], function (data) {
			var entry = data[key];
			if (!entry || Date.now() - entry.savedAt > CACHE_TTL) {
				callback(null);
				return;
			}
			callback(entry);
		});
	},
	writeCache: function (url, result, callback) {
		var key = content.cacheKey(url);
		var payload = {};
		payload[key] = Object.assign({}, result, { savedAt: Date.now() });

		storage.get(['summaryIndex'], function (data) {
			var index = (Array.isArray(data.summaryIndex) ? data.summaryIndex : []).filter(function (item) {
				return item !== key;
			});
			index.push(key);

			var stale = index.length > CACHE_LIMIT ? index.splice(0, index.length - CACHE_LIMIT) : [];
			payload.summaryIndex = index;

			storage.set(payload, function () {
				if (stale.length) {
					storage.remove(stale);
				}
				callback && callback();
			});
		});
	},
	heuristicScore: function (text) {
		var value = String(text || '').trim();
		if (!value) {
			return 0;
		}

		var score = 0;
		var words = value.split(/\s+/);
		var letters = value.replace(/[^A-Za-z\u0102\u00C2\u00CE\u0218\u021A\u0103\u00E2\u00EE\u0219\u021B]/g, '');
		var upper = value.replace(/[^A-Z\u0102\u00C2\u00CE\u0218\u021A]/g, '');

		if (letters.length > 10 && upper.length / letters.length > 0.5) {
			score += 25;
		}
		if (/\d/.test(value)) {
			score += 10;
		}
		if (/\?/.test(value)) {
			score += 10;
		}
		if (/!/.test(value)) {
			score += 10;
		}

		[
			/nu o s\u0103 crezi/i,
			/nu vei crede/i,
			/\u0219tii? ce/i,
			/afl\u0103/i,
			/\u0219ocant/i,
			/incredibil/i,
			/secret/i,
			/\u00een imagini/i,
			/cum s\u0103/,
			/you won'?t believe/i,
			/shocking/i
		].forEach(function (pattern) {
			if (pattern.test(value)) {
				score += 15;
			}
		});

		if (words.length > 14) {
			score -= 10;
		}

		return Math.max(0, Math.min(100, score));
	},
	applyHeuristics: function () {
		$('a[href]').each(function () {
			var link = $(this);
			if (link.hasClass('marked-as-clickbait-js') || link.hasClass('clickbait-heuristic')) {
				return;
			}
			var score = content.heuristicScore(link.text());
			if (score >= HEURISTIC_MIN) {
				link.addClass('clickbait-heuristic').attr('data-cb-heuristic', score);
			}
		});
	},
	recordFeedback: function (domain, kind) {
		storage.get('domainFeedback', function (data) {
			var all = (data && data.domainFeedback) || {};
			var entry = all[domain] || { revealed: 0, accepted: 0 };
			entry[kind] = (entry[kind] || 0) + 1;
			all[domain] = entry;
			storage.set({ domainFeedback: all });
		});
	},
	toast: function (message) {
		$('.clickbait-toast').remove();
		var $toast = $('<div class="clickbait-toast"></div>').text(message);
		$('body').append($toast);
		setTimeout(function () {
			$toast.addClass('clickbait-toast-hide');
		}, 2200);
		setTimeout(function () {
			$toast.remove();
		}, 2800);
	},
	collectLinks: function () {
		var seen = {};
		var links = [];

		$('a[href]').each(function () {
			var link = $(this);
			var url = content.absoluteUrl(link.attr('href'));
			var title = $.trim(link.text());

			if (!/^https?:/i.test(url) || title.length < 12 || seen[url]) {
				return;
			}

			seen[url] = true;
			links.push({ url: url, title: title });
		});

		return links.slice(0, 30);
	},
	applyScores: function (results) {
		var applied = 0;

		(results || []).forEach(function (item) {
			$('a[href]').each(function () {
				var link = $(this);
				if (content.absoluteUrl(link.attr('href')) !== item.url) {
					return;
				}

				var bucket = item.score >= 66 ? 'high' : (item.score >= 33 ? 'medium' : 'low');
				link.addClass('clickbait-score clickbait-score-' + bucket)
					.attr('data-cb-score', item.score)
					.attr('data-cb-reason', item.reason || '');
				applied += 1;
			});
		});

		return applied;
	},
	// Scores from an earlier visit are painted straight away, with no network
	// call and no cooldown, so a reload does not lose them.
	// A detailed preview knows the article, so its score replaces the headline
	// estimate for that link.
	updateLinkScore: function (url, score, reason) {
		var value = content.confidencePercent(score);
		if (value === null) {
			return;
		}

		var bucket = value >= 66 ? 'high' : (value >= 33 ? 'medium' : 'low');

		$('a[href]').each(function () {
			var link = $(this);
			if (content.absoluteUrl(link.attr('href')) !== url) {
				return;
			}

			link.removeClass('clickbait-score-high clickbait-score-medium clickbait-score-low')
				.addClass('clickbait-score clickbait-score-' + bucket)
				.attr('data-cb-score', Math.round(value))
				.attr('data-cb-reason', reason || '');
		});
	},
	applyCachedSummaries: function () {
		var links = content.collectLinks();
		if (!links.length) {
			return;
		}

		var keys = links.map(function (item) {
			return content.cacheKey(item.url);
		});

		storage.get(keys, function (data) {
			links.forEach(function (item) {
				var entry = data[content.cacheKey(item.url)];
				if (entry && entry.score !== undefined) {
					content.updateLinkScore(item.url, entry.score, entry.reason);
				}
			});
		});
	},
	applyCachedScan: function (callback) {
		var cacheKey = 'scan:' + window.location.href;

		storage.get([cacheKey], function (data) {
			var cached = data[cacheKey];

			if (!cached || !cached.results || !cached.results.length) {
				callback && callback(0);
				return;
			}

			callback && callback(content.applyScores(cached.results));
		});
	},
	scanPage: function (callback) {
		if (orphaned || !extensionAlive()) {
			orphan();
			callback && callback({ error: true });
			return;
		}

		var links = content.collectLinks();

		if (links.length === 0) {
			callback && callback({ scanned: 0 });
			return;
		}

		var cacheKey = 'scan:' + window.location.href;

		storage.get([cacheKey], function (data) {
			var cached = data[cacheKey];
			if (cached && Date.now() - cached.savedAt < 60 * 60 * 1000) {
				content.applyScores(cached.results);
				callback && callback({ scanned: cached.results.length, cached: true });
				return;
			}

			$.ajax({
				url: API_BASE + '/api/rank-page',
				method: 'POST',
				contentType: 'application/json',
				dataType: 'json',
				data: JSON.stringify({
					pageUrl: window.location.href,
					links: links,
					session: session.token
				}),
				timeout: 60000
			})
				.done(function (response) {
					var payload = {};
					payload[cacheKey] = { results: response.results || [], savedAt: Date.now() };
					payload['lastScan:' + window.location.href] = Date.now();
					storage.set(payload);

					var applied = content.applyScores(response.results);
					if (response.usage) {
						storage.set({ aiUsage: response.usage });
					}
					callback && callback({ scanned: applied, cached: false });
				})
				.fail(function (xhr) {
					callback && callback({ error: true, auth: !!(xhr && xhr.status === 401) });
				});
		});
	},
	formatConfidence: function (value) {
		var percent = content.confidencePercent(value);
		return percent === null ? 'unknown' : Math.round(percent) + '%';
	},
	confidencePercent: function (value) {
		var match = String(value || '').match(/(\d+(?:\.\d+)?)/);
		if (!match) return null;
		var percent = parseFloat(match[1]);
		// The model answers in percent, but guard against 0-1 replies.
		if (percent <= 1) percent = percent * 100;
		return percent;
	},
	confidenceClass: function (value) {
		var percent = content.confidencePercent(value);
		if (percent === null) return 'clickbait-ai-score-medium';
		if (percent >= 66) return 'clickbait-ai-score-high';
		if (percent >= 33) return 'clickbait-ai-score-medium';
		return 'clickbait-ai-score-low';
	},
	showAiSummary: function (url, title, offset, retried) {
		var $text = $('<div class="clickbait-ai-text clickbait-ai-loading"></div>').text('Reading the article...'),
			$wrapper = $('<div class="clickbait-ai-wrapper" role="dialog" aria-label="AI preview"></div>')
				.css({
					top: Math.max(offset.top - 20, 4) + 'px',
					left: Math.max(offset.left - 300, 4) + 'px'
				})
				.append($('<span class="clickbait-ai-close" role="button" tabindex="0" title="Close">&times;</span>'))
				.append($('<div class="clickbait-ai-heading"></div>').text('AI preview'))
				.append($text);

		content.removeAiSummary();
		$('body').append($wrapper);

		function render(result, fromCache) {
			$text.removeClass('clickbait-ai-loading')
				.text(result.content || 'There is nothing to summarize on this page.');

			content.updateLinkScore(url, result.score, result.reason);

			if (result.keyPoints && result.keyPoints.length) {
				var $points = $('<ul class="clickbait-ai-points"></ul>');
				result.keyPoints.slice(0, 4).forEach(function (point) {
					$points.append($('<li class="clickbait-ai-point"></li>').text(point));
				});
				$wrapper.append($points);
			}

			if (result.score !== undefined && result.score !== null && result.score !== '') {
				$wrapper.append(
					$('<div class="clickbait-ai-score"></div>')
						.addClass(content.confidenceClass(result.score))
						.text('Clickbait score: ' + Math.round(Number(result.score)) + '%')
				);
			}

			if (result.reason) {
				$wrapper.append($('<div class="clickbait-ai-reason"></div>').text(result.reason));
			}

			if (result.tags && result.tags.length) {
				var $tags = $('<div class="clickbait-ai-tags"></div>');
				result.tags.slice(0, 4).forEach(function (tag) {
					$tags.append($('<span class="clickbait-ai-tag"></span>').text(tag));
				});
				$wrapper.append($tags);
			}

			if (fromCache) {
				$wrapper.append($('<div class="clickbait-ai-cached"></div>').text('from cache'));
			}

			storage.get('stats', function (data) {
				var stats = (data && data.stats) || {};
				var week = content.weekKey();

				if (stats.weekKey !== week) {
					stats = { hidden: stats.hidden || 0, previews: 0, weekKey: week };
				}

				stats.previews = (stats.previews || 0) + 1;
				storage.set({ stats: stats });
			});
		}

		content.readCache(url, function (cached) {
			if (cached) {
				render(cached, true);
				return;
			}

			content.aiXhr = $.ajax({
				url: API_BASE + '/api/summarize',
				method: 'GET',
				data: { url: url, title: title, session: session.token },
				dataType: 'json',
				timeout: 60000
			})
				.done(function (response) {
					content.aiXhr = null;
					render(response, !!response.cached);
					if (response.usage) {
						storage.set({ aiUsage: response.usage });
					}
					if (!response.cached) {
						content.writeCache(url, response);
					}
				})
				.fail(function (xhr) {
					content.aiXhr = null;
					if (xhr && xhr.statusText === 'abort') {
						return;
					}

					var message = 'The AI could not read this article. Try again in a moment.';
					if (xhr && xhr.status === 401) {
						message = 'Sign in again from the extension popup to use AI.';
					} else if (xhr && xhr.status === 429) {
						message = 'Daily AI limit reached. Try again tomorrow.';
					}

					// Accounts created before session tokens existed have an email but
					// no token: trade it for one and retry exactly once.
					if (xhr && xhr.status === 401 && !retried) {
						try {
							chrome.runtime.sendMessage({ type: 'refresh-session' }, function (response) {
								if (!response || !response.token) {
									$text.removeClass('clickbait-ai-loading').text(message);
									return;
								}
								session.token = response.token;
								content.showAiSummary(url, title, offset, true);
							});
							return;
						} catch (error) {
							orphan();
						}
					}

					$text.removeClass('clickbait-ai-loading').text(message);
				});
		});
	},
	weekKey: function () {
		var now = new Date();
		var first = new Date(now.getFullYear(), 0, 1);
		var days = Math.floor((now - first) / 86400000);
		return now.getFullYear() + '-W' + Math.ceil((days + first.getDay() + 1) / 7);
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
					url: API_URL,
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

		content.recordFeedback(content.getPageDomain(), 'revealed');
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

		var aiScore = $(link).attr('data-cb-score');
		var aiReason = $(link).attr('data-cb-reason');
		if (aiScore) {
			$('.clickbait-blocker-chrome-extension-reveal-original-wrapper').append(
				$('<div class="clickbait-why"></div>')
					.text('AI score ' + aiScore + '/100' + (aiReason ? ': ' + aiReason : ''))
			);
		}

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
				url: API_URL,
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
						url: API_URL,
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

		(response || []).forEach(function(value) {
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

		storage.get('stats', function (data) {
			var stats = (data && data.stats) || {};
			var week = content.weekKey();

			if (stats.weekKey !== week) {
				stats = { hidden: 0, previews: 0, weekKey: week };
			}

			stats.hidden = (stats.hidden || 0) + 1;
			storage.set({ stats: stats });
		});

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
		var url = options.url || API_URL,
			method = options.method || 'GET',
			data = options.data || {};

		// No endpoint configured: every feature works off chrome.storage.local.
		if (!url) {
			callback && callback(null);
			return;
		}

		$.ajax({
			url: url,
			method: method,
			data: data,
			success: function (response) {
				callback && callback(response);
			},
			error: function () {
				// Votes survive a flaky network: the worker retries them once a minute.
				if (method === 'POST' && data && data.clickBaitLink) {
					try {
						chrome.runtime.sendMessage({ type: 'queue-vote', vote: data });
					} catch (error) {
						orphan();
					}
				}
				callback && callback(null);
			}
		});
	},
	checkIfUrl = function (url) {
		return !(url.length === 1 || url.indexOf('javascript:') >= 0);
	};

$(function () {

	setIconUrls();
	content.addPredefinedListToWhitelist();
	content.applyHeuristics();

	// Listing pages often render links after load.
	setTimeout(function () {
		content.applyHeuristics();
	}, 4000);

	syncSession(function () {
		if (!session.email || !session.aiEnabled) {
			return;
		}

		// Repaint what was scored on the previous visit, then refresh if stale.
		content.applyCachedScan();
		content.applyCachedSummaries();

		var key = 'lastScan:' + window.location.href;
		storage.get([key], function (data) {
			if (Date.now() - (data[key] || 0) < 30 * 60 * 1000) {
				return;
			}

			setTimeout(function () {
				content.scanPage();
			}, 1500);
		});
	});

	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		if (request.action === 'scan_page') {
			content.scanPage(function (result) {
				sendResponse(result);
			});
			return true;
		}

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
		if (!$(e.target).parents('.clickbait-ai-wrapper').length) {
			content.removeAiSummary();
		}
	});

	$('body').on('click', '.clickbait-ai-js', function (e) {
		e.stopPropagation();
		var button = $(this),
			offset = button.offset();
		content.removeMarkAsClickbaitPopover();
		content.showAiSummary(button.attr('data-url'), button.attr('data-title'), offset);
	});

	$('body').on('click', '.clickbait-ai-close', function (e) {
		e.stopPropagation();
		content.removeAiSummary();
	});

	// Injected controls are focusable, so Enter and Space must work too.
	$('body').on('keydown', '.clickbait-ai-js, .clickbait-ai-close, .clickbait-blocker-chrome-extension-buttons-wrapper, .clickbait-blocker-chrome-extension-mark, .clickbait-confirm, .clickbait-infirm', function (e) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			$(this).trigger('click');
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

			content.toast('Marked as clickbait');
			content.recordFeedback(content.getPageDomain(), 'accepted');

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

			content.toast('Marked as clickbait');
			content.recordFeedback(content.getPageDomain(), 'accepted');
		});
	});

	$('body').on('click', '.clickbait-infirm-js', function (e) {
		var _this = this;
		$('.clickbait-blocker-chrome-extension-infirm').addClass('loading');
		content.infirmClickBait.call(_this, function(){
			var link = $(_this).parent().data('data-original-dom-link');
			link.removeClass('clickbait-blocker-chrome-extension marked-as-clickbait-revealed-js');
			content.removeConfirmInfirmPopover();
			content.toast('Vote removed');

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

})();
