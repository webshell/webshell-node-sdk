var util = require("util");
var events = require("events");
var http = require('http');
var querystring = require('querystring');

function Webshell() {
	events.EventEmitter.call(this);
	this._baseUrl = 'api.webshell.io';
	this._apiKey = '';
	this._secretKey = '';
	this._csid = '';
	this._domain = '';
}

util.inherits(Webshell, events.EventEmitter);

Webshell.prototype.init = function(options) {
	this._apiKey = options.key || this._apiKey;
	this._secretKey = options.secret || this._secretKey;
	this._csid = options.csid || this._csid;
	this._domain = options.domain || this._domain;
	return this;
}

Webshell.prototype.exec = function(options) {
	var self = this;

	if ( ! self._apiKey) {
		self.emit('error', 'You must set parameter "key"');
		return;
	}

	if ( typeof options == 'string') {
		if (options[0] == '#')
			options = { 'hash': options.substr(1) };
		else
			options = { 'code': options };
	}

	if ( ! options.code && ! options.hash) {
		self.emit('error', 'You must set parameter "code" or "hash"');
		return;
	}

	var domain = options.domain || self._domain;
	if ( ! domain) {
		self.emit('error', 'You must set parameter "domain"');
		return;
	}

	// guess client session id
	var csid = options.csid || self._csid || options.session && options.session._wsh_csid || '';

	// make request
	params = {};
	if (options.hash)
		params.hash = options.hash;
	else
		params.code = options.code;
	params.key = self._apiKey;
	if (self._secretKey)
		params.secret = self._secretKey;
	if (csid)
		params.csid = csid;
	if (options.version)
		params.version = options.version;
	params.min = 'false';

	// execute request
	var reqoptions = {
		host: self._baseUrl,
		path: '/?' + querystring.stringify(params),
		headers: { 'Referer': 'http://' + domain }
	};
	var req = http.request(reqoptions, function(res) {
		content = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) { content += chunk });
		res.on('error', function(err) {
			self.emit('error', err)
		});
		res.on('end', function() {
			if ( ! content)
				return;
			try {
				data = JSON.parse(content);
			}
			catch (e) {
				self.emit('error', e.message)
				return
			}
			var res, meta, lastval;
			for (var i in data) {
				var value = data[i];
				if (typeof value == 'object' && value != null && value._meta) {
					res = value.data;
					meta = value._meta;
				} else {
					res = value;
					meta = null;
				}

				if (meta && meta.cookie_add) {
					self.emit('setSession', meta.cookie_add.sid);
					if (options.session)
						options.session._wsh_csid = meta.cookie_add.sid;
				} else {
					lastval = res
					self.emit('process', res, meta);
				}
			}
			self.emit('success', lastval);
		});
	});
	req.on('error', function(err) {
		self.emit('error', err);
	});
	req.end();
}

module.exports = new Webshell();