import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import * as Blockly from 'blockly';
import { registerAllBlocks } from '../blocks';
import { algoDarkTheme, TOOLBOX_CONFIG } from '../core/theme';
import { attachSymbolSync, registerDynamicFlyouts } from '../core/dynamicFlyout';
import { ALGO_TEMPLATES } from '../core/templates';
import {
  getLanguageTarget,
  type GeneratedCodeResult,
  type GenerateOptions,
} from '../generators';
import type { TargetLanguage } from '../api/runnerApi';

export interface BlocklyCanvasHandle {
  loadWorkspaceJson: (json: Record<string, unknown>) => void;
  exportWorkspaceJson: () => Record<string, unknown>;
  spawnBlock: (blockType: string) => void;
  resize: () => void;
}

interface BlocklyCanvasProps {
  language: TargetLanguage;
  generateOptions: GenerateOptions;
  onCodeGenerated: (result: GeneratedCodeResult) => void;
  onSelectBlock: (blockId: string | null) => void;
}

/**
 * Safely resizes the Blockly SVG and keeps any open toolbox flyout + its
 * scrollbar synchronized during browser page zoom or split-pane resize.
 */
function safeResizeWorkspace(ws: Blockly.WorkspaceSvg): void {
  const toolbox = ws.getToolbox();
  const flyout = ws.getFlyout();
  const wasFlyoutVisible = Boolean(flyout?.isVisible());
  const selectedItem =
    toolbox instanceof Blockly.Toolbox ? toolbox.getSelectedItem() : null;

  Blockly.svgResize(ws);

  if (wasFlyoutVisible && flyout) {
    if (toolbox instanceof Blockly.Toolbox && selectedItem) {
      // Re-refreshing selection forces Blockly to recompute flyout bounds,
      // SVG clip/transform, and scrollbar geometry cleanly after browser zoom.
      toolbox.refreshSelection();
    }
    flyout.reflow();
    flyout.position();
  }
}

