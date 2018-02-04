const mqtt = require('mqtt')
const _ = require('lodash')
const logging = require('homeautomation-js-lib/logging.js')
const health = require('homeautomation-js-lib/health.js')
const repeat = require('repeat')
const request = require('request')

var loginToken = null
var mainSite = null

require('homeautomation-js-lib/mqtt_helpers.js')

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

// Setup MQTT
const client = mqtt.setupClient(connectedEvent, disconnectedEvent)


client.on('message', (topic, message) => {
    if ( _.isNil(loginToken)) return
    if ( _.isNil(mainSite)) return

    logging.info(' ' + topic + ':' + message)
    var options = { authToken: loginToken, siteID: mainSite }

    if ( topic.toString().includes(reserveTopicSuffix)) {
        tjs.setSiteReservePercent(options, Number(message), function(setReserveError, siteReserveResult) {
            if ( !_.isNil(setReserveError)) {
                logging.error(JSON.stringify(setReserveError))
            }
            logging.debug('siteReserveResult: ' + JSON.stringify(siteReserveResult))

        })

    } else if ( topic.toString().includes(modeTopicSuffix)) {
        tjs.setSiteMode(options, message.toString(), function(setSiteModeError, siteModeResult) {
            if ( !_.isNil(setSiteModeError)) {
                logging.error(JSON.stringify(setSiteModeError))
            }
            logging.debug('siteModeResult: ' + JSON.stringify(siteModeResult))
        })
                        
    }
})

var tjs = require('teslajs')
 
var username = process.env.TESLA_USERNAME
var password = process.env.TESLA_PASSWORD

var polling = false
const startPolling = function() {
    if ( polling )
        return
    
    repeat(doPoll).every(5, 's').start.in(5, 'sec')
}

function pollSiteInfo() {
    if ( _.isNil(loginToken)) return
    if ( _.isNil(mainSite)) return
    
    logging.info('Polling site info')

    var options = { authToken: loginToken, siteID: mainSite }
    
    tjs.siteInfo(options, function(siteInfoError, siteInfo) {
        if ( !_.isNil(siteInfoError)) {
            logging.error(JSON.stringify(siteInfoError))
            health.unhealthyEvent()
            return
        }
        
        logging.debug('siteInfo: ' + JSON.stringify(siteInfo))
        if ( !_.isNil(siteInfo) ) {
            const backup_reserve_percent = siteInfo.backup_reserve_percent
            const default_real_mode = siteInfo.default_real_mode
            const solar = siteInfo.components.solar
            const grid = siteInfo.components.grid
            const battery = siteInfo.components.battery
            const batteryCount = siteInfo.battery_count
            const version = siteInfo.version
            
            logging.info('=   Solar: ' + solar)
            logging.info('=   Grid: ' + grid)
            logging.info('=   Battery: ' + battery)
            logging.info('=   Battery Count: ' + batteryCount)
            logging.info('=   Version: ' + version)
            logging.info('=   Current Battery Mode: ' + default_real_mode)
            logging.info('=   Current Battery Reserve %: ' + backup_reserve_percent)

            client.smartPublish(topic_prefix + '/reserve/mode', default_real_mode.toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/reserve/percent', backup_reserve_percent.toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/system/version', version.toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/system/battery_count', batteryCount.toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/system/has_batteries', battery.toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/system/has_solar', solar.toString(), mqttOptions)
            client.smartPublish(topic_prefix + '/system/has_grid', grid.toString(), mqttOptions)

            health.healthyEvent()
        }
    })
}

function pollLiveStatus() {
    if ( _.isNil(loginToken)) return
    if ( _.isNil(mainSite)) return
    
    logging.info('Polling live status')

    var options = { authToken: loginToken, siteID: mainSite }

    tjs.siteStatus(options, function(siteStatusError, siteStatus) {
        if ( !_.isNil(siteStatusError)) {
            logging.error(JSON.stringify(siteStatusError))
            health.unhealthyEvent()
            return
        }

        logging.debug('siteStatus: ' + JSON.stringify(siteStatus))
        const solar_power = siteStatus.solar_power
        const grid_status = siteStatus.grid_status
        const grid_power = siteStatus.grid_power
        const battery_power = siteStatus.battery_power
        const energy_left = siteStatus.energy_left
        const total_pack_energy = siteStatus.total_pack_energy
        const load_power = siteStatus.load_power
        logging.info('=   Solar Generation: ' + solar_power)
        logging.info('=   Grid Usage: ' + grid_power)
        logging.info('=   Battery Usage: ' + battery_power)
        logging.info('=   Total Home Load: ' + load_power)

        logging.info('=   Grid Status: ' + grid_status)
        logging.info('=   Total Battery Capacity: ' + total_pack_energy)
        logging.info('=   Battery Remaining: ' + energy_left)
        logging.info('=   Battery %: ' + ((energy_left / total_pack_energy) * 100))
        
        client.smartPublish(topic_prefix + '/stats/solar_generation', solar_power.toFixed(2).toString(), mqttOptions)
        client.smartPublish(topic_prefix + '/stats/grid_usage', grid_power.toFixed(2).toString(), mqttOptions)
        client.smartPublish(topic_prefix + '/stats/battery_usage', battery_power.toFixed(2).toString(), mqttOptions)
        client.smartPublish(topic_prefix + '/stats/home_load', load_power.toFixed(2).toString(), mqttOptions)
        client.smartPublish(topic_prefix + '/stats/grid_active', grid_status.toString(), mqttOptions)
        client.smartPublish(topic_prefix + '/reserve/battery/percent', ((energy_left / total_pack_energy) * 100).toFixed(1).toString(), mqttOptions)
        client.smartPublish(topic_prefix + '/reserve/battery/remaining', energy_left.toFixed(0).toString(), mqttOptions)
        client.smartPublish(topic_prefix + '/reserve/battery/capacity', total_pack_energy.toString(), mqttOptions)
        client.smartPublish(topic_prefix + '/reserve/battery/charging', (battery_power < 0) ? '1': '0', mqttOptions)
        client.smartPublish(topic_prefix + '/reserve/battery/discharging', (battery_power > 0) ? '1': '0', mqttOptions)

        health.healthyEvent()
    })
}

function doPoll() {
    if ( _.isNil(loginToken)) return
    if ( _.isNil(mainSite)) return

    pollLiveStatus()
    pollSiteInfo()
}

const handleLogin = function(token) {
    var options = { authToken: token }

    tjs.products(options, function(err, products) {
        if ( !_.isNil(err)) {
            logging.error(JSON.stringify(err))
        }
        logging.debug('products: ' + JSON.stringify(products))
        if ( _.isNil(products)) {
            logging.error('empty products!')
            return
        }
        const energy_site_id = products.energy_site_id
        const site_name = products.site_name
        const gateway_id = products.gateway_id

        mainSite = energy_site_id
        loginToken = token

        logging.info('===========================')
        logging.info('=  ' + site_name)
        logging.info('=  ')
        logging.info('=  Site ID: ' + energy_site_id)
        logging.info('=  Gateway ID: ' + gateway_id)
        
        startPolling()
    })
}

function doLogin() {
    tjs.login(username, password, function(err, result) {
        if (result.error) {
            logging.error(JSON.stringify(result.error))
            process.exit(1)
        }

        var token = JSON.stringify(result.authToken).toString().replace(/"/gi,'')
        logging.debug('auth response: ' + JSON.stringify(result))
        
        if (token) {
            logging.info('Login Succesful - token: ' + token)
            handleLogin(token)
        } else {
            logging.error('no token responded with')
        }
    })
}


doLogin()