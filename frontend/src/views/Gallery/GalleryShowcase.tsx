// src/views/Gallery/GalleryShowcase.tsx
//
// The interactive component-showcase sections of /gallery — split out of
// index.tsx so each stays readable. Each export is one <GallerySection>.
import React from 'react';
import {
  MousePointerClick,
  Search,
  Github,
  Star,
  Inbox,
  Layers,
  Sparkles,
  Activity,
  Users,
  GitBranch,
  Download,
  Trash2,
  Settings,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Bell,
  Home,
  Linkedin,
} from 'lucide-react';
import {
  Button,
  IconButton,
  NoiseBackground,
  Logo,
  LogoMark,
  BrandLoading,
  ErrorState,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  StatCard,
  ProjectCard,
  BlogCard,
  MomentCard,
  ArticleHeader,
  BlogHeader,
  ProfileHero,
  EpisodeList,
  TableOfContents,
  Badge,
  Field,
  Tabs,
  Divider,
  Skeleton,
  Spinner,
  Alert,
  EmptyState,
  Avatar,
  Modal,
  Tooltip,
  Dropdown,
  useToast,
  Switch,
  Checkbox,
  RadioGroup,
  Select,
  Progress,
  Segmented,
  Breadcrumb,
  Accordion,
  Table,
} from '../../components/ds';
import { GallerySection, Subsection, Stage, CodeSnippet } from './GalleryPrimitives';

/* ============================ MATERIALS ================================== */

