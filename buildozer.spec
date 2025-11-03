[app]
title = Voyagr
package.name = voyagr
package.domain = org.voyagr

source.dir = .
source.include_exts = py,png,jpg,kv,atlas,db,ppn

version = 1.0.0

requirements = python3,kivy,requests,python-dotenv

orientation = portrait
fullscreen = 0
android.permissions = ACCESS_FINE_LOCATION,RECORD_AUDIO,INTERNET,VIBRATE,ACCESS_COARSE_LOCATION
android.api = 31
android.minapi = 21
android.ndk = 25b
android.accept_sdk_license = True
android.gradle_dependencies =

p4a.bootstrap = sdl2
p4a.source_dir =

[buildozer]
log_level = 2
warn_on_root = 1

