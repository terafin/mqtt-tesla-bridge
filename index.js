const mqtt = require('mqtt')
const _ = require('lodash')
const logging = require('homeautomation-js-lib/logging.js')
const health = require('homeautomation-js-lib/health.js')
const tesla = require('./lib/tesla.js')
const mqtt_helpers = require('homeautomation-js-lib/mqtt_helpers.js')

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

var client = null

const reserveTopicSuffix = '/reserve/percent/set'
const modeTopicSuffix = '/reserve/mode/set'

var connectedEvent = function() {
	logging.info('connected')
	health.healthyEvent()
	client.subscribe(topic_prefix + reserveTopicSuffix)
	client.subscribe(topic_prefix + modeTopicSuffix)
}

var disconnectedEvent = function() {
	logging.info('disconnected')
	health.unhealthyEvent()
}

// Setup MQTT
logging.info('connecting to MQTT host')
client = mqtt_helpers.setupClient(connectedEvent, disconnectedEvent)

client.on('message', (topic, message) => {
	logging.info(' ' + topic + ':' + message)

	if ( topic.toString().includes(reserveTopicSuffix)) {
		tesla.setReservePercent(message)                        
	} else if ( topic.toString().includes(modeTopicSuffix)) {
		tesla.setMode(message.toString())
	}
})

tesla.on('soe-updated', (result) => {
	if (_.isNil(result)) {
		logging.error(' soe-updated failed')
		health.unhealthyEvent()
		return
	}

	client.smartPublish(topic_prefix + '/reserve/battery/percent', '' + result.toFixed(2), mqttOptions)
	health.healthyEvent()
})

tesla.on('solar-updated', (result) => {
	if (_.isNil(result)) {
		logging.error(' soe-updated failed')
		health.unhealthyEvent()
		return
	}

	client.smartPublish(topic_prefix + '/stats/solar_generation', result.toFixed(2).toString(), mqttOptions)
	health.healthyEvent()
})

tesla.on('grid-updated', (result) => {
	if (_.isNil(result)) {
		logging.error(' grid-updated failed')
		health.unhealthyEvent()
		return
	}

	client.smartPublish(topic_prefix + '/stats/grid_usage', result.toFixed(2).toString(), mqttOptions)
	client.smartPublish(topic_prefix + '/stats/grid_active', '' + (result > 50 ? '1' : '0'), mqttOptions)
    
	health.healthyEvent()
})

tesla.on('battery-updated', (result) => {
	if (_.isNil(result)) {
		logging.error(' battery-updated failed')
		health.unhealthyEvent()
		return
	}

	client.smartPublish(topic_prefix + '/stats/battery_usage', result.toFixed(2).toString(), mqttOptions)
	health.healthyEvent()
})

tesla.on('load-updated', (result) => {
	if (_.isNil(result)) {
		logging.error(' load-updated failed')
		health.unhealthyEvent()
		return
	}

	client.smartPublish(topic_prefix + '/stats/home_load', result.toFixed(2).toString(), mqttOptions)
	health.healthyEvent()
})

tesla.startPolling()

// setTimeout(function(){
// 	// tesla.setReservePercent(50)
// 	tesla.setMode('self_consumption')
// 	// tesla.setMode('backup')
// 	// tesla.setMode('reserve')
// }, 14000)