export const MaterialsSection: React.FC = () => (
  <GallerySection
    id="materials"
    title="Materials"
    description="Depth is physical. Surfaces layer a backdrop blur, a tint fill, a crisp top-edge highlight and a soft inner glow. Acrylic is the working glass; Mica is the quieter window base; spotlight and reveal track the cursor."
  >
    <Subsection title="Glass surfaces" hint="hover the reveal/spotlight cards">
      {/* A textured backdrop so the glass actually has something to frost. */}
      <div
        className="relative overflow-hidden rounded-ds-lg p-8"
        style={{
          background:
            'radial-gradient(420px circle at 18% 22%, var(--ds-color-primary-soft), transparent 60%), radial-gradient(380px circle at 82% 78%, var(--ds-color-success-soft), transparent 55%), var(--ds-color-surface-2)',
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card variant="glass" className="h-32">
            <CardTitle className="text-ds-base">Acrylic</CardTitle>
            <CardDescription>Frosted glass — edge highlight + inner glow.</CardDescription>
          </Card>
          <Card variant="mica" className="h-32">
            <CardTitle className="text-ds-base">Mica</CardTitle>
            <CardDescription>Quiet window-base material, deeper blur.</CardDescription>
          </Card>
          <Card variant="glass" spotlight className="h-32">
            <CardTitle className="text-ds-base">Spotlight</CardTitle>
            <CardDescription>A glow follows your cursor.</CardDescription>
          </Card>
          <Card variant="elevated" reveal className="h-32">
            <CardTitle className="text-ds-base">Reveal border</CardTitle>
            <CardDescription>The border lights up near the cursor.</CardDescription>
          </Card>
        </div>
      </div>
    </Subsection>

    <Subsection title="Surface elevation" hint="solid surfaces, faint honest shadows">
      <Stage inset>
        {(['flat', 'elevated', 'inset', 'outline'] as const).map((v) => (
          <Card key={v} variant={v} padding="sm" className="w-36">
            <div className="text-ds-sm font-medium capitalize text-ds-fg">{v}</div>
          </Card>
        ))}
      </Stage>
    </Subsection>
  </GallerySection>
);

/* ============================ BUTTONS ==================================== */

export const ButtonsSection: React.FC = () => (
  <GallerySection
    id="buttons"
    title="Buttons"
    description="The primary control. Exactly one `primary` button per surface; everything else is secondary, outline or ghost. Press feedback is a subtle scale-down; hover lifts elevation."
  >
    <Subsection title="Variants">
      <Stage>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="subtle">Subtle</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="link">Link</Button>
      </Stage>
    </Subsection>
    <Subsection title="Sizes & icons">
      <Stage>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Search">
          <Search />
        </Button>
        <Button leadingIcon={<MousePointerClick />}>With icon</Button>
        <Button variant="secondary" trailingIcon={<Github />}>
          GitHub
        </Button>
      </Stage>
    </Subsection>
    <Subsection title="States">
      <Stage>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
        <Button variant="danger" leadingIcon={<Trash2 />}>
          Delete
        </Button>
        <Button block className="max-w-xs">
          Full width
        </Button>
      </Stage>
    </Subsection>
    <CodeSnippet
      code={`import { Button } from '@/components/ds';

<Button variant="primary" leadingIcon={<Save />}>
  Save changes
</Button>`}
    />
  </GallerySection>
);

/* ============================ CARDS ====================================== */

export const CardsSection: React.FC = () => {
  // Live state for the BlogHeader demo below.
  const [blogSearch, setBlogSearch] = React.useState('');
  const [blogType, setBlogType] = React.useState('all');
  const [blogTag, setBlogTag] = React.useState('All');
  // Live state for the TableOfContents demo.
  const [tocActive, setTocActive] = React.useState('toc-3');

  return (
  <GallerySection
    id="cards"
    title="Cards"
    description="A surface system. Beyond the base variants there are purpose-built cards: StatCard for metrics, MediaCard for galleries, plus reveal/spotlight materials."
  >
    <Subsection title="Stat cards" hint="metrics with trend">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Visitors" value="48.2k" delta="+12.4%" trend="up" icon={<Users />} />
        <StatCard label="Projects" value="27" delta="+3 this month" trend="up" icon={<GitBranch />} />
        <StatCard label="Bounce rate" value="34%" delta="-2.1%" trend="down" icon={<Activity />} />
        <StatCard label="Open issues" value="9" delta="No change" trend="flat" icon={<Layers />} />
      </div>
    </Subsection>

    <Subsection title="Composed card" hint="header · content · footer">
      <Stage inset>
        <Card className="w-full max-w-sm" spotlight>
          <CardHeader action={<Badge tone="success" dot>Live</Badge>}>
            <CardTitle>Project Aurora</CardTitle>
            <CardDescription>A real-time content engine in Rust.</CardDescription>
          </CardHeader>
          <CardContent className="mt-3 text-ds-sm text-ds-fg-muted">
            Header, content and footer compose the standard card. Actions live
            in the footer, right-aligned.
          </CardContent>
          <CardFooter className="mt-4">
            <Button variant="ghost" size="sm">
              Details
            </Button>
            <Button size="sm">Open</Button>
          </CardFooter>
        </Card>
      </Stage>
    </Subsection>

    <Subsection title="Variants">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(['elevated', 'flat', 'inset', 'outline', 'glass', 'mica'] as const).map((v) => (
          <Card key={v} variant={v} interactive={v === 'elevated'}>
            <CardTitle className="text-ds-base capitalize">{v}</CardTitle>
            <CardDescription>The `{v}` surface variant.</CardDescription>
          </Card>
        ))}
      </div>
    </Subsection>

    <Subsection title="ProjectCard" hint="branded placeholder · tag chips · hover">
      <Stage inset className="!block">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ProjectCard
            project={{
              id: 'silan-personal-website',
              title: 'Silan Personal Website',
              description:
                'An AI-powered resume & content platform — Rust engine, Go backend, React frontend.',
              tags: ['React', 'TypeScript', 'Go', 'Rust', 'Tailwind', 'Vite'],
              year: 2025,
              author: 'Silan Hu',
              status: { label: 'Active', tone: 'success' },
              githubUrl: '#',
              demoUrl: '#',
            }}
            onOpen={() => {}}
          />
          <ProjectCard
            project={{
              id: 'easynet-axon',
              title: 'EasyNet Axon',
              description: 'The runtime and ability ledger for the EasyNet edge-agent platform.',
              tags: ['Rust', 'gRPC', 'Protobuf'],
              year: 2024,
              author: 'Silan Hu',
              status: { label: 'Archived', tone: 'neutral' },
              githubUrl: '#',
            }}
            onOpen={() => {}}
          />
        </div>
      </Stage>
    </Subsection>

    <Subsection
      title="ProjectCard — cover sizes"
      hint="compact · standard · tall are vertical; feature is a wide horizontal card"
    >
      <Stage inset className="!block">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(['compact', 'standard', 'tall'] as const).map((sz) => (
            <ProjectCard
              key={sz}
              coverSize={sz}
              project={{
                id: `cover-${sz}`,
                title: `Cover — ${sz}`,
                description: `The cover uses coverSize="${sz}".`,
                tags: ['design', 'cover'],
                year: 2025,
              }}
              onOpen={() => {}}
            />
          ))}
        </div>
        {/* feature — a full-width horizontal card. */}
        <div className="mt-4">
          <ProjectCard
            coverSize="feature"
            project={{
              id: 'cover-feature',
              title: 'Feature card — wide layout',
              description:
                'coverSize="feature" lays the card out horizontally — a large cover on the left, content on the right. Use it for a pinned or hero project that should span the full row.',
              tags: ['hero', 'pinned', 'wide', 'feature'],
              year: 2025,
              status: { label: 'Active', tone: 'success' },
              githubUrl: '#',
              demoUrl: '#',
            }}
            onOpen={() => {}}
          />
        </div>
      </Stage>
    </Subsection>

    <Subsection
      title="ProjectCard — live demo & video cover"
      hint="any cover content (image / video / iframe / placeholder) works at any coverSize"
    >
      <Stage inset className="!block">
        {/* A live-preview cover in the standard vertical card. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ProjectCard
            coverSize="tall"
            project={{
              id: 'live-demo-tall',
              title: 'Live Preview — tall',
              description: 'The cover is a scaled, non-interactive iframe of the demo site.',
              tags: ['iframe', 'preview'],
              year: 2025,
              status: { label: 'Active', tone: 'success' },
              demoUrl: window.location.origin,
              livePreview: true,
            }}
            onOpen={() => {}}
          />
        </div>
        {/* The same live-preview cover in the wide feature card. */}
        <div className="mt-4">
          <ProjectCard
            coverSize="feature"
            project={{
              id: 'live-demo-feature',
              title: 'Live Preview — feature',
              description:
                'A live iframe preview works in the wide feature layout too — the iframe rescales to the larger cover automatically.',
              tags: ['iframe', 'preview', 'feature'],
              year: 2025,
              status: { label: 'Active', tone: 'success' },
              demoUrl: window.location.origin,
              livePreview: true,
              githubUrl: '#',
            }}
            onOpen={() => {}}
          />
        </div>
      </Stage>
    </Subsection>

    <Subsection title="BlogCard" hint="article / series · date · author · read time">
      <Stage inset className="!block">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <BlogCard
            post={{
              id: 'vision-behind-silan',
              title: 'The Vision Behind Silan Personal Website',
              excerpt:
                'Exploring the initial concept and significance of the project — a new approach to professional online presence.',
              tags: ['innovation', 'vision', 'silan-website'],
              date: '7/16/2024',
              author: 'Silan Hu',
              readTime: '5 min read',
              kind: 'article',
            }}
            onOpen={() => {}}
          />
          <BlogCard
            post={{
              id: 'usage-guide-series',
              title: 'Silan Personal Website Usage Guide',
              excerpt: 'A step-by-step usage guide for the Silan Personal Website platform.',
              tags: ['tutorial', 'markdown', 'content-management'],
              date: '7/16/2024',
              author: 'Silan Hu',
              kind: 'series',
              episodeCount: 2,
            }}
            onOpen={() => {}}
          />
        </div>
        <div className="mt-4">
          <BlogCard
            coverSize="feature"
            post={{
              id: 'feature-blog',
              title: 'Feature article — wide layout',
              excerpt:
                'BlogCard supports the same coverSize prop as ProjectCard. The feature layout is a wide horizontal card for a pinned or hero post.',
              tags: ['feature', 'wide', 'editorial'],
              date: '5/17/2026',
              author: 'Silan Hu',
              readTime: '8 min read',
              kind: 'article',
            }}
            onOpen={() => {}}
          />
        </div>
      </Stage>
    </Subsection>

    <Subsection
      title="BlogHeader"
      hint="blog index page header — hero + search + content-type Segmented + topic chips"
    >
      <Stage inset className="!block">
        <BlogHeader
          eyebrow="Writing"
          title="Blog"
          description="Thoughts, insights, and tutorials on AI, software development, and emerging technologies."
          search={blogSearch}
          onSearchChange={setBlogSearch}
          searchPlaceholder="Search articles…"
          selectedType={blogType}
          onTypeChange={setBlogType}
          typeOptions={[
            { value: 'all', label: 'All' },
            { value: 'article', label: 'Articles' },
            { value: 'vlog', label: 'Videos' },
            { value: 'series', label: 'Series' },
          ]}
          tags={['All', 'AI', 'Systems', 'Frontend', 'Rust', 'Education', 'Research']}
          selectedTag={blogTag}
          onTagChange={setBlogTag}
        />
      </Stage>
    </Subsection>

    <Subsection
      title="ProfileHero"
      hint="résumé / about hero — name + brand-gradient role + contacts + socials"
    >
      <Stage inset className="!block">
        <ProfileHero
          name="Silan Hu"
          role="AI Researcher & Full Stack Developer"
          tagline="Building agent infrastructure and behaviour-versioned knowledge systems."
          contacts={[
            { type: 'email', value: 'silan.hu@u.nus.edu' },
            { type: 'phone', value: '+65 8698 6181' },
            { type: 'location', value: 'Singapore / Beijing, China' },
          ]}
          socials={[
            { label: 'LinkedIn', url: 'https://linkedin.com/in/Qingbolan', icon: <Linkedin /> },
            { label: 'GitHub', url: 'https://github.com/Qingbolan', icon: <Github /> },
          ]}
        />
      </Stage>
    </Subsection>

    <Subsection
      title="ArticleHeader"
      hint="blog / episode detail header — title-led, byline, tags, stats footer"
    >
      <Stage inset className="!block">
        <ArticleHeader
          className="mx-auto max-w-3xl"
          article={{
            title:
              'Silan Personal Website Usage Guide — Part 2: Content Management and Customization',
            summary:
              'A step-by-step walkthrough of managing content and customising the platform.',
            author: 'Silan Hu',
            date: '7/16/2024',
            readTime: '17 min read',
            episode: 'Episode 2 / 2',
            tags: ['tutorial', 'markdown', 'content-management'],
            views: 25,
            likes: 0,
          }}
          onLike={() => {}}
          onShare={() => {}}
        />
      </Stage>
    </Subsection>

    <Subsection
      title="EpisodeList"
      hint="series episode navigator — current episode highlighted, others jump"
    >
      <Stage inset className="!block">
        <EpisodeList
          className="mx-auto max-w-sm"
          title="Series Episodes"
          currentId="ep-2"
          onSelect={() => {}}
          items={[
            { id: 'ep-1', title: 'Usage Guide — Part 1: Getting Started', episodeNumber: 1, durationMinutes: 12 },
            { id: 'ep-2', title: 'Usage Guide — Part 2: Content Management', episodeNumber: 2, durationMinutes: 17 },
            { id: 'ep-3', title: 'Usage Guide — Part 3: Customization & Theming', episodeNumber: 3, durationMinutes: 14 },
          ]}
        />
      </Stage>
    </Subsection>

    <Subsection
      title="TableOfContents"
      hint="document outline — depth by indent + type ramp, active heading on a rail"
    >
      <Stage inset className="!block">
        <TableOfContents
          className="mx-auto max-w-sm"
          title="Outline"
          activeId={tocActive}
          onSelect={setTocActive}
          items={[
            { id: 'toc-1', title: 'Silan Personal Website Usage Guide', level: 1 },
            { id: 'toc-2', title: 'Understanding the Content System', level: 2 },
            { id: 'toc-3', title: 'File-Based Content Management', level: 3 },
            { id: 'toc-4', title: 'Content Types and Structure', level: 3 },
            { id: 'toc-5', title: 'Blog Posts', level: 1 },
            { id: 'toc-6', title: 'Project Documentation', level: 1 },
            { id: 'toc-7', title: 'Content Management with the CLI', level: 2 },
            { id: 'toc-8', title: 'Creating New Content', level: 3 },
            { id: 'toc-9', title: 'Theming and Styling', level: 1 },
            { id: 'toc-10', title: 'Modifying the Color Scheme', level: 2 },
          ]}
        />
      </Stage>
    </Subsection>

    <Subsection
      title="MomentCard"
      hint="dashed pinboard card · lifecycle status · linked blog/project counts"
    >
      <Stage inset className="!block">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              { status: 'draft', title: 'On-device personalised tutoring', b: 0, p: 0 },
              { status: 'hypothesis', title: 'Latency-aware video diffusion', b: 1, p: 0 },
              { status: 'experimenting', title: 'Edge-agent ability ledgers', b: 2, p: 1 },
              { status: 'validating', title: 'OKLCH theming at scale', b: 1, p: 2 },
              { status: 'published', title: 'FOKE personalised education framework', b: 4, p: 1 },
              { status: 'concluded', title: 'Browser-style portfolio navigation', b: 3, p: 1 },
            ] as const
          ).map((it, i) => (
            <MomentCard
              key={it.status}
              moment={{
                id: `moment-${it.status}`,
                title: it.title,
                description:
                  'A research moment moving through the lifecycle - the status marker tracks its stage.',
                status: it.status,
                category: 'Research',
                tags: ['ai', 'research', i % 2 ? 'systems' : 'ml'],
                date: '2025',
                linkedBlogs: it.b,
                linkedProjects: it.p,
              }}
              onOpen={() => {}}
            />
          ))}
        </div>
        {/* feature - wide horizontal moment card. */}
        <div className="mt-4">
          <MomentCard
            size="feature"
            moment={{
              id: 'moment-feature',
              title: 'FOKE — a personalised education framework built on LLMs',
              description:
                'The feature layout puts the title block on the left and the elaboration on the right. The title leads as the clear focal point; status, category, links and date stay quiet as supporting metadata.',
              status: 'published',
              category: 'Research · Education',
              tags: ['llm', 'education', 'framework', 'foke'],
              date: '2025',
              linkedBlogs: 4,
              linkedProjects: 1,
            }}
            onOpen={() => {}}
          />
        </div>
      </Stage>
    </Subsection>
  </GallerySection>
  );
};