export const BlocklyCanvas = forwardRef<BlocklyCanvasHandle, BlocklyCanvasProps>(
  ({ language, generateOptions, onCodeGenerated, onSelectBlock }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
    const languageRef = useRef<TargetLanguage>(language);
    const optionsRef = useRef<GenerateOptions>(generateOptions);
    const onCodeRef = useRef(onCodeGenerated);
    const onSelectRef = useRef(onSelectBlock);

    languageRef.current = language;
    optionsRef.current = generateOptions;
    onCodeRef.current = onCodeGenerated;
    onSelectRef.current = onSelectBlock;

    const triggerGenerate = () => {
      const ws = workspaceRef.current;
      if (!ws) return;
      try {
        const result = getLanguageTarget(languageRef.current).generate(
          ws,
          optionsRef.current
        );
        onCodeRef.current(result);
      } catch (err) {
        console.error('Code generation error:', err);
      }
    };

    useEffect(() => {
      if (!containerRef.current) return;

      registerAllBlocks();

      const ws = Blockly.inject(containerRef.current, {
        renderer: 'zelos',
        theme: algoDarkTheme,
        media: `${import.meta.env.BASE_URL}blockly-media/`,
        toolbox: TOOLBOX_CONFIG as Blockly.utils.toolbox.ToolboxDefinition,
        grid: {
          spacing: 24,
          length: 2,
          colour: '#1e293b',
          snap: true,
        },
        zoom: {
          controls: true,
          wheel: true,
          startScale: 0.92,
          maxScale: 2.0,
          minScale: 0.4,
          scaleSpeed: 1.12,
        },
        trashcan: true,
        move: {
          scrollbars: true,
          drag: true,
          wheel: false,
        },
      });

      workspaceRef.current = ws;

      // Keep the toolbox flyout open during workspace zoom (buttons or wheel):
      // Blockly's setScale() calls hideChaff(false), which auto-hides the flyout.
      // Forwarding onlyClosePopups=true while scaling keeps the flyout open and reflowed.
      const originalSetScale = ws.setScale.bind(ws);
      const originalHideChaff = ws.hideChaff.bind(ws);
      let isScaling = false;
      ws.hideChaff = (onlyClosePopups?: boolean) => {
        originalHideChaff(isScaling ? true : onlyClosePopups);
      };
      ws.setScale = (newScale: number) => {
        isScaling = true;
        try {
          originalSetScale(newScale);
        } finally {
          isScaling = false;
        }
        const flyout = ws.getFlyout(false);
        if (flyout?.isVisible()) {
          flyout.reflow();
          flyout.position();
        }
      };

      registerDynamicFlyouts(ws);
      const detachSymbolSync = attachSymbolSync(ws);

      // Load initial built-in template
      if (ALGO_TEMPLATES.length > 0) {
        try {
          Blockly.serialization.workspaces.load(ALGO_TEMPLATES[0].workspaceJson, ws);
          ws.scrollCenter();
        } catch (err) {
          console.error('Failed to load initial template:', err);
        }
      }

      // Debounced code generation + block selection listener
      let debounceTimer: number | null = null;
      const scheduleGenerate = () => {
        if (debounceTimer !== null) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          triggerGenerate();
        }, 70);
      };

      const onWorkspaceEvent = (event: Blockly.Events.Abstract) => {
        if (event.type === Blockly.Events.SELECTED) {
          const selEvent = event as Blockly.Events.Selected;
          onSelectRef.current(selEvent.newElementId ?? null);
          return;
        }
        if (
          event.type === Blockly.Events.BLOCK_CREATE ||
          event.type === Blockly.Events.BLOCK_DELETE ||
          event.type === Blockly.Events.BLOCK_CHANGE ||
          event.type === Blockly.Events.BLOCK_MOVE ||
          event.type === Blockly.Events.FINISHED_LOADING
        ) {
          scheduleGenerate();
        }
      };

      ws.addChangeListener(onWorkspaceEvent);
      triggerGenerate();

      // Unified rAF resize handler for container resize, window resize, and browser zoom
      let rafId: number | null = null;
      const scheduleResize = () => {
        if (rafId !== null) window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          if (workspaceRef.current) {
            safeResizeWorkspace(workspaceRef.current);
          }
        });
      };

      const resizeObserver = new ResizeObserver(scheduleResize);
      resizeObserver.observe(containerRef.current);
      window.addEventListener('resize', scheduleResize);
      window.visualViewport?.addEventListener('resize', scheduleResize);

      return () => {
        if (debounceTimer !== null) window.clearTimeout(debounceTimer);
        if (rafId !== null) window.cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        window.removeEventListener('resize', scheduleResize);
        window.visualViewport?.removeEventListener('resize', scheduleResize);
        ws.removeChangeListener(onWorkspaceEvent);
        detachSymbolSync();
        ws.dispose();
        workspaceRef.current = null;
      };
    }, []);

    // Regenerate immediately when language, C++ standard, or header option toggles
    useEffect(() => {
      triggerGenerate();
    }, [language, generateOptions.useBitsHeader, generateOptions.cppStd]);

    useImperativeHandle(ref, () => ({
      loadWorkspaceJson(json: Record<string, unknown>) {
        const ws = workspaceRef.current;
        if (!ws) return;
        ws.clear();
        Blockly.serialization.workspaces.load(json, ws);
        ws.scrollCenter();
        onSelectRef.current(null);
        triggerGenerate();
      },
      exportWorkspaceJson() {
        const ws = workspaceRef.current;
        if (!ws) return {};
        return Blockly.serialization.workspaces.save(ws) as Record<string, unknown>;
      },
      spawnBlock(blockType: string) {
        const ws = workspaceRef.current;
        if (!ws) return;
        const block = ws.newBlock(blockType);
        block.initSvg();
        block.render();
        const metrics = ws.getMetrics();
        const x = (metrics.viewLeft + metrics.viewWidth * 0.35) / ws.scale;
        const y = (metrics.viewTop + metrics.viewHeight * 0.3) / ws.scale;
        block.moveBy(x, y);
        block.select();
        triggerGenerate();
      },
      resize() {
        const ws = workspaceRef.current;
        if (ws) safeResizeWorkspace(ws);
      },
    }));

    return (
      <div className="relative w-full h-full bg-[#0d1117] overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    );
  }
);

BlocklyCanvas.displayName = 'BlocklyCanvas';
