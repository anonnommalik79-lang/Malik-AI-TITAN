import { z } from "zod"
const expression = z.string().min(1).max(1000), variable = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/)
export const mathTaskSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("evaluate"), expression, expectUnit: z.string().max(60).optional() }).strict(),
  z.object({ op: z.literal("convert"), value: expression, to: z.string().min(1).max(60) }).strict(),
  z.object({ op: z.literal("solve"), equation: expression, variable: variable.optional(), interval: z.tuple([z.number().finite(), z.number().finite()]).optional() }).strict(),
  z.object({ op: z.literal("system"), equations: z.array(expression).min(1).max(6) }).strict(),
  z.object({ op: z.literal("derivative"), expression, variable: variable.optional(), order: z.number().int().min(1).max(3).optional(), at: z.number().finite().optional() }).strict(),
  z.object({ op: z.literal("integrate"), expression, variable: variable.optional(), from: z.string().max(100).optional(), to: z.string().max(100).optional() }).strict(),
  z.object({ op: z.literal("simplify"), expression }).strict(),
])
