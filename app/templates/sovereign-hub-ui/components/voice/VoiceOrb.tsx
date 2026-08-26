"use client"

import { useEffect, useRef, type MutableRefObject } from "react"
import styles from "./VoiceMode.module.css"

type GLProgram = {
  gl: WebGLRenderingContext
  program: WebGLProgram
  buffer: WebGLBuffer
  vertexShader: WebGLShader
  fragmentShader: WebGLShader
  resolution: WebGLUniformLocation | null
  time: WebGLUniformLocation | null
  energy: WebGLUniformLocation | null
}

const NOISE = `
float h(vec2 p){
  p=fract(p*vec2(127.1,311.7));
  p+=dot(p,p+19.19);
  return fract(p.x*p.y);
}
float n(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1)),h(i+vec2(1.,1)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.,a=.53;
  mat2 m=mat2(1.67,1.21,-1.21,1.67);
  for(int i=0;i<6;i++){
    v+=a*n(p);
    p=m*p+vec2(.31,.17);
    a*=.49;
  }
  return v;
}`

const BACKGROUND_FRAGMENT = `
precision highp float;
uniform vec2 R;
uniform float T;
uniform float E;
${NOISE}

vec3 pal(float x){
  vec3 blue=vec3(.11,.30,.92);
  vec3 violet=vec3(.42,.14,.83);
  vec3 magenta=vec3(.66,.13,.58);
  vec3 cyan=vec3(.04,.55,.65);
  float a=smoothstep(.05,.40,x);
  float b=smoothstep(.34,.70,x);
  float c=smoothstep(.62,.98,x);
  vec3 col=mix(blue,violet,a);
  col=mix(col,magenta,b*.44);
  return mix(col,cyan,c);
}

void main(){
  vec2 uv=gl_FragCoord.xy/R;
  vec2 p=uv;
  p.x=(p.x-.5)*(R.x/R.y)+.5;
  float t=T*.055;
  float e=clamp(E,0.,1.);
  vec2 q=vec2(fbm(p*1.45+vec2(t*.62,-t*.20)),fbm(p*1.50+vec2(4.1,-2.8)+vec2(-t*.36,t*.26)));
  vec2 r=vec2(fbm(p*2.35+q*1.90+vec2(1.8,8.9)+t*.12),fbm(p*2.28+q*1.82+vec2(7.4,2.4)-t*.10));
  vec2 s=vec2(fbm(p*3.65+r*1.45+q*.62+vec2(2.1,5.7)+t*.07),fbm(p*3.55+r*1.42-q*.50+vec2(8.4,1.9)-t*.06));
  float broad=fbm(p*1.88+r*2.05+q*.80);
  float folds=fbm(p*3.90+s*1.08+r*.54);
  float fine=fbm(p*7.0+s*.42+q*.55+t*.05);
  float lowerMask=smoothstep(.02,.67,1.0-uv.y);
  float upperFade=1.0-smoothstep(.58,.88,uv.y);
  float mainFog=smoothstep(.38-.025*e,.66,broad);
  float detail=smoothstep(.50,.78,folds)*.44;
  float wisps=smoothstep(.60,.88,fine)*.22;
  float density=(mainFog*.74+detail+wisps)*lowerMask*upperFade;
  density+=smoothstep(.54,.86,folds)*smoothstep(.74,.18,uv.y)*(.16+.10*e);
  float centerHole=1.0-smoothstep(.0,.28,length(vec2((uv.x-.5)*.78,(uv.y-.42))));
  density=clamp(density*(1.0-centerHole*.16),0.,1.);
  float cp=clamp(uv.x+(q.x-.5)*.28+(r.y-.5)*.10,0.,1.);
  vec3 col=pal(cp);
  float innerLight=smoothstep(.62,.88,folds);
  col=mix(col,vec3(.52,.62,1.0),innerLight*(.18+.10*e));
  col+=vec3(.26,.22,.42)*smoothstep(.70,.92,fine)*(.12+.10*e);
  float glow=density*(.78+.48*e);
  float alpha=clamp(.18+density*(.78+.18*e),0.,.86);
  col+=pal(uv.x)*exp(-pow((uv.y-.08)*12.0,2.0))*(.10+.08*e);
  gl_FragColor=vec4(col*glow,alpha);
}`

