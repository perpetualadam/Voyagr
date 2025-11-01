[app]
title = Voyagr
package.name = voyagr
package.domain = org.voyagr

source.dir = .
source.include_exts = py,png,jpg,kv,atlas,db,ppn

version = 1.0.0

requirements = python3,kivy==2.3.0,kivy_garden.mapview==1.0.6,kivy-garden==0.1.4,pygame==2.5.2,plyer==2.1.0,pyttsx3==2.90,pyjnius==1.6.1,requests==2.31.0,geopandas==0.14.4,osmnx==1.9.3,protobuf==5.28.2,boto3==1.35.24,polyline==2.0.4,mercantile==1.2.1,py-boost-interprocess,pvporcupine,pyaudio,geopy

orientation = portrait
fullscreen = 0
android.permissions = ACCESS_FINE_LOCATION,RECORD_AUDIO,INTERNET,VIBRATE,ACCESS_COARSE_LOCATION
android.api = 31
android.minapi = 21
android.ndk = 25b
android.accept_sdk_license = True

[buildozer]
log_level = 2
warn_on_root = 1

