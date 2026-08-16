// Shared UI kit (12-design-system.md §7)
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./Card";
export { Badge, type BadgeProps, type BadgeTone } from "./Badge";
export { Input } from "./Input";
export { Textarea } from "./Textarea";
export { Select, type SelectOption, type SelectProps } from "./Select";
export { Modal, type ModalProps, type ModalSize } from "./Modal";
export { Drawer, type DrawerProps } from "./Drawer";
export { Field, Label, type FieldProps } from "./Field";
export { Spinner } from "./Spinner";
export { Progress, type ProgressProps } from "./Progress";
export { Tabs, TabPanel, type TabItem, type TabsProps } from "./Tabs";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { ConfirmProvider, useConfirm, type ConfirmOptions, type ConfirmFn } from "./ConfirmProvider";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { BackLink, type BackLinkProps } from "./BackLink";
export { Notice, type NoticeProps, type NoticeTone } from "./Notice";
export {
  ErrorState,
  classifyError,
  errorDetail,
  type ErrorStateProps,
  type ErrorKind,
} from "./ErrorState";
export { Skeleton, SkeletonRow, SkeletonCard, SkeletonChart } from "./Skeleton";

// BandReady-specific components (12-design-system.md §8)
export { BandScore, type BandScoreProps } from "./BandScore";
export { CircularTimer, type CircularTimerProps } from "./CircularTimer";
export { AudioWaveform, type AudioWaveformProps } from "./AudioWaveform";
export {
  TranscriptBubble,
  type TranscriptBubbleProps,
  type TranscriptError,
  type TranscriptErrorKind,
} from "./TranscriptBubble";
export {
  AnnotatedText,
  buildSegments,
  type AnnotatedTextProps,
  type Annotation,
  type AnnotationSeverity,
  type TextSegment,
} from "./AnnotatedText";
export {
  QuestionPalette,
  type QuestionPaletteProps,
  type QuestionStatus,
} from "./QuestionPalette";
export { Heatmap, type HeatmapProps, type HeatmapDay } from "./Heatmap";
