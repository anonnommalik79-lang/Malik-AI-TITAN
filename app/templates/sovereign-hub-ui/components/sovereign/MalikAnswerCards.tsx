"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ArrowUpRight, ExternalLink } from "lucide-react"
import type { AnswerCard, AnswerCardsBlock, CardLink } from "@/lib/ai/answer-cards"
import { citationName, hostOf, safeHttps, subjectCitationUrl, trustedLink, type MalikCitation } from "@/lib/ai/citation-names"
import { isAbstractPhotoSubject, referenceSearchTopic, visualSegmentLabel } from "@/lib/ai/reference-visual-policy"
import { subscribeReferenceImages } from "@/lib/media/client-reference-cache"
import { referenceBrandAsset } from "@/lib/media/reference-brand-assets"
import { referenceThumbnailVariants } from "@/lib/media/reference-catalog"
import { sourceReferencePhoto } from "@/lib/media/source-reference-photos"
import "./answer-cards.css"

type Sources = readonly MalikCitation[] | null | undefined

/** «Astana Hub +2»: the first source opens, the rest are counted. */
function SourceChip({ numbers, sources }: { numbers?: number[]; sources: Sources }) {
  const found = (numbers || []).map((number) => sources?.[number - 1]).filter((source): source is MalikCitation => Boolean(source && safeHttps(source.url)))
  if (!found.length) return null
  return (
    <a className="malik-md-cite" href={safeHttps(found[0].url)} target="_blank" rel="noreferrer noopener" title={found.map((source) => source.title || citationName(source)).join("\n")}>
      {citationName(found[0]) + (found.length > 1 ? ` +${found.length - 1}` : "")}
    </a>
  )
}

/** A name that opens its official page - only when that page is backed by the sources. */
function Title({ card, sources, as: Tag = "h4" }: { card: AnswerCard; sources: Sources; as?: "h3" | "h4" }) {
  const href = trustedLink(card.url, sources) || subjectCitationUrl(visualSegmentLabel(card.title), sources)
  return <Tag className="malik-card__title">{href ? <a href={href} target="_blank" rel="noreferrer noopener">{card.title}</a> : card.title}</Tag>
}

function TextLink({ link, sources }: { link: CardLink; sources: Sources }) {
  const href = trustedLink(link.url, sources)
  if (!href) return null
  return <a className="malik-card__link" href={href} target="_blank" rel="noreferrer noopener">{link.label}<ArrowUpRight aria-hidden="true" /></a>
}

function Button({ link, sources, primary }: { link: CardLink; sources: Sources; primary?: boolean }) {
  const href = trustedLink(link.url, sources)
  if (!href) return null
  return (
    <a className={primary ? "malik-card-button is-primary" : "malik-card-button"} href={href} target="_blank" rel="noreferrer noopener">
      {link.label}<ArrowUpRight aria-hidden="true" />
    </a>
  )
}

/** The page's own picture (from a cited source) or a looked-up reference photo. */
function useCardImage(image: AnswerCard["image"], sources: Sources, title: string, hero: boolean, imageRole?: AnswerCard["imageRole"], autoPhotos = false, failed: readonly string[] = []): { url: string; label: string; sourceUrl?: string; logo?: boolean } | null {
  const fromSource = typeof image === "number" ? sources?.[image - 1] : undefined
  const subject = visualSegmentLabel(title)
  const sourceMatches = !isAbstractPhotoSubject(subject) && Boolean(fromSource && subjectCitationUrl(subject, [fromSource]))
  const pagePhoto = (autoPhotos || typeof image === "number") && imageRole !== "logo" ? sourceReferencePhoto({ topic: subject, queries: [referenceSearchTopic(subject)], explicit: true, layout: "landscape" }, (fromSource ? [fromSource] : sources || []).filter((source) => !failed.includes(source.image || ""))) : null
  const sourceImage = pagePhoto ? { url: pagePhoto.url, label: pagePhoto.credit || "Источник фото", sourceUrl: pagePhoto.sourceUrl }
    : imageRole === "logo" && sourceMatches && fromSource?.image && /^https:\/\//i.test(fromSource.image) && !failed.includes(fromSource.image) ? { url: fromSource.image, label: fromSource.domain || hostOf(fromSource.url), sourceUrl: fromSource.url } : null
  // A model may omit image metadata or cite a page without an OG picture.
  // Retrieve the exact named subject instead of leaving a permanent initial.
  const lookup = typeof image === "string" && image.trim().length >= 2 && !isAbstractPhotoSubject(image) ? image.trim()
    : autoPhotos && !sourceImage && !isAbstractPhotoSubject(title) ? visualSegmentLabel(title) : ""
  const brand = !hero ? referenceBrandAsset(lookup || title) : null
  const hasBrand = Boolean(brand), sourceUrl = sourceImage?.url
  const lookupKey = (imageRole === "logo" ? "logo:" : "photo:") + lookup
  const [found, setFound] = useState<{ key: string; url: string; label: string; sourceUrl?: string; logo?: boolean } | null>(null)
  useEffect(() => {
    if (!lookup || hasBrand || sourceUrl) return
    return subscribeReferenceImages(
      { topic: lookup, queries: [...new Set([referenceSearchTopic(lookup), lookup])], explicit: true, entity: true, logo: imageRole === "logo", kind: "reference", layout: "landscape" },
      (images) => { if (images[0]) setFound({ key: lookupKey, url: images[0].url, label: images[0].credit || "Wikimedia", sourceUrl: images[0].sourceUrl, logo: images[0].role === "logo" }) },
    )
  }, [lookup, lookupKey, hasBrand, sourceUrl, imageRole])
  if (brand) return { url: brand.url, label: brand.credit, sourceUrl: brand.sourceUrl, logo: true }
  if (sourceImage) return { ...sourceImage, logo: imageRole === "logo" }
  return found && found.key === lookupKey ? { url: found.url, label: found.label, sourceUrl: found.sourceUrl, logo: found.logo } : null
}

