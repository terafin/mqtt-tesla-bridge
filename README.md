# mqtt-tesla-bridge

This is a simple docker container that I use to bridge to/from my MQTT bridge.

I have a collection of bridges, and the general format of these begins with these environment variables:

```yaml
      TOPIC_PREFIX: /your_topic_prefix  (eg: /some_topic_prefix/somthing)
      MQTT_HOST: YOUR_MQTT_URL (eg: mqtt://mqtt.yourdomain.net)
      (OPTIONAL) MQTT_USER: YOUR_MQTT_USERNAME
      (OPTIONAL) MQTT_PASS: YOUR_MQTT_PASSWORD
```

## Required environment variables

```yaml
MQTT_HOST: "mqtt://your-mqtt.server.here"
TESLA_USERNAME: <Your Tesla Email>
TESLA_PASSWORD: <Your Password>
TOPIC_PREFIX: "/tesla"
CONTROLLER_IP: <YOUR_TESLA_POWERWALL_CONTROLLER_IP>
```

## Example Simple Docker Usage

Note: I recommend using docker-compose (lower down in docs), this is just a good/simple way to quickly test it

```bash
docker run terafin/mqtt-tesla-bridge:latest -e TOPIC_PREFIX="/tesla" -e TESLA_USERNAME="bob@joe.com" -e TESLA_PASSWORD="yourFancyPassword" -e MQTT_HOST="mqtt://mymqtt.local.address" -e CONTROLLER_IP="YOUR_CONTROLLER_IP"
```

This will spin up a working tesla bridge, which current has the supported commands:

### Set the reserve % to 90%

```bash
mosquitto_pub -h your_mqtt_host -t "/tesla/reserve/percent/set" -m "90"
```

### Set the reserve mode to battery backup

```bash
mosquitto_pub -h your_mqtt_host -t "/tesla/reserve/mode/set" -m "backup"
```

### Set the reserve mode to using battery until above reserve %

```bash
mosquitto_pub -h your_mqtt_host -t "/tesla/reserve/mode/set" -m "self_consumption"
```

## Example Docker Compose

Here's an example docker compose
(my recommended way to use this):

```yaml
version: "3.4"
services:
    mqtt-tesla-bridge:
        image: terafin/mqtt-tesla-bridge:latest
        container_name: mqtt-tesla-bridge
        environment:
            LOGGING_NAME: mqtt-tesla-bridge
            TZ: America/Los_Angeles
            TOPIC_PREFIX: /tesla
            MQTT_HOST: mqtt://YOUR_MQTT_IP
            (OPTIONAL) MQTT_USER: MQTT_USERNAME
            (OPTIONAL) MQTT_PASS: MQTT_PASSWORD
            TESLA_USERNAME: YOUR_TESLA_USERNAME
            TESLA_PASSWORD: YOUR_TESLA_PASSWORD
            CONTROLLER_IP: LOCAL_CONTROLLER_IP
        logging:
            options:
                max-size: "10m"
                max-file: "5"
            driver: json-file
        tty: true
        restart: always
```

## MQTT output

Here's some sample (from my system) results after using the above setup:

```log
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
```

These will be polled/update every 5 seconds