/* ============================ CONTROLS =================================== */

export const ControlsSection: React.FC = () => {
  const [sw, setSw] = React.useState(true);
  const [cb, setCb] = React.useState(true);
  const [cb2, setCb2] = React.useState(false);
  const [radio, setRadio] = React.useState('comfortable');
  const [sel, setSel] = React.useState('rust');

  return (
    <GallerySection
      id="controls"
      title="Form controls"
      description="Switch, Checkbox, Radio and Select. All controlled, label-aware, and consistent with the input surfaces."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Subsection title="Switch & Checkbox">
          <Stage inset className="!flex-col !items-start gap-3">
            <Switch checked={sw} onChange={setSw} label="Email notifications" />
            <Switch checked={!sw} onChange={(v) => setSw(!v)} label="Compact mode" size="sm" />
            <Switch checked={false} onChange={() => {}} label="Disabled" disabled />
            <Divider />
            <Checkbox checked={cb} onChange={setCb} label="Subscribe to updates" />
            <Checkbox checked={cb2} onChange={setCb2} label="Make profile public" />
            <Checkbox checked={false} indeterminate onChange={() => {}} label="Indeterminate" />
          </Stage>
        </Subsection>

        <Subsection title="Radio & Select">
          <Stage inset className="!flex-col !items-stretch gap-4">
            <RadioGroup
              value={radio}
              onChange={setRadio}
              options={[
                { value: 'compact', label: 'Compact', description: 'Denser spacing.' },
                { value: 'comfortable', label: 'Comfortable', description: 'The default.' },
                { value: 'spacious', label: 'Spacious', description: 'Roomy layout.' },
              ]}
            />
            <Field label="Primary language" htmlFor="g-lang">
              <Select
                id="g-lang"
                value={sel}
                onChange={(e) => setSel(e.target.value)}
                options={[
                  { value: 'rust', label: 'Rust' },
                  { value: 'go', label: 'Go' },
                  { value: 'ts', label: 'TypeScript' },
                  { value: 'py', label: 'Python' },
                ]}
              />
            </Field>
          </Stage>
        </Subsection>
      </div>
    </GallerySection>
  );
};

