// Silan Design System — public component surface.
//
// Import design-system components from here:
//   import { Button, Card, Badge } from '@/components/ds';
//
// Design language: Fluent skeleton (token architecture, motion curves,
// layered surfaces, faint honest elevation) on the NUS brand palette
// (NUS Orange primary + NUS Blue accent, true-neutral graphite). See /gallery for the
// living reference and DESIGN.md for the written spec.

export { Button, buttonVariants } from './Button';
export type { ButtonProps } from './Button';

export { IconButton, iconButtonVariants } from './IconButton';
export type { IconButtonProps } from './IconButton';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  StatCard,
  MediaCard,
  cardVariants,
} from './Card';
export type { CardProps, StatCardProps, MediaCardProps } from './Card';

export { useSpotlight } from './useSpotlight';

export { Badge, badgeVariants } from './Badge';
export type { BadgeProps } from './Badge';

export { Input, Textarea, Field } from './Input';
export type { InputProps, TextareaProps, FieldProps } from './Input';

export { Tabs } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

export {
  Container,
  Section,
  Stack,
  PageHeader,
  Divider,
} from './Layout';
export type {
  ContainerProps,
  SectionProps,
  StackProps,
  PageHeaderProps,
  DividerProps,
} from './Layout';

export { Skeleton, Spinner, Alert, EmptyState } from './Feedback';
export type {
  SkeletonProps,
  SpinnerProps,
  AlertProps,
  EmptyStateProps,
} from './Feedback';

export { Avatar } from './Avatar';
export type { AvatarProps } from './Avatar';

export { ProjectCard } from './ProjectCard';
export type { ProjectCardProps, ProjectCardData, CoverSize } from './ProjectCard';

export { BlogCard } from './BlogCard';
export type { BlogCardProps, BlogCardData, BlogCoverSize } from './BlogCard';

export { IdeaCard } from './IdeaCard';
export type {
  IdeaCardProps,
  IdeaCardData,
  IdeaStatus,
  IdeaCardSize,
} from './IdeaCard';

export { ArticleHeader } from './ArticleHeader';
export type { ArticleHeaderProps, ArticleHeaderData } from './ArticleHeader';

export { BlogHeader } from './BlogHeader';
export type { BlogHeaderProps } from './BlogHeader';

export { ProfileHero } from './ProfileHero';
export type { ProfileHeroProps, ContactItem, SocialItem } from './ProfileHero';

export { EpisodeList } from './EpisodeList';
export type { EpisodeListProps, EpisodeListItem } from './EpisodeList';

export { TableOfContents } from './TableOfContents';
export type { TableOfContentsProps, TocItem } from './TableOfContents';

export { NoiseBackground } from './NoiseBackground';
export type { NoiseBackgroundProps } from './NoiseBackground';

export { Masonry } from './Masonry';
export type { MasonryProps, MasonryBreakpoint } from './Masonry';

/* --- Brand & app-level states -------------------------------------------- */

export { Logo, LogoMark } from './Logo';
export type { LogoProps, LogoMarkProps } from './Logo';

export { BrandLoading } from './BrandLoading';
export type { BrandLoadingProps } from './BrandLoading';

export {
  ErrorState,
  ErrorBoundary,
  NotFoundError,
  NetworkError,
} from './ErrorState';
export type { ErrorStateProps } from './ErrorState';

/* --- Overlays ------------------------------------------------------------ */

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';

export { Dropdown } from './Dropdown';
export type { DropdownProps, DropdownItem } from './Dropdown';

export { ToastProvider, useToast } from './Toast';

/* --- Form controls ------------------------------------------------------- */

export { Switch, Checkbox, RadioGroup, Select } from './Controls';
export type {
  SwitchProps,
  CheckboxProps,
  RadioGroupProps,
  RadioOption,
  SelectProps,
  SelectOption,
} from './Controls';

/* --- Data display -------------------------------------------------------- */

export {
  Progress,
  Segmented,
  Breadcrumb,
  Accordion,
  Table,
} from './DataDisplay';
export type {
  ProgressProps,
  SegmentedProps,
  SegmentedOption,
  BreadcrumbItem,
  AccordionProps,
  AccordionItem,
  TableColumn,
  TableProps,
} from './DataDisplay';
