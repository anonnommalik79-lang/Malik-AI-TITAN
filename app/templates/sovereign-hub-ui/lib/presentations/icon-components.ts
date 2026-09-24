import {
  Award, BarChart3, BookOpen, Brain, Building2, CalendarDays, Camera, Car, CircleCheck, Clock, Cloud, Code2, Coffee,
  Coins, Cpu, Database, Factory, Flag, Gift, Globe, GraduationCap, Handshake, Heart, House, KeyRound, Layers, Leaf,
  Lightbulb, Lock, Mail, MapPin, Megaphone, MessageCircle, Mountain, Music, Package, Palette, Percent, Phone, Plane,
  Rocket, Scale, Search, Settings, ShieldCheck, Smile, Sparkles, Star, Stethoscope, Store, Sun, Target, TrendingUp,
  Trophy, Truck, User, Users, Wallet, Wifi, Zap, type LucideIcon,
} from "lucide-react"
import type { DeckIconName } from "@/lib/presentations/types"

/** The drawing behind each icon name a slide can use — on screen and in PowerPoint. */
export const DECK_ICONS: Record<DeckIconName, LucideIcon> = {
  sparkles: Sparkles, rocket: Rocket, target: Target, trending: TrendingUp, chart: BarChart3, users: Users,
  user: User, shield: ShieldCheck, lock: Lock, globe: Globe, map: MapPin, zap: Zap, clock: Clock,
  calendar: CalendarDays, star: Star, heart: Heart, leaf: Leaf, coins: Coins, wallet: Wallet, building: Building2,
  home: House, truck: Truck, cpu: Cpu, code: Code2, book: BookOpen, graduation: GraduationCap, trophy: Trophy,
  handshake: Handshake, lightbulb: Lightbulb, message: MessageCircle, phone: Phone, mail: Mail, camera: Camera,
  music: Music, coffee: Coffee, car: Car, plane: Plane, sun: Sun, settings: Settings, check: CircleCheck,
  search: Search, layers: Layers, package: Package, store: Store, factory: Factory, scale: Scale,
  stethoscope: Stethoscope, brain: Brain, palette: Palette, megaphone: Megaphone, gift: Gift, flag: Flag,
  mountain: Mountain, key: KeyRound, smile: Smile, wifi: Wifi, cloud: Cloud, database: Database, percent: Percent,
  award: Award,
}