/* ============================ OVERLAYS =================================== */

export const OverlaysSection: React.FC = () => {
  const [modalOpen, setModalOpen] = React.useState(false);
  const toast = useToast();

  return (
    <GallerySection
      id="overlays"
      title="Overlays"
      description="Modal, Dropdown, Tooltip and Toast. All portalled onto an Acrylic surface, with Fluent entrance choreography."
    >
      <Subsection title="Modal & Toast">
        <Stage>
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="secondary" onClick={() => toast.success('Saved', 'Your changes are live.')}>
            Success toast
          </Button>
          <Button variant="secondary" onClick={() => toast.error('Failed', 'Could not reach the server.')}>
            Error toast
          </Button>
          <Button variant="secondary" onClick={() => toast.info('Heads up', 'A new version is available.')}>
            Info toast
          </Button>
        </Stage>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Delete project?"
          description="This permanently removes Project Aurora and all of its issues. This cannot be undone."
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>
                Delete
              </Button>
            </>
          }
        >
          <p className="text-ds-sm text-ds-fg-muted">
            Type the project name to confirm in a real flow — this is a demo.
          </p>
        </Modal>
      </Subsection>

      <Subsection title="Dropdown & Tooltip">
        <Stage>
          <Dropdown
            trigger={<Button variant="secondary" trailingIcon={<Settings />}>Actions</Button>}
            items={[
              { key: 'edit', label: 'Edit', icon: <MousePointerClick /> },
              { key: 'dl', label: 'Download', icon: <Download /> },
              { key: 'star', label: 'Add to favourites', icon: <Star />, selected: true },
              'separator',
              { key: 'del', label: 'Delete', icon: <Trash2 />, danger: true },
            ]}
          />
          <Tooltip content="This is a tooltip" side="top">
            <Button variant="outline">Hover me (top)</Button>
          </Tooltip>
          <Tooltip content="Shown on the right" side="right">
            <Button variant="outline">Hover me (right)</Button>
          </Tooltip>
        </Stage>
      </Subsection>
    </GallerySection>
  );
};

