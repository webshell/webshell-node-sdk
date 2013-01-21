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

	// guess client session id
	var csid = options.csid || self._csid || options.session && options.session._wsh_csid || '';

	// construct request
	params = {};

	params.domain = options.domain || self._domain;
	if ( ! params.domain) {
		self.emit('error', 'You must set parameter "domain"');
		return;
	}

	if (options.hash)
		params.hash = options.hash;
	else if (options.code)
    {
        if (typeof options.code == 'string' && options.code.match(/^\#\![ \t]+[a-zA-Z_]+[ \t]*[\r\n]/))
            params.code = options.code
        else
        {
            if (typeof options.code == 'string')
                params.code = options.closure ? '(function() {' + options.code.trim() + "\n})();" : options.code.trim();
            else if (typeof options.code == 'function')
                params.code = '(' + options.code.toString().trim() + ')();';
            else
            {
            	self.emit('error', 'Bad type for parameter "code"');
            	return false;
            }
        }
    }
    else
    {
    	self.emit('error', 'You must provide code parameter');
    	return false;
    }
	params.key = options.key || self._apiKey || undefined;
	params.secret = options.secret || self._secretKey || undefined;
	if (csid)
		params.csid = csid;
	if (options.version)
		params.version = options.version;
	if (options.args)
		params.args = JSON.stringify(options.args);
	params.here = options.here || (params.code && params.code.indexOf('here()') >= 0);
	params.min = 'false';

	// execute request
	var reqoptions = {
		host: self._baseUrl,
		path: '/?' + querystring.stringify(params),
		headers: { 'Referer': 'http://' + params.domain }
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
				self.emit('error', e.message);
				return false;
			}
			var res, meta;
			if ( ! Array.isArray(data))
			{
				self.emit('error', 'Bad response from server');
				return false;
			}
			var resultval = data.shift();
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
					self.emit('process', res, meta);
				}
			}
			self.emit('success', resultval);
		});
	});
	req.on('error', function(err) {
		self.emit('error', err);
	});
	req.end();
	return this;
}

module.exports = new Webshell();