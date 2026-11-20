export interface ParseToBlocksResult {
  workspaceJson: Record<string, unknown>;
  warnings: string[];
  stats: {
    totalBlocks: number;
    rawFallbackCount: number;
  };
}