/* ============================ NAVIGATION ================================= */

export const NavigationSection: React.FC = () => {
  const [tab, setTab] = React.useState('overview');
  const [seg, setSeg] = React.useState('grid');

  return (
    <GallerySection
      id="navigation"
      title="Navigation"
      description="Tabs, Segmented control, Breadcrumb and Avatars. Active indicators animate with a shared layout transition."
    >
      <Subsection title="Tabs" hint="underline + pill">
        <Stage className="!block space-y-4">
          <Tabs
            appearance="underline"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'overview', label: 'Overview' },
              { value: 'activity', label: 'Activity', badge: 12 },
              { value: 'settings', label: 'Settings' },
              { value: 'archived', label: 'Archived', disabled: true },
            ]}
          />
          <Tabs
            appearance="pill"
            defaultValue="grid"
            items={[
              { value: 'grid', label: 'Grid' },
              { value: 'list', label: 'List' },
              { value: 'board', label: 'Board' },
            ]}
          />
        </Stage>
      </Subsection>

      <Subsection title="Tabs — vertical" hint="left-rail nav, for docs-style detail pages">
        <Stage className="!block">
          <div className="max-w-xs">
            <Tabs
              appearance="vertical"
              defaultValue="info"
              items={[
                { value: 'info', label: 'Info', icon: <Home /> },
                { value: 'activity', label: 'Activity', icon: <Activity />, badge: 12 },
                { value: 'members', label: 'Members', icon: <Users /> },
                { value: 'inbox', label: 'Inbox', icon: <Inbox /> },
                { value: 'settings', label: 'Settings', icon: <Settings /> },
              ]}
            />
          </div>
        </Stage>
      </Subsection>

      <Subsection title="Segmented & Breadcrumb">
        <Stage className="!flex-col !items-start gap-4">
          <Segmented
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'list', label: 'List' },
              { value: 'map', label: 'Map' },
            ]}
          />
          <Breadcrumb
            items={[
              { label: 'Home', href: '#' },
              { label: 'Projects', href: '#' },
              { label: 'Aurora' },
            ]}
          />
        </Stage>
      </Subsection>

      <Subsection title="Avatars">
        <Stage>
          <Avatar name="Silan Hu" size="xs" />
          <Avatar name="Silan Hu" size="sm" />
          <Avatar name="Ada Lovelace" size="md" />
          <Avatar name="Grace Hopper" size="lg" />
          <Avatar name="Alan Turing" size="xl" square />
        </Stage>
      </Subsection>
    </GallerySection>
  );
};

