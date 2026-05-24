(function(){
  const launch=new Date("2026-06-01T00:00:00+05:00").getTime();
  const start=new Date("2026-05-23T00:00:00+05:00").getTime();
  const $=id=>document.getElementById(id);
  const e={d:$("days"),h:$("hours"),m:$("minutes"),s:$("seconds"),t:$("countdownTitle"),p:$("progressText"),b:$("progressBar")};
  const pad=n=>String(Math.max(0,n)).padStart(2,"0");
  function tick(){
    const now=Date.now(),diff=launch-now;
    if(diff<=0){e.d.textContent=e.h.textContent=e.m.textContent=e.s.textContent="00";e.t.textContent="MALIK AI V6.5 TITAN is launching";e.p.textContent="100% ready";e.b.style.width="100%";return}
    e.d.textContent=pad(Math.floor(diff/86400000));
    e.h.textContent=pad(Math.floor(diff/3600000)%24);
    e.m.textContent=pad(Math.floor(diff/60000)%60);
    e.s.textContent=pad(Math.floor(diff/1000)%60);
    const total=Math.max(1,launch-start),done=Math.min(Math.max(now-start,0),total),progress=Math.round(done/total*100);
    e.p.textContent=progress+"% ready";
    e.b.style.width=progress+"%";
  }
  tick(); setInterval(tick,1000);
})();
(function(){
  const art=document.getElementById("heroArt"), card=document.getElementById("heroCard");
  if(!art||!card||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  let raf=null,tx=0,ty=0,cx=0,cy=0;
  function loop(){cx+=(tx-cx)*.08;cy+=(ty-cy)*.08;art.style.transform="scale(1.045) translate3d("+cx+"px,"+cy+"px,0)";raf=requestAnimationFrame(loop)}
  card.addEventListener("pointermove",ev=>{const r=card.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width-.5,y=(ev.clientY-r.top)/r.height-.5;tx=x*-24;ty=y*-16;if(!raf)loop()});
  card.addEventListener("pointerleave",()=>{tx=0;ty=0});
})();
(function(){
  const els=document.querySelectorAll(".reveal");
  if(!("IntersectionObserver" in window)){els.forEach(el=>el.classList.add("visible"));return}
  const io=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("visible");io.unobserve(entry.target)}}),{threshold:.12});
  els.forEach(el=>io.observe(el));
})();
(function(){
  const form=document.getElementById("waitlistForm"),input=document.getElementById("emailInput"),toast=document.getElementById("toast");
  if(!form||!input||!toast)return;
  let timer;
  function show(text){toast.textContent=text;toast.classList.add("show");clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove("show"),3600)}
  form.addEventListener("submit",ev=>{
    ev.preventDefault();
    const email=input.value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){show("Enter a valid email.");input.focus();return}
    const key="malik_ai_v65_waitlist";
    const existing=JSON.parse(localStorage.getItem(key)||"[]");
    if(!existing.includes(email))existing.push(email);
    localStorage.setItem(key,JSON.stringify(existing));
    input.value="";
    show("Saved. We will notify you about launch.");
  });
})();