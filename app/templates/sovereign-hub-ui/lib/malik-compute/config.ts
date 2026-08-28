// MCU is a Malik allowance, not provider tokens, API credits or money.
export const DEFAULT_DAILY_COMPUTE = 1000
export const COMPUTE_WEIGHTS = Object.freeze({
  chat: 1,
  agent: 5,
  research: 5,
  image: 10,
  voice: 2,
  video: 25,
  plugin: 2,
})

export const MAX_AGENT_STEPS = 40
export const MAX_AGENT_RETRIES = 4
export const MAX_AGENT_COMPUTE = 150