/* ============================ DATA DISPLAY =============================== */

interface DemoRow {
  id: string;
  name: string;
  status: string;
  stars: number;
}

const demoRows: DemoRow[] = [
  { id: '1', name: 'silan-viking', status: 'Active', stars: 128 },
  { id: '2', name: 'portfolio-engine', status: 'Active', stars: 64 },
  { id: '3', name: 'easynet-axon', status: 'Archived', stars: 32 },
];

export const DataSection: React.FC = () => (
  <GallerySection
    id="data"
    title="Data display"
    description="Progress, Accordion and Table. Built for dashboards and content lists."
  >
    <Subsection title="Progress">
      <Stage inset className="!flex-col !items-stretch gap-3">
        <Progress value={72} showValue />
        <Progress value={45} tone="success" showValue />
        <Progress value={88} tone="warning" size="sm" showValue />
        <Progress value={20} tone="error" showValue />
      </Stage>
    </Subsection>

    <Subsection title="Accordion">
      <Accordion
        defaultOpen={['a']}
        items={[
          { key: 'a', title: 'What is the design system?', content: 'A Fluent-skeleton component library on the NUS brand palette — see this gallery.' },
          { key: 'b', title: 'How do I use a component?', content: "Import from '@/components/ds'. Every component is typed and documented inline." },
          { key: 'c', title: 'Can I theme it?', content: 'Yes — all colours are OKLCH tokens driven by ThemeContext, so light/dark are free.' },
        ]}
      />
    </Subsection>

    <Subsection title="Table">
      <Table<DemoRow>
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', header: 'Repository', render: (r) => <span className="font-medium">{r.name}</span> },
          {
            key: 'status',
            header: 'Status',
            render: (r) => (
              <Badge tone={r.status === 'Active' ? 'success' : 'neutral'} size="sm">
                {r.status}
              </Badge>
            ),
          },
          { key: 'stars', header: 'Stars', align: 'right', render: (r) => <span className="font-mono">{r.stars}</span> },
        ]}
        rows={demoRows}
      />
    </Subsection>
  </GallerySection>
);

