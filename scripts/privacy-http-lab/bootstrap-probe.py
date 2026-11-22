"""Disposable immutable-asset stress probe; not privacy/auth/navigation acceptance."""
import argparse,os,signal,subprocess,tempfile,threading
from pathlib import Path
from flask import Flask,Response,render_template,jsonify
from werkzeug.serving import make_server,WSGIRequestHandler
from voyagr.asset_release import prepare_html,read_asset
from voyagr.index_page_context import build_index_template_kwargs
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tabs',type=int,default=20)
parser.add_argument('--block-worker',action='store_true',help='Diagnostic comparison only; not an acceptance result')
args=parser.parse_args()
if not 1<=args.tabs<=30:parser.error('tabs must be between 1 and 30')
with tempfile.TemporaryDirectory(prefix='voyagr-bootstrap-probe-') as folder:
 app=Flask(__name__,template_folder=str(root/'templates'))
 with app.test_request_context('/'):
  html=render_template('index.html',**build_index_template_kwargs())
 html,version=prepare_html(html,root,Path(folder))
 @app.get('/')
 def index(): return Response(html,mimetype='text/html',headers={'Cache-Control':'no-store'})
 @app.get('/_voyagr/assets/<release>/<digest>/<name>')
 def asset(release,digest,name):
  body=read_asset(Path(folder),release,digest,name)
  return Response(body or b'',status=200 if body else 404,mimetype='application/javascript' if name.endswith('.js') else 'text/css',headers={'Cache-Control':'public,max-age=31536000,immutable'})
 @app.get('/service-worker.js')
 def worker():
  return Response((root/'service-worker.js').read_bytes(),mimetype='application/javascript')
 @app.route('/<path:name>',methods=['GET','POST'])
 def stub(name):
  if name=='api/config':return jsonify(personal_mode=False,supabase_url='',supabase_anon_key='')
  if name.endswith('.json'):return jsonify(version=8,sources={},layers=[])
  return jsonify(success=False,error='Isolated bootstrap probe'),503
 class Quiet(WSGIRequestHandler):
  def log(self,*args):pass
 server=make_server('127.0.0.1',0,app,threaded=True,request_handler=Quiet)
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 try:
  env=dict(os.environ,PROBE_TABS=str(args.tabs),BLOCK_WORKER='1' if args.block_worker else '')
  process=subprocess.Popen(['node',str(Path(__file__).with_suffix('.cjs')),f'http://127.0.0.1:{server.server_port}'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True,env=env)
  try:output,errors=process.communicate(timeout=240)
  except subprocess.TimeoutExpired:
   os.killpg(process.pid,signal.SIGKILL);process.communicate();raise RuntimeError('Isolated bootstrap probe exceeded its budget')
  print(output[-6000:]);print(errors[-1000:]);raise SystemExit(process.returncode)
 finally:server.shutdown();thread.join()
