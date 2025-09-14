// Minimal harness to simulate execute-agentic-action IPC from renderer and ensure pipeline reaches Dedalus.
// This runs in Electron's main context using Node to directly invoke the services.

const path = require('path');
const fs = require('fs');

(async () => {
  const OverlayService = require('../services/overlayService');
  const overlay = new OverlayService();
  
  // Initialize minimal background bits from overlay service (no BrowserWindow here)
  await overlay.initializeBackgroundServices();

  // Prepare agentic pipeline direct access
  const pipeline = overlay.agenticPipeline;

  // Step 1: Generate recommendations (or fallback)
  const actions = await pipeline.generateSmartRecommendations().catch(() => pipeline.getFallbackActions());
  console.log('SIM actions generated:', actions.map(a => a.id));

  // Pick a target id: exact match if exists else any string to trigger closest-match
  const targetId = actions[0]?.id || 'nonexistent_action_id';
  
  // Step 2: Execute via pipeline directly (equivalent to main handler)
  const result = await pipeline.executeAgenticAction(targetId);
  console.log('SIM execution result type:', result.type);
  console.log('SIM execution content snippet:', (result.content || '').slice(0, 120));
})();
