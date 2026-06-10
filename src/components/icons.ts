import {
  MessageSquare, LayoutGrid, FileText, Folder, Upload, Settings,
  Send, Plus, Play, Check, X, ChevronDown, ChevronRight, Download,
  Eye, Pencil, RefreshCw, Copy, Sparkles, Search, Filter, Square, Lock,
  type LucideIcon,
} from "lucide-react";

// Semantic handoff name → lucide component. Consumers reference by name so the
// icon set is swappable in one place.
export const icons = {
  chat: MessageSquare,
  grid: LayoutGrid,
  doc: FileText,
  folder: Folder,
  upload: Upload,
  settings: Settings,
  send: Send,
  plus: Plus,
  play: Play,
  check: Check,
  x: X,
  chevDown: ChevronDown,
  chevRight: ChevronRight,
  download: Download,
  eye: Eye,
  edit: Pencil,
  refresh: RefreshCw,
  copy: Copy,
  sparkle: Sparkles,
  search: Search,
  filter: Filter,
  stop: Square,
  lock: Lock,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;
