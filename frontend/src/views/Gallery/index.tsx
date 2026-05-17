// src/views/Gallery/index.tsx
//
// /gallery — the living reference for the Silan design system.
// Every token table, layout rule and component variant on one scrollable
// page with a sticky section nav. Check here before building UI.
import React from 'react';
import { Sparkles } from 'lucide-react';
import {
  Badge,
  Input,
  Textarea,
  Field,
  Container,
  Stack,
  PageHeader,
  Divider,
  Button,
  ToastProvider,
} from '../../components/ds';
import { useSetPageTitle, usePageSections } from '../../layout/PageTitleContext';
import {
  radiusTokens,
  elevationTokens,
  durationTokens,
  easingTokens,
  spacingTokens,
  colorGroups,
  gallerySections,
} from './galleryData';
import {
  GallerySection,
  Subsection,
  Stage,
  TokenTable,
} from './GalleryPrimitives';
import {
  MaterialsSection,
  BackgroundSection,
  ChromeSection,
  ButtonsSection,
  CardsSection,
  ControlsSection,
  OverlaysSection,
  NavigationSection,
  DataSection,
  FeedbackSection,
  BrandSection,
} from './GalleryShowcase';

/* --- Sticky in-page navigation ------------------------------------------- */

const GalleryNav: React.FC<{ active: string }> = ({ active }) => (
  <nav className="sticky top-4 hidden w-44 shrink-0 lg:block" aria-label="Design system sections">
    <div className="text-ds-2xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
      On this page
    </div>
    <ul className="mt-3 space-y-0.5">
      {gallerySections.map((s) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className={
              'block rounded-ds-sm px-2.5 py-1.5 text-ds-sm transition-colors duration-ds-fast ease-ds-standard ' +
              (active === s.id
                ? 'bg-ds-primary-soft font-medium text-ds-primary'
                : 'text-ds-fg-muted hover:bg-ds-surface-2 hover:text-ds-fg')
            }
          >
            {s.label}
          </a>
        </li>
      ))}
    </ul>
  </nav>
);

/* --- Page ---------------------------------------------------------------- */

