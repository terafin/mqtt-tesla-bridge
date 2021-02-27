const _ = require('lodash')
const got = require('got')

const request = require('request')
const logging = require('homeautomation-js-lib/logging.js')
const interval = require('interval-promise')
const EventEmitter = require('events')

const gatewayIP = process.env.CONTROLLER_IP
const username = process.env.TESLA_USERNAME
const password = process.env.TESLA_PASSWORD
const serialNumber = process.env.CONTROLLER_SERIAL_NUMBER

var reservePercent = 20

if (_.isNil(gatewayIP)) {
    logging.warn('CONTROLLER_IP not set, not starting')
    process.abort()
}

if (_.isNil(username)) {
    logging.warn('TESLA_USERNAME not set, not starting')
    process.abort()
}

if (_.isNil(password)) {
    logging.warn('TESLA_PASSWORD not set, not starting')
    process.abort()
}

// Public

module.exports = new EventEmitter()

async function startPolling() {
    logging.info('starting poll')
    await authenticate()
    logging.info(' done auth')

    interval(async() => {
        doPoll()
    }, 5 * 1000)

    interval(async() => {
        logging.info(' Re-authenticating')
        authenticate()
    }, 10 * 60 * 1000)
}

module.exports.startPolling = startPolling
    // Private

const doPoll = function() {
    doQuery()
}

var lastAuthToken = null

const powerwallURL = function(path) {
    return 'https://' + gatewayIP + '/' + path
}

async function authenticateifNeeded() {
    if (!_.isNil(lastAuthToken)) {
        return lastAuthToken
    }

    var newToken = null

    try {
        newToken = await authenticate()
        lastAuthToken = newToken
    } catch (error) {
        logging.error(' failed authentication: ' + error)
        throw (error)
    }
    return newToken
}


async function authenticate(callback) {
    var accessToken = null

    const customerFormData = {
        force_sm_off: false,
        email: username,
        password: password,
        username: 'customer',
    }

    const installerFormData = {
        force_sm_off: true,
        email: '',
        password: 'S' + serialNumber,
        username: 'installer',
    }

    try {
        const response = await got.post(powerwallURL('api/login/Basic'), {
            form: customerFormData,
            https: {
                rejectUnauthorized: false
            }
        })

        const body = JSON.parse(response.body)
        const headers = response.headers

        accessToken = body.token
        lastAuthToken = accessToken

        logging.debug(' auth body: ' + JSON.stringify(body))
        logging.debug(' auth headers: ' + JSON.stringify(response.headers))
        logging.info(' Authenticated user: ' + process.env.TESLA_USERNAME + ' with token: ' + accessToken)

        doGet('api/sitemaster/run')
    } catch (error) {
        logging.error('authenticate failed: ' + error)
        throw ('authenticate error ' + error)
    }

    return accessToken
}

async function doGet(url) {
    await authenticateifNeeded()

    logging.info('   * doGet: ' + url)

    var responseBody = null

    try {
        const fullURL = powerwallURL(url)

        const response = await got.get(fullURL, {
            https: {
                rejectUnauthorized: false
            },
            headers: {
                cookie: ['AuthCookie=' + lastAuthToken],
            }
        })

        // check for empty strings
        if (response.body.length > 0)
            responseBody = JSON.parse(response.body)
        else
            responseBody = response.body

        if (!_.isNil(responseBody) && !_.isNil(responseBody.error)) {
            logging.error('get failed: ' + responseBody.error)
            throw ('doGet error ' + responseBody.error)
        }

        logging.debug(' url: ' + fullURL)
        logging.debug(' response: ' + JSON.stringify(responseBody))
    } catch (error) {
        logging.error('get failed: ' + error)
        throw ('doGet error ' + error)
    }

    return responseBody
}

async function doPost(url, body) {
    await authenticateifNeeded()

    logging.info('   * doPost: ' + url + ' form data: ' + JSON.stringify(body))

    var responseBody = null

    try {
        const fullURL = powerwallURL(url)

        const options = {
            json: body,
            https: {
                rejectUnauthorized: false
            },

            headers: {
                'Authorization': 'Bearer ' + lastAuthToken.toString(),
                cookie: ['AuthCookie=' + lastAuthToken]
            }
        }
        logging.info('options: ' + JSON.stringify(options))
        const response = await got.post(fullURL, options)

        // check for empty strings
        if (response.body.length > 0)
            responseBody = JSON.parse(response.body)
        else
            responseBody = response.body

        if (!_.isNil(responseBody) && !_.isNil(responseBody.error)) {
            logging.error('post failed: ' + responseBody.error)
            throw ('doPost error ' + responseBody.error)
        }

        logging.info(' url: ' + fullURL)
        logging.info(' response: ' + JSON.stringify(responseBody))
    } catch (error) {
        logging.error('post failed: ' + error)
        throw ('doPost error ' + error)
    }

    return responseBody
}

async function doCommit() {
    logging.info('sending commit')

    try {
        const response = await doGet('api/config/completed')
        logging.info('commit response body: ' + JSON.stringify(response))
    } catch (error) {
        logging.error('doCommit failed: ' + error)
    }
}

async function doQuery() {

    try {
        const response = await doGet('api/system_status/soe')
        logging.debug('soe response body: ' + JSON.stringify(response))

        if (!_.isNil(response)) {
            module.exports.emit('soe-updated', Number(response.percentage))
        }
    } catch (error) {
        logging.error('doCommit failed: ' + error)
    }

    try {
        const response = await doGet('api/meters/aggregates')
        logging.debug('aggregate response body: ' + JSON.stringify(response))

        const solar_power = !_.isNil(response.solar) ? response.solar.instant_power : 0
        const grid_power = !_.isNil(response.site) ? response.site.instant_power : 0
        const battery_power = !_.isNil(response.battery) ? response.battery.instant_power : 0
        const load_power = !_.isNil(response.load) ? response.load.instant_power : 0

        module.exports.emit('solar-updated', Number(solar_power))
        module.exports.emit('grid-updated', Number(grid_power))
        module.exports.emit('battery-updated', Number(battery_power))
        module.exports.emit('load-updated', Number(load_power))

    } catch (error) {
        logging.error('get aggregate response failed: ' + error)
    }
}

async function setMode(batteryMode) {
    await authenticateifNeeded()

    if (batteryMode == 'reserve') {
        batteryMode = 'backup'
    }

    const formData = {
        'mode': '' + batteryMode,
        'real_mode': '' + batteryMode,
        'backup_reserve_percent': batteryMode == 'backup' ? 100 : Number(reservePercent)
    }

    try {
        const response = await doPost('api/operation', formData)
        doCommit()

    } catch (error) {
        logging.error(' failed setMode: ' + error)
    }
}
module.exports.setMode = setMode

async function setReservePercent(percent) {
    await authenticateifNeeded()

    reservePercent = percent

    const formData = {
        'mode': 'self_consumption',
        'real_mode': 'self_consumption',
        'backup_reserve_percent': Number(percent)
    }

    try {
        const response = await doPost('api/operation', formData)
        doCommit()

    } catch (error) {
        logging.error(' failed setReservePercent: ' + error)
    }
}

module.exports.setReservePercent = setReservePercent