import { schedulerHandler } from '../_shared/shipmentSync.ts';
Deno.serve(schedulerHandler);