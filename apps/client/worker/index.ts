/**
 * bcms.ro Worker. wrangler.toml runs it first only for /assets/* (everything
 * else is served straight from the static assets). See utils/assetFallback.ts.
 */
import { handleAssetRequest } from '../utils/assetFallback';

type Env = { ASSETS: { fetch(request: Request): Promise<Response> } };

export default {
  fetch(request: Request, env: Env) {
    return handleAssetRequest(request, env.ASSETS);
  },
};
