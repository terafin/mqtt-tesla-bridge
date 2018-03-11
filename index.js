const mqtt = require('mqtt')
const _ = require('lodash')
 const logging = require('homeautomation-js-lib/logging.js')
const health = require('homeautomation-js-lib/health.js')
const repeat = require('repeat')
const request = require('request')

require('homeautomation-js-lib/mqtt_helpers.js')

const gatewayIP = process.env.CONTROLLER_IP
const serialNumber = process.env.CONTROLLER_SERIAL_NUMBER

// Config
var topic_prefix = process.env.TOPIC_PREFIX

if (_.isNil(topic_prefix)) {
    logging.warn('TOPIC_PREFIX not set, not starting')
    process.abort()
}

var mqttOptions = {}

var shouldRetain = process.env.MQTT_RETAIN

if (_.isNil(shouldRetain)) {
    shouldRetain = false
}

if (!_.isNil(shouldRetain)) {
    mqttOptions['retain'] = shouldRetain
}

const reserveTopicSuffix = '/reserve/percent/set'
const modeTopicSuffix = '/reserve/mode/set'

var connectedEvent = function() {
    health.healthyEvent()
    client.subscribe(topic_prefix + reserveTopicSuffix)
    client.subscribe(topic_prefix + modeTopicSuffix)
}

var disconnectedEvent = function() {
    health.unhealthyEvent()
}

// Gateway Functions
ar authToken = null

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
        logging.debug('soe response body: ' + JSON.stringify(response))
        if ( _.isNil(err ) ) {
            const percent = response.percentage
            health.healthyEvent()

            client.smartPublish(topic_prefix + '/reserve/battery/percent', percent, mqttOptions)
        }
    })

    doGet(false, 'api/meters/aggregates', function(err,httpResponse,response){
        logging.debug('aggregate response body: ' + JSON.stringify(response))
        // const default_real_mode = siteInfo.default_real_mode
        
        if ( _.isNil(err ) ) {
            health.healthyEvent()
            const solar_power = response.solar.instant_power
            const grid_power = response.site.instant_power
            const battery_power = response.battery.instant_power
            const load_power = response.load.instant_power

            client.smartPublish(topic_prefix + '/stats/solar_generation', solar_power.toFixed(2).toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/stats/grid_usage', grid_power.toFixed(2).toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/stats/battery_usage', battery_power.toFixed(2).toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/stats/home_load', load_power.toFixed(2).toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/stats/grid_active', grid_power > 50, mqttOptions)
        }
    })
}

function setMode(batteryMode) {
    if ( _.isNil(authToken) )  {
        authenticate()
        logging.error('cannot set mode, not authenticated')
        return
    }
    const formData = {
        'mode': '' + batteryMode
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

function setReservePercent(percent) {
    if ( _.isNil(authToken) )  {
        authenticate()
        logging.error('cannot set mode, not authenticated')
        return
    }
    const formData = {
        'backup_reserve_percent': percent
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


// Setup MQTT
const client = mqtt.setupClient(connectedEvent, disconnectedEvent)

client.on('message', (topic, message) => {
    logging.info(' ' + topic + ':' + message)

    if ( topic.toString().includes(reserveTopicSuffix)) {
        setReservePercent(message)                        
    } else if ( topic.toString().includes(modeTopicSuffix)) {
        setMode(message.toString())
    }
})

var polling = false
const startPolling = function() {
    if ( polling )
        return
    
    repeat(doPoll).every(5, 's').start.in(5, 'sec')
}

function doPoll() {
    doQuery()
}

authenticate()
startPolling()