// Runs the agent pipeline once and saves the formatted HTML output for review.
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('[CAPTURE] Starting capture_agent_output script');
  try {
    const OverlayService = require('../services/overlayService');
    console.log('[CAPTURE] OverlayService required');
    const overlay = new OverlayService();

    // Initialize background services (non-blocking semantics retained)
    await overlay.initializeBackgroundServices();
    console.log('[CAPTURE] Background services initialized');

    const pipeline = overlay.agenticPipeline;

    // Generate recommendations (falls back if context analysis unavailable)
    const actions = await pipeline.generateSmartRecommendations().catch(() => pipeline.getFallbackActions());
    console.log('[CAPTURE] Actions available:', actions.map(a => a.id));
    const targetId = actions[0]?.id || 'nonexistent_action_id';
    console.log('[CAPTURE] Target action id:', targetId);

    const result = await pipeline.executeAgenticAction(targetId);
    console.log('[CAPTURE] Execution result type:', result?.type);

    const outputDir = path.join(__dirname, '..', 'temp', 'outputs');
    const outputPath = path.join(outputDir, `agent_output_${Date.now()}.html`);

    const html = (result && result.type === 'success') ? result.content : `<pre>${(result && result.content) || 'No content'}</pre>`;

    const htmlDoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Agent Output</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 24px; line-height: 1.5; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
    a { color: #0b67ff; }
    ul { padding-left: 20px; }
    code, pre { background: #f6f8fa; border-radius: 6px; padding: 8px; display: block; }
    h1, h2, h3 { margin-top: 1.2em; }
  </style>
</head>
<body>
${html}
</body>
</html>`;

    fs.writeFileSync(outputPath, htmlDoc, 'utf8');
    console.log('OUTPUT_PATH', outputPath);
  } catch (err) {
    console.error('[CAPTURE] ERROR:', err && err.stack || err);
  }
})();
