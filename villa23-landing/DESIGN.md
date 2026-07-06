# DESIGN.md, Villa Mhlosinga listing page

The dark cinematic register of the South Africa | Forbes Global Properties system. The main site (website-v2) is the white magazine; listing pages are the screening room. Both share the same fonts and brand tokens.

## Tokens
- Ink `#060605` page ground, Black `#0a0a0a` bands
- Gold `#cdaa8b` captions, accents, links (FGP brand gold)
- Forbes red `#d8361e` hairline accents only, never large fields
- White text on ink, muted `rgba(255,255,255,0.62)` for secondary

## Type
- Display: FreightNeo Pro (self hosted), weight 300, tight leading for headlines
- Body: Work Sans (self hosted woff2), 16px base
- Eyebrows: 11px caps, 0.22em tracking, gold or muted
- Scale ratio at least 1.25 between steps, clamp() fluid headings

## Components in service
- Fixed nav: transparent over hero, solid black past 60vh, red 2px top hairline, lockup back-link to the main site
- Static hero: full viewport image, veil gradients, centered intro (eyebrow, serif h1, lede), scroll cue
- Film stage: 16:9 poster, click to play native video with sound, HD/SD by viewport
- Feature rows: 50/50 media + copy, dark and light alternating
- Fact strip, spec definition list, access flight times, LQA quote band
- Enquiry form posting to /api/enquire (email + Notion CRM), gold focus rings
- Footer: FGP lockup back-link + member disclaimer

## Imagery rules
- Editorial asymmetric compositions, never uniform same-height grids
- One idea per movement: a dominant image with supporting frames, or a single full bleed statement
- Gold single-line captions, sentence case, name the place not the category
- Portrait crops cut for phones (art directed), landscape for desktop