const ORB_FRAGMENT = `
precision highp float;
uniform vec2 R;
uniform float T;
uniform float E;
${NOISE}

float softNoise(vec2 p){
  return fbm(p)*.62+fbm(p*1.72+vec2(5.1,-2.6))*.27+fbm(p*3.05+vec2(-3.4,6.2))*.11;
}

void main(){
  vec2 uv=gl_FragCoord.xy/R;
  vec2 p=uv-.5;
  float d=length(p);
  if(d>.5){discard;}
  float e=clamp(E,0.,1.);
  float z=sqrt(max(0.0,.25-dot(p,p)));
  vec2 sp=p/(.47+z*.72);
  float speed=.145+e*.105;
  float t=T*speed;
  vec2 p1=vec2(sp.x-t*.90,sp.y*1.14+sin(t*.45)*.018);
  vec2 p2=vec2(sp.x-t*.66+4.5,sp.y*1.46-.06+sin(t*.36+1.3)*.015);
  vec2 p3=vec2(sp.x-t*1.10-3.0,sp.y*1.86+.09+sin(t*.54+2.6)*.014);
  float n1=softNoise(p1*1.55);
  float n2=softNoise(p2*1.82);
  float n3=softNoise(p3*2.12);
  float cloudA=smoothstep(.34,.70,n1);
  float cloudB=smoothstep(.40,.76,n2);
  float cloudC=smoothstep(.47,.81,n3);
  float w1=fbm(vec2((sp.x-t*.78)*1.86,sp.y*5.0+n1*.62));
  float w2=fbm(vec2((sp.x-t*.96)*2.42+4.2,sp.y*6.4-n2*.48));
  float fog=clamp(cloudA*.56+cloudB*.38+cloudC*.22+smoothstep(.53,.84,w1)*.24+smoothstep(.58,.88,w2)*.16,0.,1.);
  vec3 top=vec3(.32,.46,1.00);
  vec3 middle=vec3(.56,.69,1.00);
  vec3 bottom=vec3(.84,.90,1.00);
  vec3 col=mix(top,middle,smoothstep(.10,.60,uv.y));
  col=mix(col,bottom,smoothstep(.54,.96,uv.y));
  vec3 whiteMist=vec3(1.0);
  vec3 skyMist=vec3(.73,.84,1.00);
  vec3 iceMist=vec3(.89,.95,1.00);
  vec3 lilac=vec3(.79,.74,1.00);
  vec3 azure=vec3(.50,.70,1.00);
  float cavity=(1.0-smoothstep(.28,.56,n2))*smoothstep(.18,.50,n1);
  col*=1.0-cavity*.07;
  col=mix(col,skyMist,cloudA*.32);
  col=mix(col,iceMist,cloudA*.44);
  col=mix(col,azure,cloudB*.22);
  col=mix(col,lilac,cloudC*.24);
  col=mix(col,whiteMist,clamp(fog*.75,0.0,.80));
  col+=whiteMist*smoothstep(.72,.92,w1)*cloudA*(.065+e*.060);
  col+=iceMist*smoothstep(.76,.94,w2)*cloudB*(.045+e*.050);
  col*=1.0+e*.048;
  col*=.82+.22*z/.5;
  col=mix(col,vec3(.60,.68,1.0),smoothstep(.39,.50,d)*.20);
  col+=vec3(1.0)*exp(-dot(p-vec2(-.16,.18),p-vec2(-.16,.18))*40.0)*.17;
  gl_FragColor=vec4(col,1.0);
}`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("[Voice WebGL]", gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(canvas: HTMLCanvasElement, fragmentSource: string): GLProgram | null {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false })
  if (!gl) return null
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}")
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!vertexShader || !fragmentShader) return null
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  if (!program || !buffer) return null
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("[Voice WebGL]", gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, "a")
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  return {
    gl,
    program,
    buffer,
    vertexShader,
    fragmentShader,
    resolution: gl.getUniformLocation(program, "R"),
    time: gl.getUniformLocation(program, "T"),
    energy: gl.getUniformLocation(program, "E"),
  }
}

