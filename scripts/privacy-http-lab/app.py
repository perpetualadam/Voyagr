"""Test-only HTTP server using actual private blueprints and authentication.

The only substitutions select disposable SQLite storage; authentication, consent,
session lookup and ownership handlers are the application implementations.
"""
import logging
import os
import sqlite3

# Managed Docker hosts may inject proxies after --env-file processing. Clear
# them inside this fixture process as well; only private Docker HTTP is needed.
for proxy in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'):
    os.environ.pop(proxy, None)
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'

from flask import Flask
from voyagr.api.privacy import privacy_bp
from voyagr.api import trips, search
from dashcam_blueprint import init_dashcam_blueprint

logging.getLogger('werkzeug').disabled = True
app = Flask(__name__, static_folder=None)
database = '/tmp/privacy-fixtures.sqlite'
with sqlite3.connect(database) as connection:
    connection.executescript('''
      CREATE TABLE trips(id INTEGER PRIMARY KEY,user_id TEXT,start_lat REAL,start_lon REAL,
        start_address TEXT,end_lat REAL,end_lon REAL,end_address TEXT,distance_km REAL,
        duration_minutes REAL,fuel_cost REAL,toll_cost REAL,caz_cost REAL,routing_mode TEXT,timestamp TEXT);
      CREATE TABLE favorite_locations(id INTEGER PRIMARY KEY,user_id TEXT,name TEXT,address TEXT,
        lat REAL,lon REAL,category TEXT,timestamp TEXT);
      CREATE TABLE search_history(id INTEGER PRIMARY KEY,user_id TEXT,query TEXT,result_name TEXT,
        lat REAL,lon REAL,timestamp TEXT);
    ''')
for module in (trips, search):
    module.get_db_connection = lambda: sqlite3.connect(database)
    module.return_db_connection = lambda connection: connection.close()
for blueprint in (privacy_bp, trips.trips_bp, search.search_bp):
    app.register_blueprint(blueprint, url_prefix='/api')
init_dashcam_blueprint(app, db_path=database, storage_dir='/tmp/privacy-clips')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