function Picture({ card, sources, hero = false, autoPhotos = false }: { card: AnswerCard; sources: Sources; hero?: boolean; autoPhotos?: boolean }) {
  const [failed, setFailed] = useState<string[]>([])
  const image = useCardImage(card.image, sources, card.title, hero, card.imageRole, autoPhotos, failed)
  const url = image ? referenceThumbnailVariants(image.url).find((candidate) => !failed.includes(candidate)) : undefined
  if (!image || !url) {
    if (hero) return null
    return <span className="malik-card__thumb is-empty" aria-hidden="true">{card.title.trim().charAt(0).toUpperCase()}</span>
  }
  return (
    <span className={hero ? "malik-card__hero-image" : "malik-card__thumb" + (image.logo ? " is-logo" : " is-photo")}>
      <img src={url} alt={image.logo ? card.title + " · логотип" : card.title} loading={image.logo ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed((current) => [...current, url].slice(-6))} />
      {!image.logo && image.label ? <a className="malik-card__credit" href={safeHttps(image.sourceUrl || "") || url} target="_blank" rel="noopener noreferrer">{image.label}<ExternalLink aria-hidden="true" /></a> : null}
    </span>
  )
}

function Badge({ children }: { children?: string }) {
  return children ? <span className="malik-card__badge">{children}</span> : null
}

function Body({ card, sources }: { card: AnswerCard; sources: Sources }) {
  const links = (card.links || []).filter((link) => trustedLink(link.url, sources)).map((link, index) => <TextLink key={index} link={link} sources={sources} />)
  return (
    <>
      {card.meta ? <p className="malik-card__meta">{card.meta}</p> : null}
      {card.text ? <p className="malik-card__text">{card.text}{!links.length && !card.note ? <SourceChip numbers={card.sources} sources={sources} /> : null}</p> : null}
      {card.note ? <p className="malik-card__note">{card.note}{!links.length ? <SourceChip numbers={card.sources} sources={sources} /> : null}</p> : null}
      {links.length ? <p className="malik-card__links">{links}<SourceChip numbers={card.sources} sources={sources} /></p> : null}
      {!card.text && !card.note && !links.length ? <SourceChip numbers={card.sources} sources={sources} /> : null}
    </>
  )
}

