# mqtt-tesla-bridge
mqtt-tesla-bridge


# Required environment variables

MQTT_HOST: "mqtt://your-mqtt.server.here"
TESLA_USERNAME: <Your Tesla Email>
TESLA_PASSWORD: <Your Password>
TOPIC_PREFIX: "/tesla"


# Example Usage

docker run terafin/mqtt-tesla-bridge -e TOPIC_PREFIX="/tesla" -e TESLA_USERNAME="bob@joe.com" -e TESLA_PASSWORD="yourFancyPassword" -e MQTT_HOST="mqtt://mymqtt.local.address"

This will spin up a working tesla bridge, which current has the supported commands:

# Set the reserve % to 90%
mosquitto_pub -h 10.0.1.10 -t "/tesla/reserve/percent/set" -m "90" 

# Set the reserve mode to battery backup
mosquitto_pub -h 10.0.1.10 -t "/tesla/reserve/mode/set" -m "backup" 

# Set the reserve mode to using battery until above reserve %
mosquitto_pub -h 10.0.1.10 -t "/tesla/reserve/mode/set" -m "self_consumption" 

# MQTT results

Here's some sample (from my system) results after using the above setup:

/tesla/reserve/mode self_consumption
/tesla/reserve/percent 95
/tesla/system/version 1.10.2
/tesla/system/battery_count 3
/tesla/system/has_batteries true
/tesla/system/has_solar true
/tesla/system/has_grid true
/tesla/stats/solar_generation 400.07
/tesla/stats/grid_usage 753.72
/tesla/stats/battery_usage -400.00
/tesla/stats/home_load 753.79
/tesla/stats/grid_active Active
/tesla/reserve/battery/percent 80.6
/tesla/reserve/battery/remaining 33599
/tesla/reserve/battery/capacity 41675
/tesla/reserve/battery/charging 1
/tesla/reserve/battery/discharging 0


These will poll every 5 seconds.