/* ============================ FEEDBACK =================================== */

export const FeedbackSection: React.FC = () => (
  <GallerySection
    id="feedback"
    title="Feedback"
    description="Loading, inline messages and empty states — so every page handles these the same way."
  >
    <Subsection title="Alerts">
      <div className="space-y-3">
        <Alert tone="info" title="Heads up">An informational message with supporting detail.</Alert>
        <Alert tone="success" title="Saved">Your changes were saved successfully.</Alert>
        <Alert tone="warning" title="Check this">This action affects published content.</Alert>
        <Alert tone="error" title="Something went wrong">The request failed. Try again in a moment.</Alert>
      </div>
    </Subsection>

    <Subsection title="Loading">
      <Stage inset className="!items-start">
        <div className="flex items-center gap-4">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
        </div>
        <Divider orientation="vertical" className="h-16" />
        <div className="w-56 space-y-2">
          <Skeleton shape="line" className="w-2/3" />
          <Skeleton shape="line" />
          <Skeleton shape="line" className="w-1/2" />
          <Skeleton shape="block" className="mt-2 h-12" />
        </div>
      </Stage>
    </Subsection>

    <Subsection title="Empty state">
      <Stage inset className="!block">
        <EmptyState
          icon={<Inbox />}
          title="No projects yet"
          description="When you publish a project it will show up here."
          action={<Button size="sm" leadingIcon={<Sparkles />}>Create your first</Button>}
        />
      </Stage>
    </Subsection>
  </GallerySection>
);

/* ============================ BACKGROUND ================================= */

export const BackgroundSection: React.FC = () => (
  <GallerySection
    id="background"
    title="Background"
    description="NoiseBackground is the diffusion-style backdrop layer — offset colour blobs frayed by an SVG turbulence-displacement filter, over a fine Gaussian-noise grain. It powers the app desk; drop it behind any large surface."
  >
    <Subsection title="Glow modes" hint="the desk uses nus-duo">
      <div className="grid gap-4 sm:grid-cols-3">
        {(['none', 'nus', 'nus-duo'] as const).map((g) => (
          <div
            key={g}
            className="relative h-40 overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface-2"
          >
            <NoiseBackground glow={g} intensity={0.06} />
            <div className="relative z-10 flex h-full items-end p-3">
              <span className="font-mono text-ds-xs text-ds-fg">glow=&quot;{g}&quot;</span>
            </div>
          </div>
        ))}
      </div>
    </Subsection>

    <Subsection title="Grain intensity">
      <div className="grid gap-4 sm:grid-cols-3">
        {[0.03, 0.07, 0.12].map((i) => (
          <div
            key={i}
            className="relative h-32 overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface-2"
          >
            <NoiseBackground glow="nus" intensity={i} />
            <div className="relative z-10 flex h-full items-end p-3">
              <span className="font-mono text-ds-xs text-ds-fg">intensity={i}</span>
            </div>
          </div>
        ))}
      </div>
    </Subsection>

    <CodeSnippet
      code={`<div className="relative">
  <NoiseBackground glow="nus-duo" intensity={0.06} />
  <main className="relative z-10">…</main>
</div>`}
    />
  </GallerySection>
);

/* ============================ CHROME & ICONS ============================= */

