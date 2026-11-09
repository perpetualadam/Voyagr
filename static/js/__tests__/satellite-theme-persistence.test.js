const fs=require('node:fs'),path=require('node:path');
const Theme=require('../modules/ui/theme');
const html=fs.readFileSync(path.join(__dirname,'../../../templates/index.html'),'utf8');
const boot=html.match(/<script>\s*window\.VOYAGR_JOURNEY_PROTOCOL=1;([\s\S]*?)<\/script>/)[1];
let prefersDark,listener,mapTheme,setMap,Dark;
function bind(){
 Dark=require('../app/dark-mode-orchestration');
 Dark.bind({theme:()=>Theme,call:{getCurrentMapTheme:()=>mapTheme,setMapTheme:setMap,saveAllSettings:jest.fn(),showStatus:jest.fn()}});
 return Dark;
}
beforeEach(()=>{
 jest.resetModules();localStorage.clear();document.documentElement.className='';document.body.className='';
 prefersDark=false;listener=null;mapTheme='satellite';setMap=jest.fn(value=>{mapTheme=value;localStorage.setItem('mapTheme',value);});
 window.matchMedia=()=>({matches:prefersDark,addEventListener:(_event,callback)=>{listener=callback;}});
 jest.spyOn(console,'log').mockImplementation(()=>{});
});
afterEach(()=>{localStorage.clear();jest.restoreAllMocks();});
test.each(['light','dark','auto'].flatMap(ui=>[false,true].flatMap(system=>[false,true].map(link=>({ui,system,link})))))('boot and restoration keep Satellite for %j',({ui,system,link})=>{
 prefersDark=system;localStorage.setItem('ui_theme',ui);localStorage.setItem('mapTheme','satellite');localStorage.setItem('linkUiMapTheme',String(link));
 window.eval(boot);
 expect(localStorage.getItem('mapTheme')).toBe('satellite');
 expect(Theme.buildEarlyLinkedMapThemeBootPlan(ui,system,localStorage)).toEqual({shouldSet:false,mapTheme:'satellite'});
 bind().initializeDarkMode();Dark.applyTheme(ui);
 expect(mapTheme).toBe('satellite');expect(setMap).not.toHaveBeenCalled();expect(localStorage.getItem('ui_theme')).toBe(ui);
 expect(document.body.classList.contains('dark-mode')).toBe(Theme.shouldUseDarkMode(ui,system));
});
test('automatic system changes update UI while leaving imagery selected',()=>{
 localStorage.setItem('ui_theme','auto');localStorage.setItem('mapTheme','satellite');bind().initializeDarkMode();
 prefersDark=true;listener();expect(document.body.classList.contains('dark-mode')).toBe(true);
 prefersDark=false;listener();expect(document.body.classList.contains('dark-mode')).toBe(false);
 expect(mapTheme).toBe('satellite');expect(localStorage.getItem('ui_theme')).toBe('auto');expect(setMap).not.toHaveBeenCalled();
});
test.each([['light','standard'],['dark','dark']])('explicit %s UI choice still selects %s map', (ui,expected)=>{
 localStorage.setItem('mapTheme','satellite');bind().setTheme(ui);expect(mapTheme).toBe(expected);
});
test('explicit UI toggle still selects linked Dark map',()=>{
 localStorage.setItem('ui_theme','light');localStorage.setItem('mapTheme','satellite');bind().toggleDarkMode();expect(mapTheme).toBe('dark');
});
test('unlinked explicit UI choice leaves imagery alone',()=>{
 localStorage.setItem('linkUiMapTheme','false');bind().setTheme('dark');expect(mapTheme).toBe('satellite');expect(setMap).not.toHaveBeenCalled();
});
test.each([['dark',false,'dark'],['light',true,'standard'],['auto',true,'dark'],['auto',false,'standard']])('non-imagery startup retains linked policy for %s/%s',(ui,system,expected)=>{
 prefersDark=system;localStorage.setItem('ui_theme',ui);localStorage.setItem('mapTheme','standard');mapTheme='standard';window.eval(boot);
 expect(localStorage.getItem('mapTheme')).toBe(expected);expect(Theme.buildEarlyLinkedMapThemeBootPlan(ui,system,localStorage)).toEqual({shouldSet:true,mapTheme:expected});
 bind().initializeDarkMode();expect(mapTheme).toBe(expected);
});
