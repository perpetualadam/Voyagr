const fs=require('fs'),path=require('path');
const Theme=require('../modules/ui/theme');
const Dark=require('../app/dark-mode-orchestration');
const css=fs.readFileSync(path.join(__dirname,'../../../static/css/voyagr.css'),'utf8');
let style;
beforeEach(()=>{localStorage.clear();document.documentElement.className='';document.body.className='';document.body.innerHTML='<section class="voice-section"><p class="voice-card__hint">Speak a command</p><button class="btn-voice-secondary">Test speech</button></section>';style=document.createElement('style');style.textContent=css;document.head.append(style);});
afterEach(()=>{style.remove();document.documentElement.className='';document.body.className='';localStorage.clear();jest.restoreAllMocks();});
test('dark component selectors cannot accidentally style the html root',()=>{
 const visit=rules=>{for(const rule of rules){if(rule.cssRules)visit(rule.cssRules);if(!rule.selectorText)continue;const selectors=rule.selectorText.split(',').map(s=>s.trim());if(selectors.includes('html.dark-mode'))expect(selectors).toEqual(['html.dark-mode','body.dark-mode']);}};
 visit(style.sheet.cssRules);
});
test.each(['html','body'])('dark voice controls work when only %s has the theme class',owner=>{
 document[owner==='html'?'documentElement':'body'].classList.add('dark-mode');
 expect(getComputedStyle(document.querySelector('.voice-card__hint')).color).toBe('rgb(174, 184, 214)');
 expect(getComputedStyle(document.querySelector('.btn-voice-secondary')).color).toBe('rgb(224, 228, 240)');
 expect(getComputedStyle(document.querySelector('.btn-voice-secondary')).backgroundColor).toBe('rgba(40, 44, 62, 0.9)');
});
test('light UI retains its original secondary control colours',()=>{
 expect(getComputedStyle(document.querySelector('.btn-voice-secondary')).color).toBe('rgb(51, 65, 85)');expect(getComputedStyle(document.querySelector('.btn-voice-secondary')).backgroundColor).toBe('rgba(255, 255, 255, 0.85)');
});
test('dark and automatic UI choices retain the existing default Dark-map pairing',()=>{
 let systemDark=true,mapTheme='standard';window.matchMedia=()=>({matches:systemDark,addEventListener:()=>{}});jest.spyOn(console,'log').mockImplementation(()=>{});
 Dark.bind({theme:()=>Theme,call:{setMapTheme:theme=>{mapTheme=theme;},getCurrentMapTheme:()=>mapTheme,saveAllSettings:()=>{},showStatus:()=>{}}});
 Dark.setTheme('dark');expect(mapTheme).toBe('dark');expect(document.documentElement.classList.contains('dark-mode')).toBe(true);expect(document.body.classList.contains('dark-mode')).toBe(true);
 Dark.setTheme('auto');expect(mapTheme).toBe('dark');systemDark=false;Dark.applyTheme('auto');expect(mapTheme).toBe('standard');expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
});