export const ChromeSection: React.FC = () => (
  <GallerySection
    id="chrome"
    title="Chrome & Icons"
    description="IconButton is the square, icon-only control for toolbars and chrome — toolbar actions and dense UI where a labelled Button is too wide."
  >
    <Subsection title="IconButton variants">
      <Stage>
        <IconButton label="Search" variant="ghost"><Search /></IconButton>
        <IconButton label="Primary" variant="primary"><Bell /></IconButton>
        <IconButton label="Surface" variant="surface"><Settings /></IconButton>
        <IconButton label="Glass" variant="glass"><Star /></IconButton>
      </Stage>
    </Subsection>

    <Subsection title="Sizes & shapes">
      <Stage>
        <IconButton label="Small" size="sm" variant="surface"><Home /></IconButton>
        <IconButton label="Medium" size="md" variant="surface"><Home /></IconButton>
        <IconButton label="Large" size="lg" variant="surface"><Home /></IconButton>
        <IconButton label="Round" shape="round" variant="surface"><Home /></IconButton>
        <IconButton label="With tooltip" variant="ghost" showTooltip><Download /></IconButton>
      </Stage>
    </Subsection>

    <Subsection title="Chrome capsule" hint="control + address + tools">
      <Stage inset>
        <div className="flex w-full items-center gap-2.5">
          {/* Control capsule */}
          <div className="flex items-center gap-0.5 rounded-full bg-ds-surface-1 p-1 shadow-ds-1">
            <IconButton label="Back" size="sm" shape="round" variant="ghost"><ArrowLeft /></IconButton>
            <IconButton label="Forward" size="sm" shape="round" variant="ghost"><ArrowRight /></IconButton>
            <IconButton label="Reload" size="sm" shape="round" variant="ghost"><RotateCw /></IconButton>
          </div>
          {/* Address bar */}
          <div className="flex flex-1 items-center justify-center rounded-full bg-ds-surface-1 px-4 py-2 text-ds-sm text-ds-fg-muted shadow-ds-1">
            <Home className="mr-1.5 size-3.5" /> Home
          </div>
          {/* Tool icons */}
          <div className="flex items-center gap-0.5 rounded-full bg-ds-surface-1 p-1 shadow-ds-1">
            <IconButton label="Search" size="sm" shape="round" variant="ghost"><Search /></IconButton>
            <IconButton label="Notifications" size="sm" shape="round" variant="ghost"><Bell /></IconButton>
          </div>
        </div>
      </Stage>
    </Subsection>
  </GallerySection>
);

/* ============================ BRAND & STATES ============================= */

export const BrandSection: React.FC = () => (
  <GallerySection
    id="brand"
    title="Brand & States"
    description="The Silan mark, plus the branded app-level states — loading and error — that carry it. Use BrandLoading for boot/route splashes and ErrorState for failed regions; ErrorBoundary wraps the route tree."
  >
    <Subsection title="Logo" hint="mark · wordmark · full lockup">
      <Stage>
        <LogoMark size="md" />
        <LogoMark size="lg" />
        <Logo variant="wordmark" />
        <Logo variant="full" size="lg" />
        <Logo variant="mark" size="xl" animated />
      </Stage>
    </Subsection>

    <Subsection title="BrandLoading" hint="inline variant — the mark draws itself in">
      <Stage inset className="!block !p-0">
        <BrandLoading inline message="Loading content" />
      </Stage>
    </Subsection>

    <Subsection title="Error — inline & card">
      <div className="space-y-4">
        <ErrorState
          variant="inline"
          title="Couldn't save"
          description="The form has unsaved changes."
          error={new Error('PATCH /api/profile → 422')}
          onRetry={() => {}}
        />
        <ErrorState
          variant="card"
          title="Failed to load projects"
          description="The project list couldn't be fetched."
          error={new Error('GET /api/projects → 500')}
          onRetry={() => {}}
        />
      </div>
    </Subsection>

    <Subsection title="Error — page" hint="brand mark + red slash · used by ErrorBoundary & 404">
      <div className="overflow-hidden rounded-ds-lg border border-ds-border">
        <ErrorState
          variant="page"
          title="Something broke"
          description="A part of the app crashed unexpectedly. You can retry or head home."
          error={new Error("Cannot read properties of undefined (reading 'map')")}
          onRetry={() => {}}
        />
      </div>
    </Subsection>
  </GallerySection>
);
