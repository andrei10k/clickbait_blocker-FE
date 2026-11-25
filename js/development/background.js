// Sign in and vote delivery live here: the popup closes as soon as Google's
// window takes focus, and a content script disappears on navigation.
var API_BASE = 'https://clickbaitblockerapi.gotskillz.tech';
var VOTE_QUEUE_KEY = 'pendingVotes';
var VOTE_QUEUE_LIMIT = 100;

function fromProfile(callback) {
	chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, function (info) {
		if (info && info.email) {
			callback(null, { email: info.email, accessToken: '' });
		} else {
			callback(new Error('Sign in to Chrome with a Google account first.'));
		}
	});
}

function profileFromToken(accessToken, callback) {
	fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
		headers: { Authorization: 'Bearer ' + accessToken }
	})
		.then(function (response) {
			return response.json();
		})
		.then(function (profile) {
			if (profile && profile.email) {
				callback(null, { email: profile.email, accessToken: accessToken });
			} else {
				fromProfile(callback);
			}
		})
		.catch(function () {
			fromProfile(callback);
		});
}

function getGoogleCredentials(interactive, callback) {
	var manifestOAuth = chrome.runtime.getManifest().oauth2;

	if (!manifestOAuth || !manifestOAuth.client_id) {
		if (!interactive) {
			callback(new Error('no token'));
			return;
		}
		fromProfile(callback);
		return;
	}

	chrome.identity.getAuthToken({ interactive: interactive }, function (token) {
		if (chrome.runtime.lastError || !token) {
			if (!interactive) {
				callback(new Error('no token'));
				return;
			}
			fromProfile(callback);
			return;
		}
		profileFromToken(token, callback);
	});
}

function registerUser(credentials, callback) {
	var body = new URLSearchParams();
	if (credentials.accessToken) {
		body.set('accessToken', credentials.accessToken);
	} else {
		body.set('email', credentials.email);
	}

	fetch(API_BASE + '/api/user', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString()
	})
		.then(function (response) {
			if (!response.ok) {
				throw new Error('rejected');
			}
			return response.json();
		})
		.then(function (user) {
			var stored = {
				email: user.email || credentials.email,
				userId: user._id || '',
				token: user.token || '',
				aiUsage: user.usage || null
			};
			chrome.storage.local.set(stored, function () {
				callback(null, stored);
			});
		})
		.catch(function () {
			callback(new Error('Signed in, but the server could not be reached.'));
		});
}

function signIn(interactive, callback) {
	getGoogleCredentials(interactive, function (error, credentials) {
		if (error) {
			callback({ error: error.message });
			return;
		}

		registerUser(credentials, function (registerError, stored) {
			if (registerError) {
				callback({ error: registerError.message });
				return;
			}
			callback({ email: stored.email, token: stored.token, usage: stored.aiUsage });
		});
	});
}

function readQueue(callback) {
	chrome.storage.local.get([VOTE_QUEUE_KEY], function (data) {
		callback(Array.isArray(data[VOTE_QUEUE_KEY]) ? data[VOTE_QUEUE_KEY] : []);
	});
}

function sendVote(vote) {
	return fetch(API_BASE + '/api/clickbait', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(vote).toString()
	}).then(function (response) {
		if (!response.ok) {
			throw new Error('vote failed');
		}
		return true;
	});
}

function queueVote(vote, callback) {
	readQueue(function (queue) {
		if (queue.length >= VOTE_QUEUE_LIMIT) {
			queue.shift();
		}
		queue.push(vote);

		var stored = {};
		stored[VOTE_QUEUE_KEY] = queue;
		chrome.storage.local.set(stored, function () {
			callback && callback({ queued: true, pending: queue.length });
		});
	});
}

// Failed votes wait here and are replayed once a minute.
function flushVotes() {
	readQueue(function (queue) {
		if (queue.length === 0) {
			return;
		}

		var remaining = [];
		var index = 0;

		function next() {
			if (index >= queue.length) {
				var stored = {};
				stored[VOTE_QUEUE_KEY] = remaining;
				chrome.storage.local.set(stored);
				return;
			}

			sendVote(queue[index])
				.catch(function () {
					remaining.push(queue[index]);
				})
				.then(function () {
					index += 1;
					next();
				});
		}

		next();
	});
}

chrome.alarms.create('flush-votes', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(function (alarm) {
	if (alarm.name === 'flush-votes') {
		flushVotes();
	}
});

chrome.runtime.onStartup.addListener(flushVotes);

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
	if (!message) {
		return;
	}

	if (message.type === 'sign-in') {
		signIn(true, sendResponse);
		return true;
	}

	// Used when the popup reopens after being closed by Google's window.
	if (message.type === 'resume') {
		signIn(false, sendResponse);
		return true;
	}

	if (message.type === 'refresh-session') {
		chrome.storage.local.get(['email'], function (data) {
			if (!data.email) {
				sendResponse({ error: 'no email' });
				return;
			}

			// Accounts created before session tokens existed have an email only.
			registerUser({ email: data.email, accessToken: '' }, function (error, stored) {
				sendResponse(error ? { error: error.message } : { email: stored.email, token: stored.token });
			});
		});
		return true;
	}

	if (message.type === 'sign-out') {
		chrome.storage.local.remove(['email', 'userId', 'token', 'aiUsage'], function () {
			chrome.identity.clearAllCachedAuthTokens(function () {
				sendResponse({ done: true });
			});
		});
		return true;
	}

	if (message.type === 'queue-vote') {
		queueVote(message.vote, sendResponse);
		return true;
	}

	if (message.type === 'flush-votes') {
		flushVotes();
		sendResponse({ done: true });
		return true;
	}
});
