const _ = require('lodash')
const request = require('request')
const logging = require('homeautomation-js-lib/logging.js')
const repeat = require('repeat')
const EventEmitter = require('events')

const gatewayIP = process.env.CONTROLLER_IP
const serialNumber = process.env.CONTROLLER_SERIAL_NUMBER

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
    repeat(authenticate).every(6, 'hours').start.in(10, 'sec')
}

// Private

function doPoll() {
    doQuery()
}

var authToken = null

function powerwallURL(path) {
    return 'http://' + gatewayIP + '/' + path
}

function authenticate() {
    const formData = {
        force_sm_off: false,
        password: 'S' + serialNumber,
        username: '',
    }
    
    const body = JSON.stringify(formData)
    logging.info('auth body: ' + body)

    request.post({url:powerwallURL('api/login/Basic'), 
        body: body,   
        headers: 
            {
                'Content-Type' : 'application/json'
            },
        }, 
        function(err,httpResponse,body){ 
            const responseJSON = JSON.parse(body)
            if ( _.isNil(err) ) {
                authToken = responseJSON.token
                logging.info(' auth token: ' + authToken)
            } else {
                logging.error('error authenticate response body: ' + JSON.stringify(responseJSON))                
            }
            doGet(false, 'api/sitemaster/run')
        }
    )
}

function doGet(authenticate, url, callback) {
    if ( authenticate ) {
        request.get({url: powerwallURL(url), json:true}, 
            function(err,httpResponse,responseBody) {
                if ( !_.isNil(callback) ) {
                    callback(err, httpResponse, responseBody)
                }
        }).auth(null, null, true, authToken)
    } else {
        request.get({url: powerwallURL(url), json:true}, 
            function(err,httpResponse,responseBody) {
                if ( !_.isNil(err)) {
                    logging.info('       get err: ' + err)
                    logging.info('  httpresponse: ' + httpResponse)
                    logging.info('          body: ' + responseBody)    
                }
                if ( !_.isNil(callback) ) {
                    callback(err, httpResponse, responseBody)
                }
        })
    }
}

function doCommit() {
    doGet(true, 'api/config/completed', function(err,httpResponse,responseBody){
        logging.info('commit response body: ' + JSON.stringify(responseBody))

    })
}
function doQuery() {
    doGet(false, 'api/system_status/soe', function(err,httpResponse,response){
        logging.info('soe response body: ' + JSON.stringify(response))
        if ( _.isNil(err) && !_.isNil(response) ) {
            module.exports.emit('soe-updated', Number(response.percentage))
        }
    })

    doGet(false, 'api/meters/aggregates', function(err,httpResponse,response){
        logging.info('aggregate response body: ' + JSON.stringify(response))
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
    const formData = {
        'mode': '' + batteryMode,
        'backup_reserve_percent': 70
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
        }, function(err,httpResponse,responseBody) { 
            logging.info('response body: ' + responseBody)
            doCommit()
        }
    ).auth(null, null, true, authToken)
}

module.exports.setReservePercent = function(percent) {
    if ( _.isNil(authToken) )  {
        logging.error('cannot set mode, not authenticated')
        return
    }
    const formData = {
        'mode': 'self_consumption',
        'backup_reserve_percent': Number(percent)
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
        }, function(err,httpResponse,responseBody) { 
            logging.info('response body: ' + responseBody)
            doCommit()
        }
    ).auth(null, null, true, authToken)
}

