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

