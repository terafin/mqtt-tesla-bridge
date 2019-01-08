const _ = require('lodash')
const request = require('request')
const logging = require('homeautomation-js-lib/logging.js')
const repeat = require('repeat')
const EventEmitter = require('events')

const gatewayIP = process.env.CONTROLLER_IP
const serialNumber = process.env.CONTROLLER_SERIAL_NUMBER

var reservePercent = 20

if (_.isNil(gatewayIP)) {
	logging.warn('CONTROLLER_IP not set, not starting')
	process.abort()
}

if (_.isNil(serialNumber)) {
	logging.warn('CONTROLLER_SERIAL_NUMBER not set, not starting')
	process.abort()
}

// Public

module.exports = new EventEmitter()

module.exports.startPolling = function() {    
	logging.info('starting poll')
	repeat(doPoll).every(5, 's').start.in(2, 'sec')
	repeat(authenticate).every(30, 'm').start.in(10, 'sec')
}

// Private

const doPoll = function() {
	doQuery()
}

var authToken = null

const powerwallURL = function(path) {
	return 'https://' + gatewayIP + '/' + path
}

const authenticate = function(callback) {
	const formData = {
		force_sm_off: true,
		email: '',
		password: 'S' + serialNumber,
		username: 'installer',
	}
    
	const body = JSON.stringify(formData)
	logging.debug('auth body: ' + body)

	request.post({url:powerwallURL('api/login/Basic'), 
		body: body,   
		headers: 
            {'Content-Type' : 'application/json'},
	}, 
	function(err, httpResponse, body) {
		const responseJSON = JSON.parse(body)
		logging.debug(' body: ' + body)
		logging.debug(' responseJSON: ' + JSON.stringify(responseJSON))
		if ( _.isNil(err) ) {
			authToken = responseJSON.token
			logging.info(' auth token: ' + authToken)
		} else {
			logging.error('error authenticate response body: ' + JSON.stringify(responseJSON))                
		}
		doGet(true, 'api/sitemaster/run', callback)
	}
	)
}

const doGet = function(authenticate, url, callback) {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
	logging.debug('   * doGet: ' + url)

	if ( authenticate ) {
		logging.debug('  authToken: ' + authToken)
		request.get({url: powerwallURL(url), json:true}, 
			function(err, httpResponse, responseBody) {
				if ( !_.isNil(err)) {
					logging.error('  url  get err: ' + err)
					logging.error('  httpresponse: ' + JSON.stringify(httpResponse))
					logging.error('          body: ' + JSON.stringify(responseBody))
				}
				logging.debug(' url: ' + url)
				logging.debug(' url  httpresponse: ' + JSON.stringify(httpResponse))
				logging.debug('          body: ' + JSON.stringify(responseBody))
				if ( !_.isNil(callback) ) {
					return callback(err, httpResponse, responseBody)
				}
			}).auth(null, null, true, authToken)
	} else {
		request.get({url: powerwallURL(url), json:true}, 
			function(err, httpResponse, responseBody) {
				if ( !_.isNil(err)) {
					logging.error('       get err: ' + err)
					logging.error('  httpresponse: ' + JSON.stringify(httpResponse))
					logging.error('          body: ' + JSON.stringify(responseBody))
				}
				logging.debug(' url: ' + url)
				logging.debug(' url  httpresponse: ' + JSON.stringify(httpResponse))
				logging.debug('          body: ' + JSON.stringify(responseBody))
				if ( !_.isNil(callback) ) {
					return callback(err, httpResponse, responseBody)
				}
			})
	}
}

const doCommit = function() {
	logging.debug('sending commit')
	doGet(true, 'api/config/completed', function(err, httpResponse, responseBody){
		logging.info('commit response body: ' + JSON.stringify(responseBody))
	})
}
const doQuery = function() {
	doGet(false, 'api/system_status/soe', function(err, httpResponse, response){
		logging.debug('soe response body: ' + JSON.stringify(response))
		logging.debug('soe httpResponse: ' + JSON.stringify(httpResponse))
		if ( _.isNil(err) && !_.isNil(response) ) {
			module.exports.emit('soe-updated', Number(response.percentage))
		}
	})

	doGet(false, 'api/meters/aggregates', function(err, httpResponse, response){
		logging.debug('aggregate response body: ' + JSON.stringify(response))
		// const default_real_mode = siteInfo.default_real_mode
        
		if ( _.isNil(err) && !_.isNil(response) ) {
			const solar_power = !_.isNil(response.solar) ? response.solar.instant_power : 0
			const grid_power = !_.isNil(response.site) ? response.site.instant_power : 0 
			const battery_power = !_.isNil(response.battery) ? response.battery.instant_power : 0
			const load_power = !_.isNil(response.load) ? response.load.instant_power : 0

			module.exports.emit('solar-updated', Number(solar_power))
			module.exports.emit('grid-updated', Number(grid_power))
			module.exports.emit('battery-updated', Number(battery_power))
			module.exports.emit('load-updated', Number(load_power))
		}
	})
}

module.exports.setMode = function(batteryMode) {
	if ( _.isNil(authToken) )  {
		logging.error('cannot set mode, not authenticated')
		return
	}

	if ( batteryMode == 'reserve' ) {
		batteryMode = 'backup'
	}

	const formData = {
		'mode': '' + batteryMode,
		'real_mode': '' + batteryMode,
		'backup_reserve_percent': reservePercent
	}
    
	const url = powerwallURL('api/operation')

	logging.info(' posting: ' + JSON.stringify(formData))
	request.post(
		{ 
			url: url, 
			body: JSON.stringify(formData),   
			headers: {
				'Content-Type' : 'application/json'
			},
		}, function(err, httpResponse, responseBody) { 
			logging.info('setMode response body: ' + responseBody)

			if ( !_.isNil(responseBody) && responseBody.code == 401 ) {
				authenticate(function() {
					module.exports.setMode(batteryMode)
				})
			} else {
				doCommit()
			}
		}
	).auth(null, null, true, authToken)
}

module.exports.setReservePercent = function(percent) {
	if ( _.isNil(authToken) )  {
		logging.error('cannot set mode, not authenticated')
		return
	}
    
	reservePercent = percent
    
	const formData = {
		'mode': 'self_consumption',
		'real_mode': 'self_consumption',
		'backup_reserve_percent': Number(percent)
	}
    
	const url = powerwallURL('api/operation')

	logging.debug(' posting: ' + JSON.stringify(formData))
	request.post(
		{ 
			url: url, 
			body: JSON.stringify(formData),   
			headers: {
				'Content-Type' : 'application/json'
			},
		}, function(err, httpResponse, responseBody) { 
			logging.info('set reserve percent response body: ' + responseBody)

			if ( !_.isNil(responseBody) && responseBody.code == 401 ) {
				authenticate(function() {
					module.exports.setReservePercent(percent)
				})
			} else {
				doCommit()
			}
		}
	).auth(null, null, true, authToken)
}

