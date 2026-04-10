import '../../server/src/bootstrap/load-env.ts';
import { startBllLocalSync } from '../../server/src/lib/bll-sync-local.ts';

void (async () => {
  const result = await startBllLocalSync({ dryRun: false, limit: 5000, pageLimit: 100 });
  console.log(JSON.stringify(result, null, 2));
})();