function resize(program: GLProgram, canvas: HTMLCanvasElement, maxDpr: number) {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1)
  const width = Math.max(1, Math.floor(rect.width * dpr))
  const height = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width === width && canvas.height === height) return
  canvas.width = width
  canvas.height = height
  program.gl.viewport(0, 0, width, height)
}

function destroy(program: GLProgram | null) {
  if (!program) return
  const { gl } = program
  gl.deleteBuffer(program.buffer)
  gl.deleteProgram(program.program)
  gl.deleteShader(program.vertexShader)
  gl.deleteShader(program.fragmentShader)
  gl.getExtension("WEBGL_lose_context")?.loseContext()
}

export function VoiceOrb({
  energyRef,
  speedRef,
  demoRef,
  onWebGLUnavailable,
}: {
  energyRef: MutableRefObject<number>
  speedRef: MutableRefObject<number>
  demoRef: MutableRefObject<boolean>
  onWebGLUnavailable: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const backgroundRef = useRef<HTMLCanvasElement>(null)
  const orbRef = useRef<HTMLCanvasElement>(null)
  const unavailableRef = useRef(onWebGLUnavailable)

  useEffect(() => {
    unavailableRef.current = onWebGLUnavailable
  }, [onWebGLUnavailable])

  useEffect(() => {
    const backgroundCanvas = backgroundRef.current
    const orbCanvas = orbRef.current
    if (!backgroundCanvas || !orbCanvas) return
    const background = createProgram(backgroundCanvas, BACKGROUND_FRAGMENT)
    const orb = createProgram(orbCanvas, ORB_FRAGMENT)
    if (!background || !orb) unavailableRef.current()

    let frame = 0
    let smoothedEnergy = .07
    const render = (milliseconds: number) => {
      if (demoRef.current) {
        const seconds = milliseconds / 1000
        energyRef.current = .18 + .12 * (.5 + .5 * Math.sin(seconds * 1.65)) + .055 * (.5 + .5 * Math.sin(seconds * 4.1 + 1.4))
      }
      smoothedEnergy += (Math.max(.04, Math.min(1, energyRef.current)) - smoothedEnergy) * .12
      rootRef.current?.style.setProperty("--voice-energy", smoothedEnergy.toFixed(3))
      const speed = Math.max(.7, Math.min(1.5, speedRef.current))

      if (background) {
        resize(background, backgroundCanvas, 1.6)
        const gl = background.gl
        gl.useProgram(background.program)
        gl.uniform2f(background.resolution, backgroundCanvas.width, backgroundCanvas.height)
        gl.uniform1f(background.time, milliseconds / 1000 * (.62 + speed * .38))
        gl.uniform1f(background.energy, smoothedEnergy)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
      if (orb) {
        resize(orb, orbCanvas, 2)
        const gl = orb.gl
        gl.useProgram(orb.program)
        gl.uniform2f(orb.resolution, orbCanvas.width, orbCanvas.height)
        gl.uniform1f(orb.time, milliseconds / 1000 * speed)
        gl.uniform1f(orb.energy, smoothedEnergy)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(frame)
      destroy(background)
      destroy(orb)
    }
  }, [demoRef, energyRef, speedRef])

  return (
    <div ref={rootRef} className={styles.visuals}>
      <canvas ref={backgroundRef} className={styles.backgroundFog} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.orbWrap}>
        <div className={styles.orbHalo} aria-hidden="true" />
        <div className={styles.orbShell}>
          <canvas ref={orbRef} className={styles.orbCanvas} aria-label="Живой голосовой шар Malik AI" />
          <div className={styles.orbGlass} aria-hidden="true" />
          <div className={styles.orbRing} aria-hidden="true" />
        </div>
        <div className={styles.orbShadow} aria-hidden="true" />
      </div>
    </div>
  )
}
