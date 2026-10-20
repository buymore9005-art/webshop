import { webhookHandler } from '../_shared/shipmentSync.ts';
Deno.serve(webhookHandler);