function Facts({ card }: { card: AnswerCard }) {
  if (!card.facts?.length) return null
  return <dl className="malik-card__facts">{card.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
}

function ListCard({ card, sources, autoPhotos }: { card: AnswerCard; sources: Sources; autoPhotos?: boolean }) {
  return (
    <article className="malik-card-row">
      <Picture card={card} sources={sources} autoPhotos={autoPhotos} />
      <div className="malik-card-row__body">
        <Badge>{card.badge}</Badge>
        <Title card={card} sources={sources} />
        {card.value ? <p className="malik-card__value is-small">{card.value}{card.valueNote ? <small>{card.valueNote}</small> : null}</p> : null}
        <Body card={card} sources={sources} />
        <Facts card={card} />
        {card.action ? <div className="malik-card__actions"><Button link={card.action} sources={sources} /></div> : null}
      </div>
    </article>
  )
}

function OptionCard({ card, sources, primary }: { card: AnswerCard; sources: Sources; primary: boolean }) {
  return (
    <article className="malik-card-option">
      <div className="malik-card-option__head"><Title card={card} sources={sources} /><Badge>{card.badge}</Badge></div>
      {card.value ? <p className="malik-card__value">{card.value}</p> : null}
      {card.valueNote ? <p className="malik-card__value-note">{card.valueNote}</p> : null}
      <Body card={card} sources={sources} />
      <Facts card={card} />
      {card.action ? <Button link={card.action} sources={sources} primary={primary} /> : null}
    </article>
  )
}

function PricingCard({ card, sources }: { card: AnswerCard; sources: Sources }) {
  return <article className="malik-card-option">
    <div className="malik-card-option__head"><Title card={card} sources={sources} /><Badge>{card.badge}</Badge></div>
    {card.offers?.length ? <dl className={`malik-card-offers is-${card.offers.length}`}>{card.offers.map((offer, index) => <div key={index}>
      <dt>{offer.label}</dt><dd>{offer.value}</dd>{offer.note ? <p>{offer.note}</p> : null}
    </div>)}</dl> : null}
    <Body card={card} sources={sources} />
    {card.action ? <div className="malik-card__actions"><Button link={card.action} sources={sources} /></div> : null}
  </article>
}

function Section({ title, label, children, className }: { title?: string; label: string; children: ReactNode; className: string }) {
  return (
    <section className={className} aria-label={title || label} data-malik-cards>
      {title ? <h3 className="malik-cards__title">{title}</h3> : null}
      {children}
    </section>
  )
}

/**
 * Renders one ```malik-cards block. Links open only pages backed by the
 * answer's sources (trustedLink); pictures come from those pages or from the
 * reference catalogue, and a picture that fails to load gives way to a quiet
 * initial instead of a broken image.
 */
export function MalikAnswerCards({ block, sources, autoPhotos = false }: { block: AnswerCardsBlock; sources?: readonly MalikCitation[] | null; autoPhotos?: boolean }) {
  if (block.type === "pricing") {
    return <Section title={block.title} label="Тарифы" className="malik-cards is-options is-pricing">{block.items.map((card, index) => <PricingCard key={`${card.title}-${index}`} card={card} sources={sources} />)}</Section>
  }
  if (block.type === "cards") {
    return <Section title={block.title} label="Подборка" className="malik-cards is-list">{block.items.map((card, index) => <ListCard key={`${card.title}-${index}`} card={card} sources={sources} autoPhotos={autoPhotos} />)}</Section>
  }
  if (block.type === "options") {
    return <Section title={block.title} label="Варианты" className="malik-cards is-options">{block.items.map((card, index) => <OptionCard key={`${card.title}-${index}`} card={card} sources={sources} primary={index === 0} />)}</Section>
  }
  if (block.type === "hero") {
    const card = block.item
    return (
      <Section label={card.title} className="malik-cards is-hero">
        <Picture card={card} sources={sources} hero autoPhotos={autoPhotos} />
        <Title card={card} sources={sources} as="h3" />
        <Badge>{card.badge}</Badge>
        {card.value ? <p className="malik-card__value is-large">{card.value}</p> : null}
        {card.valueNote ? <p className="malik-card__value-note">{card.valueNote}</p> : null}
        <Body card={card} sources={sources} />
        <Facts card={card} />
        {card.action ? <div className="malik-card__actions"><Button link={card.action} sources={sources} primary /></div> : null}
      </Section>
    )
  }
  if (block.type === "dates") {
    return (
      <Section title={block.title} label="Ключевые даты" className="malik-cards is-dates">
        <dl className={`malik-card-dates is-${block.items.length}`}>{block.items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
      </Section>
    )
  }
  const buttons = block.items.map((item) => ({ item, href: trustedLink(item.url, sources) })).filter((entry) => entry.href)
  if (!buttons.length) return null
  return <div className="malik-card-actions" role="group" aria-label="Действия">{buttons.map(({ item, href }, index) => (
    <a key={index} className={item.primary ? "malik-card-button is-primary is-inline" : "malik-card-button is-inline"} href={href} target="_blank" rel="noreferrer noopener"><ExternalLink aria-hidden="true" />{item.label}</a>
  ))}</div>
}