const Gallery: React.FC = () => {
  const [active, setActive] = React.useState(gallerySections[0].id);

  // Register with the address bar: page title + in-page section crumbs.
  useSetPageTitle('Design Gallery');
  usePageSections(gallerySections.map((s) => ({ id: s.id, title: s.label })));

  // Highlight the gallery side-nav for whichever section is in view.
  // Content scrolls inside #browser-window (see MainLayout).
  React.useEffect(() => {
    const root = document.getElementById('browser-window');
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { root, rootMargin: '-15% 0px -70% 0px', threshold: 0.1 },
    );
    gallerySections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <ToastProvider>
      <Container width="wide" className="py-6">
        <PageHeader
          eyebrow="Design System"
          title="Gallery"
          description="The living reference for the Silan design system — Fluent skeleton, glass materials, NUS brand palette. Every token and component on one page."
          actions={
            <Badge tone="primary" appearance="soft">
              <Sparkles className="size-3" /> v1.0
            </Badge>
          }
        />

        <div className="mt-10 flex gap-10">
          <GalleryNav active={active} />

          <div className="min-w-0 flex-1 space-y-16">
            {/* ===================== FOUNDATIONS ====================== */}
            <GallerySection
              id="foundations"
              title="Foundations"
              description="Design tokens are the single source of truth. Never hard-code a colour, radius or duration — reference a token so light/dark and future re-skins stay free."
            >
              <Subsection title="Colour" hint="OKLCH · NUS Orange + NUS Blue on true-neutral graphite">
                <div className="grid gap-5 sm:grid-cols-3">
                  {colorGroups.map((group) => (
                    <div key={group.label} className="space-y-2">
                      <div className="text-ds-xs font-medium text-ds-fg-muted">
                        {group.label}
                      </div>
                      <div className="space-y-1.5">
                        {group.swatches.map((sw) => (
                          <div key={sw.name} className="flex items-center gap-2.5">
                            <span
                              className="size-7 shrink-0 rounded-ds-sm ds-hairline"
                              style={{ background: `var(${sw.varName})` }}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-mono text-ds-xs text-ds-fg">
                                {sw.name}
                              </div>
                              {sw.note && (
                                <div className="truncate text-ds-2xs text-ds-fg-subtle">
                                  {sw.note}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Subsection>

              <Subsection title="Radius" hint="Tightened scale — editorial, not bubbly">
                <TokenTable
                  rows={radiusTokens}
                  preview={(r) => (
                    <span
                      className="block size-9 bg-ds-primary-soft ds-hairline"
                      style={{ borderRadius: `var(--ds-radius-${r.name.replace('rounded-ds-', '')})` }}
                    />
                  )}
                />
              </Subsection>

              <Subsection title="Elevation" hint="Faint, honest shadows — depth, not drama">
                <TokenTable
                  rows={elevationTokens}
                  preview={(r) => (
                    <span
                      className="block size-9 rounded-ds-md bg-ds-surface-1"
                      style={{ boxShadow: `var(--ds-elevation-${r.name.replace('shadow-ds-', '')})` }}
                    />
                  )}
                />
              </Subsection>

              <Subsection title="Spacing" hint="4px base grid">
                <TokenTable
                  rows={spacingTokens}
                  preview={(r) => (
                    <span
                      className="block h-3 rounded-ds-xs bg-ds-primary"
                      style={{ width: `var(--ds-${r.name})` }}
                    />
                  )}
                />
              </Subsection>

              <Subsection title="Motion" hint="Fluent duration + easing">
                <div className="grid gap-5 lg:grid-cols-2">
                  <TokenTable rows={durationTokens} />
                  <TokenTable rows={easingTokens} />
                </div>
              </Subsection>

              <Subsection title="Typography">
                <Stage className="!flex-col !items-start gap-3">
                  <div className="text-ds-3xl font-semibold tracking-[-0.02em] text-ds-fg">
                    Display — 36px
                  </div>
                  <div className="text-ds-2xl font-semibold tracking-[-0.02em] text-ds-fg">
                    Heading — 28px
                  </div>
                  <div className="text-ds-lg font-semibold text-ds-fg">Subhead — 18px</div>
                  <div className="text-ds-base text-ds-fg">
                    Body — 15px. The default reading size for UI text.
                  </div>
                  <div className="text-ds-sm text-ds-fg-muted">
                    Secondary — 13px, muted. Captions and supporting copy.
                  </div>
                  <div className="font-mono text-ds-xs text-ds-fg-subtle">
                    Mono — JetBrains Mono, for code and tokens.
                  </div>
                </Stage>
              </Subsection>
            </GallerySection>

            {/* ===================== MATERIALS ======================== */}
            <MaterialsSection />

            {/* ===================== BACKGROUND ======================= */}
            <BackgroundSection />

            {/* ===================== CHROME & ICONS =================== */}
            <ChromeSection />

            {/* ===================== LAYOUT =========================== */}
            <GallerySection
              id="layout"
              title="Layout"
              description="Every page is built from the same scaffolding. Container sets the max-width; Section gives vertical rhythm; Stack handles flex gaps; PageHeader is the canonical page intro."
            >
              <Subsection title="Container widths">
                <div className="space-y-2">
                  {[
                    { w: 'reading', px: '728px', use: 'Long-form prose' },
                    { w: 'content', px: '1120px', use: 'Standard app content' },
                    { w: 'wide', px: '1320px', use: 'Dashboards, galleries' },
                  ].map((c) => (
                    <div key={c.w} className="flex items-center gap-3">
                      <span
                        className="h-7 rounded-ds-sm bg-ds-primary-soft ds-hairline"
                        style={{ width: `min(100%, ${c.px})`, maxWidth: '100%' }}
                      />
                      <span className="shrink-0 font-mono text-ds-xs text-ds-fg-muted">
                        {c.w} · {c.px}
                      </span>
                      <span className="shrink-0 text-ds-xs text-ds-fg-subtle">{c.use}</span>
                    </div>
                  ))}
                </div>
              </Subsection>

              <Subsection title="PageHeader" hint="eyebrow · title · description · actions">
                <Stage className="!block">
                  <PageHeader
                    eyebrow="Projects"
                    title="My work"
                    description="A canonical page intro — overline, title, supporting copy, and right-aligned actions."
                    actions={<Button size="sm">New project</Button>}
                  />
                </Stage>
              </Subsection>

              <Subsection title="Stack & Divider">
                <Stage>
                  <Stack direction="row" gap={2}>
                    <Badge>row</Badge>
                    <Badge>gap-2</Badge>
                    <Badge>flex</Badge>
                  </Stack>
                  <Divider orientation="vertical" />
                  <div className="flex-1">
                    <Divider label="section break" />
                  </div>
                </Stage>
              </Subsection>
            </GallerySection>

            {/* ===================== BUTTONS ========================== */}
            <ButtonsSection />

            {/* ===================== CARDS ============================ */}
            <CardsSection />

            {/* ===================== BADGES =========================== */}
            <GallerySection
              id="badges"
              title="Badges"
              description="Compact status and category markers. `soft` is the default — tinted background, coloured text. `solid` reads loudly."
            >
              <Subsection title="Tones — soft (default)">
                <Stage>
                  {(['neutral', 'primary', 'success', 'warning', 'error'] as const).map((t) => (
                    <Badge key={t} tone={t} className="capitalize">
                      {t}
                    </Badge>
                  ))}
                </Stage>
              </Subsection>
              <Subsection title="Appearances">
                <Stage>
                  <Badge tone="primary" appearance="soft">Soft</Badge>
                  <Badge tone="primary" appearance="solid">Solid</Badge>
                  <Badge tone="primary" appearance="outline">Outline</Badge>
                  <Badge tone="success" dot>With dot</Badge>
                </Stage>
              </Subsection>
            </GallerySection>

            {/* ===================== FORMS ============================ */}
            <GallerySection
              id="forms"
              title="Forms"
              description="Text controls sit on an inset surface so they read as recessed wells. Always wrap a control in Field — it pairs the label, hint and error consistently."
            >
              <Subsection title="Inputs & Field">
                <Stage inset className="!flex-col !items-stretch">
                  <div className="grid w-full gap-4 sm:grid-cols-2">
                    <Field label="Full name" htmlFor="g-name" required>
                      <Input id="g-name" placeholder="Silan Hu" />
                    </Field>
                    <Field label="Search" htmlFor="g-search" hint="Press / to focus">
                      <Input id="g-search" placeholder="Search…" leadingIcon={<Sparkles />} />
                    </Field>
                    <Field label="Email" htmlFor="g-email" error="That email address looks invalid.">
                      <Input id="g-email" defaultValue="not-an-email" invalid />
                    </Field>
                    <Field label="Disabled" htmlFor="g-disabled">
                      <Input id="g-disabled" placeholder="Unavailable" disabled />
                    </Field>
                  </div>
                  <Field label="Message" htmlFor="g-msg" className="w-full">
                    <Textarea id="g-msg" placeholder="Write something…" rows={3} />
                  </Field>
                </Stage>
              </Subsection>
              <Subsection title="Sizes">
                <Stage inset>
                  <Input size="sm" placeholder="Small" className="w-32" />
                  <Input size="md" placeholder="Medium" className="w-32" />
                  <Input size="lg" placeholder="Large" className="w-32" />
                </Stage>
              </Subsection>
            </GallerySection>

            {/* ===================== CONTROLS ========================= */}
            <ControlsSection />

            {/* ===================== OVERLAYS ========================= */}
            <OverlaysSection />

            {/* ===================== NAVIGATION ======================= */}
            <NavigationSection />

            {/* ===================== DATA DISPLAY ===================== */}
            <DataSection />

            {/* ===================== FEEDBACK ========================= */}
            <FeedbackSection />

            {/* ===================== BRAND & STATES =================== */}
            <BrandSection />

            <Divider />
            <p className="pb-8 text-ds-xs text-ds-fg-subtle">
              Silan Design System · Fluent skeleton, glass materials, NUS
              brand palette. Import components from{' '}
              <code className="font-mono text-ds-primary">@/components/ds</code>.
            </p>
          </div>
        </div>
      </Container>
    </ToastProvider>
  );
};

export default Gallery;
