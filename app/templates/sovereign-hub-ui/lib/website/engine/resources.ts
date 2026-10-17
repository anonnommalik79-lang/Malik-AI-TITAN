import type { ProjectFile } from "@/lib/work/code/files"

// This small controller is exported with static projects. It is resource
// management, NOT a visual template. It executes only in the visitor's browser.
export const MEDIA_POLICY_SCRIPT = `(()=>{
const key='__malikMediaPolicyV1';if(window[key])return;window[key]=true;
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');let io,mo,dispose=[],running=false,states=new Map();
const constrained=()=>motion.matches||Boolean(navigator.connection&&navigator.connection.saveData);
const pause=(v,s)=>{s.policyPaused=true;v.pause()};
const sync=()=>{for(const [v,s] of states){if(!v.isConnected){pause(v,s);s.remove();if(io)io.unobserve(v);states.delete(v);continue}if(document.hidden||!s.visible||constrained()&&s.auto&&!s.manual){pause(v,s);continue}if(s.auto&&!s.manual&&v.paused){s.policyPaused=false;v.play().catch(()=>{})}}};
const scan=()=>{for(const v of document.querySelectorAll('video')){if(states.has(v))continue;const s={auto:v.hasAttribute('data-malik-play-intent'),visible:!io,manual:false,policyPaused:false,remove:()=>{}};states.set(v,s);v.preload='none';v.autoplay=false;if(s.auto){v.muted=true;v.playsInline=true}const manual=()=>{s.manual=true};const paused=()=>{if(!s.policyPaused)s.manual=true};v.addEventListener('pointerdown',manual,{passive:true});v.addEventListener('keydown',manual);v.addEventListener('pause',paused);s.remove=()=>{v.removeEventListener('pointerdown',manual);v.removeEventListener('keydown',manual);v.removeEventListener('pause',paused)};if(io)io.observe(v)}sync()};
const stop=()=>{if(!running)return;running=false;for(const [v,s] of states){pause(v,s);s.remove()}if(io)io.disconnect();if(mo)mo.disconnect();dispose.splice(0).forEach(fn=>fn());states.clear()};
const start=()=>{if(running)return;running=true;if('IntersectionObserver'in window)io=new IntersectionObserver(entries=>{for(const entry of entries){const s=states.get(entry.target);if(s)s.visible=entry.isIntersecting}sync()},{threshold:.1});mo=new MutationObserver(scan);mo.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('visibilitychange',sync);dispose.push(()=>document.removeEventListener('visibilitychange',sync));if(motion.addEventListener){motion.addEventListener('change',sync);dispose.push(()=>motion.removeEventListener('change',sync))}const connection=navigator.connection;if(connection&&connection.addEventListener){connection.addEventListener('change',sync);dispose.push(()=>connection.removeEventListener('change',sync))}scan()};
window.addEventListener('pagehide',stop);window.addEventListener('pageshow',start);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();`

export function stripMediaPolicy(source: string) {
  return source.replace(/<script data-malik-media-policy="v1">[\s\S]*?<\/script>/g, "")
}

export function withMediaPolicy(files: ProjectFile[]): ProjectFile[] {
  return files.map(file => {
    if (!/\.html?$/.test(file.path) || !/<(?:img|video)\b/i.test(file.content)) return file
    let content = stripMediaPolicy(file.content), auto = 0, image = 0
    content = content.replace(/<video\b[^>]*>/gi, tag => {
      const intent = /\sautoplay(?:\s|=|>)/i.test(tag) || /data-malik-play-intent/.test(tag)
      let next = tag.replace(/\sautoplay(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "").replace(/\spreload\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/\sdata-malik-play-intent(?:\s*=\s*(?:"[^"]*"|'[^']*'))?/g, "")
      next = next.replace(/>$/, ` preload="none"${intent && auto++ === 0 ? ' data-malik-play-intent="true"' : ""}>`)
      return next
    })
    content = content.replace(/<img\b[^>]*>/gi, tag => {
      image++
      return tag.replace(/\s*\/?>$/, `${/\sloading\s*=/i.test(tag) ? "" : ` loading="${image === 1 ? "eager" : "lazy"}"`}${/\sdecoding\s*=/i.test(tag) ? "" : ' decoding="async"'}>`)
    })
    const end = content.toLowerCase().lastIndexOf("</body>")
    if (end < 0) return { ...file, content }
    return { ...file, content: `${content.slice(0, end)}<script data-malik-media-policy="v1">${MEDIA_POLICY_SCRIPT}</script>${content.slice(end)}` }
  })
}
