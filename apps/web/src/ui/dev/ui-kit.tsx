'use client';

import { toast } from 'sonner';
import { Button } from '@/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/dropdown-menu';
import { Input } from '@/ui/components/input';
import { ScrollArea } from '@/ui/components/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/select';
import { Separator } from '@/ui/components/separator';
import { Slider } from '@/ui/components/slider';
import { Switch } from '@/ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/components/tooltip';
import { translate } from '@/ui/i18n';
import { ThemeToggle } from '@/ui/theme-toggle';

const SWATCHES: ReadonlyArray<{ name: string; className: string }> = [
  { name: 'canvas', className: 'bg-canvas' },
  { name: 'surface', className: 'bg-surface' },
  { name: 'elevated', className: 'bg-elevated' },
  { name: 'hover', className: 'bg-hover' },
  { name: 'ember (accent)', className: 'bg-ember' },
  { name: 'success', className: 'bg-success' },
  { name: 'warning', className: 'bg-warning' },
  { name: 'danger', className: 'bg-danger' },
  { name: 'info', className: 'bg-info' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold text-base">{title}</h2>
      {children}
    </section>
  );
}

/** Internal component gallery (dev only, see next.config.ts pageExtensions). */
export function UiKit() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl tracking-tight">{translate('en', 'devui.title')}</h1>
        <ThemeToggle />
      </header>

      <Section title="Colors">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SWATCHES.map((s) => (
            <li key={s.name} className="flex flex-col gap-1">
              <span className={`h-10 rounded-md border ${s.className}`} />
              <span className="text-fg-muted text-xs">{s.name}</span>
            </li>
          ))}
        </ul>
        <p className="text-fg">Primary text</p>
        <p className="text-fg-muted">Secondary text</p>
        <p className="text-fg-subtle">Tertiary text (placeholders, metadata)</p>
      </Section>

      <Section title="Typography">
        <p className="font-semibold text-3xl tracking-tight">Display 32 / 40</p>
        <p className="font-semibold text-2xl tracking-tight">Page title 24 / 32</p>
        <p className="text-sm">Dialog text 14 / 20</p>
        <p className="text-ui">Panel text 13 / 18</p>
        <p className="font-medium font-mono text-xs tabular-nums">
          X 1.250 · Z 3.400 · R 90° (mono, tabular)
        </p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" disabled>
            Disabled outline
          </Button>
        </div>
        <p className="text-fg-muted text-xs">
          Hover, active and focus-visible states appear on interaction (Tab to see the focus ring).
        </p>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input aria-label="Default input" placeholder="Default" />
          <Input aria-label="Disabled input" placeholder="Disabled" disabled />
          <Input aria-label="Invalid input" placeholder="Invalid" aria-invalid defaultValue="999" />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch id="kit-snap" defaultChecked />
            <label htmlFor="kit-snap">Snap to grid</label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="kit-disabled" disabled />
            <label htmlFor="kit-disabled" className="text-fg-muted">
              Disabled
            </label>
          </div>
          <div className="w-48">
            <Slider aria-label="Intensity" defaultValue={[60]} max={100} step={1} />
          </div>
          <Select defaultValue="10">
            <SelectTrigger aria-label="Snap size" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 cm</SelectItem>
              <SelectItem value="10">10 cm</SelectItem>
              <SelectItem value="25">25 cm</SelectItem>
              <SelectItem value="50">50 cm</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Navigation and overlays">
        <Tabs defaultValue="props">
          <TabsList>
            <TabsTrigger value="props">Properties</TabsTrigger>
            <TabsTrigger value="scene">Scene</TabsTrigger>
          </TabsList>
          <TabsContent value="props" className="text-fg-muted">
            Selected object properties.
          </TabsContent>
          <TabsContent value="scene" className="text-fg-muted">
            Scene outliner.
          </TabsContent>
        </Tabs>
        <Separator />
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover or focus me</Button>
            </TooltipTrigger>
            <TooltipContent>Undo: move desk</TooltipContent>
          </Tooltip>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete project?</DialogTitle>
                <DialogDescription>
                  You can undo this for 8 seconds after deleting.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="destructive">Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Export as</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>PNG image</DropdownMenuItem>
              <DropdownMenuItem>Project file (.json)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            onClick={() => toast.success(translate('en', 'devui.toast.message'))}
          >
            {translate('en', 'devui.toast.show')}
          </Button>
        </div>
      </Section>

      <Section title="Scroll area">
        <ScrollArea className="h-24 rounded-md border">
          <ul className="flex flex-col gap-1 p-2">
            {Array.from({ length: 12 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static demo list
              <li key={i} className="text-fg-muted">
                Catalog item {i + 1}
              </li>
            ))}
          </ul>
        </ScrollArea>
      </Section>
    </main>
  );
